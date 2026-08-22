-- ============================================================
-- V1802 · FUR / ZENITH +11~+13 고급 강화 켜기
--
-- 실행 방법 (둘 중 하나)
--   1) Cloudflare 대시보드 → D1 → cnine-card-db → Console 에 붙여넣기
--   2) npx wrangler d1 execute cnine-card-db --remote --file=database/enable-fur-zenith-11-13-v1802.sql
--
-- ※ CMS(관리자 → 카드 관리 → 강화 설정)에서 FUR/ZENITH 탭을 열어
--    체크박스를 켜고 저장해도 결과는 같습니다. 이 파일은 그 수동 작업을 대신합니다.
-- ※ 켜는 즉시 유저에게 열립니다. 배포가 끝난 뒤 실행하세요.
-- ============================================================


-- [1] FUR +11~+13
--     별 100/150/200 · 중복 FUR 카드 1장 · 확률 35/25/15% · 천장 3/4/6회
--     고유효과 +30/60/100% · 퇴사 환급 6000/8000/10000 조각
INSERT OR REPLACE INTO app_meta(key,value,updated_at)
VALUES('fur_master_star_breakthrough_v1802','{"enabled":true,"steps":[{"cost":100,"duplicateCards":1,"rate":35,"pityThreshold":3,"uniqueBoostPercent":30,"retirementShardRefund":6000},{"cost":150,"duplicateCards":1,"rate":25,"pityThreshold":4,"uniqueBoostPercent":60,"retirementShardRefund":8000},{"cost":200,"duplicateCards":1,"rate":15,"pityThreshold":6,"uniqueBoostPercent":100,"retirementShardRefund":10000}]}',CURRENT_TIMESTAMP);


-- [2] ZENITH +11~+13
--     ※ 비용은 전수조사(database/zenith-shard-survey.sql) 전 임시값입니다.
--        조사 결과가 나오면 다시 잡습니다. 지금은 [1] 만 실행하셔도 됩니다.
INSERT OR REPLACE INTO app_meta(key,value,updated_at)
VALUES('zenith_master_star_breakthrough_v1802','{"enabled":true,"steps":[{"cost":2800,"duplicateCards":0,"rate":35,"pityThreshold":3,"uniqueBoostPercent":20,"retirementShardRefund":6000},{"cost":3400,"duplicateCards":0,"rate":25,"pityThreshold":4,"uniqueBoostPercent":40,"retirementShardRefund":8000},{"cost":4100,"duplicateCards":0,"rate":15,"pityThreshold":6,"uniqueBoostPercent":60,"retirementShardRefund":10000}]}',CURRENT_TIMESTAMP);


-- [3] 확인
SELECT key,
       json_extract(value,'$.enabled')                  AS 운영여부,
       json_extract(value,'$.steps[0].cost')            AS "11강_별",
       json_extract(value,'$.steps[0].duplicateCards')  AS "11강_중복카드",
       json_extract(value,'$.steps[0].rate')            AS "11강_확률",
       json_extract(value,'$.steps[0].pityThreshold')   AS "11강_천장",
       json_extract(value,'$.steps[2].cost')            AS "13강_별",
       json_extract(value,'$.steps[2].rate')            AS "13강_확률",
       json_extract(value,'$.steps[2].pityThreshold')   AS "13강_천장"
FROM app_meta
WHERE key IN ('fur_master_star_breakthrough_v1802','zenith_master_star_breakthrough_v1802');


-- [4] 되돌리기 — 문제가 생기면 이 두 줄만 실행하면 즉시 닫힙니다 (설정값은 보존)
-- UPDATE app_meta SET value=json_set(value,'$.enabled',json('false')),updated_at=CURRENT_TIMESTAMP
--  WHERE key IN ('fur_master_star_breakthrough_v1802','zenith_master_star_breakthrough_v1802');
