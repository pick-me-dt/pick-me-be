import { INestApplication } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import request from 'supertest';
import { DomainEvent, OrderDomainEvent } from '../src/common/domain-events';
import { OrdersService } from '../src/orders/orders.service';
import { PrismaService } from '../src/prisma/prisma.service';
import { SEED } from '../src/seed/seed';
import { createTestApp, newDriver } from './helpers';

describe('주문', () => {
  let app: INestApplication;
  let orders: OrdersService;
  let prisma: PrismaService;

  beforeAll(async () => {
    app = await createTestApp();
    orders = app.get(OrdersService);
    prisma = app.get(PrismaService);
  });

  afterAll(() => app.close());

  const api = () => request(app.getHttpServer());

  async function driverWithFavorite() {
    const driver = await newDriver(app);
    const fav = await api()
      .post('/v1/me/favorites')
      .set('Authorization', `Bearer ${driver.token}`)
      .send({ alias: '평소 그거', items: [{ menuItemId: SEED.menu.americano, qty: 1 }] })
      .expect(201);
    return { ...driver, favoriteId: fav.body.id as string, auth: { Authorization: `Bearer ${driver.token}` } };
  }

  it('견적은 금액과 재확인 문구를 돌려준다', async () => {
    const d = await driverWithFavorite();
    const res = await api()
      .post('/v1/orders/quote')
      .set(d.auth)
      .send({ storeId: SEED.stores.pangyo, items: [{ menuItemId: SEED.menu.americano, qty: 1 }, { menuItemId: SEED.menu.sandwich, qty: 2 }] })
      .expect(200);
    expect(res.body.totalAmount).toBe(4500 + 6500 * 2);
    expect(res.body.tts).toBe('아메리카노 한 잔, 햄치즈 샌드위치 두 개, 17,500원 주문할까요?');
    expect(res.body.estPrepSec).toBeGreaterThanOrEqual(180);
  });

  it('자주 주문 메뉴를 음성으로 주문하면 바로 예약된다', async () => {
    const d = await driverWithFavorite();
    const res = await api()
      .post('/v1/orders')
      .set(d.auth)
      .send({ storeId: SEED.stores.pangyo, source: 'VOICE', favoriteId: d.favoriteId })
      .expect(201);
    expect(res.body.order.status).toBe('RESERVED');
    expect(res.body.order.plateNumber).toBe(d.plateNumber);
    expect(res.body.tts).toContain('도착 시간에 맞춰');
  });

  it('새 메뉴를 음성으로 주문하면 정차 후 확인을 거쳐야 예약된다', async () => {
    const d = await driverWithFavorite();
    const res = await api()
      .post('/v1/orders')
      .set(d.auth)
      .send({ storeId: SEED.stores.pangyo, source: 'VOICE', items: [{ menuItemId: SEED.menu.latte, qty: 1 }] })
      .expect(201);
    expect(res.body.order.status).toBe('NEEDS_CONFIRMATION');
    expect(res.body.confirmationReasons).toEqual(['NOT_FAVORITE']);

    const confirmed = await api().post(`/v1/orders/${res.body.order.id}/confirm`).set(d.auth).expect(200);
    expect(confirmed.body.status).toBe('RESERVED');

    // 이미 예약된 주문을 다시 확인하면 409
    await api().post(`/v1/orders/${res.body.order.id}/confirm`).set(d.auth).expect(409);
  });

  it('1회 음성 결제 한도를 넘으면 확인 대기', async () => {
    const d = await driverWithFavorite();
    await api().patch('/v1/me/settings').set(d.auth).send({ voiceLimitPerOrder: 3000 }).expect(200);
    const res = await api()
      .post('/v1/orders')
      .set(d.auth)
      .send({ storeId: SEED.stores.pangyo, source: 'VOICE', favoriteId: d.favoriteId })
      .expect(201);
    expect(res.body.confirmationReasons).toEqual(['OVER_PER_ORDER_LIMIT']);
  });

  it('진행 중 주문이 있으면 새 주문은 409, 같은 Idempotency-Key는 같은 주문', async () => {
    const d = await driverWithFavorite();
    const body = { storeId: SEED.stores.pangyo, source: 'VOICE', favoriteId: d.favoriteId };
    const first = await api().post('/v1/orders').set(d.auth).set('Idempotency-Key', 'k1').send(body).expect(201);
    const again = await api().post('/v1/orders').set(d.auth).set('Idempotency-Key', 'k1').send(body).expect(201);
    expect(again.body.order.id).toBe(first.body.order.id);
    await api().post('/v1/orders').set(d.auth).send(body).expect(409);
  });

  it('다른 사용자의 주문은 볼 수 없다', async () => {
    const owner = await driverWithFavorite();
    const other = await driverWithFavorite();
    const res = await api()
      .post('/v1/orders')
      .set(owner.auth)
      .send({ storeId: SEED.stores.pangyo, source: 'VOICE', favoriteId: owner.favoriteId })
      .expect(201);
    await api().get(`/v1/orders/${res.body.order.id}`).set(other.auth).expect(404);
  });

  it('전송 → 제조 → 차량번호로 수령: 전송 때 승인, 수령 때 결제 확정', async () => {
    const d = await driverWithFavorite();
    const emitted: OrderDomainEvent[] = [];
    const events = app.get(EventEmitter2);
    const listener = (e: OrderDomainEvent) => emitted.push(e);
    events.on(DomainEvent.OrderStatusChanged, listener);

    const res = await api()
      .post('/v1/orders')
      .set(d.auth)
      .send({ storeId: SEED.stores.pangyo, source: 'VOICE', favoriteId: d.favoriteId })
      .expect(201);
    const id = res.body.order.id;

    const sent = await orders.send(id, 240);
    expect(sent.status).toBe('SENT');
    expect(sent.externalOrderId).toMatch(/^MOCK-/);
    expect(sent.etaAtSendSec).toBe(240);
    expect((await prisma.payment.findUniqueOrThrow({ where: { orderId: id } })).status).toBe('AUTHORIZED');

    await orders.markPreparing(SEED.stores.pangyo, id);
    const picked = await orders.pickupByPlate(SEED.stores.pangyo, d.plateNumber);
    expect(picked.status).toBe('PICKED_UP');
    expect((await prisma.payment.findUniqueOrThrow({ where: { orderId: id } })).status).toBe('CAPTURED');

    events.off(DomainEvent.OrderStatusChanged, listener);
    const mine = emitted.filter((e) => e.orderId === id);
    expect(mine.map((e) => e.data.status)).toEqual(['SENT', 'PREPARING', 'READY', 'PICKED_UP']);
    expect(mine[0].tts).toContain('매장에 보냈어요');

    const types = (await prisma.orderEvent.findMany({ where: { orderId: id }, orderBy: { createdAt: 'asc' } })).map((e) => e.type);
    expect(types).toEqual(['created', 'sent', 'preparing', 'ready', 'picked_up']);
  });

  it('전송 후 취소하면 결제 승인이 취소된다', async () => {
    const d = await driverWithFavorite();
    const res = await api()
      .post('/v1/orders')
      .set(d.auth)
      .send({ storeId: SEED.stores.pangyo, source: 'VOICE', favoriteId: d.favoriteId })
      .expect(201);
    await orders.send(res.body.order.id, 300);

    const cancelled = await api().post(`/v1/orders/${res.body.order.id}/cancel`).set(d.auth).send({}).expect(200);
    expect(cancelled.body.status).toBe('CANCELLED');
    expect(cancelled.body.cancelReason).toBe('USER');
    expect((await prisma.payment.findUniqueOrThrow({ where: { orderId: res.body.order.id } })).status).toBe('VOIDED');

    // 취소된 주문은 다시 취소할 수 없다
    await api().post(`/v1/orders/${res.body.order.id}/cancel`).set(d.auth).send({}).expect(409);
  });

  it('진행 중 주문 목록', async () => {
    const d = await driverWithFavorite();
    await api()
      .post('/v1/orders')
      .set(d.auth)
      .send({ storeId: SEED.stores.pangyo, source: 'VOICE', favoriteId: d.favoriteId })
      .expect(201);
    const res = await api().get('/v1/orders?active=true').set(d.auth).expect(200);
    expect(res.body).toHaveLength(1);
    expect(res.body[0].store.name).toBe('픽미 DT 판교점');
  });
});
