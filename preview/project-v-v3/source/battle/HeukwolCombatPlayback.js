import {BlackMoonFX,loadBlackMoonAssets} from '../../../mercenary-black-moon-swordsman-ss-v1/source/BlackMoonFX.js';
import {makePlan} from '../../../mercenary-black-moon-swordsman-ss-v1/skill.mjs';
import {HEUKWOL_CODE,HEUKWOL_SKILL_ID} from '../../../../shared/mercenary-heukwol-v1.mjs';
let manifestPromise;
const loadManifest=()=>manifestPromise||=(fetch('/preview/mercenary-black-moon-swordsman-ss-v1/manifest.json?v=heukwol-live-1').then(r=>{if(!r.ok)throw Error('HEUKWOL_MANIFEST');return r.json();}).catch(error=>{manifestPromise=null;throw error;}));
const release=assets=>{for(const group of [...Object.values(assets.motion),...Object.values(assets.effects)])for(const t of group)t.destroy(false);};
export async function preloadHeukwol(){release(await loadBlackMoonAssets(await loadManifest()));}
export function heukwolPlaybackPlan(mode,contacts){
 const stop=mode==='skill'&&contacts.length<3?(contacts.at(-1)?.at??0)+.22:null;
 const plan=makePlan({mode,cancelAt:stop});
 return {...plan,duration:stop??plan.duration,contacts:contacts.filter(c=>!c.dodge).map(c=>c.at),damageAuthority:'SERVER_ONLY'};
}
async function playback(engine,actor,target,mode,contacts){
 const epoch=engine.mercenaryEpoch,playbackEpoch=engine.playbackEpoch;
 const valid=()=>actor&&target&&!actor.root.destroyed&&!target.root.destroyed&&engine.visible&&epoch===engine.mercenaryEpoch&&playbackEpoch===engine.playbackEpoch;
 if(!valid())return false;
 const manifest=await loadManifest(),assets=await loadBlackMoonAssets(manifest);
 if(!valid()){release(assets);return false;}
 engine.settlePendingTails?.([actor,target]);
 const plan=heukwolPlaybackPlan(mode,contacts),clock={time:0};
 const fx=new BlackMoonFX(engine,actor,target,assets,manifest,plan,()=>{},{useAuthoredPose:actor.cardId===HEUKWOL_CODE});
 fx.removeTimeline();engine.mercenaryFx=fx;
 try{
  await engine.timeline(t=>{
   t.to(clock,{time:plan.duration,duration:plan.duration,ease:'none',onUpdate:()=>{if(valid()){fx.clock.time=clock.time;fx.render(clock.time);}}});
   for(const contact of contacts)t.call(()=>{if(valid())contact.apply();},[],contact.at);
  });
  engine.lastMercenaryPlayback={skillId:mode==='skill'?HEUKWOL_SKILL_ID:null,eventType:mode==='skill'?'MERCENARY_COMBO':'ATTACK',impacts:contacts.length,clockOwner:'V3_REGISTERED_GSAP',authoritative:true,motionFrames:12,frames:16};
  return valid();
 }finally{
  fx.destroy();if(engine.mercenaryFx===fx)engine.mercenaryFx=null;
  if(valid()&&actor.hp>0)actor.animationController.setState('IDLE');
 }
}
export function playHeukwolCombo(engine,event){
 const actor=engine.combatantById(event.actorId),target=engine.combatantById(event.targetId);
 if(!actor||!target)return true;
 engine.queueBanner(event.skillName,0xe9c681,actor.name);
 const contacts=(event.impacts||[]).map(impact=>({at:impact.at,dodge:impact.dodge,apply(){
  engine.syncTargetHp(target,engine.eventHpPercent(target,impact.targetHpAfter));
  engine.syncTargetShield(target,impact.targetShieldAfter,impact.targetMaxShield);
  if(impact.dodge)engine.queueBanner('빗나감',0xe9c681,event.skillName);
  else engine.showAccountBattleUnitDamage(target,{damage:impact.damage});
 }}));
 return playback(engine,actor,target,'skill',contacts);
}
export function playHeukwolBasic(engine,{attacker:actor,target,damage=0,targetHp=null,targetShield=null,onImpact=()=>{}}={}){
 if(!engine.isAlive(actor)||!engine.isAlive(target))return false;
 return playback(engine,actor,target,'attack',[{at:.72,apply(){
  if(targetHp!==null&&Number.isFinite(Number(targetHp)))engine.syncTargetHp(target,Number(targetHp));
  if(targetShield!==null&&Number.isFinite(Number(targetShield)))engine.syncTargetShield(target,Number(targetShield));
  onImpact(target);engine.showAccountBattleUnitDamage(target,{damage});
 }}]);
}
