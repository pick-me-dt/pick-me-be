/** 모듈 간 도메인 이벤트. realtime 모듈이 구독해 WebSocket으로 내보낸다. */
export const DomainEvent = {
  OrderStatusChanged: 'order.status_changed',
  OrderDelayed: 'order.delayed',
  OrderLaneEntered: 'order.lane_entered',
  EtaUpdated: 'eta.updated',
  QueueAlert: 'queue.alert',
} as const;

export type DomainEventName = (typeof DomainEvent)[keyof typeof DomainEvent];

export interface OrderDomainEvent {
  orderId: string;
  storeId: string;
  vehicleId: string;
  /** 차량 앱이 TextToSpeech로 읽을 문장. 없으면 읽지 않는다. */
  tts?: string;
  data: Record<string, unknown>;
}
