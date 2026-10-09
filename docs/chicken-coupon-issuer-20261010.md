# 핑두의 배민권 쿠폰 발급 계정 제한 — 2026-10-10

사용자 `핑두의 배민권 핑크빛유두 계정에서만 발급되게해`를 적용한다. 운영 DB의 닉네임 조회로 ACTIVE / OWNER인 계정 ID 1을 확인했다. 권한은 서버 인증 계정 ID와 OWNER 역할에 고정하며, 다른 계정이 같은 닉네임을 사용하거나 요청 본문에 ID·역할을 넣어도 허용하지 않는다.

- `admin/coupon-create-permanent-v3`, `admin/coupons`, `admin/coupons-v2`의 배민권 발급을 검사한다. 기존 공통 쿠폰 권한 검사 후, 배민권 조회·저장 전에 거부한다.
- 기존 배민권 쿠폰의 PATCH도 같은 계정에만 허용해 재활성화·사용 한도 증가로 발급 제한을 우회하지 못하게 한다. 저장된 쿠폰 보상 종류를 기준으로 판정한다.
- CMS는 계정 확인 후에만 배민권 보상 선택지를 추가하고 치킨 설정의 발급 바로가기를 표시한다. 강제로 선택지를 추가한 제출도 클라이언트에서 거부하며 최종 권한은 서버가 판단한다.
- 기존 일반 유저 등록·수령, 쿠폰 조회/삭제 권한, 유저관리 아이템 직접 지급, 다른 보상 쿠폰 권한은 유지한다. 인증·세션·DB/거래 기반·이벤트 설정·출시 상태를 변경하지 않는다.

## 검수와 배포 범위

- 국소적인 계정 허용 조건과 해당 CMS 표시 변경이므로 scoped 배포한다. 실제 직전 운영은 Wrangler에서 확인한 `5059c8bef9c21b33a57af912c3cd6278cf5d21ec`, Pages `300a0611-e22e-4832-b5f1-f70e0aa7d1fb`다.
- `tests/chicken-coupon-20261009.test.mjs` 기존/신규 9개 통과 후, 발견한 PATCH 우회 차단을 추가하고 `--test-name-pattern='existing ticket coupons'`로 해당 1개를 통과했다. 총 10개 검수: 발급 API 3개, 타 OWNER·ADMIN·동일 닉네임·본문 위조 거부, 거부 시 쓰기 0건, PATCH 별칭 2개 제한, 일반 쿠폰 유지, 계정당 중복/재시도/마지막 사용 경쟁/롤백.
- 실제 CMS HTML·스타일·두 쿠폰 컨트롤러와 치킨 설정을 격리 API로 검수했다. PC 1440×1000 / 모바일 390×844에서 발급 계정의 바로가기·발급 요청과 비허용 계정 3종의 숨김·위조 제출 차단을 확인했다. pageerror 0, 가로 넘침 없음. `docs/qa/chicken-coupon-issuer-20261010/`의 JSON 및 허용/차단 화면을 보존한다.
- 배포 시 공유 쿠폰 회귀 `tests/coupon-reward-cap-v1997.test.mjs`, `tests/miracle-cube-coupon-20261004.test.mjs`와 자동 Worker 컴파일을 한 번 실행한다. 이미 통과한 배민권 검사는 반복하지 않는다.
- 명령은 `npm run deploy:production -- --scoped`. `SCOPED_DEPLOY_TESTS`에 위 두 파일, `SCOPED_DEPLOY_CHECKS=[]`를 지정하고 깨끗한 범위 커밋·origin/main·출시/캐시/Hyperdrive 검사를 유지한다.
- CMS 캐시는 `chickenCoupon=20261010-issuer`, 치킨 설정 JS는 `20261010-issuer`로 갱신한다. 운영에서는 정적 파일과 API 응답만 확인하고 시험 쿠폰 발급·등록 수령을 실행하지 않는다.
