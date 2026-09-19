import {MangisaSkillFX,loadMangisaAssets} from '../../../mercenary-mangisa-v1/source/MangisaSkillFX.js';
import {mangisaVisualPlan,MANGISA_CODE,MANGISA_DURATION} from '../../../../shared/mercenary-mangisa-v1.mjs';
let manifestPromise;
const loadManifest=()=>manifestPromise||=(fetch('/preview/mercenary-mangisa-v1/manifest.json?v=mangisa-live-1').then(r=>{if(!r.ok)throw Error('MANGISA_MANIFEST');return r.json()}).catch(error=>{manifestPromise=null;throw error}));
export async function preloadMangisaVolley(){
 const assets=await loadMangisaAssets(await loadManifest());
 for(const t of [...assets.impact,...assets.motion])t.destroy(false);
}
export async function playMangisaVolley(engine,event){
 const actor=engine.combatantById(event.actorId),epoch=engine.mercenaryEpoch,playbackEpoch=engine.playbackEpoch;
 const valid=()=>actor&&!actor.root.destroyed&&engine.visible&&epoch===engine.mercenaryEpoch&&playbackEpoch===engine.playbackEpoch;
 if(!valid())return false;
 const manifest=await loadManifest();
 const assets=await loadMangisaAssets(manifest);
 const release=()=>{for(const t of [...assets.impact,...assets.motion])t.destroy(false)};
 if(!valid()){release();return false;}
 const targets=(event.targetIds||[]).map(id=>engine.combatantById(id));
 if(!targets[0]){release();return true;}
 const plan=mangisaVisualPlan(event),clock={time:0};
 engine.settlePendingTails?.([actor,...targets.filter(Boolean)]);
 const fx=new MangisaSkillFX(engine,actor,targets,assets,manifest,plan,()=>{},{authoritative:true,useAuthoredPose:actor.cardId===MANGISA_CODE});
 fx.removeTimeline();engine.mercenaryFx=fx;
 engine.queueBanner(event.skillName,0xf3c475,'금란 연사');
 const sync=(impact,showDamage=false)=>{
  if(!valid())return;const target=engine.combatantById(impact.targetId);if(!target)return;
  engine.syncTargetHp(target,engine.eventHpPercent(target,impact.targetHpAfter));
  engine.syncTargetShield(target,impact.targetShieldAfter,impact.targetMaxShield);
  if(showDamage)engine.showAccountBattleUnitDamage(target,{damage:impact.damage});
 };
 try{
  await engine.timeline(t=>{
   t.to(clock,{time:MANGISA_DURATION,duration:MANGISA_DURATION,ease:'none',onUpdate:()=>{fx.clock.time=clock.time;fx.render(clock.time)}});
   for(const impact of event.impacts||[])t.call(()=>sync(impact,true),[],impact.at);
  });
  if(valid())for(const impact of event.impacts||[])sync(impact);
  engine.lastMercenaryPlayback={skillId:event.skillId,eventType:event.type,impacts:(event.impacts||[]).length,clockOwner:'V3_REGISTERED_GSAP',authoritative:true,frames:16,motionFrames:6};
  return valid();
 }finally{
  fx.destroy();if(engine.mercenaryFx===fx)engine.mercenaryFx=null;
  if(valid()&&actor.hp>0)actor.animationController.setState('IDLE');
 }
}
