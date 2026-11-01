import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Order, OrderItem, Store } from '@prisma/client';
import { ChannelsService } from '../channels/channels.service';
import { DomainEvent } from '../common/domain-events';
import { haversineM } from '../common/geo';
import { OrdersService } from '../orders/orders.service';
import { minutesText } from '../orders/tts';
import { PrismaService } from '../prisma/prisma.service';
import { QueueService } from '../queue/queue.service';
import { shouldSend } from './estimators';
import { LatestTelemetry, TelemetryStore } from './telemetry.store';

/** 예약 후 텔레메트리 없이 이 시간이 지나면 만료 취소 */
export const RESERVED_TIMEOUT_MS = 10 * 60 * 1000;
/** 준비 완료 후 이 시간 안에 수령하지 않으면 미수령 취소 */
export const NO_SHOW_TIMEOUT_MS = 15 * 60 * 1000;
/** 도착 예정이 전송 때보다 이만큼 늦어지면 지연 알림 (이후 같은 폭으로 더 늦어질 때마다 다시) */
export const DELAY_STEP_SEC = 120;
/** 매장 대시보드에 ETA를 다시 보내는 최소 간격 */
export const ETA_EMIT_INTERVAL_MS = 10 * 1000;
/** 대기 차량이 이 이상이고 더 빠른 매장이 있으면 회피를 제안 */
export const QUEUE_ALERT_CARS = 6;
/** 대체 매장 탐색 반경 */
const ALTERNATIVE_RADIUS_M = 10_000;
/** 대체 매장 ETA 추정에 쓰는 평균 속도(km/h) */
const ALTERNATIVE_SPEED_KMH = 30;

type EngineOrder = Order & { items: OrderItem[]; store: Store };

export interface Alternative {
  storeId: string;
  storeName: string;
  distanceM: number;
  etaSec: number;
  queueCars: number;
  queueWaitSec: number;
  /** ETA + 대기줄 시간 */
  totalSec: number;
}

/**
 * 주문을 언제 매장에 보낼지 정하고, 보낸 뒤에는 지연·미수령을 지켜본다.
 * 텔레메트리가 들어올 때마다 해당 주문을, 주기 스위퍼가 진행 중 주문 전체를 평가한다.
 */
