import { Order, OrderItem, Store } from '@prisma/client';

export type ChannelOrder = Order & { items: OrderItem[]; store: Store };

export interface QueueStatus {
  /** DT 차로에서 대기 중인 차량 수 */
  cars: number;
}

/**
 * 매장(또는 브랜드 POS·배달 플랫폼)과의 연동 지점.
 * 프로토타입은 MockDtAdapter 하나, 실서비스는 채널별 어댑터를 추가한다.
 */
export interface ChannelAdapter {
  /** 주문을 매장에 넣고 매장 쪽 주문 번호를 받는다. 매장이 거절하면 예외를 던진다. */
  sendOrder(order: ChannelOrder): Promise<{ externalOrderId: string }>;
  updateEta(order: ChannelOrder, etaSec: number): Promise<void>;
  notifyLaneEntered(order: ChannelOrder): Promise<void>;
  cancelOrder(order: ChannelOrder, reason: string): Promise<void>;
  getQueue(store: Store): Promise<QueueStatus>;
}

export class ChannelRejectedError extends Error {}
