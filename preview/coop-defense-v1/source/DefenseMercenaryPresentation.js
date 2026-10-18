import {LEONEL_CODE} from '../../../shared/mercenary-leonel-v1.mjs';
import {resumeLeonelPlayback} from '../../project-v-v3/source/battle/LeonelCombatPlayback.js';
import {Container} from 'pixi.js';
import {gsap} from 'gsap';
import {setupV3MercenaryActor,disposeV3MercenaryPresentation} from '../../project-v-v3/source/battle/MercenaryCombatPlayback.js';
import {resumeLimitedPlayback} from '../../project-v-v3/source/battle/LimitedMercenaryPlayback.js';
import {resumeShiranuiPlayback} from '../../project-v-v3/source/battle/ShiranuiCombatPlayback.js';
import {resumeKaironPlayback} from '../../project-v-v3/source/battle/KaironCombatPlayback.js';
import {resumeJinmuPlayback} from '../../project-v-v3/source/battle/JinmuCombatPlayback.js';
import {resumeJokroPlayback} from '../../project-v-v3/source/battle/JokroCombatPlayback.js';
import {resumeHeliosPlayback} from '../../project-v-v3/source/battle/HeliosCombatPlayback.js';
import {resumeAzantPlayback} from '../../project-v-v3/source/battle/AzantCombatPlayback.js';

