# PROJECT V 전직 스킬 독립 프리뷰

전투 런타임·카드·로스터·서버와 분리된 전직 연출 네 종 전용 검수 화면이다. 라이브 역할 이펙트를 복사하지 않고, 라이브와 같은 제작·재생 원칙만 적용한다.

- 공격은 홍련 용각성, 속도는 시공매 각성, 힐은 세계수 개화로 새로 제작한 V3 RGBA 아틀라스를 각각 한 효과에 하나씩 사용한다. 여러 아틀라스를 겹쳐 증폭하지 않는다.
- 반격자(RIPOSTE)는 승인된 V1 아틀라스를 그대로 사용하며 빌더도 해당 PNG/JSON을 재기록하지 않는다.
- PixiJS를 `preference: 'webgl'`로 초기화하고 `AnimatedSprite({autoUpdate:false})`로 재생한다.
- GSAP이 유일한 프레임 시계이며 저작된 충돌 프레임을 논리 충돌 시각에 정확히 맞춘다.
- 충돌 시 전직별 hit-stop, 카메라 셰이크, 정확히 50ms인 CSS 흰색 플래시를 실행한다.
- 사운드는 프리뷰 전용 `assets/audio/manifest.json`의 신규 녹음·폴리 자산만 사용한다.
- `syncPointMs`를 논리 충돌 시각에 맞춰 녹음 SFX의 충돌 피크를 ±20ms 계약으로 동기화한다.
- 절차적 음향·기존 역할 이펙트·기존 역할 SFX·합성 폴백은 없다.

## 로컬 자산 계약

```text
assets/atlases/shatter-advancement-atlas-v3.json
assets/atlases/riposte-advancement-atlas-v1.json
assets/atlases/afterimage-advancement-atlas-v3.json
assets/atlases/immortal-advancement-atlas-v3.json
assets/atlases/advancement-fx-atlas-manifest-v3.json
assets/atlases/advancement-fx-atlas-qa-v3.json
assets/source/PROVENANCE.md
assets/audio/manifest.json
```

각 아틀라스는 단일 효과의 투명 RGBA 12프레임만 포함한다. V1 및 중단된 V2 파일은 삭제하지 않지만, 현재 프리뷰는 V2 경로를 전혀 참조하지 않는다. 오디오 매니페스트는 `assets.SHATTER` 등의 항목에 `src`, `syncPointMs`, `durationMs`를 제공하며 녹음·폴리 V1을 유지한다.

## 빌드와 검증

```powershell
node preview/project-v-advancement-fx-v1/build-advancement-atlases.cjs
node preview/project-v-advancement-fx-v1/build.mjs
node --test preview/project-v-advancement-fx-v1/preview-contract.test.mjs
```

로컬 정적 서버에서 `/preview/project-v-advancement-fx-v1/`을 열면 연출이 자동 순차 재생된다. 버튼을 처음 누르면 브라우저 오디오 잠금을 해제한 뒤 해당 신규 SFX와 연출만 재생한다.
