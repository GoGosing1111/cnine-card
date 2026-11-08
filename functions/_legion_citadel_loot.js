import {prepareUnifiedDropGrant} from './_drop_pool.js';
import {jointGuard,jointGuardEnd} from './_joint_atomic.js';
import {readRegionPolicy,regionAccess} from './_legion_regions.js';
import {REGION_EQUIPMENT,LEGION_REGIONS_KEY} from '../shared/legion-regions-v1.mjs';
import {jointError} from './_joint_request.js';
export const SUPPLIES={EQUIPMENT_POLISH_STONE:5,VEHICLE_PART_ENGINE:1,VEHICLE_PART_FRAME:2,VEHICLE_PART_TIRE:3};
const shuffle=(rows,random)=>{const list=[...rows];for(let i=list.length-1;i>0;i--){const j=Math.floor(random()*(i+1));[list[i],list[j]]=[list[j],list[i]];}return list;};
const sample=()=>crypto.getRandomValues(new Uint32Array(1))[0]/4294967296;
// Opposite players draw from disjoint portions for the entire run, including the boss.
export function distributeCitadelLoot(supply,gear,chance,random=sample){
 if(supply.length<2)throw jointError('CITADEL_LOOT','지급 가능한 성채 전리품을 준비하고 있습니다.',503);
 const split=rows=>{const r=shuffle(rows,random);return [r.filter((_,i)=>i%2===0),r.filter((_,i)=>i%2===1)];};
 const goods=split(supply),armory=split(gear);
 return goods.map((own,seat)=>({goods:own,armory:armory[seat],chance}));
}
export function personalFarm(pool,kills,magnet=false,random=sample){
 const items=[...pool.goods,...pool.armory],events=[];let last=-10000;
 for(const [at,kind] of kills){
  if(kind!==2&&(at-last<2400||random()>(kind===1?.38:.065)))continue;
  const group=kind===2&&pool.armory.length&&random()*100<pool.chance?pool.armory:pool.goods;
  const item=group[Math.floor(random()*group.length)];const used=new Set(events.slice(-6).filter(e=>e[0]+12000>at).map(e=>e[3]));const free=[0,1,2,3,4,5].filter(i=>!used.has(i));if(!free.length)continue;const pos=free[Math.floor(random()*free.length)];
  events.push([at,items.indexOf(item),item.type==='EQUIPMENT'?1:(SUPPLIES[item.ref]||1)*(kind===2?3:1),pos,crypto.randomUUID().slice(0,18)]);last=at;
 }
 return {items,events,magnet,picked:[]};
}
export function farmView(f,elapsed,active){
 const bag=new Map(),ground=[];let picked=0,next=Infinity;
 const marked=new Set(f.picked);
 for(const [at,index,quantity,pos,token] of f.events){
  if(at>elapsed){next=Math.min(next,at);break;}
  const item=f.items[index];if(f.magnet||marked.has(token)){
   const total=bag.get(index)||{...item,quantity:0};total.quantity+=quantity;bag.set(index,total);picked++;
  }else if(active&&elapsed<at+12000){ground.push({token,pos,expires:at+12000,name:item.name,image:item.image,quantity});next=Math.min(next,at+12000);}
 }
 return {drops:[...bag.values()],ground,picked,next:Number.isFinite(next)?next:null,magnet:f.magnet};
}
export async function citadelLoot(env,users){
 const codes=Object.keys(SUPPLIES),[inventory,region]=await Promise.all([env.DB.prepare('SELECT code,name,image_url FROM inventory_items WHERE is_active=1 AND code IN (?,?,?,?) ORDER BY code').bind(...codes).all(),readRegionPolicy(env)]);
 const supply=inventory.results.map(r=>({ref:r.code,type:'INVENTORY_ITEM',name:r.name,image:r.image_url})),allow=users.every(u=>regionAccess(region.policy,u))&&region.policy.mode==='ON';
 const enabled=new Set(region.policy.regions.filter(r=>r.enabled).map(r=>r.id)),sets=REGION_EQUIPMENT.filter(r=>r.kind==='SET'&&enabled.has(r.regionId)).map(r=>r.code);
 const gears=allow&&sets.length?(await env.DB.prepare('SELECT id,name,image_url FROM character_equipment_items WHERE is_active=1 AND is_public=1 AND code IN ('+sets.map(()=>'?').join(',')+') ORDER BY id').bind(...sets).all()).results:[];
 const chance=region.policy.difficulties.find(d=>d.id==='calamity')?.loot?.bossSetPercent||0;
 return distributeCitadelLoot(supply,gears.map(r=>({ref:String(r.id),type:'EQUIPMENT',name:r.name,image:r.image_url})),chance);
}
export async function citadelGrantStatements(env,user,id,items,policyLive){
 if(!items.length||!policyLive)return [];
 const requestId='LEGION_CITADEL:'+id+':'+user.id;
 const DB=env.DB,grants=await prepareUnifiedDropGrant(env,{userId:Number(user.id),sourceType:'LEGION_CITADEL',sourceId:id,requestId,
  rewards:items.map(i=>({rewardType:i.type,rewardRef:i.ref,rewardName:i.name,quantity:i.quantity}))},{writePoolLedger:false});
 const tag=crypto.randomUUID(),checks=items.map(i=>i.type==='EQUIPMENT'?'EXISTS(SELECT 1 FROM character_equipment_items WHERE id=? AND is_active=1 AND is_public=1)':'EXISTS(SELECT 1 FROM inventory_items WHERE code=? AND is_active=1)');
 const args=items.map(i=>i.type==='EQUIPMENT'?Number(i.ref):i.ref);
 if(items.some(i=>i.type==='EQUIPMENT')){const r=await readRegionPolicy(env);if(r.policy.mode!=='ON')throw jointError('CITADEL_PAUSED','장비 지급이 일시 중지되었습니다. 전리품은 보관됩니다.',423);checks.push('EXISTS(SELECT 1 FROM app_meta WHERE key=? AND value=?)');args.push(LEGION_REGIONS_KEY,r.raw);}
 return [jointGuard(DB,tag,checks.join(' AND '),args),...grants.statements,jointGuard(DB,tag+':proof',grants.proofs.map(p=>'('+p.sql+')').join(' AND ')||'1=0',grants.proofs.flatMap(p=>p.values)),jointGuardEnd(DB,tag),jointGuardEnd(DB,tag+':proof')];
}

