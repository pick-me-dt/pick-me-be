import { Body, Controller, Get, Headers, HttpCode, Param, ParseBoolPipe, ParseUUIDPipe, Post, Query } from '@nestjs/common';
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
import { CancelOrderDto, OrderRequestDto, ReserveOrderDto } from './orders.dto';
import { OrderResponse, QuoteResponse, ReserveConflictResponse, ReserveResponse } from './orders.response.dto';
import { OrdersService } from './orders.service';

@ApiTags('orders')
@ApiBearerAuth('driver')
@Controller('orders')
@RequireRole('driver')
export class OrdersController {
  constructor(private readonly orders: OrdersService) {}

  @Post('quote')
  @HttpCode(200)
  @ApiOperation({
    summary: '견적',
    description: "'이 메뉴로 예약' 전에 금액·품절·준비 시간을 확인한다. 저장하지 않는다. favoriteId와 items 중 하나를 보낸다.",
  })
  @ApiOkResponse({ type: QuoteResponse })
  quote(@CurrentDriver() driver: DriverPrincipal, @Body() dto: OrderRequestDto) {
    return this.orders.quote(driver, dto);
  }

  @Post()
  @ApiOperation({
    summary: '예약 확정',
    description:
      '바로 매장에 공유하고 매장 확인 중(PENDING_ACCEPT)이 된다. 목업 결제 승인을 건다. 품절이면 409 SOLD_OUT, expectedTotal과 금액이 다르면 409 PRICE_CHANGED로 새 견적을 돌려준다. 차량당 진행 중 주문은 1건.',
  })
  @ApiHeader({ name: 'Idempotency-Key', required: false, description: '같은 키로 다시 보내면 처음 만든 주문을 돌려준다' })
  @ApiCreatedResponse({ type: ReserveResponse })
  @ApiConflictResponse({ type: ReserveConflictResponse, description: 'ACTIVE_ORDER_EXISTS · SOLD_OUT · PRICE_CHANGED' })
  reserve(
    @CurrentDriver() driver: DriverPrincipal,
    @Body() dto: ReserveOrderDto,
    @Headers('idempotency-key') idempotencyKey?: string,
  ) {
    return this.orders.reserve(driver, dto, idempotencyKey);
  }

  @Get()
  @ApiOperation({ summary: '내 주문 목록 (최근 20건)', description: '재연결 후에는 active=true로 진행 중 주문의 서버 상태를 다시 맞춘다.' })
  @ApiQuery({ name: 'active', required: false, type: Boolean, description: 'true면 진행 중 주문만' })
  @ApiOkResponse({ type: OrderResponse, isArray: true })
  list(
    @CurrentDriver() driver: DriverPrincipal,
    @Query('active', new ParseBoolPipe({ optional: true })) active?: boolean,
  ) {
    return this.orders.list(driver, active ?? false);
  }

  @Get(':id')
  @ApiOperation({ summary: '주문 조회', description: '매장 응답이 늦을 때(acceptOverdue) 다시 조회해 상태를 확인한다.' })
  @ApiOkResponse({ type: OrderResponse })
  get(@CurrentDriver() driver: DriverPrincipal, @Param('id', ParseUUIDPipe) id: string) {
    return this.orders.get(driver, id);
  }

  @Post(':id/cancel')
  @HttpCode(200)
  @ApiOperation({
    summary: '취소 요청',
    description:
      '매장 확인 중이면 바로 취소(CANCELLED). 직원이 수락한 뒤면 취소 확인 중(CANCEL_REQUESTED)이 되고, 매장이 승인하면 CANCELLED, 거절하면 원래 상태로 돌아간다. 승인 전에는 취소 완료로 표시하지 않는다.',
  })
  @ApiOkResponse({ type: OrderResponse })
  @ApiConflictResponse({ description: '이미 끝났거나 취소 확인 중인 주문' })
  cancel(@CurrentDriver() driver: DriverPrincipal, @Param('id', ParseUUIDPipe) id: string, @Body() dto: CancelOrderDto) {
    return this.orders.cancelByDriver(driver, id, dto.reason);
  }
}
