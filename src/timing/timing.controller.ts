import { Body, Controller, Get, HttpCode, Param, ParseUUIDPipe, Post } from '@nestjs/common';
import { ApiBearerAuth, ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import { CurrentDriver, RequireRole } from '../auth/auth.decorators';
import { OrderResponse } from '../orders/orders.response.dto';
import { DriverPrincipal } from '../auth/auth.types';
import { TelemetryDto } from './timing.dto';
import { AlternativeResponse, TelemetryResponse } from './timing.response.dto';
import { TimingService } from './timing.service';

@ApiTags('timing')
@ApiBearerAuth('driver')
@Controller('orders/:id')
@RequireRole('driver')
export class TimingController {
  constructor(private readonly timing: TimingService) {}

  @Post('telemetry')
  @HttpCode(200)
  @ApiOperation({
    summary: '텔레메트리 (5~10초 간격)',
    description:
      'NaviHelper ETA·위치·속도·기어. etaSec이 없으면 서버가 위치·속도로 추정한다. 받을 때마다 전송 시점을 평가하고, DT 차로 지오펜스에 15km/h 이하로 들어오면 차로 진입으로 처리한다.',
  })
  @ApiOkResponse({ type: TelemetryResponse })
  telemetry(@CurrentDriver() driver: DriverPrincipal, @Param('id', ParseUUIDPipe) id: string, @Body() dto: TelemetryDto) {
    return this.timing.ingest(driver, id, dto);
  }

  @Post('lane-entered')
  @HttpCode(200)
  @ApiOperation({ summary: 'DT 차로 진입', description: '아직 전송 전이면 즉시 전송한다.' })
  @ApiOkResponse({ type: OrderResponse })
  laneEntered(@CurrentDriver() driver: DriverPrincipal, @Param('id', ParseUUIDPipe) id: string) {
    return this.timing.laneEntered(driver, id);
  }

  @Get('alternatives')
  @ApiOperation({ summary: '더 빨리 받을 수 있는 매장', description: '지금 매장보다 ETA + 대기줄 시간이 짧은 매장만, 빠른 순.' })
  @ApiOkResponse({ type: AlternativeResponse, isArray: true })
  alternatives(@CurrentDriver() driver: DriverPrincipal, @Param('id', ParseUUIDPipe) id: string) {
    return this.timing.alternatives(driver, id);
  }
}
