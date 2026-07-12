-- LEGACY MIGRATION DISABLED FOR D1 SAFETY
-- 과거 cards 테이블 RENAME/재생성/DROP 방식은 운영 원칙상 실행 금지.
-- 한정 카드 처리는 기존 limited_total / issued_count 컬럼과 런타임 안전 업그레이드를 사용한다.
SELECT 1;
