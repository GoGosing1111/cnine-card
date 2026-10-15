# 조직 LIVE 입단·세력전·아지트 — 2026-10-15

## 확정 운영 정책

- 최초 개방부터 서버 기준 24시간. 7문항 입단 심사와 희망 조직을 제출하며 마감 전 수정·철회 가능하다.
- 마감 뒤 분당 스케줄러가 보유 계정 전력을 평가하고 인원·전력 균형과 설문 성향·희망을 종합해 배정한다. 브라우저나 OWNER 로그인 유지가 필요하지 않다.
- 15개 조직, 각 최대 10명, 총 150명. 초과 처리 정책은 미지정이다. 151명 이상은 신청서를 보존한 채 배정을 보류하며 임의 선착순 탈락이나 추가 조직을 만들지 않는다.
- 기존 클랜 회원·자산은 자동 이전하지 않는다. 기존 클랜 폐쇄와 별도 영토전은 유지한다.
- 세력전은 서울 25개 구와 경기남부 21개 시·군, 총 46개 지역이다. 기존 공격·방어 2개 분대, 각 5명, 공유 HP와 점령·쿨다운·하루 2개 3시간 회차·영토전 중 일시정지 및 개인 보상을 유지한다.
- 조직 공동 자금은 별도 잔액과 원장으로 관리한다. 세력전 회차 시작 시 수입 단가를 고정하고 회차 종료 당시 점령 지역 수에 적용한다.
- 사용자가 CMS 직접 입력을 지정했으므로 지역당 자금 수입과 아지트 2~5단계 비용은 null이다. 미입력 수입은 적립하지 않으며 비용 미입력 단계는 승급 불가다.
- 지휘관은 CMS에서 실제 해당 조직원 중 지정한다. 지휘관만 공동 자금을 소모해 한 단계씩 승급하며 잔액·원장·단계·영수증은 같은 거래다. 현재 단계와 비용 정책 버전도 검증한다.

## 구현

- 조직 API: functions/_organization.js, _organization_schema.js, _organization_ratings.js.
- 세력전 API: functions/_organization_faction.js, _organization_faction_model.js.
- API 런타임·스케줄러: functions/api/[[path]].js 및 workers/clan-draft/src/organization-schedule.js.
- 유저 화면: /organization/, /organization/faction/. 기존 클랜 주기 조회가 iframe을 다시 만들지 않도록 보존한다.
- OWNER CMS: /admin/#organization. 모집·신청자 / 전력·균등 배정 / 세력전 운영 / 조직 자금·아지트 / 명부·자금 원장.
- 콘텐츠 현황: 실제 접수 마감 시각과 배정 상태를 표시하고 조직 본부로 이동한다.
- 개방 도구: scripts/operations/open-organization-live-20261015.mjs. 명시적 schema 설치와 dry run, 단일 개방 영수증으로 재실행해도 24시간 마감 시각을 연장하지 않는다.
- 스키마는 별도 조직 테이블과 모집 시각·작업 임대 열만 추가한다. API 요청에서 DDL을 실행하지 않는다.

## 이미지 제작·보존

built-in image_gen을 사용했다. 기존 합본에서 약 270px 영역을 확대하던 아지트를 단계별 1536×1024 원본과 960/1536px WebP로 교체했다. 원본 PNG는 그대로 보존하고 파생본은 균일 축소·WebP 인코딩만 적용했다.

- assets/ui/organization/hideouts-hd-v1/manifest.json — 5단계 원본·파생본·해시.
- assets/ui/organization/hideouts-hd-v1/prompts.json — 최종 생성 프롬프트.
- assets/ui/organization/war-v1/manifest.json — 수도권 작전지도 배경 원본·파생본·해시.
- assets/ui/organization/war-v1/prompts.json — 최종 지도 프롬프트.
- 배경은 분위기용이다. 서울 25구 + 경기남부 21시군의 실제 경계는 통계청 SGIS KOSTAT 2013 전국 원본을 함께 투영한 연속 SVG로 제공한다. 일반구를 시 단위로 합치고 광역 전체 / 서울 확대 / 선택 지역 확대에서 46지역 점령 조작을 유지한다. 출처는 organization/faction/NOTICE.md, 빌더는 scripts/build-organization-faction-map.mjs, 최신 PC/모바일 검수는 preview/organization-faction-v2/qa/다.
- 입단 답변·탭·확정·아지트·세력전·CMS 버튼은 최신 사용자 지시에 따라 interface-v2 imagegen 자산으로 전면 교체한다. 구형 금장 프레임과 장식체를 제거하고 기본·선택·주요 행동·비활성 표면을 통일한다. docs/organization-interface-v2-20261015.md를 따른다.

