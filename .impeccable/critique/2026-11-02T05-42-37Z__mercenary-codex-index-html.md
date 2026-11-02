---
target: 용병도감 UI 검토
total_score: 25
max_score: 40
na_heuristics: 
p0_count: 0
p1_count: 2
target_identity: "file:C:\\Users\\User\\Downloads\\upload\\cnine-card\\output\\revan-live-20261027\\release-checkout\\mercenary-codex\\index.html"
target_fingerprint: "sha256:efe5486998ac81ae830d86dd6de9dc5d0d0a0169d4a44621756bfc281e726b7c"
target_path: "C:\\Users\\User\\Downloads\\upload\\cnine-card\\output\\revan-live-20261027\\release-checkout\\mercenary-codex\\index.html"
timestamp: 2026-11-02T05-42-37Z
slug: mercenary-codex-index-html
closed: true
---
Method: dual-agent (A: /root/design_review · B: /root/detector_review)

# 용병도감 UI 검토 — 2026-11-02

현재 용병도감은 리버스콜의 원화와 남색·금속 프레임, 초록 선택색이 일관된 화면이다. 가장 큰 개선점은 **도감 탐색에서 편성 관리가 차지하는 공간을 줄이고, 검색·선택 상태를 명확하게 연결하는 것**이다. 디자인 판단 점수는 **25/40, 개선 필요**다. 전면 재디자인보다 아래 네 항목을 먼저 수정하는 편이 효과적이다.

대상은 `output/revan-live-20261027/release-checkout/mercenary-codex/index.html`과 연관 app/model/style/command/limited 파일이다. 6개 파일의 정규화 SHA-256이 검토 시점 공개 운영 파일과 일치했다. 공개 도감 101종·리미티드 43종, 격리된 4종 보유 fixture를 사용했다. PC 1440×1000, 모바일 390×844 및 보조 320px의 headless Chrome 검토이며 실제 계정 저장이나 실기기 검수는 아니다.

## 디자인 건강도

0~4점의 검토자 판단이며 제품 전체에 대한 인증 점수가 아니다. 열 항목 모두 적용했다.

| 원칙 | 점수/4 | 핵심 판단 |
|---|---:|---|
| 상태 표시 | 3 | 수량·선택·출전 상태는 명확, 검색과 상세 관계 보완 필요 |
| 익숙한 언어 | 3 | 모험·대전·등급·보유 표시는 게임 맥락에 적합 |
| 사용자 제어 | 2 | 모바일 닫기 정상, PC 선택 뒤 초점 소실 |
| 일관성 | 3 | 프레임·색상·시즌 구분 일관 |
| 오류 예방 | 3 | 미보유·중복 등 조작 제약 존재, 운영 저장은 미검수 |
| 기억 부담 | 2 | 검색 밖 상세가 남아 대상 재확인 필요 |
| 탐색 효율 | 2 | 검색·정렬·즐겨찾기 제공, 키보드 이어가기 취약 |
| 정보 위계 | 2 | 모바일에서 관리 영역이 카드와 원화를 밀어냄 |
| 오류 복구 | 3 | 빈 검색 초기화와 조회 재시도 제공 |
| 도움말 | 2 | 규칙 제공하지만 핵심 편성 제한 글자가 9px |
| **합계** | **25/40** | **개선 필요** |

## 유지할 장점

- 승인 원화와 남색·금속 프레임, 초록 선택 상태가 게임의 정체성과 잘 맞는다.
- 같은 이름의 나무늘봉순 4종은 블랙크라운·블러드문·할로윈·기존 칭호로 구분된다. 시즌 구분 누락으로 지적하지 않는다.
- 고급 필터와 전투 규칙의 접기, 원화/SD 전환·확대, 모바일 상세 닫기와 선택 카드 초점 복귀가 유효하다. 확인한 너비에서 문서 가로 넘침이 없었다.

## 우선 수정할 네 항목

### 1. [P1] 모바일 도감 첫 화면에서 용병 이름을 보기 어렵다

