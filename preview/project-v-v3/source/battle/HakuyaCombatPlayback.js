import {Assets} from 'pixi.js';
import {createBattleSpineLease} from './BattleAssetMemory.mjs';
import {HAKUYA_CODE,HAKUYA_ART,HAKUYA_AREA_EVENT,HAKUYA_AREA_SKILL,HAKUYA_BASIC_FORMS,HAKUYA_AREA_FORMS} from '../../../../shared/mercenary-hakuya-v1.mjs';
import {spine} from './hakuya/vendor/spine-pixi-v8-4.3.13.mjs';
import {WhitecoatBattleAdapter} from './hakuya/WhitecoatBattleAdapter.mjs';
import {WhitecoatEffects} from './hakuya/WhitecoatEffects.mjs';
const ROOT='/assets/ui/project-v/mercenaries/hakuya-shin-20261105/';
const skeleton=ROOT+'spine/whitecoat.json',atlas=ROOT+'spine/whitecoat-skills-v4-51fecca13bde.atlas';
const acquireSpine=createBattleSpineLease(skeleton,atlas,4,spine.Spine.getSkeletonCacheKey({skeleton,atlas}));
let assetsPromise,cachedAssets;
function load(){
 // V3 releases GPU sources on result/close. A module promise must not retain
 // frame views whose underlying sources were unloaded before the next battle.
 const frames=cachedAssets&&[cachedAssets.trailTexture,...Object.values(cachedAssets.textures).flat(),...Object.values(cachedAssets.aura.layers).flat()];
 if(frames?.every(t=>!t.destroyed&&t.source&&!t.source.destroyed&&t.source.style)&&Assets.cache.has(skeleton)&&Assets.cache.has(atlas))return Promise.resolve(cachedAssets);
 return assetsPromise||=(async()=>{
  const effects=await WhitecoatEffects.load();cachedAssets=effects;return effects;
 })().finally(()=>{assetsPromise=null;});
}
export const hakuyaBattleArt=code=>code===HAKUYA_CODE?{...HAKUYA_ART,calmIdle:true,spriteUrl:'/'+HAKUYA_ART.battleSprite,
 footAnchor:{x:740/1431,y:1082/1099},bodyHeight:300,fullBodyHeight:550*300/530,originalTextureHeight:550}:null;

export async function setupHakuyaActor(engine,actor){
 engine.hakuyaStates||=new Map();engine.hakuyaLoads||=new Map();
 if(engine.hakuyaStates.has(actor))return engine.hakuyaStates.get(actor);
 if(engine.hakuyaLoads.has(actor))return engine.hakuyaLoads.get(actor);
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
  const effects=new WhitecoatEffects(engine,assets),adapter=new WhitecoatBattleAdapter(engine,actor,rig,{effects});
  actor.setAnimationAdapter(adapter);
  const state={actor,adapter,effects,basicCount:0,stopped:false,releaseSpine:lease.release};engine.hakuyaStates.set(actor,state);
  installed=true;
  return state;
 })().finally(()=>{engine.hakuyaLoads.delete(actor);if(!installed)return lease.release();});engine.hakuyaLoads.set(actor,pending);return pending;
}
export function warmHakuyaActor(engine,actor){const epoch=engine.mercenaryEpoch;void setupHakuyaActor(engine,actor).catch(error=>{if(!engine.mercenaryDisposed&&epoch===engine.mercenaryEpoch)console.warn('[하쿠야 신] 전투 리소스 준비 지연',error);});}
export function resumeHakuyaPlayback(engine){for(const s of engine.hakuyaStates?.values()||[]){if(s.adapter.destroyed||s.adapter.busy||s.actor.hp<=0)continue;s.stopped=false;s.adapter.suspended=false;s.adapter.idle();}}
export function cancelHakuyaPlayback(engine){for(const s of engine.hakuyaStates?.values()||[]){s.stopped=true;s.adapter.suspended=true;s.adapter.stopAmbient();s.effects.destroy();s.adapter.tempestVisualCleanup?.();s.adapter.aura.root.visible=false;s.adapter.aura.front.visible=false;}}
export function clearHakuyaActors(engine){
 for(const state of engine.hakuyaStates?.values()||[]){
  state.stopped=true;
  try{state.adapter.destroy();}finally{state.releaseSpine();}
 }
 engine.hakuyaStates?.clear();
}
export function playHakuyaBasic(engine,options={},fallback=()=>false){
 const {attacker:actor,target}=options;
 if(!engine.isAlive(actor)||!engine.isAlive(target))return false;
 const s=engine.hakuyaStates?.get(actor);if(!s){warmHakuyaActor(engine,actor);return fallback();}
 s.stopped=false;s.adapter.suspended=false;
 return s.adapter.attack({...options,action:HAKUYA_BASIC_FORMS[s.basicCount++%HAKUYA_BASIC_FORMS.length].visualMode});
}
export function playHakuyaArea(engine,event){
 const actor=engine.combatantById(event.actorId);
 if(actor?.cardId!==HAKUYA_CODE||event.type!==HAKUYA_AREA_EVENT||event.battleMode!=='PVE'||event.skillId!==HAKUYA_AREA_SKILL.id)return true;
 const hits=[...new Map((event.hits||[]).map(hit=>[hit.targetId,hit])).values()].filter(hit=>{const target=engine.combatantById(hit.targetId);return target&&!target.root.destroyed&&target.team!==actor.team;});
 if(!hits.length)return true;
 const s=engine.hakuyaStates?.get(actor);
 if(!s||!engine.isAlive(actor)){
  if(actor.hp>0)warmHakuyaActor(engine,actor);
  for(const hit of hits){const target=engine.combatantById(hit.targetId);
   if(Number.isFinite(hit.targetHpAfter))engine.syncTargetHp(target,engine.eventHpPercent(target,hit.targetHpAfter,hit.targetMaxHp));
   if(Number.isFinite(hit.targetShieldAfter))engine.syncTargetShield(target,hit.targetShieldAfter,hit.targetMaxShield);
   if(hit.dodge)engine.queueBanner('빗나감',actor.accent,target.name);else engine.showAccountBattleUnitDamage(target,{damage:(hit.damage||0)+(hit.absorbed||0),compactArea:hits.length>1});
  }return true;
 }
 s.stopped=false;s.adapter.suspended=false;
 const action=HAKUYA_AREA_FORMS.find(f=>f.visualMode===event.visualMode)?.visualMode||HAKUYA_AREA_FORMS[0].visualMode;
 return s.adapter.attack({action,hits,target:engine.combatantById(hits[0].targetId)});
}
