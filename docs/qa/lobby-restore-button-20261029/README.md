# 원화 감상 모드 로비 복귀 버튼 — 2026-10-29

사용자가 첨부한 모바일 화면에서 `로비로 돌아가기`를 눌러도 반응하지 않는 문제를 수정한다.

공유 내비게이션 host와 `.lobby-body`는 아래 콘텐츠로 입력을 통과시키기 위해 `pointer-events:none`을 사용한다. 기존 허용 목록에는 헤더·사이드·모바일 메뉴·dialog만 있고, `main` 밖에 놓인 `.restore-ui`는 빠져 있었다. 버튼이 보이고 포커스를 받아도 클릭과 터치의 실제 대상은 뒤쪽 main이었다. 기존 클릭 핸들러 및 Escape 처리는 정상이었다.

공유 내비게이션의 입력 허용 목록에 `.restore-ui`만 추가했다. 원화·배치·복귀 핸들러·다른 내비게이션 정책은 그대로 두고, 실제 로비 번들·ONE store 파생물·캐시 버전을 갱신한다.

실제 메인 화면과 격리 API에서 PC1440×900, 터치 모바일430×874·320×740 세 크기로 재현했다. 수정 전14확인에서 버튼 입력 차단과 복귀 실패를 확인했고, 수정 후29확인에서 좌표 기반 마우스 클릭/터치, 로비 복귀·포커스·토글 초기화, Escape, 출전 메뉴 재진입을 확인했다. 브라우저 예외·누락 자산0. Chrome 모바일 에뮬레이션이며 사용자 실제 iPhone을 원격 조작한 검사는 아니다.

배포는 직전 운영 소스 `9f2f29aae52ec5f558f1e6944d03a82a9a6910ae`를 기준으로 `npm run deploy:production -- --scoped`를 사용한다. 관련 검사 `tests/onestore-web-20261026.test.mjs`, `test:lobby`와 기존 필수 배포 보호를 적용한다. 배포 후 공개 파일과 공개 모바일 핵심 복귀를 확인해 completion.json에 기록한다.

증거: `C:/Users/User/Downloads/upload/cnine-card/operations/lobby-restore-button-20261029/`의 browser.mjs, before/report.json, local/report.json, 화면 PNG 및 배포 기록. API는 fixture로 격리해 운영 계정/재화 직접쓰기0·메시지0. 기존 깨끗한 release-checkout과 의존성을 재사용했다. Git 자동 유지관리 OFF, 저장공간 점검/정리/예약 없음.

**운영 완료:** 소스 `c7cb1b9ee`, Pages `3c2dc834`. 관련11검사·번들 일치, PC/터치 모바일3크기29확인, 공개 모바일10확인, 공개6파일·두 Worker100% 확인. 공개 자산 검수의 API는 격리 fixture이며 운영 계정/재화 직접쓰기0.
