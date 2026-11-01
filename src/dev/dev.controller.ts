import { Body, Controller, Delete, Get, HttpCode, Param, ParseUUIDPipe, Post, UseGuards } from '@nestjs/common';
import { MockDtAdapter } from '../channels/mock-dt/mock-dt.adapter';
import { OrdersService } from '../orders/orders.service';
import { ACTIVE_STATUSES } from '../orders/order-state';
import { TokenService } from '../auth/token.service';
import { PrismaService } from '../prisma/prisma.service';
import { seed, SEED } from '../seed/seed';
import { DevRoutesGuard } from './dev.guard';
import { DemoRunDto, SetQueueDto, SimulateTripDto } from './dev.dto';
import { SimulatorService } from './simulator.service';

/** 개발·시연용. ENABLE_DEV_ROUTES=true일 때만 열린다 */
@Controller('dev')
@UseGuards(DevRoutesGuard)
export class DevController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly mockDt: MockDtAdapter,
    private readonly simulator: SimulatorService,
    private readonly orders: OrdersService,
    private readonly tokens: TokenService,
  ) {}

  @Post('seed')
  @HttpCode(200)
  async seed() {
    await seed(this.prisma);
    return { ok: true };
  }

  @Post('mock-dt/stores/:id/queue')
  @HttpCode(200)
  setQueue(@Param('id', ParseUUIDPipe) storeId: string, @Body() dto: SetQueueDto) {
    this.mockDt.setQueue(storeId, dto.cars);
    return { storeId, cars: dto.cars };
  }

  @Post('simulate/trip')
  @HttpCode(200)
  simulateTrip(@Body() dto: SimulateTripDto) {
    const { orderId, ...options } = dto;
    return this.simulator.start(orderId, options);
  }

  @Get('simulate')
  running() {
    return this.simulator.list();
  }

  @Delete('simulate/:orderId')
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
