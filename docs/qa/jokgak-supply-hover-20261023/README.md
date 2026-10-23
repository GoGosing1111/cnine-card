# 족각도시 보급상자 투명 배경 수정 — 2026-10-23

마우스를 올리면 보급상자 뒤에 남색 사각형이 생기는 현상을 수정한다. 원화의 알파 문제가 아니라 `.jc button:not(:disabled):hover`의 `background-color:#26364b`가 보급상자 투명 배경보다 우선 적용되는 CSS 충돌이었다. 공통 누름 효과도 지도 핀의 위치 변환을 덮었다.

보급상자 지도 핀에만 더 높은 우선순위의 상태 규칙을 적용해 hover·키보드 focus·active에서 투명 배경과 기존 `translate(-50%,-25%)` 위치를 유지한다. 기존 전용 보급상자 원화·명판 이미지를 그대로 사용한다. 공통 버튼, 보급 규칙, 지급 데이터는 변경하지 않는다. city JS, city CSS, supply CSS 연결의 캐시 식별자를 `20261023-supply-hover1`로 갱신한다.

관련 검증은 `tests/jokgak-city-supply-hover-20261023.browser.mjs` 하나로 제한한다. 실제 도시 UI·로컬 격리 fixture를 사용해 PC 1440px/모바일 390px에서 기본·hover·누름·키보드 초점·터치 후 배경, 지도 위치 고정, 장소 선택, 초점 표시, 화면 넘침을 확인한다. 운영 계정/API 거래는 사용하지 않는다.

직전 운영 Pages `bb58c81c-482f-401f-8662-bb4b8799dcf4`, 소스 `6187019098643aaeb422826f3fbab5719af6883b`를 기준으로 `npm run deploy:production -- --scoped`를 사용한다. 기존 최신 checkout을 재사용하고 새 프로젝트/의존성 복사본은 만들지 않는다. 실행 로그·화면·공개 파일 확인은 작업 저장소 `output/jokgak-supply-hover-20261023/`에 기록한다.
