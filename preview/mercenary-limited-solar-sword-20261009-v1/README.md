# SSS 리미티드 태양검 전투 리소스 · 무기 보정 V2

2026-10-09. 사용자 첨부 원화와 **SSS LIMITED 등급은 확정**. 이름 ‘태양검 군주’는 가칭이다. 동작·이펙트·무기 보정은 사용자 시각 검수 대기이며 CMS, 획득, 편성, 전투 수치 및 운영 활성화는 연결하지 않았다.

## 현재 결과

- [프리뷰](index.html): 원화 / 광원 OFF 무기 비교 / 공용 V3 전투 / 단계·배속·탐색·이펙트 ON/OFF.
- [PC 실제 재생](review-desktop-v2.webm), [모바일 실제 재생](review-mobile-v2.webm): 약 19초, 무음. 전체 기술 1배속 → 기본 공격 0.5배속·이펙트 OFF.
- [무기 보정 결과](assets/locked/v2/complete-sword.png), [기본 자세](qa/held-sword-v2.png), [파지 확대](qa/held-grip-v2.png).
- [명세](manifest.json): 보존 몸 37장, 실제 사용 25장, 보존 효과 144장, 실제 사용 120장.
- 모든 그림은 **built-in image_gen**으로 제작했다. [최초 프롬프트](generation-prompts.json), [SX 기준 추가 제작](generation-prompts-sx-revision.json), [무기 보정 프롬프트](weapon-correction-request.json)에 입력 역할과 원문을 보존한다. CLI/API 생성은 사용하지 않았다.

## 무기 보정 사유와 범위

사용자 지시: “근데 검 잡고있는 모양이나 스킬에 있는 검 모양이 좀 다른거같은데 광원효과 준건 좋아도”, “애초에 칼 손잡이부터 검신까지 다 잘못됐네”.

최초 선택 영역은 손잡이 끝 장식을 누락했고 검신 오른쪽 날의 상당 부분을 잘라냈다. 이 상태에서 생성 몸의 임시 손잡이를 덮고 강한 검신 광원을 앞에 놓아 형태 차이가 커졌다. 최초 무기 분리본은 반려 이력으로만 남긴다.

V2는 승인 원화의 보이는 무기 **83,468개 픽셀을 원본 RGBA 그대로** 선택한다. 장식 손잡이 끝, 넓은 검신 양쪽 날, 가드 외곽을 다시 등록했다. 원화에서 손가락에 가려진 짧은 손잡이만 생성 가이드의 **840픽셀 영역**으로 보완했다. 원화 자체, 보이는 검신·가드·손잡이 끝의 RGB는 다시 그리지 않았다. 이 보완은 원화에 없던 영역이며 별도 사용자 승인으로 간주하지 않는다.

검 전체를 하나의 래스터로 고정하고 모든 몸 동작·여섯 소환검·거대 검에 재사용한다. 실제 프레임은 몸 → 같은 검 → 원본 몸 시트의 파지 손 순서로 합성한다. 생성된 임시 손잡이의 손 바깥 부분을 등록된 마스크로 제거하고 파지 축도 바로잡았다. 추가 검신 광원은 뒤쪽 계층으로 옮겨 검 자체가 읽히게 했다.

근거: [V2 출처·좌표·완성 영역](assets/locked/v2/weapon-provenance.json), [원화 선택 중첩](qa/weapon-v2-selection.png), [원본만 분리한 무기](assets/locked/v2/original-visible-weapon.png), [이전 잘못된 선택](qa/weapon-old-selection.png), [제작 스크립트](rebuild-weapon-v2.mjs).

## 기술 구성

| 기술 | 동작과 효과 | 길이 / 적중 |
| --- | --- | --- |
| 태양의 권능 | 자연 비율 성인 캐릭터, 태양 후광, 양옆 플라스마와 바닥 반사, 검신 잔광 | 6초 루프 시안 |
| 일식 잔영 | 흑금 틈과 파편, 실제 과거 포즈 6단 잔영, 전진·귀환 재결합 | 1.9초 |
| 여명 일섬 | 검 들어올리기 → 대각 내려베기 → 날끝 잔광 → 회수 | 1.7초 / 0.48초 |
| 육광·태양검진 | 손의 명령 → 여섯 방향 포위 → 차례로 관통 → 검진 수렴 | 4.3초 / 1.20·1.39·1.58·1.77·1.96·2.15·2.66초 |
| 천양붕락 | 천공 태양문 → 거대 검 현현 → 낙하 → 지층 균열·왕관 충격파 | 5.8초 / 강타 2.48초, 5대상 충격파 약 2.74~2.80초 |

초기 직선 광선·단순 기둥 효과는 보존만 하고 실제 기술에서는 제외했다. SX 승인본의 단계별 실루엣·강타·실제 전장 카메라 구성을 확인해 검진과 태양문/지층 효과를 추가했다. SX의 푸른 검 모양·색·캐릭터는 복제하지 않았다. 기존 V3 전장, 진형, 카드 도크를 유지한다.

## 필수 11단계 제작·검수 기록