// One lightweight playback context per mercenary, sharing the field and Pixi
// renderer. A second caster or incoming hit cannot cancel another one's skill.
export function defenseMercenaryPresentation(engine,actor){
 const layer=new Container({label:'DefenseV3Mercenary:'+actor.id});engine.effectLayer.addChild(layer);
 const ctx=Object.assign(Object.create(engine),{
  effectLayer:layer,mercenaries:[actor],mercenaryEpoch:1,playbackEpoch:1,mercenaryDisposed:false,
  mercenarySequences:new Map(),mercenaryLoads:new Map(),mercenaryHitIndices:new Map(),
  simpleTimelines:new Set(),activeTimelines:new Set(),queue:[],pendingTails:new Map(),formationCoop:true,mercenaryFx:null,
  camera:Object.assign(Object.create(engine.camera),{reset(){},addShake(){}}),
  combatantById:id=>engine.actors.get(id),
  isAlive:a=>!!a&&!a.root.destroyed&&(a.unitData.hp>0||ctx.targets?.has(a.id)),
  // The latest snapshot alone owns bars. Delayed visual callbacks cannot undo
  // later damage, healing, death or resurrection.
  syncTargetHp(){},syncTargetShield(){},showAccountBattleUnitDamage(){},
  queueBanner(name){actor.skillLabel.text=name||'';actor.skillLabelUntil=performance.now()+2000;},
  setFormationMercenaries(){},sortCombatDepth(){},settlePendingTails(){},
  soundEnabled:false
 });
 // Defense prints each authoritative receipt once in its field coordinates.
 // Legacy V3 attacks also request a HUD number (zero for cosmetic playback);
 // keep that pooled label non-rendering, then restore it before returning it.
 ctx.pools=Object.assign(Object.create(engine.pools),{damage:{
  acquire(){const label=engine.pools.damage.acquire();label.renderable=false;return label;},
  release(label){label.renderable=true;engine.pools.damage.release(label);}
 }});
 Object.defineProperties(ctx,{
  visible:{get:()=>engine.visible&&actor.root.visible&&actor.unitData.hp>0&&!actor.unitData.move&&!ctx.stopped&&['PREP','WAVE'].includes(engine.state?.phase)},
  allies:{get:()=>engine.allies},enemies:{get:()=>engine.enemies},characters:{get:()=>engine.characters}
 });
 ctx.timeline=(build,cleanup=()=>{},fixedTimeScale=null)=>new Promise(resolve=>{
  let done=false;const finish=value=>{if(done)return;done=true;ctx.simpleTimelines.delete(entry);ctx.activeTimelines.delete(entry);cleanup();resolve(value);};
  const instance=gsap.timeline({paused:true,onComplete:()=>finish(true),onInterrupt:()=>finish(false)}),entry={instance,settle:finish};
  ctx.simpleTimelines.add(entry);ctx.activeTimelines.add(entry);build(instance);
  const speed=actor.cardId===LEONEL_CODE?(Number(fixedTimeScale)||1):ctx.basic?Math.max(Number(fixedTimeScale)||1,instance.duration()/Math.max(.4,(actor.unitData.interval||1200)/1000*.88)):Number(fixedTimeScale)||1.3;
  instance.timeScale(engine.reducedMotion?Math.max(speed,8):speed);instance.play(0);
 });
 const states=()=>['cryvernStates','berkanStates','limitedStates','heliosStates','jinmuStates','jokroStates','leonelStates','kaironStates','shiranuiStates','azantStates'].flatMap(k=>[...(ctx[k]?.values()||[])]);
 const timelinePause=paused=>{
  for(const entry of ctx.simpleTimelines)paused?entry.instance.pause():entry.instance.resume();
  for(const state of states()){const timeline=state.fx?.timeline||state.knight?.timeline;if(timeline)(paused?timeline.pause():timeline.resume());}
 };
 ctx.ready=setupV3MercenaryActor(ctx,actor).then(()=>{ctx.prepared=true;timelinePause(!ctx.visible);}).catch(error=>{ctx.error=error.message;throw error;});
 // A multi-impact server skill may arrive in one poll. Preserve those impacts;
 // ordinary basics never queue behind a cinematic and cannot build a backlog.
 ctx.play=async(event,basic=false)=>{
  if(!ctx.visible||!ctx.prepared)return false;
  if(ctx.busy){if(!basic&&ctx.queue.length<8)ctx.queue.push({event,received:performance.now()});return false;}
  const epoch=ctx.playbackEpoch;
  ctx.busy=true;ctx.basic=basic;ctx.targets=new Set([event.targetId,...(event.targetIds||[]),...(event.hits||event.impacts||[]).map(h=>h.targetId)].filter(Boolean));
  actor.cooperativeActionActive=true;
  try{
   await ctx.ready;if(epoch!==ctx.playbackEpoch||!ctx.visible||actor.root.destroyed)return false;
   const result=basic?await engine.normalAttack.call(ctx,0,{attacker:actor,target:engine.actors.get(event.targetId),damage:0}):await engine.playMercenaryEvent.call(ctx,event);
   ctx.played=(ctx.played||0)+1;ctx.lastPlayed={type:event.type,skillId:event.skillId||null,code:actor.cardId};return result;
  }catch(error){ctx.error=error.message;engine.presentationErrors.push({code:actor.cardId,message:error.message});console.error('[Defense V3]',error);return false;}
  finally{ctx.busy=false;ctx.targets=null;actor.cooperativeActionActive=false;
   if(!actor.root.destroyed&&actor.hp>0)actor.setState('IDLE');
   const next=ctx.queue.find(item=>performance.now()-item.received<4000);ctx.queue=next?ctx.queue.slice(ctx.queue.indexOf(next)+1):[];
   if(next&&ctx.visible)void ctx.play(next.event);
  }
 };
 ctx.cancelActive=()=>{if(ctx.busy||ctx.activeTimelines.size)ctx.playbackEpoch++;ctx.queue=[];
  for(const entry of [...ctx.activeTimelines]){entry.instance.kill();entry.settle(false);}ctx.activeTimelines.clear();
  actor.animationController?.kill();actor.cooperativeActionActive=false;
 };
 ctx.update=()=>{
  layer.visible=ctx.visible;layer.alpha=actor.root.alpha;
  const pause=!ctx.visible;
  if(ctx.paused!==pause){ctx.paused=pause;
   if(pause)ctx.cancelActive();
   else if(ctx.prepared){for(const resume of [resumeLimitedPlayback,resumeShiranuiPlayback,resumeKaironPlayback,resumeJinmuPlayback,resumeJokroPlayback,resumeLeonelPlayback,resumeHeliosPlayback,resumeAzantPlayback])resume(ctx);
    if(!ctx.busy&&actor.hp>0)actor.setState('IDLE');}
   timelinePause(pause);
  }
 };
 ctx.dispose=()=>{ctx.stopped=true;ctx.mercenaryDisposed=true;ctx.mercenaryEpoch++;ctx.playbackEpoch++;
  ctx.queue=[];
  for(const entry of [...ctx.simpleTimelines]){entry.instance.kill();entry.settle(false);}ctx.simpleTimelines.clear();
  disposeV3MercenaryPresentation(ctx);layer.destroy({children:true});};
 return ctx;
}
