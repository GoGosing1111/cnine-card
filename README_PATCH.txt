CNINE 유저 화면 운영용 문구 정리 v9.81

기준: cnine-card(16).zip

수정 원칙:
- 유저 화면에 CMS, OWNER, ADMIN, D1, DB, API, Cloudflare Functions 등 내부 운영/개발 용어를 노출하지 않음
- 관리자 CMS 내부와 서버 권한 판정 코드는 변경하지 않음
- 내부 JSON 필드와 requestId 등 기능용 값은 호환성을 위해 유지하되 화면에 표시하지 않음

수정 내용:
- PvP 티어 안내의 CMS 문구 제거
- 일일 퀘스트 중지 안내의 CMS 문구 제거
- 레이드 개방 안내의 CMS 문구 제거
- D1/API/Cloudflare 연결 오류를 일반 서비스 안내로 변경
- 인증 게시글 미설정 문구를 사용자 안내로 변경
- OWNER/ADMIN 노출 오류를 일반 운영 계정 문구로 변경
- 개인키 재발급 안내의 관리자 표현을 운영팀으로 변경
- 레이드 보상 설명을 게임 문구로 변경

포함 파일:
- js/app.js
- functions/api/[[path]].js
- index.html

검증:
- node --check 통과
- Cloudflare esbuild 파싱 통과
- 지정된 사용자 노출 금지 문구 검사 통과
