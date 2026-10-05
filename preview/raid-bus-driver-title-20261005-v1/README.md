# 버스기사 · 행정부 정직원

사용자가 붙여넣은 레이드 버스 기사 모집 글과 “칭호 만들어라 버스기사 이쁘게 만들어” 요청으로 만든 칭호 리소스 시안이다. 민트 버스, 금빛 운전대·월계수, 아이보리 날개로 친절하고 든든한 정직원 배지를 구성했다. 주 문구는 **버스기사**, 리본 문구는 **행정부 정직원**이다.

- 완성 투명 PNG: [assets/bus-driver-title-v1.png](assets/bus-driver-title-v1.png), 2252×804 RGBA.
- 글자 없는 생성 원본: [assets/bus-driver-ornament-v1.png](assets/bus-driver-ornament-v1.png), 2172×724 RGBA. 내장 `image_gen` 생성 결과를 바이트 그대로 보존한다.
- 생성 프롬프트: [prompt.json](prompt.json). 그림은 내장 도구로 제작하고, 한글은 `title.js`의 Canvas 2D 별도 계층으로 렌더링했다. 기존 Black Han Sans 폰트와 OFL 라이선스를 사용한다.
- 재현: [index.html](index.html)을 열면 폰트 로딩 후 원본과 두 텍스트 계층을 합성한다. “투명 PNG 저장”이 동일한 구도의 알파 PNG를 내보낸다. 외곽 투명 여백 40px를 추가하며 그림 자체를 편집·재생성·변형하지 않는다.
- 검수: PC와 모바일에서 문구·배경 전환·투명 PNG 출력·가로 넘침·320px/180px 주 문구 가독성을 확인했다. `qa/browser-review.json`, `qa/desktop.jpg`, `qa/mobile.jpg`와 `qa/asset-check.json`에 기록한다.

이번 작업은 칭호 그림과 프리뷰 제작이다. 계정 지급·장착, 업적 조건, 주급·활동량 보상, 전투력, CMS 카탈로그 등록은 설정하지 않았다. 원문에 적힌 보상 약속을 게임 지급 명령으로 해석하지 않는다.

배포는 새 프리뷰 폴더와 리소스만 추가하는 `--assets-only` 범위다. 기존 게임 실행 코드·DB·오버로드 칭호를 변경하지 않는다. 이전 배포 기준은 `989b5a0abe7a6b76be3dc8c0a6d6dcd2b3912555`다.
