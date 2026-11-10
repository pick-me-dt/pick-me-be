export class StoreSettingsResponse {
  /** 준비 시간(초) */
  prepSec: number;
  /** 입구 이후 시간(초) */
  afterEntrySec: number;
  /** DT 차량 1대 처리 시간(초). 매장 검색의 대기 시간 표시에만 쓴다 */
  serviceSecPerCar: number;
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

export class StoreMenuItemResponse {
  id: string;
  name: string;
  price: number;
  soldOut: boolean;
}
