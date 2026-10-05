# 버스기사 · 행정부 정직원

사용자가 붙여넣은 레이드 버스 기사 모집 글과 “칭호 만들어라 버스기사 이쁘게 만들어” 요청으로 만든 칭호 리소스 시안이다. 민트 버스, 금빛 운전대·월계수, 아이보리 날개로 친절하고 든든한 정직원 배지를 구성했다. 주 문구는 **버스기사**, 리본 문구는 **행정부 정직원**이다.

- 완성 투명 PNG: [assets/bus-driver-title-v1.png](assets/bus-driver-title-v1.png), 2252×804 RGBA.
- 글자 없는 생성 원본: [assets/bus-driver-ornament-v1.png](assets/bus-driver-ornament-v1.png), 2172×724 RGBA. 내장 `image_gen` 생성 결과를 바이트 그대로 보존한다.
- 생성 프롬프트: [prompt.json](prompt.json). 그림은 내장 도구로 제작하고, 한글은 `title.js`의 Canvas 2D 별도 계층으로 렌더링했다. 기존 Black Han Sans 폰트와 OFL 라이선스를 사용한다.
- 재현: [index.html](index.html)을 열면 폰트 로딩 후 원본과 두 텍스트 계층을 합성한다. “투명 PNG 저장”이 동일한 구도의 알파 PNG를 내보낸다. 외곽 투명 여백 40px를 추가하며 그림 자체를 편집·재생성·변형하지 않는다.
- 검수: PC와 모바일에서 문구·배경 전환·투명 PNG 출력·가로 넘침·320px/180px 주 문구 가독성을 확인했다. `qa/browser-review.json`, `qa/desktop.jpg`, `qa/mobile.jpg`와 `qa/asset-check.json`에 기록한다.

최초 작업은 칭호 그림과 프리뷰 제작이었다. 후속 사용자 “해라”로 실제 게임 반영을 승인했다. `RAID_BUS_DRIVER` 카탈로그를 **활성·공개, CMS 수동 지급, 초기 전투력 0**으로 등록한다. 기존 칭호 목록·보유자 장착/해제·공용 닉네임 배지·명함·CMS 편집/지급에 연결한다. 새 이미지나 한글을 다시 만들지 않고 완성 PNG를 `/assets/ui/titles/raid-bus-driver-v1.png`로 그대로 복사했다.

지급 대상 계정은 지정되지 않아 자동 지급하지 않는다. 주급·활동량 보상도 이 칭호 등록과 별개다. 이후 CMS에서 변경한 설정을 재배포가 덮어쓰지 않으며, 등록 행과 완료 marker를 기존 DB 배치에 함께 저장한다. [실제 장착 렌더러 검수](live.html), [CMS 편집 화면 검수](cms.html), [운영 연결 기록](../../docs/raid-bus-driver-title-live-20261005.json)을 따른다. 검수 화면의 소유권은 격리된 fixture이며 실제 지급 기록이 아니다.

최초 원화 배포는 `--assets-only`였으며, 후속 실제 게임 연결은 `--scoped`로 배포한다. 칭호 등록/수동 지급 회귀와 장착 UI, Worker 컴파일을 검사한다. 직전 운영 기준은 `b1859e08b5d30f750accf49bee4743bd380727af`다. 오버로드 전용 칭호는 이 작업에서 변경하지 않는다.
