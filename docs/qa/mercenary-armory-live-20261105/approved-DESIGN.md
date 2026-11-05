---
name: "리버스콜 용병 장비 · 로컬 준비본"
description: "로비 폰트와 승인 용병도감 리소스를 사용하는 어두운 RPG 장비 UI"
colors:
  background: "#0b1420"
  navigation: "#0b1720"
  text: "#f0f4fc"
  muted: "#b9c5d9"
  divider: "#33415b"
  lime: "#c8ff6b"
  gold: "#e2c88a"
  danger: "#ffb4a8"
  action-ink: "#18240a"
  item-surface: "#182535"
  item-selected: "#253143"
  item-hover: "#243346"
  item-border: "#56594e"
  slot-border: "#626052"
  field-surface: "#152333"
  field-border: "#53637b"
  other-wearer: "#ffd098"
typography:
  display:
    fontFamily: "'Pretendard Variable', Pretendard, 'Noto Sans KR', 'Malgun Gothic', sans-serif"
    fontSize: "30px"
    fontWeight: 780
    lineHeight: 1.3
    letterSpacing: "-0.025em"
  title:
    fontFamily: "'Pretendard Variable', Pretendard, 'Noto Sans KR', 'Malgun Gothic', sans-serif"
    fontSize: "26px"
    fontWeight: 750
    lineHeight: 1.35
    letterSpacing: "-0.025em"
  headline:
    fontFamily: "'Pretendard Variable', Pretendard, 'Noto Sans KR', 'Malgun Gothic', sans-serif"
    fontSize: "19px"
    fontWeight: 720
    lineHeight: 1.5
  body:
    fontFamily: "'Pretendard Variable', Pretendard, 'Noto Sans KR', 'Malgun Gothic', sans-serif"
    fontSize: "16px"
    fontWeight: 400
    lineHeight: 1.5
  label:
    fontFamily: "'Pretendard Variable', Pretendard, 'Noto Sans KR', 'Malgun Gothic', sans-serif"
    fontSize: "14px"
    fontWeight: 650
    lineHeight: 1.45
  item:
    fontFamily: "'Pretendard Variable', Pretendard, 'Noto Sans KR', 'Malgun Gothic', sans-serif"
    fontSize: "13px"
    fontWeight: 650
    lineHeight: 1.35
rounded:
  square: "0px"
  field: "4px"
  item: "6px"
spacing:
  tight: "6px"
  compact: "8px"
  control: "12px"
  section: "14px"
  inset: "16px"
  workspace: "18px"
  dialog: "20px"
  desktop-gutter: "28px"
components:
  button-secondary:
    textColor: "{colors.text}"
    typography: "{typography.label}"
    rounded: "{rounded.square}"
    padding: "3px 12px"
  button-primary:
    textColor: "{colors.action-ink}"
    rounded: "{rounded.square}"
    padding: "4px 14px"
  button-text:
    textColor: "{colors.muted}"
    padding: "8px"
  search-field:
    textColor: "{colors.text}"
    padding: "0 5px"
  select-field:
    backgroundColor: "{colors.field-surface}"
    textColor: "{colors.text}"
    rounded: "{rounded.field}"
    padding: "4px 8px"
  game-navigation:
    backgroundColor: "{colors.navigation}"
    padding: "10px 28px"
  panel:
    rounded: "{rounded.square}"
  gear-card:
    backgroundColor: "{colors.item-surface}"
    textColor: "{colors.text}"
    rounded: "{rounded.item}"
    padding: "10px 5px 8px"
  gear-card-selected:
    backgroundColor: "{colors.item-selected}"
    textColor: "{colors.text}"
    rounded: "{rounded.item}"
  equipment-slot:
    backgroundColor: "{colors.item-surface}"
    textColor: "{colors.text}"
    rounded: "{rounded.item}"
    padding: "4px"
---

# Design System: 리버스콜 용병 장비

## Overview

