# 레오넬 — SSS 리미티드 전투 리소스 V1

사용자 요청에 따른 **인간 시절 레오넬 · 인간계 최강의 검사**의 전투 리소스 시안이다. 원화 수정, 몸 동작 36프레임, 별도 효과 84프레임, 고정 원본 검, 전투 멘트 프레임을 기존 V3 전장에서 재생한다. 새 원화·모션·연출은 사용자 시각 검수 대상이다. 운영 코드·계정 지급·획득·전투 수치·출시 활성화는 포함하지 않는다.

## 확인

- [전투 프리뷰](http://127.0.0.1:8985/preview/mercenary-leonel-sss-limited-20261018-v1/)
- [실제 재생 영상](review-v1.webm)
- [리소스 매니페스트](manifest.json)
- [최종 원화 시안](assets/sources/leonel-final-art-v1.png)
- [대기 원본 크기 확인](qa/idle-01-native-size.png), [공격 원본 크기 확인](qa/attack-04-native-size.png)
- [기술 자산 검사](qa/asset-qa-report.json), [PC 재생 검사](qa/desktop-runtime.json), [모바일 재생 검사](qa/mobile-runtime.json)

## 캐릭터 크기와 검

최신 사용자 지시 **“크기줄어들게하지마라 이대로 유지해서 만들어”**와 첨부 시트를 [크기 고정 기록](user-body-size-lock.json)에 보존했다. 원본 대기 신체 기준 **610px**를 모든 동작에 공통 적용한다. 무릎을 굽힌 동작은 보이는 높이가 낮아지는 그대로 두며, 바운딩 박스 높이에 맞춰 확대하지 않는다. 검·망토를 넣기 위해 캐릭터를 줄이는 대신 **1280×1280 투명 셀**을 사용한다. 3열 아틀라스의 최대 크기는 3840×3840이다.

생성 원본 시트의 배치 여백과 최종 전투 인체 크기는 구분한다. 패킹에서는 각 시트의 정자세 신체 기준을 같은 610px에 맞춘다. 원본 크기 확인 PNG는 최종 분리 프레임에 어두운 배경을 합성하고 빈 여백만 잘랐으며 추가 리사이즈하지 않았다. 탐색용 썸네일은 원본 자산이 아니다.

검은 [최종 원화](assets/sources/leonel-final-art-v1.png)의 보이는 검날·가드 **39,256픽셀**을 그대로 선택했다. 몸 동작에는 짧은 손잡이만 그렸고, 모든 동작에 [동일 검 래스터](assets/locked/leonel-sword.png)를 회전·균일 배율·이동만 적용했다. 원화 신체 1120px 대비 파지점부터 검끝 약651px 비율을 유지한다. 무기 출처·원본 픽셀 동일성과 좌표는 [출처 기록](assets/locked/weapon-provenance.json), [등록 좌표](asset-registration.json)에 있다.

## 동작과 효과

| 구분 | 이름 | 몸 프레임 | 흐름 |
| --- | --- | ---: | --- |
| 대기 | 검의 경지 | 4 | 호흡·중심 유지·망토의 무게 |
| 일반 공격 | 백은일섬 | 8 | 간격 포착 → 허리 회전 → 횡베기 → 회복 |
| 대시 | 섬보 | 8 | 뒤꿈치 압축 → 수평 가속 → 제동 → 망토 잔향 |
| 일반 스킬 | 절명삼연 | 8 | 사선 베기 → 올려베기 → 수평 마무리 |
| 광역기 | 전선 절단 | 8 | 중심 압축 → 회전 검격 → 전장 검압 → 지연 지면 파열 |

대기 아우라, 배경 검압, 돌진 잔향, 단일 검격, 교차 연격, 전장 절단, 지면 파열의 **7종 × 12프레임 = 84개 효과**를 따로 그렸다. 성역·신벌·마법진·소환검을 사용하지 않는다. 잔상은 같은 시계에서 과거의 실제 몸·검 프레임을 샘플링한다. 지면 돌과 먼지는 일반 알파 합성으로 질량을 유지한다.

전용 백은·금장·흑철 멘트 프레임을 실제 전장에 연결했다. 한국어 이름·등급·대사는 DOM이며 이미지에 굽지 않았다. 모바일에서는 9-slice로 장식 끝단을 보존한다. 검수 버튼용 이미지는 만들지 않았다.

## 원본·프롬프트

모든 그림은 **내장 ImageGen**으로 생성했다. Python·CSS로 그림을 대체하지 않았다. 기술 스크립트는 원본 검 픽셀 선택, 알파/피벗 등록, 동일 검 합성, 프레임/아틀라스 패킹과 검수용 배경 합성만 수행한다.

- [몸·원화 생성 호출 및 원본 해시](source-generation.json)
- [효과·멘트 생성 호출 및 원본 해시](sources-fx-generation.json)
- [실제 프롬프트 모음](prompts/)
- [사용자 선택 원화](assets/sources/user-selected-art-v12.png)
- [사용자 크기 기준 첨부](assets/sources/user-body-size-lock-20261018.png)
- [동작·연출 설계](production-plan.json)
- [반려된 몸 시트 경계 기록](qa/source-sheet-v1-boundary-rejection.json)

원본과 반려 이력은 덮어쓰지 않는다. 프레임별 파지점·발바닥·검끝·균일 배율·원본 해시는 매니페스트와 등록 파일에 기록했다.

## 기존 엔진 재생

[LeonelFX.js](source/LeonelFX.js)는 기존 V3 BattleEngine, 용병 슬롯, BattleCharacter, 아트 어댑터, 카드 도크·진형·카메라·효과 레이어를 사용한다. [빌드 기록](build-report.json)에 PixiJS 8.20.0 한 벌, GSAP 3.13.0 한 벌과 실제 공용 모듈 목록을 남겼다. V3에 등록한 GSAP 타임라인 하나가 몸·효과·이동·잔상·반동을 함께 제어한다.

물리 검격과 광역 검압의 시각 이벤트를 분리한다. 적중을 맞추려고 캐릭터를 공중으로 옮기거나 검날을 휘지 않는다. 실제 피해·대상·승패·보상을 재계산하지 않는 로컬 전투 자산 시연이다.

## 재생 검수

실제 PC 1440×1000, 모바일 390×844 뷰포트에서 재생했다. 모바일 콘텐츠 폭은 스크롤바를 제외한 375px이며, 실제 모바일 미디어 조건과 전투 엔진 모바일 모드가 모두 적용됐다. 다섯 물리 적중 지점의 검날 교차와 지면 오차 0, 0.25·0.5·1·2배속, 일시정지, 중단 시 임시 효과·잔상·등록 타임라인 해제, 가로 넘침 없음을 확인했다.

- PC: [대기](qa/desktop-idle.jpg), [이펙트 OFF 적중](qa/desktop-contact-fx-off.jpg)
- 모바일: [대기](qa/mobile-idle.jpg), [이펙트 OFF 적중](qa/mobile-contact-fx-off.jpg), [광역기](qa/mobile-ultimate.jpg)

원본 크기 몸체와 실제 전장 캡처를 별도로 확인했다. 이 결과는 제작자 기술·시각 검수이며 사용자 최종 승인과 구분한다.

## 재현

프로젝트의 설치된 의존성을 사용한다. 이 작업 트리에 node_modules가 없으면 빌더는 원래 체크아웃의 설치를 참조한다.

```powershell
node preview/mercenary-leonel-sss-limited-20261018-v1/build-assets.mjs
node preview/mercenary-leonel-sss-limited-20261018-v1/qa-assets.mjs
node preview/mercenary-leonel-sss-limited-20261018-v1/build.mjs
node preview/mercenary-leonel-sss-limited-20261018-v1/serve.mjs
```

실제 브라우저에서 “제작·재생 기록”의 제어 검사·영상 녹화를 수행한다. 해당 로직은 [ReviewTools.js](source/ReviewTools.js)에 보존했다. PC·모바일 JSON과 영상은 이 폴더에 저장한 뒤 다음 검증을 실행한다.

```powershell
node preview/mercenary-leonel-sss-limited-20261018-v1/qa-runtime.mjs
```

## 필수 제작 공정 대응

| 단계 | 실행 및 증빙 |
| --- | --- |
| 01 원본 고정 | 사용자 원화·크기 첨부 원본, source-generation.json, user-body-size-lock.json |
| 02 동작 설계 | production-plan.json, motion.mjs의 시간·포즈·적중·회복 |
| 03 몸 연속 작화 | assets/sources/body-*.png, prompts/body-*.json; 실제 관절·망토 변화 |
| 04 동일 무기 합성 | 고정 검·원본 픽셀 출처, build-assets.mjs, asset-registration.json |
| 05 효과 연속 작화 | 7종 효과 원본·프롬프트·선택/반려 기록 |
| 06 패킹 | 610px 신체·1280 셀, 각 프레임 발/손/검끝·알파·해시 |
| 07 접점·지면 | 실제 전장 물리 적중과 지면 오차, 이펙트 OFF 검수 |
| 08 공용 재생 | 기존 V3/PixiJS/GSAP, 실제 용병 슬롯·도크·진형, build-report.json |
| 09 PC·모바일 | qa/desktop-runtime.json, qa/mobile-runtime.json, 화면 캡처·review-v1.webm |
| 10 재현 자료 | 원본·프롬프트·해시·빌더·좌표·검사·영상 보존 |
| 11 사용자 시각 검수 | **검수 대기**. 기술 검사 통과를 사용자 승인으로 기록하지 않음 |

X-BODY V2의 실제 영상과 공정 기준을 확인한 뒤 제작했다. 그 외형이나 동일한 6연격을 복제하지 않고 레오넬의 절제된 인간 검술과 전장 검압으로 설계했다. 사운드는 이번 작업 범위에 없으며 시연은 무음이다.
