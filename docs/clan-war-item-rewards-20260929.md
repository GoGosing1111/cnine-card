# 클랜전 회차 아이템 보상 — 2026-09-29

사용자 요청: 참가 보상에 미스틱 에너지 500개, 승리팀에 마스터의 별 150만 개를 추가하고 CMS에서 수량을 설정한다.

## 지급 기준

- 정규 클랜전 회차 종료 정산에 추가한다. 기존 코인·피그 코인·시즌 종료·챔피언스리그 보상은 유지한다.
- 참가자는 기존 CLAN 참가 보상의 완료 공격 횟수를 사용한다. 운영 읽기 전용 확인값은 30회다. 진행 카운터와 완료 공격 이력 중 큰 값을 쓰며 방어·실패·진행 중 전투는 세지 않는다.
- 승리 보상은 종료 전 가입한 승리 클랜원 전원이다. 참가 조건도 충족하면 미스틱 에너지와 별을 모두 지급한다.
- 아이템 코드: 미스틱 에너지 `STARLIGHT_ARMOR_CORE`, 마스터의 별 `MASTER_STAR`. 두 카탈로그의 운영 활성 상태를 확인했다.
- `2026-09-29T00:26:44.000Z` 이후 시작한 정규 회차만 대상이다. 이전 시즌/회차에 소급 지급하지 않는다. TEST/OFF와 챔피언스리그 대진은 제외한다.

## CMS와 저장

- 클랜전 관리 → **04-D 회차 참가·승리팀 아이템 보상**.
- `roundParticipationMysticEnergy=500`, `roundVictoryMasterStars=1500000`. 기존 설정에 필드가 없어도 기본값이 적용된다.
- OWNER의 기존 설정 저장 API로 0~1,000,000,000개 정수 저장. 0은 해당 아이템 지급 중지다.
- 기존 라운드 규칙 스냅샷에 두 수량을 함께 저장한다. 시작한 회차는 수량 유지, 수정은 다음 회차부터 적용. 이전 스냅샷에 새 필드가 없으면 0으로 유지한다.
- `clan_war_items_v1:<warId>` 영수증, 인벤토리 수량·미확인 수량, `CLAN_WAR_ITEMS` 로그를 같은 트랜잭션으로 처리한다. 중복 요청·응답 유실·재시도는 재지급하지 않는다.
- 지급 실패는 모든 지급과 영수증을 롤백하고 후속 회차 정산에서 복구한다. 카탈로그 비활성·수량 오버플로·지급 로그 누락은 완료 처리하지 않는다. 아이템 정산 기록이 있는 시즌은 기존 자동 초기화도 차단한다.

## 검수와 배포

- 국소 클랜전 보상/CMS 변경이며 공통 인증·DB 기반·스키마·의존성을 바꾸지 않는다. 변경 자체는 scoped 대상이다.
- 관련 검사: `tests/clan-war-item-rewards-20260929.test.mjs`, `tests/clan-war-pig-rewards.test.mjs`, `tests/clan-war-cms-v1943.test.mjs`, `tests/clan-participation-positive-v2040.test.mjs`, `check:worker`.
- 개발 중 신규 거래 검사 15개 통과: SQLite/PostgreSQL의 자격·누적·재시도·동시 호출·응답 유실·롤백·회차 고정·설정 변경·정산 복구. 초기화 보호 2건을 추가해 최종 배포 검사에 포함한다.
- CUA의 실제 CMS 스크립트와 로컬 격리 API로 PC/390px 모바일 수량 입력→저장→재조회 확인. 750/2,000,000 저장 후 500/1,500,000으로 복원했다. 운영 데이터에 검수 보상을 지급하지 않았다.
- 운영 기준 조회 시 Pages는 `8e24a55a91d80b2a30a280a47918e113315d64c6`. origin/main에는 별도 랭크전 인덱스/조회 개선 배포가 중단된 상태로 남아 있어 그 선행 배포를 먼저 완료한 뒤 본 변경을 scoped 배포한다.
- 선행 배포 완료: `9fd2bcf34525a64db4e8f285618bdebd538951a8`, Pages `7d998c78-68b0-4b67-9707-0652ff05055e`. 완료 단계 재사용 후 남은 전체 게이트와 출시·Hyperdrive 검사 통과. 이 SHA를 본 변경의 실제 `SCOPED_DEPLOY_BASE`로 사용한다.

## 운영 반영 완료

- 코드 `b65d08226b66516e92d8918d891a8c5ea716d534`을 `npm run deploy:production -- --scoped`로 배포했다. 선택한 관련 검사 **56개 통과**, Worker 컴파일·출시 플래그·Hyperdrive 캐시 OFF 확인.
- Pages: `e1d1a96a-1c54-41cd-8b28-8f4eddaf81c2` — https://e1d1a96a.cnine-card.pages.dev
- 클랜 스케줄러: `04c83955-082b-4fcb-8e0c-a32c989395f9`.
- 2026-09-29 09:58 KST 운영 확인: admin HTML/JS 200, 새 캐시 키 연결, JS 소스 SHA-256 일치(`641b9c4da251071e2a7f141dd87085868ca53fc78e1aeb82f68e46880a066479`), no-store, 미인증 설정 요청 401.
- 기존 운영 설정에는 두 수량 필드가 없어 승인한 기본값 500/1,500,000을 사용한다. CMS 저장 시 두 필드가 명시적으로 보존된다. 진행할 신규 정규 회차의 종료부터 지급하며 이전 시즌 대상의 일괄 지급은 수행하지 않았다.
- 검수 원본: `C:/Users/User/.codex/tmp/clan-war-item-rewards-20260929/`의 `deploy-scoped.log`, `production-verify.json`, `production-inspect.json`, `cms-save-evidence.json`, `desktop.png`, `mobile.png`, `cms-rewards.png`.
