import {MANGISA_IMPACTS,MANGISA_PRIMARY_SHARES,MANGISA_SPLASH_SHARE,MANGISA_PVP_SCALE} from '../shared/mercenary-mangisa-v1.mjs';
const living=t=>t?.alive!==false&&t?.hp>0&&!t?.untargetable&&!t?.isBattleSuit;
// One atomic actor action. Eight bounded outcomes at most; no client RNG,
// retarget, per-hit resource gain, recursive proc or repeated full damage cap.
export function resolveMangisaVolley({actor,skill,targets,hit,damage,knockout,emit,damageScale=1,capActions=1}){
 const [primary,...nearby]=targets,pvpScale=actor.battleMode==='PVP'&&actor.rank==='SS'?MANGISA_PVP_SCALE:1;
 const impacts=[],touched=new Set();
 const strike=(target,share,shotIndex,kind)=>{
  if(!living(target))return;
  const result=hit(actor,target,skill.balance.damageRatio*share*pvpScale*damageScale,{rangedSkill:true,castShare:share*pvpScale,capScale:capActions*share*pvpScale});
  const outcome=result.dodge?{hpDamage:0,absorbed:0}:damage(target,Math.max(0,result.damage));
  actor.damageDealt+=outcome.hpDamage+outcome.absorbed;touched.add(target);
  impacts.push({targetId:target.id,shotIndex,kind,at:MANGISA_IMPACTS[shotIndex],damage:outcome.hpDamage,absorbed:outcome.absorbed,dodge:!!result.dodge,targetHpAfter:target.hp,targetMaxHp:target.maxHp,targetShieldAfter:target.shield||0,targetMaxShield:target.maxShield||0});
 };
 // v2119: 주 대상이 먼저 쓰러져도 남은 탄을 버리지 않고 다음 적으로 옮겨 쏜다.
 // 사격이 중간에 멈추면 그 행동이 통째로 사라져 용병이 손을 놓은 것처럼 보인다.
 let focus=primary;
 for(let i=0;i<6;i++){
  if(!living(actor)||actor.stunned||actor.silenced)break;
  if(!living(focus))focus=[primary,...nearby].find(living)||null;
  if(!focus)break;
  strike(focus,MANGISA_PRIMARY_SHARES[i],i,'PRIMARY');
  if(i===5)for(const target of nearby.filter(t=>t!==focus).slice(0,2))strike(target,MANGISA_SPLASH_SHARE,i,'SPLASH');
 }
 if(impacts.length)emit('MERCENARY_VOLLEY',{actorId:actor.id,actorKind:'MERCENARY',skillId:skill.id,skillName:skill.name,mechanic:skill.mechanic,targetId:primary.id,targetIds:targets.map(t=>t.id),battleMode:actor.battleMode,impacts,label:skill.name});
 // Death/revival records follow the atomic skill record, so the renderer first
 // shows the actual lethal contact. A revived target never receives spare shots.
 for(const target of touched)knockout(target);
 return impacts;
}
