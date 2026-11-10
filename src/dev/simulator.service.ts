import { Injectable, Logger, NotFoundException, OnModuleDestroy } from '@nestjs/common';
import { ACTIVE_STATUSES } from '../orders/order-state';
import { OrdersService } from '../orders/orders.service';
import { PrismaService } from '../prisma/prisma.service';
import { TimingService } from '../timing/timing.service';
import { TripOptionsDto } from './dev.dto';
import { TripSimulation } from './trip-plan';

const DEFAULTS = { startEtaSec: 300, tickSec: 30, cruiseKmh: 40 };

interface Running {
  orderId: string;
  timer: NodeJS.Timeout;
  options: Required<Omit<TripOptionsDto, 'jam'>> & Pick<TripOptionsDto, 'jam'>;
  lastPoint?: { etaSec: number; speedKmh: number };
}

/**
 * 시연용 주행 시뮬레이터. 차량 앱 대신 NaviHelper ETA를 보내 주행 → 정체 → DT 진입을 재현한다.
 * 2차 기획의 예상 수령·시작 추천은 절대 시각이라 배속 없이 실제 시간으로 흐른다.
 * 실제 차량 앱과 같은 경로(TimingService.ingest)를 탄다.
 */
@Injectable()
export class SimulatorService implements OnModuleDestroy {
  private readonly logger = new Logger(SimulatorService.name);
  private readonly running = new Map<string, Running>();

  constructor(
    private readonly prisma: PrismaService,
    private readonly timing: TimingService,
    private readonly orders: OrdersService,
  ) {}

  async start(orderId: string, dto: TripOptionsDto) {
    const order = await this.prisma.order.findUnique({ where: { id: orderId }, include: { store: true } });
    if (!order) throw new NotFoundException('주문을 찾을 수 없습니다');
    this.stop(orderId);

    const given = Object.fromEntries(Object.entries(dto).filter(([, v]) => v !== undefined)) as TripOptionsDto;
    const options = { ...DEFAULTS, autoStore: false, ...given };
    const to = { lat: order.store.laneLat, lng: order.store.laneLng };
    // 출발지: 매장 북쪽, 주행 속도로 startEtaSec만큼 떨어진 곳(도로 계수 1.3 반영)
    const distanceM = (((options.cruiseKmh * 1000) / 3600) * options.startEtaSec) / 1.3;
    const from = { lat: to.lat + distanceM / 111_000, lng: to.lng };
    const sim = new TripSimulation({ from, to, startEtaSec: options.startEtaSec, cruiseKmh: options.cruiseKmh, jam: options.jam });
    const driver = { role: 'driver' as const, userId: order.userId, vehicleId: order.vehicleId };
    const entry: Partial<Running> = { orderId, options };

    const tick = async () => {
      try {
        let current = await this.orders.findWithRelations(orderId);
        if (!ACTIVE_STATUSES.includes(current.status)) return this.stop(orderId);

        if (!sim.done) {
          const point = sim.advance(options.tickSec);
          entry.lastPoint = { etaSec: point.etaSec, speedKmh: point.speedKmh };
          await this.timing.ingest(driver, orderId, point);
        }
        if (sim.done && !current.laneEnteredAt) {
          // 입구에 닿으면 운전자가 앱에서 진입을 확인한 것으로 본다
          await this.timing.laneEntered(driver, orderId);
        }

        if (options.autoStore) {
          current = await this.orders.findWithRelations(orderId);
          await this.autoStore(current.storeId, orderId, current.status);
          current = await this.orders.findWithRelations(orderId);
          if (current.status === 'READY') return this.stop(orderId);
        } else if (sim.done) {
          this.stop(orderId);
        }
      } catch (e) {
        this.logger.warn(`시뮬레이션 중단 ${orderId}: ${e instanceof Error ? e.message : e}`);
        this.stop(orderId);
      }
    };

    entry.timer = setInterval(() => void tick(), options.tickSec * 1000);
    this.running.set(orderId, entry as Running);
    void tick();
    return { orderId, from, options };
  }

  /** 직원 대신: 바로 수락, 시작 추천 시각에 제조 시작, 준비 시간이 지나면 준비 완료 */
  private async autoStore(storeId: string, orderId: string, status: string) {
    const now = Date.now();
    if (status === 'PENDING_ACCEPT') {
      await this.orders.accept(storeId, orderId);
      return;
    }
    const order = await this.orders.findWithRelations(orderId);
    if (status === 'ACCEPTED') {
      const timing = await this.orders.timingOf(order, now);
      if (timing.recommendedStartAt && now >= timing.recommendedStartAt.getTime()) {
        await this.orders.startPreparing(storeId, orderId);
      }
    } else if (status === 'PREPARING' && order.preparingAt) {
      if (now - order.preparingAt.getTime() >= order.store.prepSec * 1000) await this.orders.markReady(storeId, orderId);
    }
  }

  stop(orderId: string) {
    const entry = this.running.get(orderId);
    if (!entry) return false;
    clearInterval(entry.timer);
    this.running.delete(orderId);
    return true;
  }

  stopAll() {
    const ids = [...this.running.keys()];
    for (const id of ids) this.stop(id);
    return ids.length;
  }

  list() {
    return [...this.running.values()].map(({ orderId, options, lastPoint }) => ({ orderId, options, lastPoint }));
  }

  onModuleDestroy() {
    this.stopAll();
  }
}
