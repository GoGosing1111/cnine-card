# 코덱스 지시서 — v2060 커밋 (V3 전투 재생 개편)

## 2026-09-07 검증 실행 기록

아래 지시서는 전달 당시 원문이다. 최종 검증 결과는 `TEST-REPORT-v2060.txt` 첫 절을 따른다.
수동 패치 번들을 esbuild 소스 재빌드로 대체하고, 배너 충돌/취소 및 일반 공격에서 다른
연출로 넘어갈 때의 꼬리 정리를 보완했다. 신규 테스트는 13개에서 20개로 늘었다.
`settlePendingTails(` 는 정의 1곳과 호출 5곳, 총 6곳이며 소스/번들 일치를 검사한다.
변경 파일 범위는 그대로 43개다. 서버·보상·밸런스와 SkillTimeline 소스는 변경하지 않는다.
전체 회귀 661개는 통과했으나 `release:gate` 마지막 origin/main 일치 검사는
미푸시 로컬 검증 후보이므로 차단된다. 원격 검사 우회 없이 로컬 커밋만 진행한다.
**이번 작업에서 push 및 배포는 하지 않는다.**

---

> 상태: **작업 트리에만 있고 아직 커밋 안 됨.** 43개 파일 전부 미커밋이다.
> 기준 커밋: `80fb14c` (Update health grant contract test).
> 코덱스가 그 사이 만진 파일(`functions/_battle_suit_ebody_pity_v2059.js`,
> `functions/api/[[path]].js`, `package.json`,
> `tests/battle-suit-ebody-pity-v2059.test.mjs`,
> `tests/targeted-skill-chip-grant-v2055.test.mjs`)과는 **겹치는 파일이 없다.**
> 덮어쓰기 전에 기존 파일들이 `80fb14c` 와 바이트 단위로 같은지 확인했다.
>
> 1부와 2부가 있지만 **하나의 릴리스, 하나의 커밋**이다. 캐시 태그도 하나만 올린다.

아래를 그대로 코덱스에 붙여넣으면 된다.

---

작업 트리에 v2060 수정이 반영돼 있다. 검증하고 커밋해라. 배포는 하지 마라.
서버 코드는 한 줄도 안 건드렸다. 판정·보상·밸런스 영향 없음.

## 1부 — 마법카드·고유효과 발동이 전투를 멈추던 문제

특정 연출의 문제가 아니라 재생 구조였다. 서버 `_battle_v2_preview.js` 는
`pushEvent(timeline, clock, type, ...)` 로 이벤트마다 시뮬레이션 시각 `at` 을 찍어
보내는데(:507), 클라이언트 `BattleEngine.playEvents` 는 그 `at` 을 **전혀 읽지 않고**
`for(const event of events){ ... await ... }` 로 이벤트를 하나씩 끝까지 기다렸다.

비용의 대부분은 `showBanner`(BattleEngine.js:2316)가 0.92초짜리 타임라인을
통째로 await 하는 것이었다.

    회복/불굴 계열, 피해 0 마법카드 : 지원이펙트 0.35초 + 배너 0.92초 ≈ 1.05초
    회피(속도형)                    : 배너만 0.7초
    전직 발동/차단 배너              : 0.92초

생명형 카드 2장이면 매 라운드 2초 이상이 "아무도 안 움직이고 배너만 뜨는" 시간이었다.
마법카드는 타격 1회에 봉인·표식·실드흡수가 같이 붙어 3연속 배너가 나가기도 했다
(`_battle_v2_preview.js:1270-1280`, `clock+0.00005` 같은 미세 오프셋 = "같은 순간"이라는 뜻).

### 어떻게 고쳤나

1. **`queueBanner()` 신설** — 논블로킹 배너 큐.
   배너 표시 객체(`uiLayer.banner`)가 **하나뿐**이라 병렬로 던지면 글자가 서로 덮어쓴다.
   큐로 직렬화하되 전투 타임라인은 큐를 기다리지 않는다. 밀린 배너가 전투보다
   뒤처지지 않도록 대기열은 **최신 2건만** 유지한다. `cancelTimelines()` 에서 비운다.

