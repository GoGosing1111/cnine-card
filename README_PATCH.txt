CNINE CMS 전용 로그인 수정 v9.84

원인:
CMS가 일반 유저용 auth/login을 사용해 OWNER 계정의 전체 프로필
(보유 카드, 출석, 최근 뽑기, 천장 등)을 생성한 뒤에야 로그인되었습니다.
OWNER 데이터가 많거나 일부 프로필 조회가 지연되면 CMS 로그인이 실패한 것처럼 보일 수 있었습니다.

수정:
- 관리자 전용 POST /api/admin/auth/login 추가
- 개인키, 관리자 권한, 계정 상태만 확인
- 전체 유저 profile()을 생성하지 않음
- 런타임 업그레이드 실행 전 관리자 인증 가능
- OWNER/ADMIN 및 세부 관리자 역할 지원
- 일반 유저 auth/login은 변경하지 않음
- 기존 관리자 dashboard 권한 검증 유지
- 퇴사 카드조각 100% 환급 v9.83 유지

포함 파일:
- functions/api/[[path]].js
- admin/index.html
- admin/admin-v984.js

적용:
프로젝트 루트에 functions와 admin 폴더를 덮어쓰세요.
