import { Order, OrderItem, Store } from '@prisma/client';

export type OrderWithRelations = Order & { items: OrderItem[]; store: Store };

/** 차량 앱·대시보드에 내보내는 주문 모양 */
export function toOrderView(o: OrderWithRelations) {
  return {
    id: o.id,
    status: o.status,
    source: o.source,
    store: { id: o.store.id, name: o.store.name, lat: o.store.lat, lng: o.store.lng },
    items: o.items.map((i) => ({ menuItemId: i.menuItemId, name: i.name, unitPrice: i.unitPrice, qty: i.qty })),
    totalAmount: o.totalAmount,
    plateNumber: o.plateNumber,
    estPrepSec: o.estPrepSec,
    externalOrderId: o.externalOrderId,
    createdAt: o.createdAt,
    sentAt: o.sentAt,
    laneEnteredAt: o.laneEnteredAt,
    readyAt: o.readyAt,
    pickedUpAt: o.pickedUpAt,
    cancelledAt: o.cancelledAt,
    cancelReason: o.cancelReason,
  };
}

export type OrderView = ReturnType<typeof toOrderView>;
