import { Body, Controller, Get, HttpCode, Param, ParseUUIDPipe, Patch, Post } from '@nestjs/common';
import { CurrentStaff, RequireRole } from '../auth/auth.decorators';
import { StaffPrincipal } from '../auth/auth.types';
import { PickupDto, UpdateStoreOrderDto, UpdateStoreSettingsDto } from './store-dashboard.dto';
import { StoreDashboardService } from './store-dashboard.service';

@Controller('store')
@RequireRole('staff')
export class StoreDashboardController {
  constructor(private readonly dashboard: StoreDashboardService) {}

  @Get()
  overview(@CurrentStaff() staff: StaffPrincipal) {
    return this.dashboard.overview(staff.storeId);
  }

  @Get('orders')
  orders(@CurrentStaff() staff: StaffPrincipal) {
    return this.dashboard.activeOrders(staff.storeId);
  }

  @Patch('orders/:id')
  updateOrder(
    @CurrentStaff() staff: StaffPrincipal,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateStoreOrderDto,
  ) {
    return this.dashboard.updateOrder(staff.storeId, id, dto);
  }

  /** 창구에서 차량번호로 수령 처리 */
  @Post('pickup')
  @HttpCode(200)
  pickup(@CurrentStaff() staff: StaffPrincipal, @Body() dto: PickupDto) {
    return this.dashboard.pickup(staff.storeId, dto.plateNumber);
  }

  @Patch('settings')
  updateSettings(@CurrentStaff() staff: StaffPrincipal, @Body() dto: UpdateStoreSettingsDto) {
    return this.dashboard.updateSettings(staff.storeId, dto);
  }
}
