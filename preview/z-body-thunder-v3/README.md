# Z-BODY 번개 대쉬·검격 / 뇌검 집행 V3

2026-09-26. 실제 V3 엔진·진형·카드 도크·아트 어댑터를 사용하는 독립 검수판이다.

- 뇌검 집행: `좋네`로 시안 승인. 승인한 검 낙하·지면 파열 원본은 고정했다.
- 일반 공격: `번개느낌이 좋은데..`를 반영한 청백색 방전·검격은 후속 `ㅇㅋ`로 방향 승인.
- 마지막 요청 `날라갈대 대쉬 이펙트좀 쌔게줘봐 화려하게`: 돌진 전류 12프레임을 추가하고 5겹 잔상으로 강화했다. 이후 `ㅇㅋ 전체 승인`으로 모든 효과를 최종 승인했다.
- `shared/z-body-area-skill.mjs`의 운영 게이트는 true다. 공용 `ZBodySwordAnimation`이 새 효과를 미리 읽고 정상 Z바디 인스턴스에 고유 스킬을 등록한다.
- 사용자 전체 승인 후 운영 등록·캐시 버전을 연결했다. 범위 배포 기록은 `docs/z-body-lightning-release-20260926.md`를 따른다.

## 실행

```powershell
node preview/z-body-thunder-v3/serve.mjs
```

`http://127.0.0.1:8799/preview/z-body-thunder-v3/`

`일반 대쉬·평타`와 `뇌검 집행 · 승인본`을 선택해 새 연출/기존 연출을 비교한다. 재생, 0.25/1/2배속, 정지·재개, 중단, 단계별 시킹을 제공한다. 전체 서버 기록 검증은 고정 검수 스탯으로 생성한 서버 시뮬레이션을 재생한다. 실계정·재화 API는 사용하지 않는다.

## 자산과 실제 런타임

내장 `image_gen`으로 생성했다. `prompts.json`, `normal-lightning-prompts.json`, `dash-surge-prompt.json`에 최종 프롬프트와 원본 위치를 보존한다. 초기 금빛 일반 공격은 `normal-prompts.json`·`normal-gold-history.json`에 이력으로만 보관하며 현재 런타임은 읽지 않는다.

| 효과 | 개별 연속 프레임 | 실제 자산 |
| --- | ---: | --- |
| 뇌검 / 지면 파열 | 12 + 12 | `assets/blade-*`, `assets/ground-*` |
| 번개 대쉬 꼬리 / 돌진 전류 증폭 | 12 + 12 | `assets/normal-lightning-wake-*`, `assets/normal-lightning-surge-*` |
| 전류 검격 / 접촉 방전 | 12 + 12 | `assets/normal-lightning-slash-*`, `assets/normal-lightning-impact-*` |

합계 **72개의 서로 다른 프레임**. 원본 RGBA PNG와 SHA-256은 `assets.json`·`normal-assets.json`에 기록했다. 운영은 `assets/ui/project-v/account-battle-suits/z-thunder-v3/`와 `z-normal-lightning-v3/`의 승인된 동일 PNG 6장을 사용한다. Sharp 0.35.2는 셀 추출·균일 배율·투명 여백 패킹만 수행하며 원본 알파를 보존한다. 승인된 슈트 몸체·검 원본과 크기 `0.563696948902027`은 변경하지 않는다.

잠금 버전은 PixiJS **8.20.0**, GSAP **3.13.0**. `build-report.json`은 하나의 Pixi/GSAP 번들만 사용함을 검증한다.

- `preview/project-v-v3/source/battle/ZBodyNormalFX.js`: 공용 `backgroundLayer`에 번개 꼬리·전류 증폭·잔상, `effectLayer`에 검격과 방전을 표시한다. 별도 타이머/렌더러/GSAP 인스턴스 없이 공용 `ZBodySwordAnimation`의 GSAP 밀리초를 샘플링한다.
- 일반 공격: 이동 55–190ms, 접촉 **245ms**, 복귀 완료 540ms, 전체 640ms. 검격 5번째 프레임과 방전 3번째 프레임이 245ms에 맞는다. 돌진 증폭은 40–302ms이며 준비→확장→분기→소멸을 각각 그렸다.
- `preview/project-v-v3/source/battle/ZBodyThunderFX.js`: 공용 `BattleSuitSkillChipPlayback`의 GSAP 초 단위 전투 시계를 샘플링한다. 기존 뇌검 자세를 사용하고 1080/1210/1340/1430/1540ms 서버 타격을 확인한 뒤 접촉 프레임을 진행한다. 대상 좌표·ID를 고정하고 교체된 적 슬롯에 새 피해를 만들지 않는다.
- 뇌검은 몸체를 잠그는 동안 일반 공격의 큐를 보존한다. 종료·중단은 잠금과 표시 객체를 정리한다. 공유 텍스처는 레지스트리가 소유한다.
- 신규 사운드는 없다. 테스트 합성음도 추가하지 않았다.

