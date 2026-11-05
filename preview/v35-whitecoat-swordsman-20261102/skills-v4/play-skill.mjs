import {gsap} from 'gsap';
import actions from './actions.json' with {type:'json'};
export {actions};
export const elapsedAt=(action,time)=>time+action.visualBeats.filter(b=>b.time<time-1e-7).reduce((n,b)=>n+b.hold,0);
export async function playWhitecoatSkill(adapter,mode,strike){
 const target=strike.primary;
 const e=adapter.engine,a=adapter.actor,action=actions[mode];if(!action||!e.isAlive(a)||!e.isAlive(target))return false;
 e.settlePendingTails(strike.owners);adapter.busy=true;adapter.skill=mode;adapter.begin(mode);a.state='ATTACK';
 const epoch=e.playbackEpoch,c={time:0},start={x:a.root.x,y:a.root.y},reaction={x:target.view.x,y:target.view.y},hudY=a.hud.y,visualContacts=[];let applied=false;
 const reset=()=>{if(!a.hud.destroyed)a.hud.y=hudY;if(!target.view.destroyed)target.view.position.set(reaction.x,reaction.y);};adapter.tempestVisualCleanup=reset;
 const valid=()=>!adapter.destroyed&&!a.root.destroyed&&!target.root.destroyed&&a.hp>0&&e.playbackEpoch===epoch;
 const direction=target.root.x>=start.x?1:-1,unit=Math.abs(a.root.scale.x),near={x:target.root.x-direction*190*unit,y:target.root.y};
 const moves=mode==='skill_rift'?[{at:.15,duration:.17,ease:'power2.in',to:{x:near.x-direction*90*unit,y:near.y}},{at:.34,duration:.14,ease:'power3.inOut',to:{x:target.root.x+direction*135*unit,y:near.y}},{at:.48,duration:.13,ease:'power3.out',to:{x:target.root.x+direction*180*unit,y:near.y}}]:[{at:mode==='skill_echo'?.19:.12,duration:.18,ease:'power2.inOut',to:near}];
 moves.push({at:action.returnTime,duration:action.returnDuration,ease:'power2.inOut',to:start});let previous=start;for(const m of moves){m.from=previous;m.easing=gsap.parseEase(m.ease);previous=m.to;}
 const rootAt=time=>{let p=start;for(const m of moves){if(time<m.at)break;const u=m.easing(Math.max(0,Math.min(1,(time-m.at)/m.duration)));p={x:m.from.x+(m.to.x-m.from.x)*u,y:m.from.y+(m.to.y-m.from.y)*u};}return p;};
 const fx=adapter.effects?.begin(adapter,target,mode,{rootAt,strike});
 const render=time=>{if(!valid())return;const p=rootAt(time);a.root.position.set(p.x,p.y);adapter.render(time);fx?.render(time);let kick=0;for(const b of action.visualBeats){const age=time-b.time;if(age>=0&&age<.16)kick+=(b.time===action.damageTime?mode==='skill_verdict'?15:10:4)*Math.exp(-age*22)*Math.cos(age*54);}target.view.position.set(reaction.x+direction*kick,reaction.y-Math.abs(kick)*.16);};
 const result=await e.timeline(t=>{let nativeStart=0,elapsed=0;for(const beat of action.visualBeats){t.to(c,{time:beat.time,duration:beat.time-nativeStart,ease:'none'},elapsed);elapsed+=beat.time-nativeStart;t.call(()=>{if(!valid()||visualContacts.includes(beat.id))return;visualContacts.push(beat.id);render(beat.time);adapter.contacts.push({mode,visual:beat.id,nativeTime:beat.time,elapsedTime:elapsedAt(action,beat.time),epoch});if(beat.time===action.damageTime&&!applied){applied=true;strike.apply();}},[],elapsed);elapsed+=beat.hold;nativeStart=beat.time;}t.to(c,{time:action.duration,duration:action.duration-nativeStart,ease:'none'},elapsed);t.eventCallback('onUpdate',()=>render(c.time));},()=>{fx?.destroy();if(!a.root.destroyed)a.root.position.set(start.x,start.y);reset();if(adapter.tempestVisualCleanup===reset)adapter.tempestVisualCleanup=null;adapter.busy=false;if(!adapter.destroyed&&a.hp>0){a.state='IDLE';adapter.idle();}},adapter.motionPlaybackSpeed(),{owners:strike.owners});
 e.lastMercenaryPlayback={code:a.cardId,mode,clockOwner:'V3_REGISTERED_GSAP',spineAutoUpdate:false,damageApplications:strike.count,technique:strike.technique,motionRate:2,contactSeconds:elapsedAt(action,action.damageTime),nativeContactSeconds:action.damageTime,durationSeconds:action.duration+action.visualBeats.reduce((n,b)=>n+b.hold,0),wholePoseAttachments:true,visualContacts,hitstopHolds:action.visualBeats.map(b=>b.hold)};return result;
}
