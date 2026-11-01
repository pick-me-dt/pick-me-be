import { angleDiffDeg, bearingDeg, haversineM } from './geo';

describe('geo', () => {
  it('양재에서 판교까지 직선거리는 약 11km', () => {
    const d = haversineM({ lat: 37.4705, lng: 127.035 }, { lat: 37.3947, lng: 127.1112 });
    expect(d).toBeGreaterThan(10_000);
    expect(d).toBeLessThan(12_000);
  });

  it('정북 방향 방위각은 0도', () => {
    expect(bearingDeg({ lat: 37, lng: 127 }, { lat: 38, lng: 127 })).toBeCloseTo(0, 5);
  });

  it('방위각 차이는 360도를 넘어가도 짧은 쪽으로 계산한다', () => {
    expect(angleDiffDeg(350, 10)).toBe(20);
    expect(angleDiffDeg(10, 190)).toBe(180);
  });
});
