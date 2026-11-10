import { Body, Controller, Get, HttpCode, Param, ParseUUIDPipe, Patch, Post } from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiConflictResponse,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';
import { CurrentStaff, RequireRole } from '../auth/auth.decorators';
import { StaffPrincipal } from '../auth/auth.types';
import { CancelDecisionDto, RejectOrderDto, StoreCancelDto } from '../orders/orders.dto';
import { OrderResponse } from '../orders/orders.response.dto';
import { OrdersService } from '../orders/orders.service';
import { PickupDto, UpdateMenuAvailabilityDto, UpdateStoreSettingsDto } from './store-dashboard.dto';
import { StoreMenuItemResponse, StoreOverviewResponse, StoreSettingsResponse } from './store-dashboard.response.dto';
import { StoreDashboardService } from './store-dashboard.service';

@ApiTags('store-dashboard')
@ApiBearerAuth('staff')
@ApiConflictResponse({ description: '지금 상태에서 할 수 없는 동작' })
@Controller('store')
@RequireRole('staff')
export class StoreDashboardController {
  constructor(
    private readonly dashboard: StoreDashboardService,
    private readonly orders: OrdersService,
  ) {}

  @Get()
  @ApiOperation({ summary: '매장 개요 (설정, DT 대기)' })
  @ApiOkResponse({ type: StoreOverviewResponse })
  overview(@CurrentStaff() staff: StaffPrincipal) {
    return this.dashboard.overview(staff.storeId);
  }

  @Get('orders')
  @ApiOperation({ summary: '진행 중 주문', description: '매장 확인 중·제조 대기·제조 중·준비 완료·취소 확인 중. 예상 수령이 빠른 순.' })
  @ApiOkResponse({ type: OrderResponse, isArray: true })
  list(@CurrentStaff() staff: StaffPrincipal) {
    return this.dashboard.activeOrders(staff.storeId);
  }

  @Post('orders/:id/accept')
  @HttpCode(200)
  @ApiOperation({ summary: '수락', description: '매장 확인 중 → 제조 대기' })
  @ApiOkResponse({ type: OrderResponse })
  async accept(@CurrentStaff() staff: StaffPrincipal, @Param('id', ParseUUIDPipe) id: string) {
    return this.orders.view(await this.orders.accept(staff.storeId, id));
  }

  @Post('orders/:id/reject')
  @HttpCode(200)
  @ApiOperation({ summary: '거절', description: '매장 확인 중 → 거절. 결제 승인을 취소한다.' })
  @ApiOkResponse({ type: OrderResponse })
  async reject(@CurrentStaff() staff: StaffPrincipal, @Param('id', ParseUUIDPipe) id: string, @Body() dto: RejectOrderDto) {
    return this.orders.view(await this.orders.reject(staff.storeId, id, dto.reason, dto.note));
  }

  @Post('orders/:id/start')
  @HttpCode(200)
  @ApiOperation({
    summary: '제조 시작',
    description: '제조 대기 → 제조 중. 시작 시점은 직원이 정한다(timing.recommendedStartAt 참고). 이때의 예상 수령을 이후 지연의 기준으로 고정한다.',
  })
  @ApiOkResponse({ type: OrderResponse })
  async start(@CurrentStaff() staff: StaffPrincipal, @Param('id', ParseUUIDPipe) id: string) {
    return this.orders.view(await this.orders.startPreparing(staff.storeId, id));
  }

  @Post('orders/:id/ready')
  @HttpCode(200)
  @ApiOperation({ summary: '준비 완료', description: '제조 중 → 준비 완료' })
  @ApiOkResponse({ type: OrderResponse })
  async ready(@CurrentStaff() staff: StaffPrincipal, @Param('id', ParseUUIDPipe) id: string) {
    return this.orders.view(await this.orders.markReady(staff.storeId, id));
  }

  @Post('orders/:id/pickup')
  @HttpCode(200)
  @ApiOperation({ summary: '수령 완료', description: '준비 완료 → 수령 완료. 직원이 창구에서 확인한 뒤 누른다. 결제를 확정한다.' })
  @ApiOkResponse({ type: OrderResponse })
  async pickup(@CurrentStaff() staff: StaffPrincipal, @Param('id', ParseUUIDPipe) id: string) {
    return this.orders.view(await this.orders.pickup(staff.storeId, id));
  }

