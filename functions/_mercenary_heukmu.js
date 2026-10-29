import {HEUKMU_COMBAT,isHeukmu,HEUKMU_AREA_EVENT,HEUKMU_AREA_MECHANIC,HEUKMU_AREA_SKILLS} from '../shared/mercenary-heukmu-v1.mjs';
const living=t=>t?.alive!==false&&t?.hp>0&&!t?.untargetable&&!t?.isBattleSuit;

// Sword strikes and sword-energy flurries reveal one server-owned damage budget.
export function resolveHeukmuArea({actor,skill,targets,hit,damage,knockout,emit,damageScale=1}){
 const canonical=HEUKMU_AREA_SKILLS.find(s=>s.id===skill?.id);
 if(!isHeukmu(actor)||actor.battleMode!=='PVE'||skill?.mechanic!==HEUKMU_AREA_MECHANIC||!canonical||!Number.isFinite(skill.balance?.damageRatio)||skill.balance.damageRatio<0||skill.balance.damageRatio>10000||!living(actor)||actor.stunned||actor.silenced)return [];
 const fixed=[...new Map(targets.filter(t=>living(t)&&t.id!==actor.id&&t.side!==actor.side).map(t=>[t.id,t])).values()];if(!fixed.length)return [];
 // The server has already applied this owner's growth to the canonical skill.
 const share=1/fixed.length,ratio=skill.balance.damageRatio*share*Math.max(0,Number.isFinite(damageScale)?damageScale:0),hits=[];
 for(const target of fixed){
  const result=ratio>0?hit(actor,target,ratio,{rangedSkill:false,castShare:share,pveCapScale:HEUKMU_COMBAT.areaDamageCapScale}):{damage:0,dodge:false};
  const outcome=result.dodge?{hpDamage:0,absorbed:0}:damage(target,Math.max(0,result.damage));
  actor.damageDealt+=outcome.hpDamage+outcome.absorbed;
  hits.push({targetId:target.id,damage:outcome.hpDamage,absorbed:outcome.absorbed,dodge:!!result.dodge,targetHpAfter:target.hp,targetMaxHp:target.maxHp,targetShieldAfter:target.shield||0,targetMaxShield:target.maxShield||0});
 }
 emit(HEUKMU_AREA_EVENT,{actorId:actor.id,actorKind:'MERCENARY',skillId:canonical.id,skillName:canonical.name,mechanic:HEUKMU_AREA_MECHANIC,targetId:fixed[0].id,targetIds:fixed.map(t=>t.id),battleMode:'PVE',hits,damage:hits.reduce((n,h)=>n+h.damage,0),absorbed:hits.reduce((n,h)=>n+h.absorbed,0),label:canonical.name});
 for(const target of fixed)knockout(target);return hits;
}
