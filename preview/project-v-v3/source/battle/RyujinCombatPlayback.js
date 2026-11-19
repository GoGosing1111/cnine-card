import {Assets} from 'pixi.js';
import {createBattleSpineLease} from './BattleAssetMemory.mjs';
import {RYUJIN_CODE,RYUJIN_ART,RYUJIN_AREA_EVENT,RYUJIN_AREA_SKILLS,RYUJIN_BASIC_FORMS} from '../../../../shared/mercenary-ryujin-v1.mjs';
import {spine} from './hakuya/vendor/spine-pixi-v8-4.3.13.mjs';
import {DrawnBattleAdapterV3} from './ryujin/DrawnBattleAdapterV3.mjs';
import {ReferenceCrimsonEffects} from './ryujin/ReferenceCrimsonEffectsV14.mjs';
import frames from './ryujin/frames.json' with {type:'json'};
import {BODY,EFFECTS,FLOOR} from './ryujin/assets.mjs';
const {skeleton,atlas}=BODY;
const leases=[BODY,EFFECTS,FLOOR].map(pair=>createBattleSpineLease(pair.skeleton,pair.atlas,1,spine.Spine.getSkeletonCacheKey(pair)));
function acquireSpine(){const owned=leases.map(acquire=>acquire());return {ready:Promise.all(owned.map(x=>x.ready)),release:()=>Promise.all(owned.map(x=>x.release()))};}
let assetsPromise,cachedAssets;
function load(){
 if(cachedAssets?.ambient.rearTextures.every(t=>!t.destroyed&&!t.source?.destroyed&&t.source?.style))return Promise.resolve(cachedAssets);
 return assetsPromise||=ReferenceCrimsonEffects.load().then(a=>cachedAssets=a).finally(()=>{assetsPromise=null;});
}
export const ryujinBattleArt=code=>code===RYUJIN_CODE?{...RYUJIN_ART,calmIdle:true,spriteUrl:'/'+RYUJIN_ART.battleSprite,
 footAnchor:{x:714/1448,y:1066/1086},bodyHeight:300,fullBodyHeight:300*1086/1040,originalTextureHeight:1086}:null;

export async function setupRyujinActor(engine,actor){
 engine.ryujinStates||=new Map();engine.ryujinLoads||=new Map();
 if(engine.ryujinStates.has(actor))return engine.ryujinStates.get(actor);
 if(engine.ryujinLoads.has(actor))return engine.ryujinLoads.get(actor);
 const epoch=engine.mercenaryEpoch;
 const lease=acquireSpine();
 let installed=false;
 const pending=(async()=>{
  const [assets]=await Promise.all([load(),lease.ready]);
  const valid=()=>!engine.mercenaryDisposed&&!actor.root.destroyed&&epoch===engine.mercenaryEpoch;
  while(valid()&&(engine.pendingTails?.has(actor)||actor.state==='ATTACK'||actor.state==='MOVE'))await new Promise(r=>setTimeout(r,32));
  if(!valid())return null;
  actor.animationController.kill();actor.restoreNeutralAvatarPose?.();
  const rig=spine.Spine.from({skeleton,atlas,autoUpdate:false,ticker:engine.app.ticker});
  const adapter=new DrawnBattleAdapterV3(engine,actor,rig,{frames,effects:new ReferenceCrimsonEffects(engine,assets)});
  actor.setAnimationAdapter(adapter);
  const state={actor,adapter,basicCount:0,stopped:false,releaseSpine:lease.release};engine.ryujinStates.set(actor,state);
  installed=true;
  return state;
 })().finally(()=>{engine.ryujinLoads.delete(actor);if(!installed)return lease.release();});engine.ryujinLoads.set(actor,pending);return pending;
}
export function warmRyujinActor(engine,actor){const epoch=engine.mercenaryEpoch;void setupRyujinActor(engine,actor).catch(error=>{if(!engine.mercenaryDisposed&&epoch===engine.mercenaryEpoch)console.warn('[류진] 전투 리소스 준비 지연',error);});}
export function resumeRyujinPlayback(engine){for(const s of engine.ryujinStates?.values()||[]){if(s.adapter.destroyed||s.adapter.busy||s.actor.hp<=0)continue;s.stopped=false;s.adapter.suspended=false;s.adapter.idle();}}
export function cancelRyujinPlayback(engine){for(const s of engine.ryujinStates?.values()||[]){s.stopped=true;s.adapter.suspended=true;s.adapter.stopAmbient();s.adapter.pendingFrame=null;s.adapter.effects.session?.destroy();s.adapter.effects.stopPersistentFor(s.adapter);}}
export function clearRyujinActors(engine){
 for(const state of engine.ryujinStates?.values()||[]){
  state.stopped=true;
  try{state.adapter.destroy();}finally{state.releaseSpine();}
 }
 engine.ryujinStates?.clear();
}
export async function playRyujinBasic(engine,options={},fallback=()=>false){
 const {attacker:actor,target}=options;
 if(!engine.isAlive(actor)||!engine.isAlive(target))return false;
 const s=engine.ryujinStates?.get(actor);if(!s){warmRyujinActor(engine,actor);return fallback();}
 s.stopped=false;s.adapter.suspended=false;
 await awaken(engine,s,options.target);if(s.stopped)return false;
 return s.adapter.attack({...options,action:RYUJIN_BASIC_FORMS[s.basicCount++%RYUJIN_BASIC_FORMS.length].visualMode});
}
export async function playRyujinArea(engine,event){
 const actor=engine.combatantById(event.actorId);
 if(actor?.cardId!==RYUJIN_CODE||event.type!==RYUJIN_AREA_EVENT||event.battleMode!=='PVE'||!RYUJIN_AREA_SKILLS.some(s=>s.id===event.skillId))return true;
 const hits=[...new Map((event.hits||[]).map(hit=>[hit.targetId,hit])).values()].filter(hit=>{const target=engine.combatantById(hit.targetId);return target&&!target.root.destroyed&&target.team!==actor.team;});
 if(!hits.length)return true;
 const s=engine.ryujinStates?.get(actor);
 if(!s||!engine.isAlive(actor)){
  if(actor.hp>0)warmRyujinActor(engine,actor);
  for(const hit of hits){const target=engine.combatantById(hit.targetId);
   if(Number.isFinite(hit.targetHpAfter))engine.syncTargetHp(target,engine.eventHpPercent(target,hit.targetHpAfter,hit.targetMaxHp));
   if(Number.isFinite(hit.targetShieldAfter))engine.syncTargetShield(target,hit.targetShieldAfter,hit.targetMaxShield);
   if(hit.dodge)engine.queueBanner('빗나감',actor.accent,target.name);else engine.showAccountBattleUnitDamage(target,{damage:(hit.damage||0)+(hit.absorbed||0),compactArea:hits.length>1});
  }return true;
 }
 s.stopped=false;s.adapter.suspended=false;
 await awaken(engine,s,engine.combatantById(hits[0].targetId));if(s.stopped)return false;
 const skill=RYUJIN_AREA_SKILLS.find(s=>s.id===event.skillId),action=skill.presentationVariants.includes(event.visualMode)?event.visualMode:skill.visualMode;
 return s.adapter.attack({action,hits,area:true,target:engine.combatantById(hits[0].targetId)});
}

async function awaken(engine,s,target){
 if(s.awakened)return;s.awakened=true;
 await s.adapter.attack({action:'skill_awakening',target});
}
