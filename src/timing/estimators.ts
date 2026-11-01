/** 품목이 하나 늘 때마다 더하는 제조 시간(초) */
export const EXTRA_ITEM_SEC = 20;
/** 매장에서 제조 중인 주문 1건당 제조 시간 가중치 */
export const LOAD_FACTOR_PER_ORDER = 0.1;

export interface PrepLine {
  prepSec: number;
  qty: number;
}

/**
 * 제조 시간(초) = max(매장 기본 제조 시간, 품목 중 최대 제조 시간) + 추가 품목당 20초,
 * 여기에 제조 중인 주문 1건당 ×1.1 가중치.
 */
export function estimatePrepSec(lines: PrepLine[], basePrepSec: number, ordersInProgress: number): number {
  const totalQty = lines.reduce((sum, l) => sum + l.qty, 0);
  const longest = Math.max(basePrepSec, ...lines.map((l) => l.prepSec));
  const raw = longest + EXTRA_ITEM_SEC * Math.max(0, totalQty - 1);
  return Math.round(raw * (1 + LOAD_FACTOR_PER_ORDER * ordersInProgress));
}

/** 직선거리를 도로 거리로 환산하는 계수 */
export const ROAD_FACTOR = 1.3;
/** ETA 추정에 쓰는 최저 속도(km/h). 정차 중에도 ETA가 무한대가 되지 않게 한다 */
export const MIN_SPEED_KMH = 20;

/** 내비 ETA가 없을 때 위치·속도로 추정한 남은 시간(초) */
export function fallbackEtaSec(distanceM: number, speedKmh: number): number {
  const speedMps = (Math.max(speedKmh, MIN_SPEED_KMH) * 1000) / 3600;
  return Math.round((distanceM * ROAD_FACTOR) / speedMps);
}

/** DT 대기줄 시간(초) = 대기 차량 수 × 차량당 처리 시간 */
export function queueWaitSec(cars: number, serviceSecPerCar: number): number {
  return cars * serviceSecPerCar;
}

export interface SendInput {
  etaSec: number;
  queueSec: number;
  prepSec: number;
  marginSec: number;
}

/** 창구 도착까지 남은 시간(ETA + 대기줄)이 제조 시간 + 여유 이하로 떨어지면 보낸다 */
export function shouldSend({ etaSec, queueSec, prepSec, marginSec }: SendInput): boolean {
  return etaSec + queueSec <= prepSec + marginSec;
}
