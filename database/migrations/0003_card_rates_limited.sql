-- LEGACY MIGRATION DISABLED FOR D1 SAFETY
-- 과거 cards 테이블 RENAME/재생성/DROP 방식은 운영 원칙상 실행 금지.
-- 필요한 컬럼 확장은 functions/api/[[path]].js 의 safe_runtime_upgrade_v841 계열에서
-- ALTER TABLE ADD COLUMN 방식으로만 처리한다.
SELECT 1;
