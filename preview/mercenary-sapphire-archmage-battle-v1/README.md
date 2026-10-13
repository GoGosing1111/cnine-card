# 이름 미정 · 청옥 중갑 마법사 SSS 전투 리소스 검수판 V2

2026-10-14 후속 정정: 사용자는 서 있는 그림 자체보다 **대기 중 부자연스러운 움직임**을 지적했다. 서로 다른 대기 그림 네 장을 0.5초마다 바꾸던 재생을 중단하고 `idle:0` 한 자세로 고정했다. 몸·발·지팡이에 이동·확대·축소를 주지 않는다. 독립된 청옥 오라 12프레임과 지팡이 광원만 같은 GSAP 시계에서 흐른다. 대기 시연은 6초 단위로 이어지고, 전체 시연에서는 다음 동작으로 넘어간다.

후속 “스킬도 좀 화려하게 더 보강좀해보고... 대쉬기는 필요없잖아 마법사라서” 요청에 따라 대쉬를 시연 목록·행동 계획·리소스 로딩에서 제거했다. 포격은 6연사와 개별 결정 폭발, 궁극기는 삼중 천공 마법진·5개 지점 강림·최종 대형 폭쇄로 보강했다. 추가 폭쇄도 새 12프레임 작화다. 능력치나 서버 피해는 변경하지 않는다.

현재 활성 몸 자세는 11개, 효과는 60프레임이다. 기존 몸 자세 18개와 V1 검수 증빙은 이력으로 보존하며, 대쉬 4개와 대기 대체 3개를 현재 재생에 사용하지 않는다. 기존 `qa/runtime-report.json`과 `qa/*-showcase.webm`는 V1 이력이다. **최신 검수·영상은 `qa/v2/`**, 최신 빌더는 `pack-v2.mjs`, 검사는 `qa-v2.mjs`다. 새 효과는 built-in image_gen으로 제작했고 `prompt-aura-v2.json`, `prompts-nova-v2.json`에 실제 프롬프트를 기록했다.

PC·모바일 각각 7초 실제 대기 재생에서 40번 관찰한 몸 텍스처·위치·배율 상태는 정확히 1개, 오라 시각은 40개였다. 대기 반복 경계에서도 몸이 튀지 않는다. 각 모드 지면 오차 0, 효과 화면 경계 이탈 0, 포격·강림·최종 폭쇄 접점 오차 0을 확인했다. 정지·0.25/0.5/2배속·동작만·오라 OFF·동작 줄이기·시전 중단·대상 소멸·이탈 정리를 통과했다. `qa/v2/*-showcase.webm`를 실제 디코딩 재생해 대기 2초/4초, 포격, 최종 폭쇄, 잔향을 다시 확인했다. 사용자 최종 시각 승인은 대기다.

아래는 승인 원화와 V1 제작 이력이다. V1의 대기 프레임 교체·대쉬·4연사·단일 마무리 설명보다 위 V2 정정이 우선한다.

2026-10-14 사용자 요청: “이름은 나중에 정하고 전투 리소스 만들어 sss급에 걸맞게 화려하고 멋있는 스킬로”. 2026-10-13 승인 원화를 보존한 신규 전투 제작물이다. 이름·운영 코드·리미티드 여부·능력치·실제 피해 및 획득 경로를 정하지 않았다. `V-000`은 이 페이지의 메모리 안에서 공용 아트 어댑터를 검수하기 위한 임시 입력이며 운영 로스터에 등록하지 않는다.

`index.html`은 공용 V3/PixiJS/GSAP 실제 재생 화면, `review.html`은 실제 녹화 영상이다. 기본 공격은 결정탄 1회, 스킬은 다중 마법진의 결정창 4회, 궁극기는 천공 봉인과 적 5개 지점의 결정 강림·폭쇄다. 화면 명칭은 연출 설명용이며 용병 이름은 미정이다. 무음 검수판이다.

## 원본과 구성

- 승인 원화: `../mercenary-sapphire-archmage-sss-20261013-v1/approval-20261013.json`. SHA-256 `38DA2E9BBE7BEBB7BCB0855260705FCCB1EF0CD638A005308A7B164B0B660793` 보존.
- 몸 전용 2×2 시트 5장 중 18개 자세 사용: 대기 4, 시전 2, 궁극기 4, 활공 4, 피격/쓰러짐 4. 피격은 쓰러짐의 충격 자세를 재사용하고 대기 자세로 복귀한다. 중복 재생을 새 프레임으로 세지 않는다.
- 시전 시트 위쪽 2장은 날개 끝이 원본 경계에 닿아 재생에서 제외했다. 원본과 프롬프트는 그대로 보존한다.
- 효과 3종 × 12프레임: 마법진 구성·해체, 결정창 생성·비행·파열, 수직 결정 강림·충돌·잔향. 실제 작화 프레임을 한 GSAP 시계에서 샘플링한다.
- `assets/sources/sd-candidate.png`는 몸의 스타일 입력으로만 사용한다. 이 그림에서 새로 생성된 지팡이는 완성 스프라이트에 사용하지 않는다.
- 지팡이는 승인 원화의 보이는 픽셀만 `staff-lock.json`으로 선택한다. 원화 자체에서 하단 끝과 손에 가린 구간이 잘려 있으므로 누락 부분을 새로 그리지 않는다. 같은 RGBA를 모든 자세에 균일 축소·회전·이동한다. `assets/locked/staff-provenance.json`에 출처와 픽셀 수를 기록했다.
- 몸은 실제 알파 연결 성분으로 분리하므로 2×2 칸을 넘어 나온 부츠와 옷자락을 격자 경계에서 자르지 않는다. 웅크린 자세도 같은 신체 배율을 유지한다. 768px 셀과 발 기준점, 손·지팡이 마력 방출점은 manifest에 기록한다.

