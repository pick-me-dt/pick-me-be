import { OrderResponse } from '../orders/orders.response.dto';

export class StoreSettingsResponse {
  /** 매장 기본 제조 시간(초) */
  basePrepSec: number;
  /** DT 차량 1대 처리 시간(초) */
  serviceSecPerCar: number;
  /** 전송 여유 시간(초) */
  marginSec: number;
  isOpen: boolean;
}

export class StoreSummary {
  id: string;
  name: string;
}

export class QueueResponse {
  cars: number;
  waitSec: number;
}

export class StoreOverviewResponse {
  store: StoreSummary;
  queue: QueueResponse;
  settings: StoreSettingsResponse;
}

export class StoreOrderResponse extends OrderResponse {
  /** 도착까지 남은 시간(초). 차로에 들어왔으면 0, 텔레메트리가 없으면 null */
  etaSec: number | null;
  /** 전송 때 예상한 도착 시각보다 늦어진 시간(초) */
  delaySec: number;
  arrivalAt: Date | null;
}
