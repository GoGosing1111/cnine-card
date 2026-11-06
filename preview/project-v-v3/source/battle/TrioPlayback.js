import {TrioFX} from './trio/TrioFX.mjs';
import {BOSSES,bossByKey} from '../../../../shared/apocalypse-trio-v1.mjs';
import {TrioActorMotion,configureTrioActors} from './trio/TrioActorMotion.mjs';
export async function playTrioSkill(engine,event,showApocalypseStatus){
 const skill=BOSSES.flatMap(b=>b.skills).find(s=>s.code===event.skillCode);if(!skill)return false;
 const epoch=engine.playbackEpoch,session=engine.battleData;
 const hits=event.hits||[],targets=hits.map(h=>engine.combatantById(h.targetId)).filter(Boolean);if(!targets.length)return false;
 const actor=engine.combatantById(event.actorId);
 const record={boss:skill.boss,code:skill.code,kind:skill.kind,impacts:0,targets:0,damage:0,duration:skill.duration,authority:'SERVER_TIMELINE',motionActorId:actor?.id,motionOwner:'EXISTING_BATTLE_CHARACTER',cut:'STATIC_IMAGE_ONLY'};
 const apply=()=>{
  if(record.impacts||engine.disposed||engine.playbackEpoch!==epoch||engine.battleData!==session)return;
  record.impacts++;
  for(const hit of hits){const target=engine.combatantById(hit.targetId);if(!target)continue;
   if(hit.statuses)showApocalypseStatus(engine,{targetId:hit.targetId,statuses:hit.statuses});
   if(Number.isFinite(hit.targetHpAfter))engine.syncTargetHp(target,engine.eventHpPercent(target,hit.targetHpAfter,hit.targetMaxHp));
   if(Number.isFinite(hit.targetShieldAfter))engine.syncTargetShield(target,hit.targetShieldAfter);
   if(hit.damage>0)engine.showAccountBattleUnitDamage(target,{damage:hit.damage+Number(hit.absorbed||0),critical:false,playbackRate:engine.paceScale||1});
   record.targets++;record.damage+=Number(hit.damage||0);
  }
 };
 let timer;const textures=await Promise.race([TrioFX.preload(skill.boss).catch(()=>null),new Promise(resolve=>{timer=setTimeout(()=>resolve(null),1800);})]);clearTimeout(timer);
 if(engine.disposed||engine.playbackEpoch!==epoch||engine.battleData!==session)return false;
 engine.lastTrioPlayback=record;(engine.trioRecords??=[]).push(record);
 engine.queueBanner(skill.name,bossByKey(skill.boss).color,bossByKey(skill.boss).name);
 if(!textures||!actor?.fullBodySprite){apply();return true;}
 configureTrioActors(engine);engine.settlePendingTails?.([actor]);
 const points=targets.map(t=>({x:t.root.x,y:t.root.y})),motion=new TrioActorMotion(engine,actor,skill,textures[3],points);
 const fx=new TrioFX(skill,textures,points,{viewport:engine.scene,reducedMotion:engine.reducedMotion,actorMotion:motion}).attach(engine.effectLayer);
 const release=()=>{fx.release();if(engine.activeTrioFX===fx)engine.activeTrioFX=null;};fx.onCancel=release;
 engine.activeTrioFX=fx;engine.trioPlaybackTime=0;
 await engine.timeline(tl=>fx.play(tl,{onImpact:apply,onSample(t){engine.trioPlaybackTime=t;}}),release,1,{releaseAt:skill.duration,owners:[actor]});
 return true;
}
