# WORKSHOP / 완성의 순간

2026-09-08 · 제작 연출 독립 검수본 · **게임 제작 화면 연결 전 사용자 승인 대기**

## 검수

- `/preview/workshop-assembly-v1/` — H-BODY 조립
- `?mode=vehicle` — 차량 생산 라인 (람보르기니 베네노 샘플)
- `?mode=suit&t=5.7` — 팔 결합 장면 정지 검수
- `?mode=vehicle&t=8.1` — 차체 용접 장면 정지 검수
- `?mode=vehicle&result=failure&play=1` — 실패 시퀀스
- 성공/실패, 재생, 일시정지, 건너뛰기, 0.5×/1×/2×, 음소거, 모션 줄이기, 모바일 보기, 프레임별 슬라이더 제공.

프리뷰 재생은 재화를 사용하지 않으며 아이템을 지급하지 않는다. 실제 `workshop/craft` 요청, 서버 판정, 중복 차감 방지, 제작 확률·제작비·지급 로직은 변경하지 않았다. 현재 시안의 H-BODY/베네노는 외형 샘플이며 새 제작법 공개가 아니다. 다른 CMS 차량의 독립 부품 좌표는 이 샘플 좌표로 임의 대체하지 않는다.

## 각각 다른 제작 문법

배틀슈트: 하체 2개 → 골반 → 흉부 → 견갑 → 팔 → 헬멧 → 코어 장착 → 검사 → 국소 코어 점화. 승인된 H-BODY 원본을 10개 RGBA 부품으로 손실 없이 분리한다. 전 픽셀 합산·중복 여부 회귀 검증으로 원본의 정확한 복원을 확인한다. 총기·승인 V3 무장 스프라이트는 재생성하거나 변경하지 않았다.

차량: 컨베이어 차체 프레임 진입 → 크레인 엔진 탑재 → 2개 휠 결합 → 외장 하강/결합 → 이동 용접 → 검사 → 엔진 시동/헤드램프 → 출고 전진. 기존 프레임·엔진 재료 원본을 사용한다. 차량 완성 컷은 기존 베네노 원화에서 이미지 생성 도구로 배경을 분리한 **프리뷰 파생본**이며 기존 차고 원본을 대체하지 않는다.

실패는 마지막 검사 단계에서 분기한다. 성공 점화/출고 대신 낮은 붉은 경고광과 제작 실패 상태를 표시한다. 입력된 판정을 재추첨하지 않는다.

## 실제 구현 / 단일 시계

- `source/AssemblyFilm.js`: PixiJS Application, Container, Sprite, Graphics, alpha masks, BlurFilter, 실제 부품·로봇 팔 레이어, 용접 입자/검사선/점화광. 기존 **`/js/ui-fx-vendor-v2045.bundle.js`** 재사용, 추가 PixiJS·GSAP 번들/외부 CDN 없음.
- `source/contract.mjs`: 불변 확정 결과 계약, 두 종류의 9단계 시퀀스.
- `source/preview.js`: 독립 검수 UI. `WorkshopAssemblyPreview.diagnostics()` 제공.
- 잠금 버전: **PixiJS 8.20.0 / GSAP 3.13.0** (`package-lock.json`, `build-report.json`).
- **13.4초짜리 GSAP 타임라인 하나**가 모든 부품 좌표/투명도/카메라/검사선/반응광과 Pixi 렌더 프레임을 제어한다. Pixi 자동 ticker는 OFF. 입자는 playhead 기반의 고정 수식으로 재현한다. 파티클 최대 28개 부유광 + 결합 충돌당 18개, 렌더 해상도 DPR 최대 2.
- `pause`/배속/seek/skip은 같은 타임라인을 사용. 모드 전환은 이전 타임라인 kill, 장면 객체 destroy, 음원 stop. 화면 이탈은 resize observer 및 리스너 해제, AudioContext 종료, Application 파괴. 공유 texture/source는 파괴하지 않는다. 백그라운드 진입은 일시정지.
- 모션 줄이기는 OS 설정을 초기 반영하고, 즉시 확정 결과를 보여준다. 흔들기·점멸·전체화면 플래시 없음.

