import { Injectable } from '@nestjs/common';
import { ChannelType, Store } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { ChannelAdapter } from './channel-adapter';
import { MockDtAdapter } from './mock-dt/mock-dt.adapter';

/** 브랜드의 채널 유형에 맞는 어댑터를 고른다. */
@Injectable()
export class ChannelsService {
  private readonly adapters: Record<ChannelType, ChannelAdapter>;

  constructor(
    private readonly prisma: PrismaService,
    mockDt: MockDtAdapter,
  ) {
    this.adapters = { MOCK_DT: mockDt };
  }

  async forStore(store: Store): Promise<ChannelAdapter> {
    const brand = await this.prisma.brand.findUniqueOrThrow({ where: { id: store.brandId } });
    return this.adapters[brand.channelType];
  }
}
