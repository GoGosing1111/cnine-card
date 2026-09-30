# 숲켓몬 마법카드 시즌2

기존 승인 원화 8종 + 용병 대응 신규 2종. 총 10종의 실제 서버 전투 효과, 공용 V3 재생 어댑터, 20개 검수 전투와 팩 이미지를 준비했다. 운영 획득/전투는 OFF이며 새 원화·밸런스는 검수 대기다.

- `index.html`: 10종 컬렉션과 강화 수치.
- `battle.html`: 발동 조건을 구성한 실제 엔진 검수 전투. 음소거, 재생/정지, 카드·강화 선택.
- `pack-art.html`: 생성 원본 위 한글 조판. 최종 팩은 `../../assets/cards/magic-season2-pack-v1.png`.
- `cards-v2/`: 신규 카드 프레임 PNG 2장. `announcement-v2.png`는 10종 안내 이미지.
- `registration-draft.json`: 비활성 등록 초안. 가격/가중치/강화 비용 미정.
- `art-manifest.json`: 기존 승인 원화 8종 보존 기준. `art-manifest-v2.json`은 신규 자산 검수 기준, `art-prompts-v2.json`은 내장 image_gen 생성 기록.

`node preview/magic-card-season2-v1/build.mjs`로 실제 서버 전투와 전용 프리뷰 번들을 만든다. 라이브 V3 번들은 변경하지 않는다. `export-art.mjs`는 로컬 서버 주소 `MAGIC_S2_REVIEW_URL`, 필요 시 `PLAYWRIGHT_MODULE_URL`/`QA_CHROMIUM`을 받아 원본을 보존하며 최종 PNG·WebP를 출력한다. UI 검수 스크립트는 `qa.mjs`다.

구현 정책·검증·출시 대기 사항은 `../../docs/magic-card-season2-connection-preparation-20260930.md`에 기록했다.
