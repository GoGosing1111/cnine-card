import {BERKAN_IMPACT} from '../shared/mercenary-berkan-v1.mjs';
const living=t=>t?.alive!==false&&t?.hp>0&&!t?.untargetable&&!t?.isBattleSuit;
// Two distinct targets, one paid action and one simultaneous server event.
// Share the raw cast budget; the single-contact cap is tuned against Cryvern's
// two-stage front-line damage, while raw boss damage remains slightly lower.
export function resolveBerkanStarfall({actor,skill,targets,hit,damage,knockout,emit,damageScale=1,capActions=1}){
 const fixed=[...new Map(targets.filter(living).map(t=>[t.id,t])).values()].slice(0,2);
 if(!fixed.length||!living(actor)||actor.stunned||actor.silenced)return [];
 const share=1/fixed.length,ratio=skill.balance.damageRatio*share*damageScale,impacts=[];
 for(const target of fixed){
  // This SSS group cast uses Cryvern's ordinary damage model. Applying the
  // legacy sniper PVE minimum here would almost double its boss damage.
  const result=ratio>0?hit(actor,target,ratio,{rangedSkill:false,castShare:share,capScale:capActions}):{damage:0,dodge:false};
  const outcome=result.dodge?{hpDamage:0,absorbed:0}:damage(target,Math.max(0,result.damage));
  actor.damageDealt+=outcome.hpDamage+outcome.absorbed;
  impacts.push({targetId:target.id,at:BERKAN_IMPACT,damage:outcome.hpDamage,absorbed:outcome.absorbed,dodge:!!result.dodge,
   targetHpAfter:target.hp,targetMaxHp:target.maxHp,targetShieldAfter:target.shield||0,targetMaxShield:target.maxShield||0});
 }
 emit('MERCENARY_STARFALL',{actorId:actor.id,actorKind:'MERCENARY',skillId:skill.id,skillName:skill.name,mechanic:skill.mechanic,
  targetId:fixed[0].id,targetIds:fixed.map(t=>t.id),battleMode:actor.battleMode,impacts,label:skill.name});
 // Knockout/revival follows both simultaneous contacts; no third target/reroll.
 for(const target of fixed)knockout(target);
 return impacts;
}
