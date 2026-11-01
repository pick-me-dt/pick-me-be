import { OrderResponse } from '../orders/orders.response.dto';

export class TelemetryResponse {
  /** 서버가 쓴 ETA(초). 내비 ETA가 없으면 추정값 */
  etaSec: number;
  /** 매장까지 직선거리(m) */
  distanceM: number;
  /** 현재 주문 상태. WebSocket 이벤트를 놓쳤을 때 상태를 맞추는 데 쓴다 */
  order: OrderResponse;
}

export class AlternativeResponse {
  storeId: string;
  storeName: string;
  distanceM: number;
  etaSec: number;
  queueCars: number;
  queueWaitSec: number;
  /** ETA + 대기줄 시간(초) */
  totalSec: number;
}
