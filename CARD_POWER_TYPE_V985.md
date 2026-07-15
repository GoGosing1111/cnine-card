# 카드별 전투력 유형 관리 v985

- 대상 등급: SSR, MA, LIMITED, FUR
- 기존 카드는 `power_type`, `base_power`가 NULL이며 자동 분류하지 않음
- 미설정 카드는 기존 등급별 공통 전투력 유지
- CMS에서 유형 저장 시 카드별 기본 전투력 저장
- FUR은 FIXED / 3200 고정
- D1 변경은 `ALTER TABLE cards ADD COLUMN`만 사용

매핑:
- SSR: NORMAL 1300 / HIGH 1375 / TOP 1450
- MA: NORMAL 1850 / HIGH 2050 / TOP 2250
- LIMITED: NORMAL 2350 / HIGH 2600 / TOP 2850
- FUR: FIXED 3200
