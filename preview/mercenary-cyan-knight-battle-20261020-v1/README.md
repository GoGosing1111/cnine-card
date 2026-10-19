# 청광 기사 전투 연출 — 천검 포위 V2 검수 시안

사용자가 첫 천검 포위의 연출 품질을 반려했다. V2에서는 원본 검 다섯 자루의 횡방향 베기, 회전, 짧은 적중 정지, 상공 재정렬, 연속 내려찍기, 마지막 동시 수렴을 다시 구성했다. 얇은 원형 궤적 중심이던 효과를 새로 생성한 청색·금색 연속 검격으로 교체하고, 전개와 공격 구간의 카메라 거리를 분리했다. 모바일에서는 뒤로 뻗은 실제 검날까지 화면 안에 들어오도록 여백을 확보했다.

**새 시안은 사용자 시각 승인 대기다.** 기존 V1을 승인본으로 간주하지 않는다. 이 폴더는 실제 공용 V3 전장에서 재생하는 시각 프리뷰이며, 이름은 가칭이다. 등급·피해·쿨다운·대상 수·획득·편성·운영 전투 활성화는 지정하거나 배포하지 않았다. 무음이다. 현재 확인 대상은 공용 토벌 몬스터 1체이며 다수 적에 대한 서버 피해 검증을 뜻하지 않는다.

- 프리뷰: `http://127.0.0.1:8991/preview/mercenary-cyan-knight-battle-20261020-v1/`
- 천검 포위 1배속: [review-array-v2.webm](review-array-v2.webm)
- 일반 기술 3개 + 광역기 2개 1배속: [review-all-skills-v2.webm](review-all-skills-v2.webm)
- 비교 검수: [PC 교차 베기](qa/desktop-array-cross.png), [모바일 검 전개](qa/mobile-array-fan.png), [모바일 효과 OFF](qa/mobile-array-effects-off.png)

## 제작 기준과 참고

사용자 제공 V3 전신을 기준으로 긴 다리·작은 헬멧·몸통 비율을 유지했다. 목을 약 15–20% 줄이고 손가락이 손잡이를 감싸도록 새 대기 작화를 만들었다. V3는 후속 전투 제작 지시의 기준이며 신규 전투 작화 전체의 승인으로 확대하지 않는다.

