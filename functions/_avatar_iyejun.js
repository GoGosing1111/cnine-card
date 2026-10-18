// Explicit user release: approved illustration, Hanbok Diim options x 1.5.
export const IYEJUN_AVATAR_KEY='safe_runtime_upgrade_iyejun_avatar_20261018_v1';
export const IYEJUN_EFFECTS=Object.freeze([
  {type:'DROP_RATE_PERCENT',value:45},
  {type:'COIN_GAIN_PERCENT',value:150},
  {type:'RAID_EXTRA_ENTRY',value:15},
  {type:'BATTLE_POWER_BASIS_POINTS',value:450}
]);

export async function ensureIyejunAvatar(env){
  const marker=await env.DB.prepare('SELECT value FROM app_meta WHERE key=?').bind(IYEJUN_AVATAR_KEY).first();
  if(marker?.value==='1')return;
  const code='IYEJUN',base='preview/avatar-iyejun-suit-20261018-v1/assets/',token=`iyejun:${crypto.randomUUID()}`;
  // A replay must preserve CMS edits, ownership, the global gate and all other avatars.
  // Bind integer basis points for PostgreSQL's existing INTEGER effect column.
  await env.DB.batch([
    env.DB.prepare(`INSERT INTO avatar_catalog_v1(
      code,serial,name,call_sign,role_label,description,lobby_image,lobby_mobile_image,equipment_image,accent,
      acquisition_type,coin_price,source_label,source_detail,effect_type,effect_value,is_active,is_public,sale_enabled,sort_order,updated_at
    ) VALUES(?,?,?,?,?,?,?,?,?,?,'UNSET',NULL,'','','DROP_RATE_PERCENT',45,1,1,0,360,?) ON CONFLICT(code) DO NOTHING`).bind(
      code,'A-36','이예준','IYEJUN','차콜 수트',
      '차콜 쓰리피스 수트와 스트라이프 타이의 이예준 아바타입니다.',
      `${base}avatar-iyejun-lobby-v1-1024.webp`,`${base}avatar-iyejun-lobby-v1-640.webp`,
      `${base}avatar-iyejun-equipment-v1-640.webp`,'#c9ad80',token
    ),
    ...IYEJUN_EFFECTS.map((effect,index)=>env.DB.prepare(`INSERT INTO avatar_effect_options_v1(avatar_code,option_order,effect_type,effect_value)
      SELECT ?,?,?,? WHERE EXISTS(SELECT 1 FROM avatar_catalog_v1 WHERE code=? AND updated_at=?)
      ON CONFLICT(avatar_code,option_order) DO NOTHING`).bind(code,index,effect.type,effect.value,code,token)),
    env.DB.prepare('INSERT INTO app_meta(key,value,updated_at) VALUES(?,?,CURRENT_TIMESTAMP) ON CONFLICT(key) DO UPDATE SET value=excluded.value,updated_at=CURRENT_TIMESTAMP').bind(IYEJUN_AVATAR_KEY,'1')
  ]);
}
