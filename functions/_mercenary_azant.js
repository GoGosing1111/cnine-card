import {AZANT_CODE,AZANT_VOLLEY_MECHANIC,AZANT_AREA_MECHANIC,AZANT_VOLLEY_EVENT,AZANT_AREA_EVENT} from '../shared/mercenary-azant-v1.mjs';
const living=t=>t?.alive!==false&&t?.hp>0&&!t?.untargetable&&!t?.isBattleSuit;

// Server receipts own damage. Six visual projectiles and the formation-wide
// crystal fall share one cast budget, with one hit roll per distinct target.
export function resolveAzantCast({actor,skill,targets,hit,damage,knockout,emit,damageScale=1,capActions=1}){
 const area=skill.mechanic===AZANT_AREA_MECHANIC,volley=skill.mechanic===AZANT_VOLLEY_MECHANIC;
 if(actor?.code!==AZANT_CODE||!living(actor)||actor.stunned||actor.silenced||(!area&&!volley)||actor.battleMode!==(area?'PVE':'PVP'))return [];
 const fixed=[...new Map(targets.filter(living).map(t=>[t.id,t])).values()].slice(0,area?Infinity:2);if(!fixed.length)return [];
 const share=1/fixed.length,ratio=skill.balance.damageRatio*share*damageScale,hits=[];
 for(const target of fixed){
  const result=ratio>0?hit(actor,target,ratio,{rangedSkill:false,castShare:share,capScale:capActions,varyDamageCap:volley}):{damage:0,dodge:false};
  const outcome=result.dodge?{hpDamage:0,absorbed:0}:damage(target,Math.max(0,result.damage));
  actor.damageDealt+=outcome.hpDamage+outcome.absorbed;
  hits.push({targetId:target.id,damage:outcome.hpDamage,absorbed:outcome.absorbed,dodge:!!result.dodge,targetHpAfter:target.hp,targetMaxHp:target.maxHp,targetShieldAfter:target.shield||0,targetMaxShield:target.maxShield||0});
 }
 emit(area?AZANT_AREA_EVENT:AZANT_VOLLEY_EVENT,{actorId:actor.id,actorKind:'MERCENARY',skillId:skill.id,skillName:skill.name,mechanic:skill.mechanic,targetId:fixed[0].id,targetIds:fixed.map(t=>t.id),battleMode:actor.battleMode,hits,damage:hits.reduce((n,h)=>n+h.damage,0),absorbed:hits.reduce((n,h)=>n+h.absorbed,0),label:skill.name});
 for(const target of fixed)knockout(target);
 return hits;
}
