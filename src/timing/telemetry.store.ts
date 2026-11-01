import { Injectable } from '@nestjs/common';
import { TelemetrySource } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';

export interface LatestTelemetry {
  etaSec: number;
  lat: number;
  lng: number;
  speedKmh: number;
  source: TelemetrySource;
  /** 서버가 받은 시각(ms). 차량 시계와 무관하게 경과 시간을 잰다 */
  receivedAt: number;
}

/** 주문별 최신 텔레메트리. 메모리에 두고, 재시작 후에는 DB 마지막 기록에서 복구한다 */
@Injectable()
export class TelemetryStore {
  private readonly latestByOrder = new Map<string, LatestTelemetry>();

  constructor(private readonly prisma: PrismaService) {}

  async save(
    orderId: string,
    t: Omit<LatestTelemetry, 'receivedAt'> & { gear?: string; recordedAt?: Date },
    receivedAt = Date.now(),
  ) {
    const latest: LatestTelemetry = { etaSec: t.etaSec, lat: t.lat, lng: t.lng, speedKmh: t.speedKmh, source: t.source, receivedAt };
    this.latestByOrder.set(orderId, latest);
    await this.prisma.telemetry.create({
      data: {
        orderId,
        etaSec: t.etaSec,
        lat: t.lat,
        lng: t.lng,
        speedKmh: t.speedKmh,
        gear: t.gear,
        source: t.source,
        recordedAt: t.recordedAt ?? new Date(receivedAt),
      },
    });
    return latest;
  }

  async latest(orderId: string): Promise<LatestTelemetry | undefined> {
    const cached = this.latestByOrder.get(orderId);
    if (cached) return cached;
    const row = await this.prisma.telemetry.findFirst({ where: { orderId }, orderBy: { recordedAt: 'desc' } });
    if (!row || row.etaSec === null) return undefined;
    const restored: LatestTelemetry = {
      etaSec: row.etaSec,
      lat: row.lat,
      lng: row.lng,
      speedKmh: row.speedKmh,
      source: row.source,
      receivedAt: row.recordedAt.getTime(),
    };
    this.latestByOrder.set(orderId, restored);
    return restored;
  }

  forget(orderId: string) {
    this.latestByOrder.delete(orderId);
  }
}
