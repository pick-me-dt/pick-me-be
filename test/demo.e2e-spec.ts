import { INestApplication } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import request from 'supertest';
import { DomainEvent, OrderDomainEvent } from '../src/common/domain-events';
import { PrismaService } from '../src/prisma/prisma.service';
import { SEED } from '../src/seed/seed';
import { createTestApp } from './helpers';

describe('시연 (dev API, 2차 기획)', () => {
  let app: INestApplication;
  const events: { name: string; e: OrderDomainEvent }[] = [];

  beforeAll(async () => {
    app = await createTestApp();
    const emitter = app.get(EventEmitter2);
    for (const name of Object.values(DomainEvent)) emitter.on(name, (e: OrderDomainEvent) => events.push({ name, e }));
  });

  afterAll(async () => {
    await request(app.getHttpServer()).post('/v1/dev/reset').expect(200);
    await app.close();
  });

  const api = () => request(app.getHttpServer());

  async function waitFor<T>(check: () => Promise<T | undefined>, timeoutMs = 15_000): Promise<T> {
    const deadline = Date.now() + timeoutMs;
    while (Date.now() < deadline) {
      const value = await check();
      if (value) return value;
      await new Promise((r) => setTimeout(r, 100));
    }
    throw new Error('시간 안에 조건을 만족하지 않았습니다');
  }

  it('demo-run: 양재 DT점 · 아이스 아메리카노 · P-021로 매장에 공유하고 ETA를 보낸다', async () => {
    const res = await api().post('/v1/dev/demo-run').send({ startEtaSec: 300, tickSec: 1 }).expect(200);
    expect(res.body.order).toMatchObject({ orderNo: 'P-021', status: 'PENDING_ACCEPT' });
    expect(res.body.order.store.id).toBe(SEED.stores.yangjae);
    expect(res.body.order.items[0].name).toBe('아이스 아메리카노');
    expect(res.body.tts).toContain('픽미 양재 DT점에 보냈어요');

    const prisma = app.get(PrismaService);
    await waitFor(async () => ((await prisma.telemetry.count({ where: { orderId: res.body.order.id } })) >= 2 ? true : undefined));
    await api().delete(`/v1/dev/simulate/${res.body.order.id}`).expect(200);
  });

  it('autoStore: 수락 → 시작 추천 시각에 제조 시작 → 입구 도착 시 차로 진입 → 준비 완료', async () => {
    const res = await api()
      .post('/v1/dev/demo-run')
      .send({ startEtaSec: 3, tickSec: 1, jam: { atEtaSec: 1, addSec: 1 }, autoStore: true, prepSec: 2, afterEntrySec: 1 })
      .expect(200);
    const orderId = res.body.order.id;
    const prisma = app.get(PrismaService);
    const ready = await waitFor(async () => {
      const o = await prisma.order.findUniqueOrThrow({ where: { id: orderId } });
      return o.status === 'READY' ? o : undefined;
    });
    expect(ready.laneEnteredAt).not.toBeNull();
    expect(ready.plannedPickupAt).not.toBeNull();

    await waitFor(async () => (events.some((x) => x.e.orderId === orderId && x.e.data.status === 'READY') ? true : undefined));
    const statuses = events
      .filter((x) => x.e.orderId === orderId && x.name === DomainEvent.OrderStatusChanged)
      .map((x) => x.e.data.status);
    expect(statuses).toEqual(['PENDING_ACCEPT', 'ACCEPTED', 'PREPARING', 'READY']);
    expect(events.some((x) => x.e.orderId === orderId && x.name === DomainEvent.EtaUpdated)).toBe(true);
    expect(events.some((x) => x.e.orderId === orderId && x.name === DomainEvent.OrderLaneEntered)).toBe(true);
  }, 30_000);

  it('ENABLE_DEV_ROUTES가 꺼져 있으면 404', async () => {
    const before = process.env.ENABLE_DEV_ROUTES;
    process.env.ENABLE_DEV_ROUTES = 'false';
    try {
      await api().post('/v1/dev/seed').expect(404);
    } finally {
      process.env.ENABLE_DEV_ROUTES = before;
    }
  });
});
