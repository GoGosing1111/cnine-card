# 청광 기사 — 천검 포위 V4

사용자 “천검포위는 굳이 지금 캐릭터가 쓰는 칼 아니여도 되는데 … 직각으로 갔다가 떨어졌다가 변칙적으로” 요청으로 **천검 포위만** 다시 제작했다. 현재 손에 든 검·승인된 캐릭터·흰빛 망토·흰 네온과 다른 네 기술은 유지한다. “2개는 괜찮은데”의 대상이 지정되지 않았으므로 특정 기술의 시각 승인으로 기록하지 않았다. 자동 확대는 OFF다.

- **전용 소환검 다섯 자루:** 원본 검을 복제하던 방식을 교체했다. 백금색 날, 금색 가드와 청색 코어를 가진 서로 다른 검을 built-in ImageGen으로 제작했다. 원본 무기·몸 비율은 변경하지 않는다.
- **독립적인 엇박자 타격:** 후속 요청으로 일제 공격을 없앴다. 20개 시각 적중을 0.12~0.18초 간격으로 교차 배치하며, 몸통 안의 서로 다른 지점을 치고 각자 빠져나간다. 한 검의 두 번째 공격이 다른 검의 첫 공격보다 먼저 나오며 전체 동작은 4.55초다.
- **곡선·사선·급전환 혼합:** 사용자 “좋아 근데 직각으로만 가지말고 좀 다양한 루트”를 따라 받아들여진 엇박자는 그대로 유지한다. 30초 영상에서 확인한 관통 뒤 둥근 되돌림과 사선 재진입을 참고해 초승달 우회·S자 추격·대각선 급강하·사선 지그재그를 섞고, 직각 계단은 일부 공격에만 남긴다. 칼끝은 실제 경로의 접선을 향한다.
- **실제 이동 경로에 잔상:** 새 검광 시트 12프레임과 제동·적중 파열 12프레임을 사용한다. 검광 원화를 MeshRope로 실제 곡선에 맞춰 휘며, 검을 따라온 경로가 잠깐 남는다. 큰 참격 이미지를 연속으로 겹쳐 칼을 가리던 방식을 제거하고 마지막 개별 타격에만 파열을 넣었다.
- **화면 고정:** 회전 중심을 검 전체의 중앙에 맞추고 화면 가장자리 쪽 이동 폭만 가용 여백에 맞춘다. 검과 캐릭터 크기, 카메라 배율은 바뀌지 않는다. 검·잔상·모서리 파열이 같은 경로 변환을 사용한다.

## V4 확인

