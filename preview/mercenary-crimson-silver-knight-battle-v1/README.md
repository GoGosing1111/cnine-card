# 은백·금색 대검 기사 — 전투 리소스 검수

## 2026-10-01 후속 파지 승인과 검신 수정

현재 정지 시안은 `assets/knight-sd-v14-original-blade-approved-grip.png`다. 사용자가 V12의 손등이 보이는 낮은 한손 파지를 승인하고, 작아진 검신과 새로 생긴 긴 칼끝 돌출부를 지적했다. V12 원본은 `assets/user-approved/forward-grip-approved-v12.png`에 보존하며, **승인 범위는 손과 팔의 파지뿐**이다. 기록은 `grip-approval-20261001.json`이다.

V14는 승인된 손 픽셀을 전경에 그대로 두고, 기존 `assets/weapon/sword-original.png`를 원래 몸 대비 **배율 1.0**으로 합성했다. 검 전체의 강체 회전·이동만 적용했으며 길이와 폭을 따로 늘리거나 손잡이·검끝을 다시 그리지 않았다. 기존 짧은 루비 말단과 양쪽 갈고리는 원본 픽셀이다. 교체 전 검이 가렸던 몸·망토 부분만 내장 ImageGen으로 복구했다. 원본 파지 이미지와 최종 손의 불투명 픽셀을 비교한 결과 및 검 해시·알파·패딩 확인은 `qa/blade-v14-report.json`에 있다. 확대 검수는 `qa/blade-v14-grip.png`, 전신은 `qa/blade-v14-full.png`다.

재합성: `node preview/mercenary-crimson-silver-knight-battle-v1/restore-original-sword-v14.mjs`. 입력과 프롬프트는 모두 이 폴더에 보존했다. 최신 프롬프트는 `prompts/user-reference-forward-grip-v12.txt`와 `prompts/approved-grip-body-layer-v14.txt`다. V14 검신 수정본은 사용자 시각 승인 대기다.

아래 V2 전투 프리뷰의 108개 모션은 사용자가 파지와 스킬 동작을 반려했다. 과거 기술 검사는 시각 승인으로 취급하지 않으며 `manifest-rejected-grip-motion-v2.json`에 보존했다. 모션 재작업 및 캐릭터 주변 광원의 채도 강화 요청은 남아 있다. 이번 정지 이미지 수정으로 전투 재작업 완료·SD 최종 승인·운영 연결을 보고하지 않는다. 기존 운영 원화 승인과 런타임은 수정하지 않았다.

## 이전 V2 전투 프리뷰 기록 — 시각 반려

2026-10-01. 사용자가 지정한 종결 용병의 대시·대검 공격·스킬·궁극기 시안이다. 베르칸·크라이베른·라그니엘의 제작 방식처럼 독립 프리뷰에서 실제 공용 V3 전장으로 재생한다. 이름·등급·성능 수치·스킬 배정·운영 전투 연결은 확정하지 않았다. 카드 원화의 기존 V8 승인은 보존하며, 이번 SD·모션·이펙트는 `USER_REVIEW_PENDING`이다.

```powershell
node preview/mercenary-crimson-silver-knight-battle-v1/serve.mjs
```

시연: http://127.0.0.1:8850/preview/mercenary-crimson-silver-knight-battle-v1/

`qa/ultimate-preview.webp`는 최종 크기의 실제 V3 전장 재생을 기록한 애니메이션이다. `record-demo.mjs`로 다시 기록할 수 있으며, 영상 캡처 프레임을 새 작화 프레임 수에 포함하지 않는다.

## 승인 디자인과 대검 보존

- `assets/user-approved/knight-base-approved.png`: 사용자 첨부 승인 디자인, SHA-256 `967113CDD1619DB498C7BE466E5F4608D2DE4B3120DE7534B3BA5C22B32CBADE`.
- `assets/user-approved/idle-sheet-approved.png`: 사용자 첨부 대기 8프레임, SHA-256 `DD1AA28B7BA3AC3DAB291C6037A1C3280CA83DE221D8C5930ECC60B5335507D5`.
- 역사적 승인 원화: `assets/ui/project-v/mercenaries/approved-20260930/crimson-silver-knight-source-art-approved-v8.png`, SHA-256 `8B94E60670355AF87D13802FD68AD4DE22F8E7F23C65028CC97DD1D1F78BE838`. 원본과 승인 JSON을 수정하지 않았다.
- 위 승인 사본들은 재인코딩하지 않았다. 방향 참고 사진은 검이 오른쪽 아래를 향하는 방향에만 사용했다.
- 머리를 키우지 않은 성인 자연 비율, 은백·금색 판금과 루비, 붉은 망토, 눈을 물리적으로 가리는 투구, 노출된 하관, 마스크·눈빛 효과 없음, 평평한 판금 부츠를 유지한다.