## 검수

- LIVE 서버: 정확한 24시간, body 읽기·DB 잠금 후 마감 재검증, 마감 뒤 신규·수정·철회 차단, 승인 영수증 재시도 보존.
- 배정: 150명 전원·각 10명, 동시 스케줄러 중복 방지, 거래 실패 전원 롤백, 다음 tick 복구, 계정 전력 버전 변경 시 오래된 평가 폐기.
- 초과: 151명 전원 신청 보존 및 배정 보류. 기존 클랜 불변.
- 세력전: 권한·LIVE/TEST·공유 HP·쿨다운·회차 스냅샷·중복 정산·승급 원자성·과거 비용 버전 차단·영토전 일시정지.
- CMS: 실제 /admin/ 스타일을 사용한 1440/390px, null 설정·명부·지휘관·영수증 재시도.
- 입단: 1440/390px에서 7문항→추천→실제 격리 API 접수→재접속 보존→마감 UI/API 차단.
- 20초 클랜 갱신 3회(조회 오류 포함)에서 iframe 문서·탭·단계·포커스·스크롤 보존.
- 아지트 5단계 로드 이미지 폭 960px 이상, 공동 자금 표시, 가로 넘침·브라우저 오류 없음.
- 세력전 경제·권한·TEST 분리 코드 독립 검토 완료.
- 독립 세력전 페이지에서 실제 현행 V3 로더·전투 시뮬레이터로 1440/390px 입장→전투→복귀 확인. 카드 공통 CSS 누락을 수정해 카드 10장 배치와 단일 공격·복귀 정리·공유 HP·오류/404 없음 검수.

## 운영 반영 기록

### 배포 완료

