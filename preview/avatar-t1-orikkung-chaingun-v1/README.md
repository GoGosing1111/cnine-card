# T1 오리꿍 · 체인건 아바타

2026-09-30 사용자 지시: 저격 오리꿍 V-050의 **노란 오리 캐릭터 디자인만** 계승하고 의상을 T1 클랜 제복, 무기를 체인건으로 변경한다. 후속 정정에 따라 사용한 마크는 실제 게임의 `assets/ui/clan/marks/source/t1-clan-mark-source-v1.png`이다. 실존 e스포츠 T1 로고를 사용한 초기 시안은 등록 입력에서 제외했다.

- 로비와 장비창의 무가공 원본: `assets/avatar-t1-orikkung-*-source-art-v1.png`.
- 장비창은 내장 image_gen이 생성한 실제 RGBA PNG이며, 코드로 배경을 제거하지 않았다. 잘린 체인건 초안도 등록에서 제외했다.
- `node preview/avatar-t1-orikkung-chaingun-v1/build-assets.mjs`가 원본 해시·알파·경계 검증 후 로비 1024/640px WebP와 장비창 640×1088 투명 WebP를 만든다. 원본은 덮어쓰지 않는다.
- `manifest.json`에 원본/파생 SHA-256, 크기, 알파, 균등 배율과 크롭 범위를 기록한다. 생성 참조와 프롬프트는 `prompts.md`.
- `index.html`에서 실제 `SoopketmonCharacterLoadoutV2` 장비창에 삽입해 PC 1440px·모바일 390px의 원화, 투명 경계, 총구·오리발, 탭 전환과 잘림을 검수한다. 테스트 화면은 계정에 저장하지 않는다.

CMS 등록 예정 코드는 `T1_ORIKKUNG_CHAINGUN`, 시리얼 `A-30`. 현재 운영 **한복 디임2**의 네 옵션(드랍률 +30%, 코인 +100%, 레이드 +10회, 전투력 +3%)을 정확히 복사하고 현 시즌 T1 전원에게 시즌 종료 시각까지 기간제로 지급한다. 계정 장착과 재화는 바꾸지 않는다. 편입·등록·지급의 단일 운영 거래는 `scripts/ops/t1-orikkung-clan-release-20260930.mjs`를 사용한다.
