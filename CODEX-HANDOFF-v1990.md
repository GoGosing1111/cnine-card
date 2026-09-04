# CODEX 지시문 — v1990 2차(배틀슈트 독립 시계 + 아포칼립스 게이트) 마무리

> **이전 지시문의 0번 중단 조건은 잘못된 기준이었다.** 코덱스가 멈춘 판단은 옳았고, 원인은 누락이 아니라
> 이 문서를 쓴 쪽이 "v1990 1차가 이미 커밋된 사실"을 반영하지 못한 것이다. 아래가 정정판이다.

## 배경 — v1990 은 두 번에 나눠 들어간다

| | 내용 | 상태 |
|---|---|---|
| 1차 | 배틀슈트를 "카드 행동마다 N발" 로 쏘게 한 중간 방식 + 클라 큐/드레인 + 캐시 태그 | **커밋 `6e00734a` 로 이미 반영됨** (`fix(v3): 배틀슈트 서버 사격과 소탕 결과 레이어 통합`) |
| 2차 | 사용자 지시("턴·행동력과 무관한 독립 행동력으로 시작부터 끝까지")에 따른 케이던스 교체 + 아포칼립스 게이트 | **이번 작업. 작업 트리에 미커밋 상태로 얹혀 있다** |

1차 이후 `2004-battle-suit-materials` 까지 다른 작업이 여러 건 커밋됐다. 2차는 그 위에 쌓는다.
**1차를 되돌리거나 다시 적용하지 말 것.** 1차의 `independentRoundsPerCardAction` / `CARD_ACTION_CADENCE`
는 2차에서 제거되는 게 정상이다.

## 0. 상태 확인

```
git log --oneline -1        # 2a2a40e fix(territory): 감스트 퇴역 영향 덱 자동 복구 (또는 그 이후)
git status --short
```

수정 22개 + 신규 1개(`tests/pve-apocalypse-battle-suit-gate-v1990.test.mjs`)가 나와야 한다.
수정 목록의 대부분(13개)은 캐시 태그 `2004-battle-suit-materials` → `2005-battle-suit-independent-fire`
갱신뿐인 테스트 파일이다. 실제 코드 변경은 아래 6개:

```
functions/_battle_v2_preview.js
preview/project-v-v3/source/battle/BattleEngine.js
preview/project-v-v3/source/battle/README.md
preview/project-v-v3/project-v-pixi-battle.bundle.js
package.json                                        (test:apocalypse 에 게이트 테스트 추가만)
tests/project-v-battle-suit-backend-v1953.test.mjs  (배틀슈트 케이던스 단언 블록만)
```

`git log --oneline -1` 이 `2a2a40e` 보다 뒤라면(= 그 사이 새 작업을 했다면) 위 6개가 그 작업과
겹치는지 `git diff` 로 먼저 확인하고, 겹치면 멈추고 보고할 것.

## 1. [필수] V3 번들 재생성

`preview/project-v-v3/project-v-pixi-battle.bundle.js` 는 npm 이 없는 환경에서 minified 파일에 손으로
패치한 상태다. 동작은 검증했지만 정식 빌드로 덮어써야 한다.

```
npm ci
npm run build:v3
```

빌드 후 번들에 아래가 살아 있는지 grep 으로 확인(수동 패치가 소스와 어긋나지 않았다는 뜻):
`firesOnlyServerShots` / `waitForAccountBattleUnitDamageQueueDrain` / `monotonicHp`
없으면 멈추고 보고.

## 2. [필수] 게이트

```
npm run release:gate
```

컨테이너에서 `sharp` / `pg` 미설치로 못 돌린 것들은 **로컬에서 처음 통과 여부를 확인해야 한다**:
`project-v-battle-suit-animation-assets-v1955`, `alchemy-system-v1973`,
`project-v-apocalypse-boss-sd-v1958`, `coin-prediction-history-v1813`, `test:gamst-retirement` 일부.
그 외 스위트는 이 환경에서 전부 통과 확인함(navigation 1 / raid-entry 9 / workshop 21 / clan 28 /
prison 9 / apocalypse 5 / pve-sweep 11 / battle-suit 20 / territory-reward 6 / ranked-reward 4 /
coupon 4 / prime-draw 17 / superstar-pack 9 / targeted-transfer 3 / escort 6).

