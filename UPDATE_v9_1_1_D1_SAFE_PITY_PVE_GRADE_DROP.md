# v9.1.1 D1 SAFE 천장 + PvE 등급 랜덤 카드 드롭

- 프리미엄/리미티드 천장 독립 적용
- PvE 승리 시 CMS 공통 드롭 확률 판정
- 등급별 확률로 등급 결정 후 해당 등급의 공개·활성 일반 카드 1장 균등 랜덤 지급
- 몬스터별 reward_card_rate 컬럼/API/UI 제거
- 신규 DB 구조는 user_pack_pity 테이블과 인덱스만 사용
- 기존 cards/battle_monsters 테이블 재생성·RENAME·DROP 없음
- legacy 0003/0004 파괴형 마이그레이션 실행 차단

## D1 안전 원칙 검사
신규 기능 변경분에는 DROP TABLE, RENAME TABLE, 기존 테이블 재생성, 기존 데이터 삭제가 없습니다.
