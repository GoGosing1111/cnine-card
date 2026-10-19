# 청광 기사 — V3 스킬 이펙트 검수

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
