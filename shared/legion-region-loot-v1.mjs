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
  // Each released tier has an independent boss roll and one uniformly selected piece.
  // Old expedition snapshots have no ascendantDrops and retain their original rewards.
  if(event.boss)for(const drop of policy.ascendantDrops||[]){
    const pieces=items.filter(row=>row.kind==='ASCENDANT'&&row.equipmentTier===drop.tier);
    if(pieces.length===5&&roll(drop.bossPercent))result.push({...pieces[Math.min(pieces.length-1,Math.floor(random()*pieces.length))],quantity:1});
  }
  // Independent editable field pool; the regional set/unique rolls stay intact.
  const field=policy.fieldDrops,rows=(field?.items||[]).filter(row=>row.enabled&&row.weight>0),total=rows.reduce((sum,row)=>sum+Math.round(row.weight*1000),0);
  if(total&&random()<(event.boss?field.bossDropChance:field.dropChance)){
    let pick=random()*total,item=rows.at(-1);
    for(const row of rows){pick-=Math.round(row.weight*1000);if(pick<0){item=row;break;}}
    const min=item.minQuantity,max=item.maxQuantity;
    result.push({...item,quantity:min+Math.floor(random()*(max-min+1))});
  }
  return result.sort((a,b)=>Number(b.kind==='UNIQUE')-Number(a.kind==='UNIQUE'));
}
export function regionBossGuarantee(policy){
  const item=policy.items?.find(row=>row.kind==='STONE');
  return item&&policy.regionLoot?{...item,quantity:policy.regionLoot.bossStones}:null;
}
