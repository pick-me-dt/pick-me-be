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
| 매장 대시보드 | http://localhost:3000/dashboard/ (`pangyo` / `pickme1234`) |

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
| 매장 | 픽미 DT 양재점 · 판교점 · 정자점 (판교점 기준으로 시연) |
| 매장 직원 | `yangjae` · `pangyo` · `jeongja` / `pickme1234` |
| 메뉴 | 아메리카노 · 아이스 아메리카노 4,500 / 카페라떼 · 콜드브루 5,000 / 바닐라라떼 · 녹차라떼 5,500 / 햄치즈 샌드위치 6,500 |
| 시연 차량 | 기기 ID `emulator-001`, 차량번호 `12가3456` |
| 자주 주문 메뉴 | "평소 그거"(아메리카노 한 잔), "출근길 세트"(카페라떼 + 샌드위치) |
| 지난 주문 | 어제 판교점 수령, 3일 전 양재점 수령, 5일 전 정자점 미수령 취소 |
| DT 대기 | 매장마다 2대 (바꾸려면 아래 시나리오 참고) |

고정 ID는 `src/seed/seed.ts`의 `SEED`에 있습니다(예: 판교점 `00000000-0000-4000-8000-000000000102`).

## 5. 자주 쓰는 시나리오

아래 예시는 `T`에 운전자 토큰, `ORDER`에 주문 ID가 들어 있다고 가정합니다.

```bash
B=http://localhost:3000/v1
T=$(curl -s -X POST $B/dev/tokens | python3 -c 'import sys,json;print(json.load(sys.stdin)["driver"]["token"])')
```

### 에뮬레이터 GPS가 한국이 아닐 때

에뮬레이터 기본 위치(미국 마운틴뷰 등)에서도 매장 검색이 되도록 매장 3곳을 내 위치 북쪽 0.8km · 2.5km · 5km로 옮깁니다. `/dev/reset`을 부르면 원래 자리로 돌아갑니다.

```bash
curl -X POST $B/dev/stores/relocate -H 'Content-Type: application/json' -d '{"lat":37.422,"lng":-122.084}'
```

### 주문 상태 화면 확인 (매장 대시보드 없이)

주문을 만들고 `advance`를 부를 때마다 한 단계씩 넘어갑니다. 상태가 바뀔 때마다 `/ws/vehicle`로 이벤트와 TTS 문구가 옵니다.

```bash
curl -X POST $B/orders -H "Authorization: Bearer $T" -H 'Content-Type: application/json' \
  -d '{"storeId":"00000000-0000-4000-8000-000000000102","source":"VOICE","favoriteId":"00000000-0000-4000-8000-000000000501"}'
curl -X POST $B/dev/orders/$ORDER/advance   # RESERVED → SENT → PREPARING → READY → PICKED_UP
```

### 정차 후 확인(NEEDS_CONFIRMATION) 화면

자주 주문 메뉴가 아닌 메뉴를 음성으로 주문하면 확인 대기로 시작합니다. `POST /v1/orders/:id/confirm`으로 예약됩니다.

```bash
curl -X POST $B/orders -H "Authorization: Bearer $T" -H 'Content-Type: application/json' \
  -d '{"storeId":"00000000-0000-4000-8000-000000000102","source":"VOICE","items":[{"menuItemId":"00000000-0000-4000-8000-000000000207","qty":1}]}'
```

한도 초과를 보려면 `PATCH /v1/me/settings`로 `voiceLimitPerOrder`를 낮춥니다.

### 주행 → 전송 → 정체 지연 → 차로 진입 (전체 흐름)

차량 앱 대신 서버가 텔레메트리를 보내 실제 주행처럼 진행합니다. 매장 대시보드를 함께 열어 두면 주문이 뜨고 지연·차로 진입이 표시되는 것까지 볼 수 있습니다.

```bash
# 내가 만든 주문에 주행 붙이기 (10분 거리, 10배속)
curl -X POST $B/dev/simulate/trip -H 'Content-Type: application/json' \
  -d '{"orderId":"'$ORDER'","startEtaSec":600,"speedup":10,"jam":{"atEtaSec":40,"addSec":300},"autoStore":true}'

# 또는 시연 차량으로 처음부터 한 번에
curl -X POST $B/dev/demo-run -H 'Content-Type: application/json' -d '{"autoStore":true}'
```

`autoStore`를 빼면 제조 시작·준비 완료는 대시보드에서 직접 누릅니다.

### 텔레메트리를 직접 보내기

차량 앱의 텔레메트리 전송 코드를 붙이기 전에 손으로 확인할 때:

```bash
curl -X POST $B/orders/$ORDER/telemetry -H "Authorization: Bearer $T" -H 'Content-Type: application/json' \
  -d '{"lat":37.40,"lng":127.11,"speedKmh":40,"etaSec":60}'
```

응답의 `order.status`로 전송 여부를 볼 수 있습니다. 대기 차량 2대(120초)일 때는 `ETA + 120 ≤ 제조 시간 + 30`이 되어야 전송되므로, 바로 보내 보려면 대기를 0대로 줄이세요.

### DT 대기열 회피 알림

```bash
curl -X POST $B/dev/mock-dt/stores/00000000-0000-4000-8000-000000000103/queue -H 'Content-Type: application/json' -d '{"cars":8}'
```

정자점에 주문한 뒤 판교점 근처(`{"lat":37.4037,"lng":127.1112,"speedKmh":50,"etaSec":600}`)에서 텔레메트리를 보내면 `queue.alert`가 오고, `GET /v1/orders/:id/alternatives`로 판교점이 제안됩니다.

### 처음 상태로

```bash
curl -X POST $B/dev/reset   # 진행 중 주문 취소, 시뮬레이션 중지, 대기·매장 위치·목데이터 복구
```

## 6. WebSocket 확인

Socket.IO 클라이언트로 접속합니다. 토큰은 `auth.token`에 넣습니다.

```js
import { io } from 'socket.io-client';

const socket = io('http://10.0.2.2:3000/ws/vehicle', { auth: { token } });
socket.on('order.status_changed', (e) => speak(e.tts)); // e.status, e.order
socket.on('order.delayed', (e) => speak(e.tts));
socket.on('queue.alert', (e) => speak(e.tts)); // e.alternative
```

이벤트 목록과 내용은 Swagger 첫 화면에 정리돼 있습니다. 연결이 끊겼다 붙으면 `GET /v1/orders?active=true`로 상태를 다시 맞추세요.

## 7. 문제 해결

| 증상 | 확인할 것 |
| --- | --- |
| `docker compose up`이 포트 오류로 실패 | `API_PORT` · `DB_PORT`를 바꿔서 실행 |
| 에뮬레이터에서 접속이 안 됨 | `localhost`가 아니라 `10.0.2.2`인지, 평문 HTTP 허용 설정이 있는지 |
| 실기기에서 접속이 안 됨 | 같은 와이파이인지, PC 방화벽이 3000 포트를 막지 않는지 |
| 주문이 409로 실패 | 차량당 진행 중 주문은 1건. `/dev/reset` 또는 `POST /v1/orders/:id/cancel` |
| 주문이 매장으로 전송되지 않음 | 텔레메트리가 오고 있는지, 대기 차량 수 때문에 전송 시점이 늦어진 건 아닌지 |
| 서버 오류 | `docker compose logs -f api` |
