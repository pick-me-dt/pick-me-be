import { INestApplication } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import request from 'supertest';
import { DomainEvent, OrderDomainEvent } from '../src/common/domain-events';
import { PrismaService } from '../src/prisma/prisma.service';
import { createTestApp } from './helpers';

describe('시연 시나리오 (dev API)', () => {
  let app: INestApplication;
  const events: { name: string; e: OrderDomainEvent }[] = [];

  beforeAll(async () => {
    app = await createTestApp();
    const emitter = app.get(EventEmitter2);
    for (const name of Object.values(DomainEvent)) emitter.on(name, (e: OrderDomainEvent) => events.push({ name, e }));
  });

  afterAll(() => app.close());

  async function waitForStatus(orderId: string, status: string, timeoutMs = 15_000) {
    const prisma = app.get(PrismaService);
    const deadline = Date.now() + timeoutMs;
    while (Date.now() < deadline) {
      const order = await prisma.order.findUniqueOrThrow({ where: { id: orderId } });
      if (order.status === status) return order;
      await new Promise((r) => setTimeout(r, 100));
    }
    throw new Error(`${status} 상태가 되지 않았습니다`);
  }

  it('음성 주문 → 주행 → 전송 → 정체 지연 → 차로 진입 → 준비 완료', async () => {
    const res = await request(app.getHttpServer())
      .post('/v1/dev/demo-run')
      .send({ startEtaSec: 600, speedup: 300, tickSec: 10, autoStore: true })
      .expect(200);
    const orderId = res.body.order.id;
    expect(res.body.order.status).toBe('RESERVED');
    expect(res.body.tts).toContain('아메리카노 한 잔, 4,500원 주문을 예약했어요');

    const ready = await waitForStatus(orderId, 'READY');
    expect(ready.laneEnteredAt).not.toBeNull();
    // DB 반영 직후 이벤트가 나가므로 READY 이벤트까지 잠깐 기다린다
    for (let i = 0; i < 50 && !events.some((x) => x.e.orderId === orderId && x.e.data.status === 'READY'); i++) {
      await new Promise((r) => setTimeout(r, 20));
    }

    const names = events.filter((x) => x.e.orderId === orderId).map((x) => (x.name === DomainEvent.OrderStatusChanged ? `status:${x.e.data.status}` : x.name));
    expect(names).toEqual(expect.arrayContaining(['status:SENT', DomainEvent.OrderDelayed, DomainEvent.OrderLaneEntered, 'status:PREPARING', 'status:READY']));
    // 정체 지연은 매장에 전송된 뒤에 알린다
    expect(names.indexOf(DomainEvent.OrderDelayed)).toBeGreaterThan(names.indexOf('status:SENT'));
  }, 30_000);

  it('ENABLE_DEV_ROUTES가 꺼져 있으면 404', async () => {
    const before = process.env.ENABLE_DEV_ROUTES;
    process.env.ENABLE_DEV_ROUTES = 'false';
    try {
      await request(app.getHttpServer()).post('/v1/dev/seed').expect(404);
    } finally {
      process.env.ENABLE_DEV_ROUTES = before;
    }
  });
});