2. **`queueSupportEffect()` 신설** — 회복·불굴 이펙트를 기다리지 않고 재생.

3. **HP 동기화를 연출 impact 시점 → 이벤트 처리 시점으로 앞당김.** ← 필수다.
   연출을 안 기다리게 되면 늦게 도착한 `onImpact` 가 뒤따른 타격이 내린 HP 를
   되돌린다. v1990 에서 `monotonicHp` 로 막았던 것과 같은 사고다.

4. **비차단으로 바꾼 이벤트**
   - TURN 회피 배너
   - MAGIC_CARD 중 피해 0 (봉인 / 표식 / 실드흡수 / 회복)
   - TEAM_HEAL / REGEN / EMERGENCY_HEAL / SURVIVE / INDOMITABLE / SINGLE_HEALER_AURA
   - ADVANCEMENT(전직 성공) 배너, ADVANCEMENT_BLOCKED 배너
   - BOSS_ULTIMATE 예고 배너 (뒤따르는 광역 타격과 겹쳐 표시 — 예고로는 오히려 낫다)
   - bossCounter 방어 배너

**측정**: 발동 이벤트 40건 재생 **45,846ms → 6ms**.

## 2부 — 타격 연출의 뒷정리를 다음 행동과 겹치기

### 먼저: at 기반 동시 재생은 짤 게 없었다

1부의 "남은 과제"로 적었던 것인데, 조사해보니 동시성이 데이터에 아예 없다.
`createPveBattleV2` / `createPvpBattleV2` 를 node 로 직접 돌려 `at` 분포를 확인했다.

    PVE (5카드 vs 보스) : 주요 행동 60건 / 서로 다른 at 60개 / 같은 at 0건
    PVP (5 vs 5)        : 주요 행동 26건 / 서로 다른 at 26개 / 같은 at 0건

`_battle_v2_preview.js:1068-1071` 이 속도 게이지 ATB 루프라 `clock` 을 다음 행동자
시점으로 옮기고 한 스텝에 딱 한 명만 행동시킨다. `at` 스케줄러를 만들어도 지금과
같은 순서가 나오므로 만들지 않았다. 실제로 겹치던 둘(배틀슈트 연사, 타격에 딸린
마법·상태 이벤트)은 각각 v1990 과 이번 1부에서 처리됐다.

### 그래서 남은 건 타격 연출 자체의 길이

`normalAttack` 타임라인:

    0.00  공격자 이동 시작
    0.25  임팩트 (데미지 확정, HP 동기화, 화면 흔들림, 흰 플래시)
    0.43  공격자 복귀 시작 (0.3초)
    0.48  데미지 숫자 페이드아웃 시작 (0.25초)
    0.73  타임라인 끝  <- 여기까지 다음 행동이 기다렸다

임팩트 이후 0.48초, 전체의 **66%가 "이미 때린 뒤의 뒷정리"**인데 다음 행동이 그걸 다
기다리고 있었다. PVE 한 판이 타격 60회니 그만큼 그대로 쌓였다.

### 어떻게 고쳤나

1. **`timeline(build, cleanup, fixedTimeScale, {releaseAt, owners})` 로 확장**
   - `releaseAt` 시점에 호출자에게 먼저 resolve 한다.
   - `cleanup` 은 타임라인이 **실제로 끝날 때만** 돈다. cleanup 이 공격자를 제자리로
     되돌리고 데미지 라벨을 풀에 반납하므로 조기 실행하면 화면이 튄다.
   - `owners` 로 넘긴 캐릭터를 `pendingTails` 에 등록한다.

2. **`settlePendingTails(characters)` 신설**
   새 행동 전에 그 공격자·피격자가 소유한 꼬리 타임라인을 강제 종료한다.
   같은 객체에 트윈이 두 개 붙어 위치·tint 가 어긋나는 것을 막는다.
   같은 카드가 연속으로 행동할 때가 이 경로다.