**Creative North Star: "어두운 RPG 장비실"**

사용자가 확정한 어두운 RPG 시안이다. 로비의 Pretendard Variable과 승인 용병도감의 남색 패널·연두색 버튼을 그대로 사용한다. 큰 용병 원화와 짙은 아이템 칸이 중심이며, 착용 대상·현재 착용자·전장·수치를 함께 읽을 수 있는 밀도를 유지한다.

이 문서는 완성된 로컬 준비본의 구현을 기록한다. 시연 보유 데이터와 브라우저 저장만 포함하며 운영 화면·API 연동의 완료를 의미하지 않는다. 시각적 권위는 사용자 지정 기존 자산이며 별도 QUALITY BAR 카탈로그는 선택되지 않았다.

**Key Characteristics:**

- 로비와 동일한 Pretendard Variable 1.3.9.
- 승인 도감 이미지로 만든 남색 패널과 연두색 실행 버튼.
- 원화 전체를 보존하는 큰 이미지와 세로 다섯 장비 슬롯.
- 금색 선택선, 문자로 명시한 착용자와 PVE/PVP 비교.
- 모바일의 용병 선택·장비 비교 하단 시트.

근거: `style.css`, `index.html`, `app.mjs`, `qa/desktop.png`, `qa/tablet.png`, `qa/mobile.png`. 선택 이력은 `qa/direction-selection.json`, 이미지·폰트의 출처와 해시는 `asset-provenance.json`에 보존한다.

## Colors

어두운 남색 바탕에 밝은 본문과 연두색 조작 강조, 금색 장비 정보가 놓인다. 위 frontmatter가 CSS 색상값의 기준이며 이미지 내부 색은 별도 평면색으로 근사하지 않는다.

### Primary

- **연두 강조** (`lime`): 선택 용병, 선택 보관함 탭, 수치 증가, 키보드 초점.
- **실행 버튼 글자** (`action-ink`): 승인 연두색 버튼 이미지 위의 짙은 글자. 버튼의 실제 바탕은 `action-user-approved.webp`다.

### Secondary

- **장비 금색** (`gold`): 장비 전투력, 장착 수, 선택 아이템·슬롯의 테두리.
- **이전 착용자 주황** (`other-wearer`): 다른 용병이 사용 중인 실물과 이동 안내.
- **감소 연홍** (`danger`): 비교 감소값과 오류 알림. 부호·문구를 함께 사용한다.

### Neutral

- **깊은 남색** (`background`, `navigation`): 페이지와 상단 메뉴.
- **밝은 본문·보조 글자** (`text`, `muted`): 제목·값과 설명·상태.
- **차분한 구분선** (`divider`): 목록, 비교표, 전투력 요약의 구획.
- **아이템 바탕과 선** (`item-surface`, `item-selected`, `item-hover`, `item-border`, `slot-border`): 사용자 승인 아이템 칸.
- **입력 바탕과 선** (`field-surface`, `field-border`): 기본 select 필터.

**The Approved Resource Rule.** 패널과 주요 버튼은 승인 이미지의 원본 바이트와 슬라이스 규격을 사용한다. 자산 출처는 외부 manifest로 기록하며 이미지에 메타데이터를 덧붙이지 않는다.

## Typography

**Display / Body Font:** 로비의 Pretendard Variable 1.3.9. fallback 순서는 frontmatter에 기록한 스택을 따른다. 가변 굵기 범위는 100–900, 합성 글꼴은 비활성화한다. 본문과 제목에 별도 장식 서체를 섞지 않는다.

### Hierarchy

- **Display:** 페이지 제목. 모바일은 25px, 360px 이하는 24px.
- **Title:** 선택 용병 이름. 모바일은 23px, 360px 이하는 21px. 긴 이름은 줄바꿈한다.
- **Headline:** 내 용병·장비 보관함 제목.
- **Body:** 기본 한글 본문. 실제 설명·목록은 12–15px 범위로 조밀하게 배치한다.
- **Label:** 일반 패널 버튼. 주요 실행은 굵기 750을 사용한다.
- **Item:** 장비 이름. 모바일에서는 12px, 이름은 여러 줄로 표시할 수 있다.

