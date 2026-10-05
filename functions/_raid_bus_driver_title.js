export const RAID_BUS_DRIVER_TITLE_KEY='raid_bus_driver_title_20261005_v1';
export const RAID_BUS_DRIVER_TITLE=Object.freeze({
 code:'RAID_BUS_DRIVER',name:'버스기사',description:'행정부 정직원 · 모두를 함께 데려가는 레이드 버스기사. 활동 확인 후 운영자가 지급합니다.',
 image:'/assets/ui/titles/raid-bus-driver-v1.png',style:'BUS_DRIVER',type:'MANUAL',config:{fontPreset:'DISPLAY'},power:0,order:906
});

// Seed only the catalogue. The existing OWNER grant and owned-title equip paths
// control acquisition; retries and later deployments preserve CMS edits.
export async function ensureRaidBusDriverTitle(env){
 if((await env.DB.prepare('SELECT value FROM app_meta WHERE key=?').bind(RAID_BUS_DRIVER_TITLE_KEY).first())?.value==='1')return;
 const t=RAID_BUS_DRIVER_TITLE;
 await env.DB.batch([
  env.DB.prepare(`INSERT OR IGNORE INTO character_titles
   (code,name,description,badge_text,image_url,pve_power,unlock_type,unlock_config_json,style_preset,is_active,is_public,sort_order)
   VALUES(?,?,?,?,?,?,?,?,?,1,1,?)`).bind(t.code,t.name,t.description,t.name,t.image,t.power,t.type,JSON.stringify(t.config),t.style,t.order),
  env.DB.prepare('INSERT INTO app_meta(key,value,updated_at) VALUES(?,?,CURRENT_TIMESTAMP) ON CONFLICT(key) DO UPDATE SET value=excluded.value,updated_at=CURRENT_TIMESTAMP').bind(RAID_BUS_DRIVER_TITLE_KEY,'1')
 ]);
}
