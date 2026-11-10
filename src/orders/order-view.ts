import { Order, OrderItem, Store } from '@prisma/client';
import { PickupTiming } from '../timing/pickup-timing';

export type OrderWithRelations = Order & { items: OrderItem[]; store: Store };

/** 차량 앱·대시보드에 내보내는 주문 모양 */
export function toOrderView(o: OrderWithRelations, timing: PickupTiming, acceptOverdue: boolean) {
  return {
    id: o.id,
    orderNo: o.orderNo,
    status: o.status,
    source: o.source,
    store: { id: o.store.id, name: o.store.name, lat: o.store.lat, lng: o.store.lng },
    items: o.items.map((i) => ({ menuItemId: i.menuItemId, name: i.name, unitPrice: i.unitPrice, qty: i.qty })),
    totalAmount: o.totalAmount,
    plateNumber: o.plateNumber,
    externalOrderId: o.externalOrderId,
    timing,
    acceptOverdue,
    createdAt: o.createdAt,
    sentAt: o.sentAt,
    acceptedAt: o.acceptedAt,
    rejectedAt: o.rejectedAt,
    rejectReason: o.rejectReason,
    preparingAt: o.preparingAt,
    readyAt: o.readyAt,
    pickedUpAt: o.pickedUpAt,
    laneEnteredAt: o.laneEnteredAt,
    cancelRequest: o.cancelRequestedAt
      ? { requestedAt: o.cancelRequestedAt, note: o.cancelRequestNote, statusBefore: o.statusBeforeCancel }
      : null,
    cancelledAt: o.cancelledAt,
    cancelReason: o.cancelReason,
    cancelNote: o.cancelNote,
  };
}

export type OrderView = ReturnType<typeof toOrderView>;
