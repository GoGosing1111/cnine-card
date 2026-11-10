import {prepareUnifiedDropGrant} from './_drop_pool.js';
import {jointGuard,jointGuardEnd} from './_joint_atomic.js';
import {ascendantBossPercent,legionDropPercent,readRegionPolicy,regionAccess} from './_legion_regions.js';
import {REGION_EQUIPMENT,LEGION_REGIONS_KEY,regionalDifficulty} from '../shared/legion-regions-v1.mjs';
import {ASCENDANT_EQUIPMENT} from '../shared/mercenary-ascendant-equipment-v1.mjs';
import {POLISH_ITEM_CODE} from '../shared/equipment-polish-v1.mjs';
import {calamityMaterialCodes,calamityPartyDrops} from './_legion_citadel_calamity.js';
import {legionRewardAvailable} from './_legion_hunt_rewards.js';
import {UNIQUE_MERCENARY_EQUIPMENT} from '../shared/mercenary-unique-equipment-v1.mjs';
import {createLegionCoins} from '../shared/legion-hunt-coins-v1.mjs';
import {readCollectionBonuses} from './_collection_bonuses.js';
import {readMartialLaw} from './_martial_law.js';
import {readMiracleDropPercent} from './_miracle_burning.js';
import {FIRST_TIER,tierById,CITADEL_ITEM_MULTIPLIER,CITADEL_COIN_MULTIPLIER,CITADEL_UNIQUE_REWARDS} from './_legion_citadel_tiers.js';
import {jointError} from './_joint_request.js';
import {defaultCitadelPolicy,SUPPLIES} from './_legion_citadel_policy.js';
export {SUPPLIES};
// Room-local batches avoid a WebCrypto call for every kill. Keep 53 random bits
// per roll because configurable equipment odds can be smaller than one in 2^32.
function secureRolls(){
 const words=new Uint32Array(256);let next=words.length;
 return ()=>{
  if(next===words.length){crypto.getRandomValues(words);next=0;}
  return (words[next++]*2097152+(words[next++]>>>11))/9007199254740992;
 };
}
function splitPool(rows,random){
 const sorted=[...rows];
 for(let i=sorted.length-1;i>0;i--){
  const j=Math.floor(random()*(i+1));[sorted[i],sorted[j]]=[sorted[j],sorted[i]];
 }
 return [sorted.filter((_,i)=>i%2===0),sorted.filter((_,i)=>i%2===1)];
}
// Custom party supplies and party-exclusive uniques retain their personal pools.
export function distributeCitadelLoot(supply,gear,chance,random=secureRolls()){
 if(supply.length<2)throw jointError('CITADEL_LOOT','지급 가능한 성채 전리품을 준비하고 있습니다.',503);
 const goods=splitPool(supply,random),armory=splitPool(gear,random);
 return goods.map((own,seat)=>({goods:own,armory:armory[seat],chance}));
}
export function personalFarm(pool,kills,magnet=false,random=secureRolls()){
 const ordinary=[...pool.goods,...pool.armory];
 const items=[...ordinary],events=[];
 const itemSlots=new Map(items.map((item,i)=>[item.type+':'+item.ref,i]));
 function indexOf(item){
  const key=item.type+':'+item.ref;
  if(!itemSlots.has(key)){itemSlots.set(key,items.length);items.push(item);}
  return itemSlots.get(key);
 }
 let cumulative=0;
 const uniqueTable=(pool.unique||[]).map(({pieces,percent})=>{
  cumulative+=percent;return {end:cumulative,pieces};
 });
 const rules=pool.rates||defaultCitadelPolicy().drops;
 const weight=pool.goods.reduce((total,item)=>total+(item.weight??1),0);
 const tables=[rules.normalPercent,rules.elitePercent,rules.bossPercent].map((pct,kind)=>{
  const setShare=kind===2&&pool.armory.length?pool.chance/100:0;
  const extra=ordinary.map((item,index)=>{
   const share=index<pool.goods.length?(1-setShare)*(item.weight??1)/weight:setShare/pool.armory.length;
   const quantity=item.type==='EQUIPMENT'?1:(item.quantity??SUPPLIES[item.ref]??1)*(kind===2?rules.bossMultiplier:1);
   return {item,percent:Math.min(100,pct*share*CITADEL_ITEM_MULTIPLIER),min:quantity,max:quantity};
  });
  const groups=[...(pool.calamity?.groups[kind]||[]),extra];
  return groups.filter(g=>g.some(row=>row.percent>0)).map(group=>{
   let end=0;
   return group.filter(row=>row.percent>0).map(row=>{
    end+=row.percent;return {end,item:row.item,min:row.min,max:row.max};
   });
  });
 });
 const guaranteed=[],stone=pool.calamity?.guarantee;
 const occupiedUntil=Array(6).fill(-Infinity);
 let last=-10000;
 for(const [at,kind] of kills){
  if(!pool.calamity&&kind!==2&&at-last<2400)continue;
  if(kind===2&&stone)guaranteed.push([at,indexOf(stone.item),stone.quantity]);
  const rewards=[];
  if(kind===2&&uniqueTable.length){
   const uniqueTicket=random()*100;
   const hit=uniqueTable.find(row=>uniqueTicket<row.end);
   if(hit)rewards.push([indexOf(hit.pieces[Math.floor(random()*hit.pieces.length)]),1]);
  }
  for(const table of tables[kind]){
   let ticket=random()*100;
   if(ticket>=table.at(-1).end)continue;
   for(const row of table){
    if(ticket>=row.end)continue;
    const count=row.min===row.max?row.min:row.min+Math.floor(random()*(row.max-row.min+1));
    rewards.push([indexOf(row.item),count]);ticket+=100;
    if(ticket>=table.at(-1).end)break;
   }
  }
  if(!rewards.length)continue;
  const free=[0,1,2,3,4,5].filter(i=>occupiedUntil[i]<=at);
  const pos=free.length?free[Math.floor(random()*free.length)]:occupiedUntil.indexOf(Math.min(...occupiedUntil));
  occupiedUntil[pos]=at+12000;
  const [[index,quantity],...extras]=rewards;
  const event=[at,index,quantity,pos,crypto.randomUUID().slice(0,18)];
  if(extras.length)event.push(extras);
  events.push(event);last=at;
 }
 const visible=items.map(({type,ref,name,image,kind,tier})=>({
  type,ref,name,image,...(type==='EQUIPMENT'?{priority:kind==='CITADEL_UNIQUE'?30+tier:kind==='ASCENDANT'?10+tier:kind==='UNIQUE'?4:3}:{})
 }));
 return {items:visible,events,magnet,picked:[],...(stone?{guaranteed}:{})};
}
export function farmView(f,elapsed,active){
 const bag=new Map(),positions=new Map();let picked=0,next=Infinity;
 const add=(slot,count)=>{
  if(!bag.has(slot)){const {type,ref,name,image}=f.items[slot];bag.set(slot,{type,ref,name,image,quantity:0});}
  bag.get(slot).quantity+=count;
 };
 const marked=new Set(f.picked);
 for(const [at,index,count] of f.guaranteed||[]){
  if(at>elapsed){next=Math.min(next,at);break;}
  add(index,count);
 }
 for(const [at,index,quantity,pos,token,extras=[]] of f.events){
  if(at>elapsed){next=Math.min(next,at);break;}
  if(f.magnet||marked.has(token)){
   add(index,quantity);for(const [slot,count] of extras)add(slot,count);
   picked++;
  }else if(active&&elapsed<at+12000){
   const pile=positions.get(pos)||{index,counts:new Map(),token,pos,expires:at+12000};
   if((f.items[index].priority||0)>(f.items[pile.index].priority||0))pile.index=index;
   for(const [slot,count] of [[index,quantity],...extras])pile.counts.set(slot,(pile.counts.get(slot)||0)+count);
   positions.set(pos,pile);next=Math.min(next,at+12000);
  }
 }
 const ground=Array.from(positions.values(),({index,counts,token,pos,expires})=>({
  token,pos,expires,name:f.items[index].name,image:f.items[index].image,quantity:counts.get(index),...(counts.size>1?{extraKinds:counts.size-1}:{})
 }));
 return {drops:[...bag.values()],ground,picked,next:Number.isFinite(next)?next:null,magnet:f.magnet};
}
export function collectCitadelPile(farm,token,elapsed){
 if(farm.magnet)return false;
 const event=farm.events.find(row=>row[4]===token);
 if(!event||elapsed<event[0]||elapsed>=event[0]+12000)return false;
 const marked=new Set(farm.picked);
 for(const [at,,,pos,id] of farm.events){
  if(at>elapsed)break;
  if(pos===event[3]&&elapsed<at+12000)marked.add(id);
 }
 farm.picked=[...marked];return true;
}
async function activeCatalogRows(db,select,codes){
 const queries=[];
 for(let i=0;i<codes.length;i+=100){
  const page=codes.slice(i,i+100),marks=page.map(()=>'?').join(',');
  queries.push(db.prepare(select+' AND code IN ('+marks+') ORDER BY code').bind(...page).all());
 }
 return (await Promise.all(queries)).flatMap(page=>page.results);
}
export async function citadelLoot(env,users,drops=defaultCitadelPolicy().drops,tier=FIRST_TIER){
 const configured=new Map(drops.supplies.map(v=>[v.code,v]));
 const codes=[...new Set([...configured.keys(),POLISH_ITEM_CODE])];
 const [inventory,region,bonuses,miracle,martialLaw]=await Promise.all([
  activeCatalogRows(env.DB,'SELECT code,name,image_url FROM inventory_items WHERE is_active=1',codes),
  readRegionPolicy(env),Promise.all(users.map(u=>readCollectionBonuses(env,u.id))),readMiracleDropPercent(env),readMartialLaw(env)
 ]);
 const material=row=>({ref:row.code,type:'INVENTORY_ITEM',name:row.name,image:row.image_url});
 const supply=inventory.filter(r=>configured.has(r.code)).map(r=>({...material(r),quantity:configured.get(r.code).quantity,weight:configured.get(r.code).weight}));
 const regions=region.policy.mode==='ON'&&users.every(u=>regionAccess(region.policy,u))?region.policy.regions.filter(r=>r.enabled):[];
 const {uniqueScale}=tierById(tier),calamity=region.policy.difficulties.find(d=>d.id==='calamity').loot;
 const regionIds=new Set(regions.map(r=>r.id));
 const ascendant=regions.length&&region.policy.ascendantDrops?.enabled?region.policy.ascendantDrops.tiers:[];
 const tier10=ascendant.find(row=>row.tier===10);
 const sources=[...REGION_EQUIPMENT.filter(g=>regionIds.has(g.regionId)),...(ascendant.length?ASCENDANT_EQUIPMENT:[])];
 const unique=tier10?UNIQUE_MERCENARY_EQUIPMENT:[];
 const gearCodes=[...sources,...unique].map(g=>g.code);
 const gearRows=await activeCatalogRows(env.DB,'SELECT id,code,name,image_url FROM character_equipment_items WHERE is_active=1 AND is_public=1',gearCodes);
 const gearByCode=new Map(gearRows.map(r=>[r.code,{ref:String(r.id),type:'EQUIPMENT',name:r.name,image:r.image_url}]));
 if(gearByCode.size!==gearCodes.length)throw jointError('CITADEL_CATALOG','재앙 또는 성주 장비의 등록·공개 상태를 확인하세요.',503);
 const stoneRow=inventory.find(r=>r.code===POLISH_ITEM_CODE);
 if(regions.length&&!stoneRow)throw jointError('CITADEL_CATALOG','재앙 연마석의 등록 상태를 확인하세요.',503);
 const gear=sources.map(g=>({...gearByCode.get(g.code),kind:g.tier?'ASCENDANT':g.kind,tier:g.tier,regionId:g.regionId}));
 const reserved=calamityMaterialCodes(regions);
 // Never roll the same inherited item again through the old party supply table.
 const random=secureRolls();
 const parties=regions.length?splitPool(supply.filter(item=>!reserved.has(item.ref)),random).map(goods=>({goods,armory:[],chance:0})):distributeCitadelLoot(supply,[],0,random);
 const uniquePools=tier10?CITADEL_UNIQUE_REWARDS.map(({tier,divisor})=>({
  divisor,seats:splitPool(unique.filter(item=>item.tier===tier).map(item=>({...gearByCode.get(item.code),kind:'CITADEL_UNIQUE',tier})),random)
 })):[];
 const {normalPercent,elitePercent,bossPercent,bossMultiplier}=drops;
 return bonuses.map(({totals},i)=>{
  const {coinPercent,dropPercent}=totals;
  const uniqueBase=tier10?ascendantBossPercent(tier10.expectedRuns,miracle,dropPercent)*uniqueScale:0;
  const {revision,cap,referenceUnits,multiplier}=createLegionCoins('coast','calamity',{bonusPercent:coinPercent,martialLaw:martialLaw.enabled});
  return {...parties[i],rates:{normalPercent,elitePercent,bossPercent,bossMultiplier},
   calamity:regions.length?calamityPartyDrops(regions,calamity,ascendant,gear,material(stoneRow),base=>legionDropPercent(base,miracle,dropPercent)):null,
   unique:uniquePools.map(row=>({pieces:row.seats[i],percent:uniqueBase/row.divisor})),
   coins:{revision,cap,referenceUnits,multiplier,huntDurationMs:regionalDifficulty('calamity').huntDurationMs,partyMultiplier:CITADEL_COIN_MULTIPLIER}};
 });
}
export async function citadelGrantStatements(env,user,id,items,policyLive,coins=0,regional=false){
 if(!policyLive||(!items.length&&!coins))return [];
 const requestId='LEGION_CITADEL:'+id+':'+user.id;
 const rewards=items.map(i=>({rewardType:i.type,rewardRef:i.ref,rewardName:i.name,quantity:i.quantity}));
 if(coins)rewards.push({rewardType:'COIN',rewardRef:'COIN',rewardName:'코인',quantity:coins});
 const DB=env.DB;
 const grants=await prepareUnifiedDropGrant(env,{userId:Number(user.id),sourceType:'LEGION_CITADEL',sourceId:id,requestId,rewards},{writePoolLedger:false});
 const tag=crypto.randomUUID();
 const checks=items.map(item=>({sql:legionRewardAvailable(item),values:[item.ref]}));
 if((regional&&items.length)||items.some(i=>i.type==='EQUIPMENT')){
  const r=await readRegionPolicy(env);
  if(r.policy.mode!=='ON')throw jointError('CITADEL_PAUSED','장비 지급이 일시 중지되었습니다. 전리품은 보관됩니다.',423);
  checks.push({sql:'EXISTS(SELECT 1 FROM app_meta WHERE key=? AND value=?)',values:[LEGION_REGIONS_KEY,r.raw]});
 }
 if(!grants.proofs.length)throw jointError('CITADEL_GRANT','전리품 지급을 다시 시도하세요.',503);
 function guards(rows,phase){
  const result=[];
  // D1 accepts 100 bound parameters per statement. An equipment proof uses four.
  for(let i=0;i<rows.length;i+=20){
   const batch=rows.slice(i,i+20),key=tag+':'+phase+':'+i;
   result.push(jointGuard(DB,key,batch.map(v=>'('+v.sql+')').join(' AND '),batch.flatMap(v=>v.values)),jointGuardEnd(DB,key));
  }
  return result;
 }
 return [...guards(checks,'catalog'),...grants.statements,...guards(grants.proofs,'proof')];
}

