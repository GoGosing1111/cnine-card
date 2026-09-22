# 흑월 · SS 원화 / SD / 전용 스킬 검수판

- 상태: 원화 `APPROVED_SOURCE_ART`, SD·모션·스킬 `USER_APPROVED_LIVE`
- 사용자 지정 등급: **SS**
- 작업 범위: 승인 원화, 별도 투명 SD, 공격 동작 12프레임, 전용 스킬 이펙트 16프레임
- 정식 이름 / 용병 코드: **흑월 / V-048**
- 생성 도구: built-in `image_gen`
- 원화: [assets/source-art-v1.png](assets/source-art-v1.png)
- 규격: 1024×1536, 정확한 2:3, 8-bit RGB PNG
- SHA-256: `42853BDCB6C1843832C7050F5B0FB64D008F60372C90C5397D208D72E82D3230`
- 생성 프롬프트: [prompt-v1.txt](prompt-v1.txt)
- 생성 결과를 픽셀 가공 없이 복사했다.

## 디자인

검은 검객 갑주, 은빛 삿갓, 가면과 다검 실루엣을 새롭게 구성했다.
흑철·은빛 판금과 절제된 금빛 검날을 중심으로, 안개 낀 산성의 야경에서
캐릭터가 선명하게 읽히는 회화적 2D 게임 일러스트를 목표로 했다.

## 입력 참조와 역할

1. 사용자 첨부 `C:/Users/User/Downloads/6e46145e119612fd9df2478c96c7bc23.jpg`: 디자인 참고.
2. `assets/ui/project-v/mercenaries/female-office-sniper-red-v1.png`: 베스페라 공식 작화 기준. 색채·인물·복장·무기·배경 복제 제외.
3. `assets/ui/project-v/art-references/male-style-anchor-silver-paladin-v1.png`: 남성 갑주와 회화적 금속 재질 보조 기준.

공식 앵커는 수정하지 않았다. 원화의 글자·로고·카드 프레임은 제외했다.

## 승인 범위

2026-09-22 **“용병 이름 흑월로 승인 라이브 배포해”**로 원화·SD·12개 공격 동작·16프레임의 흑월 삼연참을 승인했다. 흑월(V-048), SS, 전열 돌격으로 도감·CMS·획득·편성·PVE/PVP에 연결한다. 기본 전투력 120,000은 SS 공통 기준이다. 스킬은 SS 단일 대상 기준 4.2배를 30%·30%·40%로 나누고 비용 25·재사용 5행동을 적용하며 CMS에서 수정 가능하다.

원본 PNG를 보존한다. 피해·보호막·회피 결과는 서버가 세 충돌별로 확정하고 클라이언트는 0.72 / 1.24 / 1.92초에 표시한다. 라이브 구현은 `HeukwolCombatPlayback.js`, 공용 Pixi·GSAP 시계와 이 폴더의 `BlackMoonFX.js`다. 신규 사운드는 추가하지 않았다.

## SD와 전용 스킬

- 전투 SD: [assets/battle-sprite-v2.png](assets/battle-sprite-v2.png), **1254×1254 RGBA PNG**. 투명 여백 64.7%, 외곽 잘림 없음.
- SD SHA-256: `8855D70472C08A154A956D32549BE53E34E72C2183D0460D4B9BA8726C0593F8`.
- 내려베기·올려베기·횡베기: 각 4개, **공격 동작 총 12프레임**.
- 전용 스킬 이펙트: [assets/triple-sever-fx-v2.png](assets/triple-sever-fx-v2.png), **16개 개별 연속 프레임**.
- 검수 화면: [index.html](index.html). 대기 자세·기본 베기·전용 3연격을 선택한다.
- 생성 도구: **built-in image_gen**. SD·모션·이펙트의 선택 프롬프트는 [prompts/](prompts/), 메타데이터·해시는 [manifest.json](manifest.json).

SD 비율 보조로 `assets/ui/project-v/characters/mercenary/mercenary-v013-raviena-sd-v1.png`를 사용했다. 인물·성별·얼굴·의상·무기는 복제하지 않았다.
초기 SD는 보통 체형으로 생성되어 재제작했다. 12칸 모션 시트는 이웃 칼끝과 겹쳐 4프레임씩 다시 생성했고, 초기 이펙트의 외곽 여백도 재생성으로 수정했다.

