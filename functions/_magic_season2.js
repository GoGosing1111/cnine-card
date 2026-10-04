import {MAGIC_S2_RULES,magicS2Card,magicS2Params,MAGIC_S2_MIRROR_ALLOW} from '../shared/magic-season2-v1.mjs';
import {iconHealingAmount} from '../shared/icon-roles-v1.mjs';
const living=a=>a&&a.alive!==false&&a.hp>0;
const regular=a=>a&&!a.isMercenary&&!a.isMonster&&!a.isBattleSuit&&a.actorKind!=='BATTLE_SUIT'&&!a.isEscortObjective;
const order=(a,b)=>a.slot-b.slot||String(a.id).localeCompare(String(b.id));
const n=v=>Math.max(0,Math.floor(Number(v)||0)),pct=(v,p)=>Math.floor(n(v)*p/100);

// Mutates the SAME canonical fighters as V2/V3. No independent combat, RNG,
// reward, timer, HP authority or database writes. Constructed by server symbol only.
export function createMagicSeason2Runtime({teams,loadouts,emit,rawDamage,knockout,spendHeal,magicCap,sealed=()=>false,cleanse=()=>{},isHealingAllowed=()=>true}){
 const states=[],teamUses=new Map(),marks=new Map(),retreat=new Map(),armor=new Map(),anti=new Map(),processedDeaths=new Set(),seenMirror=new Set();
 const all=()=>[...teams.A,...teams.B],friends=a=>teams[a.side],enemies=a=>teams[a.side==='A'?'B':'A'];
 for(const side of ['A','B']){
  const slots=new Set(),codes=new Set();
  for(const card of loadouts[side]||[]){
   const code=card.effectType||card.code;if(!MAGIC_S2_RULES[code])continue;
   const normalized=magicS2Card(code,Number(card.slotNo),Number(card.enhancementLevel||0));
   if(slots.has(normalized.slotNo)||codes.has(code))throw Error('DUPLICATE_MAGIC_S2_LOADOUT');slots.add(normalized.slotNo);codes.add(code);
   const actor=teams[side][normalized.slotNo-1];if(!regular(actor))throw Error('MAGIC_S2_REQUIRES_REGULAR_CARD');
   states.push({card:{...normalized,id:card.id},actor,rule:MAGIC_S2_RULES[code],p:magicS2Params(code,normalized.enhancementLevel),uses:0,attacks:0,record:0,targetId:null});
  }
 }
 const key=s=>s.actor.side+':'+s.card.code;
 const available=(s,{dead=false}={})=>(dead||living(s.actor))&&!sealed(s.actor)&&!(s.rule.pvpOnly&&s.actor.battleMode!=='PVP')&&(s.rule.team?(teamUses.get(key(s))||0):s.uses)<s.rule.uses;
 const blocked=s=>{
  if(sealed(s.actor))return true;
  if(!(s.actor.magicSealCharges>0))return false;
  s.actor.magicSealCharges--;
  emit('MAGIC_SEAL_BLOCK',{actorId:s.actor.magicSealSourceId||'',targetId:s.actor.id,magicCode:s.card.code,magicName:s.card.name,effectType:s.card.code,label:'봉인의 칙령 · 발동 봉인'});
  if(!s.actor.magicSealCharges)s.actor.magicSealSourceId='';return true;
 };
 const consume=s=>{s.uses++;if(s.rule.team)teamUses.set(key(s),(teamUses.get(key(s))||0)+1);};
 const candidates=(side,code,options)=>states.filter(s=>s.actor.side===side&&s.card.code===code&&available(s,options)).sort((a,b)=>order(a.actor,b.actor));
 const event=(s,target,phase,data={})=>emit('MAGIC_SEASON2',{actorId:s.actor.id,targetId:target?.id,magicCode:s.card.code,magicName:s.card.name,magicImageUrl:s.card.imageUrl,magicEnhancementLevel:s.card.enhancementLevel,effectType:s.card.code,phase,activation:s.uses,maxActivations:s.rule.uses,label:s.card.name,...data});
 const status=(s,target,kind,remaining)=>event(s,target,'STATUS',{statusKind:kind,remaining,targetHpAfter:target.hp,targetShieldAfter:target.shield});
 function extraDamage(s,target,amount,phase,{ignoreShield=false,...meta}={}){
  if(!living(target)||target.invulnerable||target.untargetable)return null;
  const approved=n(magicCap(target,amount));if(!approved)return null;
  const result=rawDamage(target,approved,{ignoreShield});s.actor.damageDealt+=result.hpDamage+result.absorbed;
  event(s,target,phase,{damage:result.hpDamage,absorbed:result.absorbed,targetHpAfter:target.hp,targetMaxHp:target.maxHp,targetShieldAfter:target.shield,...meta});
  knockout(target);return result;
 }
 function open(){
  for(const side of ['A','B']){
   const s=candidates(side,'S2_ECLIPSE_PROPHECY')[0];
   const target=s&&enemies(s.actor).filter(living).sort((a,b)=>b.attack-a.attack||order(a,b))[0];
   if(target&&!blocked(s)){consume(s);marks.set(side,{s,targetId:target.id,hits:s.rule.hits});status(s,target,'ECLIPSE',s.rule.hits);}
   for(const code of ['S2_CONTRACT_EROSION','S2_COMMAND_SEVERANCE']){
    const owner=candidates(side,code)[0],merc=owner&&enemies(owner.actor).filter(t=>living(t)&&t.isMercenary&&!t.controlImmune&&!t.isBoss).sort(order)[0];
    if(!merc||blocked(owner))continue;consume(owner);const buffs=anti.get(merc.id)||{};
    buffs[code]={s:owner,remaining:owner.rule.actions};anti.set(merc.id,buffs);status(owner,merc,code,owner.rule.actions);
   }
  }
 }
 const defenseOptions=target=>armor.has(target.id)?{s2DefenseReduction:armor.get(target.id).percent/100}:{};
 function beforeAttack(actor,target){
  const s=states.find(s=>s.actor===actor&&s.card.code==='S2_CAUSAL_SEVER');
  const options=defenseOptions(target);
  if(!s||!available(s))return options;
  s.attacks++;if(s.attacks%s.rule.every||blocked(s)||target.invulnerable||target.untargetable)return options;
  consume(s);event(s,target,'PIERCE_READY',{attackNumber:s.attacks,ignoreDefense:s.p.ignore,pierce:s.p.pierce});
  return {...options,s2CannotDodge:true,s2DefenseIgnore:s.p.ignore/100,s2ShieldPierce:target.isApocalypse?0:s.p.pierce/100};
 }
 function beforeDamage(target,amount,options={}){
  let value=n(amount);const actor=options.actor;
  if(actor?.isMercenary){const d=anti.get(actor.id)?.S2_CONTRACT_EROSION;if(d?.remaining>0)value-=pct(value,d.s.p.reduction);}
  if(options.direct){
   const protect=retreat.get(target.id);if(protect?.hits>0){value-=pct(value,protect.percent);protect.hits--;status(protect.s,target,'RETREAT',protect.hits);}
   const debuff=anti.get(target.id)?.S2_COMMAND_SEVERANCE;
   if(debuff?.remaining>0)value+=n(magicCap(target,pct(value,debuff.s.p.vulnerability)));
  }
  return value;
 }
 function beforeHpDamage(target,amount,options={}){
  if(!options.direct||!regular(target)||!living(target)||amount<target.hp)return amount;
  const s=candidates(target.side,'S2_FATE_INTERCEPT').find(s=>s.actor!==target);
  if(!s||blocked(s))return amount;consume(s);const kept=target.hp-1,excess=amount-kept,transferred=excess-pct(excess,s.p.mitigation);
  const result=rawDamage(s.actor,transferred,{ignoreShield:true});
  event(s,target,'INTERCEPT',{protectedHpAfter:1,targetHpAfter:1,targetMaxHp:target.maxHp,targetShieldAfter:target.shield,transferred:result.hpDamage,requestedTransfer:transferred,mitigated:excess-transferred,
   targets:[{targetId:s.actor.id,hpAfter:s.actor.hp,maxHp:s.actor.maxHp,shieldAfter:s.actor.shield}]});
  if(s.actor.hp<=0)knockout(s.actor,{finalOnly:true});
  return kept;
 }
 function healed(target,approved,actual){
  if(!regular(target)||!living(target)||approved<=actual)return;
  const s=candidates(target.side,'S2_OVERHEAL_FORGE')[0];if(!s)return;
  const cap=pct(target.maxHp,s.p.cap),remaining=Math.max(0,cap-n(target.s2ForgeShield)),amount=Math.min(remaining,pct(approved-actual,s.p.conversion));
  if(!amount||blocked(s))return;consume(s);target.s2ForgeShield=n(target.s2ForgeShield)+amount;target.shield+=amount;target.maxShield=Math.max(target.maxShield,target.shield);
  event(s,target,'OVERHEAL',{amount,approvedHeal:approved,actualHeal:actual,shieldGain:amount,targetHpAfter:target.hp,targetShieldAfter:target.shield});
 }
 function heal(target,requested,{allowOvertime=false}={}){
  if(!living(target)||!allowOvertime&&!isHealingAllowed())return 0;
  const approved=n(spendHeal(target.side,iconHealingAmount(target,n(requested)))),actual=Math.min(approved,Math.max(0,target.maxHp-target.hp));
  target.hp+=actual;healed(target,approved,actual);return actual;
 }
 function afterDamage(target,result,options={}){
  if(target.s2ForgeShield)target.s2ForgeShield=Math.max(0,target.s2ForgeShield-result.absorbed);
  const weak=armor.get(target.id);if(weak&&options.direct&&result.hpDamage+result.absorbed>0){weak.hits--;if(!weak.hits)armor.delete(target.id);}
 }
 function afterAttack(actor,target,result){
  const mark=marks.get(actor.side);
  if(mark&&mark.targetId===target.id&&mark.hits>0&&regular(actor)&&result.hpDamage+result.absorbed>0){
   mark.hits--;extraDamage(mark.s,target,pct(result.hpDamage+result.absorbed,mark.s.p.bonus),'ECLIPSE_HIT',{remaining:mark.hits});
  }
  const s=states.find(s=>s.actor===actor&&s.card.code==='S2_SHIELD_LEDGER'&&available(s));
  if(s){
   if(s.targetId!==target.id){s.targetId=target.id;s.record=0;}
   if(result.absorbed>0){s.record=Math.min(pct(actor.attack,200),s.record+pct(result.absorbed,s.p.record));
    event(s,target,'LEDGER_RECORD',{record:s.record,cap:pct(actor.attack,200)});
    if(result.shieldBefore>0&&result.shieldAfter<=0&&s.record>0&&!blocked(s)){consume(s);armor.set(target.id,{hits:2,percent:s.p.breakDefense});
     extraDamage(s,target,pct(s.record,60),'LEDGER_BREAK',{ignoreShield:true,defenseReduction:s.p.breakDefense,remaining:2});}
   }
  }
 }
 function settle(){
  for(const side of ['A','B']){
   const newly=teams[side].filter(t=>regular(t)&&!living(t)&&!processedDeaths.has(t.id));
   if(newly.length){
    newly.forEach(t=>processedDeaths.add(t.id));const s=candidates(side,'S2_FALLEN_STAR',{dead:true})[0];
    const survivors=teams[side].filter(t=>regular(t)&&living(t));
    if(s&&survivors.length&&!blocked(s)){consume(s);for(const t of survivors){t.attack+=pct(t.attack,s.p.attack);t.gauge=Math.min(95,t.gauge+s.p.gauge);}
     event(s,survivors[0],'FALLEN_STAR',{deadIds:newly.map(t=>t.id),targets:survivors.map(t=>({targetId:t.id,attackAfter:t.attack,gaugeAfter:t.gauge,hpAfter:t.hp,maxHp:t.maxHp}))});}
   }
   const mark=marks.get(side);
   if(mark&&mark.hits>0&&!living(all().find(t=>t.id===mark.targetId))){const next=enemies(mark.s.actor).filter(living).sort((a,b)=>b.attack-a.attack||order(a,b))[0];
    if(next){mark.targetId=next.id;status(mark.s,next,'ECLIPSE',mark.hits);}else marks.delete(side);}
   const s=candidates(side,'S2_CONSTELLATION_SHIFT')[0];if(!s)continue;
   const front=teams[side].filter(t=>regular(t)&&living(t)&&t.row==='FRONT'&&t.hp/t.maxHp<=.35).sort((a,b)=>a.hp/a.maxHp-b.hp/b.maxHp||order(a,b))[0];
   const back=front&&teams[side].filter(t=>regular(t)&&living(t)&&t.row==='BACK'&&t.hp/t.maxHp>front.hp/front.maxHp&&!t.formationLocked).sort((a,b)=>b.hp/b.maxHp-a.hp/a.maxHp||order(a,b))[0];
   if(!front||front.formationLocked||!back||blocked(s))continue;
   consume(s);[front.row,back.row]=[back.row,front.row];[front.slot,back.slot]=[back.slot,front.slot];front.gauge=Math.min(95,front.gauge+s.p.gauge);
   retreat.set(front.id,{s,hits:2,percent:s.p.reduction});
   event(s,front,'FORMATION_SWAP',{swapTargetId:back.id,remaining:2,targets:[front,back].map(t=>({targetId:t.id,slot:t.slot,row:t.row,hpAfter:t.hp,maxHp:t.maxHp,gaugeAfter:t.gauge}))});
  }
 }
 function observeMagic(original){
  if(original.type!=='MAGIC_CARD'||original.copied||!MAGIC_S2_MIRROR_ALLOW.includes(original.effectType))return;
  const origin=all().find(t=>t.id===original.actorId);if(!origin||origin.battleMode!=='PVP')return;
  for(const s of candidates(origin.side==='A'?'B':'A','S2_ARCANE_MIRROR')){
   const receipt=s.actor.id+':'+original.seq;if(seenMirror.has(receipt)||blocked(s))continue;
   const target=enemies(s.actor).filter(living).sort(order)[0];if(!target)continue;
   const scale=v=>pct(v,s.p.efficiency),type=original.effectType;
   const meta={copied:true,sourceEventSeq:original.seq,sourceActorId:origin.id,copiedEffect:type};let applied=false;
   if(['PUNISH_TRAP','ARCANE_COUNTER','CHAIN_ECHO'].includes(type)){
    const amount=scale(n(original.damage)+n(original.absorbed));if(amount){consume(s);extraDamage(s,target,amount,'MIRROR',meta);applied=true;}
   }else if(['CRISIS_HEAL','PURIFY_LIGHT'].includes(type)){
    if(!isHealingAllowed())continue;
    if(type==='PURIFY_LIGHT'){s.actor.magicSealCharges=0;s.actor.magicSealSourceId='';s.actor.doomMarks=0;s.actor.timeDistortionStacks=0;cleanse(s.actor);}
    const amount=heal(s.actor,scale(original.amount));s.actor.healingDone+=amount;
    if(amount>0||type==='PURIFY_LIGHT'){consume(s);event(s,s.actor,'MIRROR',{...meta,amount,targetHpAfter:s.actor.hp,targetMaxHp:s.actor.maxHp,targetShieldAfter:s.actor.shield});applied=true;}
   }else if(type==='FOLLOWUP_HASTE'){
    const before=s.actor.gauge;s.actor.gauge=Math.min(95,before+scale(original.value));if(s.actor.gauge>before){consume(s);event(s,s.actor,'MIRROR',{...meta,gaugeAfter:s.actor.gauge});applied=true;}
   }else if(type==='TIME_DISTORTION'){
    const amount=Math.min(target.gauge,scale(original.gaugeLoss));if(amount>0){target.gauge-=amount;consume(s);event(s,target,'MIRROR',{...meta,gaugeLoss:amount,gaugeAfter:target.gauge});applied=true;}
   }else if(type==='SHIELD_SIPHON'){
    const amount=Math.min(target.shield,n(magicCap(target,scale(original.shieldStolen),.25)));
    if(amount>0){target.shield-=amount;s.actor.shield+=amount;s.actor.maxShield=Math.max(s.actor.maxShield,s.actor.shield);consume(s);event(s,target,'MIRROR',{...meta,shieldStolen:amount,targetShieldAfter:target.shield,actorShieldAfter:s.actor.shield});applied=true;}
   }
   if(applied)seenMirror.add(receipt);
  }
 }
 function skillBlocked(actor){const d=anti.get(actor.id)?.S2_COMMAND_SEVERANCE;if(!d||d.remaining<=0)return false;event(d.s,actor,'SKILL_BLOCK',{remaining:d.remaining});return true;}
 function endAction(actor){
  const debuffs=anti.get(actor.id);if(debuffs)for(const [code,d] of Object.entries(debuffs)){if(d.remaining>0){d.remaining--;status(d.s,actor,code,d.remaining);if(!d.remaining)delete debuffs[code];}}
  settle();
 }
 function cleanseTarget(target){const debuffs=anti.get(target.id);if(debuffs)for(const [code,d] of Object.entries(debuffs))status(d.s,target,code,0);const had=anti.has(target.id)||armor.has(target.id);anti.delete(target.id);armor.delete(target.id);return had;}
 return {open,beforeAttack,defenseOptions,beforeDamage,beforeHpDamage,afterDamage,afterAttack,heal,settle,observeMagic,skillBlocked,endAction,cleanse:cleanseTarget,hasDebuff:target=>anti.has(target.id)||armor.has(target.id),
  snapshot:()=>({states:states.map(s=>({code:s.card.code,actorId:s.actor.id,uses:s.uses,attacks:s.attacks})),teamUses:Object.fromEntries(teamUses)})};
}
