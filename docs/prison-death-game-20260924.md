# 죽음의 눈치게임 — 2026-09-24

## 사용자 확정

- 참고 영상: https://www.youtube.com/shorts/ROWOKnxN8lk — 신문을 읽는 감시자 몰래 식사하고 시선을 들면 멈추는 경기. 브라우저에서 실제 규칙·사망 장면 확인.
- 이름: **죽음의 눈치게임**. 여러 유저가 같은 방에서 경쟁.
- **운영자가 시작할 때만 시작**. 자동 모집·자동 시작·반복 개최 없음.
- 사망 시 붉은 전체 화면에 **사망하였습니다**. **숲켓몬 전체 플레이 5분 제한**.
- 재화 소비·보상·기존 수감 형기 변경 요청 없음: 모두 추가하지 않음.

## 운영 위치와 게임 방식

행정부 → 포로수용소 → 경기장 입장. OWNER에게만 `참가 모집 열기 / 경기 시작 / 모집·경기 종료` 표시.
모집을 열고 참가자 2명 이상이 동의·신청한 뒤 직접 시작한다. 시작 후 추가 입장 불가. 최초 배포는 열린 회차가 없는 상태다.

기본 경기 규칙: 최대 100명, 시작 전 3초, 경기 90초, 24입 먼저 완료한 순서로 순위. 버튼/스페이스를 누르는 동안 먹고 손을 떼면 중단한다.
매 700ms 이상 간격으로 서버가 한 입을 인정한다. 신문 읽기 → 1.8초 시선 예고 → 감시를 모두 같은 서버 시각으로 진행한다.
감시 전환 직후 고정 350ms 전송 여유만 적용하며 클라이언트 시각·완료·진행도는 받지 않는다. 제한 시간까지 미완주했다는 이유만으로 사망 처리하지 않는다.
페이지 숨김·포인터 취소·키 해제·통신 실패 시 식사 요청을 중단한다. 진행 중 화면 닫기를 막고 재접속 시 기존 참가 기록을 복구한다.

## 저장·전체 제한

- 신규 `prison_death_*_v1` 테이블은 독립 `safe_runtime_upgrade_prison_death_game_20260924_v1` 초기화 게이트 사용. 기존 foundation 마커가 있어도 누락되지 않음.
- 한 회차만 열리도록 control 행 잠금, 참가·시작 배타 잠금, 식사 공유 잠금과 참가자 sequence CAS를 사용.
- 운영 명령 영수증·행위자 기록. 동일 요청 재전송은 새 회차·시작 시각·사망 시각을 만들지 않음.
- 사망 참가 기록 + 기존 event prison의 `DEATH_GAME` 5분 제한을 같은 DB batch에 저장. 중간 실패 전체 rollback.
- 기존 감옥·수용소 조회는 사망을 우선 반환하고, 5분 후 원래 형기를 다시 반환. 개인 제재·클랜/쿠데타 형기를 단축·삭제하지 않음.
- 일반 PVE·PVP·상점·팩·보상·클랜 등 공통 API 게이트와 감옥 채팅·타격·영치금·재판 투표 등 예외 경로 모두 차단. 로그인/로그아웃·읽기 전용 상태 확인·관리 기능은 유지.
- 사망 제한은 일반 포로 석방으로 해제하지 않음. 운영자가 경기를 종료해도 이미 발생한 5분 제한 유지.
- 미참가자는 관전만 가능, 일반 계정은 운영 명령 불가. 운영자도 참가 후 사망하면 플레이 제한을 동일하게 적용.

## 화면·자산

- 승인된 `assets/ui/prison/clan-camp-block-v2083.png` 원본 보존. 수용소의 공포스러운 공간과 금속/올리브 UI 유지.
- 전용 감시자 8포즈 투명 아틀라스: `assets/ui/prison/death-game-overseer-atlas-20260924.png`.
- PNG RGBA 1774×887, 4×2 배열, 2,025,672 bytes. SHA-256 `f7604249b037887abcd524d8785c338d2505a714c890608f714af74fe7ba0013`.
- 내장 image_gen으로 제작, 원본 유지 복사. CSS 배경 위치로 실제 신문·머리·팔·총 동작 포즈를 전환. 감시/식사/사망에 신규 합성음 없음.
- 사망 화면: 붉은 수용소 배경, 서버 기준 잔여 시간, 재접속 유지 안내, 상태 확인·로그아웃. 제한 해제는 서버 조회 후에만 수행.
- `prefers-reduced-motion`에서 동작·발광 애니메이션 제거.

