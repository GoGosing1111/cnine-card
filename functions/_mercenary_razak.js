import {isRazak,RAZAK_SKILLS,RAZAK_EVENT} from '../shared/mercenary-razak-v1.mjs';
import {BLUE_GEAR_EVENT,BLUE_GEAR_MECHANIC,blueGearProfile,blueGearSkills,isBlueGear} from '../shared/mercenary-blue-gear-v1.mjs';
function approvedStrike(actor,skill){
 const trusted=isRazak(actor)?RAZAK_SKILLS:isBlueGear(actor)?blueGearSkills(blueGearProfile(actor.code||actor.cardId),actor.battleMode):[];
 return trusted.find(s=>s.id===skill.id&&s.mechanic===skill.mechanic&&(!s.pveOnly||actor.battleMode==='PVE'));
}
const living=t=>t?.alive!==false&&t?.hp>0&&!t?.untargetable&&!t?.isBattleSuit;
export function razakTargets(actor,skill,targets){
 const approved=approvedStrike(actor,skill);
 if(!approved)return [];
 const unique=[...new Map(targets.filter(living).map(t=>[t.id,t])).values()];
 if(approved.visualMode==='cross'||approved.targetRule==='weakest')unique.sort((a,b)=>a.hp/a.maxHp-b.hp/b.maxHp||String(a.id).localeCompare(String(b.id)));
 if(approved.visualMode==='flurry'||approved.targetRule==='back')unique.sort((a,b)=>(a.row==='FRONT')-(b.row==='FRONT')||(b.attack||0)-(a.attack||0)||String(a.id).localeCompare(String(b.id)));
 return unique.slice(0,approved.targetCount??Infinity);
}
export function resolveRazakCast({actor,skill,targets,hit,damage,knockout,emit,damageScale=1,capActions=1}){
 if(!living(actor)||actor.stunned||actor.silenced)return [];
 const fixed=razakTargets(actor,skill,targets);if(!fixed.length)return [];
 const approved=approvedStrike(actor,skill),share=1/fixed.length,hits=[];
 for(const target of fixed){
  const result=hit(actor,target,approved.balance.damageRatio*share*damageScale,{castShare:share,capScale:share*capActions});
  const outcome=result.dodge?{hpDamage:0,absorbed:0}:damage(target,Math.max(0,result.damage));
  actor.damageDealt+=outcome.hpDamage+outcome.absorbed;
  hits.push({targetId:target.id,damage:outcome.hpDamage,absorbed:outcome.absorbed,dodge:!!result.dodge,targetHpAfter:target.hp,targetMaxHp:target.maxHp,targetShieldAfter:target.shield||0,targetMaxShield:target.maxShield||0});
 }
 emit(approved.mechanic===BLUE_GEAR_MECHANIC?BLUE_GEAR_EVENT:RAZAK_EVENT,{actorId:actor.id,actorKind:'MERCENARY',skillId:approved.id,skillName:approved.name,mechanic:approved.mechanic,visualMode:approved.visualMode,targetId:fixed[0].id,targetIds:fixed.map(t=>t.id),battleMode:actor.battleMode,hits,label:approved.name});
 for(const target of fixed)knockout(target);return hits;
}
