# 조직 인터페이스 V2 — 2026-10-15

사용자의 전체 버튼·설문 UI 반려로 배포를 중단하고 새 이미지 표면으로 교체했다. 입단/추천/조직/아지트/세력전/OWNER CMS를 하나의 charcoal·deep teal·ivory/amber 재질과 system sans 글꼴로 맞췄다. 예전 금장·장식체·CSS 그라디언트 버튼은 현재 화면에서 제거했다.

## 이미지

- assets/ui/organization/interface-v2/manifest.json 및 prompts.json. built-in imagegen 생성 원본 보존, 배포용 WebP.
- action default/primary/selected/disabled, choice default/selected, tab default/selected, icon default/selected, dossier-panel.
- 버튼 문자와 접근성 이름은 HTML이다. CSS 배치·hover 밝기·focus outline은 유지하며 버튼 바탕/프레임은 실제 이미지다.
- 기존 도시 배경·조직 문양·1536px 아지트와 서울/경기 실제 경계는 유지한다.

## 범위

- 입단: 시작/로그인/7문항 진행/답변 radio/이전/다음/추천 조직/전체 15개 선택/지원/수정/철회/제출 답변 펼치기.
- 본부: 4개 메뉴/아지트 5단계/현재 거점 복귀/승급/명부/운영 TEST/오류 재시도.
- 세력전: 지도 보기/확대/탭/선택/편성/분대/배치/입장/교전/모달/복귀/잠금 상태.
- CMS: 5개 탭/모집/평가/배정/세력전/자금/비용/지휘관/원장/입력/잠금.

## 검수

1440px 및 390px 실제 흐름, 모든 버튼의 interface-v2 이미지 사용, 선택/비활성 이미지, 7문항 실제 격리 PostgreSQL 제출/수정/전체 조직 선택, 아지트 선명도와 가로 넘침, 기존 20초 갱신 보존을 확인했다. 결과와 캡처는 아래 완료 결과에 기록했다.

### 완료 결과

- 공개 입단/아지트 5/5 PASS, 익명 로그인·기존 갱신 보존 2/2 PASS. 실제 7문항 접수·수정·15개 조직 선택·배정 후 아지트 확인.
- CMS 2/2 PASS. 1440/390px 5개 탭 등 328개 컨트롤·260개 카드에서 새 이미지 적용, 404/페이지오류/가로 넘침 0.
- 세력전 지도/분대/읽기전용/알림/실제 V3 교전/결과 복귀 PC/mobile 2/2 PASS. 112개 조작 표면과 24개 비활성 버튼 감사 통과. 독립 시각검수 통과.
- disabled 우선순위를 보정해 주요 행동도 미응답/잠금 상태에서 disabled 전용 이미지를 사용한다. 긴 카드/모집/명단 패널은 생성 이미지 9-slice로 모서리 비율을 유지한다.
- runtime WebP 12종 374,184바이트. 12/12 원본·파생 해시와 alpha 검증 완료.
- 공개 캡처: preview/organization-interface-v2/public/. CMS 캡처: 로컬 Temp/cnine-organization-cms-20261015/. 세력전 캡처/기록: docs/organization-faction-interface-v2.md.


## 라이브 반영·검증 완료

- 배포 소스: 081f054f72799e2799d31e52a3691da72b83c956. Pages 배포 bb65fa42-bc99-4129-a7c2-0a0bb42d39f7 success.
- [고정 배포 주소](https://bb65fa42.cnine-card.pages.dev)와 [운영 조직 본부](https://cnine-card.pages.dev/organization/)에 반영했다. 앱 캐시는 20261015-organization-interface-v3이다.
- 전체 release gate와 production guard PASS. 후보·로그·변경 파일 해시에 묶인 continuation으로 기존 통과 구간을 보존했으며, 최종 organization-interface-v2-deploy-resume4-20261015.log의 종료 코드는 0이다.
- 배포 후 읽기 전용 검사 22개 PASS: 조직 본부·세력전·OWNER CMS 페이지 3개, CSS 5개, 새 WebP 12개, 실제 경계를 사용한 46지역 지도, 공개 콘텐츠 현황. 기록은 작업트리 상위 organization-live-readonly-2026-10-15T08-36-34-261Z.json이다.
- 실제 개방 후 API도 PASS했다. ORGANIZATION / FORMATION / 조직 입단 모집, 7문항·24시간 안내와 마감 시각이 공개 콘텐츠 현황에 표시된다. 후속 기록은 작업트리 상위 organization-live-readonly-2026-10-15T08-37-13-719Z.json이다.
- 조직 입단 1차 모집은 2026-10-15 17:36:57.178 KST부터 2026-10-16 17:36:57.178 KST까지 정확히 24시간이다. LIVE/SURVEY, 자동 균등 배정 대기와 스케줄러의 마감 시각을 확인했다.
- 세력전은 ON revision 1로 개방했으며 조직 자금 수입과 아지트 2~5단계 비용은 사용자 입력 전 null을 유지했다. 회차·개방 영수증·worker 버전·스케줄러 확인값은 organization-live-20261015.md의 운영 반영 기록을 따른다.
- 실제 운영 브라우저에서 https://cnine-card.pages.dev/organization/ 를 다시 불러와 새 UI 이미지, 조직 입단 접수 중, 7문항, 10월 16일 17:36 마감, 4개 탭, 입단 심사 시작 버튼을 직접 확인했다. 실제 신청·답변 제출은 하지 않았다. 라이브 읽기 전용 캡처는 preview/organization-interface-v2/live/organization-live-interface.jpg이며 위 격리 QA 캡처와 구분한다.
