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
