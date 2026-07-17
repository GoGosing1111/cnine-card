CNINE CARD v1027 PVE 자동사냥 추가 패치

적용 파일
- app.js
- style.css
- functions/api/[[path]].js
- database/migrations/0028_v1027_pve_auto_hunt.sql

적용 내용
- PVE 몬스터 선택 화면에 자동사냥 체크 추가
- 체크 후 전투 시작 시 현재 남은 전투 횟수를 서버에서 연속 처리
- 승/패/총 코인/카드 획득 결과 표시
- 자동사냥 사용자별 동시 실행 잠금
- request_id 영수증으로 동일 요청 보상 중복 지급 차단
- 전투 횟수 조건부 차감으로 다중 창 동시 요청 방어
- 로그인 시 같은 계정의 기존 세션 종료

D1 적용
npx wrangler d1 execute <DB_NAME> --remote --file=database/migrations/0028_v1027_pve_auto_hunt.sql

주의
- v1026 통합본 위에 덮어쓰는 추가 패치입니다.
- 기존 cards, user_cards, user_inventory 테이블은 수정하지 않습니다.
