export const SUPPORTER_BLUE_BEAST_TITLES_KEY = 'supporter_blue_beast_titles_20261003';
export const SUPPORTER_BLUE_BEAST_TITLES = Object.freeze([
  { code: 'SUPPORTER', name: '서포터', description: '운영에 도움을 주신 감사 칭호',
    image: '/assets/ui/titles/supporter-vip-v1.webp', style: 'SUPPORTER_VIP', type: 'MANUAL',
    config: {}, power: 75000, order: 904 },
  { code: 'BLUE_BEAST', name: '푸른 맹수', description: '챌린저 누적 10회 달성',
    image: '/assets/ui/titles/blue-beast-v1.webp', style: 'BLUE_BEAST', type: 'CHALLENGER_TOTAL',
    config: { count: 10 }, power: 70000, order: 905 }
]);

// Catalogue rows and their marker share the existing transaction. Redeployments
// never overwrite CMS edits, ownership or the selected title.
export async function ensureSupporterBlueBeastTitles(env) {
  if ((await env.DB.prepare('SELECT value FROM app_meta WHERE key=?').bind(SUPPORTER_BLUE_BEAST_TITLES_KEY).first())?.value === '1') return;
  await env.DB.batch([
    ...SUPPORTER_BLUE_BEAST_TITLES.map(t => env.DB.prepare(`INSERT OR IGNORE INTO character_titles
      (code,name,description,badge_text,image_url,pve_power,unlock_type,unlock_config_json,style_preset,is_active,is_public,sort_order)
      VALUES(?,?,?,?,?,?,?,?,?,1,1,?)`).bind(t.code,t.name,t.description,t.name,t.image,t.power,t.type,JSON.stringify(t.config),t.style,t.order)),
    env.DB.prepare('INSERT INTO app_meta(key,value,updated_at) VALUES(?,?,CURRENT_TIMESTAMP) ON CONFLICT(key) DO UPDATE SET value=excluded.value,updated_at=CURRENT_TIMESTAMP').bind(SUPPORTER_BLUE_BEAST_TITLES_KEY,'1')
  ]);
}

// Count the recorded Challenger result, not today's top-20 rule applied
// retroactively. Gaps between seasons do not reset this cumulative achievement.
export const CHALLENGER_TOTAL_SQL = `SELECT COUNT(DISTINCT s.id) AS challenger_count
  FROM pvp_season_settlements s JOIN pvp_season_settlement_ranks r ON r.settlement_id=s.id
  WHERE r.user_id=? AND s.status='COMPLETED' AND s.completed_at IS NOT NULL
    AND r.tier_id='challenger' AND r.final_rank BETWEEN 1 AND 20`;

export async function readChallengerTotal(env,userId) {
  const row = await env.DB.prepare(CHALLENGER_TOTAL_SQL).bind(userId).first();
  return Math.max(0,Number(row?.challenger_count || 0));
}

export async function syncBlueBeastTitle(env,userId) {
  const title = await env.DB.prepare(`SELECT t.id,t.unlock_config_json FROM character_titles t
    WHERE t.code='BLUE_BEAST' AND t.unlock_type='CHALLENGER_TOTAL' AND t.is_active=1 AND t.is_public=1
      AND NOT EXISTS(SELECT 1 FROM user_character_titles u WHERE u.user_id=? AND u.title_id=t.id)`).bind(userId).first();
  if (!title) return {granted:[],progress:{}};
  let config;try { config=JSON.parse(title.unlock_config_json || '{}'); } catch { config={}; }
  const configured=Number(config?.count),goal=Number.isSafeInteger(configured)&&configured>0?configured:10;
  const owned=await readChallengerTotal(env,userId),complete=owned>=goal;
  const progress={BLUE_BEAST:{owned,goal,complete}};
  if (!complete) return {granted:[],progress};
  // Recheck both the current catalogue policy and the official history in the
  // grant statement. The ownership primary key makes concurrent retries safe.
  const result=await env.DB.prepare(`INSERT OR IGNORE INTO user_character_titles(user_id,title_id,source_type,source_id)
    SELECT ?,id,'ACHIEVEMENT',code FROM character_titles WHERE id=? AND code='BLUE_BEAST'
      AND unlock_type='CHALLENGER_TOTAL' AND is_active=1 AND is_public=1
      AND COALESCE(unlock_config_json,'{}')=? AND (${CHALLENGER_TOTAL_SQL})>=?`)
    .bind(userId,title.id,title.unlock_config_json||'{}',userId,goal).run();
  return {granted:Number(result?.meta?.changes||0)>0?[Number(title.id)]:[],progress};
}