실패하면 밸런스 상수를 만지지 말고 실패 내용을 그대로 보고할 것.

## 3. [필수] 커밋 · 배포

```
git add -A
git commit -m "fix(battle-suit): 배틀슈트를 독립 시계 연사로 되돌리고 아포칼립스 최종 난이도 게이트 추가"
npm run deploy:production
```
`npx wrangler pages deploy .` 직접 호출 금지.

---

# 2차 변경 내용 (검토용 — 재설계 금지)

## A. 배틀슈트 케이던스: 카드 행동 예산 → 독립 시계

**왜 또 바꾸나.** 1차의 "카드 행동 1회당 N발" 은 사용자가 원한 것이 아니었다.
요구는 "카드 턴·행동력과 무관하게 시작부터 끝까지 계속 쏘는 지속 데미지".
카드 행동에 묶으면 빠른 덱일수록 배틀슈트도 빨라져서 독립 유닛이 아니게 된다.

**수정 — `functions/_battle_v2_preview.js`**
- `BATTLE_SUIT_REFERENCE_CYCLE = 0.018` (20만 전투력 카드의 게이지 1회전) 기준.
  무기별 `shotsPerCycle`: M4 15 / AK 10 / 저격 5 / DMR 8 / 기본 10.
  발사 간격 = `0.018 ÷ shotsPerCycle` (절대 시계값), 시작 지연 = 간격 × 0.35.
- 카드 턴·게이지·행동 수와 완전 무관. `actionCount` 에 포함되지 않아 전투 길이·강제 몬스터 주기 불변.
- 발당 피해 = `hitResult(attackMultiplier) ÷ shotsPerCycle`
  → 기준 사이클 총합 ≈ "배틀슈트 전투력만큼의 카드 1장 1회 타격 × attackMultiplier(0.92/1.00/1.58/1.28/1.00)".
  최소 피해 하한도 같이 나뉘어 연사가 하한을 N번 먹지 않는다.
- `rules`: `battleSuitActionClock:'INDEPENDENT_TIME_CADENCE'`, `battleSuitFireInterval`,
  `battleSuitShotsPerCycle`, `battleSuitReferenceCycle`.
  fighter: `independentFireInterval` / `independentOpeningDelay` / `independentShotsPerCycle` /
  `independentAttackMultiplier`. (1차의 `independentRoundsPerCardAction` 제거)

**실측(seed 고정, 힐1방2공1속1 + 슈트 15만)**
- M4 판당 139~166발(발당 2.6k~7.3k), 배틀슈트 총피해 = 카드 총피해의 17~21%, 행동 수 63→55.
- 독립 시계 확인: 카드 5만 덱 244발/20행동, 20만 145발/48행동, 80만 64발/55행동
  (약한 덱일수록 같은 슈트로 더 많이 쏜다 = 카드 속도와 무관).
- 배틀슈트 미장착 전투는 v1989 와 타임라인·결과 완전 동일.

**클라(`BattleEngine.js`)** — 1차에서 이미 들어간 큐/드레인 구조는 유지. 2차에서 추가한 것:
큐가 8발 이상 밀리면 같은 대상 연속 사격을 한 발로 병합(피해 합산)해 화면이 따라가게 한다.

## B. 아포칼립스 최종 난이도 게이트

**문제.** `SHIELD_SIPHON`(강탈의 성배)이 아포 보스 보호막(최대HP 40%)의 60%를 활성화 1회에 강탈.
5장 × 2회면 보호막이 통째로 사라진다. 실측: 85만 덱이 기본전투력 200만 아포 보스를 **68% 승리**
(성배 없으면 0%). `DOOM_MARK` 폭발 / `CHAIN_ECHO` 도 같은 maxHp 비례 우회 경로.

