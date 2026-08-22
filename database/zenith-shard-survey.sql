-- ============================================================
-- ZENITH 11~13강 비용 산정용 전수조사
--
-- 실행 방법 (둘 중 하나)
--   1) Cloudflare 대시보드 → D1 → cnine-card-db → Console 에 붙여넣기
--   2) npx wrangler d1 execute cnine-card-db --remote --file=database/zenith-shard-survey.sql
--
-- ※ 조회 전용입니다. 데이터를 바꾸지 않습니다.
-- ※ 결과를 그대로 붙여주시면 비용을 계산해 드리겠습니다.
-- ============================================================


-- [1] 전체 규모 — 모수 파악
SELECT
  '1. 전체 규모' AS 구분,
  (SELECT COUNT(*) FROM users WHERE status='ACTIVE')                                    AS 활성유저,
  (SELECT COUNT(DISTINCT uc.user_id) FROM user_cards uc
     JOIN cards c ON c.id=uc.card_id WHERE UPPER(c.rarity)='ZENITH' AND uc.quantity>0)  AS 제니스보유자,
  (SELECT COUNT(DISTINCT uc.user_id) FROM user_cards uc
     JOIN cards c ON c.id=uc.card_id WHERE UPPER(c.rarity)='FUR' AND uc.quantity>0)     AS FUR보유자;


-- [2] 제니스 보유자의 카드조각 분포 (10% 단위) — 여기가 핵심입니다
WITH z AS (
  SELECT DISTINCT uc.user_id FROM user_cards uc
  JOIN cards c ON c.id=uc.card_id
  WHERE UPPER(c.rarity)='ZENITH' AND uc.quantity>0
), s AS (
  SELECT u.id, COALESCE(u.card_shards,0) AS shards,
         NTILE(10) OVER (ORDER BY COALESCE(u.card_shards,0)) AS decile
  FROM users u JOIN z ON z.user_id=u.id
  WHERE u.status='ACTIVE'
)
SELECT '2. 제니스 보유자 조각분포' AS 구분,
       decile AS 십분위, COUNT(*) AS 인원,
       MIN(shards) AS 최소, MAX(shards) AS 최대, CAST(AVG(shards) AS INT) AS 평균
FROM s GROUP BY decile ORDER BY decile;


-- [3] 제니스 보유자의 마스터의별 분포 (10% 단위)
WITH z AS (
  SELECT DISTINCT uc.user_id FROM user_cards uc
  JOIN cards c ON c.id=uc.card_id
  WHERE UPPER(c.rarity)='ZENITH' AND uc.quantity>0
), s AS (
  SELECT u.id,
         COALESCE((SELECT quantity FROM cnine_user_inventory
                   WHERE user_id=u.id AND item_code='MASTER_STAR'),0) AS stars,
         NTILE(10) OVER (ORDER BY COALESCE((SELECT quantity FROM cnine_user_inventory
                   WHERE user_id=u.id AND item_code='MASTER_STAR'),0)) AS decile
  FROM users u JOIN z ON z.user_id=u.id
  WHERE u.status='ACTIVE'
)
SELECT '3. 제니스 보유자 마스터의별 분포' AS 구분,
       decile AS 십분위, COUNT(*) AS 인원,
       MIN(stars) AS 최소, MAX(stars) AS 최대, CAST(AVG(stars) AS INT) AS 평균
FROM s GROUP BY decile ORDER BY decile;


-- [4] 제니스 카드의 현재 강화 단계 분포 — 13강 도전 후보가 몇 명인가
SELECT '4. 제니스 강화단계 분포' AS 구분,
       COALESCE(uc.breakthrough_level,0) AS 강화단계,
       COUNT(*) AS 카드수, COUNT(DISTINCT uc.user_id) AS 보유자수
FROM user_cards uc
JOIN cards c ON c.id=uc.card_id
JOIN users u ON u.id=uc.user_id AND u.status='ACTIVE'
WHERE UPPER(c.rarity)='ZENITH' AND uc.quantity>0
GROUP BY COALESCE(uc.breakthrough_level,0)
ORDER BY 강화단계;


-- [5] 10강 제니스를 가진 유저(=바로 11강 도전 가능)의 보유 자원
WITH t AS (
  SELECT DISTINCT uc.user_id FROM user_cards uc
  JOIN cards c ON c.id=uc.card_id
  WHERE UPPER(c.rarity)='ZENITH' AND uc.quantity>0 AND COALESCE(uc.breakthrough_level,0)>=10
)
SELECT '5. 제니스 10강 보유자 자원' AS 구분,
       COUNT(*) AS 인원,
       CAST(AVG(COALESCE(u.card_shards,0)) AS INT) AS 조각평균,
       MIN(COALESCE(u.card_shards,0)) AS 조각최소,
       MAX(COALESCE(u.card_shards,0)) AS 조각최대,
       CAST(AVG(COALESCE((SELECT quantity FROM cnine_user_inventory
              WHERE user_id=u.id AND item_code='MASTER_STAR'),0)) AS INT) AS 별평균,
       MAX(COALESCE((SELECT quantity FROM cnine_user_inventory
              WHERE user_id=u.id AND item_code='MASTER_STAR'),0)) AS 별최대
FROM users u JOIN t ON t.user_id=u.id WHERE u.status='ACTIVE';


-- [6] 참고: 전체 활성 유저 조각·별 분포 (제니스 미보유자 포함)
WITH s AS (
  SELECT COALESCE(u.card_shards,0) AS shards,
         COALESCE((SELECT quantity FROM cnine_user_inventory
                   WHERE user_id=u.id AND item_code='MASTER_STAR'),0) AS stars,
         NTILE(10) OVER (ORDER BY COALESCE(u.card_shards,0)) AS decile
  FROM users u WHERE u.status='ACTIVE'
)
SELECT '6. 전체 유저 분포' AS 구분,
       decile AS 십분위, COUNT(*) AS 인원,
       MIN(shards) AS 조각최소, MAX(shards) AS 조각최대,
       CAST(AVG(stars) AS INT) AS 별평균
FROM s GROUP BY decile ORDER BY decile;


-- [7] FUR 카드 중복 보유 현황 — FUR 11~13강이 "중복카드 1장"을 요구하므로
--     실제로 중복을 가진 사람이 얼마나 되는지 확인해야 합니다
SELECT '7. FUR 중복 보유 현황' AS 구분,
       CASE WHEN uc.quantity>=4 THEN '4장 이상'
            WHEN uc.quantity=3 THEN '3장'
            WHEN uc.quantity=2 THEN '2장'
            ELSE '1장(중복 없음)' END AS 보유장수,
       COUNT(*) AS 카드수, COUNT(DISTINCT uc.user_id) AS 보유자수
FROM user_cards uc
JOIN cards c ON c.id=uc.card_id
JOIN users u ON u.id=uc.user_id AND u.status='ACTIVE'
WHERE UPPER(c.rarity)='FUR' AND uc.quantity>0
GROUP BY 보유장수
ORDER BY 카드수 DESC;
