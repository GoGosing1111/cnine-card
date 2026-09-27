export const PREDICTION_TITLE_KEY = 'achievement_gambling_king_1000_60000_20260928';
export const PREDICTION_TITLE = Object.freeze({
  code: 'GAMBLING_KING', name: '도박왕', description: '승부예측 누적 적중 1,000회를 달성한 승부사.',
  image: '/assets/ui/titles/gambling-king-v1.webp', style: 'GAMBLING_KING',
  type: 'PREDICTION_HITS', count: 1000, power: 60000, order: 903
});

// One-time catalogue insertion only; later CMS edits and existing ownership survive.
export async function ensurePredictionTitle(env) {
  if ((await env.DB.prepare('SELECT value FROM app_meta WHERE key=?').bind(PREDICTION_TITLE_KEY).first())?.value === '1') return;
  const t = PREDICTION_TITLE;
  await env.DB.batch([
    env.DB.prepare(`INSERT OR IGNORE INTO character_titles
      (code,name,description,badge_text,image_url,pve_power,unlock_type,unlock_config_json,style_preset,is_active,is_public,sort_order)
      VALUES(?,?,?,?,?,?,?,?,?,1,1,?)`).bind(t.code,t.name,t.description,t.name,t.image,t.power,t.type,JSON.stringify({count:t.count}),t.style,t.order),
    env.DB.prepare('INSERT INTO app_meta(key,value,updated_at) VALUES(?,?,CURRENT_TIMESTAMP) ON CONFLICT(key) DO UPDATE SET value=excluded.value,updated_at=CURRENT_TIMESTAMP').bind(PREDICTION_TITLE_KEY,'1')
  ]);
}

export async function readPredictionHitCount(env, userId) {
  // Predictions initialize lazily. A new installation has no history before this marker.
  if (!await env.DB.prepare("SELECT value FROM app_meta WHERE key='coin_prediction_settings_v1'").first()) return 0;
  const row = await env.DB.prepare(`SELECT COUNT(*) AS hit_count
    FROM coin_prediction_bets b JOIN coin_prediction_events e ON e.id=b.event_id
    WHERE b.user_id=? AND b.status='SETTLED' AND e.status='SETTLED'
      AND b.option_id=e.result_option_id AND b.payout>0`).bind(userId).first();
  return Number(row?.hit_count || 0);
}

export async function syncPredictionHitTitle(env, userId) {
  const title = await env.DB.prepare(`SELECT t.id,t.code,t.unlock_config_json FROM character_titles t
    WHERE t.code='GAMBLING_KING' AND t.unlock_type='PREDICTION_HITS' AND t.is_active=1 AND t.is_public=1
      AND NOT EXISTS(SELECT 1 FROM user_character_titles u WHERE u.user_id=? AND u.title_id=t.id)`).bind(userId).first();
  if (!title) return {granted:[],progress:{}};
  let config;try {config=JSON.parse(title.unlock_config_json||'{}');} catch {config={};}
  const configured=Number(config?.count),goal=Number.isSafeInteger(configured)&&configured>0?configured:PREDICTION_TITLE.count;
  const owned=await readPredictionHitCount(env,userId),complete=owned>=goal;
  const progress={GAMBLING_KING:{owned,goal,complete}};
  if (!complete) return {granted:[],progress};
  // Recheck the CMS policy at insertion, and let the existing unique key guard retries.
  const result=await env.DB.prepare(`INSERT OR IGNORE INTO user_character_titles(user_id,title_id,source_type,source_id)
    SELECT ?,id,'ACHIEVEMENT',code FROM character_titles WHERE id=? AND code='GAMBLING_KING'
      AND unlock_type='PREDICTION_HITS' AND is_active=1 AND is_public=1
      AND COALESCE(unlock_config_json,'{}')=?`).bind(userId,title.id,title.unlock_config_json||'{}').run();
  return {granted:Number(result?.meta?.changes||0)>0?[Number(title.id)]:[],progress};
}
