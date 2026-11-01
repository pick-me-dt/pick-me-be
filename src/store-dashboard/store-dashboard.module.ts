import { Module } from '@nestjs/common';
import { OrdersModule } from '../orders/orders.module';
import { QueueModule } from '../queue/queue.module';
import { TimingModule } from '../timing/timing.module';
import { StoreDashboardController } from './store-dashboard.controller';
import { StoreDashboardService } from './store-dashboard.service';

@Module({
  imports: [OrdersModule, QueueModule, TimingModule],
  controllers: [StoreDashboardController],
  providers: [StoreDashboardService],
})
export class StoreDashboardModule {}
