# X-BODY 줌인 제거 · 천룡 강림 20초 — 2026-09-28

사용자 지시: 공격 중 확대(줌인)를 없애고, 헬기폭격과 같은 주기로 발동하던 X-BODY 궁극기를 20초마다 발동하도록 변경한다.

- 라이브 `XBodySwordAnimation.js`의 평타·6연격·천룡 연출에서 줌인을 끈다. 상속 생성자의 최초 렌더 전에 적용해 시작 프레임의 확대도 막는다.
- 서버와 클라이언트가 공유하는 `shared/x-body-area-skill.mjs`의 천룡 강림 간격은 20,000ms다. 헬기폭격은 15,000ms이며, 피해 배율·대상·5회 적중 시점은 그대로다. 두 주기는 60초 공배수에서 다시 만날 수 있다.
- 기존 승인 원화·아틀라스·프리뷰 FX 구현을 보존한다. 라이브 어댑터의 카메라 정책만 변경하며 기존 PixiJS 8.20.0 / GSAP 3.13.0 재생기를 사용한다.
- 런타임 버전 `20260928-x-body-no-zoom`, 메인 로더 쿼리 `xBody=20260928-no-zoom`을 적용한다. 군단토벌 12슬롯 전용 엔진을 포함한 공용 V3 소비자 10종을 같은 소스로 재빌드한다.

## 관련 검증과 범위 배포

- 수정 전 실제 Pixi/GSAP 평타·6연격·천룡 카메라 회귀를 PC/모바일 조건으로 재현했고 두 경우 모두 줌 호출로 실패했다.
- 최종 검사는 scoped 배포에서 한 번 실행한다: `tests/x-body-live-20260927.test.mjs`, `tests/x-body-area-skill-20260927.test.mjs`, `tests/pve-battlefield-entry-v2117.test.mjs`, `tests/legion-hunt-entry-account-20260926.test.mjs`, `tests/v3-common-grid-v1.test.mjs` 및 `check:worker`.
- 서버 회귀는 X-BODY에 헬기폭격을 함께 장착해 천룡 20/40/60초, 헬기 15/30/45/60초를 확인한다. 기존 적중·피해 합계와 PVP 제외도 확인한다.
- UI 검수는 운영 군단토벌 API 핸들러·라이브 번들을 로컬 SQLite 테스트 DB에 연결한 PC 1440×960 / 모바일 390×844 전투로 한정한다.
- 직전 실제 운영 배포: `5d2a9c1a99d9274bdbab8ef3fc246e8ea5fac9e9` (`https://a6ec4db0.cnine-card.pages.dev`). 해당 배포와 그 뒤의 기록 커밋을 보존한다.
- 작은 전투 연출/주기 변경으로 영향 범위가 특정된다. DB 조회·거래·경제·의존성·기능 플래그 변경은 없으며, 전체 게이트 대신 `npm run deploy:production -- --scoped`를 사용한다.
- 외부 검수 자료: `C:/Users/User/.codex/tmp/x-body-no-zoom-20260928/`.

최종 검사·PC/모바일 결과와 운영 반영 기록은 배포 후 추가한다.
