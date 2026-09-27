# 군단토벌 OWNER 입장 무제한 — 2026-09-27

사용자 지시: `OWNER 계정 군단토벌 무제한으로 바꿔라`.

## 적용 범위

- 인증된 OWNER는 모든 난이도에서 일일 입장 제한 없이 시작·재도전한다. 기존 2/2 소진 기록이 있어도 허용하고, 기존 기록을 지우거나 추가 차감하지 않는다.
- 기존 bootstrap/start/begin 응답의 `entries`에 `unlimited:true`, `limit:null`, `remaining:null`을 제공한다. 화면의 하루 입장·오늘 입장·시작 안내는 무제한으로 표시한다.
- 일반 계정 기준 하루 2회와 현재 OWNER 전용 공개, 실계정 보상 OFF, 15분 토벌·최종 보스·1배속은 유지한다. 요청 본문으로 OWNER/무제한 값을 지정할 수 없다.
- 인증·공통 DB/잠금·CMS·보상 로직을 변경하지 않는다. 기존 계정별 세션 읽기와 CAS 저장을 재사용하며 쿼리·테이블·폴링을 추가하지 않는다.

## 재현과 인접 오류

수정 전 일일 기록 2회를 가진 OWNER의 start 응답에서 `409 HUNT_DAILY_LIMIT`을 재현했다. 제한 판단은 서버에서 인증한 role에만 의존하며 일반 역할의 하루 2회 정책은 보존한다.

실제 모바일 입장 검수 중 기존 군단토벌 번들이 공용 래퍼보다 오래되어 일반 전투 엔진으로 교체되고 12슬롯에서 `INVALID_MONSTER_SLOT`이 발생하는 문제를 발견했다. 전용 빌드 스크립트로 군단토벌 번들만 현재 소스에서 재생성하고 전투 페이지 캐시 키를 갱신했다. 공용 엔진/래퍼 소스와 다른 콘텐츠 번들은 수정하지 않는다. 실제 배포 번들 버전을 읽어 래퍼가 전용 엔진을 교체하지 않는 회귀검사를 추가했다.

## 범위 배포

Pages 목록으로 확인한 직전 운영 배포: `e6ee7d83-e1ff-4f66-98a9-1f3106ce0d45`, 소스 `21567e406eac2d5d934dcfb77bca3f9252928f52`. 그 이후 선행된 베르칸 배포 영수증·용병 수동 지급 기록은 문서 변경이며 그대로 보존한다.

`npm run deploy:production -- --scoped`를 사용한다. 해당 기능의 입장 예외와 표시·전용 번들 버전 동기화에 한정하며 인증 기반·공통 DB·의존성·마이그레이션 변경은 없다.

선택 검사:

- `tests/legion-hunt-duration-entries-20260926.test.mjs`: 기존 소진 계정의 반복 입장, SQLite/PostgreSQL, 실패·응답 유실·동시 begin·KST 경계·세션 만료, 일반 역할 정책, 기존 15분·1배속 계약.
- `tests/legion-hunt-owner-cms-20260926.test.mjs`: OWNER 전용 접근·보상 OFF·CMS 보존·드랍 영수증 재시도와 원자성.
- `tests/legion-hunt-entry-account-20260926.test.mjs`: 실제 계정 편성·진입 화면·전용 번들과 공용 래퍼 버전 연결.
- `tests/pve-battlefield-entry-v2117.test.mjs`: 실제 메인 PVE/PVP 로더와 공용 번들 연결.

Worker 검사·출시 플래그·캐시·Hyperdrive 캐시 OFF·깨끗한 커밋과 origin/main 일치 검사를 유지한다. 운영 전 PC·390px 모바일 화면과 실제 군단토벌 입장/철수/재입장, 배포 후 변경 파일 반영만 확인한다.

로컬 실제 API 핸들러·격리 DB에서 PC와 390×844 모바일의 무제한 표시, 토벌 시작 → 30마리 처치 → 철수 → 같은 난이도 재도전 → 전투 재개 → 로비 복귀를 확인했다. 복귀 후에도 무제한과 활성화된 입장 버튼이 유지되며 브라우저 오류 로그는 0건이다. 화면은 작업 트리 상위 `qa/legion-owner-unlimited-desktop.png`, `qa/legion-owner-unlimited-mobile.png`에 보존했다.