## 서버 판정

뇌검 집행은 기존 평타를 여러 적에게 보이게 묶던 연출과 별개의 Z-BODY 고유 스킬이다. 소유 스킬칩 목록에 넣거나 헬기폭격 칩을 지급하지 않는다.

- 발동 간격 **15초**, 피해 기준은 `SKILL_CHIP_HELICOPTER_AIRSTRIKE`와 동일한 **5배** 공식이다. 적 1명마다 헬기폭격 1회분을 독립 계산해 5회 타격으로 나눈다. 적 수로 나누지 않는다.
- 전열·후열의 살아 있는 모든 적이 대상이다. 시전 후 사망한 대상에게 남은 타격을 이전하거나 신규 적에게 재지정하지 않는다.
- 기존 방어·회피·치명타·보호막·종말 보스 관통 공식과 스킬칩을 유지한다. 고유 스킬 피해는 `battleSuitSkills`로 별도 집계한다.
- PVP, 다른 슈트, 장비 없음·전투력 0에서는 고유 스킬이 발생하지 않는다.

## 검수 기록

관련 검사만 수행했다. 전체 출시 게이트 대신 변경 범위 검수로 배포한다.

| 검사 | 결과 |
| --- | --- |
| `npm run test:battle-suit` | 103 통과 |
| `npm run test:skill-chips` | 71 통과 |
| `npm run build:v3-grid` 후 `npm run test:v3-grid` | 25 통과, 9개 소비자 번들과 메인 로더 연결 확인 |
| `npm run test:z-body-effects` | 13 통과: 서버 피해·광역, 72프레임 알파·해시, 접촉 시점, 일시정지·배속·취소·슬롯 교체 |
| 공용 재생·메인 연결 3개 파일 | 19 통과: `project-v-v3-nonblocking-fx-v2060`, `v3-fluid-combat-v2126`, `project-v-v3-live-payload-v1` |
| `npm run check:worker`, `node --check functions/_battle_v2_preview.js` | 통과 |

실제 브라우저: 데스크톱 1265×712와 모바일 390×844에서 대쉬 전개/245ms 접촉/소멸, 기존 효과 비교, 0.25·1·2배속, 일시정지 유지, 중단 후 대기 자세와 타임라인 0을 확인했다. V3 카드 도크와 진형은 공용 코드다. 브라우저 콘솔 오류는 없었다.

전체 연속 전투의 실제 재생 결과: 평타 **220/220회, 15,549,868**, 고유 스킬 **70/70회, 14,902,440**로 서버 합계와 일치했다. 남은 타격 큐 0, 고유 스킬 이펙트 0. 이후 대쉬 증폭은 순수 시각 계층만 추가했으며 동일 GSAP 접촉·취소 검사를 통과했다.

고정 첫 시전 검수는 단일 적 **5회 / 1,064,460**, 적 5명 **25회 / 5,322,300**이다. 이는 검수 스탯의 실제 결과이며 계정마다 같은 고정 피해를 부여하는 정책이 아니다.

## 변경 범위와 배포 상태

기준 체크아웃: `2c1e95bb13d87f559ee5c3e4950ca35c9da2b0bf` (작업 시작 시 origin/main). 이 값을 직전 운영 배포 SHA로 간주하지 않는다.

서버 Z-BODY 스킬 계산, 해당 공용 스킬 재생·몸체 충돌 방지, 검수 자산과 페이지만 변경했다. DB·권한·의존성·다른 콘텐츠 정책 변경은 없다. 운영 배포 시 `docs/scoped-release-policy-20260923.md`에 따라 실제 직전 배포 SHA·캐시·출시 플래그·원격 main 일치를 확인하고 `npm run deploy:production -- --scoped`를 사용한다. 이미 통과한 동일 빌드 검사를 불필요하게 반복하지 않는다.
