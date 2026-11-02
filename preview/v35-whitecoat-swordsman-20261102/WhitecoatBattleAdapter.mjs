import {gsap} from 'gsap';
import {SpineBattleAdapter} from '../v35-v3-upgrade-20261101/SpineBattleAdapter.mjs';
import {playTempest} from './action-v3/play-attack.mjs';
import {playWhitecoatSkill,actions} from './skills-v4/play-skill.mjs';
export class WhitecoatBattleAdapter extends SpineBattleAdapter {
 constructor(engine,actor,rig,options={}){super(engine,actor,rig,{bodyPixels:530,bodyHeight:300,...options});rig.position.set(0,0);rig.label='V35_WHITECOAT';this.skill='attack_basic';}
 // Native keys are float32 (for example .4 is .40000000596). Resolve exact
 // author-time seeks to the new attachment, keeping the public clock unchanged.
 render(t){super.render(t+1e-7);this.clock.time=t;}
 idle(){if(this.destroyed||this.actor.hp<=0)return;this.begin('idle');this.rig.alpha=1;this.rig.rotation=0;this.rig.visible=true;}
 setState(state){
  if(this.destroyed)return;
  if(state==='DEAD'){this.tempestVisualCleanup?.();this.effects?.destroy();this.stopAmbient();this.busy=false;this.begin('death');this.render(.65);this.rig.visible=true;return;}
  if(this.busy)return;
  if(state==='HIT'){this.begin('hit');const c={t:0};const instance=gsap.timeline({paused:!this.engine.visible,onComplete:()=>{this.stopAmbient();this.idle();}}).to(c,{t:.38,duration:.38,ease:'none',onUpdate:()=>this.render(c.t)});this.ambient={instance,settle:()=>this.stopAmbient()};this.engine.simpleTimelines.add(this.ambient);return;}
  if(state==='IDLE'||state==='MOVE')this.idle();
 }
 destroy(){this.tempestVisualCleanup?.();super.destroy();}
 async attack({target,damage=0,targetHp=null,targetShield=null,onImpact=()=>{},action='attack_basic'}={}){
  if(actions[action])return playWhitecoatSkill(this,action,{target,damage,targetHp,targetShield,onImpact});
  if(action==='skill_tempest')return playTempest(this,{target,damage,targetHp,targetShield,onImpact});
  const e=this.engine,a=this.actor;if(!e.isAlive(a)||!e.isAlive(target))return false;
  const mode=action==='skill_iai'?'skill_iai':'attack_basic',skill=mode==='skill_iai',contact=skill?.30:.32,duration=skill?1.55:1.18;
  e.settlePendingTails([a,target]);this.busy=true;this.skill=mode;this.begin(mode);a.state='ATTACK';
  const epoch=e.playbackEpoch,c={time:0},start={x:a.root.x,y:a.root.y};let applied=false;
  const valid=()=>!this.destroyed&&!a.root.destroyed&&!target.root.destroyed&&a.hp>0&&e.playbackEpoch===epoch;
  const direction=target.root.x>=start.x?1:-1,reach=(skill?185:190)*Math.abs(a.root.scale.x),destination=target.root.x-direction*reach;
  // One movement definition drives both the actor and historical sword samples.
  const approach=skill?[]:[{at:.035,duration:.135,ease:'power2.inOut',to:{x:destination-direction*8,y:target.root.y}}];
  const moves=[...approach,{at:skill?.21:.28,duration:skill?.09:.04,ease:'power3.in',to:{x:destination,y:target.root.y}},{at:skill?1.16:.79,duration:.25,ease:'power2.inOut',to:start}];
  let previous=start;for(const move of moves){move.from=previous;move.easing=gsap.parseEase(move.ease);previous=move.to;}
  const rootAt=time=>{let p=start;for(const move of moves){if(time<move.at)break;const u=move.easing(Math.max(0,Math.min(1,(time-move.at)/move.duration)));p={x:move.from.x+(move.to.x-move.from.x)*u,y:move.from.y+(move.to.y-move.from.y)*u};}return p;};
  const fx=this.effects?.begin(this,target,mode,{rootAt});
  const result=await e.timeline(t=>{
   t.to(c,{time:duration,duration,ease:'none'},0);
   for(const move of moves)t.to(a.root,{...move.to,duration:move.duration,ease:move.ease},move.at);
   t.call(()=>{if(!valid()||applied)return;applied=true;this.render(contact);fx?.impact();fx?.render(contact);this.contacts.push({mode,contact,epoch});if(targetHp!==null)e.syncTargetHp(target,Number(targetHp));if(targetShield!==null)e.syncTargetShield(target,Number(targetShield));onImpact(target);e.showAccountBattleUnitDamage(target,{damage});},[],contact);
   // Parent onUpdate runs after root movement, avoiding a one-frame FX lag.
   t.eventCallback('onUpdate',()=>{if(valid()){this.render(c.time);fx?.render(c.time);}});
  },()=>{fx?.destroy();if(!a.root.destroyed)a.root.position.set(start.x,start.y);this.busy=false;if(!this.destroyed&&a.hp>0){a.state='IDLE';this.idle();}},null,{owners:[a,target]});
  e.lastMercenaryPlayback={code:a.cardId,mode,clockOwner:'V3_REGISTERED_GSAP',spineAutoUpdate:false,damageApplications:applied?1:0,contactSeconds:contact,durationSeconds:duration,wholePoseAttachments:true};return result;
 }
}
