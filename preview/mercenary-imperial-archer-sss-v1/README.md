# 이름 미정 SSS 궁사 · 주작 V3 리소스

사용자가 첨부 궁사를 SSS로 확정하고 전투 리소스를 요청했다. 최신 색상 지시는 **“진한 발광하는 빨강색으로 해야함”**이다. 주작의 머리·양 날개·긴 꼬리가 캐릭터를 감싸며, 몸과 깃털이 선명한 빨강으로 발광하는 후보를 공용 V3에 연결했다. 이름·코드·리미티드 여부·성능·획득·운영 연결은 미정이다.

- 검수 화면: `index.html`, 실제 1배속 영상: `review.html`.
- 색인: `manifest.json`, 원화/등급 승인과 전투 리소스 승인 구분: `approval-20261014.json`.
- 원화 SHA-256: `211DA5C9AD758CC6167FEF2BD7C997A9CD8EA427C04B6AD37D6613E62277393B`.
- **SD·몸 동작 24장 / 독립 효과 72장**. 아우라 앞뒤 파생 계층은 중복 프레임으로 세지 않는다.
- built-in `image_gen.imagegen`으로 작화했다. 실제 입력·프롬프트는 `prompt*.json`, 원본은 `assets/sources/`에 보존한다.

## 대기 흔들림 수정 V2 · 2026-10-14

사용자 제보: **“왜 캐릭터 대기상태에 주작 이팩트가 촐싹거리면서 위치도 안맞고 흔들려”**. 기존에는 프레임 안의 주작 위치가 다른데 모두 중앙 기준으로 잘라 재생했고, 2.4초 아우라 주기가 4초 대기 재시작과 어긋났다. 몸의 대기 자세도 0.5초마다 교체돼 함께 튀었다. 이전 정지 화면·접점·경계 검수만으로 이 반복 문제를 놓쳤다.

- `aura-registration-v2.json`에서 실제 부리 끝을 기준점으로 등록한다. 캐릭터 발 위치를 기준으로 같은 위치·크기를 유지하며, 카메라는 전체 반복 구간의 공통 영역에 고정한다.
- 연속된 날갯짓 0→1→2→3→2→1을 8초로 연결한다. 나머지 원본 프레임은 보존한다. 실제 작화 사이를 완만하게 보간하고 반복 끝도 같은 첫 자세로 이어진다. 몸은 대기 0번 자세를 유지한다.
- 분리된 투명 계층 내부에서 premultiplied 색상을 보간한 뒤 전장에 정상 합성한다. 원본 붉은 RGB를 그대로 사용하고 뒤 배경에 직접 가산해 빨강을 희석하지 않는다. 앞뒤 알파의 합은 원본과 같다. 발 앞 꼬리 경계는 곡선과 부드러운 알파 분할로 처리한다.
- PC 1440×1080 / 모바일 390×844에서 실제 반복을 녹화했다. 위치·활·카메라 오차는 최대 0.001px 미만, 화면 경계 이탈·콘솔/HTTP 오류 0이다. 배속·정지·취소·대상 소멸·효과 OFF·동작 줄이기 및 사격/광역기에서 대기 복귀를 확인했다.
- 작업 중 반영된 아잔트 공용 전투 소스로 프리뷰 번들을 갱신했다. 동일한 아우라 코드를 유지하며 PC/모바일 부팅·위치·반복 경계·runtimeVersion만 재확인한 최종 번들 증빙은 `qa/idle-v2/rebase-compatibility.json`이다.
- 최신 증빙은 **`qa/idle-v2/report.json`, `qa/idle-v2/*-idle.webm`, `qa/idle-v2/*-pose-*.png`**다. 영상 자체를 재생해 반복 전후까지 확인한 기록은 `qa/idle-v2/video-inspection.json`이다. `desktop-check-*`는 꼬리 경계 최종 수정 전 중간 이력이다.
- 재현: `node preview/mercenary-imperial-archer-sss-v1/qa-idle-v2.mjs`, `node preview/mercenary-imperial-archer-sss-v1/inspect-idle-video.mjs`. 아래 공정 표의 4초·교차 페이드 제외·23.8초 시연은 최초 제작 이력이며 V2가 우선한다. 현재 전체 시연은 27.8초다.
- 배포 기록: `docs/imperial-archer-idle-stability-20261014.md`. 원화·활·몸·원본 효과 작화는 수정하지 않았으며 사용자 시각 승인 대기는 유지한다.

