# v8.6.7 카드팩 매핑 테이블 긴급 수정

- 운영 D1에 `card_pack_cards` 테이블이 누락된 경우 카드팩 조회에서 발생하던 `D1_ERROR: no such table` 수정
- `safe_runtime_upgrade_v867`에서 아래 항목을 최초 1회 안전 생성
  - `card_pack_cards`
  - `idx_card_pack_cards_card`
- 기존 테이블 `DROP`, `RENAME`, 재생성 없음
- 기존 카드, 유저, 카드팩, 확률, 보상 데이터 변경 없음
- 신규 DB 초기화 시에도 동일 테이블을 선행 생성하도록 방어 로직 추가
