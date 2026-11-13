import {spine} from './hakuya/vendor/spine-pixi-v8-4.3.13.mjs';
import {createBattleSpineLease} from './BattleAssetMemory.mjs';
import {BLUE_GEAR_MERCENARIES,BLUE_GEAR_MEDIA} from '../../../../shared/mercenary-blue-gear-catalog-v1.mjs';
import {BLUE_GEAR_RESOURCES} from '../../../../shared/mercenary-blue-gear-resources-v1.mjs';
import {blueGearProfile,BLUE_GEAR_EVENT} from '../../../../shared/mercenary-blue-gear-v1.mjs';
import {effects} from './blue-gear/manifest.mjs';
import {loadFighter,BlueGearBattle} from './blue-gear/BlueGearBattle.mjs';

const base='/'+BLUE_GEAR_MEDIA,leases=new Map();
export function blueGearBattleArt(code){
 const card=BLUE_GEAR_MERCENARIES.find(c=>c.code===code);
 if(!card)return null;
 const geometry=BLUE_GEAR_RESOURCES[blueGearProfile(code).id];
 return {...card,spriteUrl:'/'+card.battleSprite,footAnchor:geometry.footAnchor,fullBodyHeight:geometry.guardHeight*300/geometry.bodyPixels,calmIdle:true};
}
export function setupBlueGearActor(engine,actor){
 const profile=blueGearProfile(actor.cardId);
 if(!profile)return null;
 if(actor.blueGearReady)return actor.blueGearReady;
 const epoch=engine.mercenaryEpoch,geometry=BLUE_GEAR_RESOURCES[profile.id],dir=base+'actors/'+profile.id+'/runtime/';
 const skeleton=dir+geometry.skeleton,atlas=dir+geometry.atlas;
 if(!leases.has(profile.id))leases.set(profile.id,createBattleSpineLease(skeleton,atlas,1,spine.Spine.getSkeletonCacheKey({skeleton,atlas})));
 const lease=leases.get(profile.id)();
 const fighter={id:profile.id,skills:geometry.skills};
 const ready=Promise.all([loadFighter(fighter,base,{actors:BLUE_GEAR_RESOURCES},effects),lease.ready]).then(([assets])=>{
  if(engine.mercenaryDisposed||actor.root.destroyed||epoch!==engine.mercenaryEpoch){lease.release();return null;}
  actor.animationController.kill();actor.restoreNeutralAvatarPose?.();
  const adapter=new BlueGearBattle(engine,actor,fighter,assets);
  actor.setAnimationAdapter(adapter);(engine.blueGearActors||=new Map()).set(actor,{adapter,lease});
  return adapter;
 }).catch(error=>{actor.blueGearReady=null;lease.release();throw error;});
 actor.blueGearReady=ready;return ready;
}
export function clearBlueGearActors(engine){
 for(const [actor,{adapter,lease}] of engine.blueGearActors||[]){actor.blueGearReady=null;adapter.destroy();lease.release();}
 engine.blueGearActors?.clear();
}
export function pauseBlueGearActors(engine){for(const {adapter} of engine.blueGearActors?.values()||[]){adapter.suspended=true;adapter.stopAmbient();}}
export function resumeBlueGearActors(engine){for(const {adapter} of engine.blueGearActors?.values()||[]){adapter.suspended=false;if(!adapter.busy&&!adapter.destroyed)adapter.idle();}}
export async function playBlueGearSkill(engine,actor,event){
 if(event.type!==BLUE_GEAR_EVENT)return true;
 const skill=blueGearProfile(actor.cardId).skills.find(s=>s.id===event.skillId);
 if(!skill)return true;
 const hits=[...new Map((event.hits||[]).map(hit=>[hit.targetId,hit])).values()].map(hit=>({hit,target:engine.combatantById(hit.targetId)}))
  .filter(({target})=>target&&!target.root.destroyed&&target.team!==actor.team);
 if(!hits.length)return true;
 const apply=()=>{for(const {target,hit} of hits){
  if(Number.isFinite(hit.targetHpAfter))engine.syncTargetHp(target,engine.eventHpPercent(target,hit.targetHpAfter,hit.targetMaxHp));
  if(Number.isFinite(hit.targetShieldAfter))engine.syncTargetShield(target,hit.targetShieldAfter,hit.targetMaxShield);
  if(hit.dodge)engine.queueBanner('빗나감',actor.accent,target.name);
  else engine.showAccountBattleUnitDamage(target,{damage:(hit.damage||0)+(hit.absorbed||0),compactArea:hits.length>1});
 }};
 const adapter=await setupBlueGearActor(engine,actor);
 if(!adapter||!engine.isAlive(actor)||!engine.isAlive(hits[0].target)){apply();return true;}
 return adapter.attack({target:hits[0].target,action:skill.visualMode,applyHits:apply});
}
