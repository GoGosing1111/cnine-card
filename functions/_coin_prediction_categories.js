// Additive metadata: do not ALTER the live event table or touch betting ledgers.
export const PREDICTION_CATEGORIES = Object.freeze(['SOCCER', 'BASEBALL', 'BASKETBALL', 'LOL', 'SETKA', 'STARCRAFT', 'OTHER']);
export const PREDICTION_CATEGORY_PREFIX = 'coin_prediction_category_v2033_';
export const predictionCategory = value => PREDICTION_CATEGORIES.includes(String(value || '').toUpperCase()) ? String(value).toUpperCase() : 'OTHER';
export const predictionCategoryFilter = value => String(value || '').toUpperCase() === 'ALL' || !value ? 'ALL' : predictionCategory(value);
export const PREDICTION_CATEGORY_JOIN = `LEFT JOIN app_meta pc ON pc.key='${PREDICTION_CATEGORY_PREFIX}'||CAST(e.id AS TEXT)`;
export const PREDICTION_CATEGORY_SQL = `CASE WHEN pc.value IN ('SOCCER','BASEBALL','BASKETBALL','LOL','SETKA','STARCRAFT','OTHER') THEN pc.value ELSE 'OTHER' END`;
export function predictionFilterSql({ category = 'ALL', mine = false } = {}, userId) {
  const selected = predictionCategoryFilter(category), onlyMine = mine === true;
  return {
    category: selected, mine: onlyMine,
    sql: `${selected === 'ALL' ? '' : ` AND (${PREDICTION_CATEGORY_SQL})=?`}${onlyMine ? ' AND EXISTS(SELECT 1 FROM coin_prediction_bets mb WHERE mb.event_id=e.id AND mb.user_id=?)' : ''}`,
    binds: [...(selected === 'ALL' ? [] : [selected]), ...(onlyMine ? [userId] : [])]
  };
}
export function predictionCategoryStatement(env, eventId, category) {
  return env.DB.prepare('INSERT INTO app_meta(key,value,updated_at) VALUES(?,?,CURRENT_TIMESTAMP) ON CONFLICT(key) DO UPDATE SET value=excluded.value,updated_at=excluded.updated_at')
    .bind(`${PREDICTION_CATEGORY_PREFIX}${eventId}`, predictionCategory(category));
}
