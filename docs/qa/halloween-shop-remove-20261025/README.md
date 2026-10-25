# 할로윈팩 상점 제거 — 2026-10-25

**운영 반영 완료:** 2026-10-25 13:18 KST 확인, 소스 `929f20914d12075b736a8a996a06cd83bdc3f529`, Pages `6a8cd4a6-1cf0-4191-93f5-72c6fe7c9a6d`, API Runtime `579206cf-7813-4110-a2d5-f7a69695a319`.

사용자 `할로윈팩 상점에서 제거해`에 따라 상점 목록에서 제거하고 신규 개봉을 서버에서 차단한다. 이 지시는 앞선 할로윈 판매 유지보다 우선하며, 블러드문팩 ON과 프라임 제작 잠금은 유지한다.

- `HALLOWEEN_PACK_SHOP_ENABLED=false`: `/api/packs`에서 행을 생략하고 1/10회·자동 개봉 요청은 계정/DB 접근 전 423 `MERCENARY_HALLOWEEN_SHOP_REMOVED`로 차단한다.
- 저장 ON/가격/확률/수량을 초기화하지 않는다. 기존 보유 카드·도감과 인증된 과거 영수증 조회는 유지한다. 공개 설정은 `shopEnabled:false`, `userOpeningEnabled:false`다.
- 기존 캐시의 할로윈 행과 이전 선택도 상점에서 제거한다. 직접 열린 구형 개봉 화면은 판매 종료를 표시하며 이전 결과 확인을 유지한다. CMS도 상점 제거와 저장 설정을 구분한다.
- PC 1440 / 모바일 390 실제 앱: 과거 행 필터·이전 선택 복구·블러드문 진입/개봉 가능·할로윈 구매 버튼 잠금·이전 결과 버튼·CMS 안내 확인, 오류 0건 (`browser.json`). 실제 운영 거래 0건.

관련 검사 **23개 통과**, `check:worker`와 API/Pages Worker 컴파일 통과. scoped 배포 및 Hyperdrive 쿼리 캐시 OFF 확인. 공개 파일 8개 해시 일치, 상점 API에 할로윈 행/null 없음, 새 개봉 423 `MERCENARY_HALLOWEEN_SHOP_REMOVED`, 영수증 비인증 요청 401 확인. 블러드문 ON과 두 팩 저장 revision/가격/확률/한도는 배포 전과 일치한다. 실제 운영 파일·공개 API를 사용한 모바일 상점 확인도 통과했으며 계정 차감/지급·설정 쓰기 0건이다. `live-verification.json`, `live-ui/browser.json` 참조.

배포 계획·결과 및 읽기 전용 이전 상태를 보존했다. 원본 배포 로그는 `C:/Users/User/Downloads/cnine-z-body-sword-20260918/site/docs/qa/halloween-shop-remove-20261025/deploy.log`다. 배포 도구의 임시 자산 폴더는 자동 회수됐고 의존성 복제본은 만들지 않았다. 현재 작업 폴더와 공유 의존성은 재사용한다.

첫 검사에서 34개 중 변경 관련 28개는 통과했다. 오래된 `mercenary-halloween-ready-20261017`의 원화 경로/216,000 전투력/과거 전투 해시 4건과 `mercenary-halloween-recovery-20261017`의 10장 소진 가정 2건은 현재 237,600 전투력/13장 한도와 맞지 않는다. 이번 변경은 전투·풀·원화를 수정하지 않는다. 과거 시나리오 전체 정비 대신 두 파일을 최종 범위에서 제외하고, 현재 정책의 CMS ON 저장 후 판매 차단을 전용 검사에 추가했다. 첫 검사 단계에서 배포는 중단되었고 운영 반영은 없었다. 원본 로그는 운영 소스의 같은 QA 경로 `preflight-initial.log`에 보존한다.
