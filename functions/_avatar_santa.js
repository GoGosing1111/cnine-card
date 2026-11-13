// CMS-only registration; visibility, acquisition and ownership are managed separately.
export const SANTA_AVATAR_KEY='safe_runtime_upgrade_santa_avatar_options_20261114_v1';
const roster=[
  ['SANTA_HIHEEYA','A-37','하이희야','hiheeya','#bb4351'],
  ['SANTA_BONGSOON','A-38','나무늘봉순','bongsoon','#c14c51'],
  ['SANTA_JOEUN','A-39','오조은','joeun','#d9b990'],
  ['SANTA_SUDAENG','A-40','남수댕','sudaeng','#9e4f69']
];
export const SANTA_CODES=Object.freeze(roster.map(row=>row[0]));
export const isSantaAvatar=code=>SANTA_CODES.includes(code);
export const avatarCoinCap=code=>isSantaAvatar(code)?175:code==='IYEJUN'?150:100;
export const santaModeAllows=(mode,role)=>mode==='ON'||(mode==='TEST'&&String(role||'').toUpperCase()==='OWNER');
export const SANTA_STORED_EFFECTS=Object.freeze([
  ['DROP_RATE_PERCENT',50],['COIN_GAIN_PERCENT',175],['RAID_EXTRA_ENTRY',15],
  ['BATTLE_POWER_BASIS_POINTS',770],['ACCOUNT_RANK_XP_PERCENT',30]
]);
export async function ensureSantaAvatars(env){
  const db=env.DB;
  if((await db.prepare('SELECT value FROM app_meta WHERE key=?').bind(SANTA_AVATAR_KEY).first())?.value==='1')return;
  const token='santa:'+crypto.randomUUID(), statements=[];
  for(const [code,serial,name,file,accent] of roster){
    const base='assets/ui/avatars-v1/santa-20261114/'+file,order=Number(serial.slice(2))*10;
    statements.push(db.prepare(`INSERT INTO avatar_catalog_v1(
      code,serial,name,call_sign,role_label,description,lobby_image,lobby_mobile_image,equipment_image,accent,
      acquisition_type,coin_price,source_label,source_detail,effect_type,effect_value,is_active,is_public,sale_enabled,sort_order,updated_at)
      VALUES(?,?,?,?,?,?,?,?,?,?,'UNSET',NULL,'','','DROP_RATE_PERCENT',50,1,0,0,?,?) ON CONFLICT(code) DO NOTHING`)
      .bind(code,serial,'산타걸 '+name,name,'산타걸',name+'의 크리스마스 산타걸 아바타입니다.',
        base+'-lobby-1024.webp',base+'-lobby-640.webp',base+'-equipment-640.webp',accent,order,token));
    SANTA_STORED_EFFECTS.forEach(([type,value],index)=>statements.push(db.prepare(`INSERT INTO avatar_effect_options_v1(avatar_code,option_order,effect_type,effect_value)
      SELECT ?,?,?,? WHERE EXISTS(SELECT 1 FROM avatar_catalog_v1 WHERE code=? AND updated_at=?)
      ON CONFLICT(avatar_code,option_order) DO NOTHING`).bind(code,index,type,value,code,token)));
  }
  statements.push(db.prepare('INSERT INTO app_meta(key,value,updated_at) VALUES(?,?,CURRENT_TIMESTAMP) ON CONFLICT(key) DO UPDATE SET value=excluded.value,updated_at=CURRENT_TIMESTAMP').bind(SANTA_AVATAR_KEY,'1'));
  await db.batch(statements);
}
