import { LatLng } from '../common/geo';

export interface TripPlan {
  from: LatLng;
  to: LatLng;
  /** 출발 시점 ETA(초) */
  startEtaSec: number;
  cruiseKmh: number;
  /** 정체: 남은 주행 시간이 atEtaSec에 닿으면 addSec 동안 거의 서 있는다(그만큼 ETA가 늘어난다) */
  jam?: { atEtaSec: number; addSec: number };
}

export interface TripPoint extends LatLng {
  etaSec: number;
  speedKmh: number;
}

/** 시연용 주행. 출발지에서 DT 차로 입구까지 직선으로 움직인다 */
export class TripSimulation {
  private driveSec: number;
  private jamLeftSec = 0;
  private jamStarted = false;

  constructor(private readonly plan: TripPlan) {
    this.driveSec = plan.startEtaSec;
  }

  get done(): boolean {
    return this.driveSec === 0 && this.jamLeftSec === 0;
  }

  /** 시뮬레이션 시간을 stepSec만큼 진행하고 그 시점의 텔레메트리를 돌려준다 */
  advance(stepSec: number): TripPoint {
    let speedKmh = this.plan.cruiseKmh;
    if (this.jamLeftSec > 0) {
      this.jamLeftSec = Math.max(0, this.jamLeftSec - stepSec);
      speedKmh = 5;
    } else {
      const before = this.driveSec;
      this.driveSec = Math.max(0, this.driveSec - stepSec);
      const jam = this.plan.jam;
      if (jam && !this.jamStarted && before > jam.atEtaSec && this.driveSec <= jam.atEtaSec) {
        this.jamStarted = true;
        this.driveSec = jam.atEtaSec;
        this.jamLeftSec = jam.addSec;
        speedKmh = 5;
      }
    }
    const etaSec = this.driveSec + this.jamLeftSec;
    if (etaSec === 0) speedKmh = 5;

    const p = 1 - this.driveSec / this.plan.startEtaSec;
    return {
      lat: this.plan.from.lat + (this.plan.to.lat - this.plan.from.lat) * p,
      lng: this.plan.from.lng + (this.plan.to.lng - this.plan.from.lng) * p,
      etaSec,
      speedKmh,
    };
  }
}
