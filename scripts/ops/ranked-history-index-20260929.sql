-- Additive ranked-history optimization. Run as a standalone statement outside
-- a transaction; CONCURRENTLY preserves ongoing ranked writes. Verify
-- pg_index.indisvalid/indisready and the definition before deploying the query.
-- Do not drop/rebuild a pre-existing index automatically.
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_pvp_match_history_defender_recent
  ON public.pvp_match_history (defender_id, id DESC);
