# 유저 경매 · CMS 라이브 전환

사용자 확정: 본인 보유 카드/용병/펫/장비/이동수단/아이템/마스터의 별 판매, 티켓 1장, 전리품500·랭크300, 서버 전체 진행1건/FIFO 예약, 시작부터2시간, 판매수수료20%. 성장·강화·잠재력은 각 계정에 유지. 추가입찰 퀵 버튼1천만/1천억/1조/10조/100조, 기존 추가입찰 금액별 BGM42개·음량·순서 보존, 입찰 알림 중앙560px/모바일좌우16px. 실제 시작 경매마다 계정별 로비 팝업1회.

2026-11-03 후속 사용자 지시로 실제 게임/CMS 연결과 운영 활성화까지 범위를 확장했다. OWNER CMS에서 운영자 물품 공급 경매(티켓·소유분 소모0, 운영자 낙찰금0), 유저/운영자 개최 스위치, 품목별 신규 개최 금지, 예약 취소, 금액별BGM 편집을 제공한다. 운영자 경매도 같은 단일 진행/FIFO 대기열을 따른다. 기존 등록 건은 금지 정책 변경 후에도 약정대로 종료한다.

검증:
- 관련65검사 통과: 실제 SQLite/PostgreSQL 어댑터, 원자 지급/실패 원복/재시도, 예약·정산, 제한 코인 원장 보존, OWNER 권한·금지 품목 직접 요청 거절, 티켓 상점100장 일괄/무제한/재실행/기존상품 보존, 원스토어 파생본.
- 실제 index.html 로비 진입/팝업/입찰/개최/복귀와 admin/index.html의 개최·금지 저장·100조 BGM 저장을 Chromium1440/390/320 및 WebKit390에서 격리API로 검사. 중앙 알림을 body에 배치해 로비 변환 스타일 영향 제거. CMS 모바일 사이드바 가림 보완.
- 운영 READ ONLY 카탈로그688종·보유 조회, 기존 경매0건·BGM42개 해시 확인. 장비는 인덱스로 종류별 후보1개만 조회하며 계정 인스턴스 전체를 적재하지 않는다.
- 실제2용병PVE/PVP/랭크 편성 보호, 이전 단일 편성의 올바른 fallback, 펫 현재 선택만 보호. 마지막 카드의 경매 에스크로 표시와 DB trigger로 일반 팩/상점 재획득 때도 계정 돌파 보존. 경매 외 기존 초기화는 유지.
- 한정 용병 발행수량/원본 일련번호·획득 영수증 불변. 완료 경매 양도 증명과 현재 보유분을 대조해 진무/족로 획득 권한 연결. 기존 전용 전투/계급 제한 유지.
- 운영 스키마10테이블, 카드 성장 trigger, 이동수단 동기화3trigger 준비. 실패2단계/정상 활성화 예행연습 전부 ROLLBACK. BGM·기존상품·계정 변경 없음.

배포 한도: 원본/미리보기/검증 파일을 Git에 보존하고 경매 로컬 미리보기 및 과거 구현·검증 문서9개를 공개 포장에서 제외한다. 실제 런타임·승인 원화 삭제 없음. 자산20,000개. 개인 계정 지급·메시지 전송·유지관리·예약 없음. 게임 경매 자동 마감은 API Worker의 매분 cron과 동일 트랜잭션 tick을 사용한다.

콘텐츠 보상으로 티켓을 추가 지급할 콘텐츠/수량은 아직 미정이므로 임의 보상은 추가하지 않았다. 운영자 ITEM 상품 공급은 기존4종 체계, 유저 거래7종이다. 실기기/설치 앱 검수는 아니다. 과거 준비 문서와 시안은 별도 보존한다.

증거: 프로젝트루트 operations/auction-live-20261103/. 일회 운영키 ops:auction-user-live:20261103:v1. 최종 운영 완료 정보는 검증 후 이 문서에 추가한다.

최신 사용자 지시: “일단 유저가 바로 경매 못열게 공개상태의 OFF로 해놔”. 운영 활성화 값은 유저 개최 enabled=false, 운영자 개최 operatorEnabled=true로 확정한다. 경매장은 표시하고 운영자 경매 입찰은 허용하되 유저 등록은 버튼과 서버 양쪽에서 차단한다. CMS에서 유저 개최 허용을 켜기 전에는 티켓이 있어도 판매 등록되지 않는다.

