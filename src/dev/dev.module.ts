import { Module } from '@nestjs/common';
import { ChannelsModule } from '../channels/channels.module';
import { OrdersModule } from '../orders/orders.module';
import { TimingModule } from '../timing/timing.module';
import { DevFixturesService } from './dev-fixtures.service';
import { DevController } from './dev.controller';
import { SimulatorService } from './simulator.service';

@Module({
  imports: [ChannelsModule, OrdersModule, TimingModule],
  controllers: [DevController],
  providers: [SimulatorService, DevFixturesService],
})
export class DevModule {}
