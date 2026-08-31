# 코덱스 지시문 — v1936 배포 여부 확인

아래를 그대로 코덱스에 붙여넣으면 된다.

---

유저 제보가 들어왔다. **"힐방방공속이 힐방공공속한테 계속 진다."**

이 현상은 v1936 계열 개편 **이전**부터 있던 것이고, v1936 이 완화하는 문제다.
지금 필요한 건 하나다 — **v1936 이 실제로 라이브에 반영돼 있는가.**

측정값(각 400시드, 선공 보정)

| 엔진 | 힐방방공속 승률 |
|---|---:|
| v1936 이전 | **25.9%** |
| v1936 적용 | 39.9% |

## 1. 파일에 들어와 있는가

    grep -c "V1936" functions/_battle_v2_preview.js
    grep -n "const S1 = {" functions/_battle_v2_preview.js
    grep -n "guardShieldPercent\|usePvpDamageModel\|healPoolPercent" functions/_battle_v2_preview.js

`const S1 = {` 이 잡히면 파일에는 들어와 있다. 안 잡히면 파일부터 안 들어온 것이다.

## 2. 커밋됐는가

    git log --oneline -15
    git log --oneline -- functions/_battle_v2_preview.js | head -5
    git status --short functions/_battle_v2_preview.js

`balance(v1936)` 커밋이 있는지, 그리고 working tree 에 uncommitted 로 떠 있는지 본다.
**uncommitted 면 배포에 안 들어갔다는 뜻이다.**

## 3. 배포됐는가

    npx wrangler pages deployment list --project-name cnine-card

최근 배포 시각과 커밋 해시를 2번의 `git log` 결과와 대조해라.
배포 커밋이 v1936 커밋보다 앞서면 **라이브는 아직 옛 엔진이다.**

## 4. 런타임에서 직접 확인 — 이게 제일 확실하다

`_battle_v2_preview.js` 는 서버 함수라 배포해야 반영된다.
**전투 응답의 타임라인만 보면 즉시 판별된다.**

방어형 카드가 들어간 덱으로 PVP 나 몬스터 토벌을 1회 돌리고 `battleV2.result.timeline` 을 본다.

| 이벤트 | v1936 적용됨 | 적용 안 됨 |
|---|---|---|
| `GUARD_PROTECT` (label `수호형 · 방벽 전개`) | **전투 시작에 반드시 뜬다** | 안 뜬다 |
| `INDOMITABLE` (label `방어형 · 불굴`) | **절대 안 뜬다** | 방어형이 죽을 때 뜬다 |
| `SURVIVE` (label `생명형 · 불굴의 생존`) | **절대 안 뜬다** | 생명형이 죽을 때 뜬다 |

브라우저 콘솔에서 확인하는 법 (전투 응답을 받은 뒤)

    const tl = <전투응답>.battleV2.result.timeline;
    console.log([...new Set(tl.map(e => e.type))]);
    console.log('방벽:', tl.filter(e => e.type === 'GUARD_PROTECT').length);
    console.log('불굴:', tl.filter(e => e.type === 'INDOMITABLE').length);
    console.log('생존:', tl.filter(e => e.type === 'SURVIVE').length);

**방벽 0 · 불굴 1 이상이면 라이브는 옛 엔진이다.**

## 5. 제보 현상 재현 (선택)

배포 여부와 무관하게 수치를 직접 확인하고 싶으면

    cd tools/balance-harness-v1903
    node build.mjs && node parity.mjs        # 960/960 나와야 정상

`h2h.mjs` 는 아직 저장소에 없다. 필요하면 클로드에게 요청해라.
기존 `s1FINAL.mjs` / `verify.mjs` 로도 계열별 승률은 볼 수 있다.

## 보고 형식

아래 네 줄만 알려주면 된다.

    [파일]   S1 상수 블록 있음 / 없음
    [커밋]   커밋됨(해시) / uncommitted
    [배포]   배포됨(시각·해시) / 미배포
    [런타임] 방벽 N회 · 불굴 N회 · 생존 N회

## 하지 마라

- 이 확인 과정에서 `functions/_battle_v2_preview.js` 를 고치지 마라. 클로드 구역이다.
- 수치가 이상해 보여도 임의로 조정하지 마라. 측정값을 그대로 보고해라.
- 확인만 하고 배포하지 마라. 사용자 지시를 기다려라.
