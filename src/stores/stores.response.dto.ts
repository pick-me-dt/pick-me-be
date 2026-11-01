export class StoreCandidateResponse {
  id: string;
  name: string;
  lat: number;
  lng: number;
  /** 현재 위치에서 직선거리(m) */
  distanceM: number;
  /** DT 차로 대기 차량 수 */
  queueCars: number;
  /** 대기줄 시간(초) = 대기 차량 수 × 차량당 처리 시간 */
  queueWaitSec: number;
}

export class MenuItemResponse {
  id: string;
  name: string;
  /** 가격(원) */
  price: number;
  /** 제조 시간(초) */
  prepSec: number;
  options: object[];
}

export class MenuResponse {
  storeId: string;
  storeName: string;
  items: MenuItemResponse[];
}
