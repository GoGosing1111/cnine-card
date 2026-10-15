# 조직 인터페이스 V2 — 2026-10-15

사용자의 전체 버튼·설문 UI 반려로 배포를 중단하고 새 이미지 표면으로 교체했다. 입단/추천/조직/아지트/세력전/OWNER CMS를 하나의 charcoal·deep teal·ivory/amber 재질과 system sans 글꼴로 맞춘다. 예전 금장·장식체·CSS 그라디언트 버튼은 현재 화면에서 제거한다.

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

1440px 및 390px 실제 흐름, 모든 버튼의 interface-v2 이미지 사용, 선택/비활성 이미지, 7문항 실제 격리 PostgreSQL 제출/수정/전체 조직 선택, 아지트 선명도와 가로 넘침, 기존 20초 갱신 보존을 확인한다. 결과와 캡처는 검수 후 추가한다.

### 완료 결과

- 공개 입단/아지트 5/5 PASS, 익명 로그인·기존 갱신 보존 2/2 PASS. 실제 7문항 접수·수정·15개 조직 선택·배정 후 아지트 확인.
- CMS 2/2 PASS. 1440/390px 5개 탭 등 328개 컨트롤·260개 카드에서 새 이미지 적용, 404/페이지오류/가로 넘침 0.
- 세력전 지도/분대/읽기전용/알림/실제 V3 교전/결과 복귀 PC/mobile 2/2 PASS. 112개 조작 표면과 24개 비활성 버튼 감사 통과. 독립 시각검수 통과.
- disabled 우선순위를 보정해 주요 행동도 미응답/잠금 상태에서 disabled 전용 이미지를 사용한다. 긴 카드/모집/명단 패널은 생성 이미지 9-slice로 모서리 비율을 유지한다.
- runtime WebP 12종 374,184바이트. 12/12 원본·파생 해시와 alpha 검증 완료.
- 공개 캡처: preview/organization-interface-v2/public/. CMS 캡처: 로컬 Temp/cnine-organization-cms-20261015/. 세력전 캡처/기록: docs/organization-faction-interface-v2.md.
