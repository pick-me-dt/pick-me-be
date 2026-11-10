import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { PrismaService } from '../src/prisma/prisma.service';
import { SEED } from '../src/seed/seed';
import { createTestApp } from './helpers';

describe('FE 로컬 개발용 dev API', () => {
  let app: INestApplication;

  beforeAll(async () => {
    app = await createTestApp();
  });

  afterAll(async () => {
    // 다른 테스트가 원래 매장 위치를 쓰도록 되돌린다
    await request(app.getHttpServer()).post('/v1/dev/reset').expect(200);
    await app.close();
  });

  const api = () => request(app.getHttpServer());
  const driver = async () => (await api().post('/v1/dev/tokens').expect(200)).body.driver.token as string;

  it('시드 계정 토큰으로 바로 API를 부를 수 있다', async () => {
    const tokens = await api().post('/v1/dev/tokens').expect(200);
    expect(tokens.body.staff.map((s: { loginId: string }) => s.loginId)).toEqual(['jeongja', 'pangyo', 'yangjae']);
    const me = await api().get('/v1/me').set('Authorization', `Bearer ${tokens.body.driver.token}`).expect(200);
    expect(me.body.vehicle.plateNumber).toBe(SEED.plateNumber);
  });

  it('시드: 지난 주문, 자주 주문 "평소 그거" = 양재 DT점 아이스 아메리카노', async () => {
    const prisma = app.get(PrismaService);
    const past = await prisma.order.findMany({
      where: { id: { in: Object.values(SEED.pastOrders) } },
      orderBy: { createdAt: 'desc' },
      include: { payment: true },
    });
    expect(past.map((o) => [o.status, o.payment?.status])).toEqual([
      ['PICKED_UP', 'CAPTURED'],
      ['PICKED_UP', 'CAPTURED'],
      ['CANCELLED', 'VOIDED'],
    ]);
    const usual = await prisma.favorite.findUniqueOrThrow({ where: { id: SEED.favoriteId } });
    expect(usual).toMatchObject({ alias: '평소 그거', storeId: SEED.stores.yangjae, items: [{ menuItemId: SEED.menu.icedAmericano, qty: 1 }] });
  });

  it('reset 후 양재 DT점의 다음 주문번호는 P-021', async () => {
    await api().post('/v1/dev/reset').expect(200);
    const res = await api()
      .post('/v1/orders')
      .set('Authorization', `Bearer ${await driver()}`)
      .send({ storeId: SEED.stores.yangjae, favoriteId: SEED.favoriteId })
      .expect(201);
    expect(res.body.order).toMatchObject({ orderNo: 'P-021', status: 'PENDING_ACCEPT' });
    expect(res.body.order.items[0].name).toBe('아이스 아메리카노');
  });

  it('매장을 내 위치 근처로 옮기면 검색되고, reset하면 원래 자리로 돌아간다', async () => {
    const auth = { Authorization: `Bearer ${await driver()}` };
    const mountainView = { lat: 37.422, lng: -122.084 };
    await api().post('/v1/dev/stores/relocate').send(mountainView).expect(200);
    const near = await api().post('/v1/stores/search').set(auth).send({ ...mountainView, radiusM: 10_000 }).expect(200);
    expect(near.body).toHaveLength(3);

    await api().post('/v1/dev/reset').expect(200);
    const store = await app.get(PrismaService).store.findUniqueOrThrow({ where: { id: SEED.stores.pangyo } });
    expect(store.lat).toBeCloseTo(37.3947, 4);
  });

  it('advance로 매장 대시보드 없이 주문을 끝까지 넘긴다', async () => {
    await api().post('/v1/dev/reset').expect(200);
    const res = await api()
      .post('/v1/orders')
      .set('Authorization', `Bearer ${await driver()}`)
      .send({ storeId: SEED.stores.pangyo, items: [{ menuItemId: SEED.menu.greenTeaLatte, qty: 1 }] })
      .expect(201);
    const statuses: string[] = [];
    for (let i = 0; i < 4; i++) {
      statuses.push((await api().post(`/v1/dev/orders/${res.body.order.id}/advance`).expect(200)).body.status);
    }
    expect(statuses).toEqual(['ACCEPTED', 'PREPARING', 'READY', 'PICKED_UP']);
    await api().post(`/v1/dev/orders/${res.body.order.id}/advance`).expect(409);
  });

  it('advance는 취소 확인 중이면 매장 승인으로 넘긴다', async () => {
    await api().post('/v1/dev/reset').expect(200);
    const auth = { Authorization: `Bearer ${await driver()}` };
    const res = await api().post('/v1/orders').set(auth).send({ storeId: SEED.stores.yangjae, favoriteId: SEED.favoriteId }).expect(201);
    const id = res.body.order.id;
    await api().post(`/v1/dev/orders/${id}/advance`).expect(200);
    const requested = await api().post(`/v1/orders/${id}/cancel`).set(auth).send({}).expect(200);
    expect(requested.body.status).toBe('CANCEL_REQUESTED');
    const approved = await api().post(`/v1/dev/orders/${id}/advance`).expect(200);
    expect(approved.body.status).toBe('CANCELLED');
  });

  it('reset은 진행 중 주문을 모두 취소한다', async () => {
    const auth = { Authorization: `Bearer ${await driver()}` };
    await api().post('/v1/orders').set(auth).send({ storeId: SEED.stores.yangjae, favoriteId: SEED.favoriteId }).expect(201);
    const reset = await api().post('/v1/dev/reset').expect(200);
    expect(reset.body.cancelledOrders).toBeGreaterThanOrEqual(1);
    const active = await api().get('/v1/orders?active=true').set(auth).expect(200);
    expect(active.body).toEqual([]);
  });
});
