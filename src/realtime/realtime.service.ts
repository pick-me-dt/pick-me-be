import { Injectable } from '@nestjs/common';
import { OnEvent } from '@nestjs/event-emitter';
import { DomainEvent, DomainEventName, OrderDomainEvent } from '../common/domain-events';
import { StoreGateway, VehicleGateway } from './realtime.gateway';

/**
 * 도메인 이벤트를 WebSocket으로 내보낸다.
 * 매장에는 TTS 문구를 보내지 않고, 차량에는 매장 내부용 이벤트(ETA 공유, 차로 진입)를 보내지 않는다.
 */
@Injectable()
export class RealtimeService {
  constructor(
    private readonly store: StoreGateway,
    private readonly vehicle: VehicleGateway,
  ) {}

  @OnEvent(DomainEvent.OrderStatusChanged)
  onStatusChanged(e: OrderDomainEvent) {
    this.send(DomainEvent.OrderStatusChanged, e, { store: true, vehicle: true });
  }

  @OnEvent(DomainEvent.OrderDelayed)
  onDelayed(e: OrderDomainEvent) {
    this.send(DomainEvent.OrderDelayed, e, { store: true, vehicle: true });
  }

  @OnEvent(DomainEvent.EtaUpdated)
  onEtaUpdated(e: OrderDomainEvent) {
    this.send(DomainEvent.EtaUpdated, e, { store: true, vehicle: false });
  }

  @OnEvent(DomainEvent.OrderLaneEntered)
  onLaneEntered(e: OrderDomainEvent) {
    this.send(DomainEvent.OrderLaneEntered, e, { store: true, vehicle: false });
  }

  @OnEvent(DomainEvent.QueueAlert)
  onQueueAlert(e: OrderDomainEvent) {
    this.send(DomainEvent.QueueAlert, e, { store: false, vehicle: true });
  }

  private send(name: DomainEventName, e: OrderDomainEvent, to: { store: boolean; vehicle: boolean }) {
    const payload = { orderId: e.orderId, ...e.data };
    if (to.store) this.store.toStore(e.storeId, name, payload);
    if (to.vehicle) this.vehicle.toVehicle(e.vehicleId, name, { ...payload, tts: e.tts });
  }
}
