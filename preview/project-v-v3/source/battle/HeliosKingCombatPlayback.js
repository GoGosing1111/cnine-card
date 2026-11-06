import {Assets} from 'pixi.js';
import {HELIOS_KING_CODE,HELIOS_KING_ART,HELIOS_KING_AREA_EVENT,HELIOS_KING_AREA_SKILLS,HELIOS_KING_BASIC_FORMS} from '../../../../shared/mercenary-helios-king-v1.mjs';
import {spine} from './hakuya/vendor/spine-pixi-v8-4.3.13.mjs';
import {HeliosBattleAdapter} from './helios-king/HeliosBattleAdapter.mjs';
import {SummonedWeapons} from './helios-king/SummonedWeapons.mjs';
import {RoyalAura} from './helios-king/aura-v3/RoyalAura.mjs';
import {RoyalEffects} from './helios-king/sss-v2/RoyalEffects.mjs';
const ROOT='/assets/ui/project-v/mercenaries/helios-king-20261106/';
const skeleton=ROOT+'spine/helios-king.json',atlas=ROOT+'spine/helios-king-affb467a3e47.atlas';
let assetsPromise,cachedAssets;
function load(){
 // V3 releases GPU sources on result/close. A module promise must not retain
 // frame views whose underlying sources were unloaded before the next battle.
 const frames=cachedAssets&&[...Object.values(cachedAssets.props),...Object.values(cachedAssets.royal.textures).flat(),cachedAssets.aura.scale,...Object.values(cachedAssets.aura.layers).flat()];
 if(frames?.every(t=>!t.destroyed&&t.source&&!t.source.destroyed&&t.source.style)&&Assets.cache.has(skeleton)&&Assets.cache.has(atlas))return Promise.resolve(cachedAssets);
 return assetsPromise||=(async()=>{
  const [props,royal,aura]=await Promise.all([SummonedWeapons.load(ROOT),RoyalEffects.load(ROOT+'sss-v2/'),RoyalAura.load(ROOT+'aura-v3/'),Assets.load([skeleton,atlas])]);cachedAssets={props,royal,aura};return cachedAssets;
 })().finally(()=>{assetsPromise=null;});
}
export const heliosKingBattleArt=code=>code===HELIOS_KING_CODE?{...HELIOS_KING_ART,calmIdle:true,spriteUrl:'/'+HELIOS_KING_ART.battleSprite,
 footAnchor:{x:552/1106,y:1384/1422},bodyHeight:300,fullBodyHeight:315,originalTextureHeight:1422}:null;

export async function setupHeliosKingActor(engine,actor){
 engine.heliosKingStates||=new Map();engine.heliosKingLoads||=new Map();
 if(engine.heliosKingStates.has(actor))return engine.heliosKingStates.get(actor);
 if(engine.heliosKingLoads.has(actor))return engine.heliosKingLoads.get(actor);
 const epoch=engine.mercenaryEpoch;
 const pending=(async()=>{
  const assets=await load();
  const valid=()=>!engine.mercenaryDisposed&&!actor.root.destroyed&&epoch===engine.mercenaryEpoch;
  while(valid()&&(engine.pendingTails?.has(actor)||actor.state==='ATTACK'||actor.state==='MOVE'))await new Promise(r=>setTimeout(r,32));
  if(!valid())return null;
  actor.animationController.kill();actor.restoreNeutralAvatarPose?.();
  const rig=spine.Spine.from({skeleton,atlas,autoUpdate:false,ticker:engine.app.ticker});
  const adapter=new HeliosBattleAdapter(engine,actor,rig,assets.props,assets.royal,assets.aura);
  actor.setAnimationAdapter(adapter);
  const state={actor,adapter,basicCount:0,stopped:false};engine.heliosKingStates.set(actor,state);
  return state;
 })().finally(()=>engine.heliosKingLoads.delete(actor));engine.heliosKingLoads.set(actor,pending);return pending;
}
export function warmHeliosKingActor(engine,actor){const epoch=engine.mercenaryEpoch;void setupHeliosKingActor(engine,actor).catch(error=>{if(!engine.mercenaryDisposed&&epoch===engine.mercenaryEpoch)console.warn('[헬리오스 킹] 전투 리소스 준비 지연',error);});}
export function resumeHeliosKingPlayback(engine){for(const s of engine.heliosKingStates?.values()||[]){if(s.adapter.destroyed||s.adapter.busy||s.actor.hp<=0)continue;s.stopped=false;s.adapter.suspended=false;s.adapter.idle();}}
export function cancelHeliosKingPlayback(engine){for(const s of engine.heliosKingStates?.values()||[]){s.stopped=true;s.adapter.suspended=true;s.adapter.stopAmbient();s.adapter.activeProps?.destroy();s.adapter.activeFx?.destroy();s.adapter.aura.render(s.adapter.aura.time);}}
export function clearHeliosKingActors(engine){for(const s of engine.heliosKingStates?.values()||[]){s.stopped=true;s.adapter.destroy();}engine.heliosKingStates?.clear();}
export function playHeliosKingBasic(engine,options={},fallback=()=>false){
 const {attacker:actor,target}=options;
 if(!engine.isAlive(actor)||!engine.isAlive(target))return false;
 const s=engine.heliosKingStates?.get(actor);if(!s){warmHeliosKingActor(engine,actor);return fallback();}
 s.stopped=false;s.adapter.suspended=false;
 return s.adapter.attack({...options,action:HELIOS_KING_BASIC_FORMS[s.basicCount++%HELIOS_KING_BASIC_FORMS.length].visualMode});
}
export function playHeliosKingArea(engine,event){
 const actor=engine.combatantById(event.actorId);
 if(actor?.cardId!==HELIOS_KING_CODE||event.type!==HELIOS_KING_AREA_EVENT||event.battleMode!=='PVE'||!HELIOS_KING_AREA_SKILLS.some(s=>s.id===event.skillId))return true;
 const hits=[...new Map((event.hits||[]).map(hit=>[hit.targetId,hit])).values()].filter(hit=>{const target=engine.combatantById(hit.targetId);return target&&!target.root.destroyed&&target.team!==actor.team;});
 if(!hits.length)return true;
 const s=engine.heliosKingStates?.get(actor);
 if(!s||!engine.isAlive(actor)){
  if(actor.hp>0)warmHeliosKingActor(engine,actor);
  for(const hit of hits){const target=engine.combatantById(hit.targetId);
   if(Number.isFinite(hit.targetHpAfter))engine.syncTargetHp(target,engine.eventHpPercent(target,hit.targetHpAfter,hit.targetMaxHp));
   if(Number.isFinite(hit.targetShieldAfter))engine.syncTargetShield(target,hit.targetShieldAfter,hit.targetMaxShield);
   if(hit.dodge)engine.queueBanner('빗나감',actor.accent,target.name);else engine.showAccountBattleUnitDamage(target,{damage:(hit.damage||0)+(hit.absorbed||0),compactArea:hits.length>1});
  }return true;
 }
 s.stopped=false;s.adapter.suspended=false;
 const action=HELIOS_KING_AREA_SKILLS.find(s=>s.id===event.skillId).visualMode;
 return s.adapter.attack({action,hits,target:engine.combatantById(hits[0].targetId)});
}
