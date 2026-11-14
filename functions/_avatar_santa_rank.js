import {readRankExpPotion,rankPotionKey} from './_rank_exp_potion.js';
import {rankPotionState} from '../shared/rank-exp-potion-v1.mjs';
import {SANTA_AVATAR_KEY,SANTA_CODES,santaModeAllows} from './_avatar_santa.js';
import {readRuntimeData,cacheRuntimeData} from './_runtime_data_cache.js';
const readyKey='avatar-santa-rank-award-schema-v1';
function parse(raw){try{return JSON.parse(raw||'null')}catch{return null}}
export async function rankAwardBoosts(env,userId){
  if(!readRuntimeData(env,readyKey)){
    const row=await env.DB.prepare('SELECT value FROM app_meta WHERE key=?').bind(SANTA_AVATAR_KEY).first();
    if(row?.value!=='1')return {potion:await readRankExpPotion(env,userId),avatarPercent:0};
    cacheRuntimeData(env,readyKey,true,1800000);
  }
  // One indexed read replaces the normal potion lookup. Ownership, expiry, the CMS
  // flags and personal equipment are live reads, never cached across awards.
  const row=await env.DB.prepare(`SELECT p.value potion,s.value settings,u.role,e.effect_value bonus
    FROM (SELECT 1 AS n) one_row
    LEFT JOIN app_meta p ON p.key=?
    LEFT JOIN avatar_user_loadout_v1 l ON l.user_id=? AND l.avatar_code IN (${SANTA_CODES.map(()=>'?').join(',')})
    LEFT JOIN avatar_user_ownership_v1 o ON o.user_id=l.user_id AND o.avatar_code=l.avatar_code
      AND (o.expires_at IS NULL OR o.expires_at>CURRENT_TIMESTAMP)
    LEFT JOIN avatar_catalog_v1 a ON a.code=o.avatar_code AND a.is_active=1 AND a.is_public=1
    LEFT JOIN avatar_effect_options_v1 e ON e.avatar_code=a.code AND e.effect_type='ACCOUNT_RANK_XP_PERCENT'
    LEFT JOIN app_meta s ON s.key='avatar_settings_v1' AND e.avatar_code IS NOT NULL
    LEFT JOIN users u ON u.id=l.user_id AND e.avatar_code IS NOT NULL
    ORDER BY e.option_order LIMIT 1`).bind(rankPotionKey(userId),userId,...SANTA_CODES).first();
  return {potion:rankPotionState(parse(row?.potion)),
    avatarPercent:santaModeAllows(parse(row?.settings)?.mode,row?.role)?Math.max(0,Math.min(100,Math.trunc(Number(row?.bonus)||0))):0};
}
