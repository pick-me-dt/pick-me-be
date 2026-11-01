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
