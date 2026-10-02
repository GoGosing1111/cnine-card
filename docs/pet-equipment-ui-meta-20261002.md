# 펫 장착창 UI 교체 — 2026-10-02

사용자 요청: `UI 그따구로 쓰지말고 현 UI메타에 맞춰서 최상급 디자인과 버튼 디자인까지 싹 다 다시해라`.

## 화면과 버튼

기준은 `docs/ui-fixed-reference-20260915.md`의 현 로비·용병도감·장비강화다. 기존 펫 창의 색·패널·버튼을 교체하고 배경 #080c17, 패널 #111828, 경계 #28324a, 본문 #f3f5ff, 라임 #c8ff6b와 자체 호스팅 Noto Sans KR·Barlow Condensed를 사용한다.

- PC: 세로 보관함, 원본 캐릭터를 크게 표시하는 중앙 무대, 현재 장착 슬롯/시작 버프 정보의 3열 구성. 공용 덱 격납고 배경을 재사용하고 원본의 알파·색·비율을 보존한다.
- 모바일: 캐릭터 무대, 네 장 선택, 장착/버프 정보를 순서대로 표시한다. 하단 조작을 유지하면서 상세 정보는 스크롤로 모두 확인한다. 장착 슬롯은 전체 너비를 사용한다.
- 라임 장착 버튼, 보조 새로고침, 조용한 해제, 선택 카드, 닫기, PvE/PvP 진입 버튼을 같은 디자인으로 교체한다. 선택/호버/눌림/비활성/저장 중/결과 재확인 상태와 SVG 아이콘, 키보드 포커스를 제공한다. 주요 조작 및 닫기 터치 영역은 44px 이상이다.
- `/pets/`는 기존 `soopketmon-v21-exact-shell-adapter.js`의 메뉴 계약과 `adventure-navigation-standalone.js`의 공통 메뉴를 연결한다. OWNER의 `/pets/?review=1`은 기존 CMS 문맥을 유지한다.
- 페이지·덱 진입 모듈·장착창 모듈·CSS의 캐시 키는 `20261002-pet-ui2`다.

이미지 원본, 서버/API, 저장 계약, 소유권, CMS 수치와 전투 로직은 바꾸지 않았다. 실제 획득/편성/전투와 2슬롯 출시 플래그는 계속 OFF다. 승인 원본은 기존 `docs/pet-equipment-gugugaga-20261002.md`를 따른다.

## 직접 관련 검수

`tests/pet-equipment-20261002.browser.mjs`로 PC 1440×1050과 모바일 390×844를 확인했다. 선택·장착·해제·재조회, 미설정 버프, 저장 중/충돌/결과 재확인 버튼, OWNER 거부, PvE/PvP 진입, 모달 닫기·포커스 순환/복귀, 모바일 상세 스크롤, 공개 공통 메뉴의 분류/화면 내 위치와 가로 넘침을 검사한다. 정상 공개와 OWNER 검수의 메뉴 문맥도 구분한다. **7% 버프는 격리 테스트 데이터이며 실제 CMS에 저장하지 않는다.**

PC 원본 무대와 모바일 상단/상세/모달 및 공통 메뉴 캡처를 직접 확인했다. 원본이 흐려지던 진입 효과의 투명도 변경을 제거하고 모바일 장착 슬롯 너비와 닫기 터치 영역을 보정했다. 무관한 서버·전투·전체 게임 검사는 반복하지 않는다.

검수 결과와 캡처는 저장소 밖 `C:/Users/User/.codex/tmp/pet-equipment-ui-meta-20261002/qa/`에 보존한다. 대표 캡처는 `gugugaga-recovered-equipment.png`다.

## Scoped 배포 범위

- 실제 직전 운영 커밋: Cloudflare 2026-10-02 18:57 KST 조회의 `b297a2a066fcc05f966dbc2cf280e5af7b1a8361`, Pages `90cc74dd-4cb3-4af5-97ce-1bdb37415de3`.
- 범위: 펫 화면/CSS, 덱 펫 진입 버튼, 캐시 키, 해당 브라우저 검수, UI 기준 기록. 기존 운영 완료 기록 커밋 `b93a6ac8`도 유지한다.
- 선정 이유: 펫 장착창의 배치·버튼·모바일·공통 메뉴만 바뀌는 국소 UI 수정이다. 서버/DB/인증/전투/의존성 변경이 없다.
- 배포: `npm run deploy:production -- --scoped`.
- `SCOPED_DEPLOY_TESTS=["tests/pet-equipment-20261002.browser.mjs"]`, `SCOPED_DEPLOY_CHECKS=[]`. 최종 모바일 너비 보정을 포함한 같은 관련 검사를 배포 과정에서 실행하고 기존 출시 잠금·캐시·Hyperdrive 보호를 유지한다.
- 직전/직후 운영 기록은 `C:/Users/User/.codex/tmp/pet-equipment-ui-meta-20261002/release-before.json`, `release-after.json`, 배포 로그는 같은 폴더의 `deploy.log`다.