## 제작 공정과 증빙

| 공정 | 대응 파일과 결과 |
| --- | --- |
| 01 승인 원본 고정 | 원화 승인 JSON, manifest 원본 해시, `qa.test.mjs` 보존 검사 |
| 02 동작 설계 | `skill.mjs`: 준비·발사·접촉·잔향·복귀 시각, 7개 동작, 이름 미정 |
| 03 몸 연속 작화 | `assets/sources/{idle,cast,ultimate,dash,defeat}.png`, `prompt-*.json`; 온전한 18프레임 사용 |
| 04 승인 무기 합성 | `staff-lock.json` → `extract-approved-staff.mjs`, 원본 픽셀 일치 검사, 프레임별 변환 기록 |
| 05 효과 연속 작화 | `assets/sources/{seal,lance,fall}.png`, 프롬프트, 36프레임 |
| 06 알파·피벗·패킹 | `pose-registration.json`, `pack-assets.mjs`, 개별 프레임·썸네일·아틀라스·manifest |
| 07 타격·지면 | `qa/runtime-report.json`: 실제 V3 대상 좌표와 효과 접점 비교, 지상 동작 지면 오차 0; 활공만 별도 높이 곡선 |
| 08 공용 V3 재생 | `source/preview.js`, `source/SapphireFX.js`, 기존 BattleEngine·BattleCharacter·진형·도크·아트 어댑터 재사용; 단일 등록 GSAP 시계 |
| 09 PC·모바일 검수 | 1440×1080 / 390×844, 1배속 전체 시연, 0.25·0.5·2배속, 정지·탐색·각 접점·동작만·동작 줄이기·취소·대상 소멸·반복·dispose PASS |
| 10 재현·영상 보존 | 빌더·관련 검사, `qa/*-showcase.webm`, `qa/video-inspection.json`, PC·모바일 캡처 |
| 11 사용자 시각 승인 | **대기**. 기술 검수 통과와 사용자 최종 시각 승인은 구분한다. 운영 연결 OFF |

X 승인 기준 영상은 실제 재생하고 `qa/video-reference-*.png`와 재생 시각을 보존했다. 새 영상도 실제 디코딩·재생하여 결정창, 강림, 잔향, 쓰러짐을 확인했다. 로컬 서버가 Range 요청을 처리하지 않아 검수 스크립트는 영상 전체를 Blob으로 읽은 뒤 탐색한다.

모바일 초기 검수에서 기존 프리뷰 높이 계산이 하단 대기 안내의 위치를 반복 합산하는 문제가 확인됐다. 이 검수판의 불필요한 대기 안내만 숨겨 높이를 안정화했다. 공용 전장이나 운영 CSS는 수정하지 않았다. 효과는 접점 이동 없이 크기를 제한해 화면 경계를 보존한다. 중앙 강림은 PC에서 더 크게, 좁은 모바일에서는 경계 안에 들어오는 크기로 표시한다.

## 재현

```powershell
node preview/mercenary-sapphire-archmage-battle-v1/extract-approved-staff.mjs
node preview/mercenary-sapphire-archmage-battle-v1/pack-assets.mjs
node preview/mercenary-sapphire-archmage-battle-v1/pack-v2.mjs
node preview/mercenary-sapphire-archmage-battle-v1/build-preview-shell.mjs
node preview/mercenary-sapphire-archmage-battle-v1/build.mjs
node --test preview/mercenary-sapphire-archmage-battle-v1/qa.test.mjs
node preview/mercenary-sapphire-archmage-battle-v1/serve.mjs
# 별도 터미널, 서버가 켜진 상태
node preview/mercenary-sapphire-archmage-battle-v1/qa-v2.mjs
node preview/mercenary-sapphire-archmage-battle-v1/inspect-v2-video.mjs
```

프롬프트 생성은 built-in image_gen을 사용했다. idle/cast/ultimate/dash/defeat의 입력은 `assets/sources/sd-candidate.png`, SD 최초 입력은 승인 원화, 효과 3종은 신규 생성이다. 재현 스크립트는 보존된 생성 원본을 사용하며 승인 원화를 재생성하지 않는다. 편집 시 해당 부분만 다시 검수한다.
