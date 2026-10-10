export const SECRET_POLICE_TITLE_KEY='secret_police_title_20261011_v1';
export const SECRET_POLICE_TITLE=Object.freeze({
 code:'SECRET_POLICE',name:'비밀경찰',description:'핑두의 비밀경찰. 운영자가 임명하는 전용 칭호.',
 image:'/assets/ui/titles/secret-police-v1.webp',style:'SECRET_POLICE',type:'MANUAL',
 config:{fontPreset:'SERIF'},powerSource:'GAMBLING_KING',order:908
});

// Copy the current CMS power of 도박왕 on first registration, not its older seed
// value. Later CMS edits and existing ownership/equipment remain authoritative.
export async function ensureSecretPoliceTitle(env){
 if((await env.DB.prepare('SELECT value FROM app_meta WHERE key=?').bind(SECRET_POLICE_TITLE_KEY).first())?.value==='1')return;
 const t=SECRET_POLICE_TITLE;
 await env.DB.batch([
  env.DB.prepare(`INSERT OR IGNORE INTO character_titles
   (code,name,description,badge_text,image_url,pve_power,unlock_type,unlock_config_json,style_preset,is_active,is_public,sort_order)
   SELECT ?,?,?,?,?,source.pve_power,?,?,?,1,1,? FROM character_titles source WHERE source.code=?`)
   .bind(t.code,t.name,t.description,t.name,t.image,t.type,JSON.stringify(t.config),t.style,t.order,t.powerSource),
  env.DB.prepare(`INSERT INTO app_meta(key,value,updated_at)
   SELECT ?,'1',CURRENT_TIMESTAMP WHERE EXISTS(SELECT 1 FROM character_titles WHERE code=?)
   ON CONFLICT(key) DO UPDATE SET value=excluded.value,updated_at=CURRENT_TIMESTAMP`).bind(SECRET_POLICE_TITLE_KEY,t.code)
 ]);
}
