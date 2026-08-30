# 코덱스 인계 — 이펙트 연결(S2) + 전술 전직(S3)

둘 다 코덱스 담당. 클로드는 전투 계산·밸런스만 본다(`CODEX-WORKSPLIT.md`).

---

# 1. 이펙트 연결 (S2)

밸런스와 무관하다. **엔진에 이미 있는 판정 6개에 그림과 소리를 붙이는 것뿐이다. 신규 메커니즘 0개.**

## 1-1. 리소스

원본: `preview/project-v-v3-live-style-event-fx-v2/`
- 아틀라스 6종: `assets/atlases/*.json` + `*.png`
- 사운드 6종: `assets/audio/*.mp3`
- 출처·해시: `manifest.json`, `PROVENANCE.md`

**규격 (6종 전부 동일, 확인 완료)**

| 항목 | 값 |
|---|---|
| 프레임 | 12장, 4×3 배치 |
| 프레임 크기 | 512 × 455 |
| 아틀라스 | 2048 × 1365, RGBA8888 PNG + PixiJS v8 JSON |
| fps | 24 (= 500ms) |
| 충돌 프레임 | 6 (= 250ms) |
| 블렌드 | `screen` |
| 사운드 | 48kHz 스테레오 MP3 256kbps, 충돌 동기점 250ms |

**프레임 접두사 (실측 확인)**

    critical_00.png ~ critical_11.png
    dodge_00 ~ dodge_11
    counter_00 ~ counter_11
    revive_00 ~ revive_11
    ultimate_00 ~ ultimate_11
    boss-ultimate_00 ~ boss-ultimate_11      ← 하이픈 주의

## 1-2. 배치 경로

기존 역할 이펙트와 같은 구조로 나란히 둔다.

    assets/ui/project-v/fx/role-impact-v2/     (기존 4종)
    assets/ui/project-v/fx/event-impact-v2/    (신규 6종, json + png)

    assets/sfx/v3-role-impact-v2/              (기존 4종)
    assets/sfx/v3-event-impact-v2/             (신규 6종, mp3)

## 1-3. 붙일 곳

`preview/project-v-v3/source/battle/BattleEngine.js` 의 `runSequence` 재생부 (약 1690~1750행)

| 이펙트 | 이벤트 | 현재 상태 |
|---|---|---|
| `critical` | `TURN` 이벤트의 `event.critical === true` | 값은 이미 넘어온다. 연출만 없음 |
| `dodge` | `TURN` 이벤트의 `event.dodge === true` | 지금은 배너("회피 · 잔상 전개")만 띄우고 `continue` |
| `counter` | `COUNTER` 이벤트 | 이벤트 존재. 라벨도 '방어형 · 반격' |
| `revive` | `MAGIC_CARD` 이벤트의 `revived === true` (불사조의 계약) | ⚠️ v1936 에서 방어형 불굴·생명형 생존을 삭제했다. **부활은 이제 마법카드에서만 나온다.** 빈도가 크게 줄었으니 그만큼 크게 연출해도 된다 |
| `ultimate` | 플레이어 개전 궁극기 (`PVE_ULTIMATE` / `playTacticalSkill` 경로) | |
| `boss-ultimate` | 보스 개전 궁극기 | |

## 1-4. 규칙

- **일반 공격 이벤트 타입은 `ATTACK` 이 아니라 `TURN` 이다.** 필터에서 제일 자주 틀리는 부분
- 동시 발생 우선순위: `boss-ultimate` > `revive` > `ultimate` > `counter` > `critical` > `dodge`
  역할 이펙트(ATTACK/DEFENSE/SPEED/HP)와 겹치면 **판정 이펙트를 우선**하고 역할 이펙트는 생략한다
- 치명타·회피는 판정당 1회만. 연속 발생 시 마지막 것만 재생
- **판정 아틀라스가 없어도 전투는 그대로 진행되어야 한다.** 역할 4종은 필수 프리로드,
  판정 6종은 실패해도 무시하고 넘어가는 선택 프리로드로 둘 것
- **CSS 대각선 광선·빛기둥 장식은 쓰지 마라.** 마름모·원형 룬·별도 쓰지 마라
  (리소스 생성 단계에서 이미 배제했다. 코드에서 다시 넣지 말 것)
- 카드 위에 정보를 계속 덧붙이지 마라. 0.5초 이펙트 + 게이지 링까지만

## 1-5. 이미 작성해 둔 것

`SkillEffectFX.v1937-reference.js` — `SkillEffectFX.js` 에 6종을 추가한 참고본이다.
그대로 쓰거나 발췌해서 쓰면 된다. 들어 있는 것:

- `SKILL_EFFECT_KIND` 에 6종 추가
- `EVENT_EFFECT_PRIORITY` / `EVENT_EFFECT_KINDS` 신설
- `ROLE_EFFECT_PROFILE` 에 6종 색상·흔들림·히트스톱 추가
- `SKILL_EFFECT_ASSETS` 에 6종 아틀라스 스펙 (경로·접두사·fps·스케일·알파)
- `normalizeSkillEffectKind` 가 하이픈(`BOSS-ULTIMATE`)도 받도록 수정
- `preloadAll` 을 필수(역할 4종) / 선택(판정 6종) 으로 분리

