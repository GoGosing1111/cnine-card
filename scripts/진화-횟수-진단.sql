-- 진화 시도 횟수가 실제보다 크게 나오는 문의 진단
-- Neon(운영 DB)에 그대로 붙여 실행하세요. 읽기 전용이라 아무것도 바꾸지 않습니다.
-- ============================================================================

-- ① 중복 방지 인덱스가 살아 있는가  ← 가장 중요
--    런타임의 CREATE UNIQUE INDEX 는 Postgres 에서 건너뛰도록 되어 있어
--    (호환 계층이 스키마 문을 no-op 처리) 이관 때 넘어오지 않았으면 그대로 없다.
--    없으면 같은 요청이 동시에 두 번 들어와도 DB 가 막아주지 못한다.
SELECT '① 중복 방지 인덱스' AS 검사,
       indexname,
       indexdef
FROM pg_indexes
WHERE schemaname = 'public'
  AND indexname IN (
    'idx_evolution_logs_request_id',
    'idx_pvp_ranked_ticket_active',
    'idx_pve_rift_runs_active_user',
    'idx_wago_member_verified_unique',
    'idx_user_messages_campaign_user_v1276',
    'idx_battle_monsters_active_nightmare_pair_v1694'
  )
ORDER BY indexname;
-- 6줄이 다 나와야 정상. 빠진 게 있으면 그 기능의 중복 방지가 풀려 있다.


-- ② 같은 request_id 로 두 번 이상 기록된 진화가 있는가
--    한 줄이라도 나오면 "중복 실행이 실제로 일어났다" 는 증거다.
SELECT '② 중복 실행된 진화' AS 검사,
       request_id,
       COUNT(*) AS 기록수,
       MIN(created_at) AS 처음,
       MAX(created_at) AS 마지막
FROM card_evolution_logs
WHERE request_id IS NOT NULL
GROUP BY request_id
HAVING COUNT(*) > 1
ORDER BY COUNT(*) DESC
LIMIT 20;


-- ③ 카운터(total_attempts)와 실제 기록 수가 맞는가  ← 원인을 가르는 검사
--    total_attempts 가 기록 수보다 크면  → 카운터만 부풀었다 (데이터/이관 문제)
--    total_attempts 와 기록 수가 같으면  → 진짜로 그만큼 실행됐다 (중복 실행 문제)
SELECT '③ 카운터 vs 기록' AS 검사,
       p.user_id,
       p.source_card_id,
       p.total_attempts AS 카운터,
       p.failed_attempts AS 실패누적,
       COUNT(l.id) AS 실제기록수,
       p.total_attempts - COUNT(l.id) AS 차이,
       MIN(l.created_at) AS 첫기록,
       MAX(l.created_at) AS 마지막기록
FROM card_evolution_progress p
LEFT JOIN card_evolution_logs l
       ON l.user_id = p.user_id
      AND l.source_card_id = p.source_card_id
WHERE p.total_attempts > 0
GROUP BY p.user_id, p.source_card_id, p.total_attempts, p.failed_attempts
HAVING p.total_attempts <> COUNT(l.id)
ORDER BY (p.total_attempts - COUNT(l.id)) DESC
LIMIT 30;
-- 한 줄도 안 나오면 카운터는 정확하다 → ②번(중복 실행) 쪽을 봐야 한다.


-- ④ 문의한 유저 특정해서 보기
--    아래 :USER_ID 를 실제 유저 번호로 바꿔서 실행하세요.
-- SELECT l.created_at, l.evolution_type, l.attempt_no, l.is_success,
--        l.coin_cost, l.master_star_cost, l.request_id
-- FROM card_evolution_logs l
-- WHERE l.user_id = :USER_ID
-- ORDER BY l.created_at DESC
-- LIMIT 40;


-- ⑤ ZENITH 진화만 따로 — 성공 후 카운터가 안 줄어드는 경로다
--    SSR→MA, MA→PRESTIGE 는 성공하면 카운터를 0 으로 되돌리는데
--    LIMITED→ZENITH 만 그 처리가 빠져 있어 평생 누적된다.
SELECT '⑤ ZENITH 성공 이력 있는 카드' AS 검사,
       p.user_id, p.source_card_id, p.total_attempts, p.is_success,
       COUNT(l.id) FILTER (WHERE l.evolution_type = 'LIMITED_TO_ZENITH') AS 젠스시도,
       COUNT(l.id) FILTER (WHERE l.evolution_type = 'LIMITED_TO_ZENITH' AND l.is_success = 1) AS 젠스성공
FROM card_evolution_progress p
LEFT JOIN card_evolution_logs l
       ON l.user_id = p.user_id AND l.source_card_id = p.source_card_id
GROUP BY p.user_id, p.source_card_id, p.total_attempts, p.is_success
HAVING COUNT(l.id) FILTER (WHERE l.evolution_type = 'LIMITED_TO_ZENITH' AND l.is_success = 1) > 0
ORDER BY p.total_attempts DESC
LIMIT 20;


-- ⑥ 런타임 ALTER TABLE 로 붙이는 컬럼이 실제로 있는가
--    호환 계층이 ALTER TABLE 도 no-op 으로 넘기기 때문에, 이관 때 안 넘어왔으면
--    그대로 없다. 없으면 해당 기능이 통째로 실패한다.
SELECT '⑥ 필수 컬럼 존재 확인' AS 검사, x.expected AS 있어야_할_컬럼,
       CASE WHEN c.column_name IS NULL THEN '★ 없음' ELSE '있음' END AS 상태
FROM (VALUES
  ('request_id'),('evolution_type'),('master_star_cost'),
  ('source_consumed'),('source_quantity_before'),('source_quantity_after')
) AS x(expected)
LEFT JOIN information_schema.columns c
       ON c.table_schema='public' AND c.table_name='card_evolution_logs'
      AND c.column_name = x.expected
ORDER BY 3 DESC, 2;
