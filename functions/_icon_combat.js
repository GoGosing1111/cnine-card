import {iconDefinition,iconHealingAmount} from '../shared/icon-roles-v1.mjs';
import {apocalypseSealed,apocalypseCursed} from './_apocalypse_legion.js';

const live=a=>a?.alive&&a.hp>0&&a.untargetable!==true&&!a.isBattleSuit;
const byHealth=(a,b)=>a.hp/a.maxHp-b.hp/b.maxHp||a.slot-b.slot||a.id.localeCompare(b.id);

// One isolated state machine per battle. Secondary damage never starts a new
// action, another skill, a retaliation loop, or an on-hit magic chain.
export function createIconCombatRuntime({teams,hit,damage,rawDamage,knockout,emit,sealed=apocalypseSealed,cleanseOne=()=>false}){
 const fighters=()=>[...teams.A,...teams.B];
 const states=new Map(fighters().filter(a=>a.iconRole).map(a=>{
  const tuning=a.iconRole.tuning,def=iconDefinition(a.cardId),scale=(a.battleMode==='PVE'?tuning.pveScale:tuning.pvpScale)/100;
  return [a.id,{actor:a,def,tuning,scale,casts:0,next:tuning.firstAction,heat:0,focusId:null,resonance:0,takedowns:0,stored:0,charging:false,ward:0,wardExpires:0,guardLeft:a.maxHp*(tuning.guardBudgetPercent||0)/100,healLeft:a.maxHp*(tuning.healBudgetPercent||0)/100}];
 }));
 const friends=a=>teams[a.side].filter(live),enemies=a=>teams[a.side==='A'?'B':'A'].filter(live);
 const snapshot=t=>({targetId:t.id,targetHpAfter:t.hp,targetMaxHp:t.maxHp,targetShieldAfter:t.shield,targetMaxShield:t.maxShield});
 const label=(s,phase=s.def.skill)=>({actorId:s.actor.id,iconCode:s.def.code,iconRole:s.def.role,label:phase,configRevision:s.actor.iconRole.revision});
 function status(s,t,kind,extra={}){emit('ICON_STATUS',{...label(s,s.def.passive),...snapshot(t),status:kind,...extra});}
 function cleanse(t){if(!t.iconCurse&&!t.iconVulnerability)return false;const kind=t.iconCurse?'저주':'약화';if(t.iconCurse)delete t.iconCurse;else delete t.iconVulnerability;emit('ICON_STATUS',{...snapshot(t),status:'CLEANSED',label:`${kind} 정화`});return true;}
 function addCurse(s,t,stacks=1){
  if(!live(t))return;const c=t.iconCurse,own=c?.sourceId===s.actor.id,count=Math.min(s.tuning.maxStacks,(own?c.stacks:0)+stacks);
  // One bounded curse slot per target: extra copies cannot multiply tick rate.
  if(c&&!own&&c.stacks>count)return;
  t.iconCurse={sourceId:s.actor.id,stacks:count,remaining:s.tuning.durationActions,damage:Math.round(s.actor.attack*s.tuning.dotPercent/100*s.scale*count),healReductionPercent:Math.min(60,s.tuning.healReductionPercent*count)};
  if(t.isBoss)t.iconVulnerability={sourceId:s.actor.id,percent:s.tuning.bossVulnerabilityPercent*s.scale,remaining:s.tuning.durationActions};
  status(s,t,'CURSE',{stacks:count,remaining:t.iconCurse.remaining,healReductionPercent:t.iconCurse.healReductionPercent});
 }
 function ward(s,percent,duration){
  const a=s.actor,w=Math.round(a.maxHp*percent/100*s.scale);
  // Refresh only the unspent ICON portion; unrelated shields are preserved.
  a.shield=Math.max(0,a.shield-Math.min(a.shield,s.ward))+w;s.ward=w;s.wardExpires=a.actions+duration;a.maxShield=Math.max(a.maxShield,a.shield);
  status(s,a,'WARD',{amount:w,remaining:duration});
 }
 function strike(s,t,multiplier,{parts=1,shieldBonus=0,extraDamage=0,defenseIgnore=0}={}){
  const rows=[],a=s.actor,cap=Math.round(t.maxHp*s.tuning.damageCapPercent/100);let budget=cap;
  for(let i=0;i<parts&&live(t);i++){
   const h=hit(a,t,multiplier*s.scale/parts,{damageCapScale:1/parts,s2DefenseIgnore:defenseIgnore});
   if(h.dodge){rows.push({...snapshot(t),damage:0,absorbed:0,dodge:true,hit:i+1});continue;}
   const request=Math.min(budget,Math.max(0,Math.round(h.damage+extraDamage/parts)));
   // Shield bonus is inside the whole-cast target cap, never multiplied per pellet.
   const incoming=Math.min(budget,request+Math.min(t.shield,request*shieldBonus));
   const r=damage(t,incoming,{actor:a,direct:true,iconSkill:true,iconSecondary:i>0,iconDamageCap:budget});budget=Math.max(0,budget-r.hpDamage-r.absorbed);
   a.damageDealt+=r.hpDamage+r.absorbed;
   rows.push({...snapshot(t),damage:r.hpDamage,absorbed:r.absorbed,critical:h.critical,hit:i+1});
  }
  return rows;
 }
 function tick(actor){
  const c=actor.iconCurse;if(!c||!live(actor))return;
  const source=states.get(c.sourceId),n=Math.min(c.damage,Math.round(actor.maxHp*.08));
  const r=damage(actor,n,{actor:source?.actor,iconIndirect:true,iconSecondary:true});
  if(source)source.actor.damageDealt+=r.hpDamage+r.absorbed;
  emit('ICON_DOT',{...(source?label(source,'낙화 저주'):{}),...snapshot(actor),damage:r.hpDamage,absorbed:r.absorbed,stacks:c.stacks});knockout(actor);
 }
 function selectTarget(actor,pool){
  const s=states.get(actor.id);if(!s||sealed(actor))return null;
  if(s.def.role==='ASSASSIN')return enemies(actor).sort(byHealth)[0]||null;
  if(s.def.role==='ATTACK')return pool.find(t=>t.id===s.focusId)||null;
  return null;
 }
 function beforeAction(actor,{healingAllowed=true}={}){
  tick(actor);if(!live(actor))return true;
  const s=states.get(actor.id);if(!s)return false;
  if(sealed(actor)){if(s.charging){s.charging=false;status(s,actor,'INTERRUPTED');}return false;}
  const {def,tuning:c}=s;
  if(s.casts>=c.maxCasts||actor.actions<s.next)return false;
  const foes=enemies(actor);if(!foes.length)return false;
  if(def.role==='MAGIC'&&!s.charging){s.charging=true;s.next=actor.actions+1;status(s,actor,'CHANNEL',{remaining:1});return true;}
  let target=def.role==='ASSASSIN'?foes.sort(byHealth)[0]:foes.find(t=>t.id===s.focusId)||foes.sort((a,b)=>(a.row==='FRONT'?0:1)-(b.row==='FRONT'?0:1)||a.slot-b.slot)[0];
  if(def.role==='SUPPORT'){
   target=friends(actor).filter(t=>t.hp<t.maxHp||t.iconCurse||t.iconVulnerability||t.magicSealCharges||t.doomMarks||t.timeDistortionStacks).sort(byHealth)[0];
   if(!target||!healingAllowed||s.healLeft<=0||apocalypseCursed(actor))return false;
  }
  s.casts++;s.next=actor.actions+c.cooldownActions;s.charging=false;
  let hits=[],targets=[],extra={};
  switch(def.role){
   case 'ATTACK':
    hits=strike(s,target,c.damagePercent/100*(1+s.heat*c.stackPercent/100),{parts:3,shieldBonus:c.shieldBreakPercent/100});extra.stacksConsumed=s.heat;s.heat=0;break;
   case 'ASSASSIN':{
    status(s,target,'MARK');const missing=1-target.hp/target.maxHp;
    hits=strike(s,target,c.damagePercent/100*(1+missing*c.executePercent/100),{parts:2});
    // Credit only an actual knockout, never an intercepted/evaded hit or revival.
    break;
   }
   case 'ASSAULT':
    if(s.casts===1)ward(s,c.shieldPercent,c.durationActions);
    hits=strike(s,target,c.damagePercent/100,{shieldBonus:c.shieldBreakPercent/100});
    if(hits.some(h=>!h.dodge)&&live(target)){
     if(target.isBoss){target.iconVulnerability={sourceId:actor.id,percent:c.bossVulnerabilityPercent*s.scale,remaining:c.durationActions};status(s,target,'VULNERABLE',{percent:target.iconVulnerability.percent,remaining:c.durationActions});}
     else{target.gauge=Math.max(0,target.gauge-c.gaugeDelay*s.scale);status(s,target,'DELAY',{targetGaugeAfter:target.gauge});}
    }break;
   case 'DEFENSE':{
    const stored=Math.min(s.stored*c.storedDamagePercent/100,actor.attack*c.storedCapPercent/100)*s.scale;s.stored=0;
    ward(s,c.shieldPercent,c.durationActions);hits=strike(s,target,c.damagePercent/100,{extraDamage:stored});extra.storedDamage=stored;break;
   }
   case 'CURSE':{
    const stacks=target.iconCurse?.stacks||0;hits=strike(s,target,c.damagePercent/100*(1+stacks*c.stackPercent/100));
    if(hits.some(h=>!h.dodge)){delete target.iconCurse;addCurse(s,target,1);const other=foes.filter(t=>t.id!==target.id).sort(byHealth)[0];if(other&&stacks>0)addCurse(s,other,Math.max(1,Math.floor(stacks/2)));}
    extra.stacksConsumed=stacks;break;
   }
   case 'MAGIC':{
    const chosen=foes.sort((a,b)=>a.slot-b.slot).slice(0,c.maxTargets),focus=1+(c.maxTargets-chosen.length)*c.focusPercent/100;
    for(const t of chosen)hits.push(...strike(s,t,c.damagePercent/100*focus,{defenseIgnore:c.penetrationPercent/100}));break;
   }
   case 'SUPPORT':{
    const cleaned=cleanse(target)||cleanseOne(target);
    const request=target.maxHp*(c.healPercent+s.resonance*c.resonancePercent)/100*s.scale;
    const amount=apocalypseCursed(target)||sealed(target)?0:Math.min(s.healLeft,target.maxHp-target.hp,iconHealingAmount(target,request));
    s.healLeft-=amount;target.hp+=amount;actor.healingDone+=amount;
    target.iconEmpower={percent:c.nextAttackPercent*s.scale,remaining:c.durationActions,sourceId:actor.id};
    targets=[{...snapshot(target),amount,cleaned,empowerPercent:target.iconEmpower.percent}];extra.stacksConsumed=s.resonance;s.resonance=0;break;
   }
  }
  emit('ICON_SKILL',{...label(s),targetId:target.id,hits,targets,cast:s.casts,maxCasts:c.maxCasts,nextAction:s.next,...extra});
  const seen=new Set();for(const row of hits){if(seen.has(row.targetId))continue;seen.add(row.targetId);const t=fighters().find(a=>a.id===row.targetId);if(t&&knockout(t)&&def.role==='ASSASSIN'&&s.takedowns<c.maxTakedowns){s.takedowns++;actor.gauge=Math.min(95,actor.gauge+c.takedownGauge);status(s,actor,'TAKEDOWN',{actorGaugeAfter:actor.gauge,uses:s.takedowns});}}
  return true;
 }
 function basicMultiplier(actor){const s=states.get(actor.id);return s&&s.def.role==='ATTACK'&&!sealed(actor)?1+s.heat*s.tuning.stackPercent/100*s.scale:1;}
 function afterBasic(actor,target,landed){
  const s=states.get(actor.id);if(!s||!landed||sealed(actor))return;
  if(s.def.role==='ATTACK'){s.heat=target.id===s.focusId?Math.min(s.tuning.maxStacks,s.heat+1):1;s.focusId=target.id;status(s,actor,'HEAT',{stacks:s.heat});}
  if(s.def.role==='CURSE')addCurse(s,target);
  if(s.def.role==='ASSASSIN'&&live(target))status(s,target,'MARK');
 }
 function beforeDamage(target,incoming,options={}){
  let amount=Math.max(0,incoming);const a=options.actor;
  if(target.iconVulnerability)amount*=1+Math.min(15,target.iconVulnerability.percent)/100;
  if(a?.iconEmpower&&options.direct&&!options.iconSecondary){amount*=1+a.iconEmpower.percent/100;delete a.iconEmpower;}
  if(Number.isFinite(options.iconDamageCap))amount=Math.min(amount,Math.max(0,options.iconDamageCap));
  if(options.iconIndirect||!a||a.side===target.side||!options.direct)return Math.round(amount);
  const guards=[...states.values()].filter(s=>s.def.role==='DEFENSE'&&s.actor.side===target.side&&s.actor.id!==target.id&&live(s.actor)&&!sealed(s.actor)&&s.guardLeft>0&&target.hp/target.maxHp<=s.tuning.guardThresholdPercent/100).sort((a,b)=>a.actor.slot-b.actor.slot);
  const s=guards[0];if(!s)return Math.round(amount);
  const share=Math.min(s.guardLeft,Math.round(amount*s.tuning.guardSharePercent/100*s.scale));if(share<=0)return Math.round(amount);
  s.guardLeft-=share;const r=rawDamage(s.actor,share,{iconIndirect:true,iconSecondary:true});
  // Redirected damage remains attributed to the original attacker.
  a.damageDealt+=r.hpDamage+r.absorbed;
  emit('ICON_GUARD',{...label(s),...snapshot(s.actor),protectedId:target.id,damage:r.hpDamage,absorbed:r.absorbed,redirected:share,remainingBudget:s.guardLeft});knockout(s.actor);
  return Math.max(0,Math.round(amount-share));
 }
 function onDamage(target,result){const s=states.get(target.id);if(!s||!s.ward)return;const spent=Math.min(s.ward,result.absorbed);s.ward-=spent;if(s.def.role==='DEFENSE')s.stored=Math.min(target.maxHp,s.stored+spent);}
 function endAction(actor){
  if(!actor||actor.isBattleSuit)return;
  for(const key of ['iconCurse','iconVulnerability','iconEmpower'])if(actor[key]&&--actor[key].remaining<=0){delete actor[key];emit('ICON_STATUS',{...snapshot(actor),status:'EXPIRED',statusKey:key,label:'효과 종료'});}
  const s=states.get(actor.id);if(s?.ward&&actor.actions>=s.wardExpires){actor.shield=Math.max(0,actor.shield-Math.min(actor.shield,s.ward));s.ward=0;status(s,actor,'WARD_END');}
  if(live(actor))for(const other of states.values())if(other.def.role==='SUPPORT'&&other.actor.side===actor.side&&other.actor.id!==actor.id&&live(other.actor)&&!sealed(other.actor))other.resonance=Math.min(other.tuning.maxStacks,other.resonance+1);
 }
 return {beforeAction,selectTarget,basicMultiplier,afterBasic,beforeDamage,onDamage,endAction,cleanse,hasDebuff:t=>!!(t.iconCurse||t.iconVulnerability),snapshot:()=>[...states.values()].map(s=>({id:s.actor.id,role:s.def.role,casts:s.casts,nextAction:s.next,guardRemaining:s.guardLeft,healRemaining:s.healLeft,stacks:s.heat||s.resonance,takedowns:s.takedowns}))};
}
