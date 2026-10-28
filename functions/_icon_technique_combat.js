import {validateIconTechniquePreparation,iconTechniqueDefinition} from '../shared/icon-techniques-v1.mjs';

const living=a=>a?.alive&&a.hp>0&&!a.untargetable&&!a.isBattleSuit;
const regular=a=>a&&!a.isIconSummon&&!a.summon&&a.actorKind!=='ICON_WEAPON'&&!a.isBattleSuit&&!a.isMonster;
const order=(a,b)=>a.slot-b.slot||a.id.localeCompare(b.id);
const weak=(a,b)=>a.hp/a.maxHp-b.hp/b.maxHp||order(a,b);
// Assignments come from the server live registry or non-JSON rehearsal capability.
// This runtime owns no rewards, registration, or persisted state.
export function createIconTechniqueRuntime({preparation,teams,emit,knockout,iconSkills=null,sealed=()=>false,reviveBlocked=()=>false}){
 const all=()=>[...teams.A,...teams.B],foes=a=>teams[a.side==='A'?'B':'A'].filter(living),friends=a=>teams[a.side].filter(t=>living(t)&&regular(t));
 const assignments=validateIconTechniquePreparation(preparation).assignments,states=new Map();
 for(const row of assignments){
  const a=all().find(t=>t.id===row.actorId);
  if(!a||!regular(a)||a.isMercenary||a.iconRole)throw Error('INVALID_ICON_TECHNIQUE_ACTOR');
  states.set(a.id,{actor:a,code:row.code,c:row.tuning,casts:0,next:row.tuning.firstAction,loan:null});
 }
 const deferrals=new Map(),debts=new Map(),protections=new Map(),bans=new Map(),censors=new Map(),oaths=new Map(),revived=new Set(),lastDamage=new Map(),acquiredBuffs=new Map();
 const snap=t=>({targetId:t.id,targetHpAfter:t.hp,targetMaxHp:t.maxHp,targetShieldAfter:t.shield});
 const event=(s,phase,data={})=>emit('ICON_TECHNIQUE',{techniqueCode:s.code,phase,actorId:s.actor.id,sourceId:s.actor.id,sourceAction:s.actor.actions,label:iconTechniqueDefinition(s.code).name,...data});
 const schedule=a=>{
  const s=states.get(a.id);if(s)return s.casts<s.c.maxCasts&&!s.loan?{next:s.next,code:s.code}:null;
  return iconSkills?.schedule(a)||null;
 };
 const lend=(a)=>{
  const s=states.get(a.id),current=schedule(a),due=a.actions+1;if(!current||current.next<=due)return null;
  const borrowed=current.next-due;
  if(s){s.loan={borrowed,repaidAt:null};s.next=due;}else if(!iconSkills.advance(a))return null;
  return {borrowed,nextAction:due,previousNextAction:current.next};
 };
 // Only this existing, removable action-limited attack buff is transferable.
 // Passive/stat-profile/equipment modifiers, shields and permanent buffs are not.
 const removable=a=>a.iconEmpower&&Number.isFinite(a.iconEmpower.percent)&&a.iconEmpower.percent>0&&Number.isSafeInteger(a.iconEmpower.remaining)&&a.iconEmpower.remaining>0?a.iconEmpower:null;
 function summonEnd(summon,reason){if(!summon?.alive)return;summon.hp=0;summon.alive=false;summon.gauge=0;emit('ICON_SUMMON_END',{actorId:summon.iconOwnerId,ownerId:summon.iconOwnerId,targetId:summon.id,summonId:summon.id,reason,...snap(summon),label:'자율병기 소멸'});}
 function cleanup(){
  for(const a of all())if(a.isIconSummon&&!living(all().find(t=>t.id===a.iconOwnerId)))summonEnd(a,'OWNER_DEAD');
  for(const [id,p] of protections)if(!living(all().find(t=>t.id===id))){protections.delete(id);for(const set of bans.values())set.delete(id);}
 }
 function finishOath(s,o){
  if(!oaths.has(s.actor.id))return;
  const target=all().find(a=>a.id===o.allyId);oaths.delete(s.actor.id);
  if(!target||living(target)||revived.has(target.id)||!living(s.actor)||reviveBlocked(target)){event(s,'FAIL',{targetId:o.allyId,returnTargetId:o.allyId,goalTargetId:o.enemyId,reason:'REVIVAL_UNAVAILABLE'});return;}
  revived.add(target.id);target.hp=Math.max(1,Math.round(target.maxHp*s.c.reviveHpPercent/100));target.alive=true;target.gauge=0;target.shield=0;
  event(s,'REVIVE',{...snap(target),revived:true,returnTargetId:target.id,goalTargetId:o.enemyId,reviveHpPercent:s.c.reviveHpPercent});
 }
 function beforeAction(actor){
  cleanup();if(!living(actor)||actor.isIconSummon)return false;
  const s=states.get(actor.id);if(s?.loan?.repaidAt&&actor.actions>=s.loan.repaidAt){s.loan=null;emit('ICON_TECHNIQUE',{techniqueCode:'SKILL_ADVANCE',phase:'REPAY',actorId:actor.id,sourceId:actor.id,targetId:actor.id,borrowedCooldown:0,label:'선불 출격 상환'});}if(!s||s.casts>=s.c.maxCasts||actor.actions<s.next||sealed(actor)||actor.stunned||actor.silenced)return false;
  const enemies=foes(actor).filter(t=>!t.isIconSummon),allies=friends(actor);let target=null,apply=null;
  switch(s.code){
   case 'CROWN_USURP':
    if(!iconSkills)return false;
    target=enemies.sort(order).find(t=>removable(t));if(!target||removable(actor))return false;
    apply=()=>{const buff={...removable(target)};delete target.iconEmpower;actor.iconEmpower=buff;acquiredBuffs.set(actor.id,actor.actions);event(s,'APPLY',{targetId:target.id,recipientId:actor.id,statusKey:'iconEmpower',percent:buff.percent,remaining:buff.remaining,sourceRemoved:true});};break;
   case 'FORMATION_EDIT':{
    const candidates=enemies.filter(t=>!t.isBoss&&!t.formationLocked&&!t.isMercenary),front=candidates.filter(t=>t.row==='FRONT').sort(order)[0],back=candidates.filter(t=>t.row==='BACK').sort(order)[0];
    if(!front||!back)return false;target=front;
    apply=()=>{const before=[front,back].map(t=>({targetId:t.id,previousSlot:t.slot,previousRow:t.row}));[front.slot,back.slot]=[back.slot,front.slot];[front.row,back.row]=[back.row,front.row];event(s,'SWAP',{targetId:front.id,swapTargetId:back.id,targets:[front,back].map((t,i)=>({...before[i],slot:t.slot,row:t.row}))});};break;
   }
   case 'WOUND_DEFER':
    target=allies.filter(t=>!deferrals.has(t.id)).sort(weak)[0];if(!target||s.c.deferPercent<=0)return false;
    apply=()=>{deferrals.set(target.id,{s,expires:target.actions+s.c.durationActions});event(s,'APPLY',{...snap(target),deferPercent:s.c.deferPercent,remaining:s.c.durationActions});};break;
   case 'SKILL_ADVANCE':
    target=allies.filter(t=>t!==actor&&!t.isMercenary&&schedule(t)?.next>t.actions+1).sort(order)[0];if(!target)return false;
    apply=()=>event(s,'ADVANCE',{...snap(target),...lend(target)});break;
   case 'PURSUIT_BAN':
    target=allies.filter(t=>!protections.has(t.id)).sort(weak)[0];if(!target||allies.length<2)return false;
    apply=()=>{protections.set(target.id,{s,expires:target.actions+s.c.durationActions});event(s,'APPLY',{...snap(target),remaining:s.c.durationActions});};break;
   case 'SKILL_CENSOR':
    target=enemies.filter(t=>!censors.has(t.id)&&iconSkills?.offensive(t)).sort(order)[0];if(!target)return false;
    apply=()=>{censors.set(target.id,{s,expires:target.actions+s.c.durationActions});event(s,'APPLY',{...snap(target),remaining:s.c.durationActions});};break;
   case 'AUTONOMOUS_WEAPON':{
    if(all().some(t=>t.isIconSummon&&t.iconOwnerId===actor.id&&living(t)))return false;
    target=actor;apply=()=>{
     const previous=teams[actor.side].find(t=>t.isIconSummon&&t.iconOwnerId===actor.id);let slot=previous?.slot??10;while(!previous&&teams[actor.side].some(t=>t.slot===slot))slot++;
     const weapon={id:actor.id+':ICON_WEAPON',cardId:'ICON_WEAPON',side:actor.side,slot,row:'FRONT',title:'자율병기',name:'자율병기',isIconSummon:true,summon:true,actorKind:'ICON_WEAPON',iconOwnerId:actor.id,ownerId:actor.id,battleMode:actor.battleMode,type:'NONE',typeLabel:'자율병기',attackStyle:'RANGED',maxHp:Math.max(1,Math.round(actor.maxHp*s.c.hpPercent/100)),attack:Math.max(1,Math.round(actor.attack*s.c.attackPercent/100)),defense:0,speed:Math.max(1,actor.speed*s.c.speedPercent/100),shield:0,maxShield:0,gauge:0,alive:true,actions:0,damageDealt:0,healingDone:0};weapon.hp=weapon.maxHp;
     if(previous)Object.assign(previous,weapon);else teams[actor.side].push(weapon);
     emit('ICON_SUMMON',{actorId:actor.id,ownerId:actor.id,targetId:weapon.id,summonId:weapon.id,side:actor.side,slot,fighter:{...weapon},label:'자율병기 전개'});
    };break;
   }
   case 'RETURN_OATH':{
    const dead=teams[actor.side].filter(t=>regular(t)&&!living(t)&&t.hp<=0&&!revived.has(t.id)&&!t.noRevive).sort(order)[0];
    if(!dead||oaths.has(actor.id)||[...oaths.values()].some(o=>o.allyId===dead.id)||!enemies.length)return false;
    target=enemies.sort(weak)[0];apply=()=>{const boss=enemies.length===1&&target.isBoss,goal=boss?Math.max(1,Math.ceil(target.maxHp*s.c.bossDamagePercent/100)):0;oaths.set(actor.id,{allyId:dead.id,enemyId:target.id,goal,progress:0,expires:actor.actions+s.c.windowActions});event(s,'APPLY',{targetId:target.id,goalTargetId:target.id,returnTargetId:dead.id,goal,progress:0,remaining:s.c.windowActions,bossGoal:boss});};break;
   }
  }
  if(!apply)return false;
  if(Number(actor.magicSealCharges||0)>0){actor.magicSealCharges--;if(!actor.magicSealCharges)actor.magicSealSourceId='';event(s,'BLOCKED',{reason:'SKILL_SEALED'});return false;}
  s.casts++;const repayment=s.loan?.borrowed||0;s.next=actor.actions+s.c.cooldownActions+repayment;if(s.loan)s.loan.repaidAt=s.next;
  event(s,'CAST',{targetId:target?.id,cast:s.casts,nextAction:s.next,borrowedCooldown:repayment});apply();return true;
 }
 function beforeHpDamage(target,incoming,options={}){
  const p=deferrals.get(target.id);if(!p||!living(target)||options.iconDebt||!options.direct||!options.actor||options.actor.side===target.side||p.expires<target.actions)return incoming;
  const amount=Math.floor(Math.max(0,incoming)*p.s.c.deferPercent/100);if(!amount)return incoming;
  const rows=debts.get(target.id)||[];rows.push({amount,due:target.actions+1,attackerId:options.actor.id,s:p.s});debts.set(target.id,rows);
  event(p.s,'DEFER',{...snap(target),amount,dueAction:target.actions+1,damageSourceId:options.actor.id,debt:rows.reduce((sum,row)=>sum+row.amount,0),debtRemaining:rows.reduce((sum,row)=>sum+row.amount,0)});return incoming-amount;
 }
 function filterTargets(actor,pool,enemies){
  const blocked=bans.get(actor.id);if(!blocked?.size)return pool;
  const candidates=enemies.filter(t=>living(t)&&!t.isIconSummon);if(candidates.length<=1)return pool;
  const allowed=t=>!blocked.has(t.id)||!protections.has(t.id),selected=pool.filter(allowed);
  if(selected.length)return selected;const alternate=candidates.filter(allowed);if(alternate.length)return alternate;
  // Multiple protection casters cannot deadlock the only legal target pool.
  const fallback=candidates.sort(order)[0];if(fallback){blocked.delete(fallback.id);return[fallback];}return pool;
 }
 function singleTarget(actor,target){
  if(!actor||!target||actor.side===target.side||actor.isIconSummon||target.isIconSummon)return;
  const blocked=bans.get(actor.id)||new Set();for(const id of blocked)if(id!==target.id)blocked.delete(id);
  const p=protections.get(target.id);if(p&&p.expires>target.actions){blocked.add(target.id);event(p.s,'TRACK',{targetId:target.id,attackerId:actor.id});}
  bans.set(actor.id,blocked);
 }
 function consumeCensor(actor){const p=censors.get(actor.id);if(!p)return false;censors.delete(actor.id);if(p.expires<actor.actions)return false;event(p.s,'CENSOR',{...snap(actor),charges:0});return true;}
 function onDamage(target,result,options={}){
  if(result.hpDamage>0)lastDamage.set(target.id,options.actor?.side||null);
  for(const [id,o] of oaths){const s=states.get(id);if(!o.goal||o.enemyId!==target.id||options.actor?.side!==s.actor.side||options.actor.isIconSummon||result.hpDamage<=0)continue;o.progress+=result.hpDamage;event(s,'PROGRESS',{targetId:target.id,goalTargetId:target.id,returnTargetId:o.allyId,progress:o.progress,goal:o.goal});if(o.progress>=o.goal)finishOath(s,o);}
 }
 function onKnockout(target){
  if(target.isIconSummon)emit('ICON_SUMMON_END',{actorId:target.iconOwnerId,ownerId:target.iconOwnerId,targetId:target.id,summonId:target.id,reason:'DESTROYED',...snap(target),label:'자율병기 파괴'});
  deferrals.delete(target.id);debts.delete(target.id);censors.delete(target.id);
  for(const [id,o] of oaths){const s=states.get(id);if(id===target.id){oaths.delete(id);event(s,'FAIL',{targetId:o.allyId,returnTargetId:o.allyId,goalTargetId:o.enemyId,reason:'CASTER_DEAD'});}else if(o.enemyId===target.id&&!o.goal&&lastDamage.get(target.id)===s.actor.side)finishOath(s,o);}
  cleanup();
 }
 function endAction(actor){
  if(!actor||actor.isIconSummon)return;const rows=debts.get(actor.id)||[],remaining=[];
  let debtRemaining=rows.reduce((sum,row)=>sum+row.amount,0);for(const debt of rows){if(debt.due>actor.actions){remaining.push(debt);continue;}if(!living(actor))continue;const amount=Math.min(actor.hp,debt.amount);debtRemaining-=debt.amount;actor.hp-=amount;const source=all().find(t=>t.id===debt.attackerId);if(source)source.damageDealt+=amount;event(debt.s,'REPAY',{...snap(actor),amount,damage:amount,damageSourceId:debt.attackerId,debtRemaining:actor.hp>0?debtRemaining:0});if(actor.hp<=0){lastDamage.set(actor.id,source?.side);knockout(actor);}}
  if(remaining.length&&living(actor))debts.set(actor.id,remaining);else debts.delete(actor.id);
  for(const map of [deferrals,protections,censors]){const p=map.get(actor.id);if(p&&p.expires<=actor.actions){map.delete(actor.id);event(p.s,'EXPIRE',{targetId:actor.id});}}
  for(const s of states.values()){if(s.loan?.repaidAt&&s.actor.actions>=s.loan.repaidAt){s.loan=null;emit('ICON_TECHNIQUE',{techniqueCode:'SKILL_ADVANCE',phase:'REPAY',actorId:s.actor.id,sourceId:s.actor.id,targetId:s.actor.id,borrowedCooldown:0,label:'선불 출격 상환'});}const o=oaths.get(s.actor.id);if(o&&(!living(s.actor)||s.actor.actions>=o.expires)){oaths.delete(s.actor.id);event(s,'FAIL',{targetId:o.allyId,returnTargetId:o.allyId,goalTargetId:o.enemyId,reason:'DEADLINE'});}}
  cleanup();
 }
 return {beforeAction,beforeHpDamage,filterTargets,singleTarget,consumeCensor,onDamage,onKnockout,endAction,cleanup,
  schedule,advance:lend,snapshot:()=>[...states.values()].map(s=>({actorId:s.actor.id,code:s.code,casts:s.casts,nextAction:s.next,loan:s.loan?{...s.loan}:null})),
  loanRepaid:actor=>emit('ICON_TECHNIQUE',{techniqueCode:'SKILL_ADVANCE',phase:'REPAY',actorId:actor.id,sourceId:actor.id,targetId:actor.id,borrowedCooldown:0,label:'선불 출격 상환'}),preserveBuffThisAction:(actor,key)=>key==='iconEmpower'&&acquiredBuffs.get(actor.id)===actor.actions,isPrepared:a=>states.has(a.id)};
}