대검은 이미지 생성으로 다시 그리지 않는다. `extract-original-weapon.mjs`가 승인 이미지에서 한 번 선택한 `assets/weapon/sword-original.png`를 모든 프레임에 합성한다. 검의 SHA-256은 `A31B35AAD0800C06516BC7EF1BE9F0243ACCA5782D8C70F53C4041A8304661E7`이다. 유지되는 RGB 158,452픽셀은 승인 이미지와 정확히 같다. 손에 가려진 손잡이 구간은 원본 가림 구간으로 남겨 두고, 새 포즈의 실제 장갑 픽셀을 검 위에 배치한다. 변환은 검 전체의 균일 배율·회전·이동만 허용한다. 원본의 갈고리·루비 칼끝, 곧은 평행 검날, 중앙 축과 가드는 동일하다.

현재 한손 기본 자세는 `assets/knight-sd-v6-original-sword.png`이다. 무기 없는 몸과 닫힌 오른손을 그린 뒤 원본 대검을 허리 앞에서 오른쪽 아래 방향으로 합성했다. V4·V5와 부츠가 잘린 첫 공격 시안은 `rejections.json`에서 제외 사유를 기록하고 재료로 사용하지 않는다.

## 실제 연속 프레임

| 캐릭터 모션 | 프레임 | 이펙트 | 프레임 |
|---|---:|---|---:|
| 대기 | 8 | 아우라 | 12 |
| 대검 준비 | 16 | 대시 | 12 |
| 대검 공격 | 16 | 참격 | 16 |
| 회복 | 12 | 방벽 | 12 |
| 대시 | 8 | 마력 집중 | 12 |
| 방어 | 8 | 집행 | 16 |
| 피격 | 8 | 궁극기 폭쇄 | 16 |
| 쓰러짐 | 8 | | |
| 시전 | 12 | | |
| 궁극기 | 12 | | |
| **합계** | **108** | **합계** | **96** |

몸·팔·어깨·다리·망토가 실제로 달라지는 108개 포즈와, 형성이 달라지는 96개 효과 프레임이다. 원본 검의 회전·합성, 같은 효과의 다른 위치 재생, 교차 페이드, 잔상은 추가 작화 프레임으로 세지 않는다. 이동 모션은 걷기가 아닌 단거리 폭발적 대시다.

`assets/source/`에 내장 ImageGen 출력의 RGBA 원본을 보존했다. `prompts/`에 실제 생성 입력을, `asset-specs.json`에 한손 접점과 검 각도를 기록했다. 셀 경계를 넘는 포즈는 알파 연결 요소로 분리한다. 대기·대시 원본의 연속 흰색 그리드 선만 작업 버퍼에서 제거하며 원본 파일을 덮어쓰지 않는다. `assets/frames/`에 개별 512×512 RGBA PNG, `assets/*-atlas.png`에 검수용 시트, 동일 프레임의 lossless WebP에 런타임 아틀라스를 저장했다. 각 프레임의 출처·해시·손·발·검끝·균일 배율은 `manifest.json`에 있다.

## 공용 렌더러와 타격

PixiJS **8.20.0**, GSAP **3.13.0**은 프로젝트의 기존 잠금 버전을 사용한다. 별도 Pixi Application·CDN·라이브러리·애니메이션 시계를 만들지 않았다.

