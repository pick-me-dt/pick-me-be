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

  it('시드 계정 토큰으로 바로 API를 부를 수 있다', async () => {
    const tokens = await api().post('/v1/dev/tokens').expect(200);
    expect(tokens.body.staff.map((s: { loginId: string }) => s.loginId)).toEqual(['jeongja', 'pangyo', 'yangjae']);

    const me = await api().get('/v1/me').set('Authorization', `Bearer ${tokens.body.driver.token}`).expect(200);
    expect(me.body.vehicle.plateNumber).toBe(SEED.plateNumber);

    const pangyo = tokens.body.staff.find((s: { loginId: string }) => s.loginId === 'pangyo');
    await api().get('/v1/store').set('Authorization', `Bearer ${pangyo.token}`).expect(200);
  });

  it('시드 차량에는 주문 내역 화면용 지난 주문이 있다', async () => {
    // 테스트가 시드 차량으로 만든 주문이 쌓여 있을 수 있어 API(최근 20건) 대신 DB로 확인한다
    const past = await app.get(PrismaService).order.findMany({
      where: { id: { in: Object.values(SEED.pastOrders) } },
      orderBy: { createdAt: 'desc' },
      include: { payment: true },
    });
    expect(past.map((o) => [o.status, o.payment?.status])).toEqual([
      ['PICKED_UP', 'CAPTURED'],
      ['PICKED_UP', 'CAPTURED'],
      ['CANCELLED', 'VOIDED'],
    ]);
  });

  it('매장을 내 위치 근처로 옮기면 검색되고, reset하면 원래 자리로 돌아간다', async () => {
    const tokens = await api().post('/v1/dev/tokens').expect(200);
    const auth = { Authorization: `Bearer ${tokens.body.driver.token}` };
    const mountainView = { lat: 37.422, lng: -122.084 };

    await api().post('/v1/dev/stores/relocate').send(mountainView).expect(200);
    const near = await api().post('/v1/stores/search').set(auth).send({ ...mountainView, radiusM: 10_000 }).expect(200);
    expect(near.body).toHaveLength(3);
    expect(near.body[0].distanceM).toBeLessThan(1_000);

    await api().post('/v1/dev/reset').expect(200);
    const store = await app.get(PrismaService).store.findUniqueOrThrow({ where: { id: SEED.stores.pangyo } });
    expect(store.lat).toBeCloseTo(37.3947, 4);
  });

  it('advance로 매장 대시보드 없이 주문을 끝까지 넘긴다', async () => {
    await api().post('/v1/dev/reset').expect(200);
    const tokens = await api().post('/v1/dev/tokens').expect(200);
    const res = await api()
      .post('/v1/orders')
      .set('Authorization', `Bearer ${tokens.body.driver.token}`)
      .send({ storeId: SEED.stores.pangyo, source: 'VOICE', items: [{ menuItemId: SEED.menu.greenTeaLatte, qty: 1 }] })
      .expect(201);
    expect(res.body.order.status).toBe('NEEDS_CONFIRMATION');

    const statuses: string[] = [];
    for (let i = 0; i < 5; i++) {
      const step = await api().post(`/v1/dev/orders/${res.body.order.id}/advance`).expect(200);
      statuses.push(step.body.status);
    }
    expect(statuses).toEqual(['RESERVED', 'SENT', 'PREPARING', 'READY', 'PICKED_UP']);
    await api().post(`/v1/dev/orders/${res.body.order.id}/advance`).expect(409);
  });

  it('reset은 진행 중 주문을 모두 취소한다', async () => {
    const tokens = await api().post('/v1/dev/tokens').expect(200);
    await api()
      .post('/v1/orders')
      .set('Authorization', `Bearer ${tokens.body.driver.token}`)
      .send({ storeId: SEED.stores.pangyo, source: 'VOICE', favoriteId: SEED.favoriteId })
      .expect(201);
    const reset = await api().post('/v1/dev/reset').expect(200);
    expect(reset.body.cancelledOrders).toBeGreaterThanOrEqual(1);
    const active = await api().get('/v1/orders?active=true').set('Authorization', `Bearer ${tokens.body.driver.token}`).expect(200);
    expect(active.body).toEqual([]);
  });
});
