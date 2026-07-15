CNINE 유저 세션 유지 패치 v9.76

수정:
- /me와 pvp/config 초기 요청 분리
- PvP/네트워크/5xx 오류로 로그아웃하지 않음
- /me의 명확한 401에서만 토큰 복구 시도
- 저장된 개인키로 자동 재로그인
- 자동 복구 실패 시 개인키와 유저 로컬 정보 보존
- 토큰 localStorage/sessionStorage 이중 저장
- 서버 세션 만료 7일 이하 시 30일로 자동 연장
- 명시적 로그아웃 때만 계정 로컬 정보 삭제

변경 파일:
- js/app.js
- functions/api/[[path]].js
- index.html

D1 구조 변경 없음. 기존 API 경로 변경 없음.
