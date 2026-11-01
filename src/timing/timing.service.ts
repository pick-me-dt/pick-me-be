import { Injectable, NotFoundException } from '@nestjs/common';
import { DriverPrincipal } from '../auth/auth.types';
import { haversineM } from '../common/geo';
import { toOrderView } from '../orders/order-view';
import { PrismaService } from '../prisma/prisma.service';
import { fallbackEtaSec } from './estimators';
import { TelemetryStore } from './telemetry.store';
import { TimingEngine } from './timing-engine.service';
import { TelemetryDto } from './timing.dto';

/** 차로 진입으로 보는 최대 속도(km/h) */
const LANE_SPEED_KMH = 15;

@Injectable()
export class TimingService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly telemetry: TelemetryStore,
    private readonly engine: TimingEngine,
  ) {}

  /**
   * 차량 텔레메트리를 받아 저장하고 바로 평가한다.
   * 응답에 현재 주문 상태를 실어, WebSocket 이벤트를 놓친 차량 앱이 상태를 맞출 수 있게 한다.
   */
  async ingest(driver: DriverPrincipal, orderId: string, dto: TelemetryDto) {
    const order = await this.findOwnOrder(driver, orderId);
    const distanceM = haversineM(dto, order.store);
    const etaSec = dto.etaSec ?? fallbackEtaSec(distanceM, dto.speedKmh);
    await this.telemetry.save(orderId, {
      etaSec,
      lat: dto.lat,
      lng: dto.lng,
      speedKmh: dto.speedKmh,
      gear: dto.gear,
      source: dto.etaSec === undefined ? 'FUSED' : 'NAVI',
      recordedAt: dto.recordedAt,
    });

    // 차량 앱의 지오펜스 감지가 없어도 서버에서 차로 진입을 판단한다
    const inLane = haversineM(dto, { lat: order.store.laneLat, lng: order.store.laneLng }) <= order.store.laneRadiusM;
    if (inLane && dto.speedKmh <= LANE_SPEED_KMH && !order.laneEnteredAt) {
      await this.engine.laneEntered(orderId);
    } else {
      await this.engine.evaluate(orderId);
    }

    const updated = await this.prisma.order.findUniqueOrThrow({ where: { id: orderId }, include: { items: true, store: true } });
    return { etaSec, distanceM: Math.round(distanceM), order: toOrderView(updated) };
  }

  async laneEntered(driver: DriverPrincipal, orderId: string) {
    await this.findOwnOrder(driver, orderId);
    return toOrderView(await this.engine.laneEntered(orderId));
  }

  async alternatives(driver: DriverPrincipal, orderId: string) {
    return this.engine.alternatives(await this.findOwnOrder(driver, orderId));
  }

  private async findOwnOrder(driver: DriverPrincipal, orderId: string) {
    const order = await this.prisma.order.findUnique({ where: { id: orderId }, include: { items: true, store: true } });
    if (!order || order.userId !== driver.userId) throw new NotFoundException('주문을 찾을 수 없습니다');
    return order;
  }
}
