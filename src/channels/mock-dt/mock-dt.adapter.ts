import { Injectable, Logger } from '@nestjs/common';
import { Store } from '@prisma/client';
import { randomUUID } from 'crypto';
import { ChannelAdapter, ChannelOrder, QueueStatus } from '../channel-adapter';

const DEFAULT_QUEUE_CARS = 2;

/**
 * 목업 DT 매장. 주문을 메모리에 받아 두고, 대기 차량 수는 시연용 API로 바꾼다.
 * 실제 매장 화면 역할은 픽미 매장 대시보드가 한다.
 */
@Injectable()
export class MockDtAdapter implements ChannelAdapter {
  private readonly logger = new Logger(MockDtAdapter.name);
  private readonly queues = new Map<string, number>();
  private readonly received = new Map<string, { orderId: string; etaSec?: number; laneEntered?: boolean }>();

  async sendOrder(order: ChannelOrder) {
    const externalOrderId = `MOCK-${randomUUID().slice(0, 8).toUpperCase()}`;
    this.received.set(externalOrderId, { orderId: order.id });
    this.logger.log(`주문 수신 ${externalOrderId} (${order.store.name}, ${order.plateNumber})`);
    return { externalOrderId };
  }

  async updateEta(order: ChannelOrder, etaSec: number) {
    const entry = order.externalOrderId && this.received.get(order.externalOrderId);
    if (entry) entry.etaSec = etaSec;
  }

  async notifyLaneEntered(order: ChannelOrder) {
    const entry = order.externalOrderId && this.received.get(order.externalOrderId);
    if (entry) entry.laneEntered = true;
  }

  async cancelOrder(order: ChannelOrder, reason: string) {
    if (order.externalOrderId) this.received.delete(order.externalOrderId);
    this.logger.log(`주문 취소 ${order.externalOrderId ?? order.id}: ${reason}`);
  }

  async getQueue(store: Store): Promise<QueueStatus> {
    return { cars: this.queues.get(store.id) ?? DEFAULT_QUEUE_CARS };
  }

  /** 시연용: 매장 대기 차량 수 설정 */
  setQueue(storeId: string, cars: number) {
    this.queues.set(storeId, cars);
  }

  /** 시연용: 모든 매장 대기 차량 수를 기본값으로 */
  resetQueues() {
    this.queues.clear();
  }
}
