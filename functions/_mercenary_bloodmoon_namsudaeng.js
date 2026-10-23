import {isBloodmoonNamsudaeng,NAMSUDAENG_SKILLS,NAMSUDAENG_EVENT} from '../shared/mercenary-bloodmoon-namsudaeng-v1.mjs';
const living=t=>t?.alive!==false&&t?.hp>0&&!t?.untargetable&&!t?.isBattleSuit;
export function namsudaengTargets(actor,skill,targets){
 const approved=NAMSUDAENG_SKILLS.find(s=>s.id===skill.id&&s.mechanic===skill.mechanic);
 if(!isBloodmoonNamsudaeng(actor)||!approved)return [];
 return [...new Map(targets.filter(living).map(t=>[t.id,t])).values()].slice(0,approved.targetCount??Infinity);
}
// Each receipt owns one HP/shield mutation per target. All arrows are visual.
export function resolveNamsudaengCast({actor,skill,targets,hit,damage,knockout,emit,damageScale=1,capActions=1}){
 if(!living(actor)||actor.stunned||actor.silenced)return [];
 const fixed=namsudaengTargets(actor,skill,targets);if(!fixed.length)return [];
 const approved=NAMSUDAENG_SKILLS.find(s=>s.id===skill.id),share=1/fixed.length,hits=[];
 for(const target of fixed){
  const result=hit(actor,target,skill.balance.damageRatio*share*damageScale,{rangedSkill:actor.battleMode==='PVE',castShare:share,capScale:share*capActions});
  const outcome=result.dodge?{hpDamage:0,absorbed:0}:damage(target,Math.max(0,result.damage));
  actor.damageDealt+=outcome.hpDamage+outcome.absorbed;
  hits.push({targetId:target.id,damage:outcome.hpDamage,absorbed:outcome.absorbed,dodge:!!result.dodge,
   targetHpAfter:target.hp,targetMaxHp:target.maxHp,targetShieldAfter:target.shield||0,targetMaxShield:target.maxShield||0});
 }
 emit(NAMSUDAENG_EVENT,{actorId:actor.id,actorKind:'MERCENARY',skillId:approved.id,skillName:approved.name,
  mechanic:approved.mechanic,visualMode:approved.visualMode,targetId:fixed[0].id,targetIds:fixed.map(t=>t.id),
  battleMode:actor.battleMode,hits,damage:hits.reduce((n,h)=>n+h.damage,0),absorbed:hits.reduce((n,h)=>n+h.absorbed,0),label:approved.name});
 for(const target of fixed)knockout(target);return hits;
}