- [로컬 프리뷰](http://127.0.0.1:8991/preview/mercenary-cyan-knight-battle-20261020-v1/)
- [천검 포위 1배속](review-array-v4.webm) / [0.4배속](review-array-v4-slow.webm)
- [PC 곡선 재진입](qa/array-v4/desktop-curve.png) / [모바일 곡선 재진입](qa/array-v4/mobile-curve.png)
- [PC·모바일 검증 기록](qa/array-v4/checks.json), [변경 범위·보존 해시](array-v4-scope.json)
- [ImageGen 프롬프트·출력 출처](array-v4-prompts.json), [최종 리소스·피벗·해시](manifest.json)

검증은 천검 포위의 실제 검별 20개 접점, PC·모바일 화면 경계·고정 카메라, 재생/일시정지/시크/0.4배속/효과 OFF/취소/페이지 이탈에 한정한다. 기존 네 기술은 이전 커밋의 동작 샘플과 비교하고 승인 자산은 해시로 보존을 확인한다. **V4는 사용자 시각 검수 대기**이며, 서버 피해·쿨다운·등급·획득·편성·운영 활성화 변경은 없다.

## V4 제작 단계와 재현

1. `array-v4-scope.json`으로 승인 외형·원본 검·기존 몸/효과를 잠갔다. 소환검 교체 허용 문구를 별도 기록했다.
2. `array-motion-v4.mjs`에 5검의 독립 동작표·20개 시각 접점·곡선/사선/급전환을 설계했다. 사용자가 긍정한 엇박자 시간표와 직각 버전은 `qa/array-v4/orthogonal-offbeat/`에 보존하고 시점을 비교한다. 최초 일제 공격 V4는 `qa/array-v4/rejected-synchronized/`에 보존했다.
3. 기존 실제 몸 64프레임과 원화 무기 합성을 그대로 사용하고 천검 포위 자세의 시각만 재배열했다.
4. 소환검에 한해 신규 5종을 사용한다. 각 검은 하나의 강체로 회전하고 동일 비율로 표시한다.
5. 신규 검광·제동 파열을 각 12프레임으로 제작했다. 전체 효과 자산은 180프레임이다.
6. `register-array-v4.mjs`에 알파 여백·프레임·실루엣 경계·그립/칼끝·피벗·해시를 등록했다.
7. `SummonedSwordArray.js`가 실제 적 몸통을 기준으로 검·잔상·파열 접점을 함께 계산한다. 새 피해 판정은 아니다.
8. 기존 V3의 단일 Pixi 렌더러·GSAP 시계·효과 레이어를 사용한다.
9. `qa-array-v4.mjs`가 PC·모바일의 접점·경계·제어·정리를 확인한다. 기존 전체 검사를 반복하지 않는다.
10. 원본 PNG·프롬프트·이전 버전·녹화·화면·검수 결과를 보존한다.
11. 승인된 외형과 이번 천검 포위의 시각 승인 상태를 분리한다.

참고 영상은 사용자가 지정한 [30초 구간](https://www.youtube.com/watch?v=hsbDPa9ViY8&t=30s)을 0.4× 재생과 30~31초대 프레임 단위 탐색으로 다시 확인했다. 사방으로 비스듬히 관통한 검이 휘어 돌아나오는 재진입, 서로 겹치지 않는 박자와 전방의 강한 타격 광원을 관찰했다. 영상의 그림·음원은 결과에 복사하지 않았다.

~~~powershell
node preview/mercenary-cyan-knight-battle-20261020-v1/serve.mjs
node preview/mercenary-cyan-knight-battle-20261020-v1/register-array-v4.mjs
node preview/mercenary-cyan-knight-battle-20261020-v1/build.mjs
node preview/mercenary-cyan-knight-battle-20261020-v1/qa-array-v4.mjs
node preview/mercenary-cyan-knight-battle-20261020-v1/record-array-v4.mjs
~~~

## 이전 V3 제작 기록

아래는 V4 이전 이력이다. 천검 포위의 원본 검 복제·156프레임·3.8초 설명은 현재 V4보다 우선하지 않는다. V3 등록 스크립트를 실행한 경우에는 V4 등록을 마지막에 다시 실행해야 한다.

2026-10-20 사용자 “ㅇㅋ일단여기까지 승인 근데 문제가 스킬이 여전히 부족함”에 따라 **현재 캐릭터·흰빛 망토·흰 네온 외형은 승인**으로 고정했다. 스킬 이펙트는 별도 수정 시안이다. 승인 범위와 13개 원본/코드/몸 아틀라스의 해시는 [appearance-approval-20261020.json](appearance-approval-20261020.json)에 있다. 원본 검과 몸 64프레임, 망토 6프레임을 다시 그리거나 몸·무기 비율을 바꾸지 않았다.

## 이번 변경

- 후속 사용자 지시로 **스킬 자동 확대를 기본 OFF**로 변경했다. 기술 전환·재생 중 전장 카메라를 고정한다. 확대 보기 버튼을 직접 켰을 때만 기존 확대를 사용할 수 있다.

- **청광 횡단 / 섬광 연참:** 가는 선 중심 효과를 두꺼운 청색·금색 참격, 적중 파열과 여러 크기의 파편으로 교체했다.
- **용궤 검격:** 이전 낙성 검격의 공중 낙하를 제거했다. 등록된 지상 횡베기 포즈를 사용하고, 지면에서 용의 머리와 나선 몸통을 이루는 검기가 앞으로 흐른다. 돌과 용 검기는 몸 뒤에, 타격 파열은 앞에 놓는다.
- **천검 포위:** 원본 칼 다섯 자루를 유지한다. 각 교차 베기의 진입/적중/통과 구간은 225ms에서 87ms로 줄이고 이동 거리도 늘렸다. 진입 속도는 약 3배다. 실제 칼끝과 이동 방향에 새 전용 잔상 원화를 붙이고, 4차 교차 → 빠른 연속 관통 → 5검 수렴 폭쇄로 연결한다.
- **창천 종단:** 지상 교차 검격 2회 → 크게 펼쳐지는 용 검기 → 종단 폭쇄로 변경했다. 발을 지면에 둔 몸 포즈를 사용한다.
- 새 효과 4종 × 12프레임 = 48프레임, 총 효과 156프레임. 원화 시트에서 실제 형태·파편·흐름이 바뀐다. 큰 효과 끝이 셀 경계에서 잘리던 초기 V3 시트는 보존하고, ImageGen으로 여백을 다시 만든 시트를 사용한다.
- 재생 속도 선택에 0.4×를 추가했다. 승인 외형, 기존 공용 V3/PixiJS/GSAP 및 카드 도크를 사용한다.

## 확인할 결과

- [프리뷰](http://127.0.0.1:8991/preview/mercenary-cyan-knight-battle-20261020-v1/)
- [5개 스킬 실제 1배속](review-effects-v3.webm)
- [용궤 검격·천검 포위 실제 0.4배속](review-effects-v3-slow.webm)
- [자동 확대 OFF 최종 화면](qa/effects-v3/ui-camera-fixed.png), [카메라 고정 검사](qa/effects-v3/camera-fixed.json)
- 아래 확대 상세 캡처는 효과 검수용이다. 기본 프리뷰와 최종 영상은 자동 확대 OFF 상태다.
- [지면 용 검기](qa/effects-v3/desktop-dragon.png), [PC 수렴 폭쇄](qa/effects-v3/desktop-array-finish.png), [모바일 수렴 폭쇄](qa/effects-v3/mobile-array-finish.png)
- [자산 검증](qa/asset-check.json), [PC·모바일 접점과 제어](qa/effects-v3/browser-check.json)

기술명은 시안용 가칭이다. 이 결과는 공용 토벌 몬스터 1체를 사용한 **전투 연출 프리뷰**이며, 서버 피해·쿨다운·등급·획득·편성·운영 전투 활성화는 변경하지 않았다. 무음이다. 기능 검사 결과는 새 스킬의 사용자 시각 승인이 아니다.

## 실제 참고와 제작 기록

사용자가 열어둔 [던파TV 영상](https://www.youtube.com/watch?v=hsbDPa9ViY8)은 6.058초에서 일시정지, 0.4× 상태였다. 실제 0.4×로 5.56–7.10초의 지면 회전 검기와 12.60–15.58초의 5검 연격을 재생하여 확인한 뒤 원래 위치·속도·일시정지 상태로 복원했다. 사용자 첨부의 큰 다색 파열과 지면 검기 이미지는 [assets/references/vfx-v3](assets/references/vfx-v3)에 무가공 보존했다.

영상의 그림·음원·게임 리소스는 결과물에 복사하지 않았다. 새 주 효과는 **built-in ImageGen**으로 제작했다. 프롬프트/참고 시각은 [fx-v3-prompts.json](fx-v3-prompts.json), 여백 수정 프롬프트는 [fx-v3-padding-prompts.json](fx-v3-padding-prompts.json), 생성 출처는 [fx-v3-generation.json](fx-v3-generation.json), 최종 파일·프레임·피벗·해시는 [manifest.json](manifest.json)에 있다.

## 11단계 증빙

| 단계 | 이번 적용 |
| --- | --- |
| 01 원본과 범위 고정 | appearance-approval-20261020.json. 승인 외형과 원본 칼을 해시로 잠금. 스킬 시각 승인 제외. |
| 02 동작 설계 | motion.mjs. 지상 횡베기/용궤, 빠른 5검 4차 연격/관통/수렴, 지상 광역 마무리. 일반 1.65/2.6/2.7초, 광역 3.8/4.0초. |
| 03 몸 연속 작화 | 기존 생성·등록된 64프레임 보존. 지상 기술에는 horizon/flurry/array의 실제 지상 자세를 재배열. 공중 포즈를 땅에 붙여 사용하지 않음. 기존 body-prompts-revision-v2.json, pose-registration.json 참조. |
| 04 원본 무기 합성 | sword-lock.json, assets/locked/blade-provenance.json. 55,824개 원화 RGBA 픽셀 동일. 5검도 같은 단일 래스터와 균일 배율. |
| 05 단계별 효과 | dragon-v3 / cleave-v3 / burst-v3 / flight-v3 각 12개 새 작화. 불꽃 부피·검궤적·충돌·흩어짐 변화. flight는 실제 칼끝과 이동 방향을 추적. |
| 06 알파·피벗·패킹 | register-effects-v3.mjs, qa/effects-v3/registration.json. 4×3 시트, 투명 여백, 용 지면 피벗과 투사체 선두 피벗 등록. 셀 여백 수정 전 원본 별도 보존. |
| 07 접점·지면 | PC·모바일 각 36개 시각 적중에서 실제 검날/적 몸통 교차. 새 용궤와 창천 동작은 지상 높이 0. 서버 타격 횟수를 재정의한 것이 아님. |
| 08 공용 V3 | source/KnightFX.js / source/preview.js. 단일 Pixi 렌더러와 GSAP 시계. 같은 시각으로 몸·검·잔상·용·충돌·카메라 재생. |
| 09 실제 검수 | PC 1440×1000, 모바일 390×844. 1× 완료, 0.4×, 2×/일시정지, 시크, 효과 OFF, 취소, 페이지 이탈과 콘솔 오류 확인. 큰 파열 셀 경계 잘림을 실제 모바일 검수에서 발견하고 원화 수정. |
| 10 결과 보존 | 이 문서, 생성 프롬프트·원본·해시·초기 잘림 이력, 재현 코드, 최종 WebM과 PNG. |
| 11 사용자 시각 승인 | 캐릭터·흰빛 망토·흰 네온은 승인. **V3 스킬은 사용자 확인 대기.** |

## 재현

프로젝트 루트에서 실행한다. 외형이 바뀌지 않았으므로 body 재생성/재패킹은 필요 없다. setup-pipeline.mjs는 최초 복제 이력이며 다시 실행하면 현재 수정을 덮어쓴다.

~~~powershell
node preview/mercenary-cyan-knight-battle-20261020-v1/serve.mjs
node preview/mercenary-cyan-knight-battle-20261020-v1/register-effects-v3.mjs
node preview/mercenary-cyan-knight-battle-20261020-v1/build.mjs
node preview/mercenary-cyan-knight-battle-20261020-v1/verify-assets.mjs
node preview/mercenary-cyan-knight-battle-20261020-v1/qa-browser-v3.mjs
node preview/mercenary-cyan-knight-battle-20261020-v1/record-review-v3.mjs
node preview/mercenary-cyan-knight-battle-20261020-v1/record-review-v3.mjs --slow
~~~

기존 이력: [V2 기록](review-v2.json), [V2 1배속](review-all-skills-v2.webm), [흰빛 망토 기록](white-aura-appearance.json), [흰빛 망토 영상](review-white-aura-v1.webm). 기존 버튼·조작부는 유지했다. 모션 요청에 별도 미리보기 UI 이미지 제작을 추가하지 않는 docs/project-ui-image-art-standard.md의 2026-10-18 규정을 적용한다.
