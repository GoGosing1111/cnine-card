export const PVP_RANKING_EXCLUSION_PREFIX = 'pvp_ranked_exclusion_v1:';

// Ranking queries alias the users table as u.
export const PVP_RANKING_INCLUDED_SQL = `NOT EXISTS (
  SELECT 1 FROM app_meta exclusion
  WHERE exclusion.key = '${PVP_RANKING_EXCLUSION_PREFIX}' || CAST(u.id AS TEXT)
    AND exclusion.value = '1'
)`;
