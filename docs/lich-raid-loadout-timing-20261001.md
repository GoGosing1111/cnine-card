# 리치왕 정벌 편성·기믹·전체 화면 수정 — 2026-10-01

사용자 검수에서 참가자 덱과 용병·배틀슈트가 보이지 않고, 기믹 반응과 시인성이 맞지 않는 문제가 보고됐다. 대기방은 기존 UI를 유지하고 전투는 기존 전장처럼 전체 화면을 사용하도록 요청했다. 후속 요청으로 리치왕 표시 크기를 기존보다 50% 확대했다.

## 반영

- 참가·준비 시 각 계정의 기존 `raidDeckPower(...,'RAID')` 결과를 저장한다. 저장된 순서를 유지한 일반 카드 5장, 별도 용병 1장, 장비 보너스와 배틀슈트를 기존 `buildPvePlayerTeam`으로 구성한다. 같은 카드가 여러 계정에 있어도 소유자별 ID와 체력을 분리한다.
- 화면에는 자신의 기존 V3 진형과 일반 카드 도크를 표시한다. 각 공대원의 실제 카드·용병·배틀슈트 공격은 서버가 함께 계산하며 보스 체력·기믹·공용 자원을 공유한다. 단계별 HP 방벽은 전체 공격에 비례 적용해 선행 공대장 공격이 후속 참가자의 기여를 버리지 않게 한다.
- 명령 응답의 확정 전황을 바로 적용한다. 성공한 기믹 입력 뒤 별도 GET을 기다리지 않으며 이미 받은 이벤트를 재전송하지 않는다. 입력 처리 안내, 역할별 행동 문구와 큰 모바일 조작 영역을 제공한다.
- 서버 응답 시각과 확정된 기믹 시작 시각으로 전이·차단·감옥 해제·구출 완료 시점을 표시한다. HP·일반 중첩 갱신 때문에 입력 버튼을 계속 교체하지 않는다. 판정·자원·승패는 계속 서버가 검증한다.
- 대기방은 `pveRaidHubView` 안에 둔다. 전투 동안 `pveLichRaidView`를 body의 전체 화면으로 옮기고 종료 시 원위치와 스크롤 상태를 복구한다. 기존 카드 프레임·로스터·진형을 재구성하지 않는다.
- 리치왕 전투 아트 배율을 `1.1 → 1.65`로 변경했다. 원화·SD 파일은 변경하지 않는다.

## 기존 V3 효과 객체 재사용

리치왕의 별도 Pixi 생성자가 공용 전장에 섞여 `isInteractive` 클릭 오류를 만들었다. 공용 런타임의 `fxRuntime`에 Assets·Container·Graphics·Sprite·Texture·Rectangle 참조만 노출하고 리치왕 효과가 같은 객체를 사용하도록 했다. 기믹 번들에 Pixi를 포함하지 않으며 `build-report.json`의 `pixiCopies`는 0이다. 기존 캐시의 같은 버전 런타임은 효과를 요청할 때 한 번만 갱신한다. 일반 PVE/PVP의 기존 준비 조건과 전투 로직은 유지한다.

실제 파일은 `preview/project-v-v3/source/project-v-pixi-battle.src.js`, `js/battle-v3-live.js`, `preview/lich-king-raid-v1/{battle.src.js,MechanicOverlay.js,clock.mjs}`다. 잠금 버전은 PixiJS 8.20.0 / GSAP 3.13.0 / esbuild 0.28.1이며 설치 버전과 일치했다. 기존 감옥·절대영도·말살 16프레임 시트와 공용 효과 레이어·GSAP 타임라인을 재사용한다. 전투 경계에서 이전 연출을 취소하고 서버 HP를 복구하며, 배틀슈트의 기존 사격 루프도 다시 시작한다. 신규 이펙트 원화·사운드·별도 렌더러는 추가하지 않았다.

## 검증과 배포 범위

