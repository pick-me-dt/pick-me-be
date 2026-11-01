import { ValidationPipe } from '@nestjs/common';
import { NestExpressApplication } from '@nestjs/platform-express';
import { join } from 'path';
import { setupSwagger } from './swagger';

/** main.ts와 e2e 테스트가 같은 설정을 쓰도록 모아 둔다. */
export function configureApp(app: NestExpressApplication): void {
  app.setGlobalPrefix('v1');
  app.enableCors();
  app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));
  // 매장 대시보드 웹 화면: /dashboard/
  app.useStaticAssets(join(__dirname, '..', 'public'), { prefix: '/dashboard/' });
  // API 문서: /docs, /docs-json
  setupSwagger(app);
}
