# 용병 편성 버튼 가독성과 배치 수정

할로윈 상세의 테마 규칙이 편성 버튼을 어두운 `button-night.webp`로 바꾸면서 기존 `.equip-button`의 어두운 글자색을 유지했다. 편성 자체는 가능했지만, 이용자는 용병 성장 위의 어두운 부분을 눌러야 한다는 안내를 받아야 했다. 모바일에서는 큰 원화 아래까지 내려가야 편성 버튼을 찾을 수 있었다.

편성 영역을 선택한 용병 상세의 첫 번째 행으로 이동했다. 원화나 스킬 정보보다 먼저 용병 이름, PVE·PVP 선택, 밝은 금색의 `PVE에 오리꿍 편성` 버튼을 제공한다. 최소 68px 높이, 명시적인 글자색·초점 표시, 읽을 수 있는 완료·대기 상태를 유지한다. 성장과 해제는 보조 조작으로 구분한다. 데스크톱 원화 영역 높이는 기존 수준을 유지한다.

DOM의 저장 이벤트와 API 요청·보유 검증·모드별 리비전·재시도 정책은 그대로 사용한다. 보유, 지급, 성장, 전투 수치, 판매 상태는 변경하지 않았다. 운영 계정에 편성이나 지급을 실행하지 않았다.

## 전용 이미지

Built-in ImageGen으로 용병도감 전용 금속 버튼과 네이비 편성 패널을 생성했다. 원본 PNG, 생성 프롬프트, SHA-256, 투명 여백 정리·WebP 포장 정보는 `assets/ui/project-v/mercenaries/deployment-20261017/manifest.json`에 보존한다. `mercenary-codex/deployment.css`가 두 실제 이미지를 버튼과 9-slice 패널에 연결한다. 글자와 수치는 DOM이다. 기술 검수 결과를 사용자 시각 승인으로 기록하지 않는다.

## 검증

- `tests/mercenary-deployment-visibility-20261017.browser.mjs`: 격리 SQLite와 실제 편성 함수를 사용하는 브라우저 검사. 1440·390·320px에서 할로윈 7종, 일반 용병, 기존 리미티드 선택을 확인했다.
- 원화보다 앞선 배치, 클릭 영역, 68px 이상 버튼, 글자색·불투명도·이미지 경로, 가로 넘침 없음, PVE/PVP 저장·한쪽 해제의 독립성, 키보드·터치, 완료·대기 표시를 검증했다. 브라우저 오류 0, 운영 계정 쓰기 0.
- PC 원화 영역 높이 조정 후 영향받는 1440px만 재확인했다. 최종 모바일 및 PC 화면을 직접 확인했다.
- 초기 QA 정적 서버가 Windows 경로의 중복 구분자를 잘못 검사해 페이지를 차단했다. QA 루트를 `path.resolve`로 정규화해 바로잡았다. 운영 코드 문제는 아니었다.
- 화면 및 JSON: `docs/qa/mercenary-deployment-visibility-20261017/`.
- 배포 단계 회귀: `tests/mercenary-loadout-modes.test.mjs`. UI 재배치 후 모드별 편성 계약을 검사한다. 이미 완료한 브라우저 검사를 배포 중 반복하지 않는다.

## 배포

직전 Production 소스는 `da9d0594f9a04c4f8991c163a277ecb1b67d83dd` (Pages `0816154d`)이다. 범위 커밋·원격 반영 후 `npm run deploy:production -- --scoped`를 사용한다. 완료 후 실제 배포 식별자와 공개 파일 확인 결과만 추가 기록하며 문서 갱신을 위해 재배포하지 않는다.

2026-10-17 22:58 KST 운영 확인 완료:

- 배포 소스 `a42bd1509fb2d995d32898b245b890af04940e8c`, Pages [ad955088](https://ad955088.cnine-card.pages.dev).
- 편성 회귀 10/10, 출시 보호 조건과 Hyperdrive 캐시 OFF 검사 통과. API runtime `5b787ad2-36e2-424d-b0b2-9c47b3e57f45`, scheduler `971a95cd-da8d-40b2-8e42-8c228eaa97ad`.
- 실제 운영 HTML·JS·CSS·WebP 2종이 배포 소스와 SHA-256 일치. 운영 파일을 그대로 사용하는 PC 1440px·모바일 390px에서 버튼 문구·색·높이·클릭 영역·가로 넘침 없음을 확인했다.
- 운영 화면 확인에서는 보유 계정 응답만 검수 데이터로 대체하고, 정적 파일이나 공개 도감 응답은 대체하지 않았다. 운영 계정에 POST·재화 사용·편성 변경은 없었다. `production-report.json`의 `fixtureAccount:true`, `assetOverrides:false`, `liveWrites:0`으로 구분한다.
- 결과 기록만 후속 커밋하고 같은 실행 코드를 재검사·재배포하지 않았다.