전투력과 비교 숫자는 tabular-nums를 사용한다. 최종 CSS의 실물 ID·슬롯 상태·원화 보기·아이템 착용자 글자는 작은 화면에서도 11px이다. 다른 보조 글자의 전체 최소 크기를 뜻하지 않는다.

**The Lobby Type Rule.** 제목·버튼·입력·수치는 동일한 로비 글꼴 계열을 사용하고, 크기와 굵기로 위계를 구분한다.

## Layout

컨테이너 최대 폭은 1632px이다. 기본 좌우 여백은 28px, 모바일은 12px, 360px 이하는 8px이다. 주요 패널 간격은 18px, 모바일은 14px이다.

| 화면 폭 | 실제 배치 |
| --- | --- |
| 1200px 초과 | 216px 명부, 가운데 원화·장착, 오른쪽 보관함의 세 열. 원화 옆 슬롯 열은 90px이며 1600px부터 108px. |
| 761–1200px | 190px 명부와 본문 두 열. 보관함은 장착 패널 아래. 보관함 이동 버튼을 제공한다. 장비 목록은 네 열. |
| 361–760px | 한 열. 명부를 용병 변경 시트로 대체한다. 원화 옆 슬롯 열 72px, 장비 목록 세 열. 비교는 하단 시트. |
| 360px 이하 | 슬롯 열 65px, 장비 목록 두 열. 정렬 필터는 두 필터 아래 전체 폭. |

기본 장비 목록은 세 열이며 원화는 contain으로 전체를 보여준다. 데스크톱 명부는 상단 16px에서 sticky이며 내부 목록을 스크롤한다. 기능 선택은 명시적 버튼·필터로 제공한다.

**The Contained Comparison Rule.** 761px 이상에서 보관함 높이는 auto, max-height는 none이다. 장비 목록만 max-height 380px로 스크롤하고 비교 내용과 실행 버튼에 맞춰 바깥 패널이 늘어난다.

모바일 목록의 최대 높이는 510px, 하단 시트의 최대 높이는 88dvh이다. 마지막 배치 검수에서 주요 버튼 하단과 패널 내부 사이 여백은 PC·태블릿 22px, 모바일 28px였으며 이는 `qa/layout-review-report.json`의 관측값이다.

## Elevation & Depth

깊이는 승인 패널 이미지의 남색 톤과 금속성 모서리에서 나온다. 일반 패널은 box-shadow가 없다. 모달은 어두운 backdrop으로 배경 조작을 가리고, 토스트만 부드러운 그림자를 사용한다.

- **일반 패널:** `box-shadow: none`.
- **토스트:** `box-shadow: 0 10px 24px #0005`.
- **모달 뒤:** `background: #040a12d9`.

버튼 hover는 밝기 1.08로 바뀌며 filter 전환은 180ms ease-out이다. 로딩 막대는 1.2s ease-in-out alternate 반복이다. reduced-motion 요청 시 애니메이션·전환을 끄고 보관함 이동도 즉시 수행한다.

## Shapes

도감 패널·버튼은 사각형 이미지 테두리다. 패널은 투명 border 8px과 `48 fill / 16px stretch`, 일반 버튼·검색틀은 투명 border 7px과 같은 슬라이스를 사용한다. 주요 버튼은 투명 border 9px과 `38 fill / 9px stretch`를 사용한다.

아이템과 슬롯은 작은 둥근 모서리, 필터는 그보다 작은 둥근 모서리를 사용한다. 승인 이미지의 실루엣을 CSS 도형으로 다시 그리지 않는다. 아이콘은 `app.mjs`의 선형 inline SVG이며 문자를 아이콘으로 대체하지 않는다.

## Components

### Buttons

