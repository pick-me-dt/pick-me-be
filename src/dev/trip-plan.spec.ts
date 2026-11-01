import { TripSimulation } from './trip-plan';

const from = { lat: 37.42, lng: 127.11 };
const to = { lat: 37.39, lng: 127.11 };

describe('시연 주행 시뮬레이션', () => {
  it('ETA가 줄며 차로 입구에 도착하면 끝난다', () => {
    const sim = new TripSimulation({ from, to, startEtaSec: 60, cruiseKmh: 40 });
    const points = [sim.advance(30), sim.advance(30)];
    expect(points.map((p) => p.etaSec)).toEqual([30, 0]);
    expect(points[1]).toMatchObject({ lat: to.lat, lng: to.lng, speedKmh: 5 });
    expect(sim.done).toBe(true);
  });

  it('정체 구간에서는 ETA가 늘고 거의 움직이지 않는다', () => {
    const sim = new TripSimulation({ from, to, startEtaSec: 300, cruiseKmh: 40, jam: { atEtaSec: 200, addSec: 180 } });
    expect(sim.advance(60).etaSec).toBe(240);
    const jam = sim.advance(60);
    expect(jam.etaSec).toBe(200 + 180);
    expect(jam.speedKmh).toBe(5);
    const stuck = sim.advance(60);
    expect(stuck.etaSec).toBe(200 + 120);
    expect(stuck.lat).toBeCloseTo(jam.lat, 10);
  });
});
