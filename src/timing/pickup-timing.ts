/** ETA가 이 시간(초) 넘게 갱신되지 않으면 오래됨으로 표시하고 추천 갱신을 보류한다 */
export const ETA_STALE_SEC = 90;
/** 시작 추천이 이 시간(초) 이상 바뀌면 강조해서 알린다 */
export const RECOMMENDATION_EMPHASIS_SEC = 60;
/** 제조 시작 후 예상 수령이 이 시간(초) 이상 늦어지면 매장에 지연을 알린다 (이후 같은 폭마다 다시) */
export const DELAY_NOTIFY_SEC = 60;
/** 매장 확인 중으로 이 시간(초)이 지나면 응답 지연으로 표시한다 */
export const ACCEPT_OVERDUE_SEC = 120;

export interface EtaSnapshot {
  /** NaviHelper가 준 입구까지 남은 시간(초) */
  etaSec: number;
  /** 서버가 ETA를 받은 시각(ms) */
  receivedAt: number;
}

export interface TimingInput {
  eta?: EtaSnapshot;
  laneEnteredAt?: Date | null;
  /** 제조를 시작할 때 고정한 예상 수령 시각 */
  plannedPickupAt?: Date | null;
  prepSec: number;
  afterEntrySec: number;
  now: number;
}

export interface PickupTiming {
  /** 입구까지 남은 시간(초). 차로에 들어왔으면 0, ETA가 없으면 null */
  etaSec: number | null;
  /** 마지막 ETA 수신 시각 */
  etaUpdatedAt: Date | null;
  /** ETA가 90초 넘게 끊김. 추천은 마지막 ETA 기준으로 보류된다 */
  etaStale: boolean;
  /** 입구 도착 예정 */
  entranceArrivalAt: Date | null;
  /** 예상 수령 = 입구 도착 예정 + 입구 이후 시간 */
  expectedPickupAt: Date | null;
  /** 시작 추천 = 예상 수령 - 준비 시간 */
  recommendedStartAt: Date | null;
  prepSec: number;
  afterEntrySec: number;
  /** 제조 시작 후, 그때 예상한 수령 시각보다 늦어진 시간(초) */
  delaySec: number;
}

/**
 * 2차 기획 §5 계산식.
 * 시각은 모두 절대 시각이라, ETA가 새로 오지 않는 동안에는 추천도 그대로 유지된다.
 */
export function computeTiming(input: TimingInput): PickupTiming {
  const { eta, laneEnteredAt, plannedPickupAt, prepSec, afterEntrySec, now } = input;

  let entranceMs: number | null = null;
  let etaSec: number | null = null;
  let etaStale = false;
  if (laneEnteredAt) {
    entranceMs = laneEnteredAt.getTime();
    etaSec = 0;
  } else if (eta) {
    entranceMs = eta.receivedAt + eta.etaSec * 1000;
    etaSec = Math.max(0, Math.round((entranceMs - now) / 1000));
    etaStale = now - eta.receivedAt > ETA_STALE_SEC * 1000;
  }

  const pickupMs = entranceMs === null ? null : entranceMs + afterEntrySec * 1000;
  const delaySec =
    pickupMs !== null && plannedPickupAt ? Math.max(0, Math.round((pickupMs - plannedPickupAt.getTime()) / 1000)) : 0;

  return {
    etaSec,
    etaUpdatedAt: eta ? new Date(eta.receivedAt) : null,
    etaStale,
    entranceArrivalAt: entranceMs === null ? null : new Date(entranceMs),
    expectedPickupAt: pickupMs === null ? null : new Date(pickupMs),
    recommendedStartAt: pickupMs === null ? null : new Date(pickupMs - prepSec * 1000),
    prepSec,
    afterEntrySec,
    delaySec,
  };
}