남색 패널 버튼과 연두색 실행 버튼이 같은 도감 자산 계열을 따른다. 일반 버튼은 최소 48px, 주요 실행은 최소 54px이다. 모바일 일부 탐색·전장 버튼은 44–46px의 관측된 변형을 사용한다. 아이콘 버튼은 기본 폭 48px이다.

hover는 밝기 변화, disabled는 채도 0.3·불투명도 0.65다. 키보드 초점은 연두 2px outline과 3px offset으로 표시한다. 텍스트 버튼은 밑줄이 있으며 최소 높이 44px이다.

### Cards / Containers

아이템 칸은 이미지, 이름, 전투력, 착용자, 실물 ID를 표시한다. 선택 시 금색 border와 1px outline, 다른 바탕색을 함께 적용한다. 슬롯은 부위 이름과 장착 중·미장착을 명시한다. 색만으로 착용 상태를 구분하지 않는다.

원화는 contain으로 표시하며 큰 원화 모달을 연다. 명부의 작은 원화만 cover와 세로 22% 위치를 사용한다. 도감 패널은 실제 이미지 fill을 유지한다.

### Inputs / Fields

검색은 남색 도감 이미지 틀과 inline SVG 돋보기를 사용한다. 입력은 14px이며 검색어 길이는 80자로 제한한다. 부위·착용자·정렬은 최소 높이 44px의 기본 select다. 도감 조회에서는 착용자 필터를 비활성화한다.

### Navigation

상단은 뒤로, 용병도감, 로비 링크를 유지한다. PVE/PVP는 pressed 상태를 갖는 두 버튼이며 선택 전장에 연두 실행 이미지를 사용한다. 보유 장비·장비 도감은 남색 버튼을 유지하고 선택 글자만 연두색으로 바꾼다. 760px 이하에서 상단 위치 안내를 숨긴다.

### Comparison & Transfer

대상 용병·전장·부위를 비교 시작 지점에 표시한다. 선택 전장의 변경값과 다른 전장의 유지값을 별도 행으로 보여준다. 모바일에서는 대상·전장을 시트 제목으로 옮겨 중복을 줄인다.

실물 하나는 한 용병에게만 귀속된다. 같은 용병의 두 모드 사용은 가능하며 다른 용병에게 이동할 때 이전 착용자의 해당 모드 참조를 모두 해제한다. 이동 확인은 이전 착용자·해제 모드·새 착용자·적용 모드와 교체된 장비의 남은 착용을 설명한다. 미보유 도감 항목에는 장착 실행을 제공하지 않는다.

모바일 비교는 native dialog로 열고 닫은 뒤 선택 아이템으로 초점을 돌린다. 목록은 방향키·Home·End를 지원한다. 저장·오류는 live status로 알리고 토스트는 5.5초 표시한다. 이 동작은 로컬 예시 데이터의 준비 구현이다.

## Do's and Don'ts

### Do:

- **Do** 로비 Pretendard Variable과 승인 도감 패널·버튼 원본을 사용한다.
- **Do** 큰 원화의 전체 구도와 승인된 아이템 칸을 유지한다.
- **Do** 장비 비교에서 대상 용병·전장·착용자·유지되는 모드를 문자로 명시한다.
- **Do** 긴 비교 내용에 맞춰 넓은 화면의 패널을 늘리고 장비 목록만 스크롤한다.
- **Do** 자산의 출처와 해시를 외부 `asset-provenance.json`으로 보존한다.

### Don't:

- **Don't** 폐기된 밝은 장비실 방향을 최종 디자인으로 사용한다.
- **Don't** 승인 원화·UI 이미지의 픽셀이나 메타데이터를 변경한다.
- **Don't** 장비 선택을 전투 편성 변경으로 연결하거나 다른 용병끼리 같은 실물을 공유하게 표현한다.
- **Don't** 로컬 보유 예시·브라우저 저장을 운영 계정 또는 API 연동 완료로 설명한다.
