# 조직 세력전 · 서울/경기남부 · 공동 자금 (2026-10-15)

- 기존 클랜 세력전의 공격대 2 / 방어대 2, 부대당 5명, 공유 HP 100만, 서버 V3 덱 교전, 최대 HP의 15% 피해 반영, 20분 점령 보호 / 10분 재출정 / 15분 동일 지역 재공격 / 1분 개인 재교전을 그대로 사용한다.
- 하루 무작위 2회, 각 3시간. 영토전 동안 PAUSE하고 순연 회차는 3시간을 보장한다. 지도·편성은 KEEP한다. 기존 클랜 테이블의 멤버·지도·재화는 승계하거나 수정하지 않는다.
- 서울 25구와 경기남부 21시군, 총 46지역이다. 통계청 SGIS의 2013 전국 행정경계 공개 원본을 같은 좌표계로 투영한 실제 연속 지도다. 부천·안산·안양·성남·수원·용인의 일반구 내부 경계를 합쳐 시 단위로 유지하며 화성시도 한 게임 지역이다. 서울만 별도로 키우지 않고 전체 / 서울 확대 / 선택 지역 확대를 제공한다. 출처·이용 조건·보존 파일은 organization/faction/NOTICE.md에 기록했다.
- 단일 정책은 organization_faction_policy_v1. 설치 기본 OFF, 출시는 별도 ON 설정이다. LIVE/ASSIGNED 및 ON 또는 TEST/ASSIGNED 및 TEST가 일치해야 전투를 진행한다. CMS에서 소속 활성 구성원 중 지휘관을 지정하며 자동 지휘관·부대 편성은 하지 않는다.
- 기존 회차 개인 보상은 4지역 이상 점령한 조직의 해당 회차 참여자에게 각각 300억 코인·마스터의 별 30만·미스틱 에너지 300개다. 새 조직용 메시지 campaign key를 사용한다. TEST는 계정 메시지 보상을 지급하지 않는다.
- 공동 조직자금은 개인 코인과 별도 금고/원장에 보관한다. 지역당 회차 정산 금액과 아지트 2~5단계 비용은 null로 시작한다. null을 무료 또는 임의 기본값으로 해석하지 않는다. 회차 시작 시 금액을 고정하고 종료 시 점령수에 곱한다.
- 정산 상태·개인 보상 메시지·조직자금·원장은 같은 PostgreSQL 거래다. 개인 보상 메시지와 첨부는 일괄 쿼리로 저장한다. 정산 고유 키와 사용자 요청 영수증으로 재시도 중복 지급을 막는다.
- 지휘관의 업그레이드는 requestId / roundId / expectedStage / policyRevision을 검사한다. 보이는 단계·비용 버전이 바뀌면 차감 없이 다시 확인하게 한다. 자금 차감·원장·실제 organization_progress_v1.stage·영수증이 같은 거래다.
- V3 계정 스냅샷과 전투 계산은 조직 잠금 밖에서 실행하고, 반영 전 소속·상대·입장·기한·쿨다운을 재검증한다. 진행 회차를 임의 취소하는 운영 동작은 추가하지 않았다.
- 공개 round 응답에는 내부 배정 작업 토큰·임대 시간을 포함하지 않는다. 다른 조직의 비공개 설문·평가 전력을 반환하지 않는다.

## 연결

- installOrganizationFactionSchema(DB)
- handleOrganizationFaction({path,request,env,deps})
- tickOrganizationFaction(env,deps)
- GET organization/faction/overview 및 alerts
- POST organization/faction/formation, captains, garrison, launch, enter, strike, upgrade
- GET admin/organization/faction; POST /policy, /commander
- 독립 화면 /organization/faction/?roundId=...
- iframe 높이 알림: organization:faction:height
- 서버 및 본부 운영 연결·출시 영수증은 부모 조직 개방 작업 기록을 따른다.

## 검수

- tests/organization-faction-20261015.test.mjs: PostgreSQL 격리 회귀 5개 통과. 소속 권한, TEST 분리, HP/입장/재시도/쿨다운, 영수증 저장 실패 롤백, 정산 스냅샷, 기존 개인 보상, 공동자금 중복 방지, 업그레이드 가격 버전/동일 거래, 영토전 중단·재개.
- tests/organization-faction-20261015.browser.mjs: PC 1440px / 모바일 390px에서 46지역, 수원 출정, 부대 편성 표시, 공동자금과 개인 보상, 가로 페이지 넘침 없음, 무변경 새로고침 시 같은 SVG 노드 유지 확인.
- 최신 실제 경계 지도는 preview/organization-faction-v2/qa/의 PC 1440px / 모바일 390px 전체·서울·수원 확대 캡처로 검수했다. SVG 채색·경계선·선택 강조, 서울 라벨 가독성, 선택 자동 확대, 기존 출정·편성·자금 및 무변경 새로고침을 통과했다. 모두 격리 가상 계정이며 운영 계정/경제를 변경하지 않았다.
- tests/organization-faction-map-20261015.test.mjs: 원본 해시·대상 46개·일반구 병합·공유 경계 연결·서울/경기 실제 면적 비율 검사 통과. 빌더 --check로 동일 원본 재현 확인.
- 최초 육각형 지도와 캡처는 preview/organization-faction-v1/rejected-hex/ 및 v1/qa에 이력으로 보존하며 라이브에서 불러오지 않는다.
- tests/organization-faction-battle-20261015.browser.mjs: 격리 PostgreSQL 계정과 실제 V3 서버 빌더·클라이언트 리소스 로더로 PC 1440px / 모바일 390px에서 독립 화면 입장 → 전투 재생 → 전투실 복귀를 검증했다. 조직 세력전 제목, 10장 카드의 프레임 폭·화면 내 배치, 금색 이미지 복귀 버튼, 단일 공격 요청, 공유 HP 갱신, 복귀 시 캔버스 제거와 페이지 오류·리소스 404 없음도 확인했다. 공통 card.css를 먼저 로드하여 원본 카드 이미지 넘침을 해결했으며 운영 계정/경제는 변경하지 않았다.
