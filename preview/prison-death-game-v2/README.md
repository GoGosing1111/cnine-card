# 죽음의 눈치게임 — 4인 식탁·입력 동기화·빠른 간수

## 사용자 확정과 적용

- 한 식탁에 네 명이 둘러앉고 **실제 정원도 4명**. 기존 더 큰 회차의 참가 기록을 강제로 삭제하지 않는다.
- 스페이스 또는 식탁 클릭/터치 한 번마다 즉시 숟가락을 움직인다. 키 자동 반복/홀드 자동 식사/쿨다운 입력 예약 없음. 스크롤 드래그는 식사 입력으로 취급하지 않는다.
- 모든 참가자·관전자는 동일 서버 회차와 참가자 식사 기록을 본다. 로컬에서는 모션만 선행하며, 음식 수·승리·사망은 서버가 확정한다.
- 후속 난이도 상향: 읽기 2.8~6.2초 미만 → **1.0~2.8초 미만**, 예고 1.8초 → **0.65초**, 감시 1.8~4.1초 미만 → **1.1~2.8초 미만**, 발각 유예 0.35초 → **0.1초**. 매 회차 서버 난수로 불규칙하게 만든다. 700ms 입력 간격/24입/90초/사망 5분은 유지.
- OWNER 수동 모집·수동 시작과 기존 권한·5분 제한 트랜잭션은 유지. 운영 회차나 유저 계정에 검수용 참가·시작·사망을 실행하지 않는다.

## 동기화 구현

실제 파일: `functions/_prison_death_game.js`, `js/prison-death-game-20260924.js`, `css/prison-death-game-20260924.css`.

공개 참가자 기록에 `lastBiteAt`/`lastSeq`를 반환한다. 식사 완료 영수증과 관전 상태가 같은 시각·순번을 사용한다. 새 이벤트만 재생하며 지연 상태 응답은 최신 상태를 되돌리지 않는다. 본인은 HTTP 응답 전에 동작을 시작하고 결과 수치는 그대로 둔다. 실패 시 예측 모션을 취소한다.

실행 중 약 200ms 시작 간격의 단일 상태 요청(동시 폴링 없음), 비활성 창은 3초, 오류는 2초 재시도. WebSocket 구현으로 보고하지 않는다. 다른 화면에는 폴링 주기와 네트워크 지연이 존재한다. 요청 왕복 중간 시각으로 서버 시계를 보정하며, 예고/감시는 확인된 종료 시각에 따라 로컬에서도 전환한다. 연결이 늦다고 안전한 읽기 시간을 추측하지 않는다.

모션은 680ms의 실제 포즈 전환: 뜨기(0~120), 들기(120~250), 입에 넣기(250~460), 내려놓기(460~680). 관전자도 서버 이벤트 경과 시간에 해당하는 프레임을 표시한다. 마지막 한 입도 FINISHED 상태에서 끝까지 표시한다. 감소한 완두콩·좌석 이름·순위는 서버 기록만 사용한다. 긴 닉네임은 좌석에서 줄임, 전체 명단에서는 줄바꿈하며 HTML 이스케이프한다.

## 안전한 독립 프리뷰

주소: `/preview/prison-death-game-v2/`. 운영자 시작 대기 / 4인 식사 체험 / 관전자 시점 / 사망 연출을 제공한다.

체험은 메모리 전용 NPC 시뮬레이션이며 **실제 계정, API, 재화, 제재와 연결되지 않는다**. CSP `connect-src 'none'` 및 fetch/storage 미사용. 실제 게임의 동일 CSS/JS를 로드하고 `apiRequest`만 메모리 응답으로 대체한다. 응답 지연 120ms로 입력 선행 모션을 확인한다. NPC 체험은 실제 다인 서버 동기화 검증을 대체하지 않는다.

## 검수와 배포 범위

- 직전 운영 소스: `7184b8b19a03b59fa859f1f550cabb8bb2f3a69b` (Pages `4d3d073d`).
- **국소 변경**: 기존 미니게임의 정원 상수·공개 동작 시각·입력/시각화·순찰 난이도. 스키마/공통 인증/제재 저장 기반/런타임 의존성은 변경하지 않음.
- 관련 검사: `tests/prison-death-game-20260924.test.mjs`, `tests/prison-death-game-four-seat-20260924.test.mjs`; 배포가 `check:worker` 자동 추가. 다른 콘텐츠 전체 검사를 반복하지 않는다.
- SQLite/PGlite: 마지막 한 자리 동시 참가, 정원 4명/탈퇴 후 재입장/중복 요청, 관전자 동일 동작 기록, 100ms 발각 경계, 24입 완주 가능성을 검사.
- VM: 입력 즉시 모션·결과 미선반영, 중복/쿨다운/숨긴 페이지, 스페이스 포커스·반복, 서버 시계 왕복 보정, 폴링 사이 예고/감시 전환, 안전 시간 추측 금지.
- 실제 브라우저: 데스크톱 참가자 101 + 관전자 999를 로컬 실제 SQLite API의 같은 회차로 연결. 스페이스 입력 후 양쪽 1/24, 참가자 frame 1/관전자 frame 2 확인. 음식과 모션이 다른 화면에도 반영됨.
- 모바일: 390×844 iframe의 실제 내부 viewport 375px(스크롤바 제외), 가로 넘침 없음. 식탁 탭 직후 frame 1을 확인하고 빠른 감시 전환에 잡혀 붉은 사망 화면·5분 카운트다운으로 전환 확인. 네 좌석·금속 식탁·접시·라벨 PC/모바일 확인. 내장 브라우저 viewport override가 기존 창에 적용되지 않아 명시적 크기 iframe QA 페이지를 사용했다.
- 지정 배포: `npm run deploy:production -- --scoped`. 운영 반영 결과는 배포 성공 후 아래에 기록한다.

