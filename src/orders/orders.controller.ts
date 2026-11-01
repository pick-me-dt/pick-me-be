import {
  Body,
  Controller,
  Get,
  Headers,
  HttpCode,
  Param,
  ParseBoolPipe,
  ParseUUIDPipe,
  Post,
  Query,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiConflictResponse,
  ApiCreatedResponse,
  ApiHeader,
  ApiOkResponse,
  ApiOperation,
  ApiQuery,
  ApiTags,
} from '@nestjs/swagger';
import { CurrentDriver, RequireRole } from '../auth/auth.decorators';
import { DriverPrincipal } from '../auth/auth.types';
import { CancelOrderDto, ChangeStoreDto, OrderRequestDto, ReserveOrderDto } from './orders.dto';
import { ChangeStoreResponse, OrderResponse, QuoteResponse, ReserveResponse } from './orders.response.dto';
import { OrdersService } from './orders.service';

@ApiTags('orders')
@ApiBearerAuth('driver')
@Controller('orders')
@RequireRole('driver')
export class OrdersController {
  constructor(private readonly orders: OrdersService) {}

  @Post('quote')
  @HttpCode(200)
  @ApiOperation({ summary: '견적', description: '금액, 예상 제조 시간, 음성 재확인 문구. 저장하지 않는다. favoriteId와 items 중 하나를 보낸다.' })
  @ApiOkResponse({ type: QuoteResponse })
  quote(@CurrentDriver() driver: DriverPrincipal, @Body() dto: OrderRequestDto) {
    return this.orders.quote(driver, dto);
  }

  /** 주문 예약. 음성 재시도로 같은 주문이 두 번 들어가지 않도록 Idempotency-Key 헤더를 받는다. */
  @Post()
  @ApiOperation({
    summary: '주문 예약',
    description:
      '음성 결제 꺼짐, 자주 주문 메뉴가 아님, 1회·1일 한도 초과 중 하나라도 해당하는 음성 주문은 NEEDS_CONFIRMATION으로 시작한다. 차량당 진행 중 주문은 1건.',
  })
  @ApiHeader({ name: 'Idempotency-Key', required: false, description: '같은 키로 다시 보내면 처음 만든 주문을 돌려준다' })
  @ApiCreatedResponse({ type: ReserveResponse })
  @ApiConflictResponse({ description: '진행 중인 주문이 있음' })
  reserve(
    @CurrentDriver() driver: DriverPrincipal,
    @Body() dto: ReserveOrderDto,
    @Headers('idempotency-key') idempotencyKey?: string,
  ) {
    return this.orders.reserve(driver, dto, idempotencyKey);
  }

  @Get()
  @ApiOperation({ summary: '내 주문 목록 (최근 20건)' })
  @ApiQuery({ name: 'active', required: false, type: Boolean, description: 'true면 진행 중 주문만' })
  @ApiOkResponse({ type: OrderResponse, isArray: true })
  list(
    @CurrentDriver() driver: DriverPrincipal,
    @Query('active', new ParseBoolPipe({ optional: true })) active?: boolean,
  ) {
    return this.orders.list(driver, active ?? false);
  }

  @Get(':id')
  @ApiOperation({ summary: '주문 조회' })
  @ApiOkResponse({ type: OrderResponse })
  get(@CurrentDriver() driver: DriverPrincipal, @Param('id', ParseUUIDPipe) id: string) {
    return this.orders.get(driver, id);
  }

  @Post(':id/confirm')
  @HttpCode(200)
  @ApiOperation({ summary: '정차 중 확인', description: 'NEEDS_CONFIRMATION → RESERVED. 정차 여부는 차량 앱이 Vehicle SDK로 확인한 뒤 호출한다.' })
  @ApiOkResponse({ type: OrderResponse })
  @ApiConflictResponse({ description: '확인 대기 상태가 아님' })
  confirm(@CurrentDriver() driver: DriverPrincipal, @Param('id', ParseUUIDPipe) id: string) {
    return this.orders.confirm(driver, id);
  }

  @Post(':id/cancel')
  @HttpCode(200)
  @ApiOperation({ summary: '주문 취소', description: '매장에 전송된 주문이면 매장 취소와 결제 승인 취소를 함께 한다.' })
  @ApiOkResponse({ type: OrderResponse })
  cancel(@CurrentDriver() driver: DriverPrincipal, @Param('id', ParseUUIDPipe) id: string, @Body() dto: CancelOrderDto) {
    return this.orders.cancelByDriver(driver, id, dto.reason);
  }

  @Post(':id/change-store')
  @HttpCode(200)
  @ApiOperation({ summary: '매장 변경 (DT 대기줄 회피)', description: '매장에 전송되기 전에만 바꿀 수 있다.' })
  @ApiOkResponse({ type: ChangeStoreResponse })
  changeStore(
    @CurrentDriver() driver: DriverPrincipal,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: ChangeStoreDto,
  ) {
    return this.orders.changeStore(driver, id, dto.storeId);
  }
}
