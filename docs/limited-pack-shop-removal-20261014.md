# 판매 종료 용병 리미티드팩 상점 제외 — 2026-10-14

사용자 후속 요청: `상점에서 빼라`.

- 운영 OFF인 용병 리미티드팩은 `GET /api/packs` 상품 목록에서 제외한다. 상점 선택 타일·전용 계약실 입장 영역이 노출되지 않는다. CMS에서 의도적으로 다시 ON으로 저장한 경우에만 상품 행을 제공한다.
- 하이퍼팩과 멤버 카드 리미티드팩(`pickup`)의 상품·구매 정책, 기존 용병 보유·확정 영수증은 보존한다. 앞서 저장한 용병 리미티드팩 OFF(r18)와 서버 개봉 차단을 유지한다.
- 실행 코드 변경은 `functions/_mercenary_limited_pack.js`의 상품 표시 판정과 `functions/api/[[path]].js`의 목록 조립 두 곳이다. 기존 관련 회귀에 ON 상품 표시·OFF 상품 제외를 추가했다.
- 작은 수정으로 `npm run deploy:production -- --scoped`를 사용한다. 직전 운영 Pages 배포는 `a9762a01-31cc-4dd0-90fd-4da0bbdb4ccd`, 커밋 `a179505d6debc649ba992bd7691c56c7e8706c81`(Wrangler production 목록에서 확인)이다. 이후 이번 작업 전까지 차이는 운영 기록·도구뿐이며 게임 실행 코드는 같다.
- 선택 검사는 `tests/limited-pack-sales-end-20261014.test.mjs`와 `check:worker`다. 기존 생산 배포 보호·Hyperdrive·Worker 준비 검사를 유지하고 무관한 전체 게임 검사는 실행하지 않는다.
- 관련 회귀 1개·서버 문법·기존 출시 보호·Hyperdrive 캐시 검사 통과 후 운영 배포 완료. Pages는 `https://70624019.cnine-card.pages.dev`, API runtime은 `69035752-c536-4683-bf9b-49ed120b5bd7`이다.
- 2026-10-14 23:02:59 KST 운영 공개 API에서 상품 ID가 `pickup`, `ultimate`, `superstar`, `hyper`만 반환됨을 확인했다. 용병 리미티드팩 OFF(r18)·개봉 불가, 하이퍼팩 개봉 가능을 재확인했다.
- 계정 변경 없이 실제 상점 컴포넌트와 운영 공개 상품 목록을 격리된 익명 브라우저에 표시해 PC 1440×1000·모바일 390×844에서 확인했다. 용병 리미티드팩 타일·입장 버튼 없음, 기존 4개 상품 표시·가로 넘침 없음. 초기 버닝 안내를 닫은 뒤 화면을 직접 확인했다. 영구 검증 기록은 같은 이름의 JSON이다.
