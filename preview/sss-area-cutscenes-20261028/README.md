# SSS 리미티드 첫 궁극기 검수

다섯 용병의 실제 HUNT V3 엔진을 사용하는 격리 검수 화면이다. 전투마다 첫 광역 궁극기에 가로 얼굴 컷신을 1회 표시한다. 대사창은 2026-10-28 새로 생성한 각 용병 전용 프레임이며 기술별 16개 대사를 표시한다.

node preview/sss-area-cutscenes-20261028/serve.mjs로 읽기 전용 로컬 서버를 띄운다. 기본 포트 8928, SSS_PREVIEW_PORT로 지정한다. 현재 검수 포트는 8929이다. 파일 조회만 제공하고 /api 및 쓰기는 차단한다. 프로젝트 복사/의존성 설치는 필요 없다.

용병을 선택하고 궁극기 사용을 두 번 누르면 첫 번째에만 컷신을 확인할 수 있다. 새 전투를 누르면 1회 표시 권한이 초기화된다. 중단/숨김 후 복귀는 같은 전투의 표시 기록을 유지한다. 검수 배속과 동작 줄이기는 이 화면에서만 변경한다.

fixtures.mjs는 기존 서버의 createHuntSession·limitedDeploymentSnapshot을 사용하는 결정적 로컬 편성 생성기다. fixtures.json에는 계정/인증 정보가 없고 운영 API를 호출하지 않는다. 피해는 검수용 영수증으로 대상당 1회만 표시한다.

Pixi 8.20.0, GSAP 3.13.0. 실제 구현은 MercenaryAreaCutinPlayback.js / MercenaryAreaDialogueStyle.js / shared/mercenary-area-cutins-v1.mjs이다. 기존 승인 원화와 공격 타격 기준점을 유지한다. 취소/재생/PC·모바일 검수와 프레임 생성 프롬프트·원본 해시는 docs/qa/sss-area-cutins-20261028/에 기록했다.
