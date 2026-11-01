import { Module } from '@nestjs/common';
import { ChannelsModule } from '../channels/channels.module';
import { OrdersModule } from '../orders/orders.module';
import { QueueModule } from '../queue/queue.module';
import { TelemetryStore } from './telemetry.store';
import { TimingEngine } from './timing-engine.service';
import { TimingController } from './timing.controller';
import { TimingService } from './timing.service';

@Module({
  imports: [OrdersModule, ChannelsModule, QueueModule],
  controllers: [TimingController],
  providers: [TimingEngine, TimingService, TelemetryStore],
  exports: [TimingEngine, TimingService, TelemetryStore],
})
export class TimingModule {}
