import { INestApplication } from '@nestjs/common';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';

const DESCRIPTION = `
픽미(Pickme) 백엔드 API (2차 기획). 모든 경로는 \`/v1\` 아래입니다.

## 인증
- 차량 앱: \`POST /v1/auth/device\`로 받은 토큰을 **driver**에 넣습니다.
- 매장 대시보드: \`POST /v1/store-auth/login\`으로 받은 토큰을 **staff**에 넣습니다.
- 시드 데이터: 기기 ID \`emulator-001\` / 차량번호 \`12가3456\`, 직원 \`yangjae\` / \`pickme1234\`. 개발용 토큰은 \`POST /v1/dev/tokens\`.

## 주문 흐름
예약 확정 → **PENDING_ACCEPT**(매장 확인 중) → 수락 **ACCEPTED**(제조 대기) → 제조 시작 **PREPARING** → **READY** → **PICKED_UP**.
거절은 **REJECTED**. 수락 후 운전자 취소는 **CANCEL_REQUESTED**(취소 확인 중)를 거쳐 매장이 승인(**CANCELLED**)하거나 거절(원래 상태)합니다.

## 예상 수령·시작 추천
예상 수령 = 입구 도착 예정(NaviHelper ETA) + 입구 이후 시간, 시작 추천 = 예상 수령 - 준비 시간. 주문의 \`timing\`에 있습니다.

## 실시간 이벤트 (Socket.IO)
\`io('<서버>/ws/vehicle', { auth: { token } })\` 또는 \`/ws/store\`로 접속합니다. 모든 이벤트는 차량·매장 모두에 가고, 차량 쪽에만 TextToSpeech용 \`tts\`가 붙습니다.

| 이벤트 | 내용 |
| --- | --- |
| \`order.status_changed\` | \`{ orderId, status, order }\` |
| \`eta.updated\` | \`{ orderId, status, timing }\` ETA 갱신·끊김 |
| \`order.recommendation_changed\` | \`{ orderId, deltaSec, emphasize, recommendedStartAt, timing }\` 제조 전, 60초 이상 변경 |
| \`order.delayed\` | \`{ orderId, delaySec, expectedPickupAt, timing }\` 제조 후, 60초 이상 지연 |
| \`order.accept_overdue\` | \`{ orderId, sentAt }\` 매장 확인 2분 초과 |
| \`order.lane_entered\` | \`{ orderId, orderNo, plateNumber, laneEnteredAt, timing }\` |
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
    .addTag('timing', 'ETA 갱신 · DT 진입')
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
