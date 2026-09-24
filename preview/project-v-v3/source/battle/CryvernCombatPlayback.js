import {IceDualSwordFX,loadIceAssets} from '../../../mercenary-ice-crystal-dual-sword-v1/source/IceDualSwordFX.js';
import {makePlan,MODES} from '../../../mercenary-ice-crystal-dual-sword-v1/skill.mjs';
import {CRYVERN_CODE,CRYVERN_SKILL_ID,CRYVERN_PREVIEW} from '../../../../shared/mercenary-cryvern-v1.mjs';
let manifestPromise;
const loadManifest=()=>manifestPromise||=(fetch('/'+CRYVERN_PREVIEW+'manifest.json?v=cryvern-prep-1')
 .then(r=>{if(!r.ok)throw Error('CRYVERN_MANIFEST');return r.json();})
 .catch(error=>{manifestPromise=null;throw error;}));
const release=assets=>{for(const group of [assets.motion,assets.effects])for(const frames of Object.values(group))for(const texture of frames)texture.destroy(false);};
export async function preloadCryvern(){release(await loadIceAssets(await loadManifest()));}
export function cryvernPlaybackPlan(mode,contacts=[]){
 const truncated=mode==='ultimate'&&!contacts.some(c=>c.at===2.62);
 const plan=makePlan({mode,cancelAt:truncated?1.5:null});
 return {...plan,duration:plan.stop??plan.duration,contacts:[...new Set(contacts.filter(c=>!c.dodge).map(c=>c.at))],
  damageAuthority:'SERVER_ONLY',authoritative:true};
}
export async function setupCryvernActor(engine,actor){
 engine.cryvernStates||=new Map();
 if(engine.cryvernStates.has(actor))return engine.cryvernStates.get(actor);
 const epoch=engine.mercenaryEpoch,playbackEpoch=engine.playbackEpoch,manifest=await loadManifest(),assets=await loadIceAssets(manifest);
 if(actor.root.destroyed||epoch!==engine.mercenaryEpoch||playbackEpoch!==engine.playbackEpoch||engine.mercenaryDisposed){release(assets);return null;}
 const fx=new IceDualSwordFX(engine,actor,[actor],assets,manifest,makePlan({mode:'aura'}),()=>{},
  {authoritative:true,useAuthoredPose:actor.cardId===CRYVERN_CODE});
 const state={fx,actor,busy:false,basicIndex:0};engine.cryvernStates.set(actor,state);return state;
}
export function clearCryvernActors(engine){
 for(const {fx} of engine.cryvernStates?.values()||[])fx.destroy();
 engine.cryvernStates?.clear();
}
export function cancelCryvernPlayback(engine){
 for(const state of engine.cryvernStates?.values()||[]){state.fx.cancel();state.busy=false;}
}
async function playback(engine,actor,targets,mode,contacts,{begin=0,tail=true,reactive=false}={}){
 const epoch=engine.mercenaryEpoch,playbackEpoch=engine.playbackEpoch;
 const valid=()=>actor&&!actor.root.destroyed&&engine.visible&&epoch===engine.mercenaryEpoch&&playbackEpoch===engine.playbackEpoch;
 if(!valid()||!targets.length)return false;
 const state=await setupCryvernActor(engine,actor);
 if(!state||!valid())return false;
 if(reactive&&state.busy)return true;
 if(!reactive){state.guardCancel?.();engine.settlePendingTails?.([actor,...targets]);}
 const fx=state.fx,plan=cryvernPlaybackPlan(mode,contacts),clock={time:begin};
 actor.animationController.kill();
 state.busy=true;fx.removeTimeline();fx.plan=plan;fx.targets=targets;
 fx.targetDefaults=targets.map(t=>({viewX:t.view.x,tint:t.fullBodySprite.tint}));
 fx.captureFormation();fx.render(begin);
 const cleanup=()=>{state.busy=false;state.guardCancel=null;if(!fx.destroyed){fx.clock.time=0;fx.render(0);}if(valid()&&actor.hp>0)actor.animationController.setState('IDLE');};
 const last=contacts.length?Math.max(...contacts.map(c=>c.at)):begin;
 // Release after the final contact; existing engine-owned tails settle before
 // a conflicting action. No cinematic gate, second ticker, or independent clock.
 const ok=await engine.timeline(t=>{
  if(reactive)state.guardCancel=()=>t.kill();
  t.to(clock,{time:plan.duration,duration:plan.duration-begin,ease:'none',onUpdate:()=>{
   if(valid()&&!fx.destroyed){fx.clock.time=clock.time;fx.render(clock.time);}
  }});
  for(const contact of contacts){
   if(!Number.isFinite(contact.at)||contact.at<begin||contact.at>plan.duration)throw Error('INVALID_CRYVERN_CONTACT');
   t.call(()=>{if(valid()&&!fx.destroyed)contact.apply?.();},[],contact.at-begin);
  }
 },cleanup,null,{releaseAt:tail?Math.max(.01,last-begin+.12):null,owners:reactive?[]:[actor,...targets]});
 engine.lastMercenaryPlayback={skillId:mode==='ultimate'?CRYVERN_SKILL_ID:null,
  eventType:mode==='ultimate'?'MERCENARY_CRYSTAL_CROWN':mode==='guard'?'SHIELD_HIT':'ATTACK',
  mode,impacts:contacts.length,clockOwner:'V3_REGISTERED_GSAP',authoritative:true,damageApplications:contacts.filter(c=>c.apply).length};
 return ok&&valid();
}
export async function playCryvernCrown(engine,event){
 const actor=engine.combatantById(event.actorId),targets=(event.targetIds||[]).map(id=>engine.combatantById(id)).filter(Boolean);
 if(!actor||!targets.length)return true;
 engine.queueBanner(event.skillName,0x75dcff,actor.name);
 const contacts=(event.impacts||[]).map(impact=>({at:impact.at,dodge:impact.dodge,apply(){
  const target=engine.combatantById(impact.targetId);if(!target||target.root.destroyed)return;
  engine.syncTargetHp(target,engine.eventHpPercent(target,impact.targetHpAfter));
  engine.syncTargetShield(target,impact.targetShieldAfter,impact.targetMaxShield);
  if(impact.dodge)engine.queueBanner('빗나감',0x75dcff,event.skillName);
  else engine.showAccountBattleUnitDamage(target,{damage:impact.damage});
 }}));
 return playback(engine,actor,targets,'ultimate',contacts);
}
export async function playCryvernBasic(engine,{attacker:actor,target,damage=0,targetHp=null,targetShield=null,onImpact=()=>{}}={}){
 if(!engine.isAlive(actor)||!engine.isAlive(target))return false;
 const state=await setupCryvernActor(engine,actor);if(!state)return false;
 const mode=['attack','cross','cyclone'][state.basicIndex++%3],last=MODES[mode].contacts.at(-1);
 // The two blades are animation, not two extra rolls, actions or proc sources.
 return playback(engine,actor,[target],mode,MODES[mode].contacts.map(at=>({at,...(at===last?{apply(){
  if(targetHp!==null&&Number.isFinite(Number(targetHp)))engine.syncTargetHp(target,Number(targetHp));
  if(targetShield!==null&&Number.isFinite(Number(targetShield)))engine.syncTargetShield(target,Number(targetShield));
  onImpact(target);engine.showAccountBattleUnitDamage(target,{damage});
 }}:{})})));
}
export function showCryvernShieldImpact(engine,actor,before,after){
 const state=engine.cryvernStates?.get(actor);
 if(!state||state.busy||actor.cardId!==CRYVERN_CODE||actor.hp<=0||!actor.root.visible||!engine.visible||!(before>after))return;
 // A visual response to an ALREADY resolved shield loss. No new block,
 // counter-damage, cooldown, action or additional server effect.
 void playback(engine,actor,[actor],'guard',[],{begin:.74,tail:true,reactive:true}).catch(error=>{
  if(!state.fx.destroyed)state.fx.cancel();state.busy=false;
  engine.lastCryvernPlaybackError=String(error.message||error);
 });
}
