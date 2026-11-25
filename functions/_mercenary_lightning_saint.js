import {isLightningSaint,SAINT_EVENT,SAINT_MECHANIC,SAINT_SKILLS,SAINT_PVP_RATIO} from '../shared/mercenary-lightning-saint-v1.mjs';

const eligible=t=>t&&t.alive!==false&&t.hp>0&&!t.untargetable&&!t.isBattleSuit&&t.actorKind!=='BATTLE_SUIT';
export function resolveLightningSaint({actor,skill,targets,hit,damage,intercept,knockout,emit,damageScale=1}){
  const def=SAINT_SKILLS.find(s=>s.id===skill?.id);
  if(!def||skill?.mechanic!==SAINT_MECHANIC||!isLightningSaint(actor)||!eligible(actor)||actor.stunned||actor.silenced||
     !['PVE','PVP'].includes(actor.battleMode))return [];
  const budget=skill.balance?.damageRatio;
  if(!Number.isFinite(budget)||budget<0||budget>10000||!Number.isFinite(damageScale)||damageScale<0)return [];
  const enemies=[...new Map(targets.filter(t=>eligible(t)&&t.side!==actor.side).map(t=>[t.id,t])).values()];
  const selected=def.targetRule==='all'?enemies:enemies.slice(0,1);
  if(!selected.length)return [];
  const count=def.contactsMs.length,pvp=actor.battleMode==='PVP',share=1/(selected.length*count);
  const ratio=budget*damageScale*share*(pvp?SAINT_PVP_RATIO:1);
  const totals=new Map(),beats=[];
  for(const atMs of def.contactsMs){
    if(!eligible(actor))break;
    const hits=[];
    for(const target of selected){
      if(!eligible(target))continue;
      const roll=ratio>0?hit(actor,target,ratio,{rangedSkill:false,castShare:share,
        pveCapScale:share*(def.balance.damageRatio/18),capScale:share*2*damageScale}):{damage:0,dodge:false};
      let amount=roll.dodge?0:Math.max(0,roll.damage);
      if(amount&&def.targetRule==='single'&&intercept)amount=intercept(actor,target,amount);
      const receipt=amount?damage(target,amount):{hpDamage:0,absorbed:0};
      const row={targetId:target.id,damage:receipt.hpDamage,absorbed:receipt.absorbed,dodge:!!roll.dodge,
        targetHpAfter:target.hp,targetMaxHp:target.maxHp,targetShieldAfter:target.shield||0,targetMaxShield:target.maxShield||0};
      const prior=totals.get(target.id);
      totals.set(target.id,prior?{...row,damage:prior.damage+row.damage,absorbed:prior.absorbed+row.absorbed,dodge:prior.dodge&&row.dodge}:row);
      actor.damageDealt+=row.damage+row.absorbed;hits.push(row);
    }
    if(!hits.length)break;
    beats.push({atMs,hits});
  }
  if(!beats.length)return [];
  const hits=[...totals.values()];
  emit(SAINT_EVENT,{actorId:actor.id,actorKind:'MERCENARY',battleMode:actor.battleMode,skillId:def.id,skillName:def.name,
    visualMode:def.key,mechanic:SAINT_MECHANIC,targetId:selected[0].id,targetIds:hits.map(h=>h.targetId),
    hits,beats,damage:hits.reduce((sum,h)=>sum+h.damage,0),absorbed:hits.reduce((sum,h)=>sum+h.absorbed,0),label:def.name});
  for(const target of selected)if(target.hp<=0)knockout(target);
  return beats;
}
