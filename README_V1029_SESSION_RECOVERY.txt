CNINE CARD v1029 로그인 세션 긴급 복구 패치

적용 파일
- functions/api/[[path]].js
- database/migrations/0029_v1029_session_recovery.sql

수정 내용
- sessions.user_id 유니크 인덱스 제거
- 배포 시 기존 로그인 세션 일괄 삭제 금지
- 새 로그인 요청이 발생할 때만 동일 계정의 이전 세션 교체
- PVE 자동사냥 동시 실행 잠금과 중복 보상 방지는 그대로 유지

D1 긴급 적용
npx wrangler d1 execute <DB_NAME> --remote --file=database/migrations/0029_v1029_session_recovery.sql

이미 만료·삭제된 로그인 토큰은 복원할 수 없으므로 적용 후 한 번 다시 로그인해야 합니다.
