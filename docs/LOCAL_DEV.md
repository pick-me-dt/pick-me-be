# FE 로컬 개발 가이드

서버를 배포하지 않고, 내 PC에서 픽미 백엔드를 띄워 목데이터로 차량 앱·대시보드를 개발하는 방법입니다. Node.js나 DB를 따로 설치할 필요 없이 Docker만 있으면 됩니다.

## 1. 띄우기

준비물: [Docker Desktop](https://www.docker.com/products/docker-desktop/), git

```bash
git clone https://github.com/pick-me-dt/pick-me-be.git
cd pick-me-be
docker compose up --build -d --wait
```

처음에는 이미지 빌드로 몇 분 걸립니다. 끝나면 DB 생성 → 마이그레이션 → 목데이터 → 서버 순서로 자동으로 뜹니다.

| 확인 | 주소 |
| --- | --- |
| 상태 | http://localhost:3000/v1/health → `{"status":"ok"}` |
| API 문서(Swagger) | http://localhost:3000/docs |
| 매장 대시보드 | http://localhost:3000/dashboard/ (`yangjae` / `pickme1234`) |

| 하고 싶은 것 | 명령 |
| --- | --- |
| 끄기 (데이터 유지) | `docker compose down` |
| 최신 코드 반영 | `git pull && docker compose up --build -d --wait` |
| 서버 로그 보기 | `docker compose logs -f api` |
| DB까지 완전히 초기화 | `docker compose down -v && docker compose up --build -d --wait` |

포트가 겹치면 `API_PORT=3001 DB_PORT=5433 docker compose up --build -d --wait`처럼 바꿉니다.

## 2. 앱에서 접속할 주소

| 어디서 | Base URL |
| --- | --- |
| 같은 PC의 브라우저·웹 대시보드 | `http://localhost:3000` |
| Android 에뮬레이터 (Pleos 에뮬레이터 포함) | `http://10.0.2.2:3000` |
| 같은 와이파이의 실기기 | `http://<내 PC IP>:3000` (macOS `ipconfig getifaddr en0`, Windows `ipconfig`) |

REST는 `<Base URL>/v1/...`, WebSocket은 `<Base URL>/ws/vehicle` · `<Base URL>/ws/store`입니다.

Android 9 이상은 HTTP(평문) 접속을 기본으로 막습니다. 개발 빌드에서만 허용하세요.

```xml
<!-- res/xml/network_security_config.xml (debug 소스셋) -->
<network-security-config>
  <domain-config cleartextTrafficPermitted="true">
    <domain includeSubdomains="false">10.0.2.2</domain>
    <domain includeSubdomains="false">localhost</domain>
  </domain-config>
</network-security-config>
```

`AndroidManifest.xml`의 `<application>`에 `android:networkSecurityConfig="@xml/network_security_config"`를 추가합니다.

## 3. 로그인과 토큰

로그인 화면을 만들기 전이라면 개발용 토큰을 바로 받아 씁니다.

```bash
curl -X POST localhost:3000/v1/dev/tokens
```

`driver.token`은 시연 차량(`12가3456`)의 운전자 토큰, `staff[].token`은 매장별 직원 토큰입니다. Swagger 오른쪽 위 **Authorize**에 넣으면 화면에서 바로 호출할 수 있습니다.

실제 흐름처럼 하려면 차량 앱에서 `POST /v1/auth/device`에 아무 `deviceId`와 `plateNumber`를 보내면 됩니다. 처음 보는 기기면 사용자와 차량이 새로 만들어집니다.

## 4. 목데이터

| 구분 | 내용 |
| --- | --- |
| 매장 | 픽미 양재 DT점 · 판교 DT점 · 정자 DT점 (양재 DT점 기준으로 시연) |
| 매장 직원 | `yangjae` · `pangyo` · `jeongja` / `pickme1234` |
| 매장 설정 | 준비 3분, 입구 이후 2분 (대시보드나 `PATCH /v1/store/settings`로 변경) |
| 메뉴 | 아메리카노 · 아이스 아메리카노 4,500 / 카페라떼 · 콜드브루 5,000 / 바닐라라떼 · 녹차라떼 5,500 / 햄치즈 샌드위치 6,500 |
| 시연 차량 | 기기 ID `emulator-001`, 차량번호 `12가3456` |
| 자주 주문 메뉴 | "평소 그거"(양재 DT점 아이스 아메리카노), "출근길 세트"(카페라떼 + 샌드위치) |
| 지난 주문 | 어제 판교 DT점 수령, 3일 전 양재 DT점 수령, 5일 전 정자 DT점 미수령 종료 |
| 주문번호 | 매장별·날짜별 `P-001`부터. `/dev/reset` 직후 양재 DT점의 다음 주문은 `P-021` |

고정 ID는 `src/seed/seed.ts`의 `SEED`에 있습니다(예: 양재 DT점 `00000000-0000-4000-8000-000000000101`, 아이스 아메리카노 `00000000-0000-4000-8000-000000000206`, "평소 그거" `00000000-0000-4000-8000-000000000501`).

## 5. 자주 쓰는 시나리오

아래 예시는 `T`에 운전자 토큰, `S`에 양재 DT점 직원 토큰, `ORDER`에 주문 ID가 들어 있다고 가정합니다.

```bash
B=http://localhost:3000/v1
TOKENS=$(curl -s -X POST $B/dev/tokens)
T=$(echo "$TOKENS" | python3 -c 'import sys,json;print(json.load(sys.stdin)["driver"]["token"])')
S=$(echo "$TOKENS" | python3 -c 'import sys,json;print([s["token"] for s in json.load(sys.stdin)["staff"] if s["loginId"]=="yangjae"][0])')
```

### 시연 주문 만들기 (양재 DT점 · 아이스 아메리카노 · P-021)

```bash
curl -X POST $B/dev/reset
curl -X POST $B/orders/quote -H "Authorization: Bearer $T" -H 'Content-Type: application/json' \
  -d '{"storeId":"00000000-0000-4000-8000-000000000101","favoriteId":"00000000-0000-4000-8000-000000000501"}'
curl -X POST $B/orders -H "Authorization: Bearer $T" -H 'Content-Type: application/json' \
  -d '{"storeId":"00000000-0000-4000-8000-000000000101","favoriteId":"00000000-0000-4000-8000-000000000501","expectedTotal":4500}'
```

예약하면 바로 `PENDING_ACCEPT`(매장 확인 중)가 되고 대시보드에 `P-021`로 뜹니다.

### ETA 보내기 (NaviHelper 30초 갱신 흉내)

```bash
curl -X POST $B/orders/$ORDER/telemetry -H "Authorization: Bearer $T" -H 'Content-Type: application/json' -d '{"etaSec":600}'
```

응답의 `order.timing`에 입구 도착 예정, 예상 수령, 시작 추천이 있습니다. 같은 내용이 `eta.updated`로 차량·매장에 갑니다.

- 시작 추천 강조: 제조 시작 전에 `etaSec`를 처음보다 60초 이상 크게(또는 작게) 보내면 `order.recommendation_changed`가 옵니다.
- 제조 후 지연: 직원이 제조를 시작한 뒤 `etaSec`를 60초 이상 늘리면 `order.delayed`가 옵니다.
- ETA 끊김: 90초 넘게 보내지 않으면 `timing.etaStale`이 `true`가 되고, 점검 주기(5초) 안에 `eta.updated`가 한 번 옵니다.

### 매장 쪽 단계 넘기기 (매장 대시보드 없이)

```bash
curl -X POST $B/dev/orders/$ORDER/advance   # 매장 확인 중 → 제조 대기 → 제조 중 → 준비 완료 → 수령 완료
```

직원 동작을 하나씩 해 보려면 직원 토큰으로 `POST $B/store/orders/$ORDER/{accept|reject|start|ready|pickup}`를 부릅니다. 거절은 `{"reason":"SOLD_OUT"}`처럼 사유가 필요합니다.

### 취소 요청 화면

```bash
curl -X POST $B/orders/$ORDER/cancel -H "Authorization: Bearer $T" -H 'Content-Type: application/json' -d '{"reason":"일정 변경"}'
```

- 매장 확인 중이면 바로 `CANCELLED`.
- 수락한 뒤면 `CANCEL_REQUESTED`(취소 확인 중). 직원이 `POST $B/store/orders/$ORDER/cancel-request/approve`하면 `CANCELLED`, `.../reject`하면 원래 상태로 돌아갑니다. `advance`는 승인으로 처리합니다.

### 품절·가격 변경 화면

```bash
curl -X PATCH $B/store/menu/00000000-0000-4000-8000-000000000206 -H "Authorization: Bearer $S" -H 'Content-Type: application/json' -d '{"soldOut":true}'
```

이후 견적은 `available: false`, 예약은 409 `SOLD_OUT`과 새 견적을 돌려줍니다. 예약 때 `expectedTotal`이 실제 금액과 다르면 409 `PRICE_CHANGED`입니다. `/dev/reset`으로 품절이 풀립니다.

### DT 차로 진입

서버는 위치·저속만으로 진입을 정하지 않습니다. 운전자가 앱에서 확인하면 `POST $B/orders/$ORDER/lane-entered`, 직원이 확인하면 `POST $B/store/orders/$ORDER/lane-entered`를 부릅니다. 이후 예상 수령은 진입 시각 + 입구 이후 시간으로 고정됩니다.

### 주행 전체를 서버가 흉내 내기

```bash
curl -X POST $B/dev/demo-run -H 'Content-Type: application/json' -d '{}'                    # 시연 차량으로 새 주문
curl -X POST $B/dev/simulate/trip -H 'Content-Type: application/json' -d '{"orderId":"'$ORDER'"}'  # 내 주문에 주행 붙이기
```

입구까지 5분, 30초마다 ETA, 3분 남았을 때 1분 30초 정체(시작 추천 강조)가 기본값입니다. 실제 시간으로 흐릅니다. 빨리 보려면 `{"startEtaSec":60,"tickSec":5,"prepSec":30,"afterEntrySec":20,"autoStore":true}`처럼 줄이세요(`prepSec`·`afterEntrySec`는 `demo-run`만).

### 에뮬레이터 GPS가 한국이 아닐 때

매장 검색이 되도록 매장 3곳을 내 위치 북쪽 0.8km · 2.5km · 5km로 옮깁니다. `/dev/reset`을 부르면 원래 자리로 돌아갑니다.

```bash
curl -X POST $B/dev/stores/relocate -H 'Content-Type: application/json' -d '{"lat":37.422,"lng":-122.084}'
```

### 처음 상태로

```bash
curl -X POST $B/dev/reset   # 진행 중 주문 취소, 시뮬레이션 중지, 매장 위치·설정·품절·목데이터 복구, 다음 번호 P-021
```

## 6. WebSocket 확인

Socket.IO 클라이언트로 접속합니다. 토큰은 `auth.token`에 넣습니다. 모든 이벤트는 차량·매장 모두에 가고, 차량 쪽에만 `tts`가 붙습니다.

```js
import { io } from 'socket.io-client';

const socket = io('http://10.0.2.2:3000/ws/vehicle', { auth: { token } });
socket.on('order.status_changed', (e) => { render(e.order); speak(e.tts); });
socket.on('eta.updated', (e) => renderTiming(e.timing)); // e.timing.etaStale이면 '마지막 갱신 n초 전' 표시
socket.on('order.recommendation_changed', (e) => { highlight(e.recommendedStartAt); speak(e.tts); });
socket.on('order.delayed', (e) => speak(e.tts));
socket.on('order.accept_overdue', (e) => speak(e.tts));
```

이벤트 목록과 내용은 README와 Swagger 첫 화면에 정리돼 있습니다. 연결이 끊겼다 붙으면 `GET /v1/orders?active=true`로 상태를 다시 맞추세요.

## 7. 문제 해결

| 증상 | 확인할 것 |
| --- | --- |
| `docker compose up`이 포트 오류로 실패 | `API_PORT` · `DB_PORT`를 바꿔서 실행 |
| 에뮬레이터에서 접속이 안 됨 | `localhost`가 아니라 `10.0.2.2`인지, 평문 HTTP 허용 설정이 있는지 |
| 실기기에서 접속이 안 됨 | 같은 와이파이인지, PC 방화벽이 3000 포트를 막지 않는지 |
| 예약이 409 | `code`를 보세요. `ACTIVE_ORDER_EXISTS`(차량당 진행 중 1건, `/dev/reset`), `SOLD_OUT`, `PRICE_CHANGED`(응답의 새 `quote`로 다시 확인) |
| 매장 동작이 409 | 상태 순서를 확인하세요. 수락 전 제조 시작, 준비 완료 전 수령, 취소 확인 중 진행은 막혀 있습니다 |
| 시작 추천이 안 바뀜 | ETA가 90초 넘게 끊기면(`etaStale`) 마지막 추천을 유지합니다. 제조를 시작한 뒤에는 추천 대신 지연(`delaySec`)이 바뀝니다 |
| 서버 오류 | `docker compose logs -f api` |
