> 후속 정본은 [전진 베기·무릎 수정본](../attack-v2/PROJECT.md)이다. 아래 내용은 06c1f1563f47의 당시 기록이며 현재 정본으로 선택하지 않는다.

# 붉은 코트 검사 · 칼 추출 수정과 팔 동작 재작업

현재는 **팔 동작 수정안**이다. 앞선 베기는 사용자 **“무슨 팔이 각목으로 움직이는거같노 쓸줄 모르나?”**로 반려됐다. 구조 검사를 통과했어도 동작 품질이 부족했다. 반려된 영상·입력·제작 코드는 [history/rigid-arm-rejected/](history/rigid-arm-rejected/)에 보존한다. 최신 수정안의 사용자 시각 승인은 아직 없다.

## 현재 파일

- [Spine 편집 파일](swordsman-06c1f1563f47.spine): Professional 4.3.26, 같은 폴더의 images 상대 경로 사용. SHA-256 `3ae87ba2a39097cea5b25105db813a2bcefed0afc574a549cc85afac4139a423`.
- [현재 재생 화면](http://127.0.0.1:18764/): **기본 베기** 버튼으로 재생. [정상 속도 세 번 재생 영상](qa/attack-three-runs.webm).
- 수정한 칼: [밝은 배경](qa/weapon-v2-light.png), [어두운 배경](qa/weapon-v2-dark.png), [투명 원본](images/weapon-restored-v2.png).
- [런타임 JSON](runtime-06c1f1563f47/swordsman.json), [atlas](runtime-06c1f1563f47/swordsman-06c1f1563f47.atlas), [atlas PNG](runtime-06c1f1563f47/swordsman-06c1f1563f47.png).
- 기계 판독 정본은 [qa/native.json](qa/native.json), 전달 파일 해시는 [manifest.json](manifest.json)이다. 해시가 다른 이전 후보를 최신 정본으로 선택하지 않는다.

## 무엇을 수정했는가

기존 칼은 16px 삼각형 선택 마스크 때문에 옷과 바지 조각이 붙었고, 손에 가려진 손잡이가 비어 있었다. **원래 보이는 검신과 장식은 원본 픽셀로 다시 선택**했다. 가려진 손잡이 부분에만 ImageGen 보완 그림을 사용했다. 원본 선택 30,086픽셀, 가려진 부분 보완 4,246픽셀, 선택된 원본 RGBA 변경 0을 별도 검사했다. 검 전체를 새 AI 검으로 교체하거나 검신을 늘리지 않았다.

첫 베기의 뻣뻣함은 갑옷과 소매를 한 덩어리로 돌린 것, 칼의 목표 위치가 팔 전체를 끌어간 것, 중간 키마다 모든 관절을 동시에 감속한 것에서 왔다. 수정안은 다음을 바꿨다.

- 어깨 갑옷을 별도 강체로 분리하고 그 아래 소매를 ImageGen으로 보완했다. 금속판을 소매와 함께 휘지 않는다.
- 어깨 → 위팔 → 팔꿈치 → 손목 → 검의 계층으로 바꾸고, 공격 팔은 FK로 직접 자세를 만든다. 다리와 반대팔의 IK는 유지한다.
- 어깨 이동, 팔꿈치 펼침, 손목 회전의 시각을 나누었다. 구간마다 멈추던 동일 smoothstep 대신 중간 속도가 이어지는 곡선을 사용했다.
- 몸 아래 가려진 영역과 두 코트 자락도 보완·분리했다. 머리와 얼굴은 기준 원본의 픽셀을 유지했다. 몸 전체가 원본 픽셀 그대로라는 뜻은 아니다.

사용한 도구는 built-in ImageGen, 기술적 픽셀 선택·정렬·패킹용 Sharp, Spine Professional 파일/CLI, 기존 V3/PixiJS/GSAP다. **뼈·가중치·동작 키는 코드로 작성하고, 실제 Spine 프로그램으로 import/save/reopen/export했다. GUI 편집기에서 직접 뼈와 포즈를 잡은 작업이 아니다.** 사용자 편집기 원격 입력은 하지 않았다. CLI 왕복 성공을 편집기에서 동작을 충분히 다듬었다는 뜻으로 설명하지 않는다. Krita·Aseprite·Effekseer를 사용한 결과로 기록하지 않는다. 모든 생성 입력·프롬프트와 등록 좌표는 sources에 보존한다.

## 동작과 재생 계약

- 27개 뼈, 11개 부품. `setup` 0.1초, `idle` 4.2초, `attack_basic` 1.2초.
- 기본 베기: 준비 0~0.29초, 어깨 선행과 가속 0.29~0.40초, 접촉 자세 0.40~0.44초, 후속 동작·회수 0.44~1.20초. 접촉 자세 정지는 실제 엔진 히트스톱 구현과 구분한다.
- `visual_contact`는 0.40초의 시각 표식이다. 피해 판정이나 서버 이벤트를 발생시키지 않는다.
- 공격 종료 후 대기 복귀. 중간 취소는 0.18초 mix, 대기→공격은 0.06초 mix. 탐색은 연출 이벤트를 재발화하지 않는다.
- 원화 좌표는 1024×1536, 배치 원점 (512,1450), Spine 변환은 (x−512,1450−y). 발은 원화 (143,1440)/(846,1422). 실제 전장 바닥·진형·좌우 반전 좌표 확정은 후속 연동 범위다.
- Spine autoUpdate를 끄고 기존 V3 EffectScene의 한 Pixi 캔버스와 GSAP 시계에서 재생한다. 이번은 검토 화면 연동이며 운영 전투 액터 연결은 아니다.

## 확인한 범위와 남은 품질

네이티브 저장/재열기/내보내기에서 스켈레톤 하나와 세 애니메이션을 확인했다. 공격 241시점에서 알파 32 초과 픽셀을 실제 포함하는 삼각형의 뒤집힘 0, 비정상 좌표 0, 발 접점·발 메시 이동 0, 팔 끝과 손목 틈 0을 확인했다. 검 길이 오차는 원화 좌표 0.000074px 미만이다. 투명 영역의 삼각형 뒤집힘은 별도 집계하며 전체 뒤집힘 0이라고 보고하지 않는다. [geometry.json](qa/geometry.json), [provenance.json](qa/provenance.json).

정상 속도로 세 번 공격·대기 복귀를 실행하고 캔버스를 녹화했다. 일시정지·탐색·0.25/0.5/2배속·화면 비활성/복귀·세 시점 중단을 확인했다. 선택한 준비/접촉/회수 자세, 밝음/어두움, 390px 화면을 직접 이미지로 확인했다. **영상 전체를 사람이 연속 감상한 검수나 실기기 성능 검사로 기록하지 않는다.** [playback.json](qa/playback.json), [visual-review.json](qa/visual-review.json).

원화 한 시점의 팔·손을 중심으로 만든 기본 베기 수정안이다. 큰 원근 변화에 필요한 자세·손 교체 작화, 대표 스킬, 검광·스미어·피격 반응·사운드와 실제 전투 연동은 남아 있다. **던전앤파이터급 달성·완성 용병·사용자 승인으로 판정하지 않는다.** 이전 칼과 첫 베기의 오류는 이번 기술 검사로 소급 통과시키지 않는다.

## 재현

프로젝트 루트에서 기존 의존성과 설치된 Spine을 사용한다.

```powershell
node preview/v35-character-baseline-20261101/attack-v1/extract-weapon.mjs
node preview/v35-character-baseline-20261101/attack-v1/prepare-cloth.mjs
node preview/v35-character-baseline-20261101/attack-v1/prepare-arm-v2.mjs
node preview/v35-character-baseline-20261101/attack-v1/author-attack-v2.mjs
node preview/v35-character-baseline-20261101/attack-v1/native.mjs
node preview/v35-character-baseline-20261101/attack-v1/build.mjs
node preview/v35-character-baseline-20261101/attack-v1/serve.mjs
```

서버 실행 뒤 qa/provenance.mjs, qa/verify.mjs, qa/poses.mjs, qa/delivery.mjs로 변경 범위를 검사한다. 예제 Playwright·Chrome 경로는 QA 소스에 기록돼 있다. 재생성하면 시각 검수 상태는 pending으로 돌아간다. 최신 .spine 해시가 달라지면 사용자 편집을 보존하고 생성 내보내기를 중단한다. 기존 .spine에 import를 반복해 스켈레톤을 추가하지 않는다.

원본 baseline-v4와 과거 idle .spine은 변경하지 않았다. 새 제작물의 원격 보존 범위이며 게임 운영 배포는 포함하지 않는다.
