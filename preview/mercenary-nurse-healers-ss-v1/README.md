# SS 간호사 힐러 4명 · 백의의 맹세

2026-09-27 사용자 지시: 간호사 4명을 SS 힐러 용병 리소스로 만들고 스킬 한 개를 동일하게 사용한다. 후속으로 제공된 네 원화와 이름을 최종 입력으로 사용했다.

## 구성

| 이름 | 검수용 임시 코드 | 역할 / 등급 | 스킬 |
| --- | --- | --- | --- |
| 디임간호사 | V-051 | 힐러 / SS | 백의의 맹세 |
| 희야 간호사 | V-052 | 힐러 / SS | 백의의 맹세 |
| 조은 간호사 | V-053 | 힐러 / SS | 백의의 맹세 |
| 봉순 간호사 | V-054 | 힐러 / SS | 백의의 맹세 |

- 원화: 사용자 제공 1024×1536 RGB PNG 4장. 파일 자체는 복사만 했다. 원본 파일명과 SHA-256은 [user-sources.json](./user-sources.json), 최종 파일 경로와 해시는 [manifest.json](./manifest.json)에 있다.
- 전투 SD: 실제 알파가 있는 별도 PNG 4장. 원화의 얼굴·머리·색·의료 소품을 계승했다. 조은 SD는 단정한 높은 깃, 무릎 길이 치마, 불투명 레깅스와 서 있는 자세로 제작했다. 조은 원화는 변경하지 않았다.
- 스킬: 네 명이 모두 `NURSE_WHITE_OATH` 한 개와 동일 아틀라스를 참조한다. 민트·아이보리색 빛의 집중, 전개, 회복, 분해·소멸을 담은 서로 다른 16프레임이다. 캐릭터마다 스킬을 복제하거나 색상 변형하지 않았다.
- 원화와 SD는 분리한다. 카드 도크·도감·컷인에 SD를 대신 표시하지 않는다. 검수용 코드이며 라이브 도감 번호 예약·등록은 아니다.
- 상태: 기술 검수 완료, 사용자 시각 검수 대기. 운영 획득·편성·전투 연결과 회복 계수·재사용 시간은 미정이다. 이 패키지는 독립 리소스 검수 페이지다.

## 생성과 자산 처리

제작 도구는 Codex 기본 `image_gen.imagegen`이다. 선택된 생성물 파일명, 입력과 최종 프롬프트는 [generation.json](./generation.json)에 있다. 공식 원화와 SD 기준 파일은 수정하지 않았다. 먼저 만든 별도 이름의 시안은 이 패키지에서 제외하고 작업 트리 밖에 보존했다.

사용자가 보낸 PNG와 선택된 생성 PNG는 바이트 그대로 보존한다. 브라우저 원화 미리보기만 폭 720 WebP로 별도 생성한다. 효과 원본은 실제 출력 1254×1254 RGBA의 4×4 시트이며, 원본 격자를 분리하고 셀마다 최대 1px 투명 여백을 보완해 314px 프레임 16장과 1256px 무손실 WebP 아틀라스로 포장한다. 그림을 변형하거나 합성 중간 프레임을 만들지 않는다. 완전 투명 픽셀의 보이지 않는 RGB를 제외한 모든 색과 알파의 일치를 검사한다.

사운드는 이번 요청 범위에 없으므로 무음 시각 리소스다. 테스트 합성음을 추가하지 않았다.

## PixiJS · GSAP 구현

잠금 버전: PixiJS 8.20.0, GSAP 3.13.0. 루트 package-lock.json에 고정된 의존성을 재사용한다.

