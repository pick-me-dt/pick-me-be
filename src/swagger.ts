import { INestApplication } from '@nestjs/common';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';

const DESCRIPTION = `
픽미(Pickme) 백엔드 API. 모든 경로는 \`/v1\` 아래입니다.

## 인증
- 차량 앱: \`POST /v1/auth/device\`로 받은 토큰을 **driver**에 넣습니다.
- 매장 대시보드: \`POST /v1/store-auth/login\`으로 받은 토큰을 **staff**에 넣습니다.
- 시드 데이터: 기기 ID \`emulator-001\` / 차량번호 \`12가3456\`, 직원 \`pangyo\` / \`pickme1234\`

## 실시간 이벤트 (Socket.IO)
\`io('<서버>/ws/vehicle', { auth: { token } })\` 또는 \`/ws/store\`로 접속합니다.

| 이벤트 | 매장 | 차량 | 내용 |
| --- | --- | --- | --- |
| \`order.status_changed\` | O | O | \`{ orderId, status, order }\` |
| \`order.delayed\` | O | O | \`{ orderId, delaySec, etaSec, arrivalAt }\` |
| \`eta.updated\` | O | | \`{ orderId, etaSec, arrivalAt }\` |
| \`order.lane_entered\` | O | | \`{ orderId, plateNumber, laneEnteredAt }\` |
| \`queue.alert\` | | O | \`{ orderId, cars, alternative }\` |

차량으로 가는 이벤트에는 TextToSpeech로 읽을 \`tts\` 문구가 붙습니다.
`;

/** /docs 에 Swagger UI, /docs-json 에 OpenAPI 문서를 연다 */
export function setupSwagger(app: INestApplication): void {
  const config = new DocumentBuilder()
    .setTitle('Pickme API')
    .setDescription(DESCRIPTION)
    .setVersion('0.1.0')
    .addBearerAuth({ type: 'http', scheme: 'bearer', description: '차량 앱 운전자 토큰' }, 'driver')
    .addBearerAuth({ type: 'http', scheme: 'bearer', description: '매장 직원 토큰' }, 'staff')
    .addTag('auth', '토큰 발급')
    .addTag('me', '내 정보 · 음성 결제 설정 · 자주 주문 메뉴')
    .addTag('stores', '매장 검색 · 메뉴')
    .addTag('orders', '주문 예약 · 확인 · 취소 · 조회')
    .addTag('timing', '텔레메트리 · DT 진입 · 대기열 회피')
    .addTag('store-dashboard', '매장 대시보드')
    .addTag('dev', '시연용 (ENABLE_DEV_ROUTES=true일 때만)')
    .addTag('health', '상태 확인')
    .build();
  const document = SwaggerModule.createDocument(app, config);
  SwaggerModule.setup('docs', app, document, {
    jsonDocumentUrl: 'docs-json',
    swaggerOptions: { persistAuthorization: true },
  });
}
