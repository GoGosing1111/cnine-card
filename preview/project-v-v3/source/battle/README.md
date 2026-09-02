# Project V PixiJS Battle Preview

프리뷰 전용 렌더링 계층입니다. 본게임 API·D1·보상 로직과 분리되어 있으며,
`playEvents(events)` 입력만 실전 서버 응답으로 교체하면 동일 엔진을 이식할 수 있습니다.

## 모듈

- `BattleEngine.js`: PixiJS v8 Application, 등각 투영 7×6 그리드, Y-depth Ticker, 네 레이어와 전투 이벤트 재생
- `BattleCharacter.js`: 완성형 전신 SD 스프라이트, 발밑 피벗, 쿼터뷰 타일 배치, 팀 Flip, FSM. 공용 관절 리그는 향후 스킨 제작용 fallback으로만 유지합니다.
- `PartSheetLoader.js`: 순백색 3×3 파츠 시트 로드, 셀 분리, 흰 배경 알파 키잉, 자동 트리밍
- `BattleAnimation.js`: 조립된 Head/Body/Arms/Legs/Weapon 관절의 IDLE/MOVE/ATTACK/HIT/DEAD GSAP 모션
- `CameraController.js`: GSAP 카메라 줌·히트 스톱·화면 진동
- `SkillTimeline.js`: 암전 → 컷신 → 돌격 → 검기 → 피격의 GSAP Timeline
- `ObjectPool.js`: 대미지 텍스트와 검기/타격 FX 재사용

## Scene Graph

```text
Application.stage
└─ ResponsiveRoot
   └─ BattleStage (CameraController target)
      ├─ BackgroundLayer
      │  ├─ Sky    (camera coefficient 0.2)
      │  ├─ City   (camera coefficient 0.5)
      │  └─ Ground (camera coefficient 1.0)
      ├─ CombatLayer
      │  ├─ IsometricFloor (7×6 diamond tiles)
      │  ├─ Character roots (screen-Y realtime depth sorting)
      │  └─ Deck strip (fixed foreground depth)
      ├─ EffectLayer
      └─ UiLayer
```

## Character asset contract

- 조립 후 논리 캔버스: `256×384`; 원본은 순백색 3×3 파츠 시트
- anchor/pivot: `(0.5, 1.0)` at the centre of both feet
- source art is a top-down 45° three-quarter view facing diagonally up-right;
  `TEAM.ENEMY` automatically applies `view.scale.x = -1`
- states: `IDLE`, `MOVE`, `ATTACK`, `HIT`, `DEAD`
- `await character.changeTexture({type:'PARTS_SHEET',partSheetUrl})`가 파츠를 재조립해도 피벗과 팀 방향 유지
- a Spine adapter can implement `setState`, `setFacing`, `changeTexture`, `destroy`
  without changing the battle-event or skill-timeline contract

## PVE 계정 배틀슈트 유닛 계약

라이브 V3는 서버 `battleV2` 전투 payload의 아래 공개 객체를 읽는다. 최상위 필드가
단일 기준이며, 최상위 필드 자체가 없을 때만 `characterBonus`(또는 그 안의
`bonuses`)와 최상위 `bonuses`를 호환 경로로 사용한다. 최상위 값이 `null`이면
명시적 미장착으로 처리한다.

```js
{
  mode: 'PVE',
  battleV2: {
    teams: {A: {cards: [/* 기존 5장 */], supports: [/* 배틀슈트 1기 */]}, B: {cards: []}},
    result: {timeline: [/* actorKind: 'BATTLE_SUIT' 독립 TURN */], damageBreakdown: {battleSuit: 100000}}
  },
  characterBonus: {battleSuitPve: 100000},
  equippedBattleSuit: {
    code: 'BATTLE_SUIT_01',
    displayName: '배틀슈트 01',
    battleSprite: '/assets/ui/project-v/account-battle-suits/suits/battle-suit-appearance-01-mechanical-female-v3.png',
    pvePower: 100000,
    pvpPower: 0,
    scaleMultiplier: 1
  },
  equippedWeapon: {
    code: 'EQ_1785427638137',
    battleSprite: '',
    attachment: {x: 34, y: -142, anchorX: .66, anchorY: .62, height: 106, rotation: -.08, flipX: true}
  }
}
```

