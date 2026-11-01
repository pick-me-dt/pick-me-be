import { INestApplication } from '@nestjs/common';
import { AddressInfo } from 'net';
import { io, Socket } from 'socket.io-client';
import request from 'supertest';
import { MockDtAdapter } from '../src/channels/mock-dt/mock-dt.adapter';
import { SEED } from '../src/seed/seed';
import { createTestApp, newDriver, staffToken } from './helpers';

describe('매장 대시보드 · 실시간 이벤트', () => {
  let app: INestApplication;
  let baseUrl: string;
  let staff: string;
  const sockets: Socket[] = [];

  beforeAll(async () => {
    app = await createTestApp();
    await app.listen(0);
    baseUrl = `http://127.0.0.1:${(app.getHttpServer().address() as AddressInfo).port}`;
    staff = await staffToken(app, 'pangyo');
    app.get(MockDtAdapter).setQueue(SEED.stores.pangyo, 0);
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

  function next<T = Record<string, unknown>>(socket: Socket, event: string, match: (p: T) => boolean = () => true): Promise<T> {
    return new Promise((resolve) => {
      const handler = (payload: T) => {
        if (!match(payload)) return;
        socket.off(event, handler);
        resolve(payload);
      };
      socket.on(event, handler);
    });
  }

  async function reserveAndSend() {
    const d = await newDriver(app);
    const auth = { Authorization: `Bearer ${d.token}` };
    const res = await api()
      .post('/v1/orders')
      .set(auth)
      .send({ storeId: SEED.stores.pangyo, source: 'SCREEN', items: [{ menuItemId: SEED.menu.latte, qty: 1 }] })
      .expect(201);
    const orderId = res.body.order.id as string;
    return { ...d, auth, orderId };
  }

  it('전송되면 매장에는 주문이, 차량에는 TTS 문구가 실시간으로 간다', async () => {
    const storeSocket = await connect('/ws/store', staff);
    const o = await reserveAndSend();
    const vehicleSocket = await connect('/ws/vehicle', o.token);

    const toStore = next<{ orderId: string; status: string; tts?: string }>(storeSocket, 'order.status_changed', (p) => p.orderId === o.orderId);
    const toVehicle = next<{ orderId: string; status: string; tts?: string }>(vehicleSocket, 'order.status_changed', (p) => p.orderId === o.orderId);

    await api().post(`/v1/orders/${o.orderId}/telemetry`).set(o.auth).send({ lat: 37.396, lng: 127.111, speedKmh: 30, etaSec: 20 }).expect(200);

    const [s, v] = await Promise.all([toStore, toVehicle]);
    expect(s.status).toBe('SENT');
    expect(s.tts).toBeUndefined();
    expect(v.tts).toContain('매장에 보냈어요');
  });

  it('다른 매장 직원은 이 매장 이벤트를 받지 않는다', async () => {
    const other = await connect('/ws/store', await staffToken(app, 'yangjae'));
    const received: unknown[] = [];
    other.on('order.status_changed', (p) => received.push(p));
    const o = await reserveAndSend();
    await api().post(`/v1/orders/${o.orderId}/telemetry`).set(o.auth).send({ lat: 37.396, lng: 127.111, speedKmh: 30, etaSec: 20 }).expect(200);
    await new Promise((r) => setTimeout(r, 300));
    expect(received).toEqual([]);
  });

  it('잘못된 토큰으로 접속하면 끊는다', async () => {
    const socket = io(`${baseUrl}/ws/store`, { auth: { token: 'nope' }, transports: ['websocket'] });
    sockets.push(socket);
    await new Promise<void>((resolve) => socket.on('disconnect', () => resolve()));
  });

  it('대시보드: 진행 중 주문 조회 → 제조 시작 → 준비 완료 → 차량번호로 수령', async () => {
    const o = await reserveAndSend();
    await api().post(`/v1/orders/${o.orderId}/telemetry`).set(o.auth).send({ lat: 37.396, lng: 127.111, speedKmh: 30, etaSec: 20 }).expect(200);
    const auth = { Authorization: `Bearer ${staff}` };

    const list = await api().get('/v1/store/orders').set(auth).expect(200);
    const row = list.body.find((r: { id: string }) => r.id === o.orderId);
    expect(row).toMatchObject({ status: 'SENT', plateNumber: o.plateNumber });
    expect(row.etaSec).toBeLessThanOrEqual(20);

    await api().patch(`/v1/store/orders/${o.orderId}`).set(auth).send({ status: 'PREPARING' }).expect(200);
    await api().patch(`/v1/store/orders/${o.orderId}`).set(auth).send({ status: 'READY' }).expect(200);
    const picked = await api().post('/v1/store/pickup').set(auth).send({ plateNumber: o.plateNumber }).expect(200);
    expect(picked.body.status).toBe('PICKED_UP');
  });

  it('다른 매장 주문은 바꿀 수 없다', async () => {
    const o = await reserveAndSend();
    const yangjae = await staffToken(app, 'yangjae');
    await api()
      .patch(`/v1/store/orders/${o.orderId}`)
      .set('Authorization', `Bearer ${yangjae}`)
      .send({ status: 'PREPARING' })
      .expect(404);
  });

  it('매장 설정을 바꾸고 개요에서 확인한다', async () => {
    const auth = { Authorization: `Bearer ${await staffToken(app, 'jeongja')}` };
    await api().patch('/v1/store/settings').set(auth).send({ marginSec: 45 }).expect(200);
    const res = await api().get('/v1/store').set(auth).expect(200);
    expect(res.body.settings.marginSec).toBe(45);
    await api().patch('/v1/store/settings').set(auth).send({ marginSec: 30 }).expect(200);
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
