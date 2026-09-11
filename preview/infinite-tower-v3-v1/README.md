# 무한의탑 V3 검수판

2026-09-11 구현. `npm run preview:pve-overhaul` 실행 후 `/preview/infinite-tower-v3-v1/` 접속. 로컬 SQLite의 체험 계정만 사용한다. 일반 정적 서버에서는 저장/복구 API가 없으므로 위 서버가 필요하다.

층 선택 → 서버 원정 저장 → 공통 V3 재생 → 결과/기록/보상 확인 → 같은 층 또는 새 해금층을 선택한다. 자동 재등반은 사용자가 직접 켜야 하며 유한 횟수·가시성·패배·보상·버전 변경으로 중단한다. 새로고침은 같은 원정을 복구한다.

기준 문서: `docs/infinite-tower-limit-push-v2.md`, `docs/infinite-tower-v3-economy-draft-20260911.md`, `docs/v3-overhaul-readiness-20260911.md`.

## 실제 사용 엔진과 자산

- `source/TowerBattleEngine.js` → `../scrapyard-v3-v1/source/ScrapyardBattleEngine.js` → 공통 V3 `BattleEngine`, `OccupiedGridLayout`.
- PixiJS 8.20.0, GSAP 3.13.0. 기존 Pixi 효과 계층과 `BattleEngine.timeline()`을 사용한다. 별도 렌더러·피해 타이머·스킬 효과·사운드 없음. 진입 0초 / 파편 0.08초 / 착지 0.12초 / 진입 완료 0.48초, 기존 사격 탄착 동기화 유지.
- 카드 원화와 SD 분리, 공용 `card.css`, ZENITH/SUPERSTAR/Faker 프레임과 운영 아트 어댑터 체인 재사용. 5장 덱에 슈트를 넣지 않는다. 미승인 용병 편성은 연결하지 않는다.
- 탑 몬스터는 승인된 `assets/ui/project-v/monsters/hunt-tower/manifest-v1.json`의 일반/보스 5개 계열을 사용한다. 배경은 승인된 `v3-infinite-tower-sanctum-v1.png`다.

## 검수 기록

- 서버: SQLite/PostgreSQL 각각 100회 반복, 최초 보상 중복 방지, 응답 유실, lease 복구, 중복 탭, 자정·설정·덱 변경, 지급/기록 롤백.
- 브라우저: 390·1366px, 높이 844·1100px, 2× 전투 완료·일시정지/재개·새로고침 동일 결과 복구. 오류/실패 요청 0건. 화면 증거 `tmp/v3-overhaul-ready-20260911/browser/`.
- 취소/이탈은 V3의 기존 세대 번호와 지원 사격 정리를 사용하고 서버의 완료 영수증은 지우지 않는다.
- 시각 검수와 경제 수량은 사용자 승인 대기다. `TOWER_V3_RELEASE_ENABLED=false`. 운영 탑 라우트는 미전환이다.
