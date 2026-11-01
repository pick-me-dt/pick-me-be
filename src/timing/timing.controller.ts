import { Body, Controller, Get, HttpCode, Param, ParseUUIDPipe, Post } from '@nestjs/common';
import { CurrentDriver, RequireRole } from '../auth/auth.decorators';
import { DriverPrincipal } from '../auth/auth.types';
import { TelemetryDto } from './timing.dto';
import { TimingService } from './timing.service';

@Controller('orders/:id')
@RequireRole('driver')
export class TimingController {
  constructor(private readonly timing: TimingService) {}

  /** 5~10초 간격으로 ETA·위치·속도를 보낸다 */
  @Post('telemetry')
  @HttpCode(200)
  telemetry(@CurrentDriver() driver: DriverPrincipal, @Param('id', ParseUUIDPipe) id: string, @Body() dto: TelemetryDto) {
    return this.timing.ingest(driver, id, dto);
  }

  @Post('lane-entered')
  @HttpCode(200)
  laneEntered(@CurrentDriver() driver: DriverPrincipal, @Param('id', ParseUUIDPipe) id: string) {
    return this.timing.laneEntered(driver, id);
  }

  @Get('alternatives')
  alternatives(@CurrentDriver() driver: DriverPrincipal, @Param('id', ParseUUIDPipe) id: string) {
    return this.timing.alternatives(driver, id);
  }
}
