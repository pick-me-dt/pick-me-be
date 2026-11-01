import { Injectable, Logger, NotFoundException, OnModuleDestroy } from '@nestjs/common';
import { OrdersService } from '../orders/orders.service';
import { PrismaService } from '../prisma/prisma.service';
import { TimingService } from '../timing/timing.service';
import { TripOptionsDto } from './dev.dto';
import { TripSimulation } from './trip-plan';

const DEFAULTS = { startEtaSec: 600, speedup: 10, tickSec: 5, cruiseKmh: 40 };
/** 자동 매장 모드에서 차로 진입 후 준비 완료까지 걸리는 시뮬레이션 시간(초) */
const AUTO_READY_AFTER_LANE_SEC = 20;

interface Running {
  orderId: string;
  timer: NodeJS.Timeout;
  options: Required<Omit<TripOptionsDto, 'jam'>> & Pick<TripOptionsDto, 'jam'>;
  lastPoint?: { etaSec: number; speedKmh: number };
}

/**
 * 시연용 주행 시뮬레이터. 차량 앱 대신 텔레메트리를 보내 주행 → 정체 → DT 진입을 재현한다.
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
    const distanceM = ((options.cruiseKmh * 1000) / 3600) * options.startEtaSec / 1.3;
    const from = { lat: to.lat + distanceM / 111_000, lng: to.lng };
    const sim = new TripSimulation({ from, to, startEtaSec: options.startEtaSec, cruiseKmh: options.cruiseKmh, jam: options.jam });
    const driver = { role: 'driver' as const, userId: order.userId, vehicleId: order.vehicleId };
    let laneAtSimSec: number | null = null;
    let simSec = 0;

    const entry: Partial<Running> = { orderId, options };
    const tick = async () => {
      try {
        simSec += options.tickSec;
        const current = await this.prisma.order.findUniqueOrThrow({ where: { id: orderId } });
        if (current.status === 'CANCELLED' || current.status === 'PICKED_UP') return this.stop(orderId);

        if (!sim.done) {
          const point = sim.advance(options.tickSec);
          entry.lastPoint = { etaSec: point.etaSec, speedKmh: point.speedKmh };
          const { order: view } = await this.timing.ingest(driver, orderId, {
            etaSec: point.etaSec,
            lat: point.lat,
            lng: point.lng,
            speedKmh: point.speedKmh,
          });
          if (view.laneEnteredAt && laneAtSimSec === null) laneAtSimSec = simSec;
        } else if (!current.laneEnteredAt) {
          await this.timing.laneEntered(driver, orderId);
          laneAtSimSec = simSec;
        }

        if (options.autoStore) {
          if (current.status === 'SENT') await this.orders.markPreparing(current.storeId, orderId);
          if (current.status === 'PREPARING' && laneAtSimSec !== null && simSec - laneAtSimSec >= AUTO_READY_AFTER_LANE_SEC) {
            await this.orders.markReady(current.storeId, orderId);
          }
        }
        // 자동 매장 모드는 준비 완료까지, 아니면 차로 진입까지 재현하고 멈춘다
        if (options.autoStore ? current.status === 'READY' : sim.done && laneAtSimSec !== null) this.stop(orderId);
      } catch (e) {
        this.logger.warn(`시뮬레이션 중단 ${orderId}: ${e instanceof Error ? e.message : e}`);
        this.stop(orderId);
      }
    };

    const intervalMs = Math.max(50, (options.tickSec * 1000) / options.speedup);
    entry.timer = setInterval(() => void tick(), intervalMs);
    this.running.set(orderId, entry as Running);

    return { orderId, intervalMs, from, options };
  }

  stop(orderId: string) {
    const entry = this.running.get(orderId);
    if (!entry) return false;
    clearInterval(entry.timer);
    this.running.delete(orderId);
    return true;
  }

  list() {
    return [...this.running.values()].map(({ orderId, options, lastPoint }) => ({ orderId, options, lastPoint }));
  }

  stopAll() {
    const ids = [...this.running.keys()];
    for (const id of ids) this.stop(id);
    return ids.length;
  }

  onModuleDestroy() {
    this.stopAll();
  }
}
