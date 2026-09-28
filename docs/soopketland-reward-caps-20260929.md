# 숲켓랜드 보상 상한 확대 — 2026-09-29

사용자 요청에 따라 신규 추첨 상한을 코인 500억, 마스터의 별 100,000개, 미스틱 에너지 200개로 변경한다.

## 적용

| 보상 | 이전 | 변경 | 유지한 추첨 단위 |
| --- | --- | --- | --- |
| 코인 | 1억~300억 | 1억~500억 | 1억 |
| 마스터의 별 | 1,000~50,000개 | 1,000~100,000개 | 1,000개 |
| 미스틱 에너지 | 1~50개 | 1~200개 | 1개 |

- `LAND_PRIZES`의 서버 상한과 쿠폰 수령 검증이 같은 기준을 사용한다. 원래 최소 수량과 구간 내 균등 추첨을 유지한다.
- 기존 보상 종류·추첨 가중치·이용권·쿠폰 사용 인원과 이미 발급한 영수증/쿠폰 수량은 그대로다. DB 설정을 덮어쓰거나 기존 보상을 재추첨하지 않는다.
- OWNER 안내, 코인 최대 지급량 확인, 운영 공용 번들, 프리뷰 수량을 갱신했다. 런타임 키는 `20260929-land-caps`, 앱 로더 키는 `landRewards=20260929`다.
- `npm run build:soopketland` 사용. 공용 PixiJS·GSAP vendor 번들 내용은 변경되지 않았다.

## 범위 검증

- `SOOPKETLAND_REWARDS_QA=1 node tests/soopketland-v2039.browser.mjs`: PC 1440×1080·모바일 390×844 통과. 500억/100,000개/200개 결과, 보상 목록, OWNER 입력·안내, 기존 확률, 가로 넘침 없음, 콘솔 예외 없음. 로컬 프리뷰만 사용하고 소리는 껐다.
- 시각 자료: `C:/Users/User/AppData/Local/Temp/soopketland-qa-NWozdG/`.
- 배포 시 `tests/soopketland-v2039.test.mjs` 37개 검사를 한 번 실행해 모두 통과했다. 상한/단위, 최대 수량 추첨·쿠폰 발급·수령, SQLite/PostgreSQL BIGINT, 감사 실패 롤백, 재시도/동시 수령, 기존 쿠폰 유지, 상한 초과 차단을 포함한다.
- scoped 배포 도구가 추가한 `check:worker`를 통과했다. 관련 없는 게임 전체 검사는 수행하지 않았다.

## 배포 범위

- 분류: 숲켓랜드 보상 수량에 한정된 작은 정책 수정. 인증·공통 DB/거래 구조·의존성 변경 없음.
- 직전 실제 운영 소스: `f22e3457bed738dc256f8605c963e68826d5f85b` (Pages `2c8c3acf-2654-4041-a4b8-3e21df3ebf7a`).
- 명령: `npm run deploy:production -- --scoped`.
- 선택 검사: `SCOPED_DEPLOY_TESTS=["tests/soopketland-v2039.test.mjs"]`, `SCOPED_DEPLOY_CHECKS=[]`.
- 출시 플래그·깨끗한 커밋·origin/main 일치·캐시·Hyperdrive 검사는 유지한다. 운영 보상 지급이나 시험용 쿠폰 발급은 하지 않는다.
- 원복이 필요하면 이번 버전에서 발급된 500억/100,000개/200개 쿠폰의 수령 상한 호환을 보존해야 한다.

## 운영 반영 완료

- 배포 소스: `8e24a55a91d80b2a30a280a47918e113315d64c6`.
- Pages: `https://dbfbfaad.cnine-card.pages.dev`.
- Clan Draft Worker 버전: `d9a8f360-be9f-481e-83f4-f23246f4e522`.
- scoped 검사, 출시 플래그·캐시·Hyperdrive 검증과 배포가 모두 성공했다.
- 운영 `https://cnine-card.pages.dev`의 `index.html`, `js/app.js`, 숲켓랜드 번들, 프리뷰 HTML·JS 5개 파일이 HTTP 200을 반환하고 배포 소스와 일치함을 확인했다.
- 완료 기록은 문서만 추가 커밋하며 운영 재배포나 통과한 검사 반복은 하지 않는다.
