import {spine} from './hakuya/vendor/spine-pixi-v8-4.3.13.mjs';
import {createBattleSpineLease} from './BattleAssetMemory.mjs';
import {ASTRA_CODE,ASTRA_ROOT,ASTRA_ART,ASTRA_SKILLS,ASTRA_EVENT} from '../../../../shared/mercenary-astra-v1.mjs';
import {BlueGearEffects} from './astra/BlueGearEffects.mjs';
import {BlueGearBattleAdapter} from './astra/BlueGearBattleAdapter.mjs';
import {prepareStrike} from './astra/skills.mjs';
const root='/'+ASTRA_ROOT,skeleton=root+'bluegear.json',atlas=root+'bluegear.atlas';
const leaseFactory=createBattleSpineLease(skeleton,atlas,2,spine.Spine.getSkeletonCacheKey({skeleton,atlas}),{pagePaths:[root+'bluegear-9151c6390831.webp',root+'bluegear-9151c6390831_2.webp']});
export function astraBattleArt(code){return code===ASTRA_CODE?{...ASTRA_ART,spriteUrl:root+'guard.webp',footAnchor:{x:445/1024,y:1498/1536},fullBodyHeight:399.6,bodyHeight:300,calmIdle:true}:null;}
export function setupAstraActor(engine,actor){
 if(actor.cardId!==ASTRA_CODE)return null;if(actor.astraReady)return actor.astraReady;
 const lease=leaseFactory(),epoch=engine.mercenaryEpoch;let fx,installed=false;
 const pending=(async()=>{fx=await BlueGearEffects.create(engine);await Promise.all([lease.ready,fx.preload('all')]);
  if(engine.mercenaryDisposed||actor.root.destroyed||epoch!==engine.mercenaryEpoch){fx.dispose();lease.release();return null;}
  actor.animationController.kill();actor.restoreNeutralAvatarPose?.();
  const rig=spine.Spine.from({skeleton,atlas,autoUpdate:false,ticker:engine.app.ticker}),adapter=new BlueGearBattleAdapter(engine,actor,rig,{effects:fx});
  actor.setAnimationAdapter(adapter);fx.setCompanion(actor);(engine.astraActors||=new Map()).set(actor,{adapter,lease});installed=true;return adapter;
 })().catch(error=>{actor.astraReady=null;fx?.dispose();lease.release();throw error;}).finally(()=>{engine.astraLoads?.delete(actor);if(!installed)lease.release();});
 (engine.astraLoads||=new Map()).set(actor,pending);actor.astraReady=pending;return pending;
}
export function clearAstraActors(engine){for(const [actor,{adapter,lease}]of engine.astraActors||[]){actor.astraReady=null;adapter.destroy();lease.release();}engine.astraActors?.clear();}
export function pauseAstraActors(engine){for(const {adapter}of engine.astraActors?.values()||[]){adapter.suspended=true;adapter.requestToken++;adapter.stopAmbient();adapter.effects.clear();}}
export function resumeAstraActors(engine){for(const {adapter}of engine.astraActors?.values()||[]){adapter.suspended=false;if(!adapter.busy&&!adapter.destroyed)adapter.idle();}}
export async function playAstraSkill(engine,actor,event){
 const skill=ASTRA_SKILLS.find(s=>s.id===event.skillId);if(event.type!==ASTRA_EVENT||!skill||skill.pveOnly&&event.battleMode!=='PVE')return true;
 const hits=[...new Map((event.hits||[]).map(h=>[h.targetId,h])).values()].filter(h=>{const t=engine.combatantById(h.targetId);return t&&!t.root.destroyed&&t.team!==actor.team;});if(!hits.length)return true;
 const options={action:skill.visualMode,hits,target:engine.combatantById(hits[0].targetId)},adapter=await setupAstraActor(engine,actor);
 if(!adapter||!engine.isAlive(actor)){prepareStrike(engine,actor,options).apply();return true;}
 adapter.suspended=false;return adapter.attack(options);
}
