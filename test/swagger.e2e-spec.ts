import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { createTestApp } from './helpers';

describe('Swagger 문서', () => {
  let app: INestApplication;

  beforeAll(async () => {
    app = await createTestApp();
  });

  afterAll(() => app.close());

  it('/docs-json에 주요 경로와 인증 방식이 들어 있다', async () => {
    const res = await request(app.getHttpServer()).get('/docs-json').expect(200);
    const paths = Object.keys(res.body.paths);
    expect(paths).toEqual(
      expect.arrayContaining(['/v1/auth/device', '/v1/orders', '/v1/orders/{id}/telemetry', '/v1/store/orders', '/v1/dev/demo-run']),
    );
    expect(res.body.paths['/v1/orders'].post.security).toEqual([{ driver: [] }]);
    expect(res.body.paths['/v1/store/orders'].get.security).toEqual([{ staff: [] }]);
    expect(Object.keys(res.body.components.securitySchemes)).toEqual(['driver', 'staff']);
  });

  it('/docs에 Swagger UI를 띄운다', async () => {
    const res = await request(app.getHttpServer()).get('/docs/').expect(200);
    expect(res.text).toContain('swagger-ui');
  });
});
