import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { EtaSnapshot } from './pickup-timing';

export interface TelemetryInput {
  etaSec: number;
  lat?: number;
  lng?: number;
  speedKmh?: number;
  gear?: string;
  recordedAt?: Date;
}

/** 주문별 최신 ETA. 메모리에 두고, 재시작 후에는 DB 마지막 기록에서 복구한다 */
@Injectable()
export class TelemetryStore {
  private readonly latestByOrder = new Map<string, EtaSnapshot>();

  constructor(private readonly prisma: PrismaService) {}

  async save(orderId: string, t: TelemetryInput, receivedAt = Date.now()): Promise<EtaSnapshot> {
    const latest: EtaSnapshot = { etaSec: t.etaSec, receivedAt };
    this.latestByOrder.set(orderId, latest);
    await this.prisma.telemetry.create({
      data: {
        orderId,
        etaSec: t.etaSec,
        lat: t.lat,
        lng: t.lng,
        speedKmh: t.speedKmh,
        gear: t.gear,
        source: 'NAVI',
        // 경과 시간은 서버가 받은 시각으로 잰다 (차량 시계와 무관)
        recordedAt: new Date(receivedAt),
      },
    });
    return latest;
  }

  async latest(orderId: string): Promise<EtaSnapshot | undefined> {
    const cached = this.latestByOrder.get(orderId);
    if (cached) return cached;
    const row = await this.prisma.telemetry.findFirst({
      where: { orderId, etaSec: { not: null } },
      orderBy: { recordedAt: 'desc' },
    });
    if (!row || row.etaSec === null) return undefined;
    const restored: EtaSnapshot = { etaSec: row.etaSec, receivedAt: row.recordedAt.getTime() };
    this.latestByOrder.set(orderId, restored);
    return restored;
  }

  forget(orderId: string) {
    this.latestByOrder.delete(orderId);
  }
}