## 11단계 공정과 증빙

| 단계 | 실행 및 증빙 |
|---|---|
| 01 원본 고정 | `assets/sources/source-art-approved.png`를 무가공 보존했다. 얼굴·은발·관·흑금 갑옷·백색 의상·적색 망토·백홍금 활이 식별 기준이다. `approval-20261014.json`과 해시로 고정했다. |
| 02 동작 설계 | `skill.mjs`에 상시 주작 4초, 대시 1.8초, 사격 2.4초, 3연속 주작 비상 4.4초, 천공 화살진→5개 지면 적중→주작 강림 6.8초, 피격 1.7초, 쓰러짐 2.7초를 정의했다. 대시는 낮춤/추진/도약/착지, 사격은 당김/발사/회수, 궁극기는 천공 조준과 회복, 쓰러짐은 무릎과 정착으로 구분했다. |
| 03 몸 작화 | `idle/draw/release/dash/ultimate/defeat.png`는 각각 2×2의 실제 네 자세다. 짧은 파지부만 둔 몸 전용 작화이며 어깨·팔·무릎·망토가 변한다. `body-reference.png`는 정체성 입력이고 런타임 프레임이 아니다. 모든 사용 프롬프트를 함께 보존했다. |
| 04 승인 무기 합성 | `bow-lock.json`→`extract-approved-bow.mjs`로 원화에서 118,312개의 보이는 무기 픽셀을 선택했다. `assets/locked/approved-bow.png`의 SHA-256은 `A659CE4F93FF360284F966403D4E69EE717328D666C635CE729EE926EFD1EDA7`이다. 전 자세에서 같은 원본을 균일 배율 0.279와 회전·이동만으로 합성한다. 손의 앞 계층만 합성하며 활 형태를 새로 그리거나 휘지 않는다. 시위는 등록된 활 끝 두 점과 당기는 손을 연결한다. |
| 05 효과 작화 | 주작 아우라, 화살 응축/사격, 주작 비상, 강림, 지면 파열, 천공 화살진이 각 12장이다. 최신 아우라 원본은 `aura-red-1/2/3.png` 각 2×2로, 날개를 내리고 올리는 실제 자세와 꼬리 변화가 있다. 효과의 실루엣·밀도·파편·소멸이 변한다. 이전 약한 주황 아우라 V1/V2, 금빛 V3, 여백 재제작 전 V4는 이력으로만 보존한다. |
| 06 패킹 | `pose-registration.json`은 발·파지·당기는 손·각도, manifest는 활 방출점/상하 끝점을 보존한다. 몸 기준 360px, 768px 셀, 2×2 아틀라스다. 효과는 원본 셀에 24px 투명 여백을 추가한 4×3 아틀라스다. 주작 앞/뒤 계층은 동일 알파를 상보적으로 나눠 몸 뒤 날개와 발밑 앞 꼬리를 동시에 읽게 한다. 본체 및 아우라 alpha=1, 주작에는 가산 합성/프레임 교차 페이드로 색을 희석하지 않는다. |
| 07 접점/지면 | 등록 활 방출점→적 몸통, 천공 화살→각 대상 발밑, 마지막 주작→전방 적 발밑을 연결했다. `qa/runtime-report.json`의 PC/모바일 각각 10개 접점 오차 0, 지상 동작 지면 오차 0이다. 대시만 명시적 도약을 사용한다. `qa/*-motion-only.png`에서 몸·활을 효과 없이 확인했다. 서버 피해 계산은 없다. |
| 08 공용 V3 | `source/preview.js`는 기존 `mountForBattle`, `BattleCharacter`, 용병 아트 어댑터, 운영 V3 래퍼·진형·카드 도크를 사용한다. 임시 코드 V-000은 프리뷰 메모리에서만 쓴다. `source/ImperialArcherFX.js`의 PixiJS 8.20.0 / GSAP 3.13.0 단일 번들이 실제 렌더링과 시간을 소유한다. 앞/뒤 효과 레이어와 타임라인을 이탈 시 정리한다. 용병 확대는 공용 카메라 기본 위치를 유지하고 피벗·배율만 조절하며 전장 경계 안으로 제한한다. |
| 09 PC/모바일 검수 | 1440×1080 / 390×844에서 7모드 정상 전체 재생, 0.25/0.5/2배속, 정지·탐색·중단·대상 소멸·동작만·동작 줄이기·이탈을 검사했다. `qa/runtime-report.json` PASS, 콘솔/HTTP 오류 0, 효과 화면 경계 이탈 0. 큰 붉은 날개·발밑 꼬리·얼굴·활을 `qa/*-aura-focus.png`에서 직접 확인했다. 확대에서 모바일 배경 위에 생겼던 빈 공간은 카메라 피벗 경계 제한으로 수정했다. |
| 10 재현/보존 | 이 README, 모든 원본/프롬프트, 고정 활, 등록 좌표, 24+72 프레임, 아틀라스, 스크립트, 보고서, 캡처와 23.8초 실제 1배속 PC/모바일 영상을 프로젝트 안에 보존했다. X-BODY 승인 영상도 실제 무음 재생하고 `qa/reference-playback.json`과 네 시점 캡처를 남겼다. 새 영상은 `inspect-video.mjs`로 다시 디코딩 재생했으며 `qa/video-inspection.json`에 실제 시간과 캡처를 기록했다. |
| 11 사용자 시각 승인 | 원화·SSS 확정과 SD·아우라·모션·스킬 후보의 최종 시각 승인을 구분한다. 최신 빨간 주작 후보는 **사용자 시각 승인 대기**다. 기술 통과나 정적 프리뷰 배포를 운영 용병 출시 또는 사용자 최종 승인으로 해석하지 않는다. |

