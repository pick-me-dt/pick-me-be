import { INestApplication } from '@nestjs/common';
import { AddressInfo } from 'net';
import { io, Socket } from 'socket.io-client';
import request from 'supertest';
import { SEED } from '../src/seed/seed';
import { createTestApp, newDriver, reserveOrder, staffToken } from './helpers';

describe('매장 대시보드 · 실시간 이벤트 (2차 기획)', () => {
  let app: INestApplication;
  let baseUrl: string;
  const sockets: Socket[] = [];

  beforeAll(async () => {
    app = await createTestApp();
    await app.listen(0);
    baseUrl = `http://127.0.0.1:${(app.getHttpServer().address() as AddressInfo).port}`;
  });

  afterAll(async () => {
    sockets.forEach((s) => s.disconnect());
    await app.close();
  });

  const api = () => request(app.getHttpServer());

  function connect(namespace: string, token: string): Promise<Socket> {
    const socket = io(`${baseUrl}${namespace}`, { auth: { token }, transports: ['websocket'] });
    sockets.push(socket);
    return new Promise((resolve, reject) => {
      socket.on('connect', () => resolve(socket));
      socket.on('connect_error', reject);
    });
  }

  function next<T = Record<string, unknown>>(socket: Socket, event: string, match: (p: T) => boolean): Promise<T> {
    return new Promise((resolve) => {
      const handler = (payload: T) => {
        if (!match(payload)) return;
        socket.off(event, handler);
        resolve(payload);
      };
      socket.on(event, handler);
    });
  }

  type Payload = { orderId: string; status?: string; tts?: string; timing?: { recommendedStartAt: string } };

  it('예약하면 매장에 바로 뜨고, 수락하면 차량에 TTS가 간다. ETA 갱신은 차량·매장 모두에 간다', async () => {
    const storeSocket = await connect('/ws/store', await staffToken(app, 'yangjae'));
    const d = await newDriver(app);
    const vehicleSocket = await connect('/ws/vehicle', d.token);
    const auth = { Authorization: `Bearer ${d.token}` };

    const created = next<Payload>(storeSocket, 'order.status_changed', (p) => p.status === 'PENDING_ACCEPT');
    const res = await api()
      .post('/v1/orders')
      .set(auth)
      .send({ storeId: SEED.stores.yangjae, favoriteId: undefined, items: [{ menuItemId: SEED.menu.icedAmericano, qty: 1 }] })
      .expect(201);
    const orderId = res.body.order.id;
    expect((await created).orderId).toBe(orderId);

    const staff = { Authorization: `Bearer ${await staffToken(app, 'yangjae')}` };
    const accepted = next<Payload>(vehicleSocket, 'order.status_changed', (p) => p.orderId === orderId && p.status === 'ACCEPTED');
    await api().post(`/v1/store/orders/${orderId}/accept`).set(staff).expect(200);
    expect((await accepted).tts).toContain('매장이 주문을 수락했어요');

    const etaToStore = next<Payload>(storeSocket, 'eta.updated', (p) => p.orderId === orderId);
    const etaToVehicle = next<Payload>(vehicleSocket, 'eta.updated', (p) => p.orderId === orderId);
    await api().post(`/v1/orders/${orderId}/telemetry`).set(auth).send({ etaSec: 400 }).expect(200);
    const [s, v] = await Promise.all([etaToStore, etaToVehicle]);
    expect(s.timing?.recommendedStartAt).toBeDefined();
    expect(s.tts).toBeUndefined();
    expect(v.timing?.recommendedStartAt).toBe(s.timing?.recommendedStartAt);
  });

  it('다른 매장 직원은 이 매장 이벤트를 받지 않는다', async () => {
    const other = await connect('/ws/store', await staffToken(app, 'pangyo'));
    const received: unknown[] = [];
    other.on('order.status_changed', (p) => received.push(p));
    await reserveOrder(app);
    await new Promise((r) => setTimeout(r, 300));
    expect(received).toEqual([]);
  });

  it('잘못된 토큰으로 접속하면 끊는다', async () => {
    const socket = io(`${baseUrl}/ws/store`, { auth: { token: 'nope' }, transports: ['websocket'] });
    sockets.push(socket);
    await new Promise<void>((resolve) => socket.on('disconnect', () => resolve()));
  });

  it('매장 목록에 매장 확인 중·취소 확인 중까지 보이고, 예상 수령 순으로 정렬된다', async () => {
    const late = await reserveOrder(app);
    const soon = await reserveOrder(app);
    await api().post(`/v1/orders/${late.orderId}/telemetry`).set(late.auth).send({ etaSec: 900 }).expect(200);
    await api().post(`/v1/orders/${soon.orderId}/telemetry`).set(soon.auth).send({ etaSec: 120 }).expect(200);
    await api().post(`/v1/store/orders/${late.orderId}/accept`).set(late.staff).expect(200);
    await api().post(`/v1/orders/${late.orderId}/cancel`).set(late.auth).send({}).expect(200);

    const list = await api().get('/v1/store/orders').set(soon.staff).expect(200);
    const ids = list.body.map((r: { id: string }) => r.id);
    expect(ids.indexOf(soon.orderId)).toBeLessThan(ids.indexOf(late.orderId));
    expect(list.body.find((r: { id: string }) => r.id === late.orderId).status).toBe('CANCEL_REQUESTED');
  });

  it('준비 시간·입구 이후 시간을 바꾸면 시작 추천에 바로 반영된다', async () => {
    const staff = { Authorization: `Bearer ${await staffToken(app, 'jeongja')}` };
    await api().patch('/v1/store/settings').set(staff).send({ prepSec: 300, afterEntrySec: 60 }).expect(200);
    try {
      const o = await reserveOrder(app, { storeId: SEED.stores.jeongja, staffLoginId: 'jeongja' });
      const res = await api().post(`/v1/orders/${o.orderId}/telemetry`).set(o.auth).send({ etaSec: 600 }).expect(200);
      const t = res.body.order.timing;
      expect(Date.parse(t.expectedPickupAt) - Date.parse(t.entranceArrivalAt)).toBe(60_000);
      expect(Date.parse(t.expectedPickupAt) - Date.parse(t.recommendedStartAt)).toBe(300_000);
      const overview = await api().get('/v1/store').set(staff).expect(200);
      expect(overview.body.settings).toMatchObject({ prepSec: 300, afterEntrySec: 60 });
    } finally {
      await api().patch('/v1/store/settings').set(staff).send({ prepSec: 180, afterEntrySec: 120 }).expect(200);
    }
  });

  it('품절 메뉴 목록과 설정', async () => {
    const staff = { Authorization: `Bearer ${await staffToken(app, 'pangyo')}` };
    await api().patch(`/v1/store/menu/${SEED.menu.latte}`).set(staff).send({ soldOut: true }).expect(200);
    const menu = await api().get('/v1/store/menu').set(staff).expect(200);
    expect(menu.body.find((m: { id: string }) => m.id === SEED.menu.latte).soldOut).toBe(true);
    await api().patch(`/v1/store/menu/${SEED.menu.latte}`).set(staff).send({ soldOut: false }).expect(200);
  });

  it('운전자 토큰으로 대시보드 API를 부르면 403', async () => {
    const d = await newDriver(app);
    await api().get('/v1/store/orders').set('Authorization', `Bearer ${d.token}`).expect(403);
  });

  it('대시보드 웹 화면을 내려준다', async () => {
    const res = await api().get('/dashboard/').expect(200);
    expect(res.text).toContain('픽미 매장 대시보드');
  });
});
