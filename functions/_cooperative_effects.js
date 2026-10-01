// Bounded server-authored outcomes; clients never supply damage or targets.
export function cooperativeEffects(cooperative,owners,maxMs){
 const rows=cooperative?.effects??[];
 if(!Array.isArray(rows)||rows.length>6||rows.some(e=>!Number.isSafeInteger(e.atMs)||e.atMs<0||e.atMs>maxMs||
  !['RUPTURE','OVERLOAD','FOCUS'].includes(e.kind)||!Number.isFinite(e.percent)||e.percent<0||e.percent>60||
  (e.kind==='FOCUS'&&!owners.includes(e.ownerId))))throw Error('INVALID_COOPERATIVE_EFFECTS');
 return rows.map(e=>({...e})).sort((a,b)=>a.atMs-b.atMs);
}
export function applyCooperativeEffect(effect,{allies,enemies,damage,knockout,emit}){
 const targets=(effect.kind==='RUPTURE'?enemies:allies).filter(f=>f.alive&&f.hp>0&&!f.untargetable&&(effect.kind!=='FOCUS'||f.ownerId===effect.ownerId));
 const hits=targets.map(target=>{
  const result=damage(target,Math.round(target.maxHp*effect.percent/100),{ignoreShield:effect.kind==='RUPTURE'});
  return {targetId:target.id,damage:result.hpDamage,absorbed:result.absorbed,targetHpAfter:target.hp,targetMaxHp:target.maxHp,targetShieldAfter:target.shield};
 });
 emit('COOP_MECHANIC',{mechanicId:effect.id,kind:effect.kind,label:effect.label,hits});
 for(const target of targets)knockout(target);
}