390×844의 `전체 도감`에서 첫 카드가 y≈681~683부터 시작한다. 관리 링크 네 개와 현재 편성, 탭·새로고침·필터가 앞에 쌓이고, 카드 이름은 하단 고정 내비게이션보다 아래에 놓인다. 소유 상세도 편성 조작이 원화와 대표 스킬보다 먼저 크게 나타난다. 두 독립 평가에서 재현했다.

`전체 도감`·`리미티드`에서는 현재 편성을 한 줄 요약으로 접고, 검색과 첫 카드 행을 앞당긴다. 소유 상세는 이름·원화·대표 스킬을 먼저 보여 주고 `편성 변경`에서 모드와 슬롯을 펼친다. 기존 승인 원화·프레임·선택색을 유지한다.

명령: `$impeccable adapt`, `$impeccable layout`.

소스: [페이지 상단 구성](C:/Users/User/Downloads/upload/cnine-card/output/revan-live-20261027/release-checkout/mercenary-codex/index.html:8), [모바일 편성 높이](C:/Users/User/Downloads/upload/cnine-card/output/revan-live-20261027/release-checkout/mercenary-codex/command.css:121).
증거: [모바일 도감](C:/Users/User/Downloads/upload/cnine-card/operations/impeccable-codex-review-20261102/a/verified-v2-mobile-all.png).

### 2. [P1] PC 카드 선택 후 키보드 초점이 사라진다

A는 V-002, B는 17번째 카드 V-017에 초점을 두고 Enter를 눌렀다. 두 경우 모두 선택 후 초점이 BODY로 바뀌고, 다음 Tab은 첫 카드 V-001로 돌아갔다. 카드 101개 뒤에 상세가 있어 키보드만 쓰는 사용자의 탐색이 길어진다.

선택 상태만 갱신해 버튼 노드를 보존하거나 재렌더 직후 선택 카드의 초점을 복구한다. 상세로 바로 이동하고 원래 카드로 돌아오는 키보드 경로도 제공한다.

명령: `$impeccable harden`, `$impeccable audit`.

소스: [목록 재생성](C:/Users/User/Downloads/upload/cnine-card/output/revan-live-20261027/release-checkout/mercenary-codex/app.mjs:81), [카드 선택 처리](C:/Users/User/Downloads/upload/cnine-card/output/revan-live-20261027/release-checkout/mercenary-codex/app.mjs:135).
증거: [A 초점 기록](C:/Users/User/Downloads/upload/cnine-card/operations/impeccable-codex-review-20261102/a/focused-evidence.json), [B 독립 재현](C:/Users/User/Downloads/upload/cnine-card/operations/impeccable-codex-review-20261102/b/corrected/targeted-review.json).

### 3. [P2] 검색 결과와 상세가 다른 용병을 가리킨다

`프라임` 검색으로 목록은 프라임 레퀴엠 한 명이 되지만 오른쪽에는 이전 아우렌과 편성 버튼이 남는다. 결과가 0건이어도 이전 상세가 유지된다. 검색 결과의 능력치나 조작 대상으로 오해할 여지가 있다.

필터 뒤 선택한 용병이 결과 안에 있으면 유지하고, 결과 밖이면 `검색 결과에서 용병을 선택하세요` 상태로 바꾼다. 이전 상세를 유지해야 한다면 `검색 결과 밖의 이전 선택`임을 명시한다.

명령: `$impeccable harden`, `$impeccable clarify`.

소스: [필터 갱신](C:/Users/User/Downloads/upload/cnine-card/output/revan-live-20261027/release-checkout/mercenary-codex/app.mjs:153).
증거: [프라임 검색 후 아우렌 상세](C:/Users/User/Downloads/upload/cnine-card/operations/impeccable-codex-review-20261102/a/verified-v2-desktop-search-prime.png).

### 4. [P2] 핵심 편성 제한 안내가 9px로 표시된다

SSS·SS 편성 제한 문장이 PC와 모바일 모두 계산된 글자 크기 9px였다. 주변 13~16px 조작부보다 작아, 사용자가 편성 전에 알아야 할 조건이 잘 드러나지 않는다.

