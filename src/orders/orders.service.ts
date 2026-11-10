import {
  BadRequestException,
  ConflictException,
  HttpException,
  HttpStatus,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { MenuItem, Order, OrderStatus, Prisma, Store } from '@prisma/client';
import { DriverPrincipal } from '../auth/auth.types';
import { ChannelsService } from '../channels/channels.service';
import { DomainEvent, DomainEventName, OrderDomainEvent } from '../common/domain-events';
import { PaymentDeclinedError } from '../payments/payment-provider';
import { PaymentsService } from '../payments/payments.service';
import { PrismaService } from '../prisma/prisma.service';
import { ACCEPT_OVERDUE_SEC, computeTiming, PickupTiming } from '../timing/pickup-timing';
import { TelemetryStore } from '../timing/telemetry.store';
import { ACTIVE_STATUSES, CANCEL_NEEDS_APPROVAL, sourcesOf } from './order-state';
import { OrderView, OrderWithRelations, toOrderView } from './order-view';
import { OrderRequestDto, RejectReason, ReserveOrderDto, StoreCancelReason } from './orders.dto';
import { describeItems, won } from './tts';

/** 취소 사유 코드 (cancelReason) */
export type CancelReason = 'USER' | StoreCancelReason | 'PAYMENT_DECLINED' | 'STORE_UNAVAILABLE' | 'DEV_RESET';

const CANCEL_TTS: Record<CancelReason, string> = {
  USER: '주문이 취소됐어요.',
  NO_SHOW: '매장에서 미수령으로 주문을 종료했어요.',
  STORE: '매장 사정으로 주문이 취소됐어요.',
  PAYMENT_DECLINED: '결제 승인이 되지 않아 주문을 취소했어요.',
  STORE_UNAVAILABLE: '매장에 주문을 전달하지 못해 취소했어요.',
  DEV_RESET: '주문이 취소됐어요.',
};

const REJECT_TEXT: Record<RejectReason, string> = {
  SOLD_OUT: '품절',
  BUSY: '주문이 많음',
  CLOSED: '영업 종료',
  OTHER: '매장 사정',
};

const ORDER_INCLUDE = { items: true, store: true } satisfies Prisma.OrderInclude;

interface ResolvedLine {
  menuItem: MenuItem;
  qty: number;
}

@Injectable()
export class OrdersService {
  private readonly logger = new Logger(OrdersService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly channels: ChannelsService,
    private readonly payments: PaymentsService,
    private readonly telemetry: TelemetryStore,
    private readonly events: EventEmitter2,
  ) {}

  // ── 차량 앱 ────────────────────────────────────────────

  /** 금액·준비 시간·품절 여부. 저장하지 않는다. 예약 전 '이 메뉴로 예약' 화면에 보여 준다 */
  async quote(driver: DriverPrincipal, dto: OrderRequestDto) {
    const store = await this.findOpenStore(dto.storeId);
    const lines = await this.resolveLines(driver.userId, store, dto);
    return this.quoteOf(store, lines);
  }

  /**
   * 예약 확정. 바로 매장에 공유하고(매장 확인 중), 목업 결제 승인을 건다.
   * 품절이거나 견적 때와 금액이 다르면 409와 새 조건을 돌려준다.
   */
  async reserve(driver: DriverPrincipal, dto: ReserveOrderDto, idempotencyKey?: string) {
    const scopedKey = idempotencyKey ? `${driver.userId}:${idempotencyKey}` : undefined;
    if (scopedKey) {
      const existing = await this.prisma.order.findUnique({ where: { idempotencyKey: scopedKey }, include: ORDER_INCLUDE });
      if (existing) return { order: await this.view(existing), tts: undefined };
    }

    const active = await this.prisma.order.findFirst({
      where: { vehicleId: driver.vehicleId, status: { in: ACTIVE_STATUSES } },
    });
    if (active) throw new ConflictException({ code: 'ACTIVE_ORDER_EXISTS', message: '진행 중인 주문이 있습니다', orderId: active.id });

    const store = await this.findOpenStore(dto.storeId);
    const lines = await this.resolveLines(driver.userId, store, dto);
    const quote = this.quoteOf(store, lines);
    if (!quote.available) {
      throw new ConflictException({ code: 'SOLD_OUT', message: '품절된 메뉴가 있습니다', quote });
    }
    if (dto.expectedTotal !== undefined && dto.expectedTotal !== quote.totalAmount) {
      throw new ConflictException({ code: 'PRICE_CHANGED', message: '가격이 바뀌었습니다. 새 금액을 확인해 주세요', quote });
    }

    const vehicle = await this.prisma.vehicle.findUniqueOrThrow({ where: { id: driver.vehicleId } });
    const created = await this.prisma.order.create({
      data: {
        userId: driver.userId,
        vehicleId: driver.vehicleId,
        storeId: store.id,
        orderNo: await this.nextOrderNo(store.id),
        status: 'PENDING_ACCEPT',
        source: dto.source ?? 'SCREEN',
        favoriteId: dto.favoriteId,
        totalAmount: quote.totalAmount,
        plateNumber: vehicle.plateNumber,
        estPrepSec: store.prepSec,
        idempotencyKey: scopedKey,
        sentAt: new Date(),
        items: {
          create: lines.map((l) => ({
            menuItemId: l.menuItem.id,
            name: l.menuItem.name,
            unitPrice: l.menuItem.price,
            qty: l.qty,
          })),
        },
        events: { create: { type: 'created', payload: { status: 'PENDING_ACCEPT' } } },
      },
      include: ORDER_INCLUDE,
    });

    // 목업 결제: 예약 확정 때 승인, 수령 때 확정, 취소·거절 때 승인 취소
    try {
      await this.payments.authorize(created.id, created.totalAmount);
    } catch (e) {
      if (!(e instanceof PaymentDeclinedError)) throw e;
      await this.cancel(created.id, 'PAYMENT_DECLINED', e.message);
      throw new HttpException({ code: 'PAYMENT_DECLINED', message: '결제 승인이 되지 않았습니다' }, HttpStatus.PAYMENT_REQUIRED);
    }

    try {
      const channel = await this.channels.forStore(created.store);
      const { externalOrderId } = await channel.sendOrder(created);
      await this.prisma.order.update({ where: { id: created.id }, data: { externalOrderId } });
    } catch (e) {
      this.logger.error(`매장 공유 실패 ${created.id}: ${e instanceof Error ? e.message : e}`);
      await this.cancel(created.id, 'STORE_UNAVAILABLE');
      throw new HttpException({ code: 'STORE_UNAVAILABLE', message: '매장에 주문을 전달하지 못했습니다' }, HttpStatus.SERVICE_UNAVAILABLE);
    }

    const order = await this.findWithRelations(created.id);
    const tts = `${describeItems(this.ttsLines(lines))}, ${won(order.totalAmount)} 주문을 ${store.name}에 보냈어요. 매장 확인을 기다리고 있어요.`;
    const view = await this.view(order);
    this.emit(DomainEvent.OrderStatusChanged, order, { status: order.status, order: view }, tts);
    return { order: view, tts };
  }

  /**
   * 운전자 취소. 직원이 수락하기 전에는 바로 취소하고,
   * 수락한 뒤에는 취소 확인 중으로 바꿔 매장 판단을 기다린다(승인 전에는 취소 완료로 표시하지 않음).
   */
  async cancelByDriver(driver: DriverPrincipal, orderId: string, note?: string) {
    const order = await this.findOwnOrder(driver, orderId);
    if (order.status === 'PENDING_ACCEPT') {
      return this.view(await this.cancel(orderId, 'USER', note));
    }
    if (!CANCEL_NEEDS_APPROVAL.includes(order.status)) {
      throw new ConflictException(`${order.status} 상태에서는 취소를 요청할 수 없습니다`);
    }
    const updated = await this.transition(
      orderId,
      'CANCEL_REQUESTED',
      { cancelRequestedAt: new Date(), cancelRequestNote: note ?? null, statusBeforeCancel: order.status },
      { type: 'cancel_requested', payload: { note: note ?? null, statusBefore: order.status } },
      '취소를 요청했어요. 매장에서 확인하면 알려 드릴게요.',
    );
    return this.view(updated);
  }

  async get(driver: DriverPrincipal, orderId: string) {
    return this.view(await this.findOwnOrder(driver, orderId));
  }

  async list(driver: DriverPrincipal, activeOnly: boolean) {
    const orders = await this.prisma.order.findMany({
      where: { vehicleId: driver.vehicleId, ...(activeOnly ? { status: { in: ACTIVE_STATUSES } } : {}) },
      include: ORDER_INCLUDE,
      orderBy: { createdAt: 'desc' },
      take: 20,
    });
    return Promise.all(orders.map((o) => this.view(o)));
  }

  // ── 매장 ─────────────────────────────────────────────

  async accept(storeId: string, orderId: string) {
    const order = await this.findStoreOrder(storeId, orderId);
    return this.transition(
      orderId,
      'ACCEPTED',
      { acceptedAt: new Date() },
      { type: 'accepted' },
      `매장이 주문을 수락했어요. 주문번호 ${order.orderNo}.`,
      'PENDING_ACCEPT',
    );
  }

  async reject(storeId: string, orderId: string, reason: RejectReason, note?: string) {
    await this.findStoreOrder(storeId, orderId);
    const rejected = await this.transition(
      orderId,
      'REJECTED',
      { rejectedAt: new Date(), rejectReason: reason, cancelNote: note ?? null },
      { type: 'rejected', payload: { reason, note: note ?? null } },
      `매장에서 주문을 받을 수 없다고 했어요. 사유: ${REJECT_TEXT[reason]}.`,
    );
    await this.payments.voidIfAuthorized(orderId);
    return rejected;
  }

  /** 직원이 제조를 시작한다. 이때의 예상 수령 시각을 고정해 이후 지연의 기준으로 쓴다 */
  async startPreparing(storeId: string, orderId: string) {
    const order = await this.findStoreOrder(storeId, orderId);
    const timing = await this.timingOf(order);
    return this.transition(
      orderId,
      'PREPARING',
      { preparingAt: new Date(), plannedPickupAt: timing.expectedPickupAt },
      { type: 'preparing', payload: { plannedPickupAt: timing.expectedPickupAt?.toISOString() ?? null } },
      '매장에서 제조를 시작했어요.',
      'ACCEPTED',
    );
  }

  async markReady(storeId: string, orderId: string) {
    await this.findStoreOrder(storeId, orderId);
    return this.transition(orderId, 'READY', { readyAt: new Date() }, { type: 'ready' }, '주문하신 메뉴가 준비됐어요.', 'PREPARING');
  }

  /** 직원이 창구에서 확인하고 수령 처리한다. 결제를 확정한다 */
  async pickup(storeId: string, orderId: string) {
    const order = await this.findStoreOrder(storeId, orderId);
    if (order.status !== 'READY') throw new ConflictException('준비 완료된 주문만 수령 처리할 수 있습니다');
    await this.payments.capture(orderId);
    const pickedUpAt = new Date();
    await this.closeDtVisit(orderId, pickedUpAt);
    return this.transition(orderId, 'PICKED_UP', { pickedUpAt }, { type: 'picked_up' }, '맛있게 드세요.', 'READY');
  }

  /** 차량번호는 직원 검색 보조. 준비 완료된 주문을 찾아 수령 처리한다 */
  async pickupByPlate(storeId: string, plateNumber: string) {
    const order = await this.prisma.order.findFirst({
      where: { storeId, plateNumber, status: 'READY' },
      orderBy: { createdAt: 'asc' },
    });
    if (!order) throw new NotFoundException('이 차량번호로 준비 완료된 주문이 없습니다');
    return this.pickup(storeId, order.id);
  }

  async approveCancel(storeId: string, orderId: string, note?: string) {
    const order = await this.findStoreOrder(storeId, orderId);
    if (order.status !== 'CANCEL_REQUESTED') throw new ConflictException('취소 확인 중인 주문이 아닙니다');
    return this.cancel(orderId, 'USER', note);
  }

  /** 취소 요청 거절. 요청 전 상태로 되돌린다 (시작한 제조는 그대로) */
  async rejectCancel(storeId: string, orderId: string, note?: string) {
    const order = await this.findStoreOrder(storeId, orderId);
    if (order.status !== 'CANCEL_REQUESTED' || !order.statusBeforeCancel) {
      throw new ConflictException('취소 확인 중인 주문이 아닙니다');
    }
    return this.transition(
      orderId,
      order.statusBeforeCancel,
      { statusBeforeCancel: null, cancelRequestedAt: null, cancelRequestNote: null },
      { type: 'cancel_rejected', payload: { note: note ?? null } },
      '매장에서 취소를 받을 수 없다고 했어요. 주문은 그대로 진행돼요.',
      'CANCEL_REQUESTED',
    );
  }

  /** 매장이 주문을 종료한다 (미수령 등). 자동으로는 하지 않고 직원이 판단한다 */
  async cancelByStore(storeId: string, orderId: string, reason: StoreCancelReason, note?: string) {
    await this.findStoreOrder(storeId, orderId);
    return this.cancel(orderId, reason, note);
  }

  // ── 공통 ─────────────────────────────────────────────

  async cancel(orderId: string, reason: CancelReason, note?: string): Promise<OrderWithRelations> {
    const before = await this.findWithRelations(orderId);
    const cancelled = await this.transition(
      orderId,
      'CANCELLED',
      { cancelledAt: new Date(), cancelReason: reason, cancelNote: note ?? null },
      { type: 'cancelled', payload: { reason, note: note ?? null } },
      CANCEL_TTS[reason],
    );
    if (before.externalOrderId) {
      const channel = await this.channels.forStore(before.store);
      await channel.cancelOrder(before, reason).catch((e) => this.logger.warn(`매장 취소 실패 ${orderId}: ${e}`));
    }
    await this.payments.voidIfAuthorized(orderId);
    return cancelled;
  }

  /**
   * 상태 전이. 현재 상태가 to로 갈 수 있을 때만 바꾸고(동시 요청은 한쪽만 성공), 이벤트를 남기고 알린다.
   * from을 주면 그 상태에서만 바꾼다. 매장의 진행 동작은 from을 꼭 준다:
   * 취소 확인 중에서 요청 전 상태로 돌아가는 전이가 열려 있어, from 없이는 확인 중인 주문도 진행되기 때문이다.
   */
  async transition(
    orderId: string,
    to: OrderStatus,
    data: Prisma.OrderUpdateManyMutationInput,
    event: { type: string; payload?: Prisma.InputJsonObject },
    tts?: string,
    from?: OrderStatus,
  ): Promise<OrderWithRelations> {
    const { count } = await this.prisma.order.updateMany({
      where: { id: orderId, status: from ? from : { in: sourcesOf(to) } },
      data: { ...data, status: to },
    });
    if (count === 0) {
      const current = await this.prisma.order.findUnique({ where: { id: orderId } });
      if (!current) throw new NotFoundException('주문을 찾을 수 없습니다');
      throw new ConflictException(`${current.status} 상태에서 ${to}(으)로 바꿀 수 없습니다`);
    }

    await this.prisma.orderEvent.create({ data: { orderId, type: event.type, payload: event.payload ?? {} } });
    const order = await this.findWithRelations(orderId);
    this.emit(DomainEvent.OrderStatusChanged, order, { status: to, order: await this.view(order) }, tts);
    return order;
  }

  /** 주문 + 예상 수령·시작 추천 + 매장 응답 지연 여부 */
  async view(order: OrderWithRelations, now = Date.now()): Promise<OrderView> {
    const timing = await this.timingOf(order, now);
    const acceptOverdue =
      order.status === 'PENDING_ACCEPT' &&
      !!order.sentAt &&
      now - order.sentAt.getTime() > ACCEPT_OVERDUE_SEC * 1000;
    return toOrderView(order, timing, acceptOverdue);
  }

  async timingOf(order: Order & { store: Store }, now = Date.now()): Promise<PickupTiming> {
    return computeTiming({
      eta: await this.telemetry.latest(order.id),
      laneEnteredAt: order.laneEnteredAt,
      plannedPickupAt: order.plannedPickupAt,
      prepSec: order.store.prepSec,
      afterEntrySec: order.store.afterEntrySec,
      now,
    });
  }

  findWithRelations(orderId: string) {
    return this.prisma.order.findUniqueOrThrow({ where: { id: orderId }, include: ORDER_INCLUDE });
  }

  emit(name: DomainEventName, order: Order, data: Record<string, unknown>, tts?: string) {
    const payload: OrderDomainEvent = { orderId: order.id, storeId: order.storeId, vehicleId: order.vehicleId, tts, data };
    this.events.emit(name, payload);
  }

  recordEvent(orderId: string, type: string, payload: Prisma.InputJsonObject = {}) {
    return this.prisma.orderEvent.create({ data: { orderId, type, payload } });
  }

  /** 시연용: 오늘 이 매장의 다음 주문번호를 정한다 (예: 21 → P-021) */
  async setNextOrderNo(storeId: string, next: number) {
    const day = kstDay();
    await this.prisma.orderNumberCounter.upsert({
      where: { storeId_day: { storeId, day } },
      update: { last: next - 1 },
      create: { storeId, day, last: next - 1 },
    });
  }

  // ── 내부 ─────────────────────────────────────────────

  /** 매장별·날짜별(KST) 순번. P-001부터 */
  private async nextOrderNo(storeId: string) {
    const day = kstDay();
    const counter = await this.prisma.orderNumberCounter.upsert({
      where: { storeId_day: { storeId, day } },
      update: { last: { increment: 1 } },
      create: { storeId, day, last: 1 },
    });
    return `P-${String(counter.last).padStart(3, '0')}`;
  }

  private quoteOf(store: Store, lines: ResolvedLine[]) {
    const soldOut = new Set(store.soldOutMenuItemIds);
    const items = lines.map((l) => ({
      menuItemId: l.menuItem.id,
      name: l.menuItem.name,
      unitPrice: l.menuItem.price,
      qty: l.qty,
      soldOut: soldOut.has(l.menuItem.id),
    }));
    const totalAmount = lines.reduce((sum, l) => sum + l.menuItem.price * l.qty, 0);
    const available = items.every((i) => !i.soldOut);
    return {
      storeId: store.id,
      storeName: store.name,
      items,
      totalAmount,
      available,
      prepSec: store.prepSec,
      afterEntrySec: store.afterEntrySec,
      tts: available
        ? `${describeItems(this.ttsLines(lines))}, ${won(totalAmount)}을 ${store.name}에 예약할까요?`
        : '품절된 메뉴가 있어요. 다른 메뉴를 골라 주세요.',
    };
  }

  private async closeDtVisit(orderId: string, pickedUpAt: Date) {
    const visit = await this.prisma.dtVisit.findUnique({ where: { orderId } });
    if (!visit || visit.pickedUpAt) return;
    await this.prisma.dtVisit.update({
      where: { orderId },
      data: { pickedUpAt, waitSec: Math.round((pickedUpAt.getTime() - visit.laneEnteredAt.getTime()) / 1000) },
    });
  }

  private async findOwnOrder(driver: DriverPrincipal, orderId: string) {
    const order = await this.prisma.order.findUnique({ where: { id: orderId }, include: ORDER_INCLUDE });
    if (!order || order.userId !== driver.userId) throw new NotFoundException('주문을 찾을 수 없습니다');
    return order;
  }

  private async findStoreOrder(storeId: string, orderId: string) {
    const order = await this.prisma.order.findUnique({ where: { id: orderId }, include: ORDER_INCLUDE });
    if (!order || order.storeId !== storeId) throw new NotFoundException('주문을 찾을 수 없습니다');
    return order;
  }

  private async findOpenStore(storeId: string) {
    const store = await this.prisma.store.findUnique({ where: { id: storeId } });
    if (!store) throw new NotFoundException('매장을 찾을 수 없습니다');
    if (!store.isOpen) throw new BadRequestException('영업 중인 매장이 아닙니다');
    return store;
  }

  private async resolveLines(userId: string, store: Store, dto: OrderRequestDto): Promise<ResolvedLine[]> {
    let requested: { menuItemId: string; qty: number }[];
    if (dto.favoriteId) {
      const favorite = await this.prisma.favorite.findUnique({ where: { id: dto.favoriteId } });
      if (!favorite || favorite.userId !== userId) throw new NotFoundException('자주 주문 메뉴를 찾을 수 없습니다');
      requested = favorite.items as { menuItemId: string; qty: number }[];
    } else {
      requested = dto.items ?? [];
    }
    if (requested.length === 0) throw new BadRequestException('주문할 메뉴가 없습니다');

    const menuItems = await this.prisma.menuItem.findMany({
      where: { id: { in: requested.map((r) => r.menuItemId) }, brandId: store.brandId },
    });
    return requested.map((r) => {
      const menuItem = menuItems.find((m) => m.id === r.menuItemId);
      if (!menuItem) throw new BadRequestException('이 매장에서 팔지 않는 메뉴가 있습니다');
      return { menuItem, qty: r.qty };
    });
  }

  private ttsLines(lines: ResolvedLine[]) {
    return lines.map((l) => ({ name: l.menuItem.name, qty: l.qty, unit: l.menuItem.unit }));
  }
}

const KST_OFFSET_MS = 9 * 60 * 60 * 1000;

/** KST 기준 YYYY-MM-DD */
export function kstDay(now = Date.now()): string {
  return new Date(now + KST_OFFSET_MS).toISOString().slice(0, 10);
}
