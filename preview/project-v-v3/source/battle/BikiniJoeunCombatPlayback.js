import {BikiniJoeunSkillFX,loadBikiniJoeunAssets} from '../../../mercenary-bikini-joeun-v1/source/BikiniJoeunSkillFX.js';
import {BIKINI_JOEUN_CODE,BIKINI_JOEUN_IMPACTS,bikiniJoeunVisualPlan} from '../../../../shared/mercenary-bikini-joeun-v1.mjs';
import {getMercenaryAudio} from '../../../project-v-mercenary-system-v1/source/MercenarySkillAudio.js';
let manifestPromise;
const loadManifest=()=>manifestPromise||=(fetch('/preview/mercenary-bikini-joeun-v1/manifest.json?v=20260921').then(r=>{if(!r.ok)throw Error('BIKINI_JOEUN_MANIFEST');return r.json()}).catch(error=>{manifestPromise=null;throw error}));
const release=assets=>{for(const t of [...assets.impact,...assets.motion])t.destroy(false);};
export async function preloadBikiniJoeun(){release(await loadBikiniJoeunAssets(await loadManifest()));}
async function playback(engine,actor,target,{basic=false,dodge=false,apply}){
 const epoch=engine.mercenaryEpoch,playbackEpoch=engine.playbackEpoch;
 const valid=()=>actor&&target&&!actor.root.destroyed&&!target.root.destroyed&&engine.visible&&epoch===engine.mercenaryEpoch&&playbackEpoch===engine.playbackEpoch;
 if(!valid())return false;
 const manifest=await loadManifest(),assets=await loadBikiniJoeunAssets(manifest);
 if(!valid()){release(assets);return false;}
 const plan=bikiniJoeunVisualPlan({basic,dodge}),clock={time:0};
 engine.settlePendingTails?.([actor,target]);
 const fx=new BikiniJoeunSkillFX(engine,actor,[target],assets,manifest,plan,()=>{},{authoritative:true,useAuthoredPose:actor.cardId===BIKINI_JOEUN_CODE});
 fx.removeTimeline();engine.mercenaryFx=fx;
 const contact=basic?BIKINI_JOEUN_IMPACTS[0]:BIKINI_JOEUN_IMPACTS.at(-1);
 let audio,ownedAudioPlan;
 try{
  audio=engine.audio?.enabled?.()!==false?getMercenaryAudio(engine):null;
  if(audio){let timer;const ready=await Promise.race([audio.unlock().catch(()=>false),new Promise(r=>{timer=setTimeout(()=>r(false),350)})]).finally(()=>clearTimeout(timer));audio.setEnabled(ready);}
  if(!valid())return false;
  // Reuse the released marksman Foley. Only visual shot times enter its audio plan.
  audio?.select({id:'MS-009',visual:{impacts:[]}},{authoritative:true,duration:plan.duration,events:plan.events.filter(e=>e.kind==='SHOT').map(e=>({kind:'HIT',at:e.at,phaseIndex:0}))},{panDirection:actor.team==='ENEMY'?-1:1});
  ownedAudioPlan=audio?.planEvents;
  await engine.timeline(t=>{
   t.call(()=>audio?.scheduleFrom(0,t.timeScale()),[],0);
   t.to(clock,{time:plan.duration,duration:plan.duration,ease:'none',onUpdate:()=>{if(valid()){fx.clock.time=clock.time;fx.render(clock.time);if(audio&&audio.planEvents===ownedAudioPlan&&audio.lastRate!==t.timeScale())audio.scheduleFrom(clock.time,t.timeScale());}}});
   t.call(()=>{if(valid())apply();},[],contact);
  });
  engine.lastMercenaryPlayback={skillId:basic?null:'MS-047',eventType:basic?'ATTACK':'MERCENARY_HIT',impacts:1,tracers:basic?1:6,clockOwner:'V3_REGISTERED_GSAP',authoritative:true,motionFrames:6,frames:16};
  return valid();
 }finally{
  if(audio?.planEvents===ownedAudioPlan)audio?.stop();
  fx.destroy();if(engine.mercenaryFx===fx)engine.mercenaryFx=null;
  if(valid()&&actor.hp>0)actor.animationController.setState('IDLE');
 }
}
export function playBikiniJoeunSkill(engine,event){
 const actor=engine.combatantById(event.actorId),target=engine.combatantById(event.targetId);
 if(!actor||!target)return true;
 engine.queueBanner(event.skillName,0xc4a5ef,actor.name);
 return playback(engine,actor,target,{dodge:!!event.dodge,apply(){
  if(Number.isFinite(event.targetHpAfter))engine.syncTargetHp(target,engine.eventHpPercent(target,event.targetHpAfter));
  if(Number.isFinite(event.targetShieldAfter))engine.syncTargetShield(target,event.targetShieldAfter,event.targetMaxShield);
  if(event.dodge)engine.queueBanner('빗나감',0xc4a5ef,event.skillName);else engine.showAccountBattleUnitDamage(target,{damage:event.damage});
 }});
}
export function playBikiniJoeunBasic(engine,{attacker:actor,target,damage=0,targetHp=null,targetShield=null,onImpact=()=>{}}={}){
 if(!engine.isAlive(actor)||!engine.isAlive(target))return false;
 return playback(engine,actor,target,{basic:true,apply(){
  if(targetHp!==null&&Number.isFinite(Number(targetHp)))engine.syncTargetHp(target,Number(targetHp));
  if(targetShield!==null&&Number.isFinite(Number(targetShield)))engine.syncTargetShield(target,Number(targetShield));
  onImpact(target);engine.showAccountBattleUnitDamage(target,{damage});
 }});
}
