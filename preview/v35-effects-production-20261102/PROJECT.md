# V3.5 Effekseer·Blender 첫 실제 적용

2026-11-02. 사용자 지시한 도구 역할을 제작과 기존 V3 로컬 전장에 적용했다. **Effekseer 검광·접촉 파열·바닥 충격파 3종, Blender 입체 파편 1종**을 제작했다. 현재 붉은 코트 검사 기본 베기에 연결했으며, 새 공격 자세·완성 대표 스킬·DNF급 품질 달성·운영 배포는 아니다.

검수 주소는 [현재 V3 전장](http://127.0.0.1:18766/?case=mixed)이다. **둘째 용병 공격**, **Effekseer · Blender 효과** 체크로 같은 모션을 ON/OFF 비교한다. 사용자의 화면·편집기·키보드·마우스는 조작하지 않았다.

## 도구별 제작 범위

| 도구 | 확정 역할 | 이번 실제 제작 |
| --- | --- | --- |
| Spine Professional | 승인 일러스트의 전투 자세·여러 액션·교체 작화 연결, 무기 파지와 관절 | 기존 7400 네이티브/기본 베기 유지. 새 몸 작화·모션 없음 |
| Effekseer | 검격 에너지 궤적, 폭발·번개·충격파·불꽃·연기·잔향 | 10노드 검광, 28노드 접촉 파열, 3노드 지면 충격파. 다른 속성/폭발/연기는 후속 기술별 제작 대상 |
| Blender | 원근이 바뀌는 무기 회전, 입체 파편, 소환물·거대 무기 | 회전하며 튀는 18개 입체 돌 파편. 무기·소환물 모델은 아직 제작하지 않음 |

망토·장식·머리카락의 세부 흔들림은 필수 작업에서 제외한다. 이번 검광을 모든 용병/스킬의 공통 주 효과로 복사하지 않는다. 다음 서로 다른 액션은 그 자세·동선·속성에 맞는 주 효과를 별도로 설계한다.

## 네이티브와 재현 가능한 출력

- Effekseer: [검광](native/cleave.efkefc), [접촉 파열](native/contact.efkefc), [바닥 충격파](native/ground-wave.efkefc). 같은 이름 `.efkproj`는 작성 XML, `.efk`는 저장된 네이티브에서 내보낸 런타임이다. [작성 스크립트](author-effekseer.mjs).
- Blender: [입체 파편 원본](native/contact-debris.blend), [Python 작성·렌더](author-debris.py). 512×512 RGBA 30프레임, 30fps, Cycles CPU 렌더. 카메라 투영으로 바닥 피벗을 계산했다.
- Effekseer **1.70e 편집기와 공식 WebGL 1.70e**를 맞춰 사용했다. 최신 버전이라는 의미가 아니다. `-cui`로 XML→네이티브 저장→재열기→`.efk` 내보내기 후 [화면 없는 공식 런타임](bake.html)에서 RGBA 프레임을 출력했다. **Effekseer 편집기 Recorder의 CUI 이미지 출력 기능을 사용했다는 뜻은 아니다.**
- 최초 XML의 float 저장 정규화 이후 네이티브 재열기/재내보내기 바이너리 일치를 확인했다. CLI에는 초기 Logger 경로 경고가 발생하나 출력 파일·왕복·실제 렌더를 따로 검증했다. [왕복 기록](qa/effekseer-roundtrip.json).
- Blender **4.5.15 LTS**. 공식 zip SHA-256 검증 후 숨김 `--background --python`으로 제작했다. `.blend` 재열기에서 18개 애니메이션, 처음/끝 비표시, 피벗 및 10번 프레임 RGBA 완전 일치를 확인했다. [왕복 기록](qa/blender-roundtrip.json).
- 두 도구는 `C:/Users/User/Tools/v35-production/`에 포터블로 준비했다. 실행 파일 경로는 `V35_BLENDER`, `V35_EFFEKSEER`, `V35_EFFEKSEER_WEBGL`로 바꿀 수 있다. 프로젝트·node_modules 복사나 기존 설치 덮어쓰기는 없다. [버전/출처/해시](toolchain.json).

순서: `node author-effekseer.mjs` → `node bake-effekseer.mjs`, `node run-blender.mjs` → `node pack.mjs`. 모든 스크립트는 파일 위치 기준이며 저장소 루트에서 해당 경로로 실행할 수 있다. Effekseer/Blender 원본은 직접 편집 가능하다. 재생성 스크립트 실행 시 이미 사람이 수정한 원본은 먼저 보존한다.

## V3 합성 계약

[BakedBattleEffects.mjs](BakedBattleEffects.mjs)는 기존 Pixi의 effectLayer에 최대 4개 Sprite만 붙인다. Effekseer WebGL은 **오프라인 출력에만 사용**하며 게임에 두 번째 캔버스/컨텍스트/시계를 추가하지 않는다. 빌드의 Pixi는 1벌이다.

- 검광은 `weapon_grip`→`blade_tip`의 실제 길이·위치·방향을 사용한다. 0.235초에 시작하고 네이티브 0.34초 접촉에서 칼끝 위치를 고정해 파열을 만든다. 지면 반응은 같은 x와 대상의 실제 바닥 y를 쓴다. 화면 중앙을 피벗으로 대체하지 않는다.
- `SpineBattleAdapter`의 기존 V3 등록 GSAP 시계에서 몸·효과를 갱신한다. 좌우 반전/편성 배율·정지·배속·취소·숨김·죽음·재진입을 따른다. 효과는 HP·피해·추가 타수를 계산하지 않는다.
- 발광 3종은 additive, 파편은 normal. Effekseer의 검은 바탕 RGB 방사량을 straight-alpha PNG로 변환하며 Pixi 업로드 시 premultiplication한다. 런타임 시작부의 비어 있는 프레임만 제거해 **타격 순간부터 첫 보이는 접촉 프레임**을 사용한다.
- 원본 512px 연속 이미지는 보존하고, 여백을 공통 절단해 75% 크기로 패킹했다. [런타임 명세](runtime/fx-manifest.json)에 원본/패킹 크기, 피벗, 시작 프레임, fps, alpha/blend, 해시를 기록했다. 4개 PNG 총 약 1.03MB, 업로드 픽셀 약 22.72MiB. 가장 큰 변 1928px. 이 수치는 실기기 프레임 성능을 뜻하지 않는다.
- Effekseer 원본은 60fps, Blender 원본은 30fps. 파편은 기존 1.12초 기본 공격의 회수 안에서 사라지도록 **재생률 1.4**로 연결했다. 이는 전체 전투 배속과 함께 적용되는 소재 재생률이다. 원본 시작·끝은 투명하다.

## 검수와 한계

[실제 이벤트 회귀](../v35-v3-upgrade-20261101/qa/integration.json) 8개, [효과 수명/정지 검수](qa/lifecycle.json) 12개 통과. 효과 OFF에도 타격 1회, ON 반복 4회에도 각각 1회, 정지 중 전체 프레임 동일, 중단/숨김/죽음 후 잔여 Sprite 0, 배속·회피·서버 HP 순서·세션 재진입, 캔버스 1개 확인.

PC/390px·적 방향의 준비/접촉/잔향/회수 시점을 캡처했다. [화면 기록](qa/visual.json), [정상 속도 ON](qa/normal-on.webm), [OFF](qa/normal-off.webm), [ON/OFF 재생 관측](qa/normal-playback.json). 연속 동영상 전체를 사람이 시청했다고 기록하지 않는다. 직접 확인한 정지/추출 프레임과 런타임 관측을 구분한다.

현재 기본 베기 몸동작의 종류는 늘지 않았다. 접근/후퇴의 발걸음 작화, 몸통 방향이 바뀌는 공격·회전 교체 작화, 복수 기본 공격과 대표 스킬, 기술별 다른 주 효과, 정식 로더/용병 등록 및 대상 모드 검수는 후속 제작 범위다. 반려 이력을 덮거나 이번 도구 연결을 최종 시각 승인으로 확대하지 않는다. 실기기·설치 앱 성능, 전체 PVP/협동전은 미검수다.

원화, 복원 검, 기존 `.spine` 해시는 그대로다. 운영 데이터·계정·메시지·게임 배포·승인 없는 유지관리/삭제/예약은 실행하지 않았다.

공식 근거: [Effekseer CLI](https://effekseer.github.io/Help_Tool/en/ToolReference/index.html#command-line), [공식 WebGL](https://github.com/effekseer/EffekseerForWebGL/tree/170e), [Blender CLI](https://docs.blender.org/manual/en/4.5/advanced/command_line/arguments.html). 출처/라이선스는 [참조 기록](reference/README.md)에 보존한다.
