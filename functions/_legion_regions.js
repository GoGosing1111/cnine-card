import {LEGION_REGIONS,REGION_DIFFICULTIES,REGION_EQUIPMENT,LEGION_REGIONS_KEY,legionRegionDefaults,regionById,regionalDifficulty} from '../shared/legion-regions-v1.mjs';
import {POLISH_ITEM_CODE,POLISH_ART} from '../shared/equipment-polish-v1.mjs';
import {jointError} from './_joint_request.js';
import {jointGuard,jointGuardEnd} from './_joint_atomic.js';
const fail=message=>{throw jointError('HUNT_REGION_POLICY',message,400);};
const bounded=(value,min,max)=>typeof value==='number'&&Number.isFinite(value)&&value>=min&&value<=max;
const exact=(value,names)=>value&&typeof value==='object'&&!Array.isArray(value)&&Object.keys(value).every(k=>names.includes(k));
export function regionAccess(policy,user){return Boolean(user&&(policy.mode==='ON'||policy.mode==='TEST'&&(user.role==='OWNER'||policy.testUserIds.includes(Number(user.id)))));}
export function validateRegionPolicy(raw){
  if(!exact(raw,['schemaVersion','revision','mode','regions','difficulties','testUserIds'])||raw.schemaVersion!==1||!Number.isSafeInteger(raw.revision)||raw.revision<0||!['OFF','TEST','ON'].includes(raw.mode))fail('지역 운영 설정을 확인하세요.');
  if(!Array.isArray(raw.regions)||raw.regions.length!==5||new Set(raw.regions.map(r=>r.id)).size!==5||raw.regions.some(r=>!exact(r,['id','enabled'])||!regionById(r.id)||typeof r.enabled!=='boolean'))fail('지역 5개의 공개 설정을 확인하세요.');
  if(!Array.isArray(raw.testUserIds)||raw.testUserIds.length>100||new Set(raw.testUserIds).size!==raw.testUserIds.length||raw.testUserIds.some(id=>!Number.isSafeInteger(id)||id<=0))fail('검수 계정은 중복 없이 최대 100명입니다.');
  if(!Array.isArray(raw.difficulties)||raw.difficulties.length!==5||new Set(raw.difficulties.map(d=>d.id)).size!==5)fail('난이도 5개가 필요합니다.');
  for(const d of raw.difficulties){
    if(!exact(d,['id','power','bossPower','attack','shield','forced','loot'])||!regionalDifficulty(d.id)||!Number.isSafeInteger(d.power)||!bounded(d.power,1000,1e9)||!Number.isSafeInteger(d.bossPower)||!bounded(d.bossPower,d.power,1e9)||!bounded(d.attack,100,500)||!bounded(d.shield,0,100)||!Number.isInteger(d.forced)||!bounded(d.forced,2,12))fail('몬스터 능력치와 행동 간격을 확인하세요.');
    const loot=d.loot,percentKeys=['stonePercent','eliteStonePercent','eliteSetPercent','bossSetPercent','bossUniquePercent'];
    if(!exact(loot,[...percentKeys,'bossStones','lifetimeSeconds'])||percentKeys.some(k=>!bounded(loot[k],0,100)||Math.abs(loot[k]*1000-Math.round(loot[k]*1000))>1e-7)||!Number.isInteger(loot.bossStones)||!bounded(loot.bossStones,1,100)||!bounded(loot.lifetimeSeconds,3,30))fail('지역 드랍 확률·수량·소멸 시간을 확인하세요.');
  }
  return structuredClone(raw);
}
export async function readRegionPolicy(env){
  const row=await env.DB.prepare('SELECT value FROM app_meta WHERE key=?').bind(LEGION_REGIONS_KEY).first();
  if(!row)return {raw:null,policy:legionRegionDefaults()};
  try{return {raw:row.value,policy:validateRegionPolicy(JSON.parse(row.value))};}
  catch{throw jointError('HUNT_REGION_UNAVAILABLE','지역 설정을 읽을 수 없습니다.',503);}
}
export async function regionRewardCatalog(env,{live=false}={}){
  const codes=REGION_EQUIPMENT.map(e=>e.code);
  const [gear,stone]=await Promise.all([
    env.DB.prepare(`SELECT * FROM character_equipment_items WHERE code IN (${codes.map(()=>'?').join(',')})`).bind(...codes).all(),
    env.DB.prepare('SELECT code,name,image_url,is_active FROM inventory_items WHERE code=?').bind(POLISH_ITEM_CODE).first()
  ]);
  const byCode=new Map((gear.results||[]).map(item=>[item.code,item]));
  if(live&&(!stone?.is_active||codes.some(code=>!byCode.get(code)?.is_active||!byCode.get(code)?.is_public)))throw jointError('HUNT_REGION_CATALOG','지역 장비와 연마석 등록·공개 상태를 확인하세요.',423);
  const items=REGION_EQUIPMENT.map(item=>{const row=byCode.get(item.code),ref=String(row?.id||item.code);return {code:`EQUIPMENT:${ref}`,equipmentCode:item.code,totalPower:Number(row?.total_power??item.totalPower),regionId:item.regionId,kind:item.kind,type:'EQUIPMENT',ref,name:row?.name||item.name,image:row?.image_url||item.image,rarity:row?.rarity||item.rarity,tier:item.kind==='UNIQUE'?'epic':'rare',quantity:1,enabled:true,weight:1,minQuantity:1,maxQuantity:1};});
  return [...items,{code:`INVENTORY_ITEM:${POLISH_ITEM_CODE}`,kind:'STONE',type:'INVENTORY_ITEM',ref:POLISH_ITEM_CODE,name:stone?.name||'연마석',image:stone?.image_url?'/'+stone.image_url.replace(/^\//,''):POLISH_ART+'polishing-stone-v1.png',rarity:'SPECIAL',tier:'normal',quantity:1,enabled:true,weight:1,minQuantity:1,maxQuantity:1}];
}
export async function saveRegionPolicy(env,user,value){
  const before=await readRegionPolicy(env),next=validateRegionPolicy(value);
  if(next.revision!==before.policy.revision)throw jointError('HUNT_REGION_CONFLICT','다른 창에서 변경했습니다. 다시 불러오세요.',409);
  if(next.testUserIds.length){const {results=[]}=await env.DB.prepare(`SELECT id FROM users WHERE id IN (${next.testUserIds.map(()=>'?').join(',')})`).bind(...next.testUserIds).all();if(results.length!==next.testUserIds.length)fail('존재하는 검수 계정만 추가하세요.');}
  if(next.mode==='ON')await regionRewardCatalog(env,{live:true});
  next.revision++;const raw=JSON.stringify(next),token=crypto.randomUUID(),db=env.DB;
  try{await db.batch([
    jointGuard(db,token,before.raw===null?'NOT EXISTS(SELECT 1 FROM app_meta WHERE key=?)':'EXISTS(SELECT 1 FROM app_meta WHERE key=? AND value=?)',before.raw===null?[LEGION_REGIONS_KEY]:[LEGION_REGIONS_KEY,before.raw]),
    db.prepare('INSERT INTO app_meta(key,value,updated_at) VALUES(?,?,CURRENT_TIMESTAMP) ON CONFLICT(key) DO UPDATE SET value=excluded.value,updated_at=CURRENT_TIMESTAMP').bind(LEGION_REGIONS_KEY,raw),
    db.prepare('INSERT INTO admin_logs(admin_id,action_type,target_type,target_id,before_data,after_data) VALUES(?,?,?,?,?,?)').bind(user.id,'LEGION_REGION_SETTINGS','APP_META',LEGION_REGIONS_KEY,before.raw,raw),jointGuardEnd(db,token)
  ]);}catch(error){if((await readRegionPolicy(env)).raw!==before.raw)throw jointError('HUNT_REGION_CONFLICT','설정이 변경됐습니다. 다시 불러오세요.',409);throw error;}
  return next;
}
export function regionBootstrap(policy,user,catalog=[]){
  if(!regionAccess(policy,user))return null;
  return {mode:policy.mode,revision:policy.revision,regions:LEGION_REGIONS.filter(r=>policy.regions.find(p=>p.id===r.id)?.enabled),
    difficulties:REGION_DIFFICULTIES.map(d=>({...d,...policy.difficulties.find(p=>p.id===d.id)})),equipment:REGION_EQUIPMENT.map(item=>{const row=catalog.find(r=>r.equipmentCode===item.code);return row?{...item,name:row.name,image:row.image,rarity:row.rarity,totalPower:row.totalPower}:item;})};
}