- 배포 소스 커밋: 081f054f72799e2799d31e52a3691da72b83c956.
- Cloudflare Pages 배포 bb65fa42-bc99-4129-a7c2-0a0bb42d39f7: success. [배포 고정 주소](https://bb65fa42.cnine-card.pages.dev), [운영 조직 본부](https://cnine-card.pages.dev/organization/).
- 공개 앱 캐시: 20261015-organization-interface-v3.
- API worker 버전: b290863f-13ce-4053-b1ac-18848c9a64f3. 조직 스케줄러 버전: 23cd4bf4-73b9-4c95-ab95-1fa82622db5b.
- 전체 release gate와 production guard PASS. 후보·로그·변경 파일 해시를 검증하는 continuation으로 앞서 통과한 구간을 보존했다. 최종 로그는 작업트리 상위의 organization-interface-v2-deploy-resume4-20261015.log이며 종료 코드 0이다.

### 실제 24시간 모집 개방

- 별도 조직 스키마 설치 및 개방 dry run 후 실제 개방을 완료했다.
- 회차: e5421b84-8888-4027-8a36-f58d7f033ab1 / 조직 입단 1차 모집.
- 상태: LIVE / SURVEY / revision 1 / auto_assign 1 / assignment_status WAITING.
- 모집 시작: 2026-10-15 17:36:57.178 KST (2026-10-15T08:36:57.178Z).
- 모집 마감: 2026-10-16 17:36:57.178 KST (2026-10-16T08:36:57.178Z). 서버 저장 간격은 정확히 86,400,000ms다.
- 개방 영수증: organization_live_opening_20261015 / replayed false / audit 46517.
- 세력전 정책은 OFF revision 0에서 ON revision 1로 전환했다. fundsPerRegion은 null, upgradeCosts는 [0,null,null,null,null]로 유지했다. 미입력 자금 적립·승급은 계속 잠겨 있다.
- 개방 거래는 실제 신청서·조직원·기존 클랜·개인 재화를 변경하지 않았다.

### 운영 확인

- 스케줄러 확인 시각: 2026-10-15T08:37:13.184Z. 모집 처리 버전 20261015-live-24h, waiting true, nextCheckAt은 위 모집 마감 시각이다.
- 세력전 스케줄러는 enabled true, rounds 0으로 확인됐다.
- 공개 콘텐츠 현황 API에서 ORGANIZATION / FORMATION / 조직 입단 모집과 7문항·24시간 안내 및 실제 마감 시각을 확인했다.
- 배포 후 읽기 전용 검사 22개 PASS: 페이지 3개, CSS 5개, WebP 12개, 실제 서울·경기남부 46지역 지도, 콘텐츠 현황 API. 기록은 작업트리 상위의 organization-live-readonly-2026-10-15T08-36-34-261Z.json이다.
- 개방 후 공개 API 확인 PASS: 작업트리 상위의 organization-live-readonly-2026-10-15T08-37-13-719Z.json. 운영 쓰기를 추가하지 않고 모집 상태와 마감 시각을 확인했다.

- 실제 운영 브라우저에서 https://cnine-card.pages.dev/organization/ 를 다시 불러와 새 UI 이미지, 조직 입단 접수 중, 7문항, 10월 16일 17:36 마감, 4개 탭, 입단 심사 시작 버튼을 직접 확인했다. 실제 신청·답변 제출은 하지 않았다. 라이브 읽기 전용 캡처는 preview/organization-interface-v2/live/organization-live-interface.jpg이며 위 격리 QA 캡처와 구분한다.

### 배포 검사 호환 보정

82ae90eb4 후보의 전체 검사는 test:v3-joint까지 진행 후 기존 mercenary-combat-v3.test.mjs의 MS-057/PVE/V-056 금지 기대값 한 건에서 멈췄다. 조직 작업 전 커밋 34659440b가 해당 스킬의 PVE·PVP 허용을 확정했고 런타임/seed는 반영했으나 테스트만 과거 금지를 유지했다. 기준 8f6c20774 대비 관련 런타임과 테스트는 변경이 없었음을 확인했다. 검수는 이 조합의 허용·WINDUP을 확인하도록 옮기고 다른 3개 금지 조합은 유지했다. 게임 실행 코드·정책 변경 없음. 기존 resume-release-gate의 후보 SHA/로그 SHA/변경파일 검증을 사용해 완료된 앞 구간을 보존하고 실패한 V3 구간부터 재검사했다.

후속 test:live-connections는 기존 시라누이 재생 어댑터가 테스트 source 집계에서 빠진 점과 과거 번들 캐시 버전 literal 때문에 중단됐다. 관련 실행 코드·번들은 조직 기준 이전 상태와 같았다. 누락된 현재 source를 포함하고 source/bundle/bridge runtime 및 app/bridge fallback 캐시 주소의 일치 계약으로 검수만 보정했다. 기존 전투 동작이나 배포 gate 명령은 변경하지 않는다. 원본 검사 로그와 첫 continuation 로그의 해시·후보 커밋을 모두 보존해 다음 구간을 이어갔다.

클랜 메뉴 관련 검수는 사용자 지정 명칭인 조직 및 최신 조직 UI 캐시 버전에 맞췄다. 실제 클랜 폐쇄·조직 진입 보호는 유지한다. 이미 통과한 51개 이전 구간은 continuation 로그로 보존한다.


후속 test:apocalypse의 boss-sd-v2048.test.mjs도 기존 106-combat-flow 캐시 기대값만 main/recovery loader 캐시 및 실제 source runtime 동등성으로 보정했다. 보스·전투 런타임과 정책은 변경하지 않았다. 뒤 구간의 배틀슈트 검수는 실제 프리뷰 캐시와 일치해 수정 없이 단일 파일 7/7 PASS를 확인했다. 전체 gate와 production guard는 최종 continuation에서 통과했고 위 배포·모집 개방을 완료했다.
