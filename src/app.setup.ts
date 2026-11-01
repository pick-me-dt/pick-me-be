import { INestApplication, ValidationPipe } from '@nestjs/common';

/** main.ts와 e2e 테스트가 같은 설정을 쓰도록 모아 둔다. */
export function configureApp(app: INestApplication): void {
  app.setGlobalPrefix('v1');
  app.enableCors();
  app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));
}
