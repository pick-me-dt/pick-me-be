import { Module } from '@nestjs/common';
import { StoreGateway, VehicleGateway } from './realtime.gateway';
import { RealtimeService } from './realtime.service';

@Module({
  providers: [StoreGateway, VehicleGateway, RealtimeService],
})
export class RealtimeModule {}
