import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ChannelsService } from '../channels/channels.service';
import { DomainEvent } from '../common/domain-events';
import { ACTIVE_STATUSES, BEFORE_PREP_STATUSES } from '../orders/order-state';
import { OrderWithRelations } from '../orders/order-view';
import { OrdersService } from '../orders/orders.service';
import { minutesText } from '../orders/tts';
import { PrismaService } from '../prisma/prisma.service';
import { QueueService } from '../queue/queue.service';
import { DELAY_NOTIFY_SEC, PickupTiming, RECOMMENDATION_EMPHASIS_SEC } from './pickup-timing';
import { TelemetryStore } from './telemetry.store';

/**
 * 2차 기획: 매장 공유는 예약 직후에 끝나고, 타이밍 엔진은 시각을 계산해 알리기만 한다.
 * - 제조 전: ETA가 바뀌면 시작 추천을 갱신하고, 60초 이상 바뀌면 강조해서 알린다.
 * - 제조 후: 시작한 제조는 되돌리지 않고, 예상 수령이 늦어지면 지연을 공유한다.
 * - ETA가 90초 넘게 끊기면 오래됨으로 알린다. 주문을 자동으로 취소하거나 차로 진입을 추정하지 않는다.
 */
@Injectable()
export class TimingEngine implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(TimingEngine.name);
  /** 마지막으로 강조해 알린 시작 추천(ms). 이 값과 60초 이상 차이 나면 다시 알린다 */
  private readonly recommendationBaseline = new Map<string, number>();
  private readonly delayNotifiedSec = new Map<string, number>();
  private readonly staleNotified = new Set<string>();
  private readonly overdueNotified = new Set<string>();
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

  /** 새 ETA를 받은 뒤 호출한다. 차량·매장 모두에 예상 수령·시작 추천을 갱신한다 */
  async onEta(orderId: string, now = Date.now()) {
    const order = await this.orders.findWithRelations(orderId);
    if (!ACTIVE_STATUSES.includes(order.status)) return;
    const timing = await this.orders.timingOf(order, now);
    this.staleNotified.delete(orderId);

    this.orders.emit(DomainEvent.EtaUpdated, order, { status: order.status, timing });
    if (timing.etaSec !== null) {
      const channel = await this.channels.forStore(order.store);
      await channel.updateEta(order, timing.etaSec).catch((e) => this.logger.warn(`ETA 공유 실패 ${orderId}: ${e}`));
    }

    if (BEFORE_PREP_STATUSES.includes(order.status)) await this.checkRecommendation(order, timing);
    if (order.status === 'PREPARING' || order.status === 'READY') await this.checkDelay(order, timing);
  }

  /** 진행 중 주문의 ETA 끊김과 매장 응답 지연을 확인한다 */
  async sweep(now = Date.now()) {
    const active = await this.prisma.order.findMany({
      where: { status: { in: ACTIVE_STATUSES } },
      include: { items: true, store: true },
    });
    for (const order of active) {
      try {
        const view = await this.orders.view(order, now);
        if (view.timing.etaStale && !this.staleNotified.has(order.id)) {
          this.staleNotified.add(order.id);
          await this.orders.recordEvent(order.id, 'eta_stale', { etaUpdatedAt: view.timing.etaUpdatedAt?.toISOString() ?? null });
          this.orders.emit(DomainEvent.EtaUpdated, order, { status: order.status, timing: view.timing });
        }
        if (view.acceptOverdue && !this.overdueNotified.has(order.id)) {
          this.overdueNotified.add(order.id);
          this.orders.emit(
            DomainEvent.AcceptOverdue,
            order,
            { sentAt: order.sentAt?.toISOString() ?? null },
            '매장 확인이 늦어지고 있어요. 확인되면 바로 알려 드릴게요.',
          );
        }
      } catch (e) {
        this.logger.error(`주문 점검 실패 ${order.id}: ${e instanceof Error ? e.stack : e}`);
      }
    }
  }

  /**
   * DT 차로 진입. 위치·저속으로 추정하지 않고, 차량 앱(운전자 확인)이나 직원이 알려 줄 때만 기록한다.
   * 이후 예상 수령은 진입 시각 + 입구 이후 시간으로 고정된다.
   */
  async laneEntered(orderId: string, now = new Date()) {
    const order = await this.orders.findWithRelations(orderId);
    if (order.laneEnteredAt || !ACTIVE_STATUSES.includes(order.status)) return order;

    await this.prisma.order.update({ where: { id: order.id }, data: { laneEnteredAt: now } });
    await this.queue.recordLaneEntry(order.id, order.storeId, now);
    await this.orders.recordEvent(order.id, 'lane_entered');
    const channel = await this.channels.forStore(order.store);
    await channel.notifyLaneEntered(order).catch((e) => this.logger.warn(`진입 공유 실패 ${orderId}: ${e}`));

    const updated = await this.orders.findWithRelations(order.id);
    const timing = await this.orders.timingOf(updated, now.getTime());
    this.orders.emit(DomainEvent.OrderLaneEntered, updated, {
      laneEnteredAt: now.toISOString(),
      plateNumber: updated.plateNumber,
      orderNo: updated.orderNo,
      timing,
    });
    return updated;
  }

  private async checkRecommendation(order: OrderWithRelations, timing: PickupTiming) {
    if (!timing.recommendedStartAt || timing.etaStale) return;
    const rec = timing.recommendedStartAt.getTime();
    const baseline = this.recommendationBaseline.get(order.id);
    if (baseline === undefined) {
      this.recommendationBaseline.set(order.id, rec);
      return;
    }
    const deltaSec = Math.round((rec - baseline) / 1000);
    if (Math.abs(deltaSec) < RECOMMENDATION_EMPHASIS_SEC) return;

    this.recommendationBaseline.set(order.id, rec);
    await this.orders.recordEvent(order.id, 'recommendation_changed', {
      deltaSec,
      recommendedStartAt: timing.recommendedStartAt.toISOString(),
    });
    this.orders.emit(
      DomainEvent.RecommendationChanged,
      order,
      {
        deltaSec,
        emphasize: true,
        previousRecommendedStartAt: new Date(baseline).toISOString(),
        recommendedStartAt: timing.recommendedStartAt.toISOString(),
        timing,
      },
      deltaSec > 0
        ? `도착이 늦어져 매장의 제조 시작 추천을 ${minutesText(deltaSec)} 늦췄어요.`
        : `도착이 빨라져 매장의 제조 시작 추천을 ${minutesText(-deltaSec)} 앞당겼어요.`,
    );
  }

  private async checkDelay(order: OrderWithRelations, timing: PickupTiming) {
    if (timing.etaStale) return;
    const notified = this.delayNotifiedSec.get(order.id) ?? 0;
    if (timing.delaySec < notified + DELAY_NOTIFY_SEC) return;

    this.delayNotifiedSec.set(order.id, timing.delaySec);
    await this.orders.recordEvent(order.id, 'delayed', { delaySec: timing.delaySec });
    this.orders.emit(
      DomainEvent.OrderDelayed,
      order,
      {
        delaySec: timing.delaySec,
        expectedPickupAt: timing.expectedPickupAt?.toISOString() ?? null,
        plannedPickupAt: order.plannedPickupAt?.toISOString() ?? null,
        timing,
      },
      `도착이 ${minutesText(timing.delaySec)} 늦어진다고 매장에 알렸어요.`,
    );
  }

  /** 시연·테스트용: 주문별 알림 기준을 비운다 */
  forget(orderId: string) {
    this.recommendationBaseline.delete(orderId);
    this.delayNotifiedSec.delete(orderId);
    this.staleNotified.delete(orderId);
    this.overdueNotified.delete(orderId);
    this.telemetry.forget(orderId);
  }
}
