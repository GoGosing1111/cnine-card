# 여왕 즉위식과 로비 왕실 명패 — 2026-09-28

사용자 요청: 족장 즉위를 여왕 즉위로 바꾸고 새 즉위식 그림, 화려한 여왕 글자, 로비에서의 존재감을 구현한다.

## 반영 범위

- `js/queen-coronation-v1.js`, `css/queen-coronation-v1.css`: 전용 대관식 원화, 왕관 → 금빛 한글 → 닉네임 순서의 약 3초 연출. 모션 감소 설정과 즉시 건너뛰기를 지원한다. 전투 이펙트가 아닌 DOM/CSS 타이틀 연출이며 전투 렌더러·라이브러리를 추가하지 않는다.
- `js/chief-system-v1.js`: 기존 임기 API의 첫 24시간 자동 표시를 새 즉위식에 연결한다. 기존 `cnine-chief-hide-day:*`, `cnine-chief-seen-session:*` 키를 그대로 존중한다. 대관식은 장착 아바타 대신 전용 그림을 사용한다.
- 검수 원본 `preview/lobby-clarity-v1/`와 `ui/adventure-lobby/component.js`에서 `js/adventure-lobby-v2107.js`를 생성했다. 왕관·금빛 여왕·대수·닉네임·남은 재위 기간을 묶은 명패가 PC 오른쪽 위, 모바일 캐릭터 아래에 표시된다. 첫 24시간 리본, 최대 두 줄 닉네임과 전체 이름 접근성 레이블을 제공한다. 유저의 장착 로비 아바타는 유지한다.
- `js/soopketmon-v21-exact-shell-adapter.js`: 재위 상세의 `여왕 즉위식 다시 보기`. 클릭할 때 캐시와 이전 진행 중 조회를 재사용하지 않고 현재 서버 상태를 확인한다. 직무정지·파면·공석·만료 시 즉위식을 열지 않는다.
- 네이티브 모달 dialog로 키보드 초점, ESC 닫기, 뒤 화면 입력 차단을 처리한다. 재생 창을 닫으면 다시 보기 버튼으로 초점을 복원한다. 자동 표시와 직접 다시 보기를 구분한다.
- 임기·권한·재화·투표·인증·DB 정책은 변경하지 않았다. 서버 API와 역할 식별자는 기존 `chief`를 유지한다.

## 자산·글꼴

- 원화: `assets/ui/chief/queen-coronation-source-v1.png` (1536 × 1024). 내장 image_gen으로 제작하고 원본을 보존했다.
- SHA-256: `086585a8cc899831f136e17912c135195ad735bfc8c5e3c6d3a50c419c1da257`.
- 프롬프트: `assets/ui/chief/queen-coronation-prompt-v1.md`.
- 운영 대관식: `queen-coronation-v1-1536.webp` 349,418 bytes. 모바일도 세로 크롭 때의 선명도를 위해 같은 고해상도 그림을 사용한다. 작은 정보 카드에는 768px WebP를 사용한다.
- 왕관: `assets/ui/chief/queen-crown-v1.svg` (명패·대관식 공유).
- 여왕/즉위 네 글자: Noto Serif KR 900, SIL OFL 1.1. 18,576 bytes의 로컬 TTF 서브셋이며 그림 속 AI 한글을 사용하지 않는다. 라이선스·출처는 `assets/fonts/queen/`에 보존했다.

## 관련 검수

- 실제 `index.html`과 라이브 로더, 생성된 로비 번들에서 API만 격리한 브라우저 검수: 1440×1000, 390×844, 320×740에서 43개 항목 통과, JavaScript 오류 0.
- 자동 표시, 전용 그림·한글 폰트, 가로 넘침, 로비 아바타 유지, 명패/콘텐츠 버튼 겹침, 첫날 리본, 숨김 이후 수동 다시 보기, 건너뛰기, ESC·초점 복원, 직무정지 재조회, 모션 감소, 계정 변경 요청 없음 확인.
- 첫 검수에서 재조회 버튼을 비활성화할 때 초점을 잃는 문제와 공통 1초 읽기 캐시를 발견했다. 명시적 초점 복원 및 수동 재조회 전용 `microcache:false`, `replaceInflight:true`로 수정한 뒤 관련 시나리오를 통과했다.
- 전체 게임 검사를 수행하지 않는다. 음소거 상태로 검수했고 실제 계정 지급/차감은 실행하지 않았다.
- 브라우저 증빙: `C:/Users/User/.codex/tmp/queen-coronation-20260928/qa/`.
- 모바일 그림 해상도와 긴 닉네임 두 줄 보완 후 해당 화면만 추가 확인: 390×844, 320×740에서 17개 항목 통과, 오류 0. 증빙은 `C:/Users/User/.codex/tmp/queen-coronation-20260928/qa-polish/`.

## 배포 계획과 범위

- 종류: 로비·즉위식의 국소 UI 수정, scoped 배포.
- 직전 실제 운영 배포: Pages `25cb686c-2b23-49b9-a640-d62208ef36b8`, 소스 `f272642c876cd7c879fd1c08deebe2aa750b1ab5` (Wrangler 운영 배포 목록에서 확인).
- 기준 이후 기존 변경은 완료된 일회 운영 도구·그 기록이며 게임 실행 코드 변경은 이번 여왕 UI다. 운영 도구는 배포로 재실행되지 않는다.
- 배포 검사: `tests/queen-coronation-v1.test.mjs`, `npm run test:lobby` (생성 번들 일치와 기존 로비 메뉴 계약).
- `index.html`의 변경 JS에 `queen=20260928`, 새 CSS/JS에 `v=20260928-queen`을 연결한다. 기존 앱/서비스워커 주 버전의 일치를 유지한다.
- 범위 커밋과 origin/main 반영 뒤 `npm run deploy:production -- --scoped`만 사용한다. 출시 플래그·깨끗한 소스·캐시 및 Hyperdrive 조건은 기존 배포 도구가 검사한다.
