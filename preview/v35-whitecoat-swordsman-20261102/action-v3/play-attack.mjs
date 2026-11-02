import {gsap} from 'gsap';
import {action,elapsedAt,elapsedDuration,flightAt} from './timing.mjs';
export async function playTempest(adapter,{target,damage=0,targetHp=null,targetShield=null,onImpact=()=>{}}={}){
 const e=adapter.engine,a=adapter.actor;if(!e.isAlive(a)||!e.isAlive(target))return false;
 e.settlePendingTails([a,target]);adapter.busy=true;adapter.skill='skill_tempest';adapter.begin('skill_tempest');a.state='ATTACK';
 const epoch=e.playbackEpoch,c={time:0},start={x:a.root.x,y:a.root.y},reaction={x:target.view.x,y:target.view.y},hudY=a.hud.y,visualContacts=[];let applied=false;
 const resetVisuals=()=>{if(!a.hud.destroyed)a.hud.y=hudY;if(!target.view.destroyed)target.view.position.set(reaction.x,reaction.y);};adapter.tempestVisualCleanup=resetVisuals;
 const valid=()=>!adapter.destroyed&&!a.root.destroyed&&!target.root.destroyed&&a.hp>0&&e.playbackEpoch===epoch;
 const direction=target.root.x>=start.x?1:-1,unit=Math.abs(a.root.scale.x),destination=target.root.x-direction*190*unit;
 const moves=[{at:.21,duration:.09,ease:'power3.in',to:{x:destination,y:target.root.y}},{at:.48,duration:.16,ease:'power2.inOut',to:{x:destination+direction*12*unit,y:target.root.y}},{at:.84,duration:.38,ease:'power1.inOut',to:{x:destination+direction*28*unit,y:target.root.y}},{at:action.returnTime,duration:action.returnDuration,ease:'power2.inOut',to:start}];
 let previous=start;for(const m of moves){m.from=previous;m.easing=gsap.parseEase(m.ease);previous=m.to;}
 const rootAt=time=>{let p=start;for(const m of moves){if(time<m.at)break;const u=m.easing(Math.max(0,Math.min(1,(time-m.at)/m.duration)));p={x:m.from.x+(m.to.x-m.from.x)*u,y:m.from.y+(m.to.y-m.from.y)*u};}return p;};
 const fx=adapter.effects?.begin(adapter,target,'skill_tempest',{rootAt});
 const render=time=>{if(!valid())return;const p=rootAt(time);a.root.position.set(p.x,p.y);adapter.render(time);a.hud.y=hudY-flightAt(time).y*adapter.rig.scale.y;fx?.render(time);let kick=0;for(const b of action.visualBeats){const age=time-b.time;if(age>=0&&age<.12)kick+=(b.id==='slam'?12:6)*Math.exp(-age*24)*Math.cos(age*60);}target.view.position.set(reaction.x+direction*kick,reaction.y-Math.abs(kick)*.15);};
 const result=await e.timeline(t=>{
  let nativeStart=0,elapsed=0;
  for(const beat of action.visualBeats){t.to(c,{time:beat.time,duration:beat.time-nativeStart,ease:'none'},elapsed);elapsed+=beat.time-nativeStart;
   t.call(()=>{if(!valid()||visualContacts.includes(beat.id))return;visualContacts.push(beat.id);render(beat.time);adapter.contacts.push({mode:'skill_tempest',visual:beat.id,nativeTime:beat.time,elapsedTime:elapsedAt(beat.time),epoch});
    if(beat.time===action.damageTime&&!applied){applied=true;if(targetHp!==null)e.syncTargetHp(target,Number(targetHp));if(targetShield!==null)e.syncTargetShield(target,Number(targetShield));onImpact(target);e.showAccountBattleUnitDamage(target,{damage});}
   },[],elapsed);elapsed+=beat.hold;nativeStart=beat.time;
  }
  t.to(c,{time:action.duration,duration:action.duration-nativeStart,ease:'none'},elapsed);
  t.eventCallback('onUpdate',()=>render(c.time));
 },()=>{fx?.destroy();if(!a.root.destroyed)a.root.position.set(start.x,start.y);resetVisuals();if(adapter.tempestVisualCleanup===resetVisuals)adapter.tempestVisualCleanup=null;adapter.busy=false;if(!adapter.destroyed&&a.hp>0){a.state='IDLE';adapter.idle();}},null,{owners:[a,target]});
 e.lastMercenaryPlayback={code:a.cardId,mode:'skill_tempest',clockOwner:'V3_REGISTERED_GSAP',spineAutoUpdate:false,damageApplications:applied?1:0,contactSeconds:elapsedAt(action.damageTime),nativeContactSeconds:action.damageTime,durationSeconds:elapsedDuration,wholePoseAttachments:true,visualContacts,hitstopHolds:action.visualBeats.map(b=>b.hold)};return result;
}
