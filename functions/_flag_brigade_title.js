export const FLAG_BRIGADE_TITLE_KEY = 'flag_brigade_title_20261013_v1';
export const FLAG_BRIGADE_TITLE = Object.freeze({
  code:'FLAG_BRIGADE', name:'깃발부대', description:'서른 번의 승전, 팔천 번의 결투. 끝까지 깃발을 지켜낸 자.',
  image:'/assets/ui/titles/flag-brigade-v1.webp', style:'FLAG_BRIGADE', type:'TERRITORY_VICTORIES',
  config:{roundWins:30,battleWins:8000,fontPreset:'DEFAULT'}, power:100000, order:910
});

export async function ensureFlagBrigadeTitle(env) {
  if ((await env.DB.prepare('SELECT value FROM app_meta WHERE key=?').bind(FLAG_BRIGADE_TITLE_KEY).first())?.value==='1') return;
  const t=FLAG_BRIGADE_TITLE;
  await env.DB.batch([
    env.DB.prepare(`INSERT OR IGNORE INTO character_titles
      (code,name,description,badge_text,image_url,pve_power,unlock_type,unlock_config_json,style_preset,is_active,is_public,sort_order)
      VALUES(?,?,?,?,?,?,?,?,?,1,1,?)`).bind(t.code,t.name,t.description,t.name,t.image,t.power,t.type,JSON.stringify(t.config),t.style,t.order),
    env.DB.prepare('INSERT INTO app_meta(key,value,updated_at) VALUES(?,?,CURRENT_TIMESTAMP) ON CONFLICT(key) DO UPDATE SET value=excluded.value,updated_at=CURRENT_TIMESTAMP').bind(FLAG_BRIGADE_TITLE_KEY,'1')
  ]);
}

// A victory is the user's settled WIN receipt, never an individual front win.
// Claiming the reward is not required; ineligible participation does not count.
export const TERRITORY_ROUND_WINS_SQL = `SELECT COUNT(*) FROM territory_war_v3_rewards w
  JOIN territory_war_v3_rounds r ON r.id=w.round_id
  WHERE w.user_id=? AND w.result='WIN' AND r.status='FINISHED' AND r.settled_at IS NOT NULL
    AND r.winner_side IN ('A','B') AND w.side=r.winner_side`;

// APPLIED already committed the duel atomically. Completion/retries update that
// same unique action, so it counts once. Include actual attack AND defence wins;
// use each registered round's existing indexes instead of scanning every duel.
const attackWinsSql = `SELECT COUNT(*) FROM territory_war_v3_users u
  JOIN territory_war_v3_rounds r ON r.id=u.round_id
  JOIN territory_war_v3_actions a ON a.round_id=u.round_id AND a.user_id=u.user_id
  WHERE u.user_id=? AND r.status IN ('ACTIVE','FINISHED') AND a.status IN ('APPLIED','COMPLETED')
    AND a.side IN ('A','B') AND a.winner_side=a.side AND u.side=a.winner_side
    AND a.opponent_user_id IS NOT NULL AND a.opponent_user_id<>a.user_id`;
const defenceWinsSql = `SELECT COUNT(*) FROM territory_war_v3_users u
  JOIN territory_war_v3_rounds r ON r.id=u.round_id
  JOIN territory_war_v3_actions a ON a.round_id=u.round_id AND a.opponent_user_id=u.user_id
  WHERE u.user_id=? AND r.status IN ('ACTIVE','FINISHED') AND a.status IN ('APPLIED','COMPLETED')
    AND a.side IN ('A','B') AND a.winner_side IN ('A','B') AND a.winner_side<>a.side
    AND u.side=a.winner_side AND a.opponent_user_id<>a.user_id`;
export const TERRITORY_BATTLE_WINS_SQL = `SELECT (${attackWinsSql})+(${defenceWinsSql})`;

export async function readTerritoryVictories(env,userId) {
  const row=await env.DB.prepare(`SELECT (${TERRITORY_ROUND_WINS_SQL}) AS round_wins,(${TERRITORY_BATTLE_WINS_SQL}) AS battle_wins`).bind(userId,userId,userId).first();
  return {roundWins:Math.max(0,Number(row?.round_wins||0)),battleWins:Math.max(0,Number(row?.battle_wins||0))};
}

export async function syncFlagBrigadeTitle(env,userId) {
  const title=await env.DB.prepare(`SELECT t.id,t.unlock_config_json FROM character_titles t
    WHERE t.code='FLAG_BRIGADE' AND t.unlock_type='TERRITORY_VICTORIES' AND t.is_active=1 AND t.is_public=1
      AND NOT EXISTS(SELECT 1 FROM user_character_titles u WHERE u.user_id=? AND u.title_id=t.id)`).bind(userId).first();
  if (!title) return {granted:[],progress:{}};
  let config;try {config=JSON.parse(title.unlock_config_json||'{}');} catch {config={};}
  const goal=(value,fallback)=>Number.isSafeInteger(Number(value))&&Number(value)>0?Number(value):fallback;
  const roundGoal=goal(config?.roundWins,30),battleGoal=goal(config?.battleWins,8000);
  const counts=await readTerritoryVictories(env,userId),complete=counts.roundWins>=roundGoal&&counts.battleWins>=battleGoal;
  const progress={FLAG_BRIGADE:{...counts,roundGoal,battleGoal,complete}};
  if (!complete) return {granted:[],progress};
  // Recheck the current CMS policy and both durable totals at grant time.
  // The ownership primary key makes retries safe; granting never auto-equips.
  const result=await env.DB.prepare(`INSERT OR IGNORE INTO user_character_titles(user_id,title_id,source_type,source_id)
    SELECT ?,id,'ACHIEVEMENT',code FROM character_titles WHERE id=? AND code='FLAG_BRIGADE'
      AND unlock_type='TERRITORY_VICTORIES' AND is_active=1 AND is_public=1
      AND COALESCE(unlock_config_json,'{}')=? AND (${TERRITORY_ROUND_WINS_SQL})>=?
      AND (${TERRITORY_BATTLE_WINS_SQL})>=?`)
    .bind(userId,title.id,title.unlock_config_json||'{}',userId,roundGoal,userId,userId,battleGoal).run();
  return {granted:Number(result?.meta?.changes||0)>0?[Number(title.id)]:[],progress};
}
