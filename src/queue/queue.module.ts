import { Module } from '@nestjs/common';
import { ChannelsModule } from '../channels/channels.module';
import { QueueService } from './queue.service';

@Module({
  imports: [ChannelsModule],
  providers: [QueueService],
  exports: [QueueService],
})
export class QueueModule {}
