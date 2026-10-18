# 레오넬 — SSS 리미티드 전투 리소스 V2

사용자가 지적한 공격 얼굴·위압감과 주변 아우라를 교체한 전투 자산 검수본이다. 흑청·자주색 검압, 진주빛 검날 궤적과 절제된 금빛을 사용한다. 원화의 성인 얼굴·갑옷·검 디자인과 **610px 신체 기준**을 유지했다.

[실제 전투 프리뷰](http://127.0.0.1:8985/preview/mercenary-leonel-sss-limited-20261018-v2/) · [V2 최초 시연 영상](review-v2.webm) · [전체 자산 목록](manifest.json)

2026-10-18 후속: 기본 검압 두 겹의 기준점을 캐릭터 발밑으로 옮겨 이동 중에도 붙도록 수정했다. 불투명도는 아우라 68%→78%, 배경 검압 30%→40%다. 이미지·캐릭터/효과 크기·모션/효과 속도는 유지했다. [PC·모바일 위치 확인](qa/pressure-attachment-20261018.json), [PC 화면](qa/desktop-pressure-attached.png), [모바일 화면](qa/mobile-pressure-attached.png)에 현재 번들 검수를 기록했다. 아래 최초 V2 종합 검사와 영상은 이 위치 조정 이전 증빙이다.

## 이번 결과

- 몸 동작 **40장**: 대기 4, 대시 8, 일반 공격 8, 일반 스킬 8, 광역기 12.
- 별도 효과 **84장**: 아우라·배경 검압·돌진 잔향·단일 검격·교차 검격·전장 절단·지면 파열 각 12장.
- 각성 얼굴/상반신 컷인 **4장**. 전체 원화를 확대하는 대신 네 장의 연속 작화와 실제 전투 동작을 연결했다.
- **공격 몸 동작 2×, 스킬 효과 1×**. 대기·대시 몸 동작은 1×다. 검수용 배속 선택은 몸/효과 전체의 시연 시간을 함께 바꾼다.
- 기본 전투력 **1,940,890 사용자 확정**: 족로 1,617,408의 120%를 정수 반올림한 값이다. [확정 기록](combat-power-confirmation.json)에 사용자 답변을 보존했다. 이번 확정 범위는 기본 전투력이며, 다른 밸런스 수치·새 리소스 시각 승인·운영 활성화는 포함하지 않는다.
- 기존 전용 백은·금장·흑철 대사 프레임에 한국어 대사를 DOM으로 연결했다.

새 공격·일반 스킬·광역기 몸 작화를 사용한다. 대기·대시와 고정 검은 기존 리소스를 보존했다. 전투력 정책은 [combat-profile.mjs](combat-profile.mjs)에 있으며 운영 코드·획득·계정 지급·라이브 전투 등록은 아직 없다.

## 연출 흐름

| 구분 | 몸 프레임 | 순서 |
| --- | ---: | --- |
| 대기 / 검의 경지 | 4 | 고요한 흑청 검압, 호흡·망토 |
| 백은일섬 | 8 | 간격 포착 → 빠른 횡베기 → 검기 잔향 |
| 섬보 | 8 | 발끝 압축 → 수평 돌파 → 제동 |
| 절명삼연 | 8 | 사선 검격 → 올려베기 → 수평 마무리 |
| 검극 · 전선 단절 | 12 + 컷인 4 | 전장 암전·얼굴 각성 → 중심 압축 → 육신의 일검 → 전장 절단 → 지연 파열 → 검 회수 |

궁극기 총 시연 시간은 4.25초다. 실제 검날 접점은 1.79초, 광역 검압 접점은 2.29초다. 컷인은 별도 화면 계층에서 재생하며 모바일 카드 도크 위 공간에 배치한다. 성역·신벌·소환검 대신 검사의 몸 동작과 검압을 중심으로 구성했다.

DNF 진 각성은 준비→공격→마무리의 연출 밀도를 참고했다. 공식 참고: [NEO: Blade Master](https://www.dfoneople.com/news/updates/1682/SLAYER(M)-NEO:-AWAKENING/NEO:-BLADE-MASTER). 해당 게임의 이미지 자산을 가져오거나 스킬을 그대로 복제하지 않았다.

## 크기와 원본 검

사용자 크기 기준은 [첨부 보존 기록](user-body-size-lock.json)에 있다. 모든 몸 프레임은 정자세 신체 기준 610px, 투명 셀 1280×1280이다. 웅크린 자세의 실루엣을 억지로 610px로 늘리지 않는다. 궁극기 12장을 두 페이지로 나눠 각 GPU 텍스처를 3840px 이내로 유지했다. 검·망토를 넣으려고 캐릭터를 축소하지 않았다.

[고정 검](assets/locked/leonel-sword.png)은 최종 원화의 원래 보이는 검날·가드 **39,256 RGBA 픽셀**이다. 같은 래스터에 전체 균일 배율·회전·이동만 적용했다. 새로 그린 무기 픽셀은 0이다. 몸 시트에는 손과 짧은 파지용 손잡이가 있으며 무기 외장은 새로 생성하지 않았다.

검 SHA-256: `c932515485dadcd0a0d3826f37f42f5b29a43311ab0104f390c5347e3ffe2894`

실제 전투 화면의 카메라 확대/광역 구도와 원본 픽셀 크기는 별개다. [대기 원본 크기](qa/idle-01-native-size.png), [수정 공격 원본 크기](qa/attack-04-native-size.png), [광역기 타격 원본 크기](qa/ultimate-06-native-size.png)는 빈 여백 자르기와 검수 배경 합성만 했다.

## 제작·수정 이력

모든 새 그림은 **내장 ImageGen**으로 제작했다. [몸·컷인 생성 기록](source-generation.json), [FX 생성 기록](sources-fx-generation.json), [실제 프롬프트](prompts/)에 입력·원본·선택/반려 이유·해시를 기록했다. 이전 후보들은 해당 버전 폴더와 색인에 보존했다.

발견한 결함과 조치:
- 공격 4번의 여분 팔: ImageGen으로 해당 부분을 수정했다.
- 일반 스킬 3번 발끝이 다음 셀에 섞이던 현상: 원본 전체 실루엣을 보존하도록 셀 경계를 등록했다.
- 교차 검격의 셀 침범: ImageGen으로 분리 여백을 수정했다.
- 지면 파열의 불균일 행 간격: 원본 픽셀을 그대로 추출해 동일 지면 기준의 셀로 재배치했다. [패킹 기록](qa/fracture-packing.json)에 좌표와 원본 해시가 있다.
- 컷인 어깨의 직각 경계: 원본 얼굴 작화를 보존하고 런타임의 사선 컷인 구도로 마감했다. 별도 생성한 경계 수정 후보는 선택하지 않았다.

검 픽셀 선택·동일 검 합성·알파/피벗 등록·아틀라스 패킹·검수용 합성만 기술 스크립트로 수행한다. 그림을 Python/CSS 도형으로 대신하지 않는다.

## 실제 전장 검수

기존 V3 BattleEngine·용병 슬롯·진형·카드 도크를 사용했다. 번들에는 PixiJS 8.20.0과 GSAP 3.13.0이 각각 한 벌이다. 등록된 GSAP 시계 하나가 몸·이동·효과·컷인·잔상·반동을 함께 제어한다.

PC 1440×1000, 모바일 390×844의 실제 브라우저 전장에서 재생했다. 새 브라우저 프로필의 headless Chrome을 사용했으며 실제 모바일 기기 검수와 구분한다. 도구 브라우저는 세션/커널 오류로 사용할 수 없어 프로젝트의 기존 Playwright 검수 방식을 적용했다.

- [자산 검사](qa/asset-qa-report.json): 40/84/4 프레임, 원본 검 동일성, 알파, 피벗, 텍스처 페이지.
- [속도 검사](qa/motion-rates.json): 몸 시각 진행은 2배, 기존 FX 11구간의 길이는 V1과 동일.
- [PC 재생](qa/desktop-runtime.json), [모바일 재생](qa/mobile-runtime.json): 물리 검격 다섯 접점, 지면 오차 0, 0.25/0.5/1/2배속, 일시정지·중단·종료 정리, 컷인, 가로 넘침, 오류·리소스 누락.
- [PC 컷인](qa/desktop-ultimate-0.6.png), [모바일 컷인](qa/mobile-ultimate-0.6.png), [광역기](qa/desktop-ultimate-2.65.png).
- [실제 캔버스 녹화](review-v2.webm)는 무음이며 DOM 대사창/카드 도크는 영상에 굽지 않는다. 프리뷰에서 함께 확인할 수 있다.

기술·제작자 시각 검수와 사용자 승인은 별개다. **사용자 최종 시각 검수 대기, 운영 활성화 OFF**다. V1에서 복사된 과거 보고서나 영상은 V2 검수 증빙으로 사용하지 않는다.

## 재현

이 폴더에서 다음 순서로 실행한다. 설치된 프로젝트 의존성 또는 원래 체크아웃 의존성을 참조한다.

```powershell
node pack-v2-effects.mjs
node register-v2.mjs
node build-assets.mjs
node build-qa-previews.mjs
node qa-assets.mjs
node qa-motion.mjs
node build.mjs
node write-v2-provenance.mjs
node serve.mjs
```

별도 터미널에서 `node qa-browser.mjs`로 PC·모바일 기록과 영상을 만든 뒤 `node qa-runtime.mjs`로 검사한다.

## 공통 제작 공정 증빙

| 단계 | 대응 파일 |
| --- | --- |
| 01 원본 고정 | user-body-size-lock.json, source-generation.json, assets/locked/weapon-provenance.json |
| 02 동작 설계 | motion.mjs, production-plan.json |
| 03 몸 연속 작화 | assets/sources/body-*.png, prompts/, source-generation.json |
| 04 동일 무기 합성 | asset-registration.json, build-assets.mjs |
| 05 효과 연속 작화 | sources-fx-generation.json, assets/sources/fx-*.png |
| 06 패킹 | manifest.json, qa/fracture-packing.json, qa/registration-*-native.png |
| 07 접점·지면 | qa/desktop-runtime.json, qa/mobile-runtime.json, FX OFF 캡처 |
| 08 공용 엔진 | source/LeonelFX.js, build-report.json |
| 09 PC·모바일 | qa-browser.mjs, 화면 캡처, review-v2.webm |
| 10 재현 자료 | 원본·프롬프트·해시·빌더·좌표·검사·영상 |
| 11 사용자 시각 승인 | PENDING, 기존 승인 상태를 자동 승계하지 않음 |