### 사용한 생성 프롬프트

Use case: stylized-concept. Asset type: a single production sprite atlas for a dark prison canteen reaction game, NOT a poster and NOT a UI mockup. Create one 2048x1024 transparent PNG sprite atlas, EXACTLY four equal columns by two equal rows (each cell 512x512), 8 animation keyframes in reading order. Same original adult stern prison overseer, waist-up frontal view, dark worn olive uniform, short hair, gaunt unreadable face, seated in a high-backed steel chair; hands hold a large battered newspaper. Serious oppressive realistic painted game art, not cute, not chibi, not caricature. Cold desaturated overhead rim lighting, muted olive and charcoal with amber face highlights. Frame 1: newspaper raised over face. Frame 2: same pose slightly lowered. Frame 3: newspaper lowered enough to expose eyes glancing up. Frame 4: head fully lifted staring at viewer, newspaper at chest. Frame 5: staring straight at viewer, hostile alert posture. Frame 6: right hand reaches for a pistol while left lowers newspaper. Frame 7: right arm raised aiming a small ordinary handgun toward viewer, no flash. Frame 8: same aiming pose with restrained amber muzzle flash, no gore. Every frame is a separate complete waist-up figure, same character size, same hips baseline, same camera, consistent body and head. Each figure centered in its own exact 512 square, keep all silhouette and paper and flash within each cell with 32px transparent margin; do not let frames touch. Transparent empty background throughout, real alpha not checkerboard. No scenery, no floors, no captions, no titles, no watermark, no readable newspaper words, no cell border or numbers. The existing prison background will be composited behind this asset, so transparency is essential.

도구 출력 크기는 요청 크기와 달랐으나 2:1 배열과 실제 alpha를 검증하고 무가공 사용했다.

## 검수·배포 범위

- 기준 운영 커밋: `481b3c1eda82368ebac97772985ddf4952cb0862` (Pages `ef2cbf83-8c0a-46a7-8cc3-baf2e5962fd6`).
- 분류: **큰 변경** — 신규 다인 콘텐츠·영속 스키마·전체 플레이 제한 분기. 단순 공용 파일 수정이 아니라 공통 접근 제한 변경이므로 전체 게이트 선택.
- 배포 명령: `npm run deploy:production` 한 번. 배포 내 전체 게이트를 별도 사전 실행하지 않음.
- 신규 검사: SQLite·PostgreSQL 실제 SQL/HTTP 경로, OWNER 권한, 수동 시작, 최소 인원, 동의, 지연·중복 요청, 속도/진행 조작, 사망 저장 rollback/응답 소실, 정확한 5분 경계, 기존 형기 보존, 정상 완주·순위, 초기 null 상태·느린 폴링 역행 방지.
- 로컬 UI: `node scripts/qa-prison-death-game-20260924.mjs`. 운영 DB·계정 미사용. 운영자 `?user=999`, 참가자 `?user=101`, `?user=102`.
- 실제 브라우저: PC 1366×900, 모바일 390×844. 두 계정 모집/참가/수동 시작, 감시 중 입력 → 사망, 05:00 → 새로고침 후 04:52 유지, 모바일 식사 1입/손 해제, 참가자 동기화와 사망 표식 확인. 첫 방문 null 초기화와 모바일 배경 스크롤 개선 포함.
- 라이브 회차를 임의로 열거나 유저를 사망 처리하지 않는다. 운영자는 배포 후 직접 모집·시작한다.

### 출시 검사 중 발견한 테스트 격리 문제

첫 전체 게이트는 기존 `avatar-v1863.mjs`의 초기 스키마 17문 검사가 16문으로 나와 배포 전에 중단됐다. 운영 아바타 코드와 이 테스트는 직전 배포 이후 변경되지 않았다. Windows에서 사용하는 `--test-isolation=none` 실행 시 앞선 드롭률 테스트의 완료된 migration promise가 초기 상태 검사에 공유되는 것을 두 파일만으로 재현했다. 초기화 테스트만 고유 모듈 URL로 불러오도록 격리했고, 운영 아바타 동작과 검증 조건은 바꾸지 않았다.
