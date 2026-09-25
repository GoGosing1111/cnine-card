import {preloadSniperOrikkung,playSniperOrikkungSkill,playSniperOrikkungBasic} from './SniperOrikkungCombatPlayback.js';
import {CRYVERN_CODE} from '../../../../shared/mercenary-cryvern-v1.mjs';
import {preloadCryvern,setupCryvernActor,clearCryvernActors,cancelCryvernPlayback,playCryvernCrown,playCryvernBasic,showCryvernShieldImpact} from './CryvernCombatPlayback.js';
import {preloadHeukwol,playHeukwolCombo,playHeukwolBasic} from './HeukwolCombatPlayback.js';
import {preloadBikiniJoeun,playBikiniJoeunSkill,playBikiniJoeunBasic} from './BikiniJoeunCombatPlayback.js';
import {Assets} from 'pixi.js';
import {BattleCharacter,TEAM,CHARACTER_STATE} from './BattleCharacter.js';
import {createMercenaryBattleArtAdapter} from '../../../../js/project-v-mercenary-battle-art-adapter-v1.js';
import {skillById} from '../../../../shared/mercenary-skills-v1.mjs';
import {MercenarySkillFX} from '../../../project-v-mercenary-system-v1/source/MercenarySkillFX.js';
import {loadSequence,loadAuxiliary,releaseFrameViews} from '../../../project-v-mercenary-system-v1/source/MercenarySpriteSequence.js';
import {attachMercenaryArt} from '../../../project-v-mercenary-system-v1/source/MercenaryAttachmentPoints.js';
import {getMercenaryAudio} from '../../../project-v-mercenary-system-v1/source/MercenarySkillAudio.js';
import {MERCENARY_ROLE_ATTACKS,preloadMercenaryRole,playMercenaryRoleAttack} from './MercenaryRoleAttackFX.js';
import {SKILL_CHIP_CLOCK} from '../../../../shared/battle-suit-skill-chips.mjs';
import {playMangisaVolley,preloadMangisaVolley} from './MangisaCombatPlayback.js';
import {playRagnielJudgment,playRagnielBasic,preloadRagniel} from './RagnielCombatPlayback.js';
const json=async url=>{const r=await fetch(url);if(!r.ok)throw Error(`MERCENARY_ASSET:${r.status}`);return r.json();};
let rosterPromise,atlasPromise;
export const withMercenaryBattle=Base=>class extends Base{
 constructor(options){super(options);this.mercenaries=[];this.mercenarySequences=new Map();this.mercenaryLoads=new Map();this.mercenaryHitIndices=new Map();this.mercenaryFx=null;}
 cancelTimelines(){this.mercenaryAudio?.stop();cancelCryvernPlayback(this);super.cancelTimelines();}
 syncTargetShield(target,value,maxValue=null){const before=target?.shield,result=super.syncTargetShield(target,value,maxValue);showCryvernShieldImpact(this,target,before,target?.shield);return result;}
 normalAttack(index,options){
  if(options?.attacker?.isMercenary&&options.attacker.cardId==='V-050')return playSniperOrikkungBasic(this,options);
  if(options?.attacker?.isMercenary&&options.attacker.cardId===CRYVERN_CODE)return playCryvernBasic(this,options);
  if(options?.attacker?.isMercenary&&options.attacker.cardId==='V-048')return playHeukwolBasic(this,options);
  if(options?.attacker?.isMercenary&&options.attacker.cardId==='V-047')return playBikiniJoeunBasic(this,options);
  if(options?.attacker?.isMercenary&&options.attacker.cardId==='V-046')return playRagnielBasic(this,options);
  if(options?.attacker?.isMercenary&&MERCENARY_ROLE_ATTACKS[options.attacker.role])return playMercenaryRoleAttack(this,options);
  return super.normalAttack(index,options);
 }
 clearMercenaryActors(){this.mercenaryEpoch=(this.mercenaryEpoch||0)+1;this.cancelTimelines?.();clearCryvernActors(this);this.mercenaryFx?.destroy();this.mercenaryFx=null;for(const a of this.mercenaries||[]){this.characters=this.characters.filter(c=>c!==a);a.destroy();}this.mercenaries=[];this.setFormationMercenaries([]);}
 async applyBattlePayload(payload){
  this.clearMercenaryActors();const epoch=this.mercenaryEpoch,result=await super.applyBattlePayload(payload);const entries=['A','B'].flatMap(side=>(payload?.battleV2?.teams?.[side]?.mercenaries||[]).map(card=>({side,card})));
  const limit=payload?.battleV2?.rules?.formation==='DUO_TWO_SQUADS'?2:1;
  if(!entries.length)return result;if(entries.filter(e=>e.side==='A').length>limit||entries.filter(e=>e.side==='B').length>limit)throw Error('MAX_ONE_MERCENARY_PER_SIDE');
  if(entries.some(({card})=>card.cardId==='V-050'||card.code==='V-050'||card.skills?.some(s=>s.mechanic==='EMERALD_ANTIMATERIEL')))await preloadSniperOrikkung();
  if(entries.some(({card})=>card.cardId===CRYVERN_CODE||card.code===CRYVERN_CODE||card.skills?.some(s=>s.mechanic==='CRYSTAL_CROWN')))await preloadCryvern();
  if(entries.some(({card})=>card.cardId==='V-048'||card.code==='V-048'||card.skills?.some(s=>s.mechanic==='BLACK_MOON_TRIPLE_SEVER')))await preloadHeukwol();
  if(entries.some(({card})=>card.cardId==='V-047'||card.code==='V-047'||card.skills?.some(s=>s.mechanic==='LAVENDER_RICOCHET')))await preloadBikiniJoeun();
  if(entries.some(({card})=>card.skills?.some(s=>s.mechanic==='GOLDEN_ORCHID_VOLLEY')))await preloadMangisaVolley();
  if(entries.some(({card})=>card.cardId==='V-046'||card.code==='V-046'||card.skills?.some(s=>s.mechanic==='PLATINUM_SANCTUARY')))await preloadRagniel();
  if(epoch!==this.mercenaryEpoch||this.mercenaryDisposed)return false;
  const roster=await (rosterPromise||=json('/assets/ui/project-v/mercenaries/mercenary-system-roster-v1.json?sniperOrikkung=20260926')),adapter=createMercenaryBattleArtAdapter(roster);
  for(const {side,card}of entries){const art=adapter.resolveForConsumer('BATTLE_FIELD',card.code||card.cardId);if(!art)throw Error('MERCENARY_SD_NOT_READY');
   const [sd,original]=await Promise.all([Assets.load(art.spriteUrl),Assets.load('/'+art.sourceArt.replace(/^\//,'')),MERCENARY_ROLE_ATTACKS[card.role]?preloadMercenaryRole(card.role):null]);
   if(epoch!==this.mercenaryEpoch||this.mercenaryDisposed)return false;
   const a=new BattleCharacter({id:card.id,name:card.name||card.title,team:side==='A'?TEAM.ALLY:TEAM.ENEMY,fullBodyTexture:sd,texture:original,cutInTexture:original,fullBodyHeight:card.cardId==='V-048'?300:['V-046',CRYVERN_CODE].includes(card.cardId)?380:card.cardId==='V-047'?320:260,x:0,y:0,scale:.5,hp:card.hp/card.maxHp*100});
   Object.assign(a,{cardId:card.cardId,ownerId:card.ownerId,ownerName:card.ownerName,squadIndex:card.squadIndex,art,actorKind:'MERCENARY',isMercenary:true,battleActive:true,enabled:true,serverMaxHp:card.maxHp,serverMaxShield:card.maxShield||0,startingShield:card.shield||0,startingMaxShield:card.maxShield||0,mercenaryRow:card,role:card.role});
   a.fullBodySprite.anchor.set(art.footAnchor.x,art.footAnchor.y);attachMercenaryArt(a,art);a.setShield(card.shield||0,card.maxShield||0);a.root.alpha=1;a.root.visible=card.hp>0;this.combatLayer.addChild(a.root);this.characters.push(a);this.mercenaries.push(a);
  }
  this.setFormationMercenaries(this.mercenaries);for(const a of this.mercenaries){a.formationHudY=-(a.fullBodyHeight*.98+88);a.hud.y=a.formationHudY;}this.sortCombatDepth();
  await Promise.all(this.mercenaries.filter(a=>a.cardId===CRYVERN_CODE).map(a=>setupCryvernActor(this,a)));return result;
 }
 syncFinalState(final={}){const out=super.syncFinalState(final);for(const a of this.mercenaries){const side=a.team===TEAM.ALLY?'A':'B',row=final.mercenaries?.[side]?.find(c=>c.id===a.id);if(!row)continue;a.serverMaxHp=row.maxHp;a.setState(row.hp>0?CHARACTER_STATE.IDLE:CHARACTER_STATE.DEAD);a.setHp(Math.max(0,row.hp)/Math.max(1,row.maxHp)*100);a.setShield(row.shield||0,row.maxShield||0);a.enabled=row.hp>0;a.root.visible=a.enabled;}this.sortCombatDepth();return out;}
 async sequenceFor(skillId){
  if(this.mercenarySequences.has(skillId))return this.mercenarySequences.get(skillId);
  if(!this.mercenaryLoads.has(skillId))this.mercenaryLoads.set(skillId,(async()=>{
   const manifest=await (atlasPromise||=json('/preview/project-v-mercenary-system-v1/skill-assets-v2/manifest.json?v=20260926-sniper-orikkung')),row=manifest.images.find(r=>r.skillId===skillId);if(!row)throw Error('MERCENARY_SEQUENCE_NOT_READY');
   const sequence=await loadSequence(row);if(this.mercenaryDisposed){releaseFrameViews(sequence);return null;}
   this.mercenarySequences.set(skillId,sequence);return sequence;
  })().finally(()=>this.mercenaryLoads.delete(skillId)));
  return this.mercenaryLoads.get(skillId);
 }
 async playMercenaryEvent(event){
  if(event.type==='MERCENARY_HIT'&&event.mechanic==='EMERALD_ANTIMATERIEL')return playSniperOrikkungSkill(this,event);
  if(event.type==='MERCENARY_WINDUP'&&event.mechanic==='EMERALD_ANTIMATERIEL')return true;
  if(event.type==='MERCENARY_CRYSTAL_CROWN'&&event.mechanic==='CRYSTAL_CROWN')return playCryvernCrown(this,event);
  if(event.type==='MERCENARY_WINDUP'&&event.mechanic==='CRYSTAL_CROWN')return true;
  if(event.type==='MERCENARY_COMBO'&&event.mechanic==='BLACK_MOON_TRIPLE_SEVER')return playHeukwolCombo(this,event);
  if(event.type==='MERCENARY_WINDUP'&&event.mechanic==='BLACK_MOON_TRIPLE_SEVER')return true;
  if(event.type==='MERCENARY_HIT'&&event.mechanic==='LAVENDER_RICOCHET')return playBikiniJoeunSkill(this,event);
  if(event.type==='MERCENARY_WINDUP'&&event.mechanic==='LAVENDER_RICOCHET')return true;
  if(event.type==='MERCENARY_JUDGMENT'&&event.mechanic==='PLATINUM_SANCTUARY')return playRagnielJudgment(this,event);
  if(event.type==='MERCENARY_WINDUP'&&event.mechanic==='PLATINUM_SANCTUARY')return true;
  if(event.type==='MERCENARY_VOLLEY'&&event.mechanic==='GOLDEN_ORCHID_VOLLEY')return playMangisaVolley(this,event);
  if(event.type==='MERCENARY_WINDUP'&&event.mechanic==='GOLDEN_ORCHID_VOLLEY')return true;
  const epoch=this.mercenaryEpoch,playbackEpoch=this.playbackEpoch,actor=this.combatantById(event.actorId),target=this.combatantById(event.targetId),type=event.type;if(!actor)return true;
  const valid=()=>epoch===this.mercenaryEpoch&&playbackEpoch===this.playbackEpoch&&!actor.root.destroyed&&this.visible;
  const sync=()=>{if(target&&Number.isFinite(event.targetHpAfter))this.syncTargetHp(target,this.eventHpPercent(target,event.targetHpAfter));if(target&&Number.isFinite(event.targetShieldAfter))this.syncTargetShield(target,event.targetShieldAfter,event.targetMaxShield);};
  const key=`${event.actorId}:${event.skillId}`;
  if(type==='MERCENARY_END'||type==='MERCENARY_CANCEL'){this.mercenaryHitIndices.delete(key);this.queueBanner(event.skillName||'용병 스킬',0xc49cff,type==='MERCENARY_CANCEL'?'기술 중단':'시전 완료');sync();return;}
  if(type==='MERCENARY_FOCUS'||event.dodge){this.queueBanner(event.dodge?'빗나감':event.focused?'조준 완료':'집중 해제',0xc49cff,event.skillName);sync();return;}
  const skill=skillById(event.skillId);if(!skill){sync();return;}
  if(type==='MERCENARY_WINDUP')this.mercenaryHitIndices.set(key,0);
  // Police fires once. Its mark is informational; restraint uses only the
  // binding phase, never the preceding shot. Old receipts can contain a status
  // after KO while the fading corpse is still visible, so reject it by HP.
  const restraintStatus=type==='MERCENARY_DEBUFF'&&skill.mechanic==='REPEAT_OFFENDER_RESTRAINT';
  const restraintTargetAlive=()=>target?.hp>0&&target.battleActive!==false&&target.root?.visible;
  if(restraintStatus){
   if(!restraintTargetAlive())return true;
   if(event.effect==='OFFENDER_MARK'){this.queueBanner(event.skillName,0xc49cff,'위반 표식');sync();return true;}
  }
  // Secondary status records must not replay the direct hit which preceded them.
  if(type==='MERCENARY_DEBUFF'&&(['POISON','APPROACH_DELAY','DUEL_OATH','SHIELD_ONLY_BREAK','THORN_RECOIL_SEAL'].includes(event.effect)||event.effect==='OFFENSIVE_SKILL_ONLY'&&skill.mechanic==='PLATINUM_FOCUS_LOCK')){this.queueBanner(event.skillName,0xc49cff,({POISON:'독 표식',APPROACH_DELAY:'진입 지연',DUEL_OATH:'결투 맹세',SHIELD_ONLY_BREAK:'보호막 파쇄',THORN_RECOIL_SEAL:'가시 봉인',OFFENSIVE_SKILL_ONLY:'공격술 약화'})[event.effect]);sync();return true;}
  if(type==='MERCENARY_BUFF'&&event.effect==='STAND_FAST_CONSUMED'){this.queueBanner(event.skillName,0xc49cff,'백철 방호 소모');sync();return true;}
  const barrage=skill.mechanic==='TIDAL_BARRAGE';
  const hitIndex=restraintStatus||type==='MERCENARY_DEBUFF'&&['ARMOR_WINDOW','NEXT_BASIC_WEAKENED'].includes(event.effect)?1:event.skillPhaseIndex??(this.mercenaryHitIndices.get(key)||0),impact=barrage&&type==='MERCENARY_HIT'?skill.visual.impacts.at(-1):skill.visual.impacts[Math.min(hitIndex,skill.visual.impacts.length-1)];
  if(['MERCENARY_HIT','MERCENARY_HEAL','MERCENARY_DOT','MERCENARY_RIPOSTE'].includes(type))this.mercenaryHitIndices.set(key,hitIndex+1);
  const ids=event.targetIds?.length?event.targetIds:[event.targetId].filter(Boolean),actors=new Map([['M',actor]]),targets=[];
  for(const id of ids){const a=this.combatantById(id);if(!a?.root?.visible||a.battleActive===false)continue;const alias=a===actor?'M':`${a.team===actor.team?'A':'E'}${targets.length+1}`;actors.set(alias,a);targets.push(alias);}
  if(!targets.length){if(!ids.length&&type==='MERCENARY_BUFF')targets.push('M');else{sync();return true;}}
  if(event.sourceAttackerId){const attacker=this.combatantById(event.sourceAttackerId);if(attacker)actors.set('E_SOURCE',attacker);}
  const initial=[...actors].map(([id,a])=>({id,team:id.startsWith('E')?'ENEMY':'ALLY',row:'FRONT',hp:a.hp,maxHp:100,shield:0,attack:1,flags:{},alive:a.hp>0}));
  const isWindup=type==='MERCENARY_WINDUP',events=isWindup?[]:[{id:'authoritative',kind:['MERCENARY_HIT','MERCENARY_DOT','MERCENARY_RIPOSTE'].includes(type)?'HIT':'STATUS',at:impact,targets,phaseIndex:hitIndex,stage:hitIndex>0?'DETONATE':'MARK',amount:event.damage||event.amount||0,changes:{}}];
  // Approved rapid-fire animation is one server hit. Tracers never add damage.
  if(barrage&&!isWindup)events.splice(0,events.length,...skill.visual.impacts.map((at,i)=>({id:`tracer:${i}`,kind:'HIT',at,targets,phaseIndex:i,amount:i===8?event.damage||0:0,changes:{}})));
  const plan={initial,targets,events,scenario:'normal',duration:skill.visual.duration,previewOnly:false,authoritative:true,effectPhase:hitIndex,eventType:type};
  const sequence=await this.sequenceFor(skill.id);this.mercenaryAuxiliary||=await loadAuxiliary();if(!sequence||!valid())return false;
  const audio=this.audio?.enabled?.()!==false?getMercenaryAudio(this):null;
  if(audio){let timer;const ready=await Promise.race([audio.unlock().catch(()=>false),new Promise(resolve=>{timer=setTimeout(()=>resolve(false),2500);})]).finally(()=>clearTimeout(timer));audio.setEnabled(ready);}
  if(!valid())return false;
  if(restraintStatus&&!restraintTargetAlive())return true;
  this.settlePendingTails?.([...actors.values()]);
  const fx=new MercenarySkillFX(this,actors,skill,plan,sequence,this.mercenaryAuxiliary,()=>{},{authoritative:true});fx.removeTimeline();this.mercenaryFx=fx;
  const flightLead=skill.visual.motion==='CORAL_ARCS'?.42:.26;
  const begin=isWindup?0:barrage?skill.visual.windup:Math.max(0,impact-flightLead),end=isWindup?Math.max(.25,skill.visual.impacts[0]-flightLead):barrage?skill.visual.duration:Math.min(skill.visual.duration,impact+1.2),time={value:begin};
  // Server outcomes are applied at the same authored collision timestamp. The
  // rehearsal renderer cannot edit HP or produce a second damage/target result.
  try{
   audio?.select(skill,plan,{panDirection:actor.team===TEAM.ENEMY?-1:1});
   await this.timeline(t=>{
    t.call(()=>audio?.scheduleFrom(begin,t.timeScale()),[],0);
    t.to(time,{value:end,duration:end-begin,ease:'none',onUpdate:()=>{fx.render(time.value);if(audio&&audio.lastRate!==t.timeScale())audio.scheduleFrom(time.value,t.timeScale());}});
    if(!isWindup)t.call(()=>{if(valid())sync();},[],Math.max(0,impact-begin));
   });if(valid())sync();return valid();
  }
  finally{audio?.stop();this.lastMercenaryPlayback={skillId:skill.id,eventType:type,phaseIndex:hitIndex,audio:audio?.diagnostics()||null,frames:fx.activeFrames};fx.destroy();if(this.mercenaryFx===fx)this.mercenaryFx=null;}
 }
 async playEvents(events=[],options={}){
  if(!options.timedInternal&&events.some(e=>e.combatClock===SKILL_CHIP_CLOCK)||!events.some(e=>String(e.type).startsWith('MERCENARY_')))return super.playEvents(events,options);
  for(const e of events){if(!this.visible)return false;const played=String(e.type).startsWith('MERCENARY_')?await this.playMercenaryEvent(e):await super.playEvents([e],options);if(played===false)return false;}return true;
 }
 diagnostics(){return {...super.diagnostics(),mercenaryPlayback:{last:this.lastMercenaryPlayback||null,active:this.mercenaryFx?.diagnostics()||null,audio:this.mercenaryAudio?.diagnostics()||null}};}
 destroy(){this.mercenaryDisposed=true;this.clearMercenaryActors();void this.mercenaryAudio?.destroy();for(const sequence of this.mercenarySequences?.values()||[])releaseFrameViews(sequence);this.mercenarySequences?.clear();super.destroy();}
};
