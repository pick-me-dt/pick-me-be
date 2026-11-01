import { BadRequestException, ConflictException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { MenuItem, Order, OrderStatus, Prisma, Store } from '@prisma/client';
import { DriverPrincipal } from '../auth/auth.types';
import { ChannelRejectedError } from '../channels/channel-adapter';
import { ChannelsService } from '../channels/channels.service';
import { DomainEvent, DomainEventName, OrderDomainEvent } from '../common/domain-events';
import { PaymentDeclinedError } from '../payments/payment-provider';
import { PaymentsService } from '../payments/payments.service';
import { PrismaService } from '../prisma/prisma.service';
import { estimatePrepSec } from '../timing/estimators';
import { ACTIVE_STATUSES, SENT_STATUSES, sourcesOf } from './order-state';
import { OrderWithRelations, toOrderView } from './order-view';
import { OrderRequestDto, ReserveOrderDto } from './orders.dto';
import { describeItems, won } from './tts';

/** 음성 주문을 바로 예약하지 않고 정차 후 확인을 받아야 하는 이유 */
export type ConfirmationReason = 'VOICE_DISABLED' | 'NOT_FAVORITE' | 'OVER_PER_ORDER_LIMIT' | 'OVER_DAILY_LIMIT';

/** 취소 사유 코드. 사용자가 직접 취소하면 USER */
export type CancelReason = 'USER' | 'EXPIRED' | 'NO_SHOW' | 'STORE_REJECTED' | 'PAYMENT_DECLINED' | 'STORE';

const CANCEL_TTS: Record<CancelReason, string> = {
  USER: '주문을 취소했어요.',
  EXPIRED: '주행 정보가 오래 끊겨 주문을 취소했어요.',
  NO_SHOW: '준비된 주문을 오래 찾아가지 않아 취소했어요.',
  STORE_REJECTED: '매장 사정으로 주문이 취소됐어요.',
  PAYMENT_DECLINED: '결제 승인이 되지 않아 주문을 취소했어요.',
  STORE: '매장에서 주문을 취소했어요.',
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
    private readonly events: EventEmitter2,
  ) {}

  // ── 차량 앱 ────────────────────────────────────────────

  /** 금액·예상 제조 시간 계산. 저장하지 않는다. */
  async quote(driver: DriverPrincipal, dto: OrderRequestDto) {
    const store = await this.findOpenStore(dto.storeId);
    const lines = await this.resolveLines(driver.userId, store, dto);
    const totalAmount = this.total(lines);
    const estPrepSec = await this.estimatePrep(store, lines);
    const items = lines.map((l) => ({ menuItemId: l.menuItem.id, name: l.menuItem.name, unitPrice: l.menuItem.price, qty: l.qty }));
    return {
      storeId: store.id,
      storeName: store.name,
      items,
      totalAmount,
      estPrepSec,
      tts: `${this.describe(lines)}, ${won(totalAmount)} 주문할까요?`,
    };
  }

  async reserve(driver: DriverPrincipal, dto: ReserveOrderDto, idempotencyKey?: string) {
    const scopedKey = idempotencyKey ? `${driver.userId}:${idempotencyKey}` : undefined;
    if (scopedKey) {
      const existing = await this.prisma.order.findUnique({ where: { idempotencyKey: scopedKey }, include: ORDER_INCLUDE });
      if (existing) return { order: toOrderView(existing), confirmationReasons: [], tts: undefined };
    }

    const active = await this.prisma.order.findFirst({
      where: { vehicleId: driver.vehicleId, status: { in: ACTIVE_STATUSES } },
    });
    if (active) throw new ConflictException({ message: '진행 중인 주문이 있습니다', orderId: active.id });

    const store = await this.findOpenStore(dto.storeId);
    const lines = await this.resolveLines(driver.userId, store, dto);
    const totalAmount = this.total(lines);
    const reasons = dto.source === 'VOICE' ? await this.voiceConfirmationReasons(driver.userId, dto, totalAmount) : [];
    const status: OrderStatus = reasons.length ? 'NEEDS_CONFIRMATION' : 'RESERVED';
    const vehicle = await this.prisma.vehicle.findUniqueOrThrow({ where: { id: driver.vehicleId } });

    const order = await this.prisma.order.create({
      data: {
        userId: driver.userId,
        vehicleId: driver.vehicleId,
        storeId: store.id,
        status,
        source: dto.source,
        favoriteId: dto.favoriteId,
        totalAmount,
        plateNumber: vehicle.plateNumber,
        estPrepSec: await this.estimatePrep(store, lines),
        idempotencyKey: scopedKey,
        items: {
          create: lines.map((l) => ({
            menuItemId: l.menuItem.id,
            name: l.menuItem.name,
            unitPrice: l.menuItem.price,
            qty: l.qty,
          })),
        },
        events: { create: { type: 'created', payload: { status, confirmationReasons: reasons } } },
      },
      include: ORDER_INCLUDE,
    });

    const summary = `${this.describe(lines)}, ${won(totalAmount)}`;
    const tts =
      status === 'RESERVED'
        ? `${summary} 주문을 예약했어요. 도착 시간에 맞춰 매장에 보낼게요.`
        : `${summary} 주문은 차를 세운 뒤 화면에서 확인해 주세요.`;
    return { order: toOrderView(order), confirmationReasons: reasons, tts };
  }

  /** 정차 중 화면 확인. 정차 여부는 차량 앱이 Vehicle SDK로 확인한 뒤 호출한다. */
  async confirm(driver: DriverPrincipal, orderId: string) {
    await this.findOwnOrder(driver, orderId);
    const order = await this.transition(orderId, 'RESERVED', {}, { type: 'confirmed' });
    return toOrderView(order);
  }

  async cancelByDriver(driver: DriverPrincipal, orderId: string, note?: string) {
    await this.findOwnOrder(driver, orderId);
    return toOrderView(await this.cancel(orderId, 'USER', note));
  }

  async get(driver: DriverPrincipal, orderId: string) {
    return toOrderView(await this.findOwnOrder(driver, orderId));
  }

  async list(driver: DriverPrincipal, activeOnly: boolean) {
    const orders = await this.prisma.order.findMany({
      where: { vehicleId: driver.vehicleId, ...(activeOnly ? { status: { in: ACTIVE_STATUSES } } : {}) },
      include: ORDER_INCLUDE,
      orderBy: { createdAt: 'desc' },
      take: 20,
    });
    return orders.map(toOrderView);
  }

  /** 전송 전 주문의 매장을 바꾼다 (DT 대기줄 회피). 같은 메뉴를 새 매장 브랜드 메뉴에서 다시 찾는다. */
  async changeStore(driver: DriverPrincipal, orderId: string, storeId: string) {
    const order = await this.findOwnOrder(driver, orderId);
    if (order.status !== 'RESERVED' && order.status !== 'NEEDS_CONFIRMATION') {
      throw new ConflictException('매장에 전송된 주문은 매장을 바꿀 수 없습니다');
    }
    const store = await this.findOpenStore(storeId);
    const lines = await this.resolveLines(driver.userId, store, {
      storeId,
      items: order.items.map((i) => ({ menuItemId: i.menuItemId, qty: i.qty })),
    });

    const { count } = await this.prisma.order.updateMany({
      where: { id: orderId, status: { in: ['RESERVED', 'NEEDS_CONFIRMATION'] } },
      data: { storeId: store.id, estPrepSec: await this.estimatePrep(store, lines), totalAmount: this.total(lines) },
    });
    if (count === 0) throw new ConflictException('매장에 전송된 주문은 매장을 바꿀 수 없습니다');
    await this.recordEvent(orderId, 'store_changed', { from: order.storeId, to: store.id });

    const updated = await this.prisma.order.findUniqueOrThrow({ where: { id: orderId }, include: ORDER_INCLUDE });
    return { order: toOrderView(updated), tts: `${store.name}으로 바꿨어요.` };
  }

  // ── 타이밍 엔진 ──────────────────────────────────────────

  /**
   * 매장으로 전송한다: 결제 승인 → 채널 전송 → SENT.
   * 승인이나 전송이 실패하면 주문을 취소한다.
   */
  async send(orderId: string, etaSec: number): Promise<OrderWithRelations> {
    const order = await this.prisma.order.findUniqueOrThrow({ where: { id: orderId }, include: ORDER_INCLUDE });
    if (order.status !== 'RESERVED') throw new ConflictException(`전송할 수 없는 상태입니다: ${order.status}`);

    try {
      await this.payments.authorize(order.id, order.totalAmount);
    } catch (e) {
      if (e instanceof PaymentDeclinedError) return this.cancel(order.id, 'PAYMENT_DECLINED', e.message);
      throw e;
    }

    let externalOrderId: string;
    try {
      const channel = await this.channels.forStore(order.store);
      ({ externalOrderId } = await channel.sendOrder(order));
    } catch (e) {
      const note = e instanceof Error ? e.message : String(e);
      if (!(e instanceof ChannelRejectedError)) this.logger.error(`매장 전송 실패 ${order.id}: ${note}`);
      return this.cancel(order.id, 'STORE_REJECTED', note);
    }

    return this.transition(
      order.id,
      'SENT',
      { sentAt: new Date(), externalOrderId, etaAtSendSec: etaSec },
      { type: 'sent', payload: { etaSec, externalOrderId } },
      '주문을 매장에 보냈어요. 도착하실 때 맞춰 준비할게요.',
    );
  }

  // ── 매장 ─────────────────────────────────────────────

  async markPreparing(storeId: string, orderId: string) {
    await this.findStoreOrder(storeId, orderId);
    return this.transition(orderId, 'PREPARING', {}, { type: 'preparing' });
  }

  async markReady(storeId: string, orderId: string) {
    await this.findStoreOrder(storeId, orderId);
    return this.transition(orderId, 'READY', { readyAt: new Date() }, { type: 'ready' }, '주문하신 메뉴가 준비됐어요.');
  }

  /** 창구에서 차량번호로 찾아 수령 처리하고 결제를 확정한다. */
  async pickupByPlate(storeId: string, plateNumber: string) {
    const order = await this.prisma.order.findFirst({
      where: { storeId, plateNumber, status: { in: SENT_STATUSES } },
      orderBy: { createdAt: 'asc' },
    });
    if (!order) throw new NotFoundException('이 차량번호로 준비 중인 주문이 없습니다');
    return this.pickup(storeId, order.id);
  }

  async pickup(storeId: string, orderId: string) {
    const order = await this.findStoreOrder(storeId, orderId);
    // 준비 완료 버튼을 건너뛰고 바로 건네는 경우도 수령으로 처리한다
    if (order.status === 'SENT' || order.status === 'PREPARING') {
      await this.transition(orderId, 'READY', { readyAt: new Date() }, { type: 'ready' });
    }
    await this.payments.capture(orderId);
    const pickedUpAt = new Date();
    await this.closeDtVisit(orderId, pickedUpAt);
    return this.transition(orderId, 'PICKED_UP', { pickedUpAt }, { type: 'picked_up' }, '맛있게 드세요.');
  }

  async cancelByStore(storeId: string, orderId: string, note?: string) {
    await this.findStoreOrder(storeId, orderId);
    return this.cancel(orderId, 'STORE', note);
  }

  // ── 공통 ─────────────────────────────────────────────

  /** 어떤 상태에서든 취소한다. 매장에 전송된 주문은 매장 취소와 결제 승인 취소를 함께 한다. */
  async cancel(orderId: string, reason: CancelReason, note?: string): Promise<OrderWithRelations> {
    const before = await this.prisma.order.findUniqueOrThrow({ where: { id: orderId }, include: ORDER_INCLUDE });
    const cancelled = await this.transition(
      orderId,
      'CANCELLED',
      { cancelledAt: new Date(), cancelReason: reason },
      { type: 'cancelled', payload: { reason, note } },
      CANCEL_TTS[reason],
    );

    if (SENT_STATUSES.includes(before.status) && reason !== 'STORE_REJECTED') {
      const channel = await this.channels.forStore(before.store);
      await channel.cancelOrder(before, reason).catch((e) => this.logger.warn(`매장 취소 실패 ${orderId}: ${e}`));
    }
    await this.payments.voidIfAuthorized(orderId);
    return cancelled;
  }

  /**
   * 상태 전이. 현재 상태가 to로 갈 수 있을 때만 바꾸고(동시 요청은 한쪽만 성공), 이벤트를 남기고 알린다.
   */
  async transition(
    orderId: string,
    to: OrderStatus,
    data: Prisma.OrderUpdateManyMutationInput,
    event: { type: string; payload?: Prisma.InputJsonObject },
    tts?: string,
  ): Promise<OrderWithRelations> {
    const { count } = await this.prisma.order.updateMany({
      where: { id: orderId, status: { in: sourcesOf(to) } },
      data: { ...data, status: to },
    });
    if (count === 0) {
      const current = await this.prisma.order.findUnique({ where: { id: orderId } });
      if (!current) throw new NotFoundException('주문을 찾을 수 없습니다');
      throw new ConflictException(`${current.status} 상태에서 ${to}(으)로 바꿀 수 없습니다`);
    }

    await this.prisma.orderEvent.create({ data: { orderId, type: event.type, payload: event.payload ?? {} } });
    const order = await this.prisma.order.findUniqueOrThrow({ where: { id: orderId }, include: ORDER_INCLUDE });
    this.emit(DomainEvent.OrderStatusChanged, order, { status: to, order: toOrderView(order) }, tts);
    return order;
  }

  /** 주문 관련 도메인 이벤트를 낸다. 이벤트 기록이 필요하면 recordEvent도 함께 쓴다. */
  emit(name: DomainEventName, order: Order, data: Record<string, unknown>, tts?: string) {
    const payload: OrderDomainEvent = { orderId: order.id, storeId: order.storeId, vehicleId: order.vehicleId, tts, data };
    this.events.emit(name, payload);
  }

  recordEvent(orderId: string, type: string, payload: Prisma.InputJsonObject = {}) {
    return this.prisma.orderEvent.create({ data: { orderId, type, payload } });
  }

  // ── 내부 ─────────────────────────────────────────────

  /** DT 차로 진입~수령 시간 기록. 이후 대기열 예측에 쓴다 */
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
    const order = await this.prisma.order.findUnique({ where: { id: orderId } });
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

  private async voiceConfirmationReasons(userId: string, dto: ReserveOrderDto, totalAmount: number) {
    const user = await this.prisma.user.findUniqueOrThrow({ where: { id: userId } });
    const reasons: ConfirmationReason[] = [];
    if (!user.voiceOrderEnabled) reasons.push('VOICE_DISABLED');
    if (!dto.favoriteId) reasons.push('NOT_FAVORITE');
    if (totalAmount > user.voiceLimitPerOrder) reasons.push('OVER_PER_ORDER_LIMIT');

    const spentToday = await this.prisma.order.aggregate({
      _sum: { totalAmount: true },
      where: { userId, source: 'VOICE', status: { not: 'CANCELLED' }, createdAt: { gte: startOfTodayKst() } },
    });
    if ((spentToday._sum.totalAmount ?? 0) + totalAmount > user.voiceLimitDaily) reasons.push('OVER_DAILY_LIMIT');
    return reasons;
  }

  private async estimatePrep(store: Store, lines: ResolvedLine[]) {
    const inProgress = await this.prisma.order.count({
      where: { storeId: store.id, status: { in: ['SENT', 'PREPARING'] } },
    });
    return estimatePrepSec(
      lines.map((l) => ({ prepSec: l.menuItem.prepSec, qty: l.qty })),
      store.basePrepSec,
      inProgress,
    );
  }

  private total(lines: ResolvedLine[]) {
    return lines.reduce((sum, l) => sum + l.menuItem.price * l.qty, 0);
  }

  private describe(lines: ResolvedLine[]) {
    return describeItems(lines.map((l) => ({ name: l.menuItem.name, qty: l.qty, unit: l.menuItem.unit })));
  }
}

const KST_OFFSET_MS = 9 * 60 * 60 * 1000;

function startOfTodayKst(now = new Date()): Date {
  const kst = new Date(now.getTime() + KST_OFFSET_MS);
  kst.setUTCHours(0, 0, 0, 0);
  return new Date(kst.getTime() - KST_OFFSET_MS);
}
