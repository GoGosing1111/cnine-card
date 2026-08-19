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
