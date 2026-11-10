import {CITADEL_ITEM_MULTIPLIER} from './_legion_citadel_tiers.js';
import {POLISH_ITEM_CODE} from '../shared/equipment-polish-v1.mjs';

export function calamityMaterialCodes(regions){
 const codes=new Set(regions.flatMap(r=>(r.fieldDrops?.items||[]).filter(v=>v.type==='INVENTORY_ITEM').map(v=>v.ref)));
 if(regions.length)codes.add(POLISH_ITEM_CODE);
 return codes;
}

// Compile when the room departs. Each roll is per player and per confirmed kill.
// Map-specific gear retains the chance in its own map. Common field rows occur
// only once, using the best available individual rate if the source maps differ.
export function calamityPartyDrops(regions,loot,ascendant,gear,stone,soloPercent,itemMultiplier=CITADEL_ITEM_MULTIPLIER){
 const groups=[[],[],[]],fields=[new Map(),new Map(),new Map()];
 const entry=(item,chance,min=1,max=min)=>({item,percent:Math.min(100,chance*itemMultiplier),min,max});
 function uniform(kind,items,base){
  if(!items.length||!base)return;
  const share=soloPercent(base)/items.length;
  groups[kind].push(items.map(item=>entry(item,share)));
 }
 for(const {tier,expectedRuns} of [...ascendant].reverse()){
  uniform(2,gear.filter(g=>g.kind==='ASCENDANT'&&g.tier===tier),100/expectedRuns);
 }
 for(const region of regions){
  const local=gear.filter(g=>g.regionId===region.id);
  const sets=local.filter(g=>g.kind==='SET');
  uniform(2,local.filter(g=>g.kind==='UNIQUE'),loot.bossUniquePercent);
  uniform(1,sets,loot.eliteSetPercent);
  uniform(2,sets,loot.bossSetPercent);
  const field=region.fieldDrops,level=field?.difficulties.find(d=>d.id==='calamity');
  if(!level)continue;
  const enabled=field.items.filter(v=>v.enabled&&v.weight>0);
  const total=enabled.reduce((sum,v)=>sum+Math.round(v.weight*1000),0);
  for(const [kind,base] of [level.dropPercent,level.dropPercent,level.bossDropPercent].entries()){
   if(!base)continue;
   const pct=soloPercent(base);
   for(const item of enabled){
    const chance=pct*Math.round(item.weight*1000)/total,old=fields[kind].get(item.code);
    if(!old||chance>old.chance)fields[kind].set(item.code,{item,chance});
   }
  }
 }
 for(const [kind,field] of fields.entries()){
  if(field.size)groups[kind].push(Array.from(field.values(),({item,chance})=>entry(item,chance,item.minQuantity,item.maxQuantity)));
 }
 uniform(0,[stone],loot.stonePercent);uniform(1,[stone],loot.eliteStonePercent);
 return {groups,guarantee:{item:stone,quantity:loot.bossStones}};
}
