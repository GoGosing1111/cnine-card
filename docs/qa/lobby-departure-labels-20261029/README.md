# 로비 출전 숫자를 PVE/PVP로 변경 — 2026-10-29

사용자 요청: 모험/대전 출전 UI의 01/02 글자를 지우고 PVE/PVP로 표시한다.

숫자는 배경 이미지에 들어 있지 않고 HTML 워터마크와 모드 전환 문구였다. 초기 모험 화면과 모드 전환 모두 큰 글자를 PVE/PVP로, 작은 문구를 EXPEDITION / PVE 및 BATTLE / PVP로 바꿨다. 기존 시안의 ARENA 문구도 ARENA / PVP로 동기화했다. 세 글자가 좁은 버튼에서도 온전히 들어오도록 워터마크를 세로 중앙에 맞추고 PC80px·모바일56px로 조정했다. 버튼 크기·색·출전 제목·설명·대상 메뉴·원화 바이트는 유지한다.

기존 release-checkout에는 다른 작업의 미완성 레이드/보상 수정이 있어 건드리지 않았다. 깨끗한 기존 희소 체크아웃 C:/Users/User/Downloads/upload/cnine-card/tmp/cardgu-live-20261027을 최신 main에서 새 브랜치 codex/lobby-departure-labels-20261029로 재사용했다. 새 프로젝트/의존성 복사와 저장공간 점검·정리·삭제는 하지 않았다.

실제 메인과 격리 API에서 PC1440×900·모바일320×740의 PVE/PVP 양쪽, 총22확인을 통과했다. 두 문구, 숫자 제거, 워터마크 전체가 버튼 안에 위치함, 기존 제목/출전 분류 및 실제 메뉴 열림, 누락 자산/JS 오류0을 확인했다. 운영 계정·재화쓰기/메시지/실제 전투0.

생성 번들 일치 확인과 ONE store 파생물 검사만 선택한 scoped 배포다. 실제 직전 Pages 소스c2d16911d25e694dea374225279f5e4ad349e10a를 계획에 기록했다. 공개6파일/두 Worker와 공개 모바일 양쪽 모드의 짧은 검증 뒤 completion.json에 기록한다. 증거 C:/Users/User/Downloads/upload/cnine-card/operations/lobby-departure-labels-20261029/. Git 자동 유지관리 OFF, 기존 지급/취소 예약 재실행 없음.

**운영 완료:** 소스 `c82a8be89`, Pages `55ed6873`. 관련7검사·로컬 PC/모바일22확인·공개모바일12확인·공개6파일·두 Worker100% 검증 완료. 화면 API는 격리 fixture, 운영 계정/재화쓰기0.
