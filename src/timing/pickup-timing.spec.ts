import { computeTiming } from './pickup-timing';

const T0 = Date.parse('2026-11-14T08:00:00+09:00');
const base = { prepSec: 180, afterEntrySec: 120 };

describe('예상 수령·시작 추천 (2차 기획 §5)', () => {
  it('예상 수령 = 입구 도착 예정 + 입구 이후 시간, 시작 추천 = 예상 수령 - 준비 시간', () => {
    // 입구까지 10분 → 입구 08:10, 수령 08:12, 시작 추천 08:09
    const t = computeTiming({ ...base, eta: { etaSec: 600, receivedAt: T0 }, now: T0 });
    expect(t.entranceArrivalAt?.toISOString()).toBe(new Date(T0 + 600_000).toISOString());
    expect(t.expectedPickupAt?.toISOString()).toBe(new Date(T0 + 720_000).toISOString());
    expect(t.recommendedStartAt?.toISOString()).toBe(new Date(T0 + 540_000).toISOString());
    expect(t.etaSec).toBe(600);
  });

  it('ETA가 없으면 계산하지 않는다', () => {
    const t = computeTiming({ ...base, now: T0 });
    expect(t).toMatchObject({ etaSec: null, expectedPickupAt: null, recommendedStartAt: null, etaStale: false });
  });

  it('ETA가 90초 넘게 끊기면 오래됨, 추천은 마지막 ETA 기준으로 유지', () => {
    const fresh = computeTiming({ ...base, eta: { etaSec: 600, receivedAt: T0 }, now: T0 + 90_000 });
    const stale = computeTiming({ ...base, eta: { etaSec: 600, receivedAt: T0 }, now: T0 + 91_000 });
    expect(fresh.etaStale).toBe(false);
    expect(stale.etaStale).toBe(true);
    expect(stale.recommendedStartAt).toEqual(fresh.recommendedStartAt);
    expect(stale.etaUpdatedAt?.getTime()).toBe(T0);
  });

  it('제조 시작 후에는 그때의 예상 수령보다 늦어진 만큼 지연', () => {
    const planned = new Date(T0 + 720_000);
    const t = computeTiming({ ...base, eta: { etaSec: 700, receivedAt: T0 }, plannedPickupAt: planned, now: T0 });
    expect(t.delaySec).toBe(100);
    const early = computeTiming({ ...base, eta: { etaSec: 500, receivedAt: T0 }, plannedPickupAt: planned, now: T0 });
    expect(early.delaySec).toBe(0);
  });

  it('차로에 들어오면 진입 시각을 입구 도착으로 쓴다', () => {
    const lane = new Date(T0 + 30_000);
    const t = computeTiming({ ...base, eta: { etaSec: 600, receivedAt: T0 }, laneEnteredAt: lane, now: T0 + 60_000 });
    expect(t.etaSec).toBe(0);
    expect(t.entranceArrivalAt).toEqual(lane);
    expect(t.etaStale).toBe(false);
  });
});