| 단계 | 실행 및 증빙 |
| --- | --- |
| 01 원본 고정 | [승인 기록](approval-20261009.json). 원화 SHA-256 BE6BF7819C24C53A7CDB0C2C86D85802AFA1E39FDF62D8F4306B8013CCE62492. 첨부 PNG를 재압축 없이 보존. |
| 02 동작 설계 | [motion.mjs](motion.mjs)의 자세·진입·회수·타격 시간. 동작은 연출 전용이며 HP·피해·승패·보상을 계산하지 않는다. |
| 03 몸 전용 연속 작화 | [sources](assets/sources/)의 몸 시트 10장, 각 2×2 네 자세. 자연스러운 성인 비율과 연속된 머릿결. 프롬프트 2묶음 및 pose-registration 파일에 입력·선택 기록. 잘린 손/발과 무기 지면 간섭 3개 포즈는 제외. |
| 04 승인 무기 합성 | [V2 재제작](rebuild-weapon-v2.mjs). 원본 보이는 픽셀 일치 검사 통과. 가려진 손잡이 보완은 별도 기록. 같은 전체 무기 래스터, 균일 배율·회전만 사용. |
| 05 개별 효과 작화 | 4×3 12프레임 시트 12종 보존. aura/dash/basic/ground/eclipse/formation/sun-gate/fault/mantle/blade 10종을 실제 재생. 정지 그림 확대만으로 주 효과를 대체하지 않는다. |
| 06 패킹 | [pack-assets.mjs](pack-assets.mjs). 몸 768×768, FX 384×384, 실제 알파·발·머리·파지·검끝 등록. 몸 기준 높이 330픽셀, 웅크림 보이는 높이로 확대하지 않는다. 패딩·원본·프레임·아틀라스 해시는 manifest에 기록. |
| 07 접점·지면 | PC/모바일 기본 공격 칼날-몸통 교차, 소환검 6회 각각 교차, 광역 5대상 시간차 도달 확인. 바닥 기준 이동이며 도약 연출 없음. FX OFF 기본 자세·기본 공격·검진·거대 검 캡처 포함. |
| 08 공용 V3 재생 | [SolarFX.js](source/SolarFX.js), [preview.js](source/preview.js), [build-report](build-report.json). 기존 BattleEngine/지원 액터/카메라/효과 레이어를 사용. Pixi와 GSAP 각 한 벌, V3에 등록한 GSAP 타임라인 하나가 전체 시계를 소유. |
| 09 실제 전장·제어 | PC 1440×1050, 모바일 390×844. 전체 1배속 영상과 0.5배속 FX OFF 영상. 0.25/0.5/1/2배속, 일시정지·탐색·취소 확인. 가로 넘침 0, 요청 누락 0. 해제 직후 WebGL 해제 이벤트의 중복 취소 오류를 고쳤으며 PC/모바일 해당 경로 재검사 통과. |
| 10 증빙 보존 | 원본·프롬프트·반려 자료·무기·몸/FX 소스·프레임·아틀라스·스크립트·명세·QA·영상 모두 이 경로와 승인 원화 경로에 보존. [video-report](qa/video/video-report.json)는 실제 WebM 디코딩 프레임 시각/해시를 기록한다. |
| 11 사용자 시각 승인 | **대기.** 원화·등급 확정과 광원에 대한 긍정 피드백을 동작/무기 최종 승인으로 확대하지 않는다. 보정 V2 비교본과 실제 재생을 제시한다. 운영 활성화 보류. |

## 관련 검수 결과

- `node --test .../qa.test.mjs`: 6/6 통과. 원화 불변·무기 원본 픽셀·모든 몸 출처/손 합성·실제 효과 프레임/알파·기술 참조·단일 V3 번들.
- [browser-report.json](qa/browser-report.json): 양 기기 연출·접점·배속·일시정지·FX OFF·취소 항목 전부 통과. 마지막 renderer 해제 직후 오류는 이 최초 보고서에 남겼다.
- [cleanup-report.json](qa/cleanup-report.json): 위 종료 오류 수정 후 양 기기에서 재생 중 이탈·중복 dispose·뒤늦은 cancel까지 오류 0, 타임라인/효과 컨테이너 잔류 0 확인. 변경한 종료 경로와 번들만 재검사했다.
- [PC 영상 필름스트립](qa/video/filmstrip-desktop.png), [모바일 영상 필름스트립](qa/video/filmstrip-mobile.png): 각각 실제 영상에서 디코딩한 12시점. 이펙트 OFF 기본 공격의 파지와 칼날 교차도 확인.
- PC/모바일 무기 비교 및 각 전투 캡처는 `qa/`에 보존한다. 사운드는 OFF이며 새 합성음을 만들지 않았다.

## 재현

저장소 루트에서 실행한다.

```powershell
node preview/mercenary-limited-solar-sword-20261009-v1/rebuild-weapon-v2.mjs
node preview/mercenary-limited-solar-sword-20261009-v1/pack-assets.mjs
node preview/mercenary-limited-solar-sword-20261009-v1/qa/weapon-proof.mjs
node preview/mercenary-limited-solar-sword-20261009-v1/build.mjs
node --test preview/mercenary-limited-solar-sword-20261009-v1/qa.test.mjs
node preview/mercenary-limited-solar-sword-20261009-v1/serve.mjs
```

별도 터미널에서 `qa-browser.mjs`, `record-review.mjs`, `qa-video.mjs`, 필요 시 `qa/cleanup-check.mjs`를 실행한다. 현재 주소는 http://127.0.0.1:8914/preview/mercenary-limited-solar-sword-20261009-v1/ 이다. 브라우저 검수 스크립트는 설치된 Codex Playwright와 Chrome을 사용한다.

원화 승인 경로: `assets/ui/project-v/mercenaries/approved-20261009/solar-sword-sss-limited-source-art.png`. 프리뷰 원격 보존은 `[CF-Pages-Skip]` 커밋으로 수행하며 운영 배포·기능 ON은 하지 않는다.