### 시간 / 접점

논리 장면 1440×900, 화면 크기에 따라 동일 비율 fit. 좁은 세로 화면에서는 슈트와 차량의 가상 폭을 각각 780/1280으로 분리해 중요 실루엣을 보존한다.

| 연출 | 시점 | 접점/동작 |
| --- | --- | --- |
| 슈트 | 1.95 / 2.35초 | 양쪽 하체 결합 |
| 슈트 | 3.55초 | 흉부 장착 (754,341) |
| 슈트 | 4.9 / 5.3초 | 양 견갑 장착 |
| 슈트 | 5.85 / 6.25초 | 양 팔 결합 |
| 슈트 | 7.1초 | 헬멧 잠금 (758,211) |
| 슈트 | 8.2초 | 코어 삽입 (758,287) |
| 차량 | 3.35초 | 엔진 결합 (810,410) |
| 차량 | 4.9 / 5.45초 | 전/후 휠 결합 |
| 차량 | 6.85초 | 외장 결합 |
| 차량 | 7.2~8.8초 | 차체를 따라 이동하는 용접점 |
| 슈트 / 차량 | 8.7~9.8초 / 9.2~10.1초 | 검사선 통과 |
| 공통 | 10.3초 | 입력 결과에 따른 성공/실패 분기 |
| 공통 | 12초 | 결과 오버레이 |

## 음원

`assets/audio/manifest.json`에 원음 URL, 출처 페이지, 라이선스 URL, 자산 ID, SHA-256을 기록한다. Mixkit의 녹음된 Car door slam(1564), Garage pneumatic screwer(817), Car start ignition(1559), Failed car ignition(1540) 사용. [원음 페이지](https://mixkit.co/free-sound-effects/car/) · [Sound Effects Free License](https://mixkit.co/license/#sfxFree).

오실레이터/절차적 노이즈/삑음 없음. WAV 원본을 그대로 보존하고 재생 시 절단·게인·8ms 어택·70ms 릴리스만 적용한다. 체결음은 디코딩한 PCM 최대 피크를 찾고 최대 80ms 전행을 두어 위의 시각 결합 접점에 맞춘다. Web Audio는 GSAP playhead에서 재예약하며 일시정지·건너뛰기·뷰 이탈 시 모두 stop한다. 사운드는 사용자 클릭 이후만 켜진다.

## 생성/빌드

1. 생성 이미지 원본과 프롬프트: `PROMPTS.md`. 원본을 덮어쓰지 않고 이 프리뷰 자산으로 복사했다.
2. `node preview/workshop-assembly-v1/build.mjs` — 원본 H-BODY의 손실 없는 부품 분리, 생성된 로봇 팔 키트 행 분리, shared-vendor 기반 esbuild 번들, 버전/해시 보고서.
3. 음원 재수급이 필요할 때만 `node preview/workshop-assembly-v1/fetch-sound-assets.mjs`.
4. `node --test tests/workshop-assembly-preview-v1.test.mjs`.
5. 프로젝트 전체 `npm run release:gate`, 범위 커밋 후 `npm run deploy:production`만 사용.

검증: 결과 계약/분기, H-BODY 전체 RGBA 원본 복원, 차량·기계 팔 실 알파, 음원 해시, 제작 API 비연결, 실제 GSAP/Pixi 객체로 재생·정지·배속·seek·skip·재시작·모드 전환·폐기 검증. 브라우저 검수 결과는 `qa-report.json`에 기록한다.

게임 연결 승인 후에도 서버 응답을 먼저 확정하고 이를 연출에 전달해야 한다. 요청 재시도와 보상 처리는 연출 수명과 분리하며, 승인 전 `js/workshop-v1881.js`에 연결하지 않는다.