## 실제 재생과 원본 보존

- **PixiJS 8.20.0 / GSAP 3.13.0**, 현재 `package-lock.json` 잠금 버전.
- 기존 `preview/project-v-v3/source/battle/BattleEngine.js`, 공용 아트 어댑터·진형·카드 도크·등급 프레임을 재사용한다. 새 Pixi Application·별도 전투 렌더러·CDN 사본을 만들지 않았다.
- 구현 파일: `source/BlackMoonFX.js`, `source/preview.js`, `skill.mjs`.
- 일반 카드 5장과 독립 용병 1장을 분리하고, 카드 원화와 전투 SD는 별도 텍스처로 사용한다.
- `engine.effectLayer`에서 렌더링하며 `engine.simpleTimelines`에 등록한 단일 GSAP 타임라인으로 프레임·이동·접촉·소멸을 함께 제어한다. 별도 애니메이션 Ticker는 없다.
- 접촉은 **0.72 / 1.24 / 1.92초**. 각 포즈의 실제 검날 좌표와 상대 하단·상단·몸통 좌표를 등록했다.
- 전용 스킬 3.8초. 0.25/0.5/1/2배속, 일시정지, 앞뒤 탐색, 시전 중단·대상 소멸·화면 이탈 정리를 지원한다.
- 카드 사진 컷인이나 진행을 멈추는 팝업은 없다. 연출에서 피해·승패·재화를 계산하지 않는다.
- 새 사운드는 제작하지 않았고 검수판은 무음이다. 테스트 합성음도 사용하지 않았다.

`build-manifest.mjs`는 PNG 알파를 읽어 텍스처 사각형·발바닥·외곽 다각형 좌표만 만든다. 생성 원본을 크롭 저장·재압축·배경 제거하거나 팔·검의 픽셀을 변형하지 않았다. 이웃 포즈가 텍스처 사각형에 섞이지 않도록 Pixi 런타임 벡터 마스크를 사용한다. 시트별 몸 배율을 고정하여 웅크린 동작을 임의로 확대하지 않는다.

## 실행과 검사

```powershell
node preview/mercenary-black-moon-swordsman-ss-v1/build-manifest.mjs
node preview/mercenary-black-moon-swordsman-ss-v1/build.mjs
node --test preview/mercenary-black-moon-swordsman-ss-v1/qa.test.mjs
node preview/mercenary-black-moon-swordsman-ss-v1/serve.mjs
node preview/mercenary-black-moon-swordsman-ss-v1/qa-browser.mjs
```

프리뷰: http://127.0.0.1:8822/preview/mercenary-black-moon-swordsman-ss-v1/

회귀 검사 **6개 통과**: 승인 원본·투명 SD 분리, 실제 픽셀 기반 프레임 누락/혼입, 16개 효과의 개별성·투명 여백, 정·역방향 탐색·중단, 3개 접촉 프레임, 실제 Pixi 좌표·자원 정리. 브라우저 검사 결과는 [qa/browser-report.json](qa/browser-report.json)에 기록한다. 캡처 PNG는 로컬에 보존하고 Git에서 제외한다. 기술 테스트 통과를 사용자 시각 승인으로 처리하지 않는다.

최종 브라우저 검사: **PC 1440×1000 / 모바일 390×844** 모두 로딩 오류·페이지 오류·가로 넘침 0. 약 0.502초 동안 0.25/0.5/1/2배속이 각각 0.126/0.252/0.504/1.008초 진행했다. 정지 후 시간 고정, 시전 중단·대상 소멸 처리, 취소 후 표시 이펙트 0과 원위치 복귀를 확인했다. 첫 타격·올려베기·마지막 타격·대기 자세와 원화 화면을 직접 캡처해 검수했다. PC 원화의 삿갓 잘림을 고쳤고, 타격 보조 섬광을 줄여 캐릭터가 읽히도록 조정했다.

브라우저 검수 중 소프트웨어 WebGL 강제 옵션에서 캡처 지연이 발생해 설치된 Chrome의 기본 그래픽 경로로 다시 확인했다. 최종 보고서는 기본 경로의 재생 결과다.
