import {playApocalypseLegionSkill as livePlay,showApocalypseStatus} from '../project-v-v3/source/battle/ApocalypseLegionPlayback.js';
import {SahyeonFX} from './SahyeonFX.mjs';
import {SAHYEON} from './boss.mjs';
export {showApocalypseStatus};
export async function playApocalypseLegionSkill(engine,event){
 const skill=SAHYEON.skills.find(s=>s.code===event.skillCode);if(!skill)return livePlay(engine,event);
 const epoch=engine.playbackEpoch,session=engine.battleData,textures=await SahyeonFX.preload();
 if(engine.disposed||engine.playbackEpoch!==epoch||engine.battleData!==session)return false;
 const hits=event.hits||[],targets=hits.map(h=>engine.combatantById(h.targetId)).filter(Boolean);if(!targets.length)return false;
 const points=targets.map(t=>({x:t.root.x,y:t.root.y}));
 const fx=new SahyeonFX(skill,textures,points,{viewport:engine.scene,reducedMotion:engine.reducedMotion}).attach(engine.effectLayer);
 engine.activeSahyeonFX=fx;engine.queueBanner(skill.name,0xe5cdac,'사현');
 const record=engine.lastSahyeonPlayback={code:skill.code,kind:skill.kind,impacts:0,targets:0,damage:0,duration:skill.duration,authority:'SERVER_TIMELINE'};
 await engine.timeline(tl=>fx.play(tl,{onImpact(){
  record.impacts++;
  for(const hit of hits){const target=engine.combatantById(hit.targetId);if(!target)continue;
   if(hit.statuses)showApocalypseStatus(engine,{targetId:hit.targetId,statuses:hit.statuses});
   if(Number.isFinite(hit.targetHpAfter))engine.syncTargetHp(target,engine.eventHpPercent(target,hit.targetHpAfter));
   if(Number.isFinite(hit.targetShieldAfter))engine.syncTargetShield(target,hit.targetShieldAfter);
   if(hit.damage>0)engine.showAccountBattleUnitDamage(target,{damage:hit.damage+Number(hit.absorbed||0),critical:false,playbackRate:1});
   record.targets++;record.damage+=Number(hit.damage||0);
  }
 },onSample(t){engine.sahyeonPlaybackTime=t;}}),()=>{fx.release();if(engine.activeSahyeonFX===fx)engine.activeSahyeonFX=null;},1,{releaseAt:skill.duration});
 return true;
}
