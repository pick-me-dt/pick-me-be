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
import { CurrentDriver, RequireRole } from '../auth/auth.decorators';
import { DriverPrincipal } from '../auth/auth.types';
import { CancelOrderDto, OrderRequestDto, ReserveOrderDto } from './orders.dto';
import { OrdersService } from './orders.service';

@Controller('orders')
@RequireRole('driver')
export class OrdersController {
  constructor(private readonly orders: OrdersService) {}

  @Post('quote')
  @HttpCode(200)
  quote(@CurrentDriver() driver: DriverPrincipal, @Body() dto: OrderRequestDto) {
    return this.orders.quote(driver, dto);
  }

  /** 주문 예약. 음성 재시도로 같은 주문이 두 번 들어가지 않도록 Idempotency-Key 헤더를 받는다. */
  @Post()
  reserve(
    @CurrentDriver() driver: DriverPrincipal,
    @Body() dto: ReserveOrderDto,
    @Headers('idempotency-key') idempotencyKey?: string,
  ) {
    return this.orders.reserve(driver, dto, idempotencyKey);
  }

  @Get()
  list(
    @CurrentDriver() driver: DriverPrincipal,
    @Query('active', new ParseBoolPipe({ optional: true })) active?: boolean,
  ) {
    return this.orders.list(driver, active ?? false);
  }

  @Get(':id')
  get(@CurrentDriver() driver: DriverPrincipal, @Param('id', ParseUUIDPipe) id: string) {
    return this.orders.get(driver, id);
  }

  @Post(':id/confirm')
  @HttpCode(200)
  confirm(@CurrentDriver() driver: DriverPrincipal, @Param('id', ParseUUIDPipe) id: string) {
    return this.orders.confirm(driver, id);
  }

  @Post(':id/cancel')
  @HttpCode(200)
  cancel(@CurrentDriver() driver: DriverPrincipal, @Param('id', ParseUUIDPipe) id: string, @Body() dto: CancelOrderDto) {
    return this.orders.cancelByDriver(driver, id, dto.reason);
  }
}
