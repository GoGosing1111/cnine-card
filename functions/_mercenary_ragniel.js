import {RAGNIEL_IMPACTS,RAGNIEL_SHARES} from '../shared/mercenary-ragniel-v1.mjs';
const living=t=>t?.alive!==false&&t?.hp>0&&!t?.untargetable&&!t?.isBattleSuit;
// Both contacts belong to one server action and share one damage-cap budget.
export function resolveRagnielJudgment({actor,skill,targets,hit,damage,knockout,emit,damageScale=1,capActions=1}){
 const fixed=targets.slice(0,2),impacts=[],marked=new Set(),touched=new Set();
 // v2119: 지정 대상이 먼저 쓰러지면 낙하 피해를 버리지 않고 남은 지정 대상에게 옮긴다.
 for(let phase=0;phase<2;phase++)for(let slot=0;slot<fixed.length;slot++){
  let target=fixed[slot];
  // 회피로 표식이 남지 않은 대상은 그대로 낙하 피해가 취소된다. 표식이 남은 채
  // 먼저 쓰러진 대상의 몫만 남은 지정 대상에게 옮긴다(전체 예산은 그대로다).
  if(phase===1)target=marked.has(target)?(living(target)?target:fixed.find(t=>living(t)&&marked.has(t))||null):null;
  if(!living(actor)||actor.stunned||actor.silenced||!living(target))continue;
  const share=RAGNIEL_SHARES[phase]/fixed.length;
  const result=hit(actor,target,skill.balance.damageRatio*share*damageScale,{rangedSkill:false,castShare:share,capScale:capActions*RAGNIEL_SHARES[phase]});
  const outcome=result.dodge?{hpDamage:0,absorbed:0}:damage(target,Math.max(0,result.damage));
  actor.damageDealt+=outcome.hpDamage+outcome.absorbed;touched.add(target);
  if(phase===0&&!result.dodge)marked.add(target);
  impacts.push({targetId:target.id,phaseIndex:phase,at:RAGNIEL_IMPACTS[phase],damage:outcome.hpDamage,absorbed:outcome.absorbed,dodge:!!result.dodge,targetHpAfter:target.hp,targetMaxHp:target.maxHp,targetShieldAfter:target.shield||0,targetMaxShield:target.maxShield||0});
 }
 if(impacts.length)emit('MERCENARY_JUDGMENT',{actorId:actor.id,actorKind:'MERCENARY',skillId:skill.id,skillName:skill.name,mechanic:skill.mechanic,targetId:fixed[0].id,targetIds:fixed.map(t=>t.id),battleMode:actor.battleMode,impacts,label:skill.name});
 // A death/revival is shown after the complete action; no spare strike at a revived target.
 for(const target of touched)knockout(target);return impacts;
}
