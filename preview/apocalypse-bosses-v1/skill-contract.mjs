// Pure server-side draft rules. Preview fixtures are authored with this module.
// Production simulation, routes, CMS and balances are intentionally not connected.
const finite=(v,name)=>{if(!Number.isFinite(v)||v<0)throw Error('INVALID_'+name);return v;};
export const canUseSkill=target=>!(target.statuses?.seal?.remaining>0);
export const resolveHealing=(target,requested)=>target.hp>0&&!(target.statuses?.curse?.remaining>0)?Math.min(Math.floor(finite(requested,'HEAL')),Math.max(0,target.maxHp-target.hp)):0;
export function finishAction(target){
 for(const kind of ['seal','curse']){const status=target.statuses?.[kind];if(status&&--status.remaining<=0)delete target.statuses[kind];}
}
export function cleanse(target){const cleared=Object.keys(target.statuses||{});target.statuses={};return cleared;}
export function selectTargets(skill,targets){
 const living=targets.filter(t=>t.hp>0&&t.alive!==false);
 return skill.targetCount==='ALL'?living:[...living].sort((a,b)=>b.attack-a.attack||String(a.id).localeCompare(String(b.id))).slice(0,skill.targetCount);
}
export function castDraftSkill(skill,actor,targets){
 finite(actor.attack,'ATTACK');
 if(!(actor.hp>0)||actor.alive===false)return [];
 return selectTargets(skill,targets).map(target=>{
  if(skill.kind!=='ultimate'){
   if(!['seal','curse'].includes(skill.kind))throw Error('INVALID_STATUS');
   target.statuses??={};target.statuses[skill.kind]={remaining:skill.statusActions,sourceId:actor.id,skillCode:skill.code};
   return {type:'APOCALYPSE_DRAFT_STATUS',actorId:actor.id,targetId:target.id,skillCode:skill.code,label:skill.name,status:skill.kind,remainingActions:skill.statusActions,targetHpAfter:target.hp,targetShieldAfter:target.shield||0};
  }
  // Normal armor reduces the non-piercing portion only; no max-HP percentage wipe.
  const gross=Math.max(1,Math.round(actor.attack*skill.attackPercent/100));
  const pierce=Math.round(gross*skill.shieldPiercePercent/100);
  const normal=Math.max(0,gross-pierce-Math.round((target.defense||0)*.35));
  const absorbed=Math.min(Math.max(0,target.shield||0),normal),damage=Math.min(target.hp,pierce+normal-absorbed);
  target.shield=Math.max(0,(target.shield||0)-absorbed);target.hp=Math.max(0,target.hp-damage);target.alive=target.hp>0;
  return {type:'APOCALYPSE_DRAFT_HIT',actorId:actor.id,targetId:target.id,skillCode:skill.code,label:skill.name,damage,absorbed,critical:false,targetHpAfter:target.hp,targetMaxHp:target.maxHp,targetShieldAfter:target.shield};
 });
}
