# 하쿠야 신 · V3.5 전투 리소스

2026-11-05 사용자 지정 이름은 **하쿠야 신**이다. [인물 정보](identity.json)에 기록하고 현재 전장과 검토 화면에 반영했다. [배경 포함 일러스트](portrait-20261105/hakuya-shin-moonlit-courtyard-v1.png)는 승인 원화의 얼굴·복장·검·전신 자세에 달빛 궁성 석조 뜰을 더한 새 제작본이다. [프롬프트·원본·해시](portrait-20261105/manifest.json).

## 현재 검수본 · 몸을 감싸는 흑백 검기 V2 · 2026-11-05

사용자가 V1의 중심과 외형을 반려하고 흑백 조화·몸을 감싸는 새 효과를 요청했다. **ImageGen 새 작화16장 + Effekseer 네이티브2종**으로 몸의 앞뒤를 감싸는 먹빛/은백색 검기를 제작했다. 정수리 방향과 양발 사이의 몸 축에 중심을 두고, 앞쪽 기운은 허리/정강이에서 흐르게 했다. 현재 [재생 화면](review.html)은 V2다. [원본·프롬프트·검수](aura-v2/PROJECT.md). 로컬 검토본이며 사용자 최종 시각 승인/운영 등록·배포는 아니다.

## 반려 보존 이력 · 태극 아우라와 흰 형광 윤곽 V1 · 2026-11-05

등 뒤에 청백색 태극과 반대 방향으로 흐르는 기운을 연결하고, 현재 몸·머리카락·검의 실제 윤곽에 흰 형광빛을 추가했다. 대기·이동·공격·점프를 따라가며 기존 V3 정지/배속/타격 정지/되감기/숨김/사망·복귀를 따른다. Effekseer 편집 원본과 60프레임 atlas, SVG 문양, Pixi 알파 윤곽 필터를 보존했다. [새 정상/.5/OFF 재생](review.html) · [제작 및 121개 검사·이벤트9·영상16 결과](aura-v1/PROJECT.md). 로컬 검토본이며 운영 등록/배포나 사용자 최종 시각 승인을 뜻하지 않는다.

## 검성 스킬 4종 · 2026-11-05

하쿠야 신의 기존 Spine 공격 모션을 2배속으로 재생한다. 일반기 **절광발도·삼첩관통**과 광역기 **회천검압·만검낙성**의 주 효과 4종과 보조 효과 2종을 Effekseer로 제작했다. [직접 재생](review.html) · [리소스·편집 원본·검수 기록](swordplay-v5/PROJECT.md). 아래 11월 2일의 편집본이 현재도 캐릭터 모션 정본이다.

## 2026-11-02 제작 이력

2026-11-02 현재 정본. 사용자 “용병 퀄리티 자체가 별로임 이거로 v3.5 리소스 만들어”의 첨부 일러스트를 외형 기준으로 삼았다. 이전 붉은 코트 검사 원화/복원검/7400 native는 보존하며 새 캐릭터의 외형 기준으로 사용하지 않는다. 작업명은 **흰 코트 검사**이며 정식 이름·등급·능력치는 미정이다.

현재 산출물은 **자세 30종, 새 Spine 편집 원본, 기존 세 공격과 신규 세 기술, 기존 V3 전장에 연결한 로컬 검수본**이다. 전신 교체 작화 기반이며 팔다리 메시/IK 리깅을 완성했다는 뜻은 아니다. 사용자 “훌륭하네”는 앞선 회전·도약 연격에 대한 긍정 피드백이다. 새 세 기술의 최종 시각 승인·DNF급 전체 품질 달성·운영 등록/배포는 하지 않았다.

## 11월 2일 · 흑금 단공 / 잔영 삼재 / 천형 종결

