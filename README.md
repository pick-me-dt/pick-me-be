# pick-me-be

픽미(Pickme) 백엔드 서버. 차량의 실시간 ETA에 맞춰 드라이브스루(DT) 주문을 매장에 자동 전송합니다.

- 기획서: [픽미 기획서 v1](https://app.notion.com/p/lemong23/v1-40a7a030dd2681b68a2bddbce34d0eb0)
- 설계안: [픽미 백엔드 서버 설계안](https://claude.ai/artifact/GWbLhgf3vQ58As4rmRzg5Y)

## 작업 방식

`main` 트렁크 기반입니다. 기능 단위로 짧은 브랜치를 만들어 PR을 열고, 테스트가 통과하면 `main`에 머지합니다.