전체 게이트 최초 실행 ea732c29d: 경매43검사와 출시정책 검사는 통과했고, 기존 용병 장비 테스트의 단일 편성 입력 및 sparse 자산 직접읽기에서 중단했다. 해당 fixture만 현재2용병 배열/SSS·SS 입력과 Git의 변경 없는 sparse 자산 읽기로 정정한다. 게임 전투 코드/원화는 바꾸지 않는다. 원본 실패 로그 deploy-ea732c29d.log는 보존하고 해시로 묶은 전체 게이트 이어가기를 사용한다.

이어가기 09bdbb1a9: 용병 장비11검사 통과. 도시182검사 중181통과·위장 이미지의 sparse 직접읽기1건 실패. 동일하게 해당 이미지 읽기만 변경 없는 Git blob으로 허용하며 원본 로그와 해시를 이어가기 증거에 추가한다.

이어가기 9a27ecfb1: 도시182검사 통과. API 런타임 검사에서 기존 단독 named import 문자열 가정이 새 경매 scheduler import를 거절했다. 같은 게임 진입점 검증을 유지하며 추가 import를 허용하고, 매분 cron이 공유 정산함수/대기 Promise를 연결하는 실제 어댑터 검사를 추가한다.

이어가기 ed44021ad: API 런타임7검사 통과. 계정동기화 단계14개 중 이미지 전달 원본/최적화 검증의 sparse 직접읽기1건 실패(나머지13통과). 원본·파생본 해시/용량 비교는 그대로 유지하고 변경 없는 sparse 자산을 Git에서 읽도록 해당 검사만 정정한다.

이어가기 f382bf200: 이미지1,282건에 파일마다 Git 프로세스2개를 실행하는 검수 코드가 과도하게 느려 해당 검수 프로세스만 중단했다. 미완료 단계를 통과로 세지 않는다. sparse 목록1회와 Git cat-file 스트림1개로 읽도록 검사 도구만 최적화하고 동일 원본/파생본 전체 해시를 다시 대조한다. 자산 복사·삭제 및 런타임 변경 없음.

이어가기 1b4fcda63: 이미지 전체 검증과 계정 동기화14검사 통과. 격전지 구검사는 이미 출시된2용병·군단 유상진행 정산을 반영하지 않아 실패했다. 해당 런타임3파일이 배포기준 fbf999a91과 동일함을 확인했다. 구1용병 방 시나리오는 명시적 과거 snapshot으로 고정하고, 실제 신규 API 방은 SSS+SS 두명을 입력한다. 군단 유상진행은 현행 SETTLED 응답과 행동력 미환불을 검증한다. 경매 외 게임 코드를 변경하지 않는다.

이어가기 fb75db8d9: 격전지·버닝·랭크 개편 단계 통과. ICON 검사의 sparse 원화/프레임4건 읽기 실패는 테스트 전용 공통 읽기로 보완한다. 로컬 파일이 실제로 없고 Git skip-worktree로 표시된 파일만 현재 커밋에서 읽으며, 원본/픽셀/해시 검증은 유지한다.

이어가기 6b05b9e0f: ICON 단계 통과. 듀오 전체공개 풀 테스트1파일이 구C등급·단일용병 입력으로 모든 후보를 탈락시켰다. 현재 SSS+SS 두명 편성 및 PostgreSQL 검수용 JSON 배열 인덱스 지원을 반영한다. 미편성/소유상실·공격 시점 교체·원자 원복·재시도 검증은 유지한다.

이어가기 3f9f09628: 듀오 편성해제3검사에서 테스트 자체의 직접 JSON 갱신이 실제 편성 저장의 프로필 버전 갱신을 생략했다. 검수 helper를 실제 dualMercenaryStatements로 연결한다. admission 경합 검사는 의도대로 버전 갱신 없는 SQL 주입을 따로 유지한다.

이어가기 88643434a: 듀오·마법공방·PostgreSQL 호환 단계 통과. 계급 원화21개는 동일 Git blob 검증으로 연결하고, 실제 프리뷰 서버 검사에 필요한 원수 PNG1개만 현재 체크아웃에 복원했다(내용 변경 없음). 시라누이 저장 입력2곳을 배열로 갱신하며 중장 조건·계급 하락 시 출전차단 검증을 보존한다.