- 실제 효과 구현: [source/NurseHealFX.js](./source/NurseHealFX.js)
- 공유 V3 연결과 생명주기: [source/preview.js](./source/preview.js)
- 시점·프레임 정의: [skill.mjs](./skill.mjs)
- 빌드: [build.mjs](./build.mjs) → [preview.bundle.js](./preview.bundle.js)
- 기존 엔진: `preview/project-v-v3/source/project-v-pixi-battle.src.js`. 별도 렌더러·라이브러리·전장 진형을 만들지 않는다.
- Pages의 확장자 없는 전투 문서에서도 상대 경로가 유지되도록 기존 `preview/project-v-mercenary-system-v1/skill-asset-base.mjs`의 자산 기준 경로를 재사용한다. 로컬 서버도 `/battle.html` → `/battle` 전환을 재현한다.
- 기존 V3 effectLayer에 Pixi Sprite를 배치하며, 하단의 약한 빛만 기존 combatLayer에 놓는다. 한 GSAP 타임라인을 engine.simpleTimelines에 등록한다. 프레임 재생·정지·배속·이동은 동일 시계를 사용한다.
- 연출 길이 2.60초, 회복 접점 0.88초의 8번 프레임(0부터 센 index 7). 접점은 각 캐릭터 발 기준 높이의 20% 위다. 얼굴 가독성을 위해 효과의 크기를 제한한다.
- 실제 일반 카드 5장과 별도 용병 1장으로 시연한다. 기존 카드 원화·ZENITH/SUPERSTAR 전용 프레임과 V3 아트 어댑터를 그대로 사용한다. 서버 HP·피해·승패를 변경하거나 재계산하지 않는다.

## 검수 결과

검사 범위는 신규 독립 리소스 패키지다. 공용 엔진·운영 메뉴·API·DB·의존성 변경이 없으므로 게임 전체 게이트를 실행하지 않는다.

```powershell
node preview/mercenary-nurse-healers-ss-v1/build-assets.mjs
node preview/mercenary-nurse-healers-ss-v1/build.mjs
node --test preview/mercenary-nurse-healers-ss-v1/qa.test.mjs
node preview/mercenary-nurse-healers-ss-v1/serve.mjs
# 별도 터미널
node preview/mercenary-nurse-healers-ss-v1/qa-browser.mjs
```

- 자산·분리 계약·단일 스킬·원본 해시·16개 고유 프레임·역방향 탐색: 4개 테스트 통과.
- Chrome 데스크톱 1440×1000, 모바일 390×844에서 네 명 선택, PNG 표시, 배경 전환, 재생/일시정지, 재시작, 0.25×/0.5×/1×/2×, 시점 이동, 취소·정리 통과.
- 두 화면 모두 가로 넘침, JS 예외, 실패한 HTTP 응답 0. 하나의 캔버스, 일반 카드 5장과 별도 용병 확인. 종료 후 표시 효과와 등록 타임라인 0.
- 네 SD의 밝은 배경 가장자리·손·소품·전신, PC·모바일 원화 화면, 네 카드 프레임과 실제 V3 회복 접점을 직접 시각 확인했다.
- [브라우저 검수 기록](./qa/browser-report.json), [PC 회복 접점](./qa/desktop-healing-contact.png), [모바일 회복 접점](./qa/mobile-healing-contact.png), [모바일 원화 4장](./qa/mobile-four-portraits.png).

## 배포 범위

프로젝트 `docs/scoped-release-policy-20260923.md`의 기존 자산 전용 범위를 따른다. 신규 `preview/mercenary-nurse-healers-ss-v1/`만 변경한다. 이전 운영 배포는 Pages `c05d81e7-851a-49a1-ba88-ec6350c2e30d`, 원본 커밋 `62a05edee5aa61165ba448d5a2740d361ee99fc4`로 CLI에서 확인했다.

범위 커밋과 origin/main 일치 후 `ASSET_DEPLOY_BASE=62a05edee5aa61165ba448d5a2740d361ee99fc4`로 `npm run deploy:production -- --assets-only`만 사용한다. 운영 게임의 기존 출시 플래그·보상·캐시 버전·전투 경로는 변경하지 않는다. 배포 래퍼에서 깨끗한 범위, 허용 파일과 Hyperdrive 캐시 OFF를 확인한다. 배포 후에는 검수 페이지와 새 명세·대표 자산 반영만 확인한다.
