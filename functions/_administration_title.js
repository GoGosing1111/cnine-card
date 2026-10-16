export const ADMINISTRATION_TITLE_KEY='administration_title_20261012_v1';
export const ADMINISTRATION_TITLE=Object.freeze({
 code:'ADMINISTRATION',name:'행정부',description:'리버스콜을 위해 헌신하는 행정부 직원',
 image:'/assets/ui/titles/administration-command-v2.webp',style:'ADMINISTRATION',type:'MANUAL',
 config:{fontPreset:'DEFAULT'},power:100000,order:909
});

// The requested bonus applies to both combat modes through the title system.
// Register once, preserving later OWNER CMS edits and manual ownership.
export async function ensureAdministrationTitle(env){
 if((await env.DB.prepare('SELECT value FROM app_meta WHERE key=?').bind(ADMINISTRATION_TITLE_KEY).first())?.value==='1')return;
 const t=ADMINISTRATION_TITLE;
 await env.DB.batch([
  env.DB.prepare(`INSERT OR IGNORE INTO character_titles
   (code,name,description,badge_text,image_url,pve_power,unlock_type,unlock_config_json,style_preset,is_active,is_public,sort_order)
   VALUES(?,?,?,?,?,?,?,?,?,1,1,?)`).bind(t.code,t.name,t.description,t.name,t.image,t.power,t.type,JSON.stringify(t.config),t.style,t.order),
  env.DB.prepare('INSERT INTO app_meta(key,value,updated_at) VALUES(?,?,CURRENT_TIMESTAMP) ON CONFLICT(key) DO UPDATE SET value=excluded.value,updated_at=CURRENT_TIMESTAMP').bind(ADMINISTRATION_TITLE_KEY,'1')
 ]);
}
