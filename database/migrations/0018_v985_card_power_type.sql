-- 카드별 전투력 유형 관리 (기존 데이터 자동 배정 없음)
-- 운영 원칙: 기존 테이블 삭제/재생성/이름변경 금지
ALTER TABLE cards ADD COLUMN power_type TEXT;
ALTER TABLE cards ADD COLUMN base_power INTEGER;
