import { INestApplication } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import request from 'supertest';
import { MockDtAdapter } from '../src/channels/mock-dt/mock-dt.adapter';
import { DomainEvent, OrderDomainEvent } from '../src/common/domain-events';
import { OrdersService } from '../src/orders/orders.service';
import { PrismaService } from '../src/prisma/prisma.service';
import { SEED } from '../src/seed/seed';
import { NO_SHOW_TIMEOUT_MS, RESERVED_TIMEOUT_MS, TimingEngine } from '../src/timing/timing-engine.service';
import { createTestApp, newDriver } from './helpers';

const PANGYO = { lat: 37.3947, lng: 127.1112 };

describe('타이밍 엔진', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let engine: TimingEngine;
  let mockDt: MockDtAdapter;
  let events: OrderDomainEvent[];

  beforeAll(async () => {
    app = await createTestApp();
    prisma = app.get(PrismaService);
    engine = app.get(TimingEngine);
    mockDt = app.get(MockDtAdapter);
    const emitter = app.get(EventEmitter2);
    events = [];
    for (const name of Object.values(DomainEvent)) {
      emitter.on(name, (e: OrderDomainEvent) => events.push({ ...e, data: { ...e.data, event: name } }));
    }
  });

  beforeEach(() => {
    for (const id of Object.values(SEED.stores)) mockDt.setQueue(id, 0);
  });

  afterAll(() => app.close());

  const api = () => request(app.getHttpServer());

  async function reserve(storeId: string = SEED.stores.pangyo) {
    const d = await newDriver(app);
    const auth = { Authorization: `Bearer ${d.token}` };
    const res = await api()
      .post('/v1/orders')
      .set(auth)
      .send({ storeId, source: 'SCREEN', items: [{ menuItemId: SEED.menu.americano, qty: 1 }] })
      .expect(201);
    return { ...d, auth, orderId: res.body.order.id as string, estPrepSec: res.body.order.estPrepSec as number };
  }

  const telemetry = (o: { auth: Record<string, string>; orderId: string }, body: object) =>
    api().post(`/v1/orders/${o.orderId}/telemetry`).set(o.auth).send(body).expect(200);

  const eventsOf = (orderId: string, name: string) => events.filter((e) => e.orderId === orderId && e.data.event === name);

  it('ETA + 대기줄이 제조 시간 + 여유 이하가 되는 순간 전송한다', async () => {
    const o = await reserve();
    mockDt.setQueue(SEED.stores.pangyo, 1); // 60초
    const sendAt = o.estPrepSec + 30 - 60;

    const far = await telemetry(o, { lat: 37.42, lng: 127.1, speedKmh: 50, etaSec: sendAt + 60 });
    expect(far.body.order.status).toBe('RESERVED');

    const near = await telemetry(o, { lat: 37.40, lng: 127.11, speedKmh: 40, etaSec: sendAt });
    expect(near.body.order.status).toBe('SENT');
    expect(near.body.order.externalOrderId).toMatch(/^MOCK-/);
  });

  it('내비 ETA가 없으면 위치·속도로 추정해 FUSED로 기록한다', async () => {
    const o = await reserve();
    const res = await telemetry(o, { lat: PANGYO.lat + 0.05, lng: PANGYO.lng, speedKmh: 60 });
    expect(res.body.etaSec).toBeGreaterThan(300);
    const row = await prisma.telemetry.findFirstOrThrow({ where: { orderId: o.orderId } });
    expect(row.source).toBe('FUSED');
  });

  it('전송 후 도착이 2분 이상 늦어지면 지연을 알린다', async () => {
    const o = await reserve();
    await telemetry(o, { lat: 37.40, lng: 127.11, speedKmh: 40, etaSec: 30 });
    expect((await prisma.order.findUniqueOrThrow({ where: { id: o.orderId } })).status).toBe('SENT');

    await telemetry(o, { lat: 37.40, lng: 127.11, speedKmh: 5, etaSec: 30 + 200 });
    const delayed = eventsOf(o.orderId, DomainEvent.OrderDelayed);
    expect(delayed).toHaveLength(1);
    expect(delayed[0].data.delaySec).toBeGreaterThanOrEqual(120);
    expect(delayed[0].tts).toMatch(/^정체로 도착이 \d+분 늦어져/);

    // 같은 지연으로 다시 알리지는 않는다
    await telemetry(o, { lat: 37.40, lng: 127.11, speedKmh: 5, etaSec: 30 + 200 });
    expect(eventsOf(o.orderId, DomainEvent.OrderDelayed)).toHaveLength(1);
  });

  it('DT 차로 지오펜스에 저속으로 들어오면 진입 처리하고, 수령 때 대기 시간을 기록한다', async () => {
    const o = await reserve();
    await telemetry(o, { lat: 37.40, lng: 127.11, speedKmh: 40, etaSec: 30 });
    const store = await prisma.store.findUniqueOrThrow({ where: { id: SEED.stores.pangyo } });

    const res = await telemetry(o, { lat: store.laneLat, lng: store.laneLng, speedKmh: 5, etaSec: 0 });
    expect(res.body.order.laneEnteredAt).not.toBeNull();
    expect(eventsOf(o.orderId, DomainEvent.OrderLaneEntered)).toHaveLength(1);

    await app.get(OrdersService).pickupByPlate(SEED.stores.pangyo, o.plateNumber);
    const visit = await prisma.dtVisit.findUniqueOrThrow({ where: { orderId: o.orderId } });
    expect(visit.waitSec).not.toBeNull();
  });

  it('전송 전에 차로에 들어오면 즉시 전송한다', async () => {
    const o = await reserve();
    const res = await api().post(`/v1/orders/${o.orderId}/lane-entered`).set(o.auth).expect(200);
    expect(res.body.status).toBe('SENT');
    expect(res.body.laneEnteredAt).not.toBeNull();
  });

  it('예약 후 10분간 텔레메트리가 없으면 만료 취소', async () => {
    const o = await reserve();
    await engine.evaluate(o.orderId, Date.now() + RESERVED_TIMEOUT_MS + 1000);
    const order = await prisma.order.findUniqueOrThrow({ where: { id: o.orderId } });
    expect(order.status).toBe('CANCELLED');
    expect(order.cancelReason).toBe('EXPIRED');
  });

  it('준비 완료 후 15분 안에 수령하지 않으면 미수령 취소하고 승인을 푼다', async () => {
    const o = await reserve();
    await telemetry(o, { lat: 37.40, lng: 127.11, speedKmh: 40, etaSec: 30 });
    await app.get(OrdersService).markReady(SEED.stores.pangyo, o.orderId);

    await engine.evaluate(o.orderId, Date.now() + NO_SHOW_TIMEOUT_MS + 1000);
    const order = await prisma.order.findUniqueOrThrow({ where: { id: o.orderId }, include: { payment: true } });
    expect(order.status).toBe('CANCELLED');
    expect(order.cancelReason).toBe('NO_SHOW');
    expect(order.payment?.status).toBe('VOIDED');
  });

  it('대기가 길면 더 빠른 매장을 제안하고, 매장을 바꿀 수 있다', async () => {
    mockDt.setQueue(SEED.stores.jeongja, 8);
    const o = await reserve(SEED.stores.jeongja);

    // 판교점 1km 북쪽에서 정자점으로 가는 중
    await telemetry(o, { lat: PANGYO.lat + 0.009, lng: PANGYO.lng, speedKmh: 50, etaSec: 600 });
    const alert = eventsOf(o.orderId, DomainEvent.QueueAlert);
    expect(alert).toHaveLength(1);
    expect(alert[0].tts).toContain('차가 8대');

    const alts = await api().get(`/v1/orders/${o.orderId}/alternatives`).set(o.auth).expect(200);
    expect(alts.body[0].storeId).toBe(SEED.stores.pangyo);

    const changed = await api()
      .post(`/v1/orders/${o.orderId}/change-store`)
      .set(o.auth)
      .send({ storeId: SEED.stores.pangyo })
      .expect(200);
    expect(changed.body.order.store.id).toBe(SEED.stores.pangyo);
    expect(changed.body.tts).toBe('픽미 DT 판교점으로 바꿨어요.');
  });

  it('매장 검색 결과에 대기 차량 수와 대기 시간을 함께 준다', async () => {
    mockDt.setQueue(SEED.stores.pangyo, 3);
    const d = await newDriver(app);
    const res = await api()
      .post('/v1/stores/search')
      .set('Authorization', `Bearer ${d.token}`)
      .send({ ...PANGYO, radiusM: 1000 })
      .expect(200);
    expect(res.body[0]).toMatchObject({ id: SEED.stores.pangyo, queueCars: 3, queueWaitSec: 180 });
  });
});
