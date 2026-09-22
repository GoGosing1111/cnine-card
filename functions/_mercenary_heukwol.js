import {HEUKWOL_IMPACTS,HEUKWOL_SHARES} from '../shared/mercenary-heukwol-v1.mjs';
const living=t=>t?.alive!==false&&t?.hp>0&&!t?.untargetable&&!t?.isBattleSuit;
export function resolveHeukwolCombo({actor,skill,target,hit,damage,knockout,emit,damageScale=1,capActions=1}){
 const impacts=[];
 for(let phase=0;phase<3;phase++){
  if(!living(actor)||actor.stunned||actor.silenced||!living(target))break;
  const share=HEUKWOL_SHARES[phase];
  const result=hit(actor,target,skill.balance.damageRatio*share*damageScale,{rangedSkill:false,castShare:share,capScale:capActions*share});
  const outcome=result.dodge?{hpDamage:0,absorbed:0}:damage(target,Math.max(0,result.damage));
  actor.damageDealt+=outcome.hpDamage+outcome.absorbed;
  impacts.push({targetId:target.id,phaseIndex:phase,at:HEUKWOL_IMPACTS[phase],damage:outcome.hpDamage,absorbed:outcome.absorbed,dodge:!!result.dodge,targetHpAfter:target.hp,targetMaxHp:target.maxHp,targetShieldAfter:target.shield||0,targetMaxShield:target.maxShield||0});
 }
 if(impacts.length){
  emit('MERCENARY_COMBO',{actorId:actor.id,actorKind:'MERCENARY',skillId:skill.id,skillName:skill.name,mechanic:skill.mechanic,targetId:target.id,battleMode:actor.battleMode,impacts,label:skill.name});
  // Revive/KO happens after the action: a revived target cannot receive leftover hits.
  knockout(target);
 }
 return impacts;
}
