# 리치왕 협동 개편 후 공대 후기 반영 — 2026-10-03

대상은 [핫시의 공대 후기](https://www.playdk.kr/board/skm/1260324)와 협동 V2 운영 기록에서 확인한 후속 문제다. 협동 V2 적용 후에도 동료 입력으로 내 버튼 DOM이 교체되고, 강한 편성 한 명의 공격으로 노출 구간이 즉시 끝나며, 엄폐 중 파쇄 입력이 반복 벌점을 만드는 문제가 남아 있었다.

## 변경

- 개인 작업 키와 버튼 키를 기준으로 DOM을 갱신한다. 동료 봉인 진행·공대 HP·공용 자원 갱신 중에도 누른 버튼을 유지하고, 누르기 시작한 시점의 입력 토큰을 전송한다.
- 현재 눌러야 하는 봉인 문양을 강조하고 개인 봉인 완료·동료 연결 대기를 구분한다. 오답과 전멸 사유에는 담당자·선택 문양·정답·미완료 작업을 표시한다.
- 새 공대는 엄폐와 봉인 연결이 끝나기 전 파쇄를 차단한다. 조기 요청은 피해나 벌점을 주지 않는다. 절대영도 흡수까지의 대기 시간과 흡수 후 6초 파쇄 시간을 구분한다.
- 새 공대의 1회 일반 공격 피해 한도는 해당 구간 HP를 출정 인원수와 3으로 나눈 값이다. 실제 전투 엔진의 피해가 더 작으면 그 피해를 사용한다. 개인 결전은 피해와 한도가 1.8배다. 출정 인원을 고정해 도중 이탈로 한도를 높일 수 없다.
- 반복 공격을 전제로 반격 피해를 최대 HP의 `1.5% + 죽음의 잔재 × 0.5%`로 조정했다. 공대 회복을 사용하면서 실수 후 회복할 여지를 유지한다.
- 생성 시 `combatRevision: 2`를 저장한다. 이미 만들어진 공대는 기존 전투 수치와 조기 파쇄 판정을 유지하며 진행 중 규칙을 교체하지 않는다.
- 리치왕 전용 로더·CSS·번들 캐시는 `20261003-coop-feedback`이다. 공용 V3 엔진·진형·카드 도크는 변경하지 않았다.

운영 설정은 기존 TEST·보상 잠금·입장권 정책을 유지한다. DB 스키마·공통 인증·거래 기반·다른 콘텐츠 정책의 변경은 없다.

## 확인한 근거와 검수

- 협동 V2 적용 후 작성자 참여 18개 공대 기록 중 클리어는 3개였다. 두 클리어 공대는 전체 7구간에서 일반 공격이 총 7번이고 결전은 0번이었다. 공격 구간이 한 번의 입력으로 끝나는 상황을 확인했다.
- 실제 클리어 공대 3개의 편성·전투 스냅샷을 읽기 전용으로 복사해 로컬에서 일반 공격, 결전 사용, 초반 실수 2회 시나리오를 실행했다. 9개 모두 클리어했다. 일반 공격 시 각 공대원이 7구간에 걸쳐 21회씩 공격했고 회복 4회를 사용했다. 이는 로컬 규칙 검증이며 실제 이용자의 조작 시간이나 클리어를 보장하는 수치는 아니다.
- 브라우저: 실제 게임 진입 → 리치왕 대기실 → 개인 5장·용병·슈트 전장 → 개인 봉인·감옥·해제·구출·공격·결전·가이드·복귀를 PC 1440×1000, 모바일 390×844에서 검수했다.
- PC에서 버튼을 누른 채 다른 봉인대가 입력한 뒤에도 같은 버튼 노드가 유지되고 내 클릭이 정확히 1회 처리됐다. 모바일 입력 노드도 유지됐다. 엄폐 잠금 → 흡수 후 파쇄 카운트다운 → 무벌점 정상 파쇄를 확인했다. 브라우저 오류는 0건이다.
- 신규 회귀는 조기 파쇄 무벌점 차단, 강한 편성의 단독 구간 종료 방지, 결전 한도, 출정 인원 고정, 기존 공대 호환, 담당자·미완료 봉인 안내를 검사한다.

브라우저 결과: `C:/Users/User/AppData/Local/Temp/lich-feedback-browser-20261003.log`, 화면: `C:/Users/User/AppData/Local/Temp/lich-coop-ZmiRzu/`. 로컬 전투 결과: `C:/Users/User/AppData/Local/Temp/lich-feedback-live-simulation-results.json`. 실제 계정 전투 스냅샷은 저장소에 포함하지 않는다.

## 범위 배포

- 직전 운영 Pages 배포: `25310d7e-ce90-4c4e-90d1-a91a3a419e78`.
- API로 확인한 성공 커밋: `ceea28307738fc09f13972bbab4256173142e1cf` (2026-10-03 03:03 KST).
- 선정 이유: 리치왕 개인 입력 UI·기믹 안내·해당 콘텐츠 공격 수치만 수정하므로 관련 서버/로더 회귀와 Worker 컴파일을 검사한다. 공통 엔진·인증·DB 기반을 바꾸지 않아 전체 게이트를 반복하지 않는다.
- 명령: `npm run deploy:production -- --scoped`.
- `SCOPED_DEPLOY_TESTS`: `tests/lich-raid-feedback-20261003.test.mjs`, `tests/lich-raid-coop-20261002.test.mjs`, `tests/lich-king-raid-v1.test.mjs`, `tests/lich-raid-live-20260928.test.mjs`, `tests/lich-raid-loadout-timing-20261001.test.mjs`, `tests/lich-raid-inline-entry-20260929.test.mjs`, `tests/pve-battlefield-entry-v2117.test.mjs`.
- `SCOPED_DEPLOY_CHECKS`: `check:worker`.
- 배포 과정에서 위 검사를 실행하고 출시 플래그·캐시·Hyperdrive·깨끗한 커밋을 확인했다.

## 운영 반영 결과

- 코드 커밋: `15c4d84e88fd72f7d1dffbf794ba78f75573d321`. 진행 중 추가된 LG 아윤 지급 기록 커밋을 보존해 rebase 후 `origin/main`에 반영했다.
- 지정된 scoped 배포 1회 성공. 회귀 **50/50 통과**, `check:worker` 및 Wrangler Worker 컴파일 성공. 출시 보호 검사와 Hyperdrive query cache OFF 검사도 통과했다.
- Pages: `ad4600e0-4e8e-4f70-8f3e-dd1f45eeb412`, [배포본](https://ad4600e0.cnine-card.pages.dev). Cloudflare canonical deployment의 commit과 `success`를 확인했다.
- API Runtime 버전: `b33b944c-cde5-4100-8343-cb59826929cb`. Clan Draft 버전: `2a7d91b3-d312-40c3-af2d-820d19d72936`.
- 2026-10-03 03:08 KST 운영 확인: 메인 HTML·진입 로더·리치왕 HTML/모듈/CSS·전투 번들·두 오버레이·기믹 CSS 등 9개 파일이 HTTP 200이고 로컬 배포본과 SHA-256 일치. 비로그인 feature API는 401로 인증 보호를 유지했다.
- 배포 직후 첫 조회의 3개 파일은 전파 중 이전 내용이 응답됐다. 해당 파일을 canonical/개별 배포 주소에서 다시 확인한 뒤 9개 모두 일치했다. 추가 재배포는 하지 않았다.
- 배포 로그: `C:/Users/User/AppData/Local/Temp/lich-feedback-deploy-20261003.log`. 운영 확인: `C:/Users/User/AppData/Local/Temp/lich-feedback-production-smoke-20261003.json`.
- 새 전투 수치와 엄폐 중 파쇄 보호는 **새로 생성한 공대부터** 적용한다. 이미 진행 중인 공대의 전투 규칙은 유지한다.
