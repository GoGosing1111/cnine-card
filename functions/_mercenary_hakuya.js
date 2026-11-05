import {HAKUYA_COMBAT,isHakuya,HAKUYA_AREA_EVENT,HAKUYA_AREA_MECHANIC,HAKUYA_AREA_SKILL,HAKUYA_AREA_FORMS} from '../shared/mercenary-hakuya-v1.mjs';
const living=t=>t?.alive!==false&&t?.hp>0&&!t?.untargetable&&!t?.isBattleSuit;
export function resolveHakuyaArea({actor,skill,targets,hit,damage,knockout,emit,damageScale=1}){
 if(!isHakuya(actor)||actor.battleMode!=='PVE'||skill?.id!==HAKUYA_AREA_SKILL.id||skill.mechanic!==HAKUYA_AREA_MECHANIC||!living(actor)||actor.stunned||actor.silenced)return [];
 const fixed=[...new Map(targets.filter(living).map(t=>[t.id,t])).values()];if(!fixed.length)return [];
 const share=1/fixed.length,ratio=skill.balance.damageRatio*share*damageScale,hits=[];
 for(const target of fixed){
  const result=ratio>0?hit(actor,target,ratio,{rangedSkill:false,castShare:share,pveCapScale:HAKUYA_COMBAT.areaDamageCapScale}):{damage:0,dodge:false};
  const outcome=result.dodge?{hpDamage:0,absorbed:0}:damage(target,Math.max(0,result.damage));
  actor.damageDealt+=outcome.hpDamage+outcome.absorbed;
  hits.push({targetId:target.id,damage:outcome.hpDamage,absorbed:outcome.absorbed,dodge:!!result.dodge,targetHpAfter:target.hp,targetMaxHp:target.maxHp,targetShieldAfter:target.shield||0,targetMaxShield:target.maxShield||0});
 }
 const variant=HAKUYA_AREA_FORMS[(actor.hakuyaAreaCastCount||0)%HAKUYA_AREA_FORMS.length];actor.hakuyaAreaCastCount=(actor.hakuyaAreaCastCount||0)+1;
 emit(HAKUYA_AREA_EVENT,{actorId:actor.id,actorKind:'MERCENARY',skillId:skill.id,skillName:variant.name,presentationSkillId:variant.id,mechanic:skill.mechanic,visualMode:variant.visualMode,targetId:fixed[0].id,targetIds:fixed.map(t=>t.id),battleMode:'PVE',hits,damage:hits.reduce((n,h)=>n+h.damage,0),absorbed:hits.reduce((n,h)=>n+h.absorbed,0),label:variant.name});
 for(const target of fixed)knockout(target);
 return hits;
}
