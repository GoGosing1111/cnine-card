import {jointError,readJointBody} from './_joint_request.js';
import {jointGuard,jointGuardEnd} from './_joint_atomic.js';
import {readRegionPolicy} from './_legion_regions.js';
import {REGION_EQUIPMENT} from '../shared/legion-regions-v1.mjs';
import {FIRST_TIER,tierById,citadelTierMenu,CITADEL_ITEM_MULTIPLIER,CITADEL_COIN_MULTIPLIER,CITADEL_UNIQUE_REWARDS} from './_legion_citadel_tiers.js';
import {LEGION_COIN_CAPS} from '../shared/legion-hunt-coins-v1.mjs';

export const CITADEL_POLICY_KEY='legion_citadel_settings_v1';
export const SUPPLIES=Object.freeze({EQUIPMENT_POLISH_STONE:5,VEHICLE_PART_ENGINE:1,VEHICLE_PART_FRAME:2,VEHICLE_PART_TIRE:3});
const setCodes=REGION_EQUIPMENT.filter(item=>item.kind==='SET').map(item=>item.code);
export function defaultCitadelPolicy(){
 return {revision:0,mode:'OFF',tierDrops:{},drops:{normalPercent:6.5,elitePercent:38,bossPercent:100,bossSetPercent:null,bossMultiplier:3,
  supplies:Object.entries(SUPPLIES).map(([code,quantity])=>({code,quantity,weight:1})),equipmentCodes:null}};
}
const invalid=message=>{throw jointError('CITADEL_POLICY',message,400);};
const conflict=()=>jointError('CITADEL_SETTINGS_CHANGED','다른 창에서 성채 설정을 변경했습니다. 다시 불러오세요.',409);
const integer=(v,min,max)=>Number.isSafeInteger(v)&&v>=min&&v<=max;
const percent=n=>Number.isFinite(n)&&n>=0&&n<=100;
const hasKeys=(v,keys)=>v&&typeof v==='object'&&!Array.isArray(v)&&Object.keys(v).length===keys.length&&keys.every(k=>Object.hasOwn(v,k));
function validateDrops(d){
 if(!hasKeys(d,['normalPercent','elitePercent','bossPercent','bossSetPercent','bossMultiplier','supplies','equipmentCodes'])||
  ![d.normalPercent,d.elitePercent,d.bossPercent].every(percent)||d.bossSetPercent!==null&&!percent(d.bossSetPercent)||
  !integer(d.bossMultiplier,1,100))invalid('확률은 0~100%, 성주 재료 수량 배수는 1~100 사이로 입력하세요.');
 if(!Array.isArray(d.supplies)||d.supplies.length<2||d.supplies.length>100||
  d.supplies.some(v=>!hasKeys(v,['code','quantity','weight'])||typeof v.code!=='string'||!v.code.length||v.code.length>120||
  !integer(v.quantity,1,1000000)||!integer(v.weight,1,1000000))||
  new Set(d.supplies.map(v=>v.code)).size!==d.supplies.length)invalid('두 사람에게 나눌 서로 다른 재료 2~100종과 양수인 수량·가중치를 입력하세요.');
 if(d.equipmentCodes!==null&&(!Array.isArray(d.equipmentCodes)||d.equipmentCodes.length>setCodes.length||
  d.equipmentCodes.some(code=>!setCodes.includes(code))||new Set(d.equipmentCodes).size!==d.equipmentCodes.length))invalid('성주가 드롭할 지역 세트 장비 목록을 확인하세요.');
 return d;
}
export async function readCitadelPolicy(env){
 const row=await env.DB.prepare('SELECT value FROM app_meta WHERE key=?').bind(CITADEL_POLICY_KEY).first();
 if(!row)return {raw:null,policy:defaultCitadelPolicy()};
 try{
  const p=JSON.parse(row.value);
  if(!integer(p.revision,0,1e9)||!['OFF','ON'].includes(p.mode))throw Error();
  validateDrops(p.drops);p.tierDrops??={};
  if(typeof p.tierDrops!=='object'||Array.isArray(p.tierDrops))throw Error();
  for(const [id,drops] of Object.entries(p.tierDrops)){if(id===FIRST_TIER||!tierById(id))throw Error();validateDrops(drops);}
  return {raw:row.value,policy:p};
 }catch{throw jointError('CITADEL_SETTINGS_UNAVAILABLE','성채 설정을 확인할 수 없습니다.',503);}
}
async function adminCatalog(env){
 const [goods,gear,region]=await Promise.all([
  env.DB.prepare('SELECT code,name FROM inventory_items WHERE is_active=1 ORDER BY name,code').all(),
  env.DB.prepare('SELECT code,name FROM character_equipment_items WHERE is_active=1 AND is_public=1 AND code IN ('+setCodes.map(()=>'?').join(',')+') ORDER BY name,code').bind(...setCodes).all(),
  readRegionPolicy(env)
 ]);
 const enabled=new Set(region.policy.regions.filter(r=>r.enabled).map(r=>r.id));
 const open=new Set(REGION_EQUIPMENT.filter(e=>enabled.has(e.regionId)&&region.policy.mode==='ON').map(e=>e.code));
 const reference=region.policy.mode==='ON'&&region.policy.ascendantDrops?.enabled&&region.policy.ascendantDrops.tiers.find(t=>t.tier===10);
 const partyRewards={itemMultiplier:CITADEL_ITEM_MULTIPLIER,coinMultiplier:CITADEL_COIN_MULTIPLIER,coinCap:LEGION_COIN_CAPS.regions.calamity*CITADEL_COIN_MULTIPLIER,
  unique:Object.fromEntries(citadelTierMenu.map(({id})=>{
   const scale=tierById(id).uniqueScale;
   return [id,{scale,tiers:CITADEL_UNIQUE_REWARDS.map(row=>({...row,expectedRuns:reference?reference.expectedRuns*row.divisor/scale:null}))}];
  }))};
 return {supplies:goods.results,partyRewards,equipment:gear.results.map(v=>({...v,available:open.has(v.code)})),
  regionalBossSetPercent:region.policy.difficulties.find(d=>d.id==='calamity').loot.bossSetPercent};
}
async function save(env,user,body){
 const before=await readCitadelPolicy(env),{policy}=before;
 if(body.revision!==policy.revision)throw conflict();
 const modeOnly=hasKeys(body,['revision','mode']),tier=Object.hasOwn(body,'tier')?body.tier:FIRST_TIER;
 const next={...policy,tierDrops:{...policy.tierDrops}};
 if(modeOnly){
  if(!['ON','OFF'].includes(body.mode))invalid('입장 상태를 확인하세요.');next.mode=body.mode;
 }else{
  if(!(hasKeys(body,['revision','drops','tier'])||hasKeys(body,['revision','drops']))||!tierById(tier))invalid('난이도별 드롭 설정을 확인하세요.');
  if(tier===FIRST_TIER)next.drops=validateDrops(body.drops);
  else if(body.drops===null)delete next.tierDrops[tier];
  else next.tierDrops[tier]=validateDrops(body.drops);
 }
 if(!modeOnly||next.mode==='ON'){
  const catalog=await adminCatalog(env),goods=new Set(catalog.supplies.map(r=>r.code)),gear=new Set(catalog.equipment.map(r=>r.code));
  const policies=modeOnly?[next.drops,...Object.values(next.tierDrops)]:[next.tierDrops[tier]??next.drops];
  if(policies.some(d=>d.supplies.some(v=>!goods.has(v.code))||d.equipmentCodes?.some(code=>!gear.has(code))))invalid('활성 아이템과 공개된 지역 세트 장비만 선택하세요.');
 }
 if(JSON.stringify(next)===JSON.stringify(policy)&&before.raw!==null)return policy;
 next.revision++;const db=env.DB,raw=JSON.stringify(next),token=crypto.randomUUID();
 const statements=[];
 if(db.dialect==='postgres')statements.push(db.prepare('SELECT key FROM app_meta WHERE key=? FOR UPDATE').bind(CITADEL_POLICY_KEY));
 statements.push(jointGuard(db,token,before.raw===null?'NOT EXISTS(SELECT 1 FROM app_meta WHERE key=?)':'EXISTS(SELECT 1 FROM app_meta WHERE key=? AND value=?)',before.raw===null?[CITADEL_POLICY_KEY]:[CITADEL_POLICY_KEY,before.raw]),
  before.raw===null?db.prepare('INSERT INTO app_meta(key,value,updated_at) VALUES(?,?,CURRENT_TIMESTAMP)').bind(CITADEL_POLICY_KEY,raw):
   db.prepare('UPDATE app_meta SET value=?,updated_at=CURRENT_TIMESTAMP WHERE key=? AND value=?').bind(raw,CITADEL_POLICY_KEY,before.raw),
  db.prepare('INSERT INTO admin_logs(admin_id,action_type,target_type,target_id,before_data,after_data) VALUES(?,?,?,?,?,?)').bind(user.id,'LEGION_CITADEL_SETTINGS','APP_META',CITADEL_POLICY_KEY,before.raw,raw),jointGuardEnd(db,token));
 try{await db.batch(statements);}catch(e){if((await readCitadelPolicy(env)).raw!==before.raw)throw conflict();throw e;}
 return next;
}
export async function citadelAdmin({request,env,user,deps}){
 if(user.role!=='OWNER')throw jointError('CITADEL_ADMIN','OWNER만 성채 드롭을 설정할 수 있습니다.',403);
 if(request.method==='GET'){
  const [{policy},catalog]=await Promise.all([readCitadelPolicy(env),adminCatalog(env)]);return {ok:true,policy,catalog,tiers:citadelTierMenu};
 }
 if(request.method!=='PATCH')throw jointError('CITADEL_METHOD','지원하지 않는 요청입니다.',405);
 const input=await readJointBody(request,{maxBytes:32768,fields:['mode','drops','revision','tier']});
 return deps.withUserMutationLock(env,user.id,'admin/legion-hunt/citadel',async()=>({ok:true,policy:await save(env,user,input)}));
}

