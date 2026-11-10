import {prepareUnifiedDropGrant} from './_drop_pool.js';
import {jointGuard,jointGuardEnd} from './_joint_atomic.js';
import {ascendantBossPercent,readRegionPolicy,regionAccess} from './_legion_regions.js';
import {REGION_EQUIPMENT,LEGION_REGIONS_KEY,regionalDifficulty} from '../shared/legion-regions-v1.mjs';
import {UNIQUE_MERCENARY_EQUIPMENT} from '../shared/mercenary-unique-equipment-v1.mjs';
import {createLegionCoins} from '../shared/legion-hunt-coins-v1.mjs';
import {readCollectionBonuses} from './_collection_bonuses.js';
import {readMartialLaw} from './_martial_law.js';
import {readMiracleDropPercent} from './_miracle_burning.js';
import {FIRST_TIER,tierById,CITADEL_ITEM_MULTIPLIER,CITADEL_COIN_MULTIPLIER,CITADEL_UNIQUE_REWARDS} from './_legion_citadel_tiers.js';
import {jointError} from './_joint_request.js';
import {defaultCitadelPolicy,SUPPLIES} from './_legion_citadel_policy.js';
export {SUPPLIES};
// The configuration supports odds finer than one in 2^32.
const sample=()=>{
 const [high,low]=crypto.getRandomValues(new Uint32Array(2));
 return (high*2097152+(low>>>11))/9007199254740992;
};
function splitPool(rows,random){
 const sorted=[...rows];
 for(let i=sorted.length-1;i>0;i--){
  const j=Math.floor(random()*(i+1));[sorted[i],sorted[j]]=[sorted[j],sorted[i]];
 }
 return [sorted.filter((_,i)=>i%2===0),sorted.filter((_,i)=>i%2===1)];
}
// Opposite players draw from disjoint portions for the entire run, including the boss.
export function distributeCitadelLoot(supply,gear,chance,random=sample){
 if(supply.length<2)throw jointError('CITADEL_LOOT','지급 가능한 성채 전리품을 준비하고 있습니다.',503);
 const goods=splitPool(supply,random),armory=splitPool(gear,random);
 return goods.map((own,seat)=>({goods:own,armory:armory[seat],chance}));
}
export function personalFarm(pool,kills,magnet=false,random=sample){
 const ordinary=[...pool.goods,...pool.armory];
 const items=[...ordinary],events=[];
 let cumulative=0;
 const uniqueTable=(pool.unique||[]).map(({pieces,percent})=>{
  const index=items.length;items.push(...pieces);cumulative+=percent;
  return {end:cumulative,index,count:pieces.length};
 });
 const rules=pool.rates||defaultCitadelPolicy().drops;
 const weight=pool.goods.reduce((total,item)=>total+(item.weight??1),0);
 // One ticket per eligible kill. Each row owns an interval equal to its original
 // marginal chance × 1.5. Crossing 100% yields a second item in the same pickup.
 // This preserves each item's rate even when the old boss drop was guaranteed.
 const tables=[rules.normalPercent,rules.elitePercent,rules.bossPercent].map((pct,kind)=>{
  const setShare=kind===2&&pool.armory.length?pool.chance/100:0;
  let end=0;
  return ordinary.map((item,index)=>{
   const share=index<pool.goods.length?(1-setShare)*(item.weight??1)/weight:setShare/pool.armory.length;
   end+=Math.min(100,pct*share*CITADEL_ITEM_MULTIPLIER);
   const quantity=item.type==='EQUIPMENT'?1:(item.quantity??SUPPLIES[item.ref]??1)*(kind===2?rules.bossMultiplier:1);
   return {end,index,quantity};
  });
 });
 let last=-10000;
 for(const [at,kind] of kills){
  if(kind!==2&&at-last<2400)continue;
  const rewards=[];
  if(kind===2&&uniqueTable.length){
   const uniqueTicket=random()*100;
   const hit=uniqueTable.find(row=>uniqueTicket<row.end);
   if(hit)rewards.push([hit.index+Math.floor(random()*hit.count),1]);
  }
  const table=tables[kind];
  let ticket=random()*100;
  if(ticket<table.at(-1).end){
   for(const row of table){
    if(ticket>=row.end)continue;
    rewards.push([row.index,row.quantity]);ticket+=100;
   }
  }
  if(!rewards.length)continue;
  const used=new Set(events.slice(-6).filter(e=>e[0]+12000>at).map(e=>e[3])),free=[0,1,2,3,4,5].filter(i=>!used.has(i));if(!free.length)continue;
  const [[index,quantity],...extras]=rewards;
  const event=[at,index,quantity,free[Math.floor(random()*free.length)],crypto.randomUUID().slice(0,18)];
  if(extras.length)event.push(extras);
  events.push(event);last=at;
 }
 return {items:items.map(({type,ref,name,image})=>({type,ref,name,image})),events,magnet,picked:[]};
}
export function farmView(f,elapsed,active){
 const bag=new Map(),ground=[];let picked=0,next=Infinity;
 const marked=new Set(f.picked);
 for(const [at,index,quantity,pos,token,extras=[]] of f.events){
  if(at>elapsed){next=Math.min(next,at);break;}
  const item=f.items[index];if(f.magnet||marked.has(token)){
   for(const [slot,count] of [[index,quantity],...extras]){
    const total=bag.get(slot)||{...f.items[slot],quantity:0};total.quantity+=count;bag.set(slot,total);
   }
   picked++;
  }else if(active&&elapsed<at+12000){ground.push({token,pos,expires:at+12000,name:item.name,image:item.image,quantity,...(extras.length?{extraKinds:extras.length}:{})});next=Math.min(next,at+12000);}
 }
 return {drops:[...bag.values()],ground,picked,next:Number.isFinite(next)?next:null,magnet:f.magnet};
}
export async function citadelLoot(env,users,drops=defaultCitadelPolicy().drops,tier=FIRST_TIER){
 const configured=new Map(drops.supplies.map(v=>[v.code,v])),codes=[...configured.keys()];
 const [inventory,region,bonuses,miracle,martialLaw]=await Promise.all([
  env.DB.prepare('SELECT code,name,image_url FROM inventory_items WHERE is_active=1 AND code IN ('+codes.map(()=>'?').join(',')+') ORDER BY code').bind(...codes).all(),
  readRegionPolicy(env),Promise.all(users.map(u=>readCollectionBonuses(env,u.id))),readMiracleDropPercent(env),readMartialLaw(env)
 ]);
 const supply=inventory.results.map(r=>({ref:r.code,type:'INVENTORY_ITEM',name:r.name,image:r.image_url,
  quantity:configured.get(r.code).quantity,weight:configured.get(r.code).weight}));
 const allow=region.policy.mode==='ON'&&users.every(u=>regionAccess(region.policy,u));
 const enabled=new Set(region.policy.regions.filter(r=>r.enabled).map(r=>r.id));
 const sets=REGION_EQUIPMENT.filter(r=>r.kind==='SET'&&enabled.has(r.regionId)&&(drops.equipmentCodes===null||drops.equipmentCodes.includes(r.code))).map(r=>r.code);
 const {uniqueScale}=tierById(tier);
 const tier10=allow&&region.policy.ascendantDrops?.enabled&&region.policy.ascendantDrops.tiers.find(t=>t.tier===10);
 const uniqueCodes=new Map(tier10?UNIQUE_MERCENARY_EQUIPMENT.map(item=>[item.code,item.tier]):[]);
 const gearCodes=allow?[...sets,...uniqueCodes.keys()]:[];
 const gears=gearCodes.length?(await env.DB.prepare('SELECT id,code,name,image_url FROM character_equipment_items WHERE is_active=1 AND is_public=1 AND code IN ('+gearCodes.map(()=>'?').join(',')+') ORDER BY id').bind(...gearCodes).all()).results:[];
 const gear=row=>({ref:String(row.id),type:'EQUIPMENT',name:row.name,image:row.image_url});
 const uniques=gears.filter(row=>uniqueCodes.has(row.code));
 if(uniques.length!==uniqueCodes.size)throw jointError('CITADEL_CATALOG','성주 유니크 1~3단계 장비 15종의 등록·공개 상태를 확인하세요.',503);
 const uniquePools=tier10?CITADEL_UNIQUE_REWARDS.map(({tier,divisor})=>({
  divisor,seats:splitPool(uniques.filter(row=>uniqueCodes.get(row.code)===tier).map(gear),sample)
 })):[];
 const chance=drops.bossSetPercent??region.policy.difficulties.find(d=>d.id==='calamity')?.loot?.bossSetPercent??0;
 const {normalPercent,elitePercent,bossPercent,bossMultiplier}=drops;
 const pools=distributeCitadelLoot(supply,gears.filter(row=>!uniqueCodes.has(row.code)).map(gear),chance);
 return pools.map((pool,i)=>{
  const {coinPercent,dropPercent}=bonuses[i].totals;
  const uniqueBase=tier10?ascendantBossPercent(tier10.expectedRuns,miracle,dropPercent)*uniqueScale:0;
  // Coast is the first regional Calamity table (735 weighted kills). Freeze
  // bonuses, pacing and the multiplier at departure alongside the personal rolls.
  const {revision,cap,referenceUnits,multiplier}=createLegionCoins('coast','calamity',{bonusPercent:coinPercent,martialLaw:martialLaw.enabled});
  return {...pool,rates:{normalPercent,elitePercent,bossPercent,bossMultiplier},
   unique:uniquePools.map(row=>({pieces:row.seats[i],percent:uniqueBase/row.divisor})),
   coins:{revision,cap,referenceUnits,multiplier,huntDurationMs:regionalDifficulty('calamity').huntDurationMs,partyMultiplier:CITADEL_COIN_MULTIPLIER}};
 });
}
export async function citadelGrantStatements(env,user,id,items,policyLive,coins=0){
 if(!policyLive||(!items.length&&!coins))return [];
 const requestId='LEGION_CITADEL:'+id+':'+user.id;
 const rewards=items.map(i=>({rewardType:i.type,rewardRef:i.ref,rewardName:i.name,quantity:i.quantity}));
 if(coins)rewards.push({rewardType:'COIN',rewardRef:'COIN',rewardName:'코인',quantity:coins});
 const DB=env.DB;
 const grants=await prepareUnifiedDropGrant(env,{userId:Number(user.id),sourceType:'LEGION_CITADEL',sourceId:id,requestId,rewards},{writePoolLedger:false});
 const tag=crypto.randomUUID();
 const checks=items.map(i=>i.type==='EQUIPMENT'
  ?'EXISTS(SELECT 1 FROM character_equipment_items WHERE id=? AND is_active=1 AND is_public=1)'
  :'EXISTS(SELECT 1 FROM inventory_items WHERE code=? AND is_active=1)');
 const args=items.map(i=>i.type==='EQUIPMENT'?Number(i.ref):i.ref);
 if(items.some(i=>i.type==='EQUIPMENT')){
  const r=await readRegionPolicy(env);
  if(r.policy.mode!=='ON')throw jointError('CITADEL_PAUSED','장비 지급이 일시 중지되었습니다. 전리품은 보관됩니다.',423);
  checks.push('EXISTS(SELECT 1 FROM app_meta WHERE key=? AND value=?)');args.push(LEGION_REGIONS_KEY,r.raw);
 }
 const statements=[];
 if(checks.length)statements.push(jointGuard(DB,tag,checks.join(' AND '),args));
 statements.push(...grants.statements,jointGuard(DB,tag+':proof',grants.proofs.map(p=>'('+p.sql+')').join(' AND ')||'1=0',grants.proofs.flatMap(p=>p.values)));
 if(checks.length)statements.push(jointGuardEnd(DB,tag));
 statements.push(jointGuardEnd(DB,tag+':proof'));
 return statements;
}

