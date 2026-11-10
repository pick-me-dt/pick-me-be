import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { DriverPrincipal } from '../auth/auth.types';
import { ACTIVE_STATUSES } from '../orders/order-state';
import { OrdersService } from '../orders/orders.service';
import { PrismaService } from '../prisma/prisma.service';
import { TelemetryStore } from './telemetry.store';
import { TimingEngine } from './timing-engine.service';
import { TelemetryDto } from './timing.dto';

@Injectable()
export class TimingService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly orders: OrdersService,
    private readonly telemetry: TelemetryStore,
    private readonly engine: TimingEngine,
  ) {}

  /**
   * NaviHelper ETA를 받아 저장하고 예상 수령·시작 추천을 갱신한다.
   * 응답에 현재 주문을 실어, WebSocket 이벤트를 놓친 차량 앱이 상태를 맞출 수 있게 한다.
   */
  async ingest(driver: DriverPrincipal, orderId: string, dto: TelemetryDto) {
    const order = await this.findOwnOrder(driver, orderId);
    if (ACTIVE_STATUSES.includes(order.status)) {
      await this.telemetry.save(orderId, dto);
      await this.engine.onEta(orderId);
    }
    return { order: await this.orders.view(await this.orders.findWithRelations(orderId)) };
  }

  /** 운전자가 DT 차로에 들어왔다고 알린다 (위치·저속만으로 추정하지 않음) */
  async laneEntered(driver: DriverPrincipal, orderId: string) {
    const order = await this.findOwnOrder(driver, orderId);
    if (!ACTIVE_STATUSES.includes(order.status)) throw new ConflictException('끝난 주문입니다');
    return this.orders.view(await this.engine.laneEntered(orderId));
  }

  private async findOwnOrder(driver: DriverPrincipal, orderId: string) {
    const order = await this.prisma.order.findUnique({ where: { id: orderId } });
    if (!order || order.userId !== driver.userId) throw new NotFoundException('주문을 찾을 수 없습니다');
    return order;
  }
}
