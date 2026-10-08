import {isValter,VALTER_AREA_EVENT,VALTER_AREA_MECHANIC} from '../shared/mercenary-valter-v1.mjs';
const living=t=>t?.alive!==false&&t?.hp>0&&!t?.untargetable&&!t?.isBattleSuit;

// One paid PVE action, one shared damage budget, one receipt per distinct foe.
// The V17 visual contacts never make extra server rolls or damage applications.
export function resolveValterArea({actor,skill,targets,hit,damage,knockout,emit,damageScale=1}){
 if(!isValter(actor)||actor.battleMode!=='PVE'||skill.mechanic!==VALTER_AREA_MECHANIC||!living(actor)||actor.stunned||actor.silenced)return [];
 const fixed=[...new Map(targets.filter(living).map(t=>[t.id,t])).values()];if(!fixed.length)return [];
 const share=1/fixed.length,ratio=skill.balance.damageRatio*share*damageScale,hits=[];
 for(const target of fixed){
  const result=ratio>0?hit(actor,target,ratio,{rangedSkill:false,castShare:share}):{damage:0,dodge:false};
  const outcome=result.dodge?{hpDamage:0,absorbed:0}:damage(target,Math.max(0,result.damage));
  actor.damageDealt+=outcome.hpDamage+outcome.absorbed;
  hits.push({targetId:target.id,damage:outcome.hpDamage,absorbed:outcome.absorbed,dodge:!!result.dodge,
   targetHpAfter:target.hp,targetMaxHp:target.maxHp,targetShieldAfter:target.shield||0,targetMaxShield:target.maxShield||0});
 }
 emit(VALTER_AREA_EVENT,{actorId:actor.id,actorKind:'MERCENARY',skillId:skill.id,skillName:skill.name,mechanic:skill.mechanic,
  targetId:fixed[0].id,targetIds:fixed.map(t=>t.id),battleMode:'PVE',hits,
  damage:hits.reduce((n,h)=>n+h.damage,0),absorbed:hits.reduce((n,h)=>n+h.absorbed,0),label:skill.name});
 // Finish simultaneous contacts before any knockout/revival or reinforcement.
 for(const target of fixed)knockout(target);
 return hits;
}
