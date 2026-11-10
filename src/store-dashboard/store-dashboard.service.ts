import { Injectable, NotFoundException } from '@nestjs/common';
import { Store } from '@prisma/client';
import { ACTIVE_STATUSES } from '../orders/order-state';
import { OrdersService } from '../orders/orders.service';
import { PrismaService } from '../prisma/prisma.service';
import { QueueService } from '../queue/queue.service';
import { TimingEngine } from '../timing/timing-engine.service';
import { UpdateStoreSettingsDto } from './store-dashboard.dto';

@Injectable()
export class StoreDashboardService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly orders: OrdersService,
    private readonly queue: QueueService,
    private readonly engine: TimingEngine,
  ) {}

  async overview(storeId: string) {
    const store = await this.prisma.store.findUniqueOrThrow({ where: { id: storeId } });
    return {
      store: { id: store.id, name: store.name },
      queue: await this.queue.forStore(store),
      settings: this.settingsOf(store),
    };
  }

  /** 진행 중 주문 전체 (매장 확인 중부터). 예상 수령이 빠른 순, 시각을 모르면 뒤로 */
  async activeOrders(storeId: string, now = Date.now()) {
    const orders = await this.prisma.order.findMany({
      where: { storeId, status: { in: ACTIVE_STATUSES } },
      include: { items: true, store: true },
      orderBy: { createdAt: 'asc' },
    });
    const views = await Promise.all(orders.map((o) => this.orders.view(o, now)));
    const key = (v: (typeof views)[number]) => v.timing.expectedPickupAt?.getTime() ?? Infinity;
    return views.sort((a, b) => key(a) - key(b));
  }

  async laneEntered(storeId: string, orderId: string) {
    const order = await this.prisma.order.findUnique({ where: { id: orderId } });
    if (!order || order.storeId !== storeId) throw new NotFoundException('주문을 찾을 수 없습니다');
    return this.engine.laneEntered(orderId);
  }

  async updateSettings(storeId: string, dto: UpdateStoreSettingsDto) {
    return this.settingsOf(await this.prisma.store.update({ where: { id: storeId }, data: dto }));
  }

  async menu(storeId: string) {
    const store = await this.prisma.store.findUniqueOrThrow({ where: { id: storeId } });
    const items = await this.prisma.menuItem.findMany({ where: { brandId: store.brandId }, orderBy: { name: 'asc' } });
    const soldOut = new Set(store.soldOutMenuItemIds);
    return items.map((m) => ({ id: m.id, name: m.name, price: m.price, soldOut: soldOut.has(m.id) }));
  }

  async setSoldOut(storeId: string, menuItemId: string, soldOutFlag: boolean) {
    const store = await this.prisma.store.findUniqueOrThrow({ where: { id: storeId } });
    const item = await this.prisma.menuItem.findFirst({ where: { id: menuItemId, brandId: store.brandId } });
    if (!item) throw new NotFoundException('메뉴를 찾을 수 없습니다');
    const ids = new Set(store.soldOutMenuItemIds);
    if (soldOutFlag) ids.add(menuItemId);
    else ids.delete(menuItemId);
    await this.prisma.store.update({ where: { id: storeId }, data: { soldOutMenuItemIds: [...ids] } });
    return { id: item.id, name: item.name, price: item.price, soldOut: soldOutFlag };
  }

  private settingsOf(store: Store) {
    const { prepSec, afterEntrySec, serviceSecPerCar, isOpen } = store;
    return { prepSec, afterEntrySec, serviceSecPerCar, isOpen };
  }
}
