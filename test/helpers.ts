import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { configureApp } from '../src/app.setup';
import { PrismaService } from '../src/prisma/prisma.service';
import { seed, SEED } from '../src/seed/seed';

export async function createTestApp(): Promise<INestApplication> {
  const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
  const app = moduleRef.createNestApplication();
  configureApp(app);
  await app.init();
  await seed(app.get(PrismaService));
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
