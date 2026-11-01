# 흰 코트 검사 · V3.5 전투 리소스

2026-11-02 현재 정본. 사용자 “용병 퀄리티 자체가 별로임 이거로 v3.5 리소스 만들어”의 첨부 일러스트를 외형 기준으로 삼았다. 이전 붉은 코트 검사 원화/복원검/7400 native는 보존하며 새 캐릭터의 외형 기준으로 사용하지 않는다. 작업명은 **흰 코트 검사**이며 정식 이름·등급·능력치는 미정이다.

현재 산출물은 **자세 10종, Spine 편집 원본, 서로 다른 기본 베기와 발도·올려베기, 기존 V3 전장에 연결한 로컬 검수본**이다. 전신 교체 작화 기반이며 팔다리 메시/IK 리깅을 완성했다는 뜻은 아니다. 사용자 최종 시각 승인·DNF급 품질 달성·운영 등록/배포는 하지 않았다.

## 정본과 재생

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

## 남은 품질 범위

원화 정체성과 큰 자세 차이를 확보한 검토용 리소스다. 자세 사이의 중간 작화, 실제 양발 보행/후퇴, 발도 전후의 연속 파지/납도, 패배 전이, 기술별 추가 타격 리듬·사운드는 더 다듬을 수 있다. 대기 미세 움직임이나 장식 물리는 사용자 지시대로 필수로 삼지 않는다. 상대 방향은 단순 좌우 반전이며 별도 반대쪽 작화가 아니다.

DNF급 전체 동작/타격감 달성, 사용자 최종 시각 승인, 물리 모바일 기기 성능, 전체 PVP/협동전 검수는 완료로 적지 않는다. HUNT fixture의 적 방향 배치는 운영 PVP 시험과 다르다. 필요한 텍스처는 캐릭터·새 효과·공유 파편 합계 약 **39.60MiB**이며 이 숫자는 실기기 FPS 보장이 아니다.

작업 전체는 파일/숨김 CLI/화면 없는 Chrome으로 진행했다. 사용자 데스크톱 조작, 운영 배포/용병 등록, 계정/재화 변경, 메시지 전송, 저장소 용량 유지관리/삭제/예약은 하지 않았다. 이전 원화/복원검/native/Blender 자산 해시는 [전달 기록](qa/delivery.json)에 보존한다.

## 재현

저장소 루트의 기존 의존성을 사용한다. 새 node_modules를 복제하지 않는다.

```powershell
node preview/v35-whitecoat-swordsman-20261102/prepare-art.mjs
node preview/v35-whitecoat-swordsman-20261102/author-spine.mjs
node preview/v35-whitecoat-swordsman-20261102/native.mjs
node preview/v35-whitecoat-swordsman-20261102/effects/author.mjs
node preview/v35-whitecoat-swordsman-20261102/effects/bake-effekseer.mjs
node preview/v35-whitecoat-swordsman-20261102/effects/pack.mjs
node preview/v35-v3-upgrade-20261101/build.mjs
node preview/v35-v3-upgrade-20261101/serve.mjs
```

현재 native가 사용자 편집으로 바뀌면 생성 입력으로 덮지 않고 native를 정본으로 이어간다. 이미지 생성은 자동 재실행하지 않으며 보존된 ImageGen 원본을 사용한다.
