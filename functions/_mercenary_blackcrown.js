import {blackcrownSkill,blackcrownProfile,BLACKCROWN_EVENT} from '../shared/mercenary-blackcrown-combat-v1.mjs';
const living=t=>t?.alive!==false&&t?.hp>0&&!t?.untargetable&&!t?.isBattleSuit;
export function blackcrownTargets(actor,skill,targets){
 const approved=blackcrownSkill(actor,skill);if(!approved)return [];
 return [...new Map(targets.filter(t=>living(t)&&t.side!==actor.side).map(t=>[t.id,t])).values()].slice(0,approved.targetCount);
}
export function resolveBlackcrownCast({actor,skill,targets,hit,damage,knockout,emit,damageScale=1,capActions=1}){
 if(!living(actor)||actor.stunned||actor.silenced)return [];
 const approved=blackcrownSkill(actor,skill),fixed=blackcrownTargets(actor,skill,targets);
 if(!approved||!fixed.length)return [];
 const share=1/fixed.length,hits=[];
 for(const target of fixed){
  const result=hit(actor,target,approved.balance.damageRatio*share*damageScale,{rangedSkill:blackcrownProfile(actor).attackStyle==='RANGED',castShare:share,capScale:share*capActions});
  const outcome=result.dodge?{hpDamage:0,absorbed:0}:damage(target,Math.max(0,result.damage));
  actor.damageDealt+=outcome.hpDamage+outcome.absorbed;
  hits.push({targetId:target.id,damage:outcome.hpDamage,absorbed:outcome.absorbed,dodge:!!result.dodge,
   targetHpAfter:target.hp,targetMaxHp:target.maxHp,targetShieldAfter:target.shield||0,targetMaxShield:target.maxShield||0});
 }
 emit(BLACKCROWN_EVENT,{actorId:actor.id,actorKind:'MERCENARY',skillId:approved.id,skillName:approved.name,mechanic:approved.mechanic,
  visualMode:approved.visualMode,targetId:fixed[0].id,targetIds:fixed.map(t=>t.id),battleMode:actor.battleMode,hits,
  damage:hits.reduce((n,h)=>n+h.damage,0),absorbed:hits.reduce((n,h)=>n+h.absorbed,0),label:approved.name});
 for(const target of fixed)knockout(target);return hits;
}