  @Post('orders/:id/lane-entered')
  @HttpCode(200)
  @ApiOperation({ summary: 'DT 차로 진입 확인', description: '직원이 차량을 확인했을 때. 위치·저속만으로는 진입을 확정하지 않는다.' })
  @ApiOkResponse({ type: OrderResponse })
  async laneEntered(@CurrentStaff() staff: StaffPrincipal, @Param('id', ParseUUIDPipe) id: string) {
    return this.orders.view(await this.dashboard.laneEntered(staff.storeId, id));
  }

  @Post('orders/:id/cancel')
  @HttpCode(200)
  @ApiOperation({ summary: '주문 종료', description: '미수령(NO_SHOW)이나 매장 사정(STORE)으로 직원이 주문을 종료한다. 자동으로는 종료하지 않는다.' })
  @ApiOkResponse({ type: OrderResponse })
  async cancel(@CurrentStaff() staff: StaffPrincipal, @Param('id', ParseUUIDPipe) id: string, @Body() dto: StoreCancelDto) {
    return this.orders.view(await this.orders.cancelByStore(staff.storeId, id, dto.reason, dto.note));
  }

  @Post('orders/:id/cancel-request/approve')
  @HttpCode(200)
  @ApiOperation({ summary: '취소 요청 승인', description: '취소 확인 중 → 취소 완료. 결제 승인을 취소한다.' })
  @ApiOkResponse({ type: OrderResponse })
  async approveCancel(
    @CurrentStaff() staff: StaffPrincipal,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: CancelDecisionDto,
  ) {
    return this.orders.view(await this.orders.approveCancel(staff.storeId, id, dto.note));
  }

  @Post('orders/:id/cancel-request/reject')
  @HttpCode(200)
  @ApiOperation({ summary: '취소 요청 거절', description: '취소 확인 중 → 요청 전 상태. 시작한 제조는 그대로 진행한다.' })
  @ApiOkResponse({ type: OrderResponse })
  async rejectCancel(
    @CurrentStaff() staff: StaffPrincipal,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: CancelDecisionDto,
  ) {
    return this.orders.view(await this.orders.rejectCancel(staff.storeId, id, dto.note));
  }

  @Post('pickup')
  @HttpCode(200)
  @ApiOperation({ summary: '차량번호로 찾아 수령 완료', description: '차량번호는 검색 보조. 준비 완료된 주문만 찾는다.' })
  @ApiOkResponse({ type: OrderResponse })
  @ApiNotFoundResponse({ description: '이 차량번호로 준비 완료된 주문이 없음' })
  async pickupByPlate(@CurrentStaff() staff: StaffPrincipal, @Body() dto: PickupDto) {
    return this.orders.view(await this.orders.pickupByPlate(staff.storeId, dto.plateNumber));
  }

  @Patch('settings')
  @ApiOperation({ summary: '매장 설정 변경', description: '준비 시간·입구 이후 시간은 시작 추천 계산에 바로 반영된다.' })
  @ApiOkResponse({ type: StoreSettingsResponse })
  updateSettings(@CurrentStaff() staff: StaffPrincipal, @Body() dto: UpdateStoreSettingsDto) {
    return this.dashboard.updateSettings(staff.storeId, dto);
  }

  @Get('menu')
  @ApiOperation({ summary: '메뉴와 품절 여부' })
  @ApiOkResponse({ type: StoreMenuItemResponse, isArray: true })
  menu(@CurrentStaff() staff: StaffPrincipal) {
    return this.dashboard.menu(staff.storeId);
  }

  @Patch('menu/:menuItemId')
  @ApiOperation({ summary: '품절 설정', description: '품절 메뉴는 견적에 soldOut으로 표시되고, 예약은 409 SOLD_OUT으로 막힌다.' })
  @ApiOkResponse({ type: StoreMenuItemResponse })
  setSoldOut(
    @CurrentStaff() staff: StaffPrincipal,
    @Param('menuItemId', ParseUUIDPipe) menuItemId: string,
    @Body() dto: UpdateMenuAvailabilityDto,
  ) {
    return this.dashboard.setSoldOut(staff.storeId, menuItemId, dto.soldOut);
  }
}
