import {BERKAN_SKILL_ID,BERKAN_CAP_SCALE,BERKAN_MECHANIC} from '../shared/mercenary-berkan-v1.mjs';
import {resolveBerkanStarfall} from './_mercenary_berkan.js';
import {SNIPER_ORIKKUNG_SKILL_ID,SNIPER_ORIKKUNG_CAP_SCALE} from '../shared/mercenary-sniper-orikkung-v1.mjs';
import {resolveCryvernCrown} from './_mercenary_cryvern.js';
import {CRYVERN_SKILL_ID,CRYVERN_CAP_SCALE} from '../shared/mercenary-cryvern-v1.mjs';
import {resolveHeukwolCombo} from './_mercenary_heukwol.js';
import {apocalypseSealed,apocalypseHealing,clearApocalypseStatus} from './_apocalypse_legion.js';
import {validateMercenaryCombat} from '../shared/mercenary-combat-policy-v1.mjs';
import {MERCENARY_POWER_STANDARD} from '../shared/equipment-mercenary-power-v1.mjs';
import {MERCENARY_COMBAT_LINK,mercenaryEffectiveAttack,mercenaryPvpTierOffense} from '../shared/mercenary-combat-link-v2103.mjs';
import {mercenaryAttackStyle} from '../shared/mercenary-attack-style-v1.mjs';
import {isRangedMercenarySkill,rangedMercenaryProfile,rangedMercenaryPvpScale,cheongaHigherTierPvpScale} from '../shared/mercenary-ranged-balance-v1.mjs';
import {isMercenaryGuardSkill,MERCENARY_GUARD_BASIC_SCALE,mercenaryWardPercent} from '../shared/mercenary-guard-balance-v1.mjs';
import {isMercenaryMoonDrawSkill} from '../shared/mercenary-moon-draw-v1.mjs';
import {resolveMangisaVolley} from './_mercenary_mangisa.js';
import {resolveRagnielJudgment} from './_mercenary_ragniel.js';
const living=x=>x?.alive!==false&&x?.hp>0&&!x?.untargetable&&!x?.isBattleSuit;
const ordered=team=>team.filter(living).sort((a,b)=>a.slot-b.slot||String(a.id).localeCompare(String(b.id)));
const front=team=>{const all=ordered(team),rows=all.filter(x=>x.row==='FRONT');return rows.length?rows:all.slice(0,1);};
const weakest=team=>ordered(team).sort((a,b)=>a.hp/a.maxHp-b.hp/b.maxHp||a.slot-b.slot)[0];
// Rank power is fixed while ordinary cards include unbounded equipment power.
// The mercenary remains targetable, but its reserved action is additional:
// released fighters act after each allied card action without replacing a card,
// advancing its gauge, or consuming the five-card battle's action budget.
// Natural mercenary turns clear the debt; suit shots and enemy turns cannot.
export function mercenaryTurnCadence(teams){
 if([...teams.A,...teams.B].some(actor=>actor.ownerId))return duoMercenaryTurnCadence(teams);
 const debt={A:0,B:0};
 const interval=side=>teams[side]?.some(a=>a.isMercenary&&a.statMode==='RANK_FIXED')?MERCENARY_COMBAT_LINK.regularActionsPerTurn:5;
 const regular=actor=>living(actor)&&!actor.isMonster&&!actor.isMercenary&&actor.actorKind!=='BATTLE_SUIT';
 return {
  pending(eligible=()=>true){
   return ['A','B'].flatMap(side=>debt[side]>=interval(side)?teams[side]?.filter(a=>a.isMercenary&&living(a)&&eligible(a))||[]:[])[0]||null;
  },
  select(actor){
   if(!regular(actor)||debt[actor.side]<interval(actor.side))return actor;
   return teams[actor.side]?.find(a=>a.isMercenary&&living(a))||actor;
  },
  acted(actor){
   if(actor.isMercenary)debt[actor.side]=0;
   else if(regular(actor)){
    debt[actor.side]=Math.min(interval(actor.side),debt[actor.side]+1);
    // Once its five allies fall, a PVP mercenary must still get its reserved
    // response. Fixed base speed cannot compete with equipment-scaled cards.
    // Use the surviving regular-card clock; never recurse from mercenary/suit
    // actions or change the normal/PVE cadence while allied cards are alive.
    const other=actor.side==='A'?'B':'A',team=teams[other]||[];
    if(!team.some(regular)&&team.some(m=>m.isMercenary&&m.statMode==='RANK_FIXED'&&m.battleMode==='PVP'&&living(m)))debt[other]=Math.min(interval(other),debt[other]+1);
   }
  }
 };
}
// A teammate's card action cannot grant both mercenaries an extra turn. Each
// owner's five cards drive their own mercenary, including last-stand responses.
function duoMercenaryTurnCadence(teams){
 const groups=['A','B'].flatMap(side=>[...new Set(teams[side].map(a=>a.ownerId))].map(ownerId=>({side,ownerId,actors:teams[side].filter(a=>a.ownerId===ownerId),debt:0})));
 const regular=a=>living(a)&&!a.isMercenary&&!a.isMonster&&!a.isBattleSuit;
 const interval=g=>g.actors.some(a=>a.isMercenary&&a.statMode==='RANK_FIXED')?MERCENARY_COMBAT_LINK.regularActionsPerTurn:5;
 const pending=(g,eligible)=>g.debt>=interval(g)?g.actors.find(a=>a.isMercenary&&living(a)&&eligible(a)):null;
 return {
  pending(eligible=()=>true){return groups.map(g=>pending(g,eligible)).find(Boolean)||null;},
  select(actor){const g=groups.find(g=>g.side===actor.side&&g.ownerId===actor.ownerId);return g&&regular(actor)?pending(g,()=>true)||actor:actor;},
  acted(actor){
   const own=groups.find(g=>g.side===actor.side&&g.ownerId===actor.ownerId);if(!own)return;
   if(actor.isMercenary)own.debt=0;
   else if(regular(actor)){
    own.debt=Math.min(interval(own),own.debt+1);
    for(const g of groups)if(g.side!==actor.side&&!g.actors.some(regular)&&g.actors.some(m=>m.isMercenary&&m.statMode==='RANK_FIXED'&&living(m)))g.debt=Math.min(interval(g),g.debt+1);
   }
  }
 };
}
// v2119 · 용병 스킬 피해 상한 예산
// PVP 피해 상한은 한 타격당 대상 최대 HP 의 60% 다. 지금까지는 시전이 몇 행동을 쓰든
// 타격마다 상한 하나를 통째로 썼다. 그래서 한 행동에 네 번 때리는 스킬만 압도적으로 세고,
// 준비 행동을 쓰는 스킬은 "2행동에 상한 1개"가 되어 평타보다 손해였다(18명 중 16명).
// 시전이 실제로 소모하는 행동 수만큼 상한 예산을 주고, 한 대상 안에서 나눠 때리면
// 그 몫만큼만 쓰게 한다. 스킬별 조정치는 MERCENARY_SKILL_CAP_SCALE 하나로 모은다.
// PVE 는 상한 자체가 거의 걸리지 않아 이 값의 영향을 받지 않는다.
const MERCENARY_SKILL_RESOLVE_ACTIONS=Object.freeze({RIFT_MARK_DETONATION:2,TWO_BEAT_FOLLOWUP:2,SAME_TARGET_CALIBRATION:3,DANCING_TARGET_VOLLEY:3,PLATINUM_FOCUS_LOCK:3,DISTRIBUTED_CORAL_VOLLEY:3,ABYSS_SHIELD_ECHO:2,CLEANSE_THEN_MEND:2});
export const MERCENARY_SKILL_CAP_SCALE=Object.freeze({
 [BERKAN_SKILL_ID]:BERKAN_CAP_SCALE,
 [SNIPER_ORIKKUNG_SKILL_ID]:SNIPER_ORIKKUNG_CAP_SCALE,
 [CRYVERN_SKILL_ID]:CRYVERN_CAP_SCALE,
 'MS-021':.82,'MS-046':1.04,'MS-043':1.6,'MS-010':.7,'MS-045':1.6,'MS-036':1.8,'MS-032':1.8,'MS-009':1.6,
 'MS-004':1.5,'MS-040':1.6,'MS-037':1.6,'MS-008':1.1,'MS-022':1.35,'MS-001':.8,'MS-005':3.4,'MS-042':1.45,'MS-044':1.2,'MS-047':1.2,
});
export function mercenarySkillCapActions(actor,skill,ranged,sequentialCount){
 const actions=ranged?Math.max(1,sequentialCount||1):(MERCENARY_SKILL_RESOLVE_ACTIONS[skill?.mechanic]??1);
 return actions*(MERCENARY_SKILL_CAP_SCALE[skill?.id]??1)*mercenaryPvpTierOffense(actor);
}
// 피해가 없는 보조 스킬은 행동을 잡아먹지 않는다. 용병이 스킬을 쓰느라 공격을 거르면
// 그 행동이 통째로 손해가 되어, 스킬을 쓸수록 약해지는 역전이 생긴다.
const MERCENARY_SUPPORT_MECHANICS=new Set(['INTERCEPT_ONE_HIT','FRONT_STAND_FAST','MELEE_PARRY_RIPOSTE','NEXT_BASIC_ORDER','FRONT_SHARED_BARRIER','FRONT_OFFENSE_VEIL','CLEANSE_THEN_MEND','WHITE_OATH_GROUP_HEAL']);
export const isMercenarySupportSkill=skill=>MERCENARY_SUPPORT_MECHANICS.has(skill?.mechanic);
export function buildMercenaryFighter(snapshot,side,mode,buildCardFighter){
 if(!snapshot)return null;
 if(snapshot.statMode==='RANK_FIXED'){
  const power=MERCENARY_POWER_STANDARD.basePowerByRank[snapshot.rank];
  if(!power||typeof buildCardFighter!=='function')throw Error('INVALID_MERCENARY_RANK_POWER');
  const base=buildCardFighter({id:snapshot.code,power,type:'NONE'},5,side,null,mode);
  snapshot={...snapshot,basePower:power,level:1,stats:{hp:base.maxHp,attack:base.attack,defense:base.defense,speed:base.speed}};
 }
 if(!/^V-\d{3}$/.test(snapshot.code)||!['A','B'].includes(side)||Object.values(snapshot.stats||{}).length!==4||Object.values(snapshot.stats).some(n=>!Number.isSafeInteger(n)||n<=0))throw Error('INVALID_MERCENARY_SNAPSHOT');
 for(const s of snapshot.skills||[]){const b=s.balance;if(!b||!Number.isFinite(b.damageRatio)||b.damageRatio<0||b.damageRatio>10000||!Number.isSafeInteger(Math.floor(snapshot.stats.attack*b.damageRatio))||!Number.isInteger(b.cost)||b.cost<0||!Number.isInteger(b.cooldownTurns)||b.cooldownTurns<0)throw Error('INVALID_MERCENARY_SKILL_BALANCE');}
 const config=validateMercenaryCombat(snapshot.combat),power=Math.round(snapshot.basePower*(1+config.powerGrowthPercentPerLevel*(snapshot.level-1)/100));
 return {...snapshot,id:`${side}:MERCENARY:${snapshot.code}`,cardId:snapshot.code,slot:5,side,battleMode:mode,row:snapshot.position==='FRONT'?'FRONT':'BACK',type:'MERCENARY',typeLabel:snapshot.role,actorKind:'MERCENARY',isMercenary:true,
  image:snapshot.sourceArt,name:snapshot.name,title:snapshot.name,grade:snapshot.rank,power,basePower:snapshot.basePower,equipmentShare:0,combat:config,skills:structuredClone(snapshot.skills||[]),
  attackStyle:mercenaryAttackStyle(snapshot),
  maxHp:snapshot.stats.hp,hp:Math.round(snapshot.stats.hp*Math.max(0,Math.min(100,snapshot.startingHpPercent??100))/100),attack:snapshot.stats.attack,defense:snapshot.stats.defense,speed:snapshot.stats.speed,shield:0,maxShield:0,gauge:0,alive:(snapshot.startingHpPercent??100)>0,actions:0,damageDealt:0,healingDone:0,uniqueAbility:null};
}
// Uses the canonical battle's RNG, damage caps, knockout/revive handler and
// event clock. Sniper and sequential ranged fixes have separate action costs.
// Other prepared actions retain their normal actor turns. No recursive
// cast/proc chain is generated by counter, poison, support or follow-up hits.
export function mercenaryCombat({teams,hit,damage,knockout,emit,clock}){
 const all=()=>[...teams.A,...teams.B],states=new Map();
 // Freeze the opposing mercenary tier at entry. A KO/retarget cannot restore
 // Cheonga's output halfway through a paid volley or change the battle rule.
 const tierScales=new Map(all().filter(a=>a.isMercenary).map(a=>[a.id,cheongaHigherTierPvpScale(a,teams[a.side==='A'?'B':'A'])]));
 const tierScale=a=>tierScales.get(a.id)??1;
 const state=a=>{if(!states.has(a.id))states.set(a.id,{energy:a.combat?.energyMax||0,cooldown:new Map(),pending:null,used:new Set(),hits:0,basicCount:0,nextIndex:0});return states.get(a.id);};
 const buffs=new Map(),debuffs=new Map();
 const table=(map,a)=>{if(!map.has(a.id))map.set(a.id,{});return map.get(a.id);};
 const friendly=a=>ordered(teams[a.side]),enemies=a=>ordered(teams[a.side==='A'?'B':'A']);
 const send=(a,s,phase,t,data={})=>emit(`MERCENARY_${phase}`,{actorId:a.id,actorKind:'MERCENARY',skillId:s.id,skillName:s.name,mechanic:s.mechanic,skillPhaseIndex:['DOT','RIPOSTE'].includes(phase)?1:state(a).pending?.step||0,targetId:t?.id,...data,label:s.name});
 function targets(a,s){const en=enemies(a),fr=front(en),friends=friendly(a);
  if(s.mechanic===BERKAN_MECHANIC)return [...en].sort((a,b)=>Number(b.row==='BACK')-Number(a.row==='BACK')||(b.openingAttack??b.attack)-(a.openingAttack??a.attack)||a.slot-b.slot||String(a.id).localeCompare(String(b.id))).slice(0,2);
  if(s.mechanic==='PLATINUM_SANCTUARY'||s.mechanic==='CRYSTAL_CROWN')return fr.slice(0,2);
  if(s.mechanic==='GOLDEN_ORCHID_VOLLEY'){const primary=fr[0];return primary?[primary,...en.filter(t=>t!==primary).slice(0,2)]:[];}
  if(isMercenaryGuardSkill(s))return [weakest(friends.filter(t=>t.id!==a.id&&!activeIntercept(t)))].filter(Boolean);
  if(s.mechanic==='CLEANSE_THEN_MEND')return [weakest(friends)].filter(Boolean);
  if(s.mechanic==='WHITE_OATH_GROUP_HEAL'){
   const allies=friends.filter(t=>!t.isMonster&&t.actorKind!=='BATTLE_SUIT'&&t.id!=='ESCORT_OBJECTIVE'&&!t.isEscortObjective);
   return allies.some(t=>t.hp<t.maxHp)?allies:[];
  }
  if(s.mechanic==='MELEE_PARRY_RIPOSTE')return [a];
  if(['FRONT_SHARED_BARRIER','FRONT_STAND_FAST'].includes(s.mechanic))return front(friends);
  if(s.mechanic==='NEXT_BASIC_ORDER')return friends.filter(t=>!t.isMonster);
  if(['EMERALD_ANTIMATERIEL','LOCKED_THREAT_SHOT','INFILTRATE_DELAYED_VENOM','UNDISTURBED_FIRST_SHOT','ABYSS_SHIELD_ECHO'].includes(s.mechanic)){const back=en.filter(t=>t.row==='BACK');return [...(back.length?back:fr)].sort((a,b)=>(b.openingAttack??b.attack)-(a.openingAttack??a.attack)||a.slot-b.slot).slice(0,1);}
  if(['FINISHER_WITH_RELOAD','WOUNDED_MOON_DRAW','DANCING_TARGET_VOLLEY'].includes(s.mechanic))return [weakest(en)].filter(Boolean);
  if(s.mechanic==='DISTRIBUTED_CORAL_VOLLEY')return [...en].sort((a,b)=>a.hp/a.maxHp-b.hp/b.maxHp||a.slot-b.slot).slice(0,3);
  return fr.slice(0,['RIFT_MARK_DETONATION','ADVANCE_SUPPRESSION','FRONT_OFFENSE_VEIL'].includes(s.mechanic)?2:1);
 }
 function effect(a,s,t,amount,phase='HIT',dodge=false){
  if(!living(t))return {hit:false};const st=damage(t,Math.max(0,amount));a.damageDealt+=st.hpDamage+st.absorbed;
  send(a,s,phase,t,{damage:st.hpDamage,absorbed:st.absorbed,targetHpAfter:t.hp,targetMaxHp:t.maxHp,targetShieldAfter:t.shield,dodge});knockout(t);return {hit:!dodge,damage:st.hpDamage+st.absorbed,absorbed:st.absorbed};
 }
 function activeIntercept(t){
  const buff=table(buffs,t),ward=buff.intercept;
  if(ward&&(!living(t)||!living(ward.actor)||t.actions>=ward.expires)){delete buff.intercept;return null;}
  return ward||null;
 }
 function interceptDamage(a,t,amount){
  const ward=activeIntercept(t);if(!ward||amount<=0||ward.actor.id===t.id||ward.actor.stunned||ward.actor.silenced)return amount;
  delete table(buffs,t).intercept;
  const protector=ward.actor,share=Math.floor(amount*ward.percent/100),result=damage(protector,share),transferred=result.hpDamage+result.absorbed;
  a.damageDealt+=transferred;
  send(protector,ward.skill,'INTERCEPT',protector,{sourceAttackerId:a.id,protectedTargetId:t.id,damage:result.hpDamage,absorbed:result.absorbed,targetHpAfter:protector.hp,targetMaxHp:protector.maxHp,targetShieldAfter:protector.shield});
  knockout(protector);return amount-transferred;
 }
 function offensiveSkillScale(a,s,followup=false){
  const p=state(a).pending;
  // A PVP suppression is one offensive cast, including its remaining impacts.
  // Basic/support actions and unrelated ripostes cannot spend the debuff.
  if(a.battleMode==='PVP'&&p?.skill===s&&Number.isFinite(p.offensiveScale))return p.offensiveScale;
  const veil=table(debuffs,a).veil;if(!veil||followup)return 1;
  delete table(debuffs,a).veil;const scale=Math.max(0,1-veil.percent/100);
  if(a.battleMode==='PVP'&&p?.skill===s)p.offensiveScale=scale;
  return scale;
 }
 function strike(a,s,t,multiplier=1,phase='HIT',opts={}){
  if(!living(t))return {hit:false};const pvpScale=rangedMercenaryPvpScale(a,s,tierScale(a)),offensiveScale=offensiveSkillScale(a,s,opts.followup),capWeaken=a.battleMode==='PVP'?offensiveScale:1;
  const scale=Number(s.balance.damageRatio)*multiplier*pvpScale*offensiveScale;
  if(scale<=0)return effect(a,s,t,0,phase);
  const ranged=isRangedMercenarySkill(a,s);
  const h=hit(a,t,scale,{rangedSkill:ranged,castShare:(opts.castShare??1)*pvpScale,capScale:mercenarySkillCapActions(a,s,ranged,opts.capCount)*(opts.capShare??1)*pvpScale*capWeaken});if(h.dodge){send(a,s,phase,t,{dodge:true,damage:0,targetHpAfter:t.hp,targetShieldAfter:t.shield});return {hit:false};}
  // Only direct single-target skill impacts can consume the link. Area skills,
  // poison, counters and fixed boss effects retain their own damage paths.
  const single=phase==='HIT'&&!['RIFT_MARK_DETONATION','ADVANCE_SUPPRESSION','DISTRIBUTED_CORAL_VOLLEY'].includes(s.mechanic);
  return effect(a,s,t,single?interceptDamage(a,t,h.damage):h.damage,phase);
 }
 // v2119: 시전 뒤 재장전 게이지 지연을 없앤다. 용병의 다음 행동이 늦어지면 안 된다.
 function finish(a,s){const st=state(a);st.pending=null;send(a,s,'END');}
 function cancel(a,reason){const st=state(a),p=st.pending;if(!p)return;st.pending=null;st.cancelled=true;send(a,p.skill,'CANCEL',null,{reason});}
 function cleanse(target,onlyDot=false){if(!onlyDot&&Object.keys(target.apocalypseStatus||{}).length){clearApocalypseStatus(target);emit('APOCALYPSE_STATUS',{targetId:target.id,statuses:{},label:'정화'});return 'apocalypse';}const d=table(debuffs,target);for(const key of onlyDot?['poison','rift']:['poison','rift','thorn','oath','armor','veil','restraint','offender'])if(d[key]){if(key==='armor')target.defense=d[key].original;delete d[key];return key;}return null;}
 // Snipers fire within one action. Slow volleys start immediately but keep
 // one projectile per actor action, so they cannot burst three full hit caps.
 function resolveRanged(a,p){
  const s=p.skill,c=a.combat,mechanic=s.mechanic,sequential=rangedMercenaryProfile(a,s)==='SEQUENTIAL';
  const count=['SAME_TARGET_CALIBRATION','DANCING_TARGET_VOLLEY','PLATINUM_FOCUS_LOCK'].includes(mechanic)?3:
   ['ABYSS_SHIELD_ECHO','TWO_BEAT_FOLLOWUP'].includes(mechanic)?2:mechanic==='DISTRIBUTED_CORAL_VOLLEY'?p.targets.length:1;
  const totalScale=mechanic==='ABYSS_SHIELD_ECHO'?1+c.focusBonusPercent/100:
   mechanic==='OBSERVED_SHIELD_BREAK'?1+c.armorReductionPercent/100:mechanic==='FINISHER_WITH_RELOAD'?1+c.finisherBonusPercent/100:1;
  const start=p.step||0,end=sequential?start+1:count;
  for(let index=start;index<end&&living(a);index++){
   let t=all().find(t=>t.id===(p.currentTarget||p.targets[0]));
   if(mechanic==='DANCING_TARGET_VOLLEY')t=weakest(enemies(a).filter(t=>t.id!==p.previousTarget))||weakest(enemies(a));
   if(mechanic==='DISTRIBUTED_CORAL_VOLLEY')t=all().find(t=>t.id===p.targets[index]);
   if(!living(t))t=targets(a,s)[0];
   if(!t){finish(a,s);return;}
   p.step=index;
   if(index>0&&t.id!==(p.currentTarget||p.targets[0]))send(a,s,'WINDUP',t,{targetIds:[t.id],continuation:true});
   p.currentTarget=t.id;p.previousTarget=t.id;
   let scale=1/count;
   if(mechanic==='SAME_TARGET_CALIBRATION'&&index===2)scale=1.4/count;
   if(mechanic==='ABYSS_SHIELD_ECHO'&&index===1)scale+=c.focusBonusPercent/100;
   if(mechanic==='OBSERVED_SHIELD_BREAK')scale=1+c.armorReductionPercent/100;
   if(mechanic==='FINISHER_WITH_RELOAD')scale=1+c.finisherBonusPercent/100;
   // 순차 사격은 한 행동에 한 발이라 발마다 상한 1개, 동시 사격은 한 행동 예산을 발끼리 나눈다.
   const h=strike(a,s,t,scale,'HIT',{followup:index>0,castShare:sequential?1:scale/totalScale,capShare:sequential?1/count:scale/totalScale,capCount:sequential?count:1});
   if(h.hit&&living(t)&&mechanic==='PLATINUM_FOCUS_LOCK'&&!(p.weakened?.has(t.id))){(p.weakened||=new Set()).add(t.id);table(debuffs,t).veil={percent:c.veilPercent};send(a,s,'DEBUFF',t,{effect:'OFFENSIVE_SKILL_ONLY'});}
  }
  if(sequential&&end<count&&enemies(a).length){p.step=end;p.due=a.actions+1;return;}
  finish(a,s);
 }
 function resolve(a,p){const s=p.skill,c=a.combat,st=state(a),ts=p.targets.map(id=>all().find(a=>a.id===id)).filter(living),b=table(buffs,a);
  // A weakest-target draw frequently loses its target to an allied attack
  // during preparation. Spend the already-paid strike on the next legal enemy
  // within this action, without another windup turn, cost or cooldown reset.
  if(!ts.length&&(isMercenaryMoonDrawSkill(s)||s.mechanic==='RIFT_MARK_DETONATION'&&p.step)){
   const replacement=targets(a,s)[0];
   if(replacement){p.targets=[replacement.id];ts.push(replacement);send(a,s,'WINDUP',replacement,{targetIds:p.targets,continuation:true,retargeted:true});}
  }
  if(!ts.length){cancel(a,'TARGET_LOST');return;}
  const once=(fn)=>{for(const t of ts)fn(t);finish(a,s);};
  switch(s.mechanic){
   case 'WHITE_OATH_GROUP_HEAL':{
    // A single cast owns one budget, including full-HP allies. Lost/overheal
    // shares are discarded, never copied or redistributed to another actor.
    const budget=Math.floor(mercenaryEffectiveAttack(a)*s.balance.damageRatio),share=Math.floor(budget/p.targets.length);
    const heals=ts.map(t=>{
     const reduction=Math.max(0,Math.min(100,Number(t.healingReductionPercent)||0));
     const amount=Math.max(0,Math.min(t.maxHp-t.hp,apocalypseHealing(t,Math.floor(share*(1-reduction/100)))));
     t.hp+=amount;a.healingDone+=amount;
     return {targetId:t.id,amount,targetHpAfter:t.hp,targetMaxHp:t.maxHp};
    });
    send(a,s,'GROUP_HEAL',null,{targetIds:heals.map(h=>h.targetId),heals,budget,amount:heals.reduce((n,h)=>n+h.amount,0)});
    finish(a,s);break;}
   case 'BLACK_MOON_TRIPLE_SEVER':{
    const damageScale=offensiveSkillScale(a,s);
    resolveHeukwolCombo({actor:a,skill:s,target:ts[0],hit,damage:(t,n)=>damage(t,interceptDamage(a,t,n)),knockout,emit,damageScale,capActions:mercenarySkillCapActions(a,s,false)*(a.battleMode==='PVP'?damageScale:1)});
    finish(a,s);break;}
   case BERKAN_MECHANIC:{
    const damageScale=offensiveSkillScale(a,s);
    resolveBerkanStarfall({actor:a,skill:s,targets:ts,hit,damage,knockout,emit,damageScale,capActions:mercenarySkillCapActions(a,s,false)*(a.battleMode==='PVP'?damageScale:1)});
    finish(a,s);break;}
   case 'CRYSTAL_CROWN':{
    const damageScale=offensiveSkillScale(a,s);
    resolveCryvernCrown({actor:a,skill:s,targets:p.targets.map(id=>all().find(t=>t.id===id)),hit,damage,knockout,emit,damageScale,capActions:mercenarySkillCapActions(a,s,false)*(a.battleMode==='PVP'?damageScale:1)});
    finish(a,s);break;}
   case 'PLATINUM_SANCTUARY':{
    const damageScale=offensiveSkillScale(a,s);
    resolveRagnielJudgment({actor:a,skill:s,targets:p.targets.map(id=>all().find(t=>t.id===id)),hit,damage,knockout,emit,damageScale,capActions:mercenarySkillCapActions(a,s,false)*(a.battleMode==='PVP'?damageScale:1)});
    finish(a,s);break;}
   case 'GOLDEN_ORCHID_VOLLEY':{
    const primary=all().find(t=>t.id===p.targets[0]);if(!living(primary)){cancel(a,'TARGET_LOST');break;}
    const damageScale=offensiveSkillScale(a,s);
    resolveMangisaVolley({actor:a,skill:s,targets:[primary,...ts.filter(t=>t!==primary)],hit,damage,knockout,emit,damageScale,capActions:mercenarySkillCapActions(a,s,false)*(a.battleMode==='PVP'?damageScale:1)});
    finish(a,s);break;}
   // Authored barrage tracers share one canonical hit, never one damage roll per visual shot.
   case 'LAVENDER_RICOCHET':case 'TIDAL_BARRAGE':once(t=>strike(a,s,t));break;
   case 'DUEL_OATH':once(t=>{if(strike(a,s,t).hit&&living(t)){table(debuffs,t).oath={actorId:a.id,percent:c.parryPercent,expires:t.actions+c.statusTurns};send(a,s,'DEBUFF',t,{effect:'DUEL_OATH'});}});break;
   case 'OBSERVED_SHIELD_BREAK':once(t=>{const h=strike(a,s,t);if(h.hit&&living(t)&&t.shield>0){const budget=Math.min(t.shield,Math.floor(mercenaryEffectiveAttack(a)*s.balance.damageRatio*c.armorReductionPercent/100)),result=damage(t,budget);a.damageDealt+=result.absorbed;send(a,s,'DEBUFF',t,{effect:'SHIELD_ONLY_BREAK',amount:result.absorbed,targetShieldAfter:t.shield});}});break;
   case 'WOUNDED_MOON_DRAW':once(t=>strike(a,s,t,1+(1-t.hp/t.maxHp)*c.finisherBonusPercent/100));break;
   case 'FRONT_STAND_FAST':once(t=>{table(buffs,t).standfast={actor:a,skill:s,percent:mercenaryWardPercent(c.interceptPercent),budget:Math.floor(mercenaryEffectiveAttack(a)*s.balance.damageRatio/p.targets.length),expires:a.actions+c.statusTurns};send(a,s,'BUFF',t,{effect:'FRONT_STAND_FAST'});});break;
   case 'THORN_RECOIL_SEAL':once(t=>{const h=strike(a,s,t,1-c.poisonPercent/100,'HIT',{capShare:1-c.poisonPercent/100});if(h.hit&&living(t)){table(debuffs,t).thorn={actor:a,skill:s,damage:Math.floor(mercenaryEffectiveAttack(a)*s.balance.damageRatio*c.poisonPercent/100),expires:t.actions+c.statusTurns};send(a,s,'DEBUFF',t,{effect:'THORN_RECOIL_SEAL'});}});break;
   case 'ABYSS_SHIELD_ECHO':{
    const t=ts[0];if(!p.step){const h=strike(a,s,t,.5);if(!h.hit||!living(t)){finish(a,s);break;}p.absorbed=Math.min(h.absorbed||0,Math.floor(mercenaryEffectiveAttack(a)*s.balance.damageRatio*c.focusBonusPercent/100));p.step=1;p.due=a.actions+1;}
    else{const base=mercenaryEffectiveAttack(a)*s.balance.damageRatio;strike(a,s,t,.5+(base>0?p.absorbed/base:0),'HIT',{followup:true});finish(a,s);}break;}
   case 'DANCING_TARGET_VOLLEY':{
    const t=ts[0],index=p.step||0;strike(a,s,t,1/3,'HIT',{followup:index>0});if(index>=2){finish(a,s);break;}
    const next=weakest(enemies(a).filter(e=>e.id!==t.id))||weakest(enemies(a));if(!next){finish(a,s);break;}
    p.step=index+1;p.targets=[next.id];p.due=a.actions+1;send(a,s,'WINDUP',next,{targetIds:[next.id],continuation:true});break;}
   case 'PLATINUM_FOCUS_LOCK':{
    const t=ts[0],index=p.step||0,h=strike(a,s,t,1/3,'HIT',{followup:index>0});p.allHit=(p.allHit!==false)&&h.hit;
    if(!living(t)||index>=2){if(living(t)&&p.allHit){table(debuffs,t).veil={percent:c.veilPercent};send(a,s,'DEBUFF',t,{effect:'OFFENSIVE_SKILL_ONLY'});}finish(a,s);}else{p.step=index+1;p.due=a.actions+1;}break;}
   case 'DISTRIBUTED_CORAL_VOLLEY':{
    const index=p.step||0,t=all().find(t=>t.id===p.targets[index]);if(living(t))strike(a,s,t,1/p.targets.length,'HIT',{followup:index>0});
    if(index+1>=p.targets.length)finish(a,s);else{p.step=index+1;p.due=a.actions+1;}break;}
   case 'INTERCEPT_ONE_HIT':once(t=>{table(buffs,t).intercept={actor:a,skill:s,percent:mercenaryWardPercent(c.interceptPercent),expires:t.actions+c.statusTurns};send(a,s,'BUFF',t,{effect:'INTERCEPT_ONE_HIT'});});break;
   case 'MELEE_PARRY_RIPOSTE':once(t=>{b.parry={skill:s,percent:c.parryPercent,expires:a.actions+c.statusTurns};send(a,s,'BUFF',t,{effect:'MELEE_PARRY_RIPOSTE'});});break;
   case 'NEXT_BASIC_ORDER':once(t=>{table(buffs,t).order={percent:c.orderPercent,source:a.id};send(a,s,'BUFF',t,{effect:'NEXT_BASIC_ORDER'});});break;
   case 'FRONT_SHARED_BARRIER':once(t=>{const buff=table(buffs,t),old=buff.mercBarrier||0,budget=Math.floor(mercenaryEffectiveAttack(a)*s.balance.damageRatio/p.targets.length),remaining=Math.min(old,t.shield);t.shield=Math.max(0,t.shield-remaining)+budget;t.maxShield=Math.max(t.maxShield,t.shield);buff.mercBarrier=budget;send(a,s,'BUFF',t,{effect:'SHIELD',amount:budget,targetShieldAfter:t.shield});});break;
   case 'FRONT_OFFENSE_VEIL':once(t=>{table(debuffs,t).veil={percent:c.veilPercent};send(a,s,'DEBUFF',t,{effect:'OFFENSIVE_SKILL_ONLY'});});break;
   case 'CLEANSE_THEN_MEND':
    if(!p.step){const removed=cleanse(ts[0],true);send(a,s,'CLEANSE',ts[0],{removed});p.step=1;p.due=a.actions+1;break;}
    once(t=>{const amount=apocalypseHealing(t,Math.min(t.maxHp-t.hp,Math.floor(mercenaryEffectiveAttack(a)*s.balance.damageRatio*(1-Math.min(100,Number(t.healingReductionPercent||0))/100))));t.hp+=amount;a.healingDone+=amount;send(a,s,'HEAL',t,{amount,targetHpAfter:t.hp,targetMaxHp:t.maxHp});});break;
   case 'BREAK_ARMOR_WINDOW':once(t=>{const hadShield=t.shield>0;strike(a,s,t);if(hadShield&&living(t)){const d=table(debuffs,t),original=d.armor?.original??t.defense;d.armor={original,expires:t.actions+c.statusTurns};t.defense=original*(1-c.armorReductionPercent/100);send(a,s,'DEBUFF',t,{effect:'ARMOR_WINDOW',defenseAfter:t.defense});}});break;
   case 'ADVANCE_SUPPRESSION':once(t=>{strike(a,s,t,1/p.targets.length);if(living(t)&&!t.controlImmune&&!t.isBoss&&t.row==='FRONT'&&t.attackStyle==='MELEE'){t.gauge=Math.max(0,t.gauge-c.suppressGauge);send(a,s,'DEBUFF',t,{effect:'APPROACH_DELAY',targetGaugeAfter:t.gauge});}});break;
   case 'EMERALD_ANTIMATERIEL':case 'LOCKED_THREAT_SHOT':once(t=>strike(a,s,t));break;
   case 'UNDISTURBED_FIRST_SHOT':once(t=>{const focused=state(a).hits===p.hits;send(a,s,'FOCUS',t,{focused});strike(a,s,t,focused?1+c.focusBonusPercent/100:1);});break;
   case 'FINISHER_WITH_RELOAD':once(t=>{strike(a,s,t,t.hp/t.maxHp<=c.finisherHpPercent/100?1+c.finisherBonusPercent/100:1);});break;
   case 'INTERRUPT_WINDUP':once(t=>{const h=strike(a,s,t);if(h.hit&&!t.controlImmune&&!t.isBoss&&state(t).pending)cancel(t,'INTERRUPTED');});break;
   // v2119: 제압이 기본 공격 한 번만 약화하고 끝나 제어형의 값어치가 거의 없었다.
   // 표식이 찼으면 지속 시간 동안 그 적의 기본 공격을 계속 약화하고,
   // 아직 안 찼으면 이번 사격으로 표식을 하나 쌓아 다음 시전이 헛돌지 않게 한다.
   case 'REPEAT_OFFENDER_RESTRAINT':once(t=>{const d=table(debuffs,t),marked=d.offender?.[a.id]||0,h=strike(a,s,t);if(!h.hit||!living(t))return;
    if(marked>=c.restraintHits){d.restraint={percent:c.restraintPercent,expires:t.actions+c.statusTurns};if(d.offender)delete d.offender[a.id];send(a,s,'DEBUFF',t,{effect:'BASIC_WEAKENED'});}
    else{(d.offender||={})[a.id]=marked+1;send(a,s,'DEBUFF',t,{effect:'OFFENDER_MARK'});}});break;
   case 'INFILTRATE_DELAYED_VENOM':once(t=>{const h=strike(a,s,t,1-c.poisonPercent/100,'HIT',{capShare:1-c.poisonPercent/100});if(h.hit&&living(t)&&!t.poisonImmune){table(debuffs,t).poison={actor:a,skill:s,damage:Math.floor(mercenaryEffectiveAttack(a)*s.balance.damageRatio*c.poisonPercent/100),due:t.actions+1};send(a,s,'DEBUFF',t,{effect:'POISON'});}});break;
   case 'RIFT_MARK_DETONATION':
    if(!p.step){for(const t of ts){const h=strike(a,s,t,.5/p.targets.length,'HIT',{capShare:.5});if(h.hit&&living(t))table(debuffs,t).rift={actorId:a.id};}p.step=1;p.due=a.actions+1;}
    else{const share=.5/p.targets.length,used=new Set(),ours=x=>table(debuffs,x).rift?.actorId===a.id;
     // v2119: 표식을 정화당한 대상의 몫은 그대로 사라진다(정화는 유효한 대응이다).
     // 표식을 단 채 먼저 쓰러진 대상의 몫만 남은 전열 적에게 옮겨 터뜨린다.
     for(const id of p.targets){let t=all().find(x=>x.id===id);
      if(living(t)){if(!ours(t))continue;delete table(debuffs,t).rift;}
      else{const rest=targets(a,s).filter(x=>living(x)&&!used.has(x.id));t=rest.find(ours)||rest[0];}
      if(!living(t)||used.has(t.id))continue;used.add(t.id);if(ours(t))delete table(debuffs,t).rift;
      strike(a,s,t,share,'HIT',{followup:true,capShare:.5});}
     finish(a,s);}break;
   case 'TWO_BEAT_FOLLOWUP':case 'SAME_TARGET_CALIBRATION':{
    const total=s.mechanic==='SAME_TARGET_CALIBRATION'?3:2,index=p.step||0,t=ts[0];const h=strike(a,s,t,(total===3&&index===2?1.4:1)/total,'HIT',{followup:index>0});
    if(!h.hit||!living(t)||index+1>=total)finish(a,s);else{p.step=index+1;p.due=a.actions+1;}break;}
   default:throw Error(`UNSUPPORTED_MERCENARY_MECHANIC:${s.mechanic}`);
  }
 }
 for(const a of all()){a.openingAttack=mercenaryEffectiveAttack(a);if(a.isMercenary)state(a);}
 return {
  beforeAction(a,{healingAllowed=true}={}){
   for(const actor of all())if(!living(actor)&&state(actor).pending)cancel(actor,'CASTER_LOST');
   const d=table(debuffs,a),st=state(a),b=table(buffs,a);
   for(const key of ['thorn','oath'])if(d[key]&&a.actions>=d[key].expires)delete d[key];
   if(d.armor&&a.actions>=d.armor.expires){a.defense=d.armor.original;delete d.armor;}
   if(d.poison&&a.actions>=d.poison.due){const p=d.poison;delete d.poison;effect(p.actor,p.skill,a,p.damage,'DOT');if(!living(a))return true;}
   if(b.parry&&a.actions>=b.parry.expires)delete b.parry;
   if(!a.isMercenary)return false;
   if(!living(a))return true;
   if(apocalypseSealed(a)){if(st.pending)cancel(a,'APOCALYPSE_SEALED');return false;}
   if(a.stunned||a.silenced){if(st.pending)cancel(a,'CONTROLLED');return Boolean(a.stunned);}
   if(st.pending){if(a.silenced||a.stunned){cancel(a,'CONTROLLED');return true;}st.cancelled=false;if(a.actions>=st.pending.due){if(isRangedMercenarySkill(a,st.pending.skill))resolveRanged(a,st.pending);else resolve(a,st.pending);}return !st.cancelled;}
   const skills=a.skills||[];for(let i=0;i<skills.length;i++){const index=(st.nextIndex+i)%skills.length,s=skills[index],ranged=isRangedMercenarySkill(a,s);if(st.cooldown.get(s.id)>a.actions||st.energy<s.balance.cost||s.mechanic==='UNDISTURBED_FIRST_SHOT'&&st.used.has(s.id))continue;
    if(s.mechanic==='WHITE_OATH_GROUP_HEAL'&&!healingAllowed)continue;
    if(isMercenaryGuardSkill(s)&&friendly(a).some(t=>activeIntercept(t)?.actor.id===a.id))continue;
    const selected=targets(a,s);if(!selected.length)continue;
    st.energy-=s.balance.cost;st.cooldown.set(s.id,a.actions+Math.max(1,s.balance.cooldownTurns));st.used.add(s.id);st.nextIndex=(index+1)%skills.length;st.pending={skill:s,targets:selected.map(t=>t.id),due:a.actions+a.combat.windupTurns,hits:st.hits,step:0};
    // v2119: 모든 용병 스킬은 시전한 그 행동에서 해결한다(준비만 하는 행동 없음).
    st.cancelled=false;send(a,s,'WINDUP',selected[0],{targetIds:st.pending.targets,energyAfter:st.energy});
    if(ranged)resolveRanged(a,st.pending);
    else if(isMercenarySupportSkill(s)){resolve(a,st.pending);st.guardBasicAction=a.actions;return false;}
    else resolve(a,st.pending);
    return !st.cancelled;
   }return false;
  },
  basicMultiplier(a){const b=table(buffs,a),d=table(debuffs,a);let factor=state(a).guardBasicAction===a.actions?MERCENARY_GUARD_BASIC_SCALE:1;if(b.order){factor*=1+b.order.percent/100;delete b.order;}if(d.restraint){if(a.actions<d.restraint.expires)factor*=1-d.restraint.percent/100;else delete d.restraint;}return factor*tierScale(a);},
  basicDamageCapScale(a){return tierScale(a)*mercenaryPvpTierOffense(a);},
  beforeBasicDamage(a,t,amount){const buff=table(buffs,t),d=table(debuffs,a);
   if(d.oath){const oath=d.oath;delete d.oath;if(oath.actorId===t.id&&a.actions<oath.expires)amount=Math.floor(amount*(1-oath.percent/100));}
   if(buff.standfast){const ward=buff.standfast;delete buff.standfast;if(living(ward.actor)&&ward.actor.actions<ward.expires){const saved=Math.min(ward.budget,Math.floor(amount*ward.percent/100));amount-=saved;send(ward.actor,ward.skill,'BUFF',t,{effect:'STAND_FAST_CONSUMED',amount:saved});}}

   amount=interceptDamage(a,t,amount);
   if(buff.parry&&a.row==='FRONT'&&a.attackStyle==='MELEE'&&!a.counterImmune){const parry=buff.parry;delete buff.parry;amount=Math.floor(amount*(1-parry.percent/100));state(t).riposte={skill:parry.skill,target:a};}
   return amount;
  },
  onDamage(t,result){if(result.hpDamage+result.absorbed>0)state(t).hits++;const b=table(buffs,t);if(b.mercBarrier)b.mercBarrier=Math.max(0,b.mercBarrier-result.absorbed);},
  afterBasic(a,t,hit,{additional=false}={}){if(hit&&!additional){if(a.isMercenary&&state(a).guardBasicAction!==a.actions)state(a).energy=Math.min(a.combat.energyMax,state(a).energy+a.combat.energyPerBasic);const d=table(debuffs,a);d.offender||={};for(const enemy of enemies(a).filter(e=>e.isMercenary&&e.skills?.some(s=>s.mechanic==='REPEAT_OFFENDER_RESTRAINT')))d.offender[enemy.id]=Math.min(10,(d.offender[enemy.id]||0)+1);}
   if(hit&&!additional){const d=table(debuffs,a),thorn=d.thorn;if(thorn){delete d.thorn;if(living(thorn.actor)&&living(a)&&a.actions<thorn.expires)effect(thorn.actor,thorn.skill,a,thorn.damage,'DOT');}}
   const r=state(t).riposte;delete state(t).riposte;if(r&&living(t)&&living(r.target))strike(t,r.skill,r.target,1,'RIPOSTE',{followup:true});
  },cleanse,cancel,state,buffs,debuffs,
 };
}