[던파TV의 참고 영상](https://www.youtube.com/watch?v=hsbDPa9ViY8)의 실제 화면을 브라우저에서 확인했다. 다중 검 장면은 12.6–15.8초를 0.4초 간격으로 다시 확인했고 29–31초 반복도 확인했다. 다섯 검의 전개 → 빠른 교차 베기 → 위로 회수 → 하강과 수렴이라는 흐름을 반영했다. 영상의 그림·음원·게임 리소스를 결과물에 복사하지 않았다. 원본 메카와 검, 새로 생성한 몸·효과를 사용한다. 상세 관찰과 기술 구성은 [production-plan.json](production-plan.json)에 있다.

이미지는 **built-in ImageGen**으로 생성했다. 전체 입력과 출력 이력은 [generation-provenance.json](generation-provenance.json), 몸 프롬프트는 [body-prompts-revision-v2.json](body-prompts-revision-v2.json), 목·파지 수정은 [prompt-idle-neck-grip-v2.txt](prompt-idle-neck-grip-v2.txt), 효과는 [fx-prompts.json](fx-prompts.json), 궁극기 V2 효과는 [prompt-vortex-v2.txt](prompt-vortex-v2.txt)에 보존한다. 원본 파일과 SHA-256은 [manifest.json](manifest.json)에 연결한다.

## 11단계 증빙

| 단계 | 실행 및 근거 |
| --- | --- |
| 01 원본과 범위 고정 | `assets/sources/source-art-v3.png`, `sword-lock.json`, `production-plan.json`. 원화 SHA-256 `D9EBF2DD04DE55D7EBA230617BBE81B11C1EAF6E728D61BB32D892ECC82D0159`. |
| 02 동작 설계 | `motion.mjs`의 준비·접근·타격·회복 시간과 지상/공중 경로. 일반 3종 1.65/2.6/2.7초, 광역 2종 3.8/4.6초. 천검 포위는 5검·4차 교차 베기·재정렬·하강·수렴. |
| 03 몸 연속 작화 | `assets/sources/body-*.png` 16시트, 64개 고유 몸 그림. 대기/대시/피격/퇴장 각 4, 일반 기술 각 8, 광역기 각 12. `qa/source-report.json`의 4개 몸 분리와 가장자리 잘림 검사. 잘린 연참/검진 시트는 재생성하고 반려본도 보존했다. |
| 04 원본 무기 합성 | `extract-approved-blade.mjs`, `assets/locked/blade-provenance.json`, `pack-assets.mjs`. 원화의 55,824개 RGBA 픽셀을 그대로 선택했다. 단일 검에 이동·회전·균일 배율만 적용하고 손가락 원화가 파지부 앞에 오도록 합성했다. `qa/asset-check.json`에서 원화 픽셀 일치 확인. |
| 05 단계별 효과 작화 | 9시트, 108프레임. 참격·연참·낙하·지면·분열·잔향을 분리했다. V2는 `fx-vortex-v2.png`를 새로 생성해 반복 베기/상승/하강/수렴 구간에 연결했다. 이전 원형 궤적은 천검 포위의 주 효과에서 제거했다. |
| 06 알파·피벗·패킹 | `pose-registration.json`에 64개 발·파지점·칼 각도 등록. `pack-assets.mjs`가 768px 셀과 동작별 아틀라스를 만든다. 모든 몸의 물리 기준 높이 360, 모든 손의 무기 배율 동일. 웅크린 포즈를 바운딩 박스 높이로 늘이지 않는다. V2 효과 셀 가장자리 구분선은 3px 거터로 제외했다. |
| 07 접점·지면 검증 | 실제 V3 적 몸통과 검날 선분을 검사한다. 횡베기 각도, 연참의 준비/타격 포즈 순서, 창천 종단의 첫 타격 위치를 수정했다. PC·모바일 각각 35개 시점에서 타격 통과 및 지면 기준 오차 확인. 도약은 명시적인 lift 경로다. |
| 08 공용 V3 실제 재생 | `source/preview.js`, `source/KnightFX.js`, `battle.html`. 기존 BattleEngine·카드 도크·계정 전투 유닛 슬롯·전장·몬스터를 사용한다. 별도 전투 렌더러 없이 PixiJS 8.20.0 1개, GSAP 3.13.0 1개. 타임라인을 공용 엔진에 등록하고 정리한다. `build-report.json` 참조. |
| 09 PC·모바일 검수 | `qa-browser.mjs`, `qa/browser-check.json`, `qa/*-array-*.png`. PC 1440×1000, 모바일 390×844에서 1배속 종료, 0.25배속, 2배속 중 일시정지, 시크, 효과 OFF, 중단, 페이지 종료를 확인했다. 효과 OFF에서도 원본 5검은 남겨 접점을 볼 수 있다. |
| 10 결과·증빙 보존 | 본 README, 모든 원본/프롬프트/해시/반려 이력, 재현 스크립트, 1배속 WebM 2개와 검수 PNG. `review-v2.json`에 변경과 상태를 기록한다. |
| 11 사용자 시각 승인 | **대기.** 첫 천검 포위는 반려됐으며 V2도 기능 검사 통과를 시각 승인으로 기록하지 않는다. 사용자 확인 전 운영 연결·승인본 잠금 없음. |

## 재현

프로젝트 루트에서 실행한다. `setup-pipeline.mjs`는 최초 복제 이력이며 이후 수정을 덮어쓰므로 다시 실행하지 않는다.

```powershell
node preview/mercenary-cyan-knight-battle-20261020-v1/serve.mjs
# 자산 수정 시에만 재패킹
node preview/mercenary-cyan-knight-battle-20261020-v1/pack-assets.mjs
node preview/mercenary-cyan-knight-battle-20261020-v1/add-vortex.mjs
node preview/mercenary-cyan-knight-battle-20261020-v1/build.mjs
node preview/mercenary-cyan-knight-battle-20261020-v1/verify-assets.mjs
node preview/mercenary-cyan-knight-battle-20261020-v1/qa-browser.mjs
node preview/mercenary-cyan-knight-battle-20261020-v1/record-review.mjs
```

미리보기 조작부는 기존 X 프리뷰를 유지했다. 전투 모션 요청 때 별도 미리보기 UI 이미지 제작으로 범위를 확장하지 않는 `docs/project-ui-image-art-standard.md`의 2026-10-18 규정을 적용했다. 이 시안용 기술을 게임 피해 판정에 연결하는 코드는 포함하지 않는다.