지정한 [진(眞) 검귀 영상](https://www.youtube.com/watch?v=HzCF1Iot0ew)을 실제 **0.5배속으로 끝까지 재생**하고 시간표시 프레임 131개/시트 9장을 확인했다. 관통 검흔, 여러 방향의 잔영 협공, 검흔 누적 후 집중 파열을 흰 코트 원화의 검정·금백색으로 새로 제작했다. 참고 영상의 게임 리소스를 복사하지 않았다.

- [최신 제작·참고 분석·검수 기록](skills-v4/PROJECT.md). 새 자세 12개, 준비 컷인, 8장씩 변하는 주 효과 3개와 절단 파편/지면 압력의 **Effekseer 5종**. 기존 Blender 파편 재사용.
- [최신 Spine 정본](whitecoat-skills-v4-51fecca13bde.spine), [runtime](runtime-skills-v4-51fecca13bde/whitecoat.json): 7뼈/1슬롯/30전신 attachment/11애니메이션, 실제 Pro 저장·재열기·내보내기. 이전 정본과 18자세/8애니메이션 보존.
- [검토 화면](review.html): 세 기술 정상속도 효과 ON/OFF 각 3회, 실제 V3 0.5배속 합본, 이전 연격 영상. 실제 전장의 **흑금 단공 / 잔영 삼재 / 천형 종결** 버튼으로 실행한다.
- [68개 재생 검사](skills-v4/qa/verification.json), [21회 녹화](skills-v4/qa/recording.json), [영상/페이지 검사](skills-v4/qa/review-video.json), [기존 이벤트 검사](skills-v4/qa/event-integration.json). 시각 연타와 별개로 최종 서버 피해 콜백은 기술마다 1회다.

이하 내용은 **이전 action-v3 및 초기 10자세/V1/V2의 보존 이력**이다. 아래의 당시 “최신/현재” 수치와 경로는 위 새 세 기술의 정본을 대체하지 않는다.

## action-v3 보존 이력 · 회전·도약 연격

사용자 “그래서 이제 화려한 던파급 액션 만들어야지”에 따라 **발도 → 몸을 틀어 베기 → 도약·공중 내려베기 → 착지·복귀**를 추가했다. ImageGen 새 자세 8개를 Spine에 넣고, 세 타격 정지·실제 과거 자세 잔상·검 궤적·Effekseer 새 착지 효과를 기존 V3 공용 시계에 연결했다. 원래 10자세와 V1/V2 원본/검수는 보존한다.

- [최신 제작·검수·원화/프롬프트 기록](action-v3/PROJECT.md)
- [최신 Spine 정본](whitecoat-action-v3-93718185df11.spine), [전달 폴더](runtime-action-v3-93718185df11/whitecoat.json): 7뼈/1슬롯/18전신 attachment/8애니메이션. 실제 Pro 4.3.26 저장·재열기·export.
- [현재 검토 화면](review.html): 새 연격 정상속도 효과 ON/OFF 각 3회, 이전 영상 링크. 실제 전장은 `http://127.0.0.1:18766/?case=whitecoat`의 **회전·도약 연격** 버튼이다.
- [23개 재생 검사](action-v3/qa/verification.json), [기존 이벤트 9개](action-v3/qa/event-integration.json), [이전 두 공격 교차 재생](action-v3/qa/legacy.json), [영상/페이지/기존 경로](action-v3/qa/review-video.json) 확인. 이 연격은 시각 접촉 3회·최종 피해 콜백 1회다.

정식 스킬 등록·운영 배포는 아직 아니다. 현재 품질 한계와 메모리 추정은 위 최신 기록을 따른다. 아래 내용은 **초기 10자세와 V1/V2 제작 당시의 보존 이력**이며, 그 당시 “현재” 수치나 정본 경로를 새 연격의 최신 상태로 해석하지 않는다.

## 초기 10자세·검격 V1/V2 이력 · 정본과 재생

- **2026-11-02 검격 효과 강화 V2:** 사용자 “괜찮네”는 1차 방향에 대한 긍정 피드백으로 보존하며, 후속 “그래도 검격이펙트가 더 화려했으면 좋겠음”을 적용했다. 실제 검 궤적에 금빛 외곽 잔광·안쪽 광선·짧게 흩어지는 불티를 더하고 잔광 시간을 늘렸다. Effekseer에서 **적중 파열과 올려베기 상승 파열 2종**을 새로 만들었다. 현재 검토 화면은 [V2 영상/검수](qa/sword-trail-v2/)를 사용하며 이전 영상 링크도 제공한다. 원화·Spine·자세·기존 타격 시각과 횟수는 보존했다. V2에 대한 사용자 최종 시각 승인으로 확대하지 않는다.
- **2026-11-02 칼 궤적 검광:** 사용자 “좋은데 칼을 휘두를때 그 궤적으로 이펙트가 있어야 … 새 플러그인으로”를 적용했다. Runway에서 흰색·금색 검광 재질 1장을 생성하고, [SwordTrail](SwordTrail.mjs)이 기존 자세의 실제 손잡이/칼끝 기준점과 배우의 이동 경로에 맞춰 합성한다. 기존 별도 원호/직선/상승 PNG를 로드하던 경로는 교체했고 원본 파일은 보존했다. Effekseer 접촉 섬광과 Blender 파편은 재사용한다. 새 영상·확대 장면은 [칼 궤적 검수 폴더](qa/sword-trail/)에 있으며 검토 페이지의 첫 화면에 노출한다.
- **2026-11-02 재생 복구:** 로컬 18766 서버가 종료돼 `ECONNREFUSED`가 발생했다. `../v35-v3-upgrade-20261101/start-review.ps1`로 별도 숨김 서버를 실행하도록 보완했다. 이 폴더의 `open-review.vbs`를 사용자가 직접 실행하면 서버를 확인/시작한 뒤 검토 화면을 연다. 에이전트는 `-OpenReview` 없이 실행해 사용자 화면을 조작하지 않았다. PC/390px에서 두 영상의 시간 진행·실제 디코딩 프레임 변화·탐색 후 재생, HTTP Range 206, 실제 V3 두 공격/복귀를 [복구 검사](qa/replay-recovery.json)로 확인했다. 원화/native/전투 구현 변경이나 운영 재배포는 없다.
- [검토 화면](review.html): 자세 비교와 정상 속도 효과 OFF/ON 영상. 로컬 서버 주소 `http://127.0.0.1:18766/preview/v35-whitecoat-swordsman-20261102/review.html`.
- 실제 V3 재생: `http://127.0.0.1:18766/?case=whitecoat`, 적 방향 `?case=whitecoat-enemy`. 기존 발테르 비교 버튼과 흰 코트 기본 공격/발도 스킬 버튼을 제공한다.
- [Spine 정본](whitecoat-c3ad326c9e61.spine): **Professional 4.3.26**, SHA-256 `a2e45365a8f830266d3b91c1e9c76dc35f0bf93409b69027300954977f7bbf57`. 스켈레톤 1개, 7뼈/1슬롯/10 region attachment, 7개 애니메이션. 상대 `images/`를 함께 유지한다.
- [게임 전달 폴더](runtime-c3ad326c9e61/whitecoat.json): JSON + atlas + PNG 1페이지(2044×2041). 공식 spine-pixi-v8 4.3.13, 기존 Pixi 8.20.0/GSAP 3.13과 연결했다.
- [포즈 기준점](pose-registration.json), [동작 계약](actions.json), [원화/생성 이력](source/generation.json), [파일 해시](manifest.json).

## 원화와 자세 제작

[첨부 정본](source/approved-illustration.png)은 1024×1536, 2,342,860바이트이며 원본 SHA-256 `2e0c6fbf95ba10dcafbddd1435c88f16590e9594206ad3f5053665b9aac627a1`을 유지했다. 승인 범위는 캐릭터의 외형 기준이다. 생성된 자세의 최종 승인과 구분한다.

내장 ImageGen 도구의 참조 이미지/투명 출력으로 전투 작화를 제작했다. 얼굴·검은 눈 무늬·긴 흑발과 땋은 머리·가슴 문신·흰 금장 코트·正義 문구·검은 하의·맨발/발목 감개·무기 장식을 기준으로 삼았다. 생성 원본 9개와 모든 프롬프트를 보존했다. Krita/Aseprite를 사용했다고 기록하지 않는다.

시트의 칼끝이 옆 칸에 걸친 하단 베기는 제외하고 독립 후속 자세를 다시 작화했다. 들어올린 자세의 잘못된 추가 손잡이는 재편집했다. 일반 사각형 crop 및 균일 축소/등록만 적용했으며 무기를 다각형으로 잘라내거나 신체에 맞춰 휘게 만드는 작업은 하지 않았다. [crop 검사](qa/crop-audit.json)의 선택된 11개 사각형 모두 경계 알파 침범 0; 이 중 최종 native는 9개와 별도 guard를 사용한다. 두 번째 이동 후보는 다리 차이가 부족해 사용하지 않았다.

Spine에는 대기·들어올리기·접촉·후속·발도 준비·낮은 발도·올려베기·짧은 이동·피격·무릎 꿇은 패배 자세를 넣었다. 머리 크기와 자세별 발바닥을 기준으로 균일 배율을 맞췄다. 이미지 전체 높이로 웅크린 자세를 늘리지 않았다. 손잡이/칼끝/두 발/머리 socket을 각 자세의 실제 그림 좌표에 맞춰 전환한다. 망토·장식·머리카락의 미세 흔들림은 제작하지 않았다.

## 동작과 효과

| 동작 | 길이/시각 접촉 | 구성 |
| --- | --- | --- |
| `idle` / `setup` | 3초 루프 정의 / 0.1초 | 정적 전투 대기 자세 |
| `dash` | 0.30초 | 짧은 이동 자세와 복귀. 완성된 양발 달리기 루프가 아님 |
| `attack_basic` | 1.18초 / 0.32초 | 짧은 접근 → 높이 들어 준비 → 전진 베기 → 측면 후속 → 복귀. 흰색/금색 넓은 검광과 접촉 섬광 |
| `skill_iai` | 1.55초 / 0.30초 | 낮은 발도 준비 → 빠른 진입/직선 검광 → 0.51초 올려베기, 0.54초 시각 마무리 → 회수. 서버 피해는 1회 |
| `hit` | 0.38초 | 뒤로 젖힌 피격 교체 작화 → 대기 |
| `death` | 0.65초 native | 피격 → 무릎 꿇음. V3 DEAD 처리는 마지막 패배 자세를 즉시 표시 |

시간은 native/공용 GSAP 시간이다. V3 기본 1.3배 재생을 유지하므로 기본 공격은 약 0.91초, 발도는 약 1.19초로 보인다. 같은 타임라인이 몸·루트 이동·효과를 소유한다. 접촉 자세 홀드는 전장 전체의 별도 히트스톱을 새로 구현한 것이 아니다.

[Effekseer](effects/)에서 `edge-arc`, `iai-line`, `rising-cut`, `contact`의 서로 다른 형태를 새로 만들었다. 1.70e CUI `.efkefc` 저장/재열기/`.efk` export, 같은 버전 공식 WebGL을 오프라인 출력에 사용했다. 원본 126프레임, 앞의 빈 프레임을 제외한 118프레임을 4개의 PNG에 패킹했다. runtime에 두 번째 WebGL/시계는 만들지 않는다. 발광은 additive다.

위 4종은 최초 제작 이력이다. **현재 주 검광은 Runway 재질 + 실제 검 기준점의 궤적 합성**으로 교체했다. [원본 재질과 생성 기록](effects/sword-trail/runway-generation.json), task `47f9bb28-647b-4a1f-ae45-40348bf87570`, 2064×512 PNG 1장·7크레딧이다. AI 영상 생성이나 Layer 제작을 수행한 것은 아니다. Layer는 재개 시점에 MCP 설정/인증이 없음을 읽기 전용으로 확인했으며 계정 연결·설치·결제는 하지 않았다.

전진 베기는 들어올림→접촉 0.32초와 접촉→후속 0.40초, 발도는 0.30초와 올려베기 0.51초에 서로 다른 검 궤적을 표시한다. 전신 교체 작화 사이의 중간 검 위치는 손 좌표·칼 각도·길이를 보간한 **효과용 경로**다. 새 몸 작화나 연속된 native 검 움직임을 추가했다고 표현하지 않는다. 정지된 자세보다 검광 머리가 먼저 움직이지 않도록 실제 교체 시점에 궤적을 드러내고 V2에서는 0.19~0.25초 동안 잔광을 소멸시킨다(1차 0.15~0.20초). 루트 이동 정의를 GSAP과 효과가 공유하며 지나간 궤적은 과거 위치를 유지한다.

[V2 효과 원본](effects/flourish-v2/)은 `impact-burst` 43노드와 `rising-release` 26노드다. 교차하는 가는 섬광·금색 압력선·끊어진 원호·방사 파편과 상승 파편을 구분했다. Effekseer 1.70e 실제 CUI 저장/재열기/런타임 export의 바이트 동일성을 확인했고 공식 WebGL에서 82프레임을 출력했다. 빈 선행 4프레임을 제외한 78프레임을 두 atlas로 패킹했다. 원본과 재열기 로그를 보존하며 CUI의 비차단 Logger 경로 진단은 기록에 남겼다. `primitives.mjs`의 Sprite 색상 XML을 공식 설치 샘플의 `Sprite/ColorAll_Fixed` 구조에 맞췄다. 기존 제작 native는 재생성하지 않았다.

적중 파열은 실제 접촉 시각의 칼끝과 검 방향에 고정한다. 상승 파열은 0.54초부터 올려베기 궤적의 중간 공간에 남으며 추가 피해를 발생시키지 않는다. 넓힌 금색 잔광은 현재 칼끝에서 폭을 줄여 기존 접점을 유지한다. 발도의 중심부 밝기를 낮춰 넓은 검광의 질감이 하얗게 뭉치는 것을 줄였다. 기존 Runway 재질을 재사용했으며 이번 강화에서 AI 추가 생성·크레딧 사용·결제는 없었다.

타임라인 부모 `onUpdate`에서 루트 이동 후 몸/효과를 갱신해 한 프레임 지연을 제거했다. float32로 저장된 0.40초 key의 정확한 시점 탐색을 위해 native 샘플에 0.1마이크로초 보정을 적용하며 공개 재생 시계·접촉 시각은 유지한다. 재질은 additive와 mipmap 축소 필터를 사용해 작은 전투 크기의 점상 깜빡임을 줄인다.

발도 마무리의 지면 파편은 이전에 Blender 4.5.15 LTS로 만든 [contact-debris.blend](../v35-effects-production-20261102/native/contact-debris.blend)와 해당 29프레임 PNG를 **그대로 재사용**했다. 이번에 새 Blender 모델을 만들었다고 표현하지 않는다. 파편은 normal blend, 새 검광은 additive이며 둘 다 기존 Pixi effectLayer에서 재생한다. 원근 무기·소환물·추가 속성 효과는 이번 범위에 없다.

## 실제 V3 연결과 검수

`WhitecoatBattleAdapter`는 기존 `BattleCharacter.view`에 Spine을 붙이고 기존 root/편성/HUD/팀 반전/HP 및 등록 GSAP 타임라인을 재사용한다. 테스트 ID는 `QA-V35-WHITECOAT`. 실제 `playEvents`의 TURN은 기본 공격에 연결했고, 발도는 검수 버튼이 동일 adapter/타임라인을 호출한다. 정식 용병의 서버 스킬 분기는 아직 등록하지 않았다. 피해 계산/타수/운영 계정 쓰기는 추가하지 않았다.

- [네이티브 왕복](qa/native.json): 실제 import/save/reopen/export 성공, 하나의 skeleton, 모든 애니메이션 보존. 원본 입력과 현재 native 해시 고정.
- [원화 대조](qa/art-compare.json): 10개 region의 위치/배율/크기가 native 왕복 후 유지. 실제 1배 runtime 출력과 입력 PNG의 atlas trim을 맞춰 비교했다. 일부 추출 캔버스의 1px 반올림 차이를 명시적으로 처리했다. 비교 범위 알파 차이 0, premultiplied 색상 평균 차이 0.77~1.43/255. 작화 완성도를 이 수치만으로 판정하지 않는다.
- [재생 검사 19개](qa/verification.json): 기본/발도 각각 3회×효과 OFF/ON, 12회 모두 타격 전달 1회 및 편성 복귀. 정지·효과 토글·접촉 전후 취소·숨김·사망·부활·피격/복귀·단일 canvas·적 방향·390px 브라우저 확인.
- [실제 이벤트 경로 9개](qa/event-integration.json): TURN/회피/연속 HP 스냅샷/타격당 1회 sync, 0.25배 3633ms와 2배 454ms, 접촉 전 숨김 취소, 복귀 시 guard, 세션 교체 후 native 제거 확인. 숨김 후 step에 남던 결함은 수정했다.
- [기존 경로 회귀](qa/video-review.json): 발테르/기존 붉은 코트 및 카드구/일반 용병의 각 2회 공격, 단일 canvas/오류 없음.
- [효과 native](effects/qa/native.json) 재열기 export 바이트 동일. [프레임 출력](effects/qa/effekseer-bake.json)은 최종 반복 출력 일치, 수명 종료 후 보이는 픽셀 0. 초기 미일치 관측 후 평균 채널 차이 측정을 추가했으며 최종 출력은 exact 일치였다.
- **시각 검토:** native 전신 자세, 밝은/어두운 알파 합성, PC/적 방향/390px 전장, 공격 주요 구간 ON/OFF, [정상 속도 영상에서 추출한 65ms 간격 프레임](qa/normal-on-sampled.png)을 확인했다. 두 영상에서 각각 기본/발도 3회를 실행/기록했다. 영상 전체를 연속 시청했다고 주장하지 않는다.

**칼 궤적 교체 후 별도 검수:** [24개 검사](qa/sword-trail/verification.json)는 4개의 자세 교체 순간과 홀드 구간의 칼끝 정합(최대 약 0.000005 전장 좌표 단위), 직접 시점 이동/24·60fps 간격 동일 결과, 정상속도 12공격·타격 각1회, 좌우 반전/390px, 일시정지/토글/취소/숨김/죽음/복귀를 확인했다. 첫 검사에서 비활성 궤적의 남은 감사 상태가 경로별로 다르던 점과 native float32 키 경계가 관측돼 수정 후 통과했다. [실제 이벤트 경로 9개](qa/sword-trail/event-integration.json)도 다시 통과했다. [새 영상·검토 화면 확인](qa/sword-trail/review-video.json)은 효과 OFF/ON 영상에서 65ms 간격으로 프레임을 추출하고 PC/390px 실제 재생·탐색/재개·Range 206와 기존 발테르/붉은 코트·카드구 경로를 확인한다. 작화 원본과 native 바이트는 그대로 유지했다.

## 남은 품질 범위

**V2 강화 후 검수:** [26개 재생 검사](qa/sword-trail-v2/verification.json), [실제 이벤트 9개](qa/sword-trail-v2/event-integration.json), [영상·페이지·기존 경로 검사](qa/sword-trail-v2/review-video.json)를 통과했다. 정상속도 OFF/ON 각 기본·발도 3회, 공격당 타격 1회와 편성 복귀, 정지·토글·취소·숨김·죽음·부활, 직접 탐색/24·60fps 동일 궤적, 좌우 반전과 390px을 확인했다. 최대 칼끝 오차는 약 0.000005 전장 좌표 단위다. 새 효과의 반복 프레임은 exact 일치하고 수명 종료 후 보이는 픽셀은 0이다. 실제 전장 캡처와 정상 영상의 65ms 추출 프레임을 눈으로 확인했으며 연속 영상 전체 시청이나 실기기 성능 검사를 주장하지 않는다. [이전 영상](qa/sword-trail/normal-effects-on.webm)과 원본/검수 자료는 보존했다.

원화 정체성과 큰 자세 차이를 확보한 검토용 리소스다. 자세 사이의 중간 작화, 실제 양발 보행/후퇴, 발도 전후의 연속 파지/납도, 패배 전이, 기술별 추가 타격 리듬·사운드는 더 다듬을 수 있다. 대기 미세 움직임이나 장식 물리는 사용자 지시대로 필수로 삼지 않는다. 상대 방향은 단순 좌우 반전이며 별도 반대쪽 작화가 아니다.

DNF급 전체 동작/타격감 달성, 사용자 최종 시각 승인, 물리 모바일 기기 성능, 전체 PVP/협동전 검수는 완료로 적지 않는다. HUNT fixture의 적 방향 배치는 운영 PVP 시험과 다르다. 현재 캐릭터 atlas·새 효과 2종·공유 파편·Runway 재질(mipmap 포함)의 디코딩 크기 추정은 약 **41.10MiB**다. 기준 대기 PNG와 기존 전장 자산은 이 합계에서 제외하며, 실기기 FPS 보장이나 전체 GPU 메모리 측정값은 아니다. 1차 검광의 28.17MiB와 초기 효과 4종의 39.60MiB는 과거 구성이다. 강화 후 동시 출전 실기기 메모리·프레임 시간 검수는 남아 있다.

작업 전체는 파일/숨김 CLI/화면 없는 Chrome으로 진행했다. 사용자 데스크톱 조작, 운영 배포/용병 등록, 계정/재화 변경, 메시지 전송, 저장소 용량 유지관리/삭제/예약은 하지 않았다. 이전 원화/복원검/native/Blender 자산 해시는 [전달 기록](qa/delivery.json)에 보존한다.

## V2 효과 강화 재현

기존 원화와 Spine 정본을 재사용한다. 추가 생성/결제 없이 새 효과만 빌드한다.

```powershell
node preview/v35-whitecoat-swordsman-20261102/effects/flourish-v2/author.mjs
node preview/v35-whitecoat-swordsman-20261102/effects/bake-effekseer.mjs preview/v35-whitecoat-swordsman-20261102/effects/flourish-v2
node preview/v35-whitecoat-swordsman-20261102/effects/pack.mjs preview/v35-whitecoat-swordsman-20261102/effects/flourish-v2
node preview/v35-v3-upgrade-20261101/build.mjs
node preview/v35-whitecoat-swordsman-20261102/qa/sword-trail-v2/verify.mjs
node preview/v35-whitecoat-swordsman-20261102/qa/sword-trail-v2/review-panels.mjs
node preview/v35-whitecoat-swordsman-20261102/qa/sword-trail-v2/review-video.mjs
node preview/v35-whitecoat-swordsman-20261102/qa/event-integration.mjs preview/v35-whitecoat-swordsman-20261102/qa/sword-trail-v2
```

## 최초 제작 절차 기록

저장소 루트의 기존 의존성을 사용한다. 새 node_modules를 복제하지 않는다.

```powershell
node preview/v35-whitecoat-swordsman-20261102/prepare-art.mjs
node preview/v35-whitecoat-swordsman-20261102/author-spine.mjs
node preview/v35-whitecoat-swordsman-20261102/native.mjs
node preview/v35-whitecoat-swordsman-20261102/effects/author.mjs
node preview/v35-whitecoat-swordsman-20261102/effects/bake-effekseer.mjs
node preview/v35-whitecoat-swordsman-20261102/effects/pack.mjs
node preview/v35-v3-upgrade-20261101/build.mjs
powershell.exe -NoProfile -ExecutionPolicy Bypass -File preview/v35-v3-upgrade-20261101/start-review.ps1
```

현재 native가 사용자 편집으로 바뀌면 생성 입력으로 덮지 않고 native를 정본으로 이어간다. 이미지 생성은 자동 재실행하지 않으며 보존된 ImageGen 원본을 사용한다.