3. **`normalAttack` 이 위 둘을 사용** — 시작 시 `settlePendingTails([actor, victim])`,
   `releaseAt: returnAt(0.43)`, `owners: [actor, victim]`.

4. **조기 릴리스 제외**
   - 전직 연출(`advancementProfile`): 히트스탑으로 타임라인을 멈추는 authored 연출.
   - `reducedMotion`: 이미 8배속이라 얻을 게 없다.
   - 컷인 스킬(`playTacticalSkill` / SkillTimeline): 배경·적 디밍을 0.46 에 복원하므로
     조기 릴리스하면 다음 행동이 어두운 화면에서 시작한다. 그대로 뒀다.
     (실제 타임라인에 SKILL 이벤트는 거의 안 나온다 — PVE/PVP 실측 모두 0건)
   - `cancelTimelines` 가 `pendingTails` 를 비운다. `syncFinalState` 가 이걸 호출하므로
     전투 종료 시 남은 꼬리는 정리되고 서버 최종 상태가 그대로 반영된다.

**측정**: 교대 타격 843ms/회 → **554ms/회 (34% 단축)**,
동일 카드 연속 848ms → **437ms (49%)**.

## 변경 파일 (총 43개, 전부 미커밋)

### 코드 (2개)

    preview/project-v-v3/source/battle/BattleEngine.js
      1부: queueBanner / queueSupportEffect 신설, 생성자 bannerQueue·bannerPump,
           cancelTimelines 에서 큐 비우기, playEvents 반복 발동 분기 7곳 논블로킹
      2부: pendingTails, settlePendingTails 신설, timeline() 에 releaseAt/owners,
           normalAttack 진입부 정리 + 종료 인자

    preview/project-v-v3/project-v-pixi-battle.bundle.js
      위와 동일. 컨테이너에 esbuild 가 없어(npm 레지스트리 403) 수동 패치했다.
      1부 10개 + 2부 5개 = 15개 지점, 각각 "정확히 1회 일치" 단언 후 치환.
      906,535 -> 907,710 bytes. ※ esbuild 가 있으면 아래 "선택 확인" 참고.

### 캐시 태그 (7개) — 1부·2부 공통, 한 번만 올린다

    index.html                                    js/app.js?v= 및
                                                  js/responsive-battle-sprites-v1815.js?v=
                                                  2059-cheetah-scale -> 2060-nonblocking-fx
    service-worker.js                             SHELL_CACHE -> soop-card-shell-v2060-nonblocking-fx
    js/app.js                                     번들 태그 100-boss-signatures -> 101-nonblocking-fx
    preview/project-v-v3/project-v-client.js      동일
    preview/project-v-v3/index.html               project-v-client.js?v= 74 -> 75-nonblocking-fx
    preview/core-protocol-raid-v1/index.html      번들 태그 101-nonblocking-fx
    preview/idle-v3-v1/battle.html                번들 태그 101-nonblocking-fx

### 문서 (3개, 신규)

    PATCH-NOTES-v2060.txt      (1부 + 2부)
    TEST-REPORT-v2060.txt      (1부 + 2부)
    CODEX-COMMIT-v2060.md      (이 문서)

### 테스트 (31개)

신규 2개:

    tests/project-v-v3-nonblocking-fx-v2060.test.mjs         (1부, 8/8)
    tests/project-v-v3-attack-tail-overlap-v2060.test.mjs    (2부, 5/5)

두 파일 모두 소스에서 해당 메서드를 그대로 추출해 목 위에서 실행하는 방식이다.
HP 순서 보존, 재생 종료 후 추가 HP 쓰기 0건, 배너 대기열 2건 상한, 큰 연출의 차단 유지,
releaseAt 과 cleanup 분리, settlePendingTails 의 중복 cleanup 방지, 소스-번들 계약 일치,
캐시 태그를 검사한다.

