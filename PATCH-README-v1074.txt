씨켓몬 V1074 - 와고 닉네임 클릭 코인 지급 확장프로그램

[적용 파일]
- functions/api/[[path]].js
- chrome-extension/*

[주요 동작]
- 와고 닉네임 클릭
- 기존 wago_verifications VERIFIED 기록 조회
- 와고 닉네임과 다른 씨켓몬 닉네임 자동 연결
- 내부 user_id 기준 코인 즉시 지급
- 1회 지급 한도 1~1,000,000 코인
- 동일 요청 ID 중복 지급 방지
- 동일 게시글/댓글 + 동일 사유 중복 지급 차단
- 현재 VERIFIED 연결 관계를 지급 시 서버에서 재검증
- 정지 계정 지급 차단
- coin_logs 및 admin_logs 기록
- 지급 전/후 잔액 영수증 기록

[안전 업그레이드]
- CREATE TABLE IF NOT EXISTS wago_extension_reward_receipts
- CREATE INDEX IF NOT EXISTS만 사용
- app_meta safe_runtime_upgrade_v1074_wago_extension_rewards 추가
- 기존 테이블 삭제/재생성/초기화 없음

[확장프로그램 설치]
1. 배포 ZIP을 프로젝트에 덮어쓰고 Git push
2. chrome-extension 폴더를 별도 위치에 압축 해제
3. chrome://extensions → 개발자 모드 ON
4. 압축해제된 확장 프로그램 로드 → chrome-extension 폴더 선택
5. 확장프로그램 아이콘 → CMS 열기
6. OWNER 또는 코인 지급 권한 관리자 로그인
7. 와고 닉네임 클릭 후 지급
