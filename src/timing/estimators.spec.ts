import { estimatePrepSec, fallbackEtaSec, queueWaitSec, shouldSend } from './estimators';

describe('제조 시간 추정', () => {
  it('한 잔이면 품목 제조 시간과 매장 기본값 중 큰 값', () => {
    expect(estimatePrepSec([{ prepSec: 90, qty: 1 }], 60, 0)).toBe(90);
    expect(estimatePrepSec([{ prepSec: 30, qty: 1 }], 60, 0)).toBe(60);
  });

  it('추가 품목마다 20초를 더한다', () => {
    expect(estimatePrepSec([{ prepSec: 90, qty: 2 }, { prepSec: 120, qty: 1 }], 60, 0)).toBe(160);
  });

  it('제조 중인 주문이 많을수록 늘어난다', () => {
    expect(estimatePrepSec([{ prepSec: 100, qty: 1 }], 60, 3)).toBe(130);
  });
});

describe('ETA·대기·전송 판단', () => {
  it('내비 ETA가 없으면 거리 × 1.3 ÷ 속도로 추정한다', () => {
    // 1km, 36km/h(10m/s) → 1300m / 10 = 130초
    expect(fallbackEtaSec(1000, 36)).toBe(130);
  });

  it('정차 중이면 20km/h로 계산한다', () => {
    expect(fallbackEtaSec(1000, 0)).toBe(fallbackEtaSec(1000, 20));
  });

  it('대기줄 시간은 대기 차량 수 × 차량당 처리 시간', () => {
    expect(queueWaitSec(3, 60)).toBe(180);
  });

  it('ETA + 대기줄이 제조 시간 + 여유 이하가 되면 전송', () => {
    expect(shouldSend({ etaSec: 300, queueSec: 120, prepSec: 90, marginSec: 30 })).toBe(false);
    expect(shouldSend({ etaSec: 0, queueSec: 120, prepSec: 90, marginSec: 30 })).toBe(true);
  });
});