**수정 — `functions/_battle_v2_preview.js` (`APOCALYPSE_RULES`, `rules.apocalypseRules` 로 노출)**
1. `APOCALYPSE_FLOOR_GAIN` 2.5 → **1.7**. 카드만의 문턱 ≈ 기본전투력 × 1.2 → **× 1.6**.
2. 아포 몬스터 대상 마법 효과 1회 상한 = 일반 타격 1회 하한(`maxHp × 1.6% × 하한스케일`) × 1.
   적용: 성배 강탈량 / 낙인 폭발 피해 / 연쇄 메아리 피해.
   **비-아포 몬스터와 PVP 는 종전 그대로** (회귀 테스트로 확인).
3. 배틀슈트 관통(`apocalypsePierce` 이벤트 필드): 아포 보스에게 발마다 보호막을 무시하고 HP 직접
   ```
   maxHp × 6%(기본전투력 덱의 게이지 1회전당)
        × clamp(슈트전투력 / 기본전투력 ÷ 0.15, 0, 2)
        × (덱전투력 / 기본전투력)²          ← 약한 덱을 슈트만으로 캐리하지 못하게 하는 게이트
        × (무기 간격 / 기준 회전)
   ```
   보스 티어(기본전투력)가 달라도 문턱이 같고, 무기가 달라도 화력이 같다.

**결과 승률** (기본 100만·200만·400만 동일 경향, 전역 기본값 HP260/공220/방190/실드40/연타2/강제4/궁28, 30 seeds)

| 조건 | v1990 2차 | 이전 |
|---|---|---|
| 덱×1.0, 슈트 없음 | 0% | — |
| 덱×1.0, 성배 5장 | 0% | 덱×0.85 에서 68% |
| 덱×1.0 + 슈트 10% | 10~37% | — |
| 덱×1.0 + 슈트 15% | 80~100% | — |
| 덱×1.2, 슈트 없음 | 0% | 100% |
| 덱×1.6, 슈트 없음 | 70~77% | — |
| 덱×0.7 + 슈트 15% | 0~27% | — |

**튜닝 레버(사용자 지시 없이 건드리지 말 것)**
`APOCALYPSE_FLOOR_GAIN`(카드 문턱) / `APOCALYPSE_SUIT_PIERCE_CYCLE_PERCENT`(슈트 문턱) /
`APOCALYPSE_SUIT_PIERCE_DECK_GATE_EXPONENT`(약한 덱 캐리 방지 강도)

**주의.** `estimateApocalypseRecommendedPower` 는 슈트 미장착 기준이라 화면 "권장 전투력"이
≈ 기본 × 1.6 으로 올라간다. 의도된 값이다 — 슈트(기본의 15%+)를 끼면 ≈ 기본 × 1.0.

## C. 캐시 태그

| 대상 | 값 |
|---|---|
| `index.html` app.js / `service-worker.js` shell | `2004-battle-suit-materials` → **`2005-battle-suit-independent-fire`** |
| pixi 번들 / `battle-v3-live.js` VERSION | `97-battle-suit-per-action-fire` / `3.30.0-battle-suit-per-action-fire` (1차 값 유지) |

태그를 하드코딩 검사하는 테스트 13개를 함께 갱신했다(territory 계열 5, project-v-v3 계열 2,
pve-sweep, superstar-pack, battle-suit-frontend, avatar, coin-prediction-history, live-operations).

## D. 이번 범위 밖

- V3 전장이 몬스터 실드를 그리지 않는 문제(아포 실드 구간 HP바 정지)는 여전히 미해결. 별도 작업.

## E. 배포 후 확인 요청

컨테이너는 SwiftShader(소프트웨어 렌더러)라 실제 GPU 대비 ~10배 느려 큐 소화 속도를 못 잰다.
실기기에서 M4 장착 사냥 1판 + 아포 1판을 돌려:

```js
ProjectVPixiBattle.diagnostics().accountBattleUnit.sustainedFire.queuedDamageEvents
```

가 전투 종료 시 `0` 인지 확인. 0이 아니면 `BattleEngine.js` 의 병합 임계값(현재 8발)을 낮춰야 한다.
