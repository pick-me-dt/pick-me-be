import { OrderResponse } from '../orders/orders.response.dto';

export class TelemetryResponse {
  /** 현재 주문. timing에 예상 수령·시작 추천·ETA 끊김 여부가 있다 */
  order: OrderResponse;
}
