import {RagnielSkillFX,loadRagnielAssets} from '../../../mercenary-ragniel-v1/source/RagnielSkillFX.js';
import {makePlan} from '../../../mercenary-ragniel-v1/skill.mjs';
import {RAGNIEL_CODE} from '../../../../shared/mercenary-ragniel-v1.mjs';
let manifestPromise;
const loadManifest=()=>manifestPromise||=(fetch('/preview/mercenary-ragniel-v1/manifest.json?v=ragniel-live-1').then(r=>{if(!r.ok)throw Error('RAGNIEL_MANIFEST');return r.json()}).catch(error=>{manifestPromise=null;throw error}));
const release=assets=>{for(const frames of [...Object.values(assets.motion),...Object.values(assets.effects)])for(const texture of frames)texture.destroy(false);};
export async function preloadRagniel(){release(await loadRagnielAssets(await loadManifest()));}
export function ragnielPlaybackPlan(mode,contacts){
 const cancelled=mode==='ultimate'&&!contacts.some(c=>c.at===2.42);
 const plan=makePlan({mode,cancelAt:cancelled?1.78:null});
 return {...plan,duration:plan.stop??plan.duration,contacts:[...new Set(contacts.filter(c=>!c.dodge).map(c=>c.at))],damageAuthority:'SERVER_ONLY'};
}
async function playback(engine,actor,targets,mode,contacts){
 const epoch=engine.mercenaryEpoch,playbackEpoch=engine.playbackEpoch;
 const valid=()=>actor&&!actor.root.destroyed&&engine.visible&&epoch===engine.mercenaryEpoch&&playbackEpoch===engine.playbackEpoch&&targets.every(t=>t&&!t.root.destroyed);
 if(!valid())return false;
 const manifest=await loadManifest(),assets=await loadRagnielAssets(manifest);
 if(!valid()){release(assets);return false;}
 const plan=ragnielPlaybackPlan(mode,contacts),clock={time:0};
 engine.settlePendingTails?.([actor,...targets]);
 const fx=new RagnielSkillFX(engine,actor,targets,assets,manifest,plan,()=>{},{authoritative:true,useAuthoredPose:actor.cardId===RAGNIEL_CODE});
 fx.removeTimeline();engine.mercenaryFx=fx;
 try{
  await engine.timeline(t=>{
   t.to(clock,{time:plan.duration,duration:plan.duration,ease:'none',onUpdate:()=>{if(valid()){fx.clock.time=clock.time;fx.render(clock.time);}}});
   for(const contact of contacts)t.call(()=>{if(valid())contact.apply();},[],contact.at);
  });
  engine.lastMercenaryPlayback={skillId:mode==='ultimate'?'MS-046':null,eventType:mode==='ultimate'?'MERCENARY_JUDGMENT':'ATTACK',impacts:contacts.length,clockOwner:'V3_REGISTERED_GSAP',authoritative:true,motionFrames:26,frames:28};
  return valid();
 }finally{
  fx.destroy();if(engine.mercenaryFx===fx)engine.mercenaryFx=null;
  if(valid()&&actor.hp>0)actor.animationController.setState('IDLE');
 }
}
export async function playRagnielJudgment(engine,event){
 const actor=engine.combatantById(event.actorId),targets=(event.targetIds||[]).map(id=>engine.combatantById(id)).filter(Boolean);
 if(!actor||!targets.length)return true;
 engine.queueBanner(event.skillName,0xf5d582,actor.name||'종언의 백금성역');
 const contacts=(event.impacts||[]).map(impact=>({at:impact.at,dodge:impact.dodge,apply(){
  const target=engine.combatantById(impact.targetId);if(!target)return;
  engine.syncTargetHp(target,engine.eventHpPercent(target,impact.targetHpAfter));
  engine.syncTargetShield(target,impact.targetShieldAfter,impact.targetMaxShield);
  if(impact.dodge)engine.queueBanner('빗나감',0xf5d582,event.skillName);
  else engine.showAccountBattleUnitDamage(target,{damage:impact.damage});
 }}));
 return playback(engine,actor,targets,'ultimate',contacts);
}
export function playRagnielBasic(engine,{attacker:actor,target,damage=0,targetHp=null,targetShield=null,onImpact=()=>{}}={}){
 if(!engine.isAlive(actor)||!engine.isAlive(target))return false;
 return playback(engine,actor,[target],'slash',[{at:.66,apply(){
  if(targetHp!==null&&Number.isFinite(Number(targetHp)))engine.syncTargetHp(target,Number(targetHp));
  if(targetShield!==null&&Number.isFinite(Number(targetShield)))engine.syncTargetShield(target,Number(targetShield));
  onImpact(target);engine.showAccountBattleUnitDamage(target,{damage});
 }}]);
}
