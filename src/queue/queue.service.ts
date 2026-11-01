import { Injectable } from '@nestjs/common';
import { Store } from '@prisma/client';
import { ChannelsService } from '../channels/channels.service';
import { PrismaService } from '../prisma/prisma.service';
import { queueWaitSec } from '../timing/estimators';

export interface QueueInfo {
  cars: number;
  waitSec: number;
}

@Injectable()
export class QueueService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly channels: ChannelsService,
  ) {}

  async forStore(store: Store): Promise<QueueInfo> {
    const channel = await this.channels.forStore(store);
    const { cars } = await channel.getQueue(store);
    return { cars, waitSec: queueWaitSec(cars, store.serviceSecPerCar) };
  }

  /** DT 차로 진입 기록. 수령 시각은 주문 수령 처리에서 채운다 */
  async recordLaneEntry(orderId: string, storeId: string, at: Date) {
    await this.prisma.dtVisit.upsert({
      where: { orderId },
      update: {},
      create: { orderId, storeId, laneEnteredAt: at },
    });
  }
}
