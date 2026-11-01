# pick-me-be

픽미(Pickme) 백엔드 서버. 차량의 실시간 ETA에 맞춰 드라이브스루(DT) 주문을 매장에 자동 전송해, 창구에 닿는 순간 메뉴가 나오게 합니다.

- 기획서: [픽미 기획서 v1](https://app.notion.com/p/lemong23/v1-40a7a030dd2681b68a2bddbce34d0eb0)
- 설계안: [픽미 백엔드 서버 설계안](https://claude.ai/artifact/GWbLhgf3vQ58As4rmRzg5Y)

```
차량 앱(Pleos) ──REST·WebSocket──▶ 픽미 서버 ──채널 어댑터──▶ 목업 DT 매장
                                   │  타이밍 엔진 · 주문 상태 머신 · 결제 어댑터(목업)
                                   └──WebSocket──▶ 매장 대시보드(/dashboard/)
```

## 기술 스택

TypeScript · NestJS 11 · PostgreSQL 16 · Prisma 6 · Socket.IO

Pleos Connect SDK(NaviHelper, Vehicle, FusedLocation, Gleo)는 차량 앱(Android)에서 씁니다. 서버는 차량 앱이 SDK로 읽은 ETA·위치·주행 상태를 REST로 받습니다.

## 로컬 실행

```bash
cp .env.example .env
docker compose up -d postgres
npm install
npx prisma migrate dev
npm run db:seed
npm run start:dev
```

- API: `http://localhost:3000/v1`
- 매장 대시보드: `http://localhost:3000/dashboard/` (아이디 `pangyo`, 비밀번호 `pickme1234`)
- Android 에뮬레이터에서 로컬 서버에 접속할 때는 `http://10.0.2.2:3000`

| 환경 변수 | 설명 | 기본값 |
| --- | --- | --- |
| `DATABASE_URL` | PostgreSQL 연결 문자열 | |
| `JWT_SECRET` | 토큰 서명 키 | |
| `PORT` | 포트 | `3000` |
| `ENABLE_DEV_ROUTES` | 시연용 `/v1/dev/*` 사용 여부. 운영에서는 `false` | |
| `TIMING_SWEEP_MS` | 타이밍 엔진 주기 점검 간격(ms). `0`이면 끔 | `5000` |

## 시연하기

차량 앱 없이도 서버만으로 시연 영상의 흐름(음성 주문 → 전송 → 정체 지연 → DT 진입 → 준비 완료)을 재현할 수 있습니다.

1. 매장 대시보드를 열고 `pangyo` / `pickme1234`로 로그인합니다.
2. 시연을 시작합니다.

   ```bash
   curl -X POST localhost:3000/v1/dev/demo-run -H 'Content-Type: application/json' -d '{"autoStore": true}'
   ```

   시연 차량(`12가3456`)이 "평소 그거"(아메리카노 한 잔)를 음성으로 주문하고, 판교점까지 10분 거리를 10배속으로 달립니다. 도착 2분쯤 전에 주문이 대시보드에 뜨고, 도착 40초 전 정체로 지연이 표시된 뒤, DT 차로 진입과 준비 완료까지 이어집니다.

| 옵션 | 설명 | 기본값 |
| --- | --- | --- |
| `storeId` | 매장 | 판교점 |
| `startEtaSec` | 출발 시점 남은 시간(초) | `600` |
| `speedup` | 배속 | `10` |
| `tickSec` | 텔레메트리 간격(시뮬레이션 초) | `5` |
| `jam` | 정체 `{ atEtaSec, addSec }` | `{ 40, 300 }` |
| `queueCars` | 매장 DT 대기 차량 수. 대기 시간이 제조 시간보다 길면 주문은 차로 진입 직전에 전송됩니다 | `0` |
| `autoStore` | 제조 시작·준비 완료를 자동으로 누름. `false`면 대시보드에서 직접 누름 | `false` |

엔진은 실제 시계로 지연을 재므로, 배속 중에는 대시보드에 표시되는 지연이 `jam.addSec`보다 짧습니다(기본값, 10배속에서 약 4분).

응답의 `driverToken`으로 `/ws/vehicle`에 접속하면 차량 쪽 TTS 문구도 받아볼 수 있습니다.

## 시드 데이터

| 구분 | 값 |
| --- | --- |
| 매장 | 픽미 DT 양재점 · 판교점 · 정자점 |
| 매장 직원 | `yangjae` · `pangyo` · `jeongja` / `pickme1234` |
| 메뉴 | 아메리카노 4,500 · 카페라떼 5,000 · 바닐라라떼 5,500 · 콜드브루 5,000 · 햄치즈 샌드위치 6,500 |
| 시연 차량 | 기기 ID `emulator-001`, 차량번호 `12가3456` |
| 자주 주문 메뉴 | "평소 그거" = 아메리카노 한 잔 |

## 핵심 동작

### 주문 상태

```
NEEDS_CONFIRMATION ─확인─▶ RESERVED ─타이밍 엔진─▶ SENT ─매장 접수─▶ PREPARING ─제조 완료─▶ READY ─차량번호 매칭─▶ PICKED_UP
            └──────────────────────┴───────────────────┴─────────────────┴──────────────┴──▶ CANCELLED
```

- 결제는 `SENT`에서 승인, `PICKED_UP`에서 확정, `CANCELLED`에서 승인 취소합니다.
- 음성 주문은 다음 중 하나라도 해당하면 `NEEDS_CONFIRMATION`으로 시작하고, 정차 중 화면 확인(`/confirm`)을 받아야 예약됩니다: 음성 결제 꺼짐, 자주 주문 메뉴가 아님, 1회 한도 초과, 1일 한도 초과.
- 자동 취소: 예약 후 10분간 텔레메트리 없음(`EXPIRED`), 준비 완료 후 15분 미수령(`NO_SHOW`).

### 전송 시점

```
ETA + 대기줄 시간(대기 차량 × 차량당 처리 시간) <= 제조 시간 + 여유
```

- ETA: 차량 앱이 보낸 NaviHelper ETA. 없으면 `직선거리 × 1.3 ÷ max(속도, 20km/h)`
- 제조 시간: `max(매장 기본 제조 시간, 품목 최대 제조 시간) + 추가 품목당 20초`, 제조 중 주문 1건당 ×1.1
- 전송 후에도 ETA를 매장에 공유하고, 도착이 전송 때보다 2분 이상 늦어지면 지연을 알립니다.
- 차량이 DT 차로 지오펜스 안에서 15km/h 이하면 차로 진입으로 처리합니다(차량 앱이 직접 알려도 됨).

## API

모든 경로는 `/v1` 아래입니다. 인증은 `Authorization: Bearer <token>`.

### 차량 앱 (운전자 토큰)

| 메서드 · 경로 | 설명 |
| --- | --- |
| `POST /auth/device` | 기기 등록, 토큰 발급 `{ deviceId, plateNumber, name?, model? }` (토큰 불필요) |
| `GET /me` | 내 정보, 차량, 음성 결제 설정 |
| `PATCH /me/settings` | `{ voiceOrderEnabled?, voiceLimitPerOrder?, voiceLimitDaily? }` |
| `GET /me/favorites` · `POST /me/favorites` · `DELETE /me/favorites/:id` | 자주 주문 메뉴 `{ alias, storeId?, items: [{ menuItemId, qty }] }` |
| `POST /stores/search` | 경로상 매장 후보 + 대기 정보 `{ lat, lng, headingDeg?, radiusM?, routePoints? }` |
| `GET /stores/:id/menu` | 메뉴 |
| `POST /orders/quote` | 금액·예상 제조 시간·재확인 문구 `{ storeId, favoriteId? \| items? }` |
| `POST /orders` | 주문 예약 `{ storeId, source: VOICE \| SCREEN, favoriteId? \| items? }`, `Idempotency-Key` 헤더 지원 |
| `POST /orders/:id/confirm` | 정차 중 확인 |
| `POST /orders/:id/telemetry` | `{ etaSec?, lat, lng, speedKmh, gear?, recordedAt? }`, 5~10초 간격 |
| `POST /orders/:id/lane-entered` | DT 차로 진입 |
| `GET /orders/:id/alternatives` | 더 빨리 받을 수 있는 매장 |
| `POST /orders/:id/change-store` | 전송 전 매장 변경 `{ storeId }` |
| `POST /orders/:id/cancel` | 취소 |
| `GET /orders/:id` · `GET /orders?active=true` | 조회 |

Gleo App Schema의 주문 예약·취소·상태 조회 함수는 각각 `POST /orders`, `POST /orders/:id/cancel`, `GET /orders?active=true`에 대응합니다. 응답의 `tts` 필드는 TextToSpeech로 그대로 읽으면 됩니다.

### 매장 대시보드 (직원 토큰)

| 메서드 · 경로 | 설명 |
| --- | --- |
| `POST /store-auth/login` | `{ loginId, password }` (토큰 불필요) |
| `GET /store` | 매장, DT 대기, 설정 |
| `GET /store/orders` | 전송된 진행 중 주문. 도착 예정 시각·남은 시간·지연 시간 포함, 도착 순 |
| `PATCH /store/orders/:id` | `{ status: PREPARING \| READY \| PICKED_UP \| CANCELLED }` |
| `POST /store/pickup` | 차량번호로 수령 `{ plateNumber }` |
| `PATCH /store/settings` | `{ basePrepSec?, serviceSecPerCar?, marginSec?, isOpen? }` |

### 시연용 (`ENABLE_DEV_ROUTES=true`)

| 메서드 · 경로 | 설명 |
| --- | --- |
| `POST /dev/demo-run` | 시연 한 번에 실행 (위 옵션 참고) |
| `POST /dev/simulate/trip` | 기존 주문에 주행 시뮬레이션 `{ orderId, ...옵션 }` |
| `GET /dev/simulate` · `DELETE /dev/simulate/:orderId` | 실행 중 시뮬레이션 조회·중지 |
| `POST /dev/mock-dt/stores/:id/queue` | 목업 DT 대기 차량 수 `{ cars }` |
| `POST /dev/seed` | 시드 데이터 다시 넣기 |

### WebSocket (Socket.IO)

`io('<서버>/ws/store', { auth: { token } })` 또는 `/ws/vehicle`로 접속합니다.

| 이벤트 | 매장 | 차량 | 내용 |
| --- | --- | --- | --- |
| `order.status_changed` | O | O | `{ orderId, status, order }` |
| `order.delayed` | O | O | `{ orderId, delaySec, etaSec, arrivalAt }` |
| `eta.updated` | O | | `{ orderId, etaSec, arrivalAt }` (10초 간격) |
| `order.lane_entered` | O | | `{ orderId, plateNumber, laneEnteredAt }` |
| `queue.alert` | | O | `{ orderId, cars, alternative }` |

차량으로 가는 이벤트에는 `tts` 문구가 붙습니다. 연결이 끊기면 `GET /orders?active=true`로 상태를 다시 맞춥니다.

## 프로젝트 구조

```
src/
  auth/            기기·직원 토큰, 역할 가드
  users/           내 정보, 음성 결제 설정, 자주 주문 메뉴
  stores/          매장 검색, 메뉴
  orders/          주문 API, 상태 머신, TTS 문구
  timing/          타이밍 엔진, 텔레메트리, 추정식
  queue/           DT 대기 시간
  channels/        채널 어댑터, 목업 DT
  payments/        결제 어댑터, 목업 결제
  realtime/        WebSocket 게이트웨이
  store-dashboard/ 매장 대시보드 API
  dev/             시연 시뮬레이터
public/            매장 대시보드 웹 화면
prisma/            스키마, 마이그레이션, 시드
test/              e2e 테스트
```

## 테스트

```bash
npm test           # 단위 테스트
npm run test:e2e   # e2e 테스트 (PostgreSQL 필요)
```

## 작업 방식

`main` 트렁크 기반입니다. 기능 단위로 짧은 브랜치를 만들어 PR을 열고, CI(마이그레이션 → 타입 체크 → 단위·e2e 테스트 → 빌드)가 통과하면 스쿼시 머지합니다.