**미작성**: 오디오 매니페스트(`RoleAudioSpriteManifest.js` 에 `V3_EVENT_AUDIO_ASSETS`),
`BattleAudioMixer` 로드, `BattleEngine` 호출부 6곳.

## 1-6. ⚠️ 번들 리빌드 필수

`preview/project-v-v3/project-v-pixi-battle.bundle.js` 는 소스에서 빌드된다.
**소스만 고치면 라이브에 아무 변화가 없다.**

    npm run build:v3

리빌드 후 `git diff --stat` 으로 **이번 변경 외에 다른 diff 가 없는지** 확인해라.
다른 변경이 쏟아지면 과거에 소스와 번들이 어긋난 흔적이므로 별도로 정리해야 한다.

그리고 `js/app.js` 의 캐시 버전을 올려라.

    'preview/project-v-v3/project-v-pixi-battle.bundle.js?v=71-battlefield-fade-deadlock'
      -> ?v=72-event-fx

## 1-7. 검증

로컬 서버(`http://127.0.0.1:4178/`)에서 `FEATURE_RESOURCE_MANIFEST.battleV2` 의 스크립트를
직접 주입하면 로그인·API 없이 엔진을 띄울 수 있다. `mountForBattle` 이 엔진 인스턴스를 반환한다.

확인할 것
1. 아틀라스 6종이 새 경로에서 200 으로 내려오는가
2. 프레임 12장이 접두사로 정확히 잡히는가 (`boss-ultimate_` 하이픈 주의)
3. 치명타/회피가 실제로 뜨는가 — 시드를 여러 개 돌려야 나온다
4. 아틀라스를 일부러 404 로 만들었을 때 **전투가 끝까지 진행되는가**

---

# 2. 전술 전직 (S3)

## 2-1. 개방 조건 (확정)

| 항목 | 값 |
|---|---|
| 등급 | **FUR, ZENITH** 만 |
| 돌파 | **+13 이상** |
| 계열 | 그 카드의 **고유효과 4스탯 중 가장 높은 것**으로 자동 결정 |
| 재료 | **마스터의 별 1000개** |

계열이 자동 결정되므로 **유저가 계열을 고르지 않는다.** 전직은 분기 선택이 아니라 계열 특화다.

## 2-2. 전직 4종

| 계열 | 전직 | 효과 | 대가 | 이펙트 |
|---|---|---|---|---|
| 공격 | 파쇄자 | 방어 관통 +30%p, 치명 확률 +6%p | 최대HP −7% | `critical` |
| 방어 | 반격자 | 반격 확률 +34%p | 가하는 피해 −14% | `counter` |
| 속도 | 잔영자 | 회피 +14%p, 관통 +14%p | 최대HP −(재측정 필요) | `dodge` |
| 생명 | 불멸자 | 부활량 +14%p | 가하는 피해 −16% | `revive` |

⚠️ **수치는 v1936 계열 개편 전에 잡은 값이다. 클로드가 재측정해야 확정된다.**
특히 불멸자는 v1936 에서 생명형 무료 부활이 사라졌으므로 효과 정의부터 다시 잡아야 한다.
UI 는 먼저 만들어도 되지만 **수치는 하드코딩하지 말고 CMS/설정에서 읽어라.**

## 2-3. 재료 참고

`MASTER_STAR` 는 이미 있는 아이템이다 (`api/[[path]].js` 의 `ITEM_CATALOG`).

    MASTER_STAR: { label:'마스터의 별', icon:'⭐', inventory:true, max:100000 }

기존 소비처와 비교한 위치

| 용도 | 비용 |
|---|---|
| FUR 돌파 +11/+12/+13 | 100 / 150 / … |
| **전직** | **1000** |
| ZENITH 돌파 +11/+12/+13 | 2800 / 3400 / … |

FUR 돌파보다 비싸고 ZENITH 돌파보다 싸다. 상한 100000 이므로 여러 장 전직이 가능하다.

## 2-4. UI 요구사항

카드 상세를 3탭으로: `고유 특성 | 성장·강화 | 전직`

전직 탭
- 상단 — 계열(자동 결정된 것), 현재 전직 단계, 발동 조건, 남은 발동 횟수
- 중앙 — 원형 숙련도 게이지
- 하단 — 전직 효과와 대가를 나란히. **대가를 작게 쓰지 마라.** 같은 크기로 보여줄 것
- 조건 미달일 때 무엇이 모자란지 명시 (등급 / 돌파 단계 / 마스터의 별 개수)

**회전하지 않은 직사각형 카드만 쓴다. 마름모 장식·대각선 광선·빛기둥은 쓰지 않는다.**

## 2-5. 서버 쪽 (클로드 구역과 겹침 — 먼저 말할 것)

전직 상태 저장, 재료 차감, 조건 검증은 코덱스 담당.
**전직 효과가 전투 계산에 들어가는 부분(`_battle_v2_preview.js`)은 클로드 담당이다.**
스키마를 정하면 알려줘라. `card.awakenClass` 같은 필드 하나로 엔진에 넘기는 형태를 예상한다.
