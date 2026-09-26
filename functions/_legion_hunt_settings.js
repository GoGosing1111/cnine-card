import {DIFFICULTIES} from '../preview/sustained-hunt-v2/hunt-rules.mjs';
import {jointError} from './_joint_request.js';
export const LEGION_HUNT_ACCESS=Object.freeze({ownerEnabled:true,publicEnabled:false,liveRewards:false});
export const LEGION_HUNT_SETTINGS_KEY='legion_hunt_settings_v1';
const fail=message=>{throw jointError('HUNT_POLICY',message);};
const integer=(v,min,max)=>Number.isSafeInteger(v)&&v>=min&&v<=max;
const keys=(value,allowed)=>value&&typeof value==='object'&&!Array.isArray(value)&&Object.keys(value).every(k=>allowed.includes(k));
const imagePath=value=>{const path=String(value||'').replaceAll('\\','/').replace(/^\/+/, '');return path.startsWith('assets/')&&!/[?#\x00-\x1f]/.test(path)&&!path.split('/').includes('..')?'/'+path:'/assets/ui/scrapyard/vehicle-part-frame-v1667.svg';};
const tier=rarity=>['MYTHIC','LEGENDARY','ZENITH','SUPERSTAR','FUR'].includes(rarity)?'epic':rarity==='EPIC'?'rare':'normal';
export async function legionHuntCatalog(env){
  const definitions=[
    ['INVENTORY_ITEM',"SELECT code ref,name,rarity,image_url FROM inventory_items WHERE is_active=1 ORDER BY code LIMIT 1001"],
    ['EQUIPMENT',"SELECT CAST(id AS TEXT) ref,name,rarity,image_url FROM character_equipment_items WHERE is_active=1 AND is_public=1 ORDER BY id LIMIT 1001"],
    ['VEHICLE',"SELECT CAST(id AS TEXT) ref,name,rarity,image_url FROM character_garage_items WHERE is_active=1 AND is_public=1 ORDER BY id LIMIT 1001"],
    ['CARD',"SELECT CAST(c.id AS TEXT) ref,c.title name,c.rarity,c.image_url FROM cards_effective_v1210 c JOIN members m ON m.id=c.member_id WHERE UPPER(c.rarity) IN ('SUPERSTAR','ZENITH','FUR') AND c.is_active=1 AND m.is_active=1 AND COALESCE(c.card_status,'PUBLIC')='PUBLIC' ORDER BY c.id LIMIT 1001"]
  ];
  const results=await Promise.all(definitions.map(([,sql])=>env.DB.prepare(sql).all()));
  if(results.some(r=>(r.results||[]).length>1000))throw jointError('HUNT_CATALOG_LIMIT','아이템 목록이 조회 한도를 초과했습니다. 목록 분할이 필요합니다.',503);
  return results.flatMap((r,i)=>(r.results||[]).map(row=>({code:definitions[i][0]+':'+row.ref,type:definitions[i][0],ref:String(row.ref),name:String(row.name),image:imagePath(row.image_url),rarity:row.rarity,tier:tier(row.rarity)})));
}
export function defaultLegionHuntPolicy(){
  return {revision:0,difficulties:DIFFICULTIES.map(d=>({id:d.id,dropPercent:Math.round(d.dropChance*10000)/100,bossDropPercent:72,lifetimeSeconds:d.dropLifeMs/1000})),items:[]};
}
export function validateLegionHuntPolicy(value,catalog){
  if(!keys(value,['revision','difficulties','items','updatedBy','updatedAt'])||!integer(value.revision,0,1e9)||!Array.isArray(value.difficulties)||value.difficulties.length!==4||!Array.isArray(value.items)||value.items.length>100)fail('난이도 4개와 드랍 후보 최대 100개를 확인하세요.');
  const percent=v=>Number.isFinite(v)&&v>=0&&v<=100&&Math.abs(v*100-Math.round(v*100))<.000001;
  const ids=new Set(),byCode=new Map(catalog.map(r=>[r.code,r]));
  const difficulties=value.difficulties.map(d=>{
    if(!keys(d,['id','dropPercent','bossDropPercent','lifetimeSeconds'])||!DIFFICULTIES.some(p=>p.id===d.id)||ids.has(d.id)||!percent(d.dropPercent)||!percent(d.bossDropPercent)||!Number.isFinite(d.lifetimeSeconds)||d.lifetimeSeconds<3||d.lifetimeSeconds>30||!Number.isInteger(d.lifetimeSeconds*10))fail('난이도별 확률은 0~100%, 소멸 시간은 3~30초로 입력하세요.');
    ids.add(d.id);return {...d};
  });
  const seen=new Set(),items=value.items.map(row=>{
    // Names, images and item identifiers are always resolved from the current catalog.
    if(!keys(row,['code','type','ref','name','image','rarity','tier','enabled','weight','minQuantity','maxQuantity'])||seen.has(row.code)||typeof row.enabled!=='boolean'||!integer(row.weight,0,1000000)||!integer(row.minQuantity,1,1000000)||!integer(row.maxQuantity,row.minQuantity,1000000)||(row.enabled&&row.weight===0))fail('중복 아이템, 가중치 또는 수량 범위를 확인하세요.');
    const item=byCode.get(row.code);if(!item)fail('현재 사용 가능한 아이템을 다시 선택하세요: '+String(row.code));
    if(item.type==='VEHICLE'&&(row.minQuantity!==1||row.maxQuantity!==1))fail('이동수단은 1개씩 드랍하도록 설정하세요.');
    if(item.type==='EQUIPMENT'&&row.maxQuantity>100)fail('장비 수량은 최대 100개입니다.');
    seen.add(row.code);return {...item,enabled:row.enabled,weight:row.weight,minQuantity:row.minQuantity,maxQuantity:row.maxQuantity};
  });
  return {revision:value.revision,difficulties,items};
}
export async function readLegionHuntPolicy(env){
  const row=await env.DB.prepare('SELECT value FROM app_meta WHERE key=?').bind(LEGION_HUNT_SETTINGS_KEY).first();
  if(!row)return {raw:null,policy:defaultLegionHuntPolicy()};
  try{
    const policy=JSON.parse(row.value);
    if(!policy||!Array.isArray(policy.items)||!Array.isArray(policy.difficulties)||policy.items.length>100||policy.difficulties.length!==4)throw Error('Invalid policy');
    return {raw:row.value,policy};
  }catch{throw jointError('HUNT_POLICY_UNAVAILABLE','군단토벌 설정을 읽을 수 없습니다.',503);}
}
export async function saveLegionHuntPolicy(env,user,value){
  const before=await readLegionHuntPolicy(env);
  if(value?.revision!==before.policy.revision)throw jointError('HUNT_POLICY_CONFLICT','다른 창에서 설정을 바꿨습니다. 다시 불러온 뒤 저장하세요.',409);
  const next=validateLegionHuntPolicy(value,await legionHuntCatalog(env));
  next.revision++;next.updatedBy=Number(user.id);next.updatedAt=new Date().toISOString();
  const raw=JSON.stringify(next),key=LEGION_HUNT_SETTINGS_KEY;
  const write=before.raw===null?
    env.DB.prepare('INSERT INTO app_meta(key,value,updated_at) VALUES(?,?,CURRENT_TIMESTAMP) ON CONFLICT(key) DO NOTHING').bind(key,raw):
    env.DB.prepare('UPDATE app_meta SET value=?,updated_at=CURRENT_TIMESTAMP WHERE key=? AND value=?').bind(raw,key,before.raw);
  // The audit and compare-and-swap commit in the same DB batch. A losing writer adds no audit row.
  const audit=env.DB.prepare("INSERT INTO admin_logs(admin_id,action_type,target_type,target_id,before_data,after_data) SELECT ?,'LEGION_HUNT_SETTINGS_SAVE','LEGION_HUNT',?,?,? WHERE EXISTS(SELECT 1 FROM app_meta WHERE key=? AND value=?)")
    .bind(user.id,key,before.raw,raw,key,raw);
  const result=await env.DB.batch([write,audit]);
  if(Number(result[0].meta?.changes)!==1)throw jointError('HUNT_POLICY_CONFLICT','다른 창에서 먼저 저장했습니다. 다시 불러오세요.',409);
  return next;
}
