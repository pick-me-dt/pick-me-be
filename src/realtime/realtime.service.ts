import { Injectable } from '@nestjs/common';
import { OnEvent } from '@nestjs/event-emitter';
import { DomainEvent, DomainEventName, OrderDomainEvent } from '../common/domain-events';
import { StoreGateway, VehicleGateway } from './realtime.gateway';

/**
 * 도메인 이벤트를 WebSocket으로 내보낸다.
 * 2차 기획: 상태·ETA·시작 추천·지연은 차량과 매장 모두에 갱신한다. TTS 문구는 차량에만 붙인다.
 */
@Injectable()
export class RealtimeService {
  constructor(
    private readonly store: StoreGateway,
    private readonly vehicle: VehicleGateway,
  ) {}

  @OnEvent(DomainEvent.OrderStatusChanged)
  onStatusChanged(e: OrderDomainEvent) {
    this.send(DomainEvent.OrderStatusChanged, e);
  }

  @OnEvent(DomainEvent.EtaUpdated)
  onEtaUpdated(e: OrderDomainEvent) {
    this.send(DomainEvent.EtaUpdated, e);
  }

  @OnEvent(DomainEvent.RecommendationChanged)
  onRecommendationChanged(e: OrderDomainEvent) {
    this.send(DomainEvent.RecommendationChanged, e);
  }

  @OnEvent(DomainEvent.OrderDelayed)
  onDelayed(e: OrderDomainEvent) {
    this.send(DomainEvent.OrderDelayed, e);
  }

  @OnEvent(DomainEvent.AcceptOverdue)
  onAcceptOverdue(e: OrderDomainEvent) {
    this.send(DomainEvent.AcceptOverdue, e);
  }

  @OnEvent(DomainEvent.OrderLaneEntered)
  onLaneEntered(e: OrderDomainEvent) {
    this.send(DomainEvent.OrderLaneEntered, e);
  }

  private send(name: DomainEventName, e: OrderDomainEvent) {
    const payload = { orderId: e.orderId, ...e.data };
    this.store.toStore(e.storeId, name, payload);
    this.vehicle.toVehicle(e.vehicleId, name, { ...payload, tts: e.tts });
  }
}
