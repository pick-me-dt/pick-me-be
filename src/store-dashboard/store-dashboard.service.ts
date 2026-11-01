import { Injectable } from '@nestjs/common';
import { toOrderView } from '../orders/order-view';
import { OrdersService } from '../orders/orders.service';
import { PrismaService } from '../prisma/prisma.service';
import { QueueService } from '../queue/queue.service';
import { TelemetryStore } from '../timing/telemetry.store';
import { TimingEngine } from '../timing/timing-engine.service';
import { UpdateStoreOrderDto, UpdateStoreSettingsDto } from './store-dashboard.dto';

@Injectable()
export class StoreDashboardService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly orders: OrdersService,
    private readonly queue: QueueService,
    private readonly telemetry: TelemetryStore,
    private readonly engine: TimingEngine,
  ) {}

  async overview(storeId: string) {
    const store = await this.prisma.store.findUniqueOrThrow({ where: { id: storeId } });
    const queue = await this.queue.forStore(store);
    return {
      store: { id: store.id, name: store.name },
      queue,
      settings: this.settingsOf(store),
    };
  }

  /** 매장에 전송된 진행 중 주문. 도착 예정 시각이 빠른 순 */
  async activeOrders(storeId: string, now = Date.now()) {
    const orders = await this.prisma.order.findMany({
      where: { storeId, status: { in: ['SENT', 'PREPARING', 'READY'] } },
      include: { items: true, store: true },
    });
    const rows = await Promise.all(
      orders.map(async (o) => {
        const latest = await this.telemetry.latest(o.id);
        const etaSec = o.laneEnteredAt ? 0 : latest ? this.engine.currentEta(latest, now) : null;
        const plannedArrival = o.sentAt && o.etaAtSendSec !== null ? o.sentAt.getTime() + o.etaAtSendSec * 1000 : null;
        // 전송 때 예상한 도착 시각보다 늦어진 시간(초)
        const delaySec =
          etaSec !== null && plannedArrival !== null ? Math.max(0, Math.round((now + etaSec * 1000 - plannedArrival) / 1000)) : 0;
        return { ...toOrderView(o), etaSec, delaySec, arrivalAt: etaSec === null ? null : new Date(now + etaSec * 1000) };
      }),
    );
    return rows.sort((a, b) => (a.etaSec ?? Infinity) - (b.etaSec ?? Infinity));
  }

  async updateOrder(storeId: string, orderId: string, dto: UpdateStoreOrderDto) {
    switch (dto.status) {
      case 'PREPARING':
        return toOrderView(await this.orders.markPreparing(storeId, orderId));
      case 'READY':
        return toOrderView(await this.orders.markReady(storeId, orderId));
      case 'PICKED_UP':
        return toOrderView(await this.orders.pickup(storeId, orderId));
      case 'CANCELLED':
        return toOrderView(await this.orders.cancelByStore(storeId, orderId, dto.reason));
    }
  }

  async pickup(storeId: string, plateNumber: string) {
    return toOrderView(await this.orders.pickupByPlate(storeId, plateNumber));
  }

  async updateSettings(storeId: string, dto: UpdateStoreSettingsDto) {
    return this.settingsOf(await this.prisma.store.update({ where: { id: storeId }, data: dto }));
  }

  private settingsOf(store: { basePrepSec: number; serviceSecPerCar: number; marginSec: number; isOpen: boolean }) {
    const { basePrepSec, serviceSecPerCar, marginSec, isOpen } = store;
    return { basePrepSec, serviceSecPerCar, marginSec, isOpen };
  }
}