- 실제 구현: `source/KnightFX.js`, `source/preview.js`, `skill.mjs`.
- 기존 V3: `preview/project-v-v3/source/project-v-pixi-battle.src.js`, `battle/BattleEngine.js`, `battle/BattleCharacter.js`, `battle/CameraController.js`.
- GSAP 타임라인 하나를 `engine.simpleTimelines`에 등록하고 프레임·이동·효과·카메라 진동을 함께 제어한다. 일시정지·배속·탐색·중단·대상 소멸과 종료 정리는 같은 시계를 사용한다.
- 프레임별 실제 몸 높이를 기준으로 표시 크기를 맞춘다. 포즈 시트의 패킹 배율이 달라도 원본 대검의 몸 대비 길이는 변하지 않는다.
- 후속 사용자 지시의 크라이베른 전장 표시 크기를 적용했다. 크라이베른의 실제 몸 높이는 `380 × 1030 / 1254 ≈ 312.12`, 기사 최종 몸 높이는 `358 × 1452 / 1664 ≈ 312.39`다. 투명 여백을 제외하고 약 0.1% 차이로 맞췄으며, 캐릭터·대검·아우라는 균일하게 커진다. 최초 25% 확대 요청 뒤에 주어진 크라이베른 크기 기준을 최종 기준으로 기록한다.
- 발은 각 셀의 `(256,440)`에 등록하고 실제 V3 좌표를 사용한다. 첫 참격은 적 몸통 높이 46%, 내려찍기는 적 발밑에 검끝을 맞춘다.
- 대검 공격 **1.00초** / 공격 프레임 6, 홍련 집행 **1.00·2.25초**, 전장 심판 **2.10초** / 궁극기 프레임 7, 종결 집행 **1.42·3.25초** / 공격 6·궁극기 7.
- 궁극기는 집중 → 대시 → 참격 → 대검 준비 → 내려찍기 → 거대한 결정 폭쇄와 충격파 → 파편·잔광 → 복귀의 순서다. 크게 그려진 전용 효과를 세 적 위치에 재생하고, 마지막 충돌에 공용 카메라 진동을 넣는다.
- 아우라는 현재 포즈의 실제 알파를 따라가는 18개 실루엣, 중간 버퍼를 지우는 두 BlurFilter(`legacy:true`), 전용 12프레임 아우라를 겹친다. 투구 눈은 발광하지 않는다.
- 실제 도감 카드 ID 5개와 공용 아트 어댑터·카드 프레임을 사용한다. 용병은 별도 진형 슬롯에 두며 일반 카드 5개 배열에 추가하지 않는다. 원화와 SD는 분리한다.

이 프리뷰는 피해·승패·HP를 계산하거나 API·경제 데이터를 쓰지 않는다. `V-996`은 독립 프리뷰용 식별자다. 운영 로스터에 등록하지 않는다.

효과음은 선택 재생이며 기존 승인 V3 Combat SFX의 실제 녹음·폴리 합성 자산을 재사용한다. `source/CueAudio.js`와 `manifest.audio`에 원음 ID·해시·기존 Mixkit 라이선스 기록 및 동기점(대시 178ms, 검격 250ms, 궁극기 333ms)을 남겼다. 오실레이터·절차적 노이즈를 새로 만들지 않았다.

## 검수와 다시 빌드하기

```powershell
node preview/mercenary-crimson-silver-knight-battle-v1/build-assets.mjs
node preview/mercenary-crimson-silver-knight-battle-v1/prepare-preview.mjs
node preview/mercenary-crimson-silver-knight-battle-v1/build.mjs
node --test preview/mercenary-crimson-silver-knight-battle-v1/qa.test.mjs
node preview/mercenary-crimson-silver-knight-battle-v1/qa-browser.mjs
```

변경 범위의 검사만 수행했다. `qa-report.json`과 `qa/browser-report.json`에 결과, `qa/`에 PC·모바일의 실제 전장 캡처를 저장한다. 승인 원본·원본 검 RGB·204개 파일의 알파와 패딩·한손 합성의 균일 검 길이·타격 좌표·배속·일시정지·중단·대상 소멸·실루엣 추적·종료 정리를 확인한다. 프리뷰 종료 시 일반 카드의 기존 애니메이션 어댑터도 먼저 정리하여 파괴된 Pixi 노드에 GSAP이 접근하지 않게 한다. 시각 품질의 최종 승인은 사용자에게 남아 있다.

이번 결과는 독립 시안이므로 게임 런타임 배포와 운영 활성화를 수행하지 않는다. 다른 용병·기존 승인본·미승인 SSS 보존 자산을 수정하지 않는다.