## 전용 먹기 자산

내장 **image_gen** generate → targeted edit 방식. 기존 수용소 배경/감시자 원본은 수정하지 않았다. 귀여운 SD 대신 삭막한 수용소에 맞춘 성인 수감자 네 명의 실제 4단계 포즈를 제작했다. 우측 좌석은 코드에서 좌우 반전한다.

- 최종: `assets/ui/prison/death-game-diners-table-atlas-20260924.png`
- RGBA 1254×1254, 4열×4행, 1,407,467 bytes, SHA-256 `3357B5CF20F717802B89261CF4AE59E0281AA050A15CACD3E9CC495F2CCAC11C`.
- 생성 원본 보존: `C:/Users/User/.codex/generated_images/01a0cbaa-0933-7e50-a77a-35c63ee99fef/exec-c260dfe3-65d7-402c-8257-cd85a9798ad1.png`.
- 식탁 높이 수정 원본 보존: 같은 폴더 `exec-537e47e3-6161-4116-afa3-83da7de6368e.png`. 원본 그대로 최종 경로에 복사, 재압축/픽셀 편집 없음. 불필요한 첫 버전의 작업 폴더 복사본만 제거, 생성 원본은 보존.

### 최초 생성 프롬프트

Use case: stylized-concept. Asset type: transparent game character animation sprite atlas for an oppressive prison canteen multiplayer reaction game. Generate a 2048x2048 PNG with genuine transparent alpha, EXACT 4 columns by 4 rows, 16 evenly spaced square cells. Every cell contains ONE complete seated adult prisoner from head to boots on a small plain metal stool, same figure scale and hips baseline, no table, plate, floor or scenery. Serious painterly semi-realistic 2D game art, muted worn gray olive prison clothes, cold overhead light, readable expressive face and hands, NOT cute, NOT chibi, NOT cartoon. The four characters will sit around ONE rectangular table rendered separately in code. Row 1: adult East Asian man with short dark hair, far-left seat, front three-quarter view facing down-right toward table center. Row 2: adult East Asian woman with tied dark hair, far-right seat, front three-quarter view facing down-left toward center. Row 3: adult man with close cropped brown hair, near-left seat, back three-quarter view facing up-right, face profile still visible. Row 4: adult woman with short dark bob, near-right seat, back three-quarter view facing up-left, profile visible. Each row repeats EXACTLY that same person, same orientation, anatomy and clothing through FOUR distinct eating poses left to right: column 1 waiting upright, spoon hand resting low, mouth closed; column 2 leaning forward reaching down with spoon as if scooping peas from a table just ahead, no plate; column 3 elbow bent and spoon with green peas halfway raised toward their mouth; column 4 spoon touching mouth, head tilting slightly forward, clear eating gesture and natural grip. The arm and spoon must actually occupy different positions in each column. Serious nervous expression, ordinary adults, no caricature. Keep every character wholly within their own cell, 25px empty transparent safety margin, equal scale, no bleed between cells. Original characters, no real identities, no text, no names, no badges, no numbers, no grid lines, no checkerboard background, no extra props. Real transparency everywhere outside the 16 seated figures.

### 식탁 높이 교정 프롬프트

Edit the attached existing transparent 4x4 game sprite atlas. Keep exactly the same FOUR adult prison inmates, the same serious painterly style, identical clothing, identities, camera directions, scale, alpha transparency and 4 columns by 4 rows. Only correct the SCOOPING pose in column 2: the current hands reach down below knees. Raise the scooping forearm, hand and spoon to WAIST height so they are reaching forward to a standard dining TABLE, not to the floor. Spoon tip in column 2 must sit at 56-59 percent of the cell height from top. Keep columns 1 idle, 3 lifting spoon, and 4 eating at mouth unchanged. Keep the seated full bodies, stools and all other shapes exactly consistent. No added table, plate, background, lettering, grid or labels. Output a clean 4x4 equal-cell RGBA transparent PNG atlas. Each row is one character, each column one animation phase. Hands must be natural. Upper two rows front three-quarter right, lower rows back three-quarter right. Do not crop any existing character.
