# X-BODY 및 천룡 강림 운영 연결 — 2026-09-27

## 승인과 범위

사용자는 X-BODY V2를 시각 승인하고 **“라이브 배포해”**라고 지시했다. 추가 광역기를 요청한 뒤 영상·프리뷰 검수 질문에 **“이 연출로 승인”**이라고 답했다. 따라서 기존 청광 대시·일섬·천광 연섬과 새 천룡 강림의 승인 자산, 운영 V3 연결, CMS 장비 등록을 이번 배포 범위로 삼는다.

천룡 강림의 실전 피해·주기는 후속 **“Z-BODY와 동일하게 적용”**으로 확정됐다. Z-BODY와 같은 기존 헬기폭격 기준으로 **15초마다 생존 적 전체에 각각 슈트 기본 피해의 5배**를 적용한다. `shared/x-body-area-skill.mjs`의 운영 플래그는 **true**다. 일반 공격·카드 행동 예산은 유지한다. 로컬 시뮬레이션용 Symbol은 외부 요청으로 전달할 수 없다.

X-BODY는 기존 H/S/Z와 같은 장비 CMS 테이블에 `BATTLE_SUIT_X_BODY`, 전투력 0·기본 등급 NORMAL·보급 미포함으로 일회 등록한다. 기존 행이 있으면 운영자가 저장한 전투력·등급·활성/공개·보급 설정을 보존한다. PVP 전투력은 0, 기존 일반 카드 다섯 장과 별도 PVE 지원 액터다. 소유권·계정 지급·코어 번호·제작 레시피·비용·획득 확률을 추가하지 않는다.

## 자산과 구현

- 운영 매니페스트: `assets/ui/project-v/account-battle-suits/x-sword-v1/manifest.json`, `X_BODY_LIVE_20260927`.
- 승인된 16파일 25,122,669바이트를 재압축 없이 복사했다. 원본 검과 몸 비율은 고정이며 현재 사용되는 15파일만 불러온다. 검 출처용 PNG는 런타임 중복 로드하지 않는다.
- 원본 X 107개·천룡 강림 62개 승인 해시를 `scripts/promote-x-body.mjs`와 관련 테스트로 검사한다.
- 승인 그리기 함수를 기존 운영 GSAP/PixiJS 시계에 연결한다. 일반 영수증과 광역 서버 판정을 분리하고 피해 중복·누락·교체 대상 오염을 막는다.
- 전체 전투에서 재현된 공격 큐 지연을 X 배칭/배속 어댑터에서 수정했다. 별도로 관측된 단일→다중 전장 몬스터 텍스처 캐시 폐기 문제를 공용 연속 전장에서 복구한다.
- 운영 로더 버전은 `20260927-berkan-tempo-hunt-area-v2-x-dragon-v1`, 메인 캐시 토큰은 `xBody=20260927-dragon-v1`이다.

## 변경 규모와 배포 계획

직전 운영 배포는 Cloudflare Pages `e24ab388-c4af-4c99-b50f-f15169acee5f`, 전체 커밋 **06b82dd4c0e07fafeb0773d730513caa2367a75b**다. 운영 목록에서 확인한 값이다.

이번 변경은 X 장비 한 종의 카탈로그·서버 스케줄 등록·기존 전투 어댑터 연결 및 재현된 이미지 캐시 복구로 범위를 한정한다. DB 스키마·공통 트랜잭션·인증 기반·런타임 의존성·인프라는 변경하지 않는다. 기준 SHA 이후 이미 main에 병합된 모든 OWNER 버닝 CMS 접근 수정도 관련 두 테스트로 함께 검증한다. 계정 역할 검증을 제거하지 않는다. 같은 범위의 문서·기존 승인 자산 보존도 배포에 포함된다.

배포 후보를 정리하는 동안 main의 칭호·한복 아바타 작업이 추가되어 함께 보존했다. 칭호 초기화와 X 초기화가 모두 실행되도록 marker 목록을 합치고 메인 캐시 토큰 두 개를 보존했다. 칭호·장비 로딩·기본 슈트 카탈로그·한복 자산 관련 검사도 선택 범위에 포함한다. 별도 한복 DB 운영 스크립트는 이 작업에서 실행하지 않는다. 해당 작업의 기존 PC/모바일 검수 기록은 각 출시 문서를 따른다.

따라서 `docs/scoped-release-policy-20260923.md`에 따라 `npm run deploy:production -- --scoped`를 사용한다. 선택 검사는 다음과 같다.

```json
[
 "preview/battle-suit-x-dragon-v1/qa.test.mjs",
 "tests/x-body-live-20260927.test.mjs",
 "tests/x-body-area-skill-20260927.test.mjs",
 "tests/continuous-monster-texture-reentry-20260927.test.mjs",
 "tests/z-body-sword-live.test.mjs",
 "tests/z-body-dash-v2.test.mjs",
 "tests/z-body-area-skill-v3.test.mjs",
 "tests/battle-suit-damage-v2063.test.mjs",
 "tests/battle-suit-skill-chip-runtime-v2046.test.mjs",
 "tests/project-v-v3-account-battle-unit-v1953.test.mjs",
 "tests/burning-owner-access-20260927.test.mjs",
 "tests/burning-owner-timer-v1902.test.mjs",
 "tests/pve-battlefield-entry-v2117.test.mjs",
 "tests/achievement-titles-20260927.test.mjs",
 "tests/equipment-loading.test.mjs",
 "tests/project-v-battle-suit-backend-v1953.test.mjs",
 "tests/clan-avatar-hanbok-20260927.test.mjs",
 "tests/clan-avatar-hanbok-assets-20260927.test.mjs"
]
```

추가 체크는 `check:worker`. 지정 배포 명령이 깨끗한 커밋, origin/main 일치, 출시 플래그·캐시 호환·Hyperdrive 쿼리 캐시 OFF를 확인한다. 동일 최종 빌드의 검사를 별도 전체 사전 실행으로 반복하지 않는다. PC·모바일 시각 검수 및 전체 서버 타임라인 재생 증빙은 `preview/battle-suit-x-live-v1/README.md`와 `qa/`에 보존한다.

배포 후에는 해당 배포의 커밋·메인 로더 캐시·X 대표 자산 해시·CMS 등록만 짧게 확인한다. 롤백 시 기존 운영 배포로 되돌리고 X 카탈로그의 운영자 설정은 보존한다. 신규 지급·재화 변경이 없어 재고/재화 보정은 필요 없다.
