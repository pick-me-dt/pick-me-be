import { Body, Controller, Get, HttpCode, Param, ParseUUIDPipe, Patch, Post } from '@nestjs/common';
import { ApiBearerAuth, ApiNotFoundResponse, ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import { CurrentStaff, RequireRole } from '../auth/auth.decorators';
import { OrderResponse } from '../orders/orders.response.dto';
import { StaffPrincipal } from '../auth/auth.types';
import { PickupDto, UpdateStoreOrderDto, UpdateStoreSettingsDto } from './store-dashboard.dto';
import { StoreOrderResponse, StoreOverviewResponse, StoreSettingsResponse } from './store-dashboard.response.dto';
import { StoreDashboardService } from './store-dashboard.service';

@ApiTags('store-dashboard')
@ApiBearerAuth('staff')
@Controller('store')
@RequireRole('staff')
export class StoreDashboardController {
  constructor(private readonly dashboard: StoreDashboardService) {}

  @Get()
  @ApiOperation({ summary: '매장 개요 (DT 대기, 설정)' })
  @ApiOkResponse({ type: StoreOverviewResponse })
  overview(@CurrentStaff() staff: StaffPrincipal) {
    return this.dashboard.overview(staff.storeId);
  }

  @Get('orders')
  @ApiOperation({ summary: '전송된 진행 중 주문', description: '도착 예정 시각이 빠른 순.' })
  @ApiOkResponse({ type: StoreOrderResponse, isArray: true })
  orders(@CurrentStaff() staff: StaffPrincipal) {
    return this.dashboard.activeOrders(staff.storeId);
  }

  @Patch('orders/:id')
  @ApiOperation({ summary: '주문 상태 변경' })
  @ApiOkResponse({ type: OrderResponse })
  updateOrder(
    @CurrentStaff() staff: StaffPrincipal,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateStoreOrderDto,
  ) {
    return this.dashboard.updateOrder(staff.storeId, id, dto);
  }

  @Post('pickup')
  @HttpCode(200)
  @ApiOperation({ summary: '차량번호로 수령 처리', description: '결제를 확정한다.' })
  @ApiOkResponse({ type: OrderResponse })
  @ApiNotFoundResponse({ description: '이 차량번호로 준비 중인 주문이 없음' })
  pickup(@CurrentStaff() staff: StaffPrincipal, @Body() dto: PickupDto) {
    return this.dashboard.pickup(staff.storeId, dto.plateNumber);
  }

  @Patch('settings')
  @ApiOperation({ summary: '매장 설정 변경' })
  @ApiOkResponse({ type: StoreSettingsResponse })
  updateSettings(@CurrentStaff() staff: StaffPrincipal, @Body() dto: UpdateStoreSettingsDto) {
    return this.dashboard.updateSettings(staff.storeId, dto);
  }
}
