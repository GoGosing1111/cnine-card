# 용병 성장실 기능 V2 · 이미지·가독성 V4 검수

2026-10-15. **준비·검수 전용, 운영 OFF. 로컬 브랜치 저장, 라이브 배포 없음.** 검수 통과는 사용자 시각 승인이나 라이브 개방 승인이 아니다.

## 실행

작업 트리에서 `node preview/mercenary-level-v2-20261015/serve.mjs`를 실행한다. 주소는 http://127.0.0.1:9127/preview/mercenary-level-v2-20261015/ 이다. 고정 검수 모드이고 서버는 GET만 허용하며 운영 구매·성장 POST를 보내지 않는다.

## 반려 이력과 최신 변경

- CSS/SVG 봉인 V2 반려본: qa/rejected-css-v2/, rejected-css-v2/seal-svg-source.txt. 생성된 닫힘·성공 개방·실패 파손 원화 3종으로 교체했다.
- 이미지 버튼 V3 반려본: qa/rejected-button-layout-v3/. 긴 규칙 제목의 과하게 늘어난 날개 장식과 8~12px 버튼 글자가 사용자에게 반려됐다. 당시 겹침/동작 QA 통과를 시각 승인으로 취급하지 않는다.
- 최신 V4는 새 간결한 흑금속 프레임 button-header-v4.webp를 보조 버튼·규칙 제목에 9-slice로 사용한다. 원본 모서리를 12~14px로 고정하고 중앙 면만 늘린다. summary는 PC 72px/20px, 모바일 68px/18px다.
- 주요 조작 문구는 PC·모바일 16px 이상, 조작 영역 44px 이상이다. 본문·성장표는 PC 16px/모바일 14px, 보조문구는 13~14px, 작은 상태 배지만 12px다. 레벨 숫자는 18px이며 모바일은 5열로 배치한다.
- 주행동 금빛 버튼은 최대 380px·중앙 정렬·background-size:contain으로 원본 종횡비와 장식 끝을 보존한다. 넓은 패널을 가득 채우려고 원화를 가로로 늘리지 않는다.
- 1400px 미만 PC는 보유 용병을 상단 가로 목록으로 옮기고 본체 2열, 900px 미만은 1열이다. 좁은 화면에서도 글자를 줄여 압축하지 않는다.
- 사용자 후속 ‘도형 CSS 지워라’에 따라 메인 성장실의 장식 SVG·마름모·원화 주변 궤도/바닥 링·장식 코너를 제거했다. 돌파 화면 손잡이/상단 마름모와 구 봉인 도형 CSS 제거는 통합 작업에 포함된다. 생성된 이미지, 기능상 +/−/화살표, 접근성 초점 윤곽은 유지한다.
- 접근성 건너뛰기는 키보드 초점 때만 표시한다. 미초점 rect가 화면 밖이어도 긴 요소 캡처 합성에서 보이던 현상은 opacity/clip 처리로 해소했다. Tab/Enter 이동을 검증했다.

## 자산과 파일

공통 경로: assets/ui/mercenary-growth-20261015-v3/. 원본 PNG·최종 프롬프트·SHA-256은 seal-manifest.json, buttons-manifest.json, header-v4-manifest.json 및 통합 manifest.json을 따른다. 생성 원본은 8개이며 옛 button-secondary.webp는 반려 이력이다. 현재 사용하는 자산은 봉인 3종 + primary/slot/slider/header-v4의 4종이다. 한글과 숫자는 정확한 HTML 레이블로 제공한다.

- 조작부 20종 및 선택/초과 경험치 동의: assets/ui/mercenary-growth-20261015-v3/button-inventory.json.
- 화면/성장표: mercenary-codex/leveling/{app.mjs,growth-view.mjs,v2.css,readability-v4.css}.
- 이미지 표면/연출: mercenary-codex/leveling/{buttons-v3.css,seal-image-v3.css,breakthrough.mjs}.
- 배경: assets/ui/mercenary-growth-20261006/chamber.webp. 승인 용병 원화는 원래 URL·종횡비를 그대로 유지한다.

## 검증 범위와 최신 증빙

최신 색인은 qa/report.json이며 V4 화면은 **qa/readability-v4/**만 참조한다. 루트 qa/*.png는 V3 캡처 이력이므로 최신 화면으로 제시하지 않는다.

- V4 범위: 1440·1100·800·390·320px에서 실제 computed font-size/조작 크기, 9-slice 프레임, 모바일 5열 레벨 선택, 가로 넘침, 생성 이미지 적용, JS 오류 및 비운영 요청 확인. 자세한 수치는 qa/readability-v4/report.json이다.
- 최종 국소 확인: 선택 체크 14px, 건너뛰기 초점/Enter/숨김, 주버튼 원본비율, 390·320px 전수 버튼이 공통 하단 메뉴 위에 전부 노출되고 중앙 클릭 지점에 다른 요소가 가리지 않는지 확인했다.
- 실제 화면: tablet-guide-viewport.png(800px), mobile-training-viewport.png(390px), narrow-training-viewport.png(320px), 각 화면의 *-stats-viewport.png / *-levels-viewport.png. 일반 화면은 초점을 해제한 상태이며 공통 하단 메뉴는 유지한다.
- 봉인/결과: 같은 폴더의 *-seal-controls.png, *-success-bottom.png, narrow-failure-bottom.png. 최종 도형 제거 후 업데이트된 증빙 여부는 report.json을 따른다.
- 이전 V3 기능검사: qa/rejected-button-layout-v3/report.json. 영수증 고정 결과·재생 무차감·실패 레벨 유지/XP0·초과 경험치 동의·재시도·키보드/터치·동작 줄이기·운영 OFF 검사다. 거래/결과 코드는 이번 가독성 수정으로 바뀌지 않았으므로 해당 기능 결과는 유효하며 반복 전면 검사는 하지 않았다.

## 성장 및 결과 정책

기본 보유 1장은 보호하고 중복 카드만 재료로 사용한다. 동일 용병 경험치 3배, 리미티드 요구 경험치 5배, 초과 경험치 소멸의 명시 동의를 유지한다. 1~20레벨과 5/10/15/20 돌파, 능력치·PVP 숙련 전후는 공통 계산기와 서버 영수증의 고정 스냅샷을 표시한다. 미정 운영 수치에 임의 숫자를 넣지 않는다.

돌파는 충전 → 직접 밀기/Enter → 봉인 개방 → 결과다. 성공은 생성 이미지의 양판 개방·빛, 실패는 파손 이미지·광원 소멸·침하로 구분한다. 실패 시 현재 레벨·기존 성장·돌파 효과는 유지되고 현재 경험치만 0이 된다. 건너뛰기·Escape·다시보기는 새 판정/추가 차감이 없다. 사운드는 명시 선택, 동작 줄이기는 입자 OFF와 즉시 전환이다.

경험치·성공확률은 연출 검수용 예시이며 라이브 경제 값이 아니다. 후보 전투 수치와 최종 승패 검증은 부모 통합 기록을 따른다.

## 도감 진입 검수

http://127.0.0.1:9127/mercenary-codex/ 에서 기존 도감 스타일의 상단/보유 상세 성장 진입을 확인한다. 공개 카탈로그 빌더와 예시 6종만 사용하며 실제 보유 계정이 아니다. 상세에서 선택한 예시 용병을 성장실에서도 선택한다. 운영 OFF는 유지하고 검수 HTML에만 marker를 주입한다. 기존 편성은 비활성화하고 모든 쓰기는405로 차단한다. 1440/800/390/320px 화면과 동선 확인은 qa/codex-entry/report.json 및 해당 캡처를 따른다.
