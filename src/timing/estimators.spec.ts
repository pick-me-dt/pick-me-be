import { estimatePrepSec } from './estimators';

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
