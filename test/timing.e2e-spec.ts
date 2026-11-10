import { INestApplication } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import request from 'supertest';
import { DomainEvent, OrderDomainEvent } from '../src/common/domain-events';
import { PrismaService } from '../src/prisma/prisma.service';
import { TimingEngine } from '../src/timing/timing-engine.service';
import { createTestApp, reserveOrder } from './helpers';

describe('예상 수령·시작 추천 (2차 기획)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let engine: TimingEngine;
  const events: { name: string; e: OrderDomainEvent }[] = [];

  beforeAll(async () => {
    app = await createTestApp();
    prisma = app.get(PrismaService);
    engine = app.get(TimingEngine);
    const emitter = app.get(EventEmitter2);
    for (const name of Object.values(DomainEvent)) emitter.on(name, (e: OrderDomainEvent) => events.push({ name, e }));
  });

  afterAll(() => app.close());

  const api = () => request(app.getHttpServer());
  const eta = (o: { auth: Record<string, string>; orderId: string }, etaSec: number, extra: object = {}) =>
    api().post(`/v1/orders/${o.orderId}/telemetry`).set(o.auth).send({ etaSec, ...extra });
  const eventsOf = (orderId: string, name: string) => events.filter((x) => x.e.orderId === orderId && x.name === name).map((x) => x.e);
  const store = (o: { staff: Record<string, string>; orderId: string }, action: string) =>
    api().post(`/v1/store/orders/${o.orderId}/${action}`).set(o.staff).send({}).expect(200);

  it('ETA는 필수다 (위치만으로 추정하지 않음)', async () => {
    const o = await reserveOrder(app);
    await api().post(`/v1/orders/${o.orderId}/telemetry`).set(o.auth).send({ lat: 37.47, lng: 127.03, speedKmh: 40 }).expect(400);
  });

  it('예상 수령 = 입구 도착 예정 + 입구 이후 시간, 시작 추천 = 예상 수령 - 준비 시간, 차량·매장 모두 갱신', async () => {
    const o = await reserveOrder(app);
    const before = Date.now();
    const res = await eta(o, 600).expect(200);
    const t = res.body.order.timing;
    const entrance = Date.parse(t.entranceArrivalAt);
    expect(entrance).toBeGreaterThanOrEqual(before + 600_000);
    expect(Date.parse(t.expectedPickupAt) - entrance).toBe(120_000);
    expect(Date.parse(t.expectedPickupAt) - Date.parse(t.recommendedStartAt)).toBe(180_000);
    expect(t).toMatchObject({ etaStale: false, prepSec: 180, afterEntrySec: 120, delaySec: 0 });

    const updated = eventsOf(o.orderId, DomainEvent.EtaUpdated);
    expect(updated).toHaveLength(1);
    expect(updated[0].data.timing).toBeDefined();

    const list = await api().get('/v1/store/orders').set(o.staff).expect(200);
    const row = list.body.find((r: { id: string }) => r.id === o.orderId);
    expect(row.timing.recommendedStartAt).toBe(t.recommendedStartAt);
  });

  it('제조 전: 시작 추천이 60초 이상 바뀔 때만 강조해 알린다', async () => {
    const o = await reserveOrder(app);
    await store(o, 'accept');
    await eta(o, 600).expect(200);
    await eta(o, 630).expect(200); // +30초: 강조하지 않음
    expect(eventsOf(o.orderId, DomainEvent.RecommendationChanged)).toHaveLength(0);

    await eta(o, 700).expect(200); // 처음 대비 +100초
    const changed = eventsOf(o.orderId, DomainEvent.RecommendationChanged);
    expect(changed).toHaveLength(1);
    expect(changed[0].data).toMatchObject({ emphasize: true });
    expect(changed[0].data.deltaSec).toBeGreaterThanOrEqual(99);
    expect(changed[0].tts).toMatch(/^도착이 늦어져 매장의 제조 시작 추천을 \d+분 늦췄어요\.$/);

    await eta(o, 560).expect(200); // 빨라짐
    const again = eventsOf(o.orderId, DomainEvent.RecommendationChanged);
    expect(again).toHaveLength(2);
    expect(again[1].tts).toContain('앞당겼어요');
  });

  it('제조 후: 추천은 바꾸지 않고, 예상 수령이 60초 이상 늦어지면 지연을 공유한다', async () => {
    const o = await reserveOrder(app);
    await store(o, 'accept');
    await eta(o, 300).expect(200);
    const started = await store(o, 'start');
    expect(started.body.status).toBe('PREPARING');
    const planned = await prisma.order.findUniqueOrThrow({ where: { id: o.orderId } });
    expect(planned.plannedPickupAt).not.toBeNull();

    await eta(o, 340).expect(200); // +40초: 알리지 않음
    expect(eventsOf(o.orderId, DomainEvent.OrderDelayed)).toHaveLength(0);
    const res = await eta(o, 400).expect(200); // +100초
    expect(res.body.order.status).toBe('PREPARING');
    expect(res.body.order.timing.delaySec).toBeGreaterThanOrEqual(99);
    const delayed = eventsOf(o.orderId, DomainEvent.OrderDelayed);
    expect(delayed).toHaveLength(1);
    expect(delayed[0].tts).toMatch(/^도착이 \d+분 늦어진다고 매장에 알렸어요\.$/);
    expect(eventsOf(o.orderId, DomainEvent.RecommendationChanged)).toHaveLength(0);

    await eta(o, 420).expect(200); // 같은 지연 폭 안: 다시 알리지 않음
    expect(eventsOf(o.orderId, DomainEvent.OrderDelayed)).toHaveLength(1);
  });

  it('ETA가 90초 넘게 끊기면 오래됨으로 알리고, 마지막 갱신 시각과 추천을 유지한다', async () => {
    const o = await reserveOrder(app);
    const first = await eta(o, 600).expect(200);
    const order = await prisma.order.findUniqueOrThrow({ where: { id: o.orderId } });
    const later = Date.now() + 91_000;

    await engine.sweep(later);
    await engine.sweep(later + 5_000);
    const stale = eventsOf(o.orderId, DomainEvent.EtaUpdated).filter((e) => (e.data.timing as { etaStale: boolean }).etaStale);
    expect(stale).toHaveLength(1);
    const timing = stale[0].data.timing as { etaUpdatedAt: string; recommendedStartAt: string };
    expect(new Date(timing.recommendedStartAt).toISOString()).toBe(first.body.order.timing.recommendedStartAt);
    expect(new Date(timing.etaUpdatedAt).toISOString()).toBe(first.body.order.timing.etaUpdatedAt);
    expect(order.status).toBe('PENDING_ACCEPT');
  });

  it('위치·저속만으로 DT 진입을 확정하지 않는다. 진입은 운전자나 직원이 알려야 한다', async () => {
    const o = await reserveOrder(app);
    const s = await prisma.store.findUniqueOrThrow({ where: { id: o.order.store.id } });
    const res = await eta(o, 0, { lat: s.laneLat, lng: s.laneLng, speedKmh: 3 }).expect(200);
    expect(res.body.order.laneEnteredAt).toBeNull();

    const entered = await api().post(`/v1/orders/${o.orderId}/lane-entered`).set(o.auth).expect(200);
    expect(entered.body.laneEnteredAt).not.toBeNull();
    expect(entered.body.timing.etaSec).toBe(0);
    expect(eventsOf(o.orderId, DomainEvent.OrderLaneEntered)).toHaveLength(1);
  });

  it('직원도 차로 진입을 확인할 수 있다', async () => {
    const o = await reserveOrder(app);
    const res = await store(o, 'lane-entered');
    expect(res.body.laneEnteredAt).not.toBeNull();
  });

  it('ETA가 끊기거나 오래 지나도 자동으로 취소하지 않는다', async () => {
    const o = await reserveOrder(app);
    await store(o, 'accept');
    await store(o, 'start');
    await store(o, 'ready');
    await engine.sweep(Date.now() + 24 * 60 * 60 * 1000);
    const order = await prisma.order.findUniqueOrThrow({ where: { id: o.orderId } });
    expect(order.status).toBe('READY');
  });

  it('매장 확인이 2분 넘게 없으면 차량·매장에 응답 지연을 한 번 알린다', async () => {
    const o = await reserveOrder(app);
    await engine.sweep(Date.now() + 121_000);
    await engine.sweep(Date.now() + 130_000);
    const overdue = eventsOf(o.orderId, DomainEvent.AcceptOverdue);
    expect(overdue).toHaveLength(1);
    expect(overdue[0].tts).toContain('매장 확인이 늦어지고 있어요');
  });

  it('끝난 주문의 ETA는 저장하지 않고 현재 상태만 돌려준다', async () => {
    const o = await reserveOrder(app);
    await api().post(`/v1/orders/${o.orderId}/cancel`).set(o.auth).send({}).expect(200);
    const res = await eta(o, 100).expect(200);
    expect(res.body.order.status).toBe('CANCELLED');
    expect(await prisma.telemetry.count({ where: { orderId: o.orderId } })).toBe(0);
  });
});