@Injectable()
export class TimingEngine implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(TimingEngine.name);
  private readonly inFlight = new Set<string>();
  private readonly lastEtaEmitAt = new Map<string, number>();
  private readonly delayNotifiedSec = new Map<string, number>();
  private readonly queueAlerted = new Set<string>();
  private timer?: NodeJS.Timeout;

  constructor(
    private readonly prisma: PrismaService,
    private readonly orders: OrdersService,
    private readonly channels: ChannelsService,
    private readonly queue: QueueService,
    private readonly telemetry: TelemetryStore,
    private readonly config: ConfigService,
  ) {}

  onModuleInit() {
    const intervalMs = Number(this.config.get('TIMING_SWEEP_MS') ?? 5000);
    if (intervalMs > 0) {
      this.timer = setInterval(() => void this.sweep().catch((e) => this.logger.error(e)), intervalMs);
    }
  }

  onModuleDestroy() {
    if (this.timer) clearInterval(this.timer);
  }

  /** 진행 중인 주문 전체를 평가한다 */
  async sweep(now = Date.now()) {
    const active = await this.prisma.order.findMany({
      where: { status: { in: ['RESERVED', 'SENT', 'PREPARING', 'READY'] } },
      select: { id: true },
    });
    for (const { id } of active) await this.evaluate(id, now);
  }

  /** 주문 하나를 평가한다. 같은 주문을 동시에 평가하지 않는다. */
  async evaluate(orderId: string, now = Date.now()) {
    if (this.inFlight.has(orderId)) return;
    this.inFlight.add(orderId);
    try {
      const order = await this.prisma.order.findUnique({ where: { id: orderId }, include: { items: true, store: true } });
      if (!order) return;
      switch (order.status) {
        case 'RESERVED':
          return await this.evaluateReserved(order, now);
        case 'SENT':
        case 'PREPARING':
          return await this.followSent(order, now);
        case 'READY':
          await this.followSent(order, now);
          return await this.checkNoShow(order, now);
        default:
          this.forget(orderId);
      }
    } catch (e) {
      this.logger.error(`주문 평가 실패 ${orderId}: ${e instanceof Error ? e.stack : e}`);
    } finally {
      this.inFlight.delete(orderId);
    }
  }

  /** DT 차로 진입. 아직 전송 전이면 즉시 전송한다. */
  async laneEntered(orderId: string, now = new Date()) {
    let order = await this.prisma.order.findUniqueOrThrow({ where: { id: orderId }, include: { items: true, store: true } });
    if (order.laneEnteredAt) return order;
    if (order.status === 'RESERVED') order = await this.orders.send(order.id, 0);
    if (!['SENT', 'PREPARING', 'READY'].includes(order.status)) return order;

    await this.prisma.order.update({ where: { id: order.id }, data: { laneEnteredAt: now } });
    await this.queue.recordLaneEntry(order.id, order.storeId, now);
    await this.orders.recordEvent(order.id, 'lane_entered');
    const channel = await this.channels.forStore(order.store);
    await channel.notifyLaneEntered(order);
    this.orders.emit(DomainEvent.OrderLaneEntered, order, { laneEnteredAt: now.toISOString(), plateNumber: order.plateNumber });
    return this.prisma.order.findUniqueOrThrow({ where: { id: order.id }, include: { items: true, store: true } });
  }

  /** 현재 위치에서 더 빨리 받을 수 있는 매장. 지금 매장보다 빠른 곳만, 빠른 순 */
  async alternatives(order: EngineOrder, now = Date.now()): Promise<Alternative[]> {
    const latest = await this.telemetry.latest(order.id);
    if (!latest) return [];
    const current = await this.queue.forStore(order.store);
    const currentTotal = this.currentEta(latest, now) + current.waitSec;

    const stores = await this.prisma.store.findMany({
      where: { isOpen: true, brandId: order.store.brandId, id: { not: order.storeId } },
    });
    const options: Alternative[] = [];
    for (const store of stores) {
      const distanceM = Math.round(haversineM(latest, store));
      if (distanceM > ALTERNATIVE_RADIUS_M) continue;
      const etaSec = Math.round((distanceM * 1.3) / ((ALTERNATIVE_SPEED_KMH * 1000) / 3600));
      const q = await this.queue.forStore(store);
      const totalSec = etaSec + q.waitSec;
      if (totalSec < currentTotal) {
        options.push({
          storeId: store.id,
          storeName: store.name,
          distanceM,
          etaSec,
          queueCars: q.cars,
          queueWaitSec: q.waitSec,
          totalSec,
        });
      }
    }
    return options.sort((a, b) => a.totalSec - b.totalSec);
  }

  /** 마지막 ETA에서 받은 뒤 지난 시간을 뺀 현재 ETA */
  currentEta(latest: LatestTelemetry, now = Date.now()): number {
    return Math.max(0, latest.etaSec - Math.round((now - latest.receivedAt) / 1000));
  }

  private async evaluateReserved(order: EngineOrder, now: number) {
    const latest = await this.telemetry.latest(order.id);
    const lastSignal = Math.max(order.updatedAt.getTime(), latest?.receivedAt ?? 0);
    if (now - lastSignal > RESERVED_TIMEOUT_MS) {
      await this.orders.cancel(order.id, 'EXPIRED');
      return this.forget(order.id);
    }
    if (!latest) return;

    const etaSec = this.currentEta(latest, now);
    const queue = await this.queue.forStore(order.store);
    if (shouldSend({ etaSec, queueSec: queue.waitSec, prepSec: order.estPrepSec, marginSec: order.store.marginSec })) {
      await this.orders.send(order.id, etaSec);
      return;
    }
    await this.maybeAlertQueue(order, queue.cars, now);
  }

  private async followSent(order: EngineOrder, now: number) {
    const latest = await this.telemetry.latest(order.id);
    if (!latest || order.laneEnteredAt) return;
    const etaSec = this.currentEta(latest, now);

    const lastEmit = this.lastEtaEmitAt.get(order.id) ?? 0;
    if (now - lastEmit >= ETA_EMIT_INTERVAL_MS) {
      this.lastEtaEmitAt.set(order.id, now);
      const channel = await this.channels.forStore(order.store);
      await channel.updateEta(order, etaSec);
      this.orders.emit(DomainEvent.EtaUpdated, order, {
        etaSec,
        arrivalAt: new Date(now + etaSec * 1000).toISOString(),
      });
    }

    if (!order.sentAt || order.etaAtSendSec === null) return;
    const plannedArrival = order.sentAt.getTime() + order.etaAtSendSec * 1000;
    const delaySec = Math.round((now + etaSec * 1000 - plannedArrival) / 1000);
    const notified = this.delayNotifiedSec.get(order.id) ?? 0;
    if (delaySec >= notified + DELAY_STEP_SEC) {
      this.delayNotifiedSec.set(order.id, delaySec);
      await this.orders.recordEvent(order.id, 'delayed', { delaySec, etaSec });
      this.orders.emit(
        DomainEvent.OrderDelayed,
        order,
        { delaySec, etaSec, arrivalAt: new Date(now + etaSec * 1000).toISOString() },
        `정체로 도착이 ${minutesText(delaySec)} 늦어져 매장에 알렸어요.`,
      );
    }
  }

  private async checkNoShow(order: EngineOrder, now: number) {
    if (order.readyAt && now - order.readyAt.getTime() > NO_SHOW_TIMEOUT_MS) {
      await this.orders.cancel(order.id, 'NO_SHOW');
      this.forget(order.id);
    }
  }

  private async maybeAlertQueue(order: EngineOrder, cars: number, now: number) {
    if (cars < QUEUE_ALERT_CARS || this.queueAlerted.has(order.id)) return;
    const [best] = await this.alternatives(order, now);
    if (!best) return;
    this.queueAlerted.add(order.id);
    await this.orders.recordEvent(order.id, 'queue_alert', { cars, suggestedStoreId: best.storeId });
    this.orders.emit(
      DomainEvent.QueueAlert,
      order,
      { cars, alternative: best },
      `${order.store.name} 앞에 차가 ${cars}대 있어요. ${best.storeName}으로 바꾸면 ${minutesText(best.totalSec)} 안에 받을 수 있어요. 바꿀까요?`,
    );
  }

  private forget(orderId: string) {
    this.lastEtaEmitAt.delete(orderId);
    this.delayNotifiedSec.delete(orderId);
    this.queueAlerted.delete(orderId);
    this.telemetry.forget(orderId);
  }
}
