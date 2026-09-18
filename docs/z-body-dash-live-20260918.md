# Z-BODY 고속 대시 V2 운영 연결

2026-09-18 사용자 `승인`에 따른 운영 연결. 승인된 프리뷰는 커밋 `03c80c2e`의 `preview/z-body-dash-v2/`다.

## 변경

- 첫 검격 접촉 810 → **245 ms**, 한 동작 1,695 → **640 ms**.
- 시안 그대로 코발트·시안 잔광 12프레임과 백색·금색 검격 8프레임, 3단 기체 잔상, 출발 고리·속도선·접촉 파편을 연결한다.
- PixiJS 8.20.0의 기존 배경/효과 레이어와 GSAP 3.13.0의 기존 전투 타임라인을 사용한다. 대시·효과·확정 타격은 같은 시각을 따른다.
- H/S 기준 bodyScale 0.563696948902027, 월드 기체 높이 333.70859375, 승인 원본 5개, 광역기 V3/시전 V5를 유지한다.
- 서버 공격 주기·피해·대상·발동 수·승패와 스킬칩 정책, PVP 배틀슈트 제외 규칙은 변경하지 않는다. DB 작업이나 기능 플래그 변경은 없다.

## 소스와 자산

- 공용 컨트롤러: `preview/project-v-v3/source/battle/ZBodySwordAnimation.js`
- 모션/프레임 시간: `preview/project-v-v3/source/battle/ZBodyDashProfile.mjs`
- 실제 Pixi 효과: `preview/project-v-v3/source/battle/ZBodyDashFX.mjs`
- 운영 자산/승인/생성 출처: `assets/ui/project-v/account-battle-suits/z-dash-v2/manifest.json`
- wake SHA-256: `52b6bf7c64f011bd181420092a47f622ffe69ad34fbf877f08995f163f12683a`
- cut SHA-256: `a7b20a3697a496a2e4df6e52ea453bbf0ef434d8017277a8805ee766591e9621`
- 런타임: `2126-fluid-combat-z-dash-v2-20260918`. 메인·PVE 진입 스크립트의 `zDash=2`와 기존 서비스워커의 전투 스크립트 network-first 정책으로 갱신한다.

두 아틀라스는 승인된 프리뷰 파일과 바이트가 같다. 생성 원본과 프롬프트는 프리뷰에 보존하며 `scripts/promote-z-body-dash-v2.mjs`가 해시를 확인하고 복사한다. 별도 프리뷰 전용 컨트롤러는 제거했고 모든 공용 소비 번들 9개를 재빌드했다.

## 확인 결과

- `npm run test:battle-suit`: 103/103.
- `npm run test:skill-chips`: 50/50.
- `npm run test:v3-grid`: 25/25.
- 실제 공용 운영 번들의 PC 1280×800 / 모바일 390×844 전장에서 접촉 자세 07과 효과를 245 ms에 확인했다.
- 두 화면 모두 운영 기록 전체 재생: 예상/실제 **26회**, 예상/실제 피해 **701,397**, 종료 후 대기열 0·활성 타임라인 0·대시 효과 OFF.
- H/S 총기 애니메이션과 동일 기체 높이, PVP 제외를 동일 브라우저 실행에서 확인했다.
- 자동 검증은 GSAP 일시정지·배속·취소, 대상 교체·숨김·세션 교체 시 오발 방지, 157개 혼합 영수증 보존, 20회 재시작 후 정리, 기존 광역기 충돌 시각을 포함한다.
- 브라우저 초기 로딩 로그에서 출처 URL 없는 MutationObserver 오류 1건을 관측했다. 이후 PC/모바일 전투와 타격 검증은 모두 완료됐으며 새 Z 런타임에서 해당 오류를 발생시키는 observer 호출은 없다.

## 배포와 복구

범위 커밋을 `origin/main`에 통합한 깨끗한 작업 트리에서 `npm run deploy:production`만 사용한다. 이 명령의 전체 `release:gate` 통과가 배포 선행 조건이다. 로그와 운영 HTTP 검증은 배포 디렉터리 밖 `../qa/`에 보관한다.

문제 발생 시 이 운영 연결 커밋을 되돌리고 공용 번들·캐시 키를 함께 재빌드/갱신한 후 같은 출시 검사를 수행한다. 계정 데이터 롤백은 필요 없으며, 승인된 이전 Z 외형·광역기와 H/S 크기는 복구에서도 유지한다.
