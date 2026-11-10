import { INestApplication } from '@nestjs/common';
import { NestExpressApplication } from '@nestjs/platform-express';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { configureApp } from '../src/app.setup';
import { PrismaService } from '../src/prisma/prisma.service';
import { seed, SEED } from '../src/seed/seed';

export async function createTestApp(): Promise<INestApplication> {
  // 스위퍼는 끄고, 테스트가 TimingEngine.sweep(now)를 직접 불러 시간을 다룬다
  process.env.TIMING_SWEEP_MS = '0';
  const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
  const app = moduleRef.createNestApplication<NestExpressApplication>();
  configureApp(app);
  await app.init();
  const prisma = app.get(PrismaService);
  await seed(prisma);
  // 이전 실행에서 남은 진행 중 주문을 정리한다
  await prisma.order.updateMany({
    where: { status: { in: ['PENDING_ACCEPT', 'ACCEPTED', 'PREPARING', 'READY', 'CANCEL_REQUESTED'] } },
    data: { status: 'CANCELLED', cancelReason: 'TEST_CLEANUP' },
  });
  return app;
}

export async function driverToken(app: INestApplication, deviceId: string = SEED.deviceId): Promise<string> {
  const res = await request(app.getHttpServer())
    .post('/v1/auth/device')
    .send({ deviceId, plateNumber: SEED.plateNumber })
    .expect(200);
  return res.body.accessToken;
}

export async function staffToken(app: INestApplication, loginId = 'yangjae'): Promise<string> {
  const res = await request(app.getHttpServer())
    .post('/v1/store-auth/login')
    .send({ loginId, password: SEED.staffPassword })
    .expect(200);
  return res.body.accessToken;
}

let deviceSeq = 0;

/** 테스트마다 새 차량으로 등록한다. 진행 중 주문이 겹치지 않게 하기 위함 */
export async function newDriver(app: INestApplication) {
  const deviceId = `e2e-${process.pid}-${Date.now()}-${++deviceSeq}`;
  const plateNumber = `${10 + (deviceSeq % 90)}테${String(Date.now()).slice(-4)}`;
  const res = await request(app.getHttpServer()).post('/v1/auth/device').send({ deviceId, plateNumber }).expect(200);
  return { token: res.body.accessToken as string, userId: res.body.userId as string, vehicleId: res.body.vehicleId as string, plateNumber };
}

/** 주문을 예약하고 매장 직원 토큰까지 준비한다 */
export async function reserveOrder(
  app: INestApplication,
  opts: { storeId?: string; menuItemId?: string; staffLoginId?: string } = {},
) {
  const d = await newDriver(app);
  const auth = { Authorization: `Bearer ${d.token}` };
  const res = await request(app.getHttpServer())
    .post('/v1/orders')
    .set(auth)
    .send({
      storeId: opts.storeId ?? SEED.stores.yangjae,
      items: [{ menuItemId: opts.menuItemId ?? SEED.menu.icedAmericano, qty: 1 }],
    })
    .expect(201);
  const staff = { Authorization: `Bearer ${await staffToken(app, opts.staffLoginId ?? 'yangjae')}` };
  return { ...d, auth, staff, orderId: res.body.order.id as string, order: res.body.order };
}
