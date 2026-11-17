// Preview combat restarts the enemy at full HP. Only the raid's capped damage
// and persistent HP may reach playback, including each nested skill/combo hit.
export function lichBossDamageEvent(event,{damage=event.damage,hp=event.targetHpAfter,maxHp=event.targetMaxHp}={}){
 const result={...event,damage,absorbed:0,targetHpAfter:hp,targetMaxHp:maxHp,targetShieldAfter:0};
 for(const key of ['hits','targets']){
  if(!Array.isArray(event[key]))continue;
  const isBoss=hit=>!hit.targetId||hit.targetId===event.targetId;
  const hits=event[key].filter(isBoss),total=hits.reduce((n,h)=>n+Math.max(0,Number(h.damage)||0),0);
  let accumulated=0,applied=0,index=0;
  result[key]=event[key].map(hit=>{
   if(!isBoss(hit))return hit;
   accumulated+=Math.max(0,Number(hit.damage)||0);index++;
   const next=index===hits.length?damage:Math.round(damage*(total?accumulated/total:index/hits.length));
   const part=next-applied;applied=next;
   return {...hit,damage:part,absorbed:0,targetHpAfter:hp+damage-applied,targetMaxHp:maxHp,targetShieldAfter:0};
  });
 }
 return result;
}

// Late cosmetic impacts can overlap subsequent attacks or a server snapshot.
// Isgen never heals: prevent a stale impact from reviving or prematurely killing
// this boss. The binding belongs to one raid mount and is removed on teardown.
export function bindLichBossHealth(engine,bossId,getState){
 const original=engine.syncTargetHp;
 function sync(target,value){
  const state=getState();
  if(target?.id===bossId&&state&&Number.isFinite(Number(value))){
   const floor=Math.max(0,state.bossHp)/Math.max(1,state.bossMaxHp)*100;
   value=Math.max(floor,Math.min(Number(target.hp),Number(value)));
  }
  return original.call(this,target,value);
 }
 engine.syncTargetHp=sync;
 return ()=>{if(engine.syncTargetHp===sync)engine.syncTargetHp=original;};
}
