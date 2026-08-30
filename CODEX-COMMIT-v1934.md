# 코덱스 작업 이력 — v1934 커밋

> 상태: `f3ab1b47`로 완료됨. 아래 내용은 재실행 지시가 아닌 검증·커밋 이력이다.

아래 내용을 그대로 코덱스에 붙여넣으면 된다.

---

작업 트리에 v1934 수정이 이미 반영돼 있다. 검증하고 커밋해라. 배포는 하지 마라.

## 무엇을 고쳤나

"V3 WebGL 전장 구성 중"에서 전투 진입이 영구히 멈추는 버그다.

`BattleEngine.setBattlefield()`의 배경 교차 페이드가 GSAP 트윈이고 GSAP은 rAF로 돈다.
화면이 가려지면(탭 전환·화면 잠금·백그라운드 PWA) rAF가 멈춰 `onComplete`가 영원히 안 불린다.
그런데 `battle-v3-live.js`의 `initialize()`는

    await setBattlefield(mode);   // 안 보여서 영구 대기
    await setVisible(true);       // 보이게 만드는 코드가 그 뒤

순서라 순환 대기가 된다. 14초 타임아웃 후 재시도해도 같은 자리에서 막힌다.
`backgroundLayer.activeMode`는 `apply()` 안에서만 세팅되므로 마운트 직후 조기 반환 조건이
성립하지 않고, 전투에 들어갈 때마다 항상 이 트윈을 탄다.

Chrome 실측: 수정 전 `setBattlefield('HUNT')` 15.8초 미해결 → 수정 후 1ms.

## 변경 파일

    preview/project-v-v3/source/battle/BattleEngine.js
      setBattlefield: !this.visible || document.hidden 이면 페이드를 건너뛰고 즉시 적용.
      페이드를 타는 경우에도 700ms 시계 기반 안전장치(트윈 kill → apply → alpha=1).

    preview/project-v-v3/project-v-pixi-battle.bundle.js
      같은 수정을 미니파이 번들에 직접 반영 (Mt=gsap, o=apply).

    js/battle-v3-live.js
      setBattlefield 호출을 withTimeout(3000)으로 감쌌다.
      배경 전환은 연출일 뿐이므로 어떤 이유로도 전투 진입을 막지 않는다.

    js/app.js
      캐시 버전만 변경.
      preview/project-v-v3/project-v-pixi-battle.bundle.js?v=70-core-raid-v3-preserve
        → ?v=71-battlefield-fade-deadlock
      js/battle-v3-live.js?v=3.23.0-mobile-context-recovery
        → ?v=3.24.0-battlefield-fade-deadlock

    PATCH-NOTES-v1934.txt   (신규)
    TEST-REPORT-v1934.txt   (신규)

밸런스·전투 결과 로직은 건드리지 않았다. 연출 경로만 바뀌었다.

## 커밋 전 확인

1. 번들과 소스 정합성을 확인해라. 지금 번들은 손으로 패치한 것이다.
   `npm run build:v3`로 다시 빌드한 뒤 `git diff --stat`으로
   **setBattlefield 구간 외에 다른 변경이 없는지** 확인해라.
   다른 변경이 섞여 나오면(과거에 소스와 번들이 어긋난 흔적) 리빌드를 되돌리고
   손으로 패치한 현재 번들을 유지한 뒤, 그 사실을 커밋 메시지에 남겨라.

2. 문법·회귀

       node --check js/app.js
       node --check js/battle-v3-live.js
       node --check preview/project-v-v3/project-v-pixi-battle.bundle.js
       node --check preview/project-v-v3/source/battle/BattleEngine.js
       npm run test:raid-entry
       npm run check:worker

   `test:raid-entry`에 `raid-v3-mobile-recovery-v1930.test.mjs`가 들어 있다. 반드시 통과해야 한다.

3. `git status`로 위 6개 파일 외에 딸려 들어간 게 없는지 확인해라.
   특히 `tools/balance-harness-v1903/`와 `UNIQUE-TRAIT-V2-AND-AWAKENING-DESIGN.md`는
   별개 작업이므로 이 커밋에 넣지 마라.

## 커밋

    git add preview/project-v-v3/source/battle/BattleEngine.js \
            preview/project-v-v3/project-v-pixi-battle.bundle.js \
            js/battle-v3-live.js \
            js/app.js \
            PATCH-NOTES-v1934.txt \
            TEST-REPORT-v1934.txt

    git commit -m "fix(v3): 전장 교차 페이드 순환 대기로 전투 진입이 멈추는 문제 수정

setBattlefield 의 배경 교차 페이드는 GSAP(requestAnimationFrame) 트윈이다.
화면이 가려지면 rAF 가 멈춰 onComplete 가 불리지 않고 await 가 영원히 풀리지 않는다.
battle-v3-live 의 initialize 는 setBattlefield 다음에 setVisible(true) 를 부르므로
'안 보여서 멈추는데 보이게 만드는 코드가 그 뒤에 있는' 순환 대기가 된다.
14초 타임아웃 후 재시도해도 같은 지점에서 다시 막혀 로더가 영구히 남았다.

- BattleEngine.setBattlefield: 보이지 않으면 페이드를 건너뛰고 즉시 적용
- 페이드 경로에도 700ms 시계 기반 안전장치 추가
- battle-v3-live: setBattlefield 를 withTimeout(3s) 으로 감싸 진입을 막지 않게
- 번들에 동일 수정 반영, app.js 캐시 버전 v71 / 3.24.0 으로 상향

측정: setBattlefield('HUNT') 15.8s 미해결 -> 1ms
영향: V3 전장을 쓰는 전 콘텐츠. 밸런스/전투 결과 변경 없음."

## 배포

이 커밋으로 배포하지 마라. 사용자의 배포 지시를 기다려라.
배포할 때는 `npm run deploy:production`만 쓴다. `npx wrangler pages deploy .` 직접 호출은 금지다.
`npm run release:gate`를 반드시 통과시켜라.

## 남은 검증

실기기 미검증이다. 안드로이드 크롬 / iOS 사파리에서
**전투 진입 직후 화면을 껐다 켜는 시나리오**를 확인해야 한다.
이 버그가 가장 잘 재현되는 조건이다.
