# PLAY DK 2차 인증 연동 V1780

## 운영 계약

- 숲켓몬 로그인·가입 방식은 기존 개인키/닉네임 방식 그대로 유지한다.
- PLAY DK 토큰은 로그인이나 계정 생성에 사용하지 않는다.
- 이미 로그인된 숲켓몬 계정의 2차 인증 증명으로만 1회 소비한다.
- 한 숲켓몬 계정은 `WAGO` 또는 `PLAYDK` 중 하나만 연결할 수 있다.
- PLAY DK UUID 한 개와 와이고수 회원번호 한 개는 각각 하나의 숲켓몬 계정에만 연결된다.
- 와이고수 게시글 일일퀘스트는 와이고수 인증자 전용으로 유지한다.
- 공통 2차 인증 완료 보상과 CMS 인증 필터는 두 서비스 인증자를 모두 포함한다.

## Cloudflare Pages 환경 변수

아래 값은 Pages Production 환경의 서버 변수/Secret으로만 설정한다. 브라우저 JS, Git, 로그에 값을 기록하지 않는다.

- `PLAYDK_ACCESS_KEY` — Secret
- `PLAYDK_SECRET_KEY` — Secret
- `PLAYDK_BASE_URL` — 선택, 기본값 `https://www.playdk.kr`
- `PLAYDK_GAME_CODE` — 선택, 기본값 `skm`

연동 키가 외부 문서나 채팅에 평문으로 전달된 적이 있다면 Production 투입 전에 PLAY DK에서 재발급한다.

## 데이터베이스

`database/migrations/0080_v1780_secondary_verification.sql`을 적용한다. Pages 요청 경로에도 같은 스키마를 만드는 멱등 런타임 업그레이드가 있으므로 기존 운영 DB는 첫 요청에서 안전하게 보강된다.

`user_second_verifications`가 공통 인증 소유권의 기준이며, 기존 VERIFIED 와이고수 인증은 자동 백필한다. 와이고수 승인 경로에는 INSERT/UPDATE 트리거가 있어 PLAY DK 연결과의 동시 승인도 DB에서 거부한다.

## 사용자 흐름

1. 사용자는 평소와 동일하게 숲켓몬에 접속한다.
2. 메시지함의 `2차 인증`을 누른다.
3. 와이고수 댓글 인증 또는 PLAY DK 인증 버튼 중 하나를 선택한다.
4. PLAY DK 버튼은 `https://www.playdk.kr/api/v2/g/skm`으로 이동한다.
5. 복귀 URL의 `?token=`은 앱 부팅 첫 줄에서 메모리로 옮기고 즉시 주소창에서 제거한다.
6. 현재 숲켓몬 세션으로 `/api/secondary-verification/playdk`를 호출한다.
7. 서버가 HMAC으로 토큰을 한 번만 교환한 뒤 UUID를 공통 인증 테이블에 저장한다.

실패 토큰은 자동 재시도하지 않는다. 사용자는 메시지함의 PLAY DK 버튼으로 새 토큰을 발급받아 다시 시도한다.

## 복구

CMS `와고 인증·메시지` 화면의 `2차 인증 연결 현황`에서 운영자가 연결을 해제할 수 있다. 와이고수 연결 해제는 기존 인증을 PENDING으로 되돌리고, PLAY DK 연결 해제는 공통 연결 행만 제거한다. 모든 해제는 관리자 감사 로그에 기록된다.
