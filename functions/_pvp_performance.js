// Keep history work bounded by the visible limit on both sides. The companion
// defender/id index is installed out of band, never built in a player request.
const HISTORY_COLUMNS='id,attacker_id,defender_id,attacker_name,defender_name,attacker_power,defender_power,winner_id,attacker_score_before,attacker_score_after,defender_score_before,defender_score_after,score_change,created_at';
export async function rankedHistoryRows(env,userId,requestedLimit=100){
  const limit=Math.min(500,Math.max(10,Math.floor(Number(requestedLimit)||100)));
  return env.DB.prepare(`SELECT * FROM (
      SELECT ${HISTORY_COLUMNS} FROM pvp_match_history WHERE attacker_id=? ORDER BY id DESC LIMIT ?
    ) AS attacks
    UNION ALL SELECT * FROM (
      SELECT ${HISTORY_COLUMNS} FROM pvp_match_history WHERE defender_id=? AND attacker_id<>? ORDER BY id DESC LIMIT ?
    ) AS defenses
    ORDER BY id DESC LIMIT ?`).bind(userId,limit,userId,userId,limit,limit).all();
}

export async function syncRankedDefensePreset(env,userId){
  // Legacy accounts still need preset 1 initialized. Reading config must not
  // rewrite an unchanged defense deck or contend with another config request.
  return env.DB.batch([
    env.DB.prepare(`INSERT OR IGNORE INTO pvp_deck_presets(user_id,preset_no,card_ids)
      SELECT user_id,1,card_ids FROM pvp_decks WHERE user_id=?
      AND NOT EXISTS(SELECT 1 FROM pvp_deck_presets WHERE user_id=? AND preset_no=1)`).bind(userId,userId),
    env.DB.prepare(`UPDATE pvp_decks SET card_ids=(SELECT card_ids FROM pvp_deck_presets WHERE user_id=? AND preset_no=1),updated_at=CURRENT_TIMESTAMP
      WHERE user_id=? AND EXISTS(SELECT 1 FROM pvp_deck_presets WHERE user_id=? AND preset_no=1
        AND pvp_deck_presets.card_ids<>pvp_decks.card_ids)`).bind(userId,userId,userId)
  ]);
}

export function createPvpTimings(path,clock=Date.now){
  if(!['pvp/config','pvp/match','pvp/fight','pvp/history'].includes(path))return null;
  const phases={};let previous=clock();
  return {
    mark(name){const now=clock();phases[name]=(phases[name]||0)+Math.max(0,now-previous);previous=now;},
    snapshot(){return {...phases};},
    serverTiming(){return Object.entries(phases).map(([name,duration])=>`pvp_${name};dur=${duration}`).join(', ');}
  };
}
