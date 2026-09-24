import {CRYVERN_IMPACTS,CRYVERN_SHARES} from '../shared/mercenary-cryvern-v1.mjs';
const living=t=>t?.alive!==false&&t?.hp>0&&!t?.untargetable&&!t?.isBattleSuit;
// One canonical server action, RNG and damage path. Animation cannot grant hits.
export function resolveCryvernCrown({actor,skill,targets,hit,damage,knockout,emit,damageScale=1,capActions=1}){
 const fixed=[...new Set(targets)].slice(0,2),marked=new Set(),touched=new Set(),impacts=[];
 for(let phase=0;phase<2;phase++)for(const original of fixed){
  if(!living(actor)||actor.stunned||actor.silenced)break;
  let target=original;
  if(phase===1)target=marked.has(original)?(living(original)?original:fixed.find(t=>living(t)&&marked.has(t))):null;
  if(!living(target))continue;
  const share=CRYVERN_SHARES[phase]/fixed.length;
  const ratio=skill.balance.damageRatio*share*damageScale;
  // Canonical hitResult has a basic-hit default for multiplier=0. A zero CMS
  // ratio / 100% suppression must remain exactly zero, never that default.
  const result=ratio>0?hit(actor,target,ratio,
   {rangedSkill:false,castShare:share,capScale:capActions*CRYVERN_SHARES[phase]}):{damage:0,dodge:false};
  const outcome=result.dodge?{hpDamage:0,absorbed:0}:damage(target,Math.max(0,result.damage));
  actor.damageDealt+=outcome.hpDamage+outcome.absorbed;touched.add(target);
  if(phase===0&&!result.dodge)marked.add(target);
  impacts.push({targetId:target.id,phaseIndex:phase,at:CRYVERN_IMPACTS[phase],damage:outcome.hpDamage,
   absorbed:outcome.absorbed,dodge:!!result.dodge,targetHpAfter:target.hp,targetMaxHp:target.maxHp,
   targetShieldAfter:target.shield||0,targetMaxShield:target.maxShield||0});
 }
 if(impacts.length)emit('MERCENARY_CRYSTAL_CROWN',{actorId:actor.id,actorKind:'MERCENARY',
  skillId:skill.id,skillName:skill.name,mechanic:skill.mechanic,targetId:fixed.find(Boolean)?.id,
  targetIds:fixed.filter(Boolean).map(t=>t.id),battleMode:actor.battleMode,impacts,label:skill.name});
 // Revival is after the complete action, never a new target for remaining hits.
 for(const target of touched)knockout(target);
 return impacts;
}
