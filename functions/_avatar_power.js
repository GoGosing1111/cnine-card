import {ensureAvatarFoundation} from './_avatar.js';
// Roll out the newly approved Iyejun option without changing legacy avatar balance.
// Read on every formation snapshot: expiry, unequip and CMS OFF are immediate.
export async function avatarBattlePowerPercents(env,userIds){
  const ids=[...new Set(userIds.map(Number).filter(n=>Number.isSafeInteger(n)&&n>0))];
  if(!ids.length)return new Map();
  await ensureAvatarFoundation(env);
  const rows=await env.DB.prepare(`SELECT l.user_id,u.role,s.value settings,a.effect_type,a.effect_value,
      e.effect_type option_type,e.effect_value option_value
    FROM avatar_user_loadout_v1 l JOIN avatar_user_ownership_v1 o ON o.user_id=l.user_id AND o.avatar_code=l.avatar_code
      AND (o.expires_at IS NULL OR o.expires_at>CURRENT_TIMESTAMP)
    JOIN avatar_catalog_v1 a ON a.code=l.avatar_code AND a.is_active=1 AND a.is_public=1
    JOIN users u ON u.id=l.user_id LEFT JOIN app_meta s ON s.key='avatar_settings_v1'
    LEFT JOIN avatar_effect_options_v1 e ON e.avatar_code=a.code AND e.effect_type IN ('BATTLE_POWER_PERCENT','BATTLE_POWER_BASIS_POINTS')
    WHERE l.avatar_code='IYEJUN' AND l.user_id IN (${ids.map(()=>'?').join(',')}) ORDER BY e.option_order`).bind(...ids).all();
  const result=new Map();
  for(const row of rows.results||[]){
    let settings;try{settings=JSON.parse(row.settings||'{}')}catch{continue}
    if(settings.mode!=='ON'&&!(settings.mode==='TEST'&&row.role==='OWNER'))continue;
    const type=row.option_type||row.effect_type,value=Number(row.option_value??row.effect_value);
    const percent=type==='BATTLE_POWER_BASIS_POINTS'?value/100:type==='BATTLE_POWER_PERCENT'?value:0;
    if(Number.isFinite(percent)&&!result.has(Number(row.user_id)))result.set(Number(row.user_id),Math.max(0,Math.min(100,percent)));
  }
  return result;
}
