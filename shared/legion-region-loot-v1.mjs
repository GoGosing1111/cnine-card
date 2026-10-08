// RNG is injected from the server. The client cannot select a table or outcome.
export function regionKillLoot(policy,event,random){
  const loot=policy.regionLoot,items=policy.items||[],region=policy.regionId;
  if(!loot||!region)return [];
  const result=[],roll=p=>random()*100<p;
  const stone=items.find(row=>row.kind==='STONE');
  if(!event.boss&&stone&&roll(event.elite?loot.eliteStonePercent:loot.stonePercent))result.push({...stone,quantity:1});
  if(event.boss||event.elite){
    const sets=items.filter(row=>row.regionId===region&&row.kind==='SET');
    if(sets.length&&roll(event.boss?loot.bossSetPercent:loot.eliteSetPercent))result.push({...sets[Math.min(sets.length-1,Math.floor(random()*sets.length))],quantity:1});
  }
  if(event.boss){const unique=items.find(row=>row.regionId===region&&row.kind==='UNIQUE');if(unique&&roll(loot.bossUniquePercent))result.push({...unique,quantity:1});}
  return result.sort((a,b)=>Number(b.kind==='UNIQUE')-Number(a.kind==='UNIQUE'));
}
export function regionBossGuarantee(policy){
  const item=policy.items?.find(row=>row.kind==='STONE');
  return item&&policy.regionLoot?{...item,quantity:policy.regionLoot.bossStones}:null;
}
