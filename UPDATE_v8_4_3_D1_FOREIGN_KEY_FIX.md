# v8.4.3 D1 FOREIGN KEY 복구

- 중단된 cards_legacy 마이그레이션에서 user_cards 외래키가 cards_legacy를 참조하는 상태를 자동 복구
- cards 테이블 확장 시 ALTER TABLE RENAME 방식 제거
- cards_v84 / user_cards_v84를 함께 교체하여 FOREIGN KEY 제약 유지
- 기존 카드 보유 수량, 최초/최근 획득일, 돌파 레벨 보존