- 브라우저: `tests/lich-raid-loadout-timing-20261001.browser.mjs` 통과. 로컬 SQLite와 합성 계정 3개, 실제 도감 카드 원화·SD·등급 프레임·V3 자산을 사용했다. 운영 API·실계정 재화는 사용하지 않았다.
- PC 1440×1000 / 모바일 390×844: 대기방 위치, 전장 전체 화면, 계정별 카드 순서, 용병·배틀슈트 표시, 공유 보스 HP, 전이·차단·구출 입력, 처리 안내, 추가 GET 없는 응답 적용, 안정된 버튼, 44px 이상 모바일 버튼, 나가기 후 대기방/스크롤 복귀 확인. 브라우저 예외 0개.
- 시각 검수 PNG: `C:/Users/User/AppData/Local/Temp/lich-party-cwc0oB/`의 PC 공격 화면과 모바일 복합 기믹 화면. 확대된 리치왕의 전신과 하단 카드 도크가 잘리지 않았다.
- 최초 관련 서버 회귀 19개와 편성·서버 피해·기믹 시각 회귀를 개발 중 확인했다. 최종 서버 변경과 공용 효과 캐시 경로는 아래 지정 배포 과정에서 선택한 관련 테스트 35개가 통과했다.
- 직전 실제 운영: Pages `adf07a34-fd3f-4598-9533-d4fe4b2ba7ee`, 소스 `4d2c6d1e40870d6ad82480fbe8caf1d9fe7e6ae9`. Cloudflare 배포 메타데이터에서 확인했다. 이후 main에 추가된 운영 처리 스크립트·기록은 게임 런타임 변경이 아니며 이번 배포에서 실행하지 않는다.
- 분류: 리치왕 국소 버그 수정과 동일 Pixi 객체를 위한 공용 참조 노출·캐시 갱신. 인증·세션·DB/트랜잭션 기반·의존성·인프라 변경이 없다. 공용 전투 계산·진형 변경도 없다. 범위 배포를 사용하고 출시 상태·보상 잠금은 유지한다.
- 최종 선택: `tests/lich-king-raid-v1.test.mjs`, `tests/lich-raid-live-20260928.test.mjs`, `tests/lich-raid-loadout-timing-20261001.test.mjs`, `tests/lich-raid-inline-entry-20260929.test.mjs`, `tests/pve-battlefield-entry-v2117.test.mjs`. 리치왕 서버/공대 거래 회귀와 실제 메인·번들·PVE/PVP 진입, 같은 버전 효과 캐시 교체만 검증한다.
- 배포: `npm run deploy:production -- --scoped`, 위 테스트와 `check:worker`. 깨끗한 범위 커밋, origin/main 일치, 기능 플래그·캐시·Hyperdrive·private API runtime 검사를 유지한다. 이미 통과한 브라우저 검수는 반복하지 않는다.

이전 출정 공대의 편성 스냅샷은 소급 교체하지 않는다. 편성 수정은 새 공대로 검수한다.

## 운영 반영 완료

- 운영 소스 커밋: `c8eba4a149a94ca713f95bc9c041512dfe3bec74`. 깨끗한 작업 트리에서 origin/main과 일치한 상태로 `npm run deploy:production -- --scoped`가 종료 코드 0으로 완료됐다.
- Pages: `e6eb3e4f-faa8-4179-84a7-c93824576ae8`, https://e6eb3e4f.cnine-card.pages.dev. Cloudflare 운영 배포 메타데이터의 소스 커밋과 완료 상태 `success`를 확인했다.
- API runtime 버전: `69b29e30-4082-481a-88bd-c14e1f1ff332`. 기존 배포 절차의 clan-draft 버전: `a50dd1cb-886e-47a6-8bcf-1388b7637b72`.
- 지정 테스트 35개, `check:worker`, 운영 출시 플래그·보상 잠금·캐시·private API runtime 검사 통과. Hyperdrive `12ed48b0fb374f82a610cc1daba92e95`의 query cache OFF를 확인했다.
- 짧은 운영 확인: `cnine-card.pages.dev`에서 메인 HTML, 리치왕 진입 스크립트·페이지·live 모듈·inline CSS·전투 번들, 공용 V3 래퍼·Pixi 번들 총 8개가 HTTP 200이며 로컬 배포본과 줄바꿈을 정규화한 SHA-256이 일치했다. `/api/raid/lich/feature`의 비인증 요청은 401로 보호됐다.
- 실계정 입장·출정·티켓 소비는 운영 확인에서 실행하지 않았다. 계정별 편성·기믹·PC/모바일 조작은 위 로컬 3인 브라우저 검수로 확인했다. 이 완료 기록만 추가하는 후속 커밋은 문서 변경이므로 재검사·재배포하지 않는다.