이어가기 cf329624f: 계급 원화/서버 및 시라누이 PVE/PVP 편성 검증 통과 후, 같은 시라누이 검사의 랭크 소유권 guard도 현행6종 입력으로 정정했다. 계급 하락 시 원자 거절·승급 시 허용을 그대로 검증한다.

이어가기 d855a8e8c: 계급 단계 통과. 로비 원본 이미지가 sparse 체크아웃에 없어 네이티브 빌드가 ENOENT로 중단했다. 빌드가 직접 요구하는 로비 아이콘만 Git 정본으로 체크아웃한다. 일반 Node ENOENT 종료는 기존 이어가기 도구의 실패 인식 형식 밖이므로 이 로그를 원본 증거로 보존하고 직전 인식 가능한 cf329624f 로그부터 재개한다. 출시 게이트나 게임 코드를 완화하지 않는다.

이어가기 a4ad8af12: 상점·광산·Worker 컴파일·PVE 개편 단계 통과. PVE 전환 검사에서 카우2종 및 폐기장4종 sparse 원화/투명 PNG 읽기를 공통 Git 자산 읽기로 연결한다. 알파/테두리/전경 RGB 픽셀 조건은 유지한다.

이어가기 95718902a: PVE 전환 검사 통과. V3 배치 테스트의 sparse 용병 이미지 읽기 및 구1용병 상한 조건을 정정했다. 현재0~2명 양쪽 조합의 자리 수와3명/잘못된 입력 거절을 검증한다.

이어가기 af01f0cf3: V3 배치 단계 통과. 공통 용병 검사4파일의 sparse SD/녹음/역할별 원본 읽기, 현재 허용 SS·SSS 편성 배열 및 캐시 query 순서 가정을 정정한다. 슬롯별 독립 출전·권한·미소유 거절·레벨 고정·원본 해시/모션/음향 검증을 유지한다.

동시 main 기록 06a567ea8 병합: 혜야 용병 지급 완료 문서/원본 운영 스크립트를 보존하며 재실행하지 않는다. 신규 operations/ 추적 파일이 공개 포장에 포함되지 않도록 전용 폴더 제외와 원본 보존 검사를 추가했다. 포장 코드가 변경되었으므로 이전 로그는 보관하고 새 기준에서 전체 게이트를 처음부터 다시 실행한다. 게임 런타임·승인 아트/계정 값 변화 없음.

새 전체 게이트 c37f5c77c: 첫13단계 통과. 병합이 sparse 규칙을 재적용하여 체크아웃했던 원수 PNG가 다시 생략되었다. 프리뷰 서버 테스트는 원본 서버와 필요한8파일만 임시 fixture에 바이트 그대로 준비하여 허용/차단 URL을 검증하도록 안정화했다. 로비 빌드 아이콘도 현재 체크아웃에 다시 준비한다. 포장 변경 후 새 전체 로그를 해시 기준으로 재개한다.

## Full-gate runtime corrections before deployment

- Candidate ea32d5bae stopped at live connections. The full service-worker execution test caught an auction cache registration insertion that nested two loops and referenced an out-of-scope path. Restored independent loops and added actual activate/fetch coverage for original account and new auction resources; CMS cache removal and native no-store bypass are checked.
- Existing battle recovery selected scripts using old query strings, omitting the current bridge. It now selects only the two exact script filenames independently of cache query order; the existing stale-wrapper recovery and bounded-failure tests exercise this defect. The main loader runtime version is synchronized to the already shipped tactical HUD engine/bridge.
- Cache release updated to auction-user-off-20261103-v2 and ONE store derivatives regenerated. User hosting remains OFF and operator hosting ON. This runtime correction requires a fresh full release gate; previous gate logs remain preserved and are not reused.
- Legacy live-connection fixtures use the current array loadout API. S/SS assignment, single-unit selection in the current array API, and combat snapshots retain their previous assertions. Media hash/pixel/audio checks read only unchanged sparse assets from committed Git bytes. Nonblocking banner coverage includes the eight subsequent production adapters.

- Four fresh browser profiles passed after the runtime correction (`browser-runtime-repair/report.json`), including user hosting OFF and operator/prohibited-item controls. The payload VM fixture now binds the actual newly imported HUD module while retaining the original server event/order assertions.
