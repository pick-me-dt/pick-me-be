import { Body, Controller, Delete, Get, HttpCode, Param, ParseUUIDPipe, Post, UseGuards } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { MockDtAdapter } from '../channels/mock-dt/mock-dt.adapter';
import { OrdersService } from '../orders/orders.service';
import { ACTIVE_STATUSES } from '../orders/order-state';
import { TokenService } from '../auth/token.service';
import { PrismaService } from '../prisma/prisma.service';
import { seed, SEED } from '../seed/seed';
import { DevRoutesGuard } from './dev.guard';
import { DevFixturesService } from './dev-fixtures.service';
import { DemoRunDto, RelocateStoresDto, SetQueueDto, SimulateTripDto } from './dev.dto';
import { SimulatorService } from './simulator.service';

/** 개발·시연용. ENABLE_DEV_ROUTES=true일 때만 열린다 */
@ApiTags('dev')
@Controller('dev')
@UseGuards(DevRoutesGuard)
export class DevController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly mockDt: MockDtAdapter,
    private readonly simulator: SimulatorService,
    private readonly orders: OrdersService,
    private readonly tokens: TokenService,
    private readonly fixtures: DevFixturesService,
  ) {}

  @Post('tokens')
  @HttpCode(200)
  @ApiOperation({ summary: '시드 계정 토큰 발급', description: '시연 차량 운전자 토큰과 매장별 직원 토큰. Swagger Authorize나 Postman에 바로 넣어 쓴다.' })
  tokensForSeed() {
    return this.fixtures.tokensForSeed();
  }

  @Post('reset')
  @HttpCode(200)
  @ApiOperation({ summary: '목데이터 초기화', description: '진행 중 주문 취소, 시뮬레이션 중지, 목업 DT 대기 초기화, 시드 데이터(매장 위치 포함) 복구.' })
  reset() {
    return this.fixtures.reset();
  }

  @Post('stores/relocate')
  @HttpCode(200)
  @ApiOperation({
    summary: '시드 매장을 내 위치 근처로 옮기기',
    description: '에뮬레이터 GPS가 한국이 아니어도 매장 검색이 되도록, 기준점 북쪽 0.8km · 2.5km · 5km에 매장 3곳을 둔다. reset으로 원래 위치로 돌아간다.',
  })
  relocateStores(@Body() dto: RelocateStoresDto) {
    return this.fixtures.relocateStores(dto.lat, dto.lng);
  }

  @Post('orders/:id/advance')
  @HttpCode(200)
  @ApiOperation({
    summary: '주문을 다음 단계로',
    description: 'NEEDS_CONFIRMATION → RESERVED → SENT → PREPARING → READY → PICKED_UP. 매장 대시보드 없이 차량 앱 상태 화면을 확인할 때.',
  })
  advance(@Param('id', ParseUUIDPipe) id: string) {
    return this.fixtures.advance(id);
  }

  @Post('seed')
  @HttpCode(200)
  @ApiOperation({ summary: '시드 데이터 다시 넣기' })
  async seed() {
    await seed(this.prisma);
    return { ok: true };
  }

  @Post('mock-dt/stores/:id/queue')
  @HttpCode(200)
  @ApiOperation({ summary: '목업 DT 대기 차량 수 설정' })
  setQueue(@Param('id', ParseUUIDPipe) storeId: string, @Body() dto: SetQueueDto) {
    this.mockDt.setQueue(storeId, dto.cars);
    return { storeId, cars: dto.cars };
  }

  @Post('simulate/trip')
  @HttpCode(200)
  @ApiOperation({ summary: '기존 주문에 주행 시뮬레이션 시작' })
  simulateTrip(@Body() dto: SimulateTripDto) {
    const { orderId, ...options } = dto;
    return this.simulator.start(orderId, options);
  }

  @Get('simulate')
  @ApiOperation({ summary: '실행 중 시뮬레이션' })
  running() {
    return this.simulator.list();
  }

  @Delete('simulate/:orderId')
  @ApiOperation({ summary: '시뮬레이션 중지' })
  stop(@Param('orderId', ParseUUIDPipe) orderId: string) {
    return { stopped: this.simulator.stop(orderId) };
  }

  /**
   * 시연 한 번에 실행: 시연 차량의 진행 중 주문을 정리하고, "평소 그거"를 음성으로 주문한 뒤 주행을 시작한다.
   * 기본값은 10분 거리, 10배속, 매장 대기 0대. 이때 주문은 도착 2분쯤 전에 매장으로 전송되므로,
   * 지연 알림이 보이도록 전송 뒤인 도착 40초 전 지점에 5분 정체를 넣는다.
   * 엔진은 실제 시계로 지연을 재므로, 배속 중에는 표시되는 지연이 정체 시간보다 짧다.
   */
  @Post('demo-run')
  @HttpCode(200)
  @ApiOperation({
    summary: '시연 한 번에 실행',
    description: '시연 차량이 "평소 그거"를 음성 주문하고 주행을 시작한다. 주행 → 전송 → 정체 지연 → 차로 진입 → (autoStore면) 준비 완료.',
  })
  async demoRun(@Body() dto: DemoRunDto) {
    await seed(this.prisma);
    const stale = await this.prisma.order.findMany({ where: { vehicleId: SEED.vehicleId, status: { in: ACTIVE_STATUSES } } });
    for (const o of stale) await this.orders.cancel(o.id, 'USER', 'demo-run');

    const driver = { role: 'driver' as const, userId: SEED.userId, vehicleId: SEED.vehicleId };
    const { storeId = SEED.stores.pangyo, queueCars = 0, ...trip } = dto;
    this.mockDt.setQueue(storeId, queueCars);
    const reserved = await this.orders.reserve(driver, { storeId, source: 'VOICE', favoriteId: SEED.favoriteId });
    const simulation = await this.simulator.start(reserved.order.id, {
      jam: { atEtaSec: 40, addSec: 300 },
      ...trip,
    });
    return { order: reserved.order, tts: reserved.tts, simulation, driverToken: this.tokens.sign(driver) };
  }
}
