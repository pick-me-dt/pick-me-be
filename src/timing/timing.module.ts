import { Module } from '@nestjs/common';
import { ChannelsModule } from '../channels/channels.module';
import { OrdersModule } from '../orders/orders.module';
import { QueueModule } from '../queue/queue.module';
import { TelemetryModule } from './telemetry.module';
import { TimingEngine } from './timing-engine.service';
import { TimingController } from './timing.controller';
import { TimingService } from './timing.service';

@Module({
  imports: [OrdersModule, ChannelsModule, QueueModule, TelemetryModule],
  controllers: [TimingController],
  providers: [TimingEngine, TimingService],
  exports: [TimingEngine, TimingService],
})
export class TimingModule {}
