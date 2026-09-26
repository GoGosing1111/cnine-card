import {NurseHealFX} from '../../../mercenary-nurse-healers-ss-v1/source/NurseHealFX.js';
import {NURSE_SKILL} from '../../../mercenary-nurse-healers-ss-v1/skill.mjs';

// One authored animation for the aggregate server receipt. Never calculate HP here.
export async function playNurseHeal(engine,event){
 const actor=engine.combatantById(event.actorId),epoch=engine.mercenaryEpoch,playbackEpoch=engine.playbackEpoch;
 if(!actor)return true;
 const valid=()=>epoch===engine.mercenaryEpoch&&playbackEpoch===engine.playbackEpoch&&!actor.root.destroyed&&engine.visible;
 const heals=event.heals||[],targets=heals.map(h=>engine.combatantById(h.targetId)).filter(t=>t&&t!==actor&&t.root?.visible&&t.battleActive!==false);
 const sequence=await engine.sequenceFor(event.skillId);if(!sequence||!valid())return false;
 const sync=()=>{if(!valid())return;for(const row of heals){const target=engine.combatantById(row.targetId);if(target&&Number.isFinite(row.targetHpAfter))engine.syncTargetHp(target,engine.eventHpPercent(target,row.targetHpAfter));}};
 engine.settlePendingTails?.([actor,...targets]);
 const fx=new NurseHealFX(engine,actor,targets,sequence,()=>{});fx.removeTimeline();engine.mercenaryFx=fx;
 const time={value:0};engine.queueBanner(event.skillName,0x9fffe0,'아군 회복');
 try{
  await engine.timeline(t=>{
   t.to(time,{value:NURSE_SKILL.duration,duration:NURSE_SKILL.duration,ease:'none',onUpdate:()=>fx.render(time.value)});
   t.call(sync,[],NURSE_SKILL.contactAt);
  });if(valid())sync();return valid();
 }finally{
  engine.lastMercenaryPlayback={skillId:event.skillId,eventType:event.type,targetCount:heals.length,frames:16,authoritative:true};
  fx.destroy();if(engine.mercenaryFx===fx)engine.mercenaryFx=null;
 }
}
