# pick-me-be

픽미(Pickme) 백엔드 서버. 운전자가 주차 중에 '이 메뉴로 예약'하면 바로 드라이브스루(DT) 매장에 공유하고, 차량의 NaviHelper ETA로 예상 수령 시각과 제조 시작 추천 시각을 계산해 매장과 차량에 함께 보여 줍니다. 제조를 언제 시작할지는 직원이 정합니다.

- 기획서: [픽미 기획서 v1](https://app.notion.com/p/lemong23/v1-40a7a030dd2681b68a2bddbce34d0eb0), 2차 기획안
- 설계안: [픽미 백엔드 서버 설계안](https://claude.ai/artifact/GWbLhgf3vQ58As4rmRzg5Y) (1차 기준)

```
차량 앱(Pleos) ──REST·WebSocket──▶ 픽미 서버 ──채널 어댑터──▶ 목업 DT 매장
                                   │  주문 상태 머신 · 예상 수령 계산 · 결제 어댑터(목업)
                                   └──WebSocket──▶ 매장 대시보드(/dashboard/)
```

## 기술 스택

TypeScript · NestJS 11 · PostgreSQL 16 · Prisma 6 · Socket.IO

Pleos Connect SDK는 차량 앱(Android)에서 씁니다. 서버는 차량 앱이 NaviHelper로 읽은 매장 입구까지의 ETA를 REST로 받습니다.

## 로컬 실행

**FE(차량 앱·대시보드) 개발자**는 Docker만 있으면 됩니다. 명령 한 번으로 DB, 마이그레이션, 목데이터, 서버가 뜹니다. 접속 주소, 개발용 토큰, 목데이터 시나리오는 [FE 로컬 개발 가이드](docs/LOCAL_DEV.md)를 보세요.

```bash
docker compose up --build -d --wait
```

**BE 개발자**는 DB만 Docker로 띄우고 서버는 watch 모드로 실행합니다.

```bash
cp .env.example .env
docker compose up -d postgres
npm install
npx prisma migrate dev
npm run db:seed
npm run start:dev
```

- API: `http://localhost:3000/v1`
- API 문서(Swagger): `http://localhost:3000/docs` (OpenAPI JSON: `/docs-json`)
- 매장 대시보드: `http://localhost:3000/dashboard/` (아이디 `yangjae`, 비밀번호 `pickme1234`)
- Android 에뮬레이터에서 로컬 서버에 접속할 때는 `http://10.0.2.2:3000`

| 환경 변수 | 설명 | 기본값 |
| --- | --- | --- |
| `DATABASE_URL` | PostgreSQL 연결 문자열 | |
| `JWT_SECRET` | 토큰 서명 키 | |
| `PORT` | 포트 | `3000` |
| `ENABLE_DEV_ROUTES` | 시연용 `/v1/dev/*` 사용 여부. 운영에서는 `false` | |
| `TIMING_SWEEP_MS` | ETA 끊김·매장 응답 지연 점검 간격(ms). `0`이면 끔 | `5000` |

## 시연하기

차량 앱 없이도 서버만으로 2차 기획 시연 흐름을 재현할 수 있습니다.

1. 매장 대시보드를 열고 `yangjae` / `pickme1234`로 로그인합니다.
2. 시연을 시작합니다.

   ```bash
   curl -X POST localhost:3000/v1/dev/demo-run -H 'Content-Type: application/json' -d '{}'
   ```

   시연 차량(`12가3456`)이 양재 DT점에 "평소 그거"(아이스 아메리카노)를 예약하면 `P-021`로 대시보드 '매장 확인 중'에 뜹니다. 30초마다 ETA가 갱신되고, 입구까지 3분 남은 지점에서 1분 30초 정체가 생겨 제조 시작 추천이 늦춰지며 강조됩니다. 수락·제조 시작·준비 완료·수령은 대시보드에서 직접 누릅니다.

| 옵션 | 설명 | 기본값 |
| --- | --- | --- |
| `storeId` | 매장 | 양재 DT점 |
| `startEtaSec` | 출발 시점 입구까지 남은 시간(초). 실제 시간으로 흐름 | `300` |
| `tickSec` | ETA 전송 간격(초) | `30` |
| `jam` | 정체 `{ atEtaSec, addSec }`: 남은 시간이 `atEtaSec`일 때 `addSec`만큼 늦어짐 | `{ 180, 90 }` |
| `prepSec` · `afterEntrySec` | 시연 매장의 준비 시간·입구 이후 시간을 이 값으로 바꿈 | 시드값 180 · 120 |
| `autoStore` | 수락·제조 시작(시작 추천 시각에)·준비 완료를 자동으로 누름 | `false` |

예상 수령·시작 추천은 절대 시각으로 계산하므로 배속 없이 실제 시간으로 흐릅니다. 응답의 `driverToken`으로 `/ws/vehicle`에 접속하면 차량 쪽 TTS 문구도 받아볼 수 있습니다.

## 시드 데이터

| 구분 | 값 |
| --- | --- |
| 매장 | 픽미 양재 DT점 · 판교 DT점 · 정자 DT점 (준비 3분, 입구 이후 2분) |
| 매장 직원 | `yangjae` · `pangyo` · `jeongja` / `pickme1234` |
| 메뉴 | 아메리카노 · 아이스 아메리카노 4,500 · 카페라떼 · 콜드브루 5,000 · 바닐라라떼 · 녹차라떼 5,500 · 햄치즈 샌드위치 6,500 |
| 시연 차량 | 기기 ID `emulator-001`, 차량번호 `12가3456` |
| 자주 주문 메뉴 | "평소 그거"(양재 DT점 아이스 아메리카노), "출근길 세트"(카페라떼 + 샌드위치) |
| 지난 주문 | 어제 판교 DT점 수령, 3일 전 양재 DT점 수령, 5일 전 정자 DT점 미수령 종료 |
| 주문번호 | 매장별·날짜별(KST) `P-001`부터. 시드와 `/dev/reset`은 오늘 양재 DT점의 다음 번호를 `P-021`로 맞춤 |

## 핵심 동작

### 주문 상태

```
예약 확정 ─▶ PENDING_ACCEPT ─수락─▶ ACCEPTED ─제조 시작─▶ PREPARING ─▶ READY ─수령 확인─▶ PICKED_UP
             매장 확인 중       │      제조 대기     │          제조 중       준비 완료      수령 완료
                               거절▶ REJECTED        └── 운전자 취소 요청 ─▶ CANCEL_REQUESTED ─승인▶ CANCELLED
                                                                              취소 확인 중   └거절▶ 요청 전 상태
```

- 예약 확정 직후 매장에 공유합니다. 수락 없이 제조를 시작할 수 없습니다.
- 운전자 취소: 매장 확인 중이면 바로 취소, 수락한 뒤면 취소 확인 중이 되고 매장이 승인·거절합니다. 승인 전에는 취소 완료로 표시하지 않습니다.
- 미수령·ETA 끊김으로 자동 취소하지 않습니다. 직원이 '주문 종료'(미수령 `NO_SHOW`, 매장 사정 `STORE`)로 끝냅니다.
- 목업 결제: 예약 확정 때 승인, 수령 완료 때 확정, 거절·취소 때 승인 취소.
- 품절이거나 견적 때와 금액이 다르면 예약은 409(`SOLD_OUT` · `PRICE_CHANGED`)와 새 견적을 돌려줍니다.

### 예상 수령과 제조 시작 추천

```
예상 수령 = 입구 도착 예정(ETA 수신 시각 + ETA) + 입구 이후 시간
시작 추천 = 예상 수령 - 준비 시간
```

- 준비 시간·입구 이후 시간은 매장이 대시보드에서 입력합니다(기본 3분 · 2분).
- 차량 앱은 NaviHelper ETA를 30초마다 보냅니다. 갱신될 때마다 차량·매장 모두에 `eta.updated`를 보냅니다.
- 제조 전: 시작 추천이 60초 이상 바뀌면 `order.recommendation_changed`로 강조해 알립니다.
- 제조 후: 시작한 제조는 되돌리지 않고, 제조 시작 때의 예상 수령보다 60초 이상 늦어지면 `order.delayed`로 지연을 공유합니다.
- ETA가 90초 넘게 끊기면 `timing.etaStale`이 `true`가 되고, 마지막 갱신 시각과 마지막 추천을 그대로 보여 줍니다.
- 위치·저속만으로 DT 진입을 확정하지 않습니다. 운전자(`/orders/:id/lane-entered`)나 직원(`/store/orders/:id/lane-entered`)이 알려 줍니다.
- 매장 확인 중으로 2분이 지나면 `acceptOverdue`가 `true`가 되고 `order.accept_overdue`를 한 번 보냅니다.

## API

모든 경로는 `/v1` 아래입니다. 인증은 `Authorization: Bearer <token>`.

요청·응답 스키마까지 보려면 서버를 띄우고 [Swagger](http://localhost:3000/docs)를 여세요. 오른쪽 위 **Authorize**에 `driver`(기기 등록 토큰)나 `staff`(직원 로그인 토큰)를 넣으면 화면에서 바로 호출해 볼 수 있습니다.

### 차량 앱 (운전자 토큰)

| 메서드 · 경로 | 설명 |
| --- | --- |
| `POST /auth/device` | 기기 등록, 토큰 발급 `{ deviceId, plateNumber, name?, model? }` (토큰 불필요) |
| `GET /me` | 내 정보, 차량 |
| `GET /me/favorites` · `POST /me/favorites` · `DELETE /me/favorites/:id` | 자주 주문 메뉴 `{ alias, storeId?, items: [{ menuItemId, qty }] }` |
| `POST /stores/search` | 매장 후보 `{ lat, lng, headingDeg?, radiusM?, routePoints? }` |
| `GET /stores/:id/menu` | 메뉴 |
| `POST /orders/quote` | 견적: 금액·품절·준비 시간·확인 문구 `{ storeId, favoriteId? \| items? }` |
| `POST /orders` | 예약 확정 → 매장 확인 중 `{ storeId, favoriteId? \| items?, expectedTotal? }`, `Idempotency-Key` 헤더 지원 |
| `POST /orders/:id/telemetry` | NaviHelper ETA `{ etaSec, lat?, lng?, speedKmh?, gear? }`, 30초마다 |
| `POST /orders/:id/lane-entered` | 운전자가 DT 차로 진입을 확인 |
| `POST /orders/:id/cancel` | 취소 요청 `{ reason? }` |
| `GET /orders/:id` · `GET /orders?active=true` | 조회. 재연결 후 상태를 다시 맞출 때 |

주문 응답의 `timing`에 `etaSec`, `etaUpdatedAt`, `etaStale`, `entranceArrivalAt`, `expectedPickupAt`, `recommendedStartAt`, `delaySec`가 있습니다. 응답과 이벤트의 `tts` 필드는 TextToSpeech로 그대로 읽으면 됩니다.

### 매장 대시보드 (직원 토큰)

| 메서드 · 경로 | 설명 |
| --- | --- |
| `POST /store-auth/login` | `{ loginId, password }` (토큰 불필요) |
| `GET /store` | 매장, 설정(준비 시간·입구 이후 시간), DT 대기 |
| `GET /store/orders` | 진행 중 주문 (매장 확인 중 ~ 취소 확인 중), 예상 수령 순 |
| `POST /store/orders/:id/accept` · `reject` | 수락 · 거절 `{ reason: SOLD_OUT \| BUSY \| CLOSED \| OTHER, note? }` |
| `POST /store/orders/:id/start` · `ready` · `pickup` | 제조 시작 · 준비 완료 · 수령 완료 |
| `POST /store/orders/:id/lane-entered` | 직원이 DT 차로 진입을 확인 |
| `POST /store/orders/:id/cancel-request/approve` · `reject` | 취소 요청 승인 · 거절 `{ note? }` |
| `POST /store/orders/:id/cancel` | 주문 종료 `{ reason: NO_SHOW \| STORE, note? }` |
| `POST /store/pickup` | 차량번호로 준비 완료 주문을 찾아 수령 완료 `{ plateNumber }` |
| `PATCH /store/settings` | `{ prepSec?, afterEntrySec?, serviceSecPerCar?, isOpen? }` |
| `GET /store/menu` · `PATCH /store/menu/:menuItemId` | 메뉴와 품절 · 품절 설정 `{ soldOut }` |

### 시연용 (`ENABLE_DEV_ROUTES=true`)

| 메서드 · 경로 | 설명 |
| --- | --- |
| `POST /dev/demo-run` | 시연 한 번에 실행 (위 옵션 참고) |
| `POST /dev/simulate/trip` | 기존 주문에 주행 시뮬레이션 `{ orderId, ...옵션 }` |
| `GET /dev/simulate` · `DELETE /dev/simulate/:orderId` | 실행 중 시뮬레이션 조회·중지 |
| `POST /dev/tokens` | 시드 차량 운전자 토큰, 매장별 직원 토큰 |
| `POST /dev/reset` | 진행 중 주문 취소, 시뮬레이션 중지, 매장 위치·설정·품절·목데이터 복구, 양재 DT점 다음 번호 `P-021` |
| `POST /dev/stores/relocate` | 시드 매장을 기준점 근처로 옮기기 `{ lat, lng }` |
| `POST /dev/orders/:id/advance` | 주문을 다음 단계로 (수락 → 제조 시작 → 준비 완료 → 수령, 취소 확인 중은 승인) |
| `POST /dev/mock-dt/stores/:id/queue` | 목업 DT 대기 차량 수 `{ cars }` (매장 검색 표시용) |
| `POST /dev/seed` | 시드 데이터 다시 넣기 |

### WebSocket (Socket.IO)

`io('<서버>/ws/store', { auth: { token } })` 또는 `/ws/vehicle`로 접속합니다. 모든 이벤트는 차량·매장 모두에 가고, 차량으로 가는 이벤트에만 `tts`가 붙습니다.

| 이벤트 | 내용 |
| --- | --- |
| `order.status_changed` | `{ orderId, status, order }` |
| `eta.updated` | `{ orderId, status, timing }` ETA 갱신, ETA 끊김 |
| `order.recommendation_changed` | `{ orderId, deltaSec, emphasize, previousRecommendedStartAt, recommendedStartAt, timing }` 제조 전 |
| `order.delayed` | `{ orderId, delaySec, expectedPickupAt, plannedPickupAt, timing }` 제조 후 |
| `order.accept_overdue` | `{ orderId, sentAt }` 매장 확인 2분 초과 |
| `order.lane_entered` | `{ orderId, orderNo, plateNumber, laneEnteredAt, timing }` |

연결이 끊기면 `GET /orders?active=true`로 상태를 다시 맞춥니다.

## 후속 범위

2차 기획에서 후속으로 미룬 기능입니다. 데이터나 코드 일부가 남아 있지만 주문 흐름에는 쓰지 않습니다.

- 음성 주문·Gleo: `source: VOICE`와 음성 결제 설정(`/me/settings`)은 남겨 두었고, 확인 대기·한도 판단은 하지 않습니다.
- DT 대기열 회피: 매장 검색의 대기 차량 표시만 남았습니다.
- 지오펜스 진입 감지, FusedLocation 기반 ETA 추정

## 프로젝트 구조

```
src/
  auth/            기기·직원 토큰, 역할 가드
  users/           내 정보, 자주 주문 메뉴
  stores/          매장 검색, 메뉴
  orders/          주문 API, 상태 머신, 주문번호, TTS 문구
  timing/          예상 수령·시작 추천 계산, ETA 저장, 추천 변경·지연·끊김 알림
  queue/           DT 대기 표시, 차로 진입 기록
  channels/        채널 어댑터, 목업 DT
  payments/        결제 어댑터, 목업 결제
  realtime/        WebSocket 게이트웨이
  store-dashboard/ 매장 대시보드 API
  dev/             시연 시뮬레이터, 목데이터 조작
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

`main` 트렁크 기반입니다. 기능 단위로 짧은 브랜치를 만들어 PR을 열고, CI(마이그레이션 → 타입 체크 → 단위·e2e 테스트 → 빌드, docker compose 기동)가 통과하면 스쿼시 머지합니다.