나머지 29개는 **하드코딩된 기대 문자열만** 바뀌었다(로직 변경 없음).
`escort-operation-v1830.test.mjs:100` 이 "index.html 의 `js/app.js?v=` 와
service-worker `SHELL_CACHE` 가 같은 값"이어야 한다고 단언하기 때문에 태그를 올리면
같이 갱신할 수밖에 없다.

그중 둘은 **원격 HEAD 에서 이미 깨져 있던 것**을 겸사겸사 고친 거다:
`project-v-v3-combat-fx-v1.mjs` 와 `project-v-v3-battlefields-v1.mjs` 가
`project-v-client.js?v=72-battle-suit-continuous-fire` 를 기대하고 있었는데
실제 `preview/project-v-v3/index.html` 값은 74였다. 75로 맞췄다.

## 커밋 전 확인

1. 문법

       node --check preview/project-v-v3/source/battle/BattleEngine.js
       node --check preview/project-v-v3/project-v-pixi-battle.bundle.js

2. 신규 테스트 (합계 13/13 이어야 한다)

       node --test tests/project-v-v3-nonblocking-fx-v2060.test.mjs \
                   tests/project-v-v3-attack-tail-overlap-v2060.test.mjs

3. 회귀 게이트

       npm run release:gate

   이 컨테이너는 node_modules 가 없어 전체 게이트를 못 돌렸다. 대신 tests/ 전체를
   패치 전후로 각각 돌려 **실패 목록을 비교**했고 신규 회귀 0건이었다
   (양쪽 79개 실패, 목록 동일 — 전부 의존성 미설치 탓).
   `battle-suit-ebody-pity-v2059.test.mjs` 도 pglite 미설치로 실패하는데
   네 커밋(3f9119a)의 테스트이고 내 변경과 무관하다.

4. `git status` 로 위 43개 외에 딸려 들어간 게 없는지 확인해라.
   특히 `preview/project-v-v3/__v2060.bundle.js`,
   `preview/live-v3-role-hit-fx-v1/__v2060.html` 같은 A/B 측정용 임시 파일이
   남아 있으면 안 된다(내가 지웠지만 한 번 더 봐라).

5. (선택) esbuild 가 있으면 번들 수동 패치를 재빌드로 대체해도 된다.

       npm run build:v3

   재빌드 결과와 지금 번들의 **동작**이 같은지만 보면 된다(바이트는 다를 수 있다).
   확인 포인트: `queueBanner(` 8회, `queueSupportEffect(` 3회,
   `settlePendingTails(` 2회, `await this.showBanner(` 3회.
   재빌드했으면 그 결과물로 커밋해라.

## 커밋

    git add preview/project-v-v3/source/battle/BattleEngine.js \
            preview/project-v-v3/project-v-pixi-battle.bundle.js \
            preview/project-v-v3/project-v-client.js \
            preview/project-v-v3/index.html \
            preview/core-protocol-raid-v1/index.html \
            preview/idle-v3-v1/battle.html \
            index.html js/app.js service-worker.js \
            PATCH-NOTES-v2060.txt TEST-REPORT-v2060.txt CODEX-COMMIT-v2060.md \
            tests/

    git commit -m "feat(v3): 전투 재생 개편 - 발동 연출 논블로킹 + 타격 뒷정리 겹침 (v2060)

V3 전투가 자꾸 멈춰 보이던 원인 두 가지를 함께 고친다. 서버 코드는 무변경이라
판정·보상·밸런스 영향은 없다.

[1부] 마법카드·고유효과 발동이 전투를 멈추던 문제
서버는 이벤트마다 시뮬레이션 시각(at)을 보내지만 BattleEngine.playEvents 는 at 을
무시하고 이벤트를 하나씩 await 로 끝까지 기다리며 재생했다. showBanner 가 0.92초
타임라인을 통째로 await 하는 게 비용의 대부분이었다.

- queueBanner() 신설: 논블로킹 배너 큐. 배너 표시 객체가 하나뿐이라 큐로
  직렬화하되 전투는 큐를 기다리지 않는다. 대기열은 최신 2건만 유지한다.