슬롯 가까이에 일반 도움말 크기인 13~14px로 배치하고, 주변 안내와 동일한 색·줄간격을 사용한다. 이는 화면 가독성 개선 목표이며 법적 적합성 판정이 아니다.

명령: `$impeccable typeset`.

소스: [두 용병 편성 안내 마크업](C:/Users/User/Downloads/upload/cnine-card/output/revan-live-20261027/release-checkout/mercenary-codex/app.mjs:100).
증거: [모바일 안내](C:/Users/User/Downloads/upload/cnine-card/operations/impeccable-codex-review-20261102/b/corrected/mobile-detail-top.png), [계산된 스타일](C:/Users/User/Downloads/upload/cnine-card/operations/impeccable-codex-review-20261102/b/corrected/mobile-detail-top.metrics.json).

## 자동 검사 해석

소스 검사 경고는 14건이었다: low-contrast 4, dark-glow 3, kicker-above-heading 3, cramped-padding 2, broken-image 1, radial-halo 1. 소스 위치가 모두 `index.html:0`으로 반환되는 도구 한계가 있어 확인된 항목의 실제 코드 위치는 직접 대조했다. app.mjs에서 경고가 없다는 결과를 전체 동적 UI의 무결성으로 해석하지 않는다.

정상 자산을 적용한 PC 전체 도감·모바일 보유 상세·모바일 리미티드 상세의 렌더 검사에서는 각각 같은 5개 신호(대비 3, 제목 위 라벨 2)가 반복되었다. 서로 다른 15개 결함이 아니다. 실제 확인된 자동 대비 신호는 푸터 보조문구 두 개의 약 4.0:1이다. 초록 이미지 배경 버튼은 검사기가 배경을 누락한 오탐이고, 닫힌 확대창의 빈 이미지와 숨겨진 구형 장식도 사용자에게 보이는 결함이 아니었다. 제목 위 영문 라벨은 현재 게임 스타일을 고려해 유지 대상으로 판단했다.

시각 평가와 자동 측정은 모바일 관리 영역 과다와 PC 초점 소실에서 일치했다. 자동 검사의 14개 경고를 그대로 수정 목록으로 바꾸지 않았다.

## 사용자별 부담과 경험

- 모바일 사용자(Casey): 도감에서 관리 영역을 지나야 카드 이름에 도달한다.
- 키보드 사용자(Sam): 카드 선택 뒤 탐색 위치를 잃는다.
- 숙련 수집가(Alex): 검색 뒤 이전 상세가 남아 조작 대상을 재확인해야 한다.

인지 부하는 8개 항목 중 단일 초점·시각적 위계·작업 기억 3개가 미흡해 중간 수준이다. 2명 편성 상세에는 목적지 4개와 해제 4개, 성장 진입이 함께 나타난다. 등급 7개는 익숙한 게임 규칙이므로 개수만을 이유로 줄일 대상은 아니다.

감정 흐름은 익숙한 게임 프레임으로 시작하고 원화·SD 감상에서 좋아지지만, 모바일 탐색 지연과 검색·초점 불일치에서 끊긴다. 모바일 닫기 후 선택 카드 복귀는 좋은 마무리다.

## 작은 개선 후보

- 푸터 보조 글자의 대비를 높인다.
- 리미티드 검색 초기화 버튼의 `전체 용병 보기`를 현재 동작에 맞는 `필터 초기화`로 바꾼다.
- `편성하기` 목록에서는 현재 숨긴 레벨·역할 중 선택에 필요한 정보를 한 줄로 드러낸다.
- 새로운 용병 상세를 열 때 스크롤 시작 위치를 명시적으로 정한다. 이전 읽기 위치 일부가 유지된 관찰은 있지만 핵심 장애로 분류하지 않았다.

## 후속 방향을 정할 질문

1. 개선 우선순위는 **모바일 탐색 / 키보드·검색 동작 / 글자 가독성** 중 어디인가?
2. 수정 범위는 **우선 항목 4개 / 작은 개선 후보까지 전체** 중 어디까지인가?

실행 승인 요청이 아니라 후속 개선 방향을 위한 선택지다. 이번 요청의 결과는 UI 검토이며 게임 소스 수정·배포를 수행하지 않았다.
