import {ZERO_COMBAT,isZero,ZERO_AREA_EVENT,ZERO_AREA_MECHANIC,ZERO_AREA_SKILLS} from '../shared/mercenary-zero-v1.mjs';
const living=t=>t?.alive!==false&&t?.hp>0&&!t?.untargetable&&!t?.isBattleSuit;
// All visible swords, reentries and impacts reveal one authoritative damage receipt.
export function resolveZeroArea({actor,skill,targets,hit,damage,knockout,emit,damageScale=1}){
 if(!isZero(actor)||actor.battleMode!=='PVE'||skill.mechanic!==ZERO_AREA_MECHANIC||!ZERO_AREA_SKILLS.some(s=>s.id===skill.id)||!living(actor)||actor.stunned||actor.silenced)return [];
 const fixed=[...new Map(targets.filter(living).map(t=>[t.id,t])).values()];if(!fixed.length)return [];
 const share=1/fixed.length,ratio=skill.balance.damageRatio*share*damageScale,hits=[];
 for(const target of fixed){
  const result=ratio>0?hit(actor,target,ratio,{rangedSkill:false,castShare:share,pveCapScale:ZERO_COMBAT.areaDamageCapScale}):{damage:0,dodge:false};
  const outcome=result.dodge?{hpDamage:0,absorbed:0}:damage(target,Math.max(0,result.damage));
  actor.damageDealt+=outcome.hpDamage+outcome.absorbed;
  hits.push({targetId:target.id,damage:outcome.hpDamage,absorbed:outcome.absorbed,dodge:!!result.dodge,targetHpAfter:target.hp,targetMaxHp:target.maxHp,targetShieldAfter:target.shield||0,targetMaxShield:target.maxShield||0});
 }
 emit(ZERO_AREA_EVENT,{actorId:actor.id,actorKind:'MERCENARY',skillId:skill.id,skillName:skill.name,mechanic:skill.mechanic,targetId:fixed[0].id,targetIds:fixed.map(t=>t.id),battleMode:'PVE',hits,damage:hits.reduce((n,h)=>n+h.damage,0),absorbed:hits.reduce((n,h)=>n+h.absorbed,0),label:skill.name});
 for(const target of fixed)knockout(target);
 return hits;
}
