import { Module } from '@nestjs/common';
import { ChannelsService } from './channels.service';
import { MockDtAdapter } from './mock-dt/mock-dt.adapter';

@Module({
  providers: [ChannelsService, MockDtAdapter],
  exports: [ChannelsService, MockDtAdapter],
})
export class ChannelsModule {}