- queueSupportEffect() 신설: 회복·불굴 이펙트를 기다리지 않고 재생한다.
- HP 동기화를 연출 impact 시점에서 이벤트 처리 시점으로 앞당겼다. 늦게 도착한
  onImpact 가 뒤따른 타격이 내린 HP 를 되돌리는 사고(v1990)를 막는다.
- 비차단 전환: 회피 배너, 피해 0 마법카드, TEAM_HEAL/REGEN/EMERGENCY_HEAL/
  SURVIVE/INDOMITABLE/SINGLE_HEALER_AURA, 전직 발동·차단 배너, 보스 광역 예고
  배너, bossCounter 배너.

측정: 발동 이벤트 40건 재생 45,846ms -> 6ms.

[2부] 타격 연출의 뒷정리를 다음 행동과 겹치기
1부의 남은 과제였던 at 기반 동시 재생은 조사 결과 짤 게 없었다.
createPveBattleV2/createPvpBattleV2 를 직접 돌려보니 주요 행동 60건/26건이 전부
서로 다른 at 을 갖는다(같은 at 0건). 속도 게이지 ATB 루프라 한 스텝에 한 명만
행동시키기 때문이다. 그래서 남은 비용은 타격 연출 자체의 길이였다.

normalAttack 은 임팩트가 0.25초에 끝나는데 타임라인이 0.73초까지 이어졌다.
나머지 0.48초(66%)는 공격자 복귀와 데미지 숫자 페이드, 즉 이미 때린 뒤의
뒷정리인데 다음 행동이 그걸 다 기다리고 있었다.

- timeline() 에 releaseAt/owners 추가. releaseAt 시점에 호출자를 먼저 놓아주고
  cleanup 은 타임라인이 실제로 끝날 때만 돌린다.
- settlePendingTails() 신설. 새 행동 전에 그 공격자·피격자의 남은 꼬리를 강제
  종료해 같은 객체에 트윈 두 개가 붙는 것을 막는다.
- normalAttack 이 복귀 시작 시점(0.43)에 릴리스하고 남은 0.3초를 겹쳐 재생한다.
- 제외: 전직 연출(히트스탑 authored), reducedMotion, 컷인 스킬(배경 디밍 복원이
  뒤에 있어 다음 행동이 어두운 화면에서 시작하게 된다).

측정: 교대 타격 843ms/회 -> 554ms/회(34%), 동일카드 연속 848 -> 437ms(49%).
데미지 텍스트 풀 28/28 반납, 진형 5:5 유지, 전원 제자리 복귀, 에러 0건.

번들은 컨테이너에 esbuild 가 없어 수동 패치했다(15개 지점 각각 정확히 1회 일치
단언 후 치환). node --check 및 실브라우저 렌더 검증 완료.

캐시 태그: app/SW 2060-nonblocking-fx, 번들 101-nonblocking-fx,
client 75-nonblocking-fx. index.html 의 app.js?v= 와 SHELL_CACHE 가 같아야 한다는
기존 계약 때문에 tests 의 하드코딩 기대문자열 29개도 함께 갱신했다.
그 과정에서 이미 깨져 있던 combat-fx / battlefields 의
project-v-client.js?v= 기대값 드리프트도 고쳤다."

## 배포

이 커밋으로 배포하지 마라. 사용자의 배포 지시를 기다려라.
배포할 때는 `npm run deploy:production` 만 쓴다. `npx wrangler pages deploy .` 직접 호출은 금지.

## 다음 단계 (이 커밋에 넣지 말 것)

컷인 스킬(SkillTimeline)의 뒷정리 겹침. 배경·적 디밍을 0.46 에 복원하므로 조기
릴리스하면 다음 행동이 어두운 화면에서 시작한다. 다만 실제 타임라인에 SKILL
이벤트가 거의 안 나오므로(PVE/PVP 실측 0건) 우선순위는 낮다.
