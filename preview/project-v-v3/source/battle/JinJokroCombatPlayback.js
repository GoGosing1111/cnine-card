import {Assets} from 'pixi.js';
import {createBattleSpineLease} from './BattleAssetMemory.mjs';
import {JIN_JOKRO_CODE,JIN_JOKRO_ART,JIN_JOKRO_AREA_EVENT,JIN_JOKRO_AREA_SKILLS,JIN_JOKRO_BASIC_FORMS} from '../../../../shared/mercenary-jin-jokro-v1.mjs';
import {spine} from './hakuya/vendor/spine-pixi-v8-4.3.13.mjs';
import {JokroBattleAdapter} from './jin-jokro/JokroBattleAdapter.mjs';
import {JokroAura} from './jin-jokro/JokroAura.mjs';
import {JokroEffects} from './jin-jokro/JokroEffects.mjs';
const ROOT='/assets/ui/project-v/mercenaries/jin-jokro-20261106/';
const skeleton=ROOT+'runtime-92f880cb7908/jin-jokro.json',atlas=ROOT+'runtime-164a00db5e6a/jin-jokro-164a00db5e6a.atlas';
const acquireSpine=createBattleSpineLease(skeleton,atlas,3,spine.Spine.getSkeletonCacheKey({skeleton,atlas}));
let assetsPromise,cachedAssets;
function load(){
 // V3 releases GPU sources on result/close. A module promise must not retain
 // frame views whose underlying sources were unloaded before the next battle.
 const frames=cachedAssets&&[...Object.values(cachedAssets.textures).flat(),...Object.values(cachedAssets.aura.textures).flat()];
 if(frames?.every(t=>!t.destroyed&&t.source&&!t.source.destroyed&&t.source.style)&&Assets.cache.has(skeleton)&&Assets.cache.has(atlas))return Promise.resolve(cachedAssets);
 return assetsPromise||=(async()=>{
  const [effects,aura]=await Promise.all([JokroEffects.load(ROOT),JokroAura.load(ROOT)]);cachedAssets={...effects,aura};return cachedAssets;
 })().finally(()=>{assetsPromise=null;});
}
export const jinJokroBattleArt=code=>code===JIN_JOKRO_CODE?{...JIN_JOKRO_ART,calmIdle:true,spriteUrl:'/'+JIN_JOKRO_ART.battleSprite,
 footAnchor:{x:194.423828125/463,y:669.1796875/695},bodyHeight:300,fullBodyHeight:347.5,originalTextureHeight:695}:null;

export async function setupJinJokroActor(engine,actor){
 engine.jinJokroStates||=new Map();engine.jinJokroLoads||=new Map();
 if(engine.jinJokroStates.has(actor))return engine.jinJokroStates.get(actor);
 if(engine.jinJokroLoads.has(actor))return engine.jinJokroLoads.get(actor);
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
  const adapter=new JokroBattleAdapter(engine,actor,rig,assets,()=>spine.Spine.from({skeleton,atlas,autoUpdate:false,ticker:engine.app.ticker}));
  actor.setAnimationAdapter(adapter);
  const state={actor,adapter,basicCount:0,stopped:false,releaseSpine:lease.release};engine.jinJokroStates.set(actor,state);
  installed=true;
  return state;
 })().finally(()=>{engine.jinJokroLoads.delete(actor);if(!installed)return lease.release();});engine.jinJokroLoads.set(actor,pending);return pending;
}
export function warmJinJokroActor(engine,actor){const epoch=engine.mercenaryEpoch;void setupJinJokroActor(engine,actor).catch(error=>{if(!engine.mercenaryDisposed&&epoch===engine.mercenaryEpoch)console.warn('[진 족로] 전투 리소스 준비 지연',error);});}
export function resumeJinJokroPlayback(engine){for(const s of engine.jinJokroStates?.values()||[]){if(s.adapter.destroyed||s.adapter.busy||s.actor.hp<=0)continue;s.stopped=false;s.adapter.suspended=false;s.adapter.idle();}}
export function cancelJinJokroPlayback(engine){for(const s of engine.jinJokroStates?.values()||[]){s.stopped=true;s.adapter.suspended=true;s.adapter.stopAmbient();s.adapter.activeFx?.destroy();s.adapter.aura.render(s.adapter.aura.time);}}
export function clearJinJokroActors(engine){
 for(const state of engine.jinJokroStates?.values()||[]){
  state.stopped=true;
  try{state.adapter.destroy();}finally{state.releaseSpine();}
 }
 engine.jinJokroStates?.clear();
}
export function playJinJokroBasic(engine,options={},fallback=()=>false){
 const {attacker:actor,target}=options;
 if(!engine.isAlive(actor)||!engine.isAlive(target))return false;
 const s=engine.jinJokroStates?.get(actor);if(!s){warmJinJokroActor(engine,actor);return fallback();}
 s.stopped=false;s.adapter.suspended=false;
 return s.adapter.attack({...options,action:JIN_JOKRO_BASIC_FORMS[s.basicCount++%JIN_JOKRO_BASIC_FORMS.length].visualMode});
}
export function playJinJokroArea(engine,event){
 const actor=engine.combatantById(event.actorId);
 if(actor?.cardId!==JIN_JOKRO_CODE||event.type!==JIN_JOKRO_AREA_EVENT||event.battleMode!=='PVE'||!JIN_JOKRO_AREA_SKILLS.some(s=>s.id===event.skillId))return true;
 const hits=[...new Map((event.hits||[]).map(hit=>[hit.targetId,hit])).values()].filter(hit=>{const target=engine.combatantById(hit.targetId);return target&&!target.root.destroyed&&target.team!==actor.team;});
 if(!hits.length)return true;
 const s=engine.jinJokroStates?.get(actor);
 if(!s||!engine.isAlive(actor)){
  if(actor.hp>0)warmJinJokroActor(engine,actor);
  for(const hit of hits){const target=engine.combatantById(hit.targetId);
   if(Number.isFinite(hit.targetHpAfter))engine.syncTargetHp(target,engine.eventHpPercent(target,hit.targetHpAfter,hit.targetMaxHp));
   if(Number.isFinite(hit.targetShieldAfter))engine.syncTargetShield(target,hit.targetShieldAfter,hit.targetMaxShield);
   if(hit.dodge)engine.queueBanner('빗나감',actor.accent,target.name);else engine.showAccountBattleUnitDamage(target,{damage:(hit.damage||0)+(hit.absorbed||0),compactArea:hits.length>1});
  }return true;
 }
 s.stopped=false;s.adapter.suspended=false;
 const action=JIN_JOKRO_AREA_SKILLS.find(s=>s.id===event.skillId).visualMode;
 return s.adapter.attack({action,hits,target:engine.combatantById(hits[0].targetId)});
}
