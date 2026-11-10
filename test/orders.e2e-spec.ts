import { INestApplication } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import request from 'supertest';
import { DomainEvent, OrderDomainEvent } from '../src/common/domain-events';
import { PrismaService } from '../src/prisma/prisma.service';
import { SEED } from '../src/seed/seed';
import { createTestApp, newDriver, reserveOrder, staffToken } from './helpers';

describe('주문 (2차 기획)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  const events: OrderDomainEvent[] = [];

  beforeAll(async () => {
    app = await createTestApp();
    prisma = app.get(PrismaService);
    app.get(EventEmitter2).on(DomainEvent.OrderStatusChanged, (e: OrderDomainEvent) => events.push(e));
  });

  afterAll(() => app.close());

  const api = () => request(app.getHttpServer());
  const payment = async (orderId: string) => (await prisma.payment.findUniqueOrThrow({ where: { orderId } })).status;
  const statusesOf = (orderId: string) => events.filter((e) => e.orderId === orderId).map((e) => e.data.status);

  it('견적은 금액·품절·준비 시간과 확인 문구를 돌려준다', async () => {
    const d = await newDriver(app);
    const res = await api()
      .post('/v1/orders/quote')
      .set('Authorization', `Bearer ${d.token}`)
      .send({ storeId: SEED.stores.yangjae, items: [{ menuItemId: SEED.menu.icedAmericano, qty: 1 }] })
      .expect(200);
    expect(res.body).toMatchObject({ totalAmount: 4500, available: true, prepSec: 180, afterEntrySec: 120 });
    expect(res.body.tts).toBe('아이스 아메리카노 한 잔, 4,500원을 픽미 양재 DT점에 예약할까요?');
  });

  it('예약 확정 즉시 매장 확인 중으로 공유되고, 주문번호와 결제 승인이 생긴다', async () => {
    const o = await reserveOrder(app);
    expect(o.order.status).toBe('PENDING_ACCEPT');
    expect(o.order.orderNo).toMatch(/^P-\d{3}$/);
    expect(o.order.sentAt).not.toBeNull();
    expect(o.order.externalOrderId).toMatch(/^MOCK-/);
    expect(await payment(o.orderId)).toBe('AUTHORIZED');
    expect(statusesOf(o.orderId)).toEqual(['PENDING_ACCEPT']);

    // 매장 목록에 바로 보인다
    const list = await api().get('/v1/store/orders').set(o.staff).expect(200);
    expect(list.body.map((r: { id: string }) => r.id)).toContain(o.orderId);
  });

  it('주문번호는 매장별로 하나씩 올라간다', async () => {
    const a = await reserveOrder(app);
    const b = await reserveOrder(app);
    const n = (no: string) => Number(no.slice(2));
    expect(n(b.order.orderNo)).toBe(n(a.order.orderNo) + 1);
  });

  it('수락 → 제조 시작 → 준비 완료 → 수령 완료, 수령 때 결제 확정', async () => {
    const o = await reserveOrder(app);
    const go = (action: string) => api().post(`/v1/store/orders/${o.orderId}/${action}`).set(o.staff).send({});

    // 수락 없이 제조를 시작할 수 없다
    await go('start').expect(409);
    expect((await go('accept').expect(200)).body.status).toBe('ACCEPTED');
    // 준비 완료 전에는 수령 처리할 수 없다
    await go('pickup').expect(409);
    expect((await go('start').expect(200)).body.status).toBe('PREPARING');
    expect((await go('ready').expect(200)).body.status).toBe('READY');
    expect((await go('pickup').expect(200)).body.status).toBe('PICKED_UP');

    expect(await payment(o.orderId)).toBe('CAPTURED');
    expect(statusesOf(o.orderId)).toEqual(['PENDING_ACCEPT', 'ACCEPTED', 'PREPARING', 'READY', 'PICKED_UP']);
    const accepted = events.find((e) => e.orderId === o.orderId && e.data.status === 'ACCEPTED');
    expect(accepted?.tts).toBe(`매장이 주문을 수락했어요. 주문번호 ${o.order.orderNo}.`);
  });

  it('매장이 거절하면 거절 상태가 되고 결제 승인이 풀린다', async () => {
    const o = await reserveOrder(app);
    const res = await api()
      .post(`/v1/store/orders/${o.orderId}/reject`)
      .set(o.staff)
      .send({ reason: 'SOLD_OUT', note: '얼음 소진' })
      .expect(200);
    expect(res.body).toMatchObject({ status: 'REJECTED', rejectReason: 'SOLD_OUT', cancelNote: '얼음 소진' });
    expect(await payment(o.orderId)).toBe('VOIDED');
  });

  it('수락 전 취소는 바로 취소된다', async () => {
    const o = await reserveOrder(app);
    const res = await api().post(`/v1/orders/${o.orderId}/cancel`).set(o.auth).send({}).expect(200);
    expect(res.body).toMatchObject({ status: 'CANCELLED', cancelReason: 'USER' });
    expect(await payment(o.orderId)).toBe('VOIDED');
  });

  it('수락 후 취소는 취소 확인 중을 거쳐 매장이 승인해야 취소 완료', async () => {
    const o = await reserveOrder(app);
    await api().post(`/v1/store/orders/${o.orderId}/accept`).set(o.staff).expect(200);

    const requested = await api().post(`/v1/orders/${o.orderId}/cancel`).set(o.auth).send({ reason: '일정 변경' }).expect(200);
    expect(requested.body.status).toBe('CANCEL_REQUESTED');
    expect(requested.body.cancelRequest).toMatchObject({ note: '일정 변경', statusBefore: 'ACCEPTED' });
    expect(requested.body.cancelledAt).toBeNull();
    expect(await payment(o.orderId)).toBe('AUTHORIZED');

    // 확인 중에는 다시 요청하거나 제조를 진행할 수 없다
    await api().post(`/v1/orders/${o.orderId}/cancel`).set(o.auth).send({}).expect(409);
    await api().post(`/v1/store/orders/${o.orderId}/start`).set(o.staff).expect(409);

    const approved = await api().post(`/v1/store/orders/${o.orderId}/cancel-request/approve`).set(o.staff).send({}).expect(200);
    expect(approved.body).toMatchObject({ status: 'CANCELLED', cancelReason: 'USER' });
    expect(await payment(o.orderId)).toBe('VOIDED');
  });

  it('매장이 취소를 거절하면 요청 전 상태로 돌아가고, 시작한 제조는 그대로', async () => {
    const o = await reserveOrder(app);
    for (const action of ['accept', 'start']) {
      await api().post(`/v1/store/orders/${o.orderId}/${action}`).set(o.staff).expect(200);
    }
    await api().post(`/v1/orders/${o.orderId}/cancel`).set(o.auth).send({}).expect(200);
    const rejected = await api().post(`/v1/store/orders/${o.orderId}/cancel-request/reject`).set(o.staff).send({ note: '이미 제조 중' }).expect(200);
    expect(rejected.body.status).toBe('PREPARING');
    expect(rejected.body.cancelRequest).toBeNull();
    expect(rejected.body.preparingAt).not.toBeNull();
    const last = events.filter((e) => e.orderId === o.orderId).at(-1);
    expect(last?.tts).toContain('취소를 받을 수 없다고');
  });

  it('미수령은 직원이 판단해 매장 취소로 종료한다', async () => {
    const o = await reserveOrder(app);
    for (const action of ['accept', 'start', 'ready']) {
      await api().post(`/v1/store/orders/${o.orderId}/${action}`).set(o.staff).expect(200);
    }
    const res = await api().post(`/v1/store/orders/${o.orderId}/cancel`).set(o.staff).send({ reason: 'NO_SHOW' }).expect(200);
    expect(res.body).toMatchObject({ status: 'CANCELLED', cancelReason: 'NO_SHOW' });
    expect(await payment(o.orderId)).toBe('VOIDED');
  });

  it('품절이면 견적에 표시되고 예약은 409 SOLD_OUT', async () => {
    const staff = { Authorization: `Bearer ${await staffToken(app, 'jeongja')}` };
    await api().patch(`/v1/store/menu/${SEED.menu.greenTeaLatte}`).set(staff).send({ soldOut: true }).expect(200);
    try {
      const d = await newDriver(app);
      const body = { storeId: SEED.stores.jeongja, items: [{ menuItemId: SEED.menu.greenTeaLatte, qty: 1 }] };
      const quote = await api().post('/v1/orders/quote').set('Authorization', `Bearer ${d.token}`).send(body).expect(200);
      expect(quote.body.available).toBe(false);
      expect(quote.body.items[0].soldOut).toBe(true);
      const res = await api().post('/v1/orders').set('Authorization', `Bearer ${d.token}`).send(body).expect(409);
      expect(res.body.code).toBe('SOLD_OUT');
      expect(res.body.quote.available).toBe(false);
    } finally {
      await api().patch(`/v1/store/menu/${SEED.menu.greenTeaLatte}`).set(staff).send({ soldOut: false }).expect(200);
    }
  });

  it('견적 때와 금액이 다르면 409 PRICE_CHANGED와 새 견적', async () => {
    const d = await newDriver(app);
    const res = await api()
      .post('/v1/orders')
      .set('Authorization', `Bearer ${d.token}`)
      .send({ storeId: SEED.stores.yangjae, items: [{ menuItemId: SEED.menu.icedAmericano, qty: 1 }], expectedTotal: 4000 })
      .expect(409);
    expect(res.body.code).toBe('PRICE_CHANGED');
    expect(res.body.quote.totalAmount).toBe(4500);
  });

  it('진행 중 주문이 있으면 409, 같은 Idempotency-Key는 같은 주문', async () => {
    const d = await newDriver(app);
    const auth = { Authorization: `Bearer ${d.token}` };
    const body = { storeId: SEED.stores.yangjae, items: [{ menuItemId: SEED.menu.icedAmericano, qty: 1 }] };
    const first = await api().post('/v1/orders').set(auth).set('Idempotency-Key', 'k1').send(body).expect(201);
    const again = await api().post('/v1/orders').set(auth).set('Idempotency-Key', 'k1').send(body).expect(201);
    expect(again.body.order.id).toBe(first.body.order.id);
    const conflict = await api().post('/v1/orders').set(auth).send(body).expect(409);
    expect(conflict.body.code).toBe('ACTIVE_ORDER_EXISTS');
  });

  it('다른 사용자의 주문은 볼 수 없고, 다른 매장 직원은 바꿀 수 없다', async () => {
    const o = await reserveOrder(app);
    const other = await newDriver(app);
    await api().get(`/v1/orders/${o.orderId}`).set('Authorization', `Bearer ${other.token}`).expect(404);
    const pangyo = { Authorization: `Bearer ${await staffToken(app, 'pangyo')}` };
    await api().post(`/v1/store/orders/${o.orderId}/accept`).set(pangyo).expect(404);
  });

  it('매장 확인이 2분 넘게 없으면 acceptOverdue', async () => {
    const o = await reserveOrder(app);
    await prisma.order.update({ where: { id: o.orderId }, data: { sentAt: new Date(Date.now() - 121_000) } });
    const res = await api().get(`/v1/orders/${o.orderId}`).set(o.auth).expect(200);
    expect(res.body.acceptOverdue).toBe(true);
  });

  it('차량번호로 준비 완료 주문을 찾아 수령 처리', async () => {
    const o = await reserveOrder(app);
    for (const action of ['accept', 'start', 'ready']) {
      await api().post(`/v1/store/orders/${o.orderId}/${action}`).set(o.staff).expect(200);
    }
    const res = await api().post('/v1/store/pickup').set(o.staff).send({ plateNumber: o.plateNumber }).expect(200);
    expect(res.body.status).toBe('PICKED_UP');
  });
});
