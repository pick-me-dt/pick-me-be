/** 모듈 간 도메인 이벤트. realtime 모듈이 구독해 WebSocket으로 내보낸다. */
export const DomainEvent = {
  OrderStatusChanged: 'order.status_changed',
  /** ETA가 갱신되거나 오래됨으로 바뀜. 예상 수령·시작 추천 포함 */
  EtaUpdated: 'eta.updated',
  /** 제조 전: 시작 추천이 60초 이상 바뀜 */
  RecommendationChanged: 'order.recommendation_changed',
  /** 제조 후: 예상 수령이 늦어짐 */
  OrderDelayed: 'order.delayed',
  /** 매장 확인이 늦어짐 */
  AcceptOverdue: 'order.accept_overdue',
  OrderLaneEntered: 'order.lane_entered',
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
