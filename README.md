# pick-me-be

픽미(Pickme) 백엔드 서버. 차량의 실시간 ETA에 맞춰 드라이브스루(DT) 주문을 매장에 자동 전송합니다.

- 기획서: [픽미 기획서 v1](https://app.notion.com/p/lemong23/v1-40a7a030dd2681b68a2bddbce34d0eb0)
- 설계안: [픽미 백엔드 서버 설계안](https://claude.ai/artifact/GWbLhgf3vQ58As4rmRzg5Y)

## 기술 스택

TypeScript · NestJS 11 · PostgreSQL 16 · Prisma 6 · Socket.IO

## 로컬 실행

```bash
cp .env.example .env
docker compose up -d postgres
npm install
npx prisma migrate dev
npm run db:seed
npm run start:dev
curl localhost:3000/v1/health
```

## 시드 데이터

| 구분 | 값 |
| --- | --- |
| 매장 | 픽미 DT 양재점 · 판교점 · 정자점 |
| 매장 직원 로그인 | `yangjae` · `pangyo` · `jeongja` / 비밀번호 `pickme1234` |
| 시연 차량 | 기기 ID `emulator-001`, 차량번호 `12가3456` |
| 자주 주문 메뉴 | "평소 그거" = 아메리카노 1잔 |

## 작업 방식

`main` 트렁크 기반입니다. 기능 단위로 짧은 브랜치를 만들어 PR을 열고, CI가 통과하면 스쿼시 머지합니다.
