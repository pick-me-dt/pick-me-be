import { ConflictException, Injectable } from '@nestjs/common';
import { MockDtAdapter } from '../channels/mock-dt/mock-dt.adapter';
import { TokenService } from '../auth/token.service';
import { ACTIVE_STATUSES } from '../orders/order-state';
import { OrdersService } from '../orders/orders.service';
import { PrismaService } from '../prisma/prisma.service';
import { TimingEngine } from '../timing/timing-engine.service';
import { seed, SEED, STORES } from '../seed/seed';
import { SimulatorService } from './simulator.service';

/** 시드 매장을 옮길 때 기준점에서 북쪽으로 떨어뜨리는 거리(m)와 동쪽 오프셋(m) */
const RELOCATE_OFFSETS_M = [
  { north: 800, east: 100 },
  { north: 2500, east: -200 },
  { north: 5000, east: 300 },
];

/** FE 로컬 개발용 목데이터 조작 */
@Injectable()
export class DevFixturesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly mockDt: MockDtAdapter,
    private readonly simulator: SimulatorService,
    private readonly orders: OrdersService,
    private readonly tokens: TokenService,
    private readonly engine: TimingEngine,
  ) {}

  /** 시드 차량의 운전자 토큰과 매장별 직원 토큰 */
  async tokensForSeed() {
    const staff = await this.prisma.storeStaff.findMany({ include: { store: true }, orderBy: { loginId: 'asc' } });
    return {
      driver: {
        token: this.tokens.sign({ role: 'driver', userId: SEED.userId, vehicleId: SEED.vehicleId }),
        deviceId: SEED.deviceId,
        plateNumber: SEED.plateNumber,
        userId: SEED.userId,
        vehicleId: SEED.vehicleId,
      },
      staff: staff.map((s) => ({
        loginId: s.loginId,
        storeId: s.storeId,
        storeName: s.store.name,
        token: this.tokens.sign({ role: 'staff', staffId: s.id, storeId: s.storeId }),
      })),
    };
  }

  /** 진행 중 주문과 시뮬레이션을 모두 정리하고 시드 데이터(매장 위치·설정·품절 포함)를 되돌린다. 양재 DT점 다음 주문번호는 P-021 */
  async reset() {
    const stoppedSimulations = this.simulator.stopAll();
    const active = await this.prisma.order.findMany({ where: { status: { in: ACTIVE_STATUSES } }, select: { id: true } });
    for (const { id } of active) {
      await this.orders.cancel(id, 'DEV_RESET').catch(() => undefined);
      this.engine.forget(id);
    }
    this.mockDt.resetQueues();
    await seed(this.prisma);
    await this.orders.setNextOrderNo(SEED.stores.yangjae, SEED.demoNextOrderNo);
    return { cancelledOrders: active.length, stoppedSimulations };
  }

  /** 에뮬레이터 위치가 어디든 매장 검색이 되도록 시드 매장을 기준점 북쪽으로 옮긴다 */
  async relocateStores(lat: number, lng: number) {
    const mPerDegLat = 111_000;
    const mPerDegLng = 111_000 * Math.cos((lat * Math.PI) / 180);
    const moved = [];
    for (const [i, s] of STORES.entries()) {
      const { north, east } = RELOCATE_OFFSETS_M[i];
      const storeLat = lat + north / mPerDegLat;
      const storeLng = lng + east / mPerDegLng;
      const store = await this.prisma.store.update({
        where: { id: s.id },
        data: { lat: storeLat, lng: storeLng, laneLat: storeLat + 0.00027, laneLng: storeLng },
      });
      moved.push({ id: store.id, name: store.name, lat: store.lat, lng: store.lng, distanceM: north });
    }
    return moved;
  }

  /**
   * 주문을 다음 단계로 넘긴다. 차량 앱 화면을 매장 대시보드 없이 확인할 때 쓴다.
   * PENDING_ACCEPT → ACCEPTED → PREPARING → READY → PICKED_UP, CANCEL_REQUESTED → CANCELLED(승인)
   */
  async advance(orderId: string) {
    const order = await this.prisma.order.findUniqueOrThrow({ where: { id: orderId } });
    const { storeId } = order;
    switch (order.status) {
      case 'PENDING_ACCEPT':
        await this.orders.accept(storeId, orderId);
        break;
      case 'ACCEPTED':
        await this.orders.startPreparing(storeId, orderId);
        break;
      case 'PREPARING':
        await this.orders.markReady(storeId, orderId);
        break;
      case 'READY':
        await this.orders.pickup(storeId, orderId);
        break;
      case 'CANCEL_REQUESTED':
        await this.orders.approveCancel(storeId, orderId, 'dev');
        break;
      default:
        throw new ConflictException(`${order.status} 주문은 더 넘길 단계가 없습니다`);
    }
    return this.orders.view(await this.orders.findWithRelations(orderId));
  }
}
