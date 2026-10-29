import {isAwakenedOmega,AWAKENED_OMEGA_COMBAT,AWAKENED_OMEGA_SKILLS,AWAKENED_OMEGA_EVENT} from '../shared/mercenary-awakened-omega-v1.mjs';
const living=t=>t?.alive!==false&&t?.hp>0&&!t?.untargetable&&!t?.isBattleSuit;
export function awakenedOmegaTargets(actor,skill,targets){
 const approved=AWAKENED_OMEGA_SKILLS.find(s=>s.id===skill.id&&s.mechanic===skill.mechanic);
 if(!isAwakenedOmega(actor)||!approved||approved.pveOnly&&actor.battleMode!=='PVE')return [];
 const unique=[...new Map(targets.filter(living).map(t=>[t.id,t])).values()];
 if(approved.targetCount===1)unique.sort((a,b)=>(a.row!=='FRONT')-(b.row!=='FRONT')||(a.slot??0)-(b.slot??0)||String(a.id).localeCompare(String(b.id)));
 return unique.slice(0,approved.targetCount??Infinity);
}
export function resolveAwakenedOmegaCast({actor,skill,targets,hit,damage,knockout,emit,damageScale=1,capActions=1}){
 if(!living(actor)||actor.stunned||actor.silenced)return [];
 const fixed=awakenedOmegaTargets(actor,skill,targets);if(!fixed.length)return [];
 const approved=AWAKENED_OMEGA_SKILLS.find(s=>s.id===skill.id),share=1/fixed.length,hits=[];
 // PVE uses the server-grown skill; PVP sword forms consume one ordinary hit budget.
 const ratio=actor.battleMode==='PVP'?AWAKENED_OMEGA_COMBAT.pvpSkillDamageRatio:skill.balance?.damageRatio;
 if(!Number.isFinite(ratio)||ratio<0||ratio>10000)return [];
 for(const target of fixed){
  const result=hit(actor,target,ratio*share*damageScale,{castShare:share,capScale:share*capActions,rangedSkill:false});
  const outcome=result.dodge?{hpDamage:0,absorbed:0}:damage(target,Math.max(0,result.damage));
  actor.damageDealt+=outcome.hpDamage+outcome.absorbed;
  hits.push({targetId:target.id,damage:outcome.hpDamage,absorbed:outcome.absorbed,dodge:!!result.dodge,targetHpAfter:target.hp,targetMaxHp:target.maxHp,targetShieldAfter:target.shield||0,targetMaxShield:target.maxShield||0});
 }
 emit(AWAKENED_OMEGA_EVENT,{actorId:actor.id,actorKind:'MERCENARY',skillId:approved.id,skillName:approved.name,mechanic:approved.mechanic,visualMode:approved.visualMode,targetId:fixed[0].id,targetIds:fixed.map(t=>t.id),battleMode:actor.battleMode,hits,label:approved.name});
 for(const target of fixed)knockout(target);return hits;
}
