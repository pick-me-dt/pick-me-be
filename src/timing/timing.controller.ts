import { Body, Controller, HttpCode, Param, ParseUUIDPipe, Post } from '@nestjs/common';
import { ApiBearerAuth, ApiConflictResponse, ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import { CurrentDriver, RequireRole } from '../auth/auth.decorators';
import { DriverPrincipal } from '../auth/auth.types';
import { OrderResponse } from '../orders/orders.response.dto';
import { TelemetryDto } from './timing.dto';
import { TelemetryResponse } from './timing.response.dto';
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
    summary: 'ETA 갱신 (30초마다)',
    description:
      'NaviHelper의 매장 입구까지 남은 시간(etaSec, 필수). 받을 때마다 예상 수령·시작 추천을 다시 계산해 차량·매장에 eta.updated로 보낸다. 90초 넘게 오지 않으면 timing.etaStale이 true가 된다. 끝난 주문이면 저장하지 않고 현재 상태만 돌려준다.',
  })
  @ApiOkResponse({ type: TelemetryResponse })
  telemetry(@CurrentDriver() driver: DriverPrincipal, @Param('id', ParseUUIDPipe) id: string, @Body() dto: TelemetryDto) {
    return this.timing.ingest(driver, id, dto);
  }

  @Post('lane-entered')
  @HttpCode(200)
  @ApiOperation({
    summary: 'DT 차로 진입 알림',
    description: '운전자가 진입을 확인했을 때 보낸다. 서버는 위치·저속만으로 진입을 확정하지 않는다. 이후 예상 수령은 진입 시각 + 입구 이후 시간.',
  })
  @ApiOkResponse({ type: OrderResponse })
  @ApiConflictResponse({ description: '끝난 주문' })
  laneEntered(@CurrentDriver() driver: DriverPrincipal, @Param('id', ParseUUIDPipe) id: string) {
    return this.timing.laneEntered(driver, id);
  }
}