## 재현

저장소 루트에서 설치된 기존 의존성을 사용한다.

```powershell
node preview/mercenary-imperial-archer-sss-v1/extract-approved-bow.mjs
node preview/mercenary-imperial-archer-sss-v1/pack-assets.mjs
node preview/mercenary-imperial-archer-sss-v1/build.mjs
node --test preview/mercenary-imperial-archer-sss-v1/qa.test.mjs
node preview/mercenary-imperial-archer-sss-v1/serve.mjs
# 별도 프로세스에서 필요한 변경 범위만:
node preview/mercenary-imperial-archer-sss-v1/qa-runtime.mjs
node preview/mercenary-imperial-archer-sss-v1/inspect-video.mjs
```

포트 8878. 브라우저 스크립트는 이 기기의 번들 Playwright 경로를 사용하며 Chrome을 무음 실행한다. 사운드는 새로 제작하지 않았고 합성음을 넣지 않았다. 관련 소스·무기·알파·해시·취소 회귀는 지정 scoped 배포 과정에서 한 번 실행하며, 이미 통과한 동일 번들의 브라우저 검수를 반복하지 않는다.

## 이력 해석

`qa/*-first.png`는 반려된 약한 아우라의 최초 비교 캡처다. `qa/*-red-aura*.png`는 확대 카메라 여백 수정 전 비교 자료다. `qa/*-aura.png`, `qa/*-aura-focus.png`, `qa/*-showcase.webm`는 대기 V2 수정 전 자료이며 **현재 대기 기준은 `qa/idle-v2/`의 최종 pose 캡처와 idle 영상**이다. 단순 프레임 개수·해시 차이를 시각 승인 근거로 삼지 않는다. 최초 배포 기록은 `docs/imperial-archer-sss-v3-20261014.md`, 현재 수정 기록은 `docs/imperial-archer-idle-stability-20261014.md`를 따른다.