- 계정 유닛은 `allies`, `characters`, `cards`에 추가하지 않는 보조 렌더 오브젝트다.
  서버에서는 5장과 분리된 타깃 불가 지원 액터이며, 기존 진형·생존 판정은 유지한 채
  속도 게이지에 따라 독립 피해를 준다.
- `PVE/HUNT/TOWER/RAID/SEAL/ESCORT/DUNGEON` 계열에서만 표시하며,
  `PVP/SIEGE/TERRITORY/CAPTAIN/CLAN` payload는 렌더러와 라이브 래퍼 양쪽에서 차단한다.
- 배틀슈트는 본체 스프라이트, 무기는 별도 attachment 스프라이트다. 승인된 무기
  code 4종은 투명 전투 컷아웃에 매핑한다. 미승인 무기의 일반 `image/imageUrl`은
  카드형 네모 배경일 수 있어 사용하지 않고, 명시적 `battleSprite/appearanceUrl`이
  없으면 무기를 숨긴다.
- 서버가 `characterBonus.battleSuitPve`를 카드 5장에 재분배하지 않고
  `actorKind: 'BATTLE_SUIT'`, `damageSource: 'BATTLE_SUIT_INDEPENDENT'`인 독립 피해
  `TURN`으로 판정한다. 렌더러는 해당 피해와 `targetHpAfter`를 그대로 재생하며,
  `result.damageBreakdown.battleSuit`은 몬스터 HP와 방벽에 실제 적용된 값만 합산한다.
- 작은 이름표는 `payload.user.nickname`, `payload.profile.nickname`,
  `payload.nickname` 순으로 선택하고 값이 없으면 숨긴다.

## Isometric projection contract

```js
screenX = originX + (gridX - gridY) * tileWidth / 2;
screenY = originY + (gridX + gridY) * tileHeight / 2;
```

- 바닥만 마름모 투영하고 캐릭터/HUD는 직립을 유지합니다.
- 캐릭터는 논리 `gridPosition`과 화면 `baseX/baseY`를 함께 가집니다.
- Ticker가 `screenY`를 기준으로 `CombatLayer.children`을 매 프레임 정렬합니다.
- 원거리 `.82~.84`, 근거리 `1.08~1.10` 범위로 기준 배율을 보간합니다.
- 대시 중에도 목표 Y에 맞는 원근 배율을 적용하고 복귀 시 진형 배율로 되돌립니다.

## Skill frame schedule

- `0–400ms`: background/enemy alpha 0.4, attacker z-order raise, Back.easeOut cut-in
- `400–650ms`: MOVE dash to 100px before the target
- `650–950ms`: ATTACK and yellow/black atlas/procedural slash
- `650–1200ms`: HIT, 30px knockback, 300ms decaying shake, pooled BitmapText damage
- `1200ms+`: return to formation and restore alpha/state

## 실전 이벤트 계약

```js
await window.ProjectVPixiBattle.playEvents([
  {type:'DEPLOY'},
  {type:'ATTACK', actorIndex:1, damage:238150, critical:false, bossHp:62},
  {type:'SKILL', actorIndex:0, damage:386720, critical:true, bossHp:44},
  {type:'COUNTER', actorIndex:3},
  {type:'ULTIMATE', actorIndex:2, damage:964200, bossHp:6}
]);
```

서버가 피해량·HP·보상 결과를 확정하고 클라이언트는 순서대로 재생만 해야 합니다.
`requestId`나 클라이언트 랜덤값을 결과 판정에 사용하지 않습니다.

## Texture Atlas 연결

현재 검기는 자산이 없는 프리뷰에서도 동작하도록 procedural fallback을 사용합니다.
운영 자산은 TexturePacker 등으로 `slash-yellow.json + slash-yellow.webp`를 만들고
`ASSETS.slashAtlas`에 등록한 후, `sheet.animations.slash_yellow`의 `Texture[]`를
`createBattlePools({slashFrames})`에 넘기면 `AnimatedSprite` 경로가 자동 사용됩니다.

- 동일 이펙트의 프레임은 한 atlas page에 배치
- 투명 여백 trim, 회전 packing은 파이프라인 정책에 맞춰 통일
- 동일 blend mode와 premultiplied alpha 사용
- 대미지 텍스트·검기 객체는 매 타격마다 `destroy()`하지 않고 풀로 반환
- 화면 이탈/백그라운드에서는 Ticker·GSAP timeline을 정지 또는 취소
