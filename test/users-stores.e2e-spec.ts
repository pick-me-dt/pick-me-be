import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { SEED } from '../src/seed/seed';
import { createTestApp, driverToken, staffToken } from './helpers';

describe('인증 · 사용자 · 매장', () => {
  let app: INestApplication;
  let token: string;

  beforeAll(async () => {
    app = await createTestApp();
    token = await driverToken(app);
  });

  afterAll(() => app.close());

  it('토큰 없이 /me를 부르면 401', () => request(app.getHttpServer()).get('/v1/me').expect(401));

  it('매장 직원 토큰으로 /me를 부르면 403', async () => {
    const staff = await staffToken(app);
    await request(app.getHttpServer()).get('/v1/me').set('Authorization', `Bearer ${staff}`).expect(403);
  });

  it('틀린 비밀번호로 직원 로그인하면 401', () =>
    request(app.getHttpServer()).post('/v1/store-auth/login').send({ loginId: 'yangjae', password: 'x' }).expect(401));

  it('등록된 기기로 내 정보와 차량번호를 조회한다', async () => {
    const res = await request(app.getHttpServer()).get('/v1/me').set('Authorization', `Bearer ${token}`).expect(200);
    expect(res.body.vehicle.plateNumber).toBe(SEED.plateNumber);
    expect(res.body.settings.voiceOrderEnabled).toBe(true);
  });

  it('자주 주문 메뉴를 등록하고 삭제한다', async () => {
    const server = app.getHttpServer();
    const auth = { Authorization: `Bearer ${token}` };
    const created = await request(server)
      .post('/v1/me/favorites')
      .set(auth)
      .send({ alias: '라떼 두 잔', items: [{ menuItemId: SEED.menu.latte, qty: 2 }] })
      .expect(201);

    const list = await request(server).get('/v1/me/favorites').set(auth).expect(200);
    expect(list.body.map((f: { alias: string }) => f.alias)).toContain('라떼 두 잔');

    await request(server).delete(`/v1/me/favorites/${created.body.id}`).set(auth).expect(204);
  });

  it('없는 메뉴로 자주 주문 메뉴를 만들면 400', () =>
    request(app.getHttpServer())
      .post('/v1/me/favorites')
      .set('Authorization', `Bearer ${token}`)
      .send({ alias: 'x', items: [{ menuItemId: '00000000-0000-4000-8000-0000000009ff', qty: 1 }] })
      .expect(400));

  it('진행 방향 앞의 매장만 가까운 순으로 돌려준다', async () => {
    const search = (headingDeg: number) =>
      request(app.getHttpServer())
        .post('/v1/stores/search')
        .set('Authorization', `Bearer ${token}`)
        // 양재점에서 1km 북쪽
        .send({ lat: 37.4795, lng: 127.035, headingDeg, radiusM: 20_000 })
        .expect(200);

    const south = await search(160);
    expect(south.body.map((s: { id: string }) => s.id)).toEqual([
      SEED.stores.yangjae,
      SEED.stores.pangyo,
      SEED.stores.jeongja,
    ]);

    const north = await search(0);
    expect(north.body).toEqual([]);
  });

  it('매장 메뉴를 조회한다', async () => {
    const res = await request(app.getHttpServer())
      .get(`/v1/stores/${SEED.stores.pangyo}/menu`)
      .set('Authorization', `Bearer ${token}`)
      .expect(200);
    expect(res.body.items.find((i: { id: string }) => i.id === SEED.menu.americano).price).toBe(4500);
  });
});
