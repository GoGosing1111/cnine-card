import {gsap} from 'gsap';
import {SpineBattleAdapter} from './SpineBattleAdapter.mjs';
import {ryujinSkillPlacement} from './SkillPlacement.mjs';
export class DrawnBattleAdapterV3 extends SpineBattleAdapter {
 constructor(engine,actor,rig,{frames,effects}={}){super(engine,actor,rig,{bodyPixels:1040,bodyHeight:300,effects});this.frames=frames;rig.position.set(0,0);rig.label='CRIMSON_DRAWN_CELS';this.action='idle';this.pendingFrame=null;this.drawObserver={prerender:()=>{if(this.destroyed||this.suspended)return;if(this.activeContext){const point=this.activeContext.rootAt(this.clock.time);this.actor.root.position.set(point.x,point.y);}const pending=this.pendingFrame;if(!pending)return;this.pendingFrame=null;this.render(pending.bodyTime);this.clock.time=pending.t;pending.fx?.render(pending.t);}};engine.app.renderer.runners.prerender.add(this.drawObserver);}
 begin(name){this.pendingFrame=null;this.action=name;super.begin(name);}
 queueFrame(t,fx=null,bodyTime=t){if(this.destroyed)return;this.clock.time=t;this.pendingFrame={t,fx,bodyTime};}
 render(t){if(this.destroyed)return;super.render(t+1e-6);this.clock.time=t;this.renderCount=(this.renderCount||0)+1;this.effects?.ambient(this,t);}
 idle(){if(this.destroyed||this.suspended||this.actor.hp<=0)return;this.begin('idle');this.rig.visible=true;const c={t:0},instance=gsap.timeline({repeat:-1,paused:!this.engine.visible}).to(c,{t:12,duration:12,ease:'none',onUpdate:()=>this.queueFrame(c.t%2)});this.ambient={instance,settle:()=>this.stopAmbient()};this.engine.simpleTimelines.add(this.ambient);this.refreshAmbientSpeed();}
 refreshAmbientSpeed(){this.ambient?.instance.timeScale(this.engine.actionPlaybackSpeed());}
 setState(state){if(this.destroyed)return;if(state==='DEAD'){this.effects?.stopPersistentFor(this);void this.playState('death',true);return;}if(this.busy)return;if(state==='HIT'){void this.playState('hit');return;}if(state==='IDLE'||state==='MOVE')this.idle();}
 async playState(name,hold=false){if(this.destroyed||!this.frames.states[name])return false;if(name==='death')this.effects?.stopPersistentFor(this);this.engine.settlePendingTails([this.actor]);this.busy=true;this.begin(name);this.rig.visible=true;const c={t:0},duration=this.frames.states[name].duration;return this.engine.timeline(t=>{this.activeTimeline=t;t.to(c,{t:duration,duration,ease:'none',onUpdate:()=>this.queueFrame(c.t)},0);},()=>{this.activeTimeline=null;this.pendingFrame=null;this.busy=false;if(this.destroyed)return;if(hold)this.render(duration);else if(this.actor.hp>0)this.idle();},this.engine.actionPlaybackSpeed(),{owners:[this.actor]});}
 async attack(options={}){
  const e=this.engine,a=this.actor,mode=this.frames.actions?.[options.action]?options.action:'attack_basic',spec=this.frames.actions?.[mode]||{duration:.9,contact:.36};
  const allowed=t=>t&&e.isAlive(t)&&t.team!==a.team&&!t.root?.destroyed&&!t.untargetable,rows=new Map();
  if(Array.isArray(options.hits)){for(const hit of options.hits){const victim=e.combatantById(hit.targetId);if(allowed(victim)&&!rows.has(victim))rows.set(victim,hit);}}else if(allowed(options.target))rows.set(options.target,null);
  const target=rows.has(options.target)?options.target:rows.keys().next().value;if(!target||!e.isAlive(a)||this.busy)return false;
  const owners=[a,...rows.keys()];e.settlePendingTails(owners);this.busy=true;a.state='ATTACK';
  const start={x:a.root.x,y:a.root.y},direction=target.root.x>=start.x?1:-1,epoch=e.playbackEpoch,c={t:0},applied=new Set(),contact=spec.contact??.36,duration=spec.duration;
  const destination={x:target.root.x-direction*170*Math.abs(a.root.scale.x),y:target.root.y};
  const moves=(spec.melee&&!spec.moves?.length?[{at:.015,duration:Math.max(.08,Math.min(.18,contact-.06)),to:'target'},{at:Math.max(contact+.08,duration-.18),duration:.17,to:'start'}]:spec.moves)||[{at:.015,duration:.14,to:'target'},{at:Math.max(contact+.15,duration-.23),duration:.21,to:'start'}];
  let prior=start;const paths=moves.map(m=>{let to=m.to==='start'?start:m.to==='past'?{x:target.root.x+direction*110,y:target.root.y}:destination;const v={...m,from:prior,to,easing:gsap.parseEase(m.ease||'power2.inOut')};prior=to;return v;});
  const placement=options.area?ryujinSkillPlacement({start,targets:[...rows.keys()],cooperative:!!e.formationCoop,duration,reach:170*Math.abs(a.root.scale.x),axis:e.formationCoop&&e.mobile?'y':'x'}):null;
  const rootAt=placement?.rootAt||(t=>{let p=start;for(const m of paths){if(t<m.at)break;const u=m.easing(Math.max(0,Math.min(1,(t-m.at)/m.duration)));p={x:m.from.x+(m.to.x-m.from.x)*u,y:m.from.y+(m.to.y-m.from.y)*u};}return p;});
  const approach=placement?.approachSeconds||0,returnTime=placement?.returnSeconds||0,totalDuration=approach+duration+returnTime;
  c.t=-approach;let fx=null;if(approach)this.begin('move');this.clock.time=c.t;
  const valid=()=>!this.destroyed&&!a.root.destroyed&&!target.root.destroyed&&a.hp>0&&e.playbackEpoch===epoch;
  const startSkill=()=>{if(!valid())return;const point=rootAt(0);a.root.position.set(point.x,point.y);this.begin(mode);fx=this.effects?.begin(this,target,mode,{rootAt,start:placement?.cast||start,impactPoint:placement?.impact,placementMode:placement?.mode,destination,direction,spec});};
  if(!approach)startSkill();
  const result=await e.timeline(t=>{
   this.activeTimeline=t;this.activeContext={mode,spec,rootAt,start,target,placement};t.to(c,{t:duration+returnTime,duration:totalDuration,ease:'none'},0);
   if(approach)t.call(startSkill,[],approach);
   if(returnTime)t.call(()=>{if(valid())this.begin('move');},[],approach+duration);
   t.call(()=>{if(!valid()||spec.noDamage)return;for(const [victim,hit]of rows){if(applied.has(victim)||!allowed(victim))continue;applied.add(victim);const hp=hit?e.eventHpPercent(victim,hit.targetHpAfter,hit.targetMaxHp??hit.maxHp):options.targetHp,shield=hit?hit.targetShieldAfter:options.targetShield;if(hp!=null)e.syncTargetHp(victim,Number(hp));if(shield!=null)e.syncTargetShield(victim,Number(shield),hit?.targetMaxShield);options.onImpact?.(victim);if(hit?.dodge||options.dodge)e.queueBanner('빗나감',a.accent,victim.name);else e.showAccountBattleUnitDamage(victim,{damage:Number((hit?hit.damage:options.damage)||0)+Number(hit?.absorbed||0),compactArea:rows.size>1});}this.contacts.push({mode,contact,epoch,applications:applied.size});if(this.contacts.length>32)this.contacts.shift();},[],approach+contact);
   t.eventCallback('onUpdate',()=>{if(valid()){const point=rootAt(c.t);a.root.position.set(point.x,point.y);const bodyTime=c.t<0?c.t+approach:c.t>duration?c.t-duration:c.t;this.queueFrame(c.t,c.t>=0?fx:null,bodyTime);}});
  },()=>{this.pendingFrame=null;this.activeTimeline=null;this.activeContext=null;fx?.destroy();if(!a.root.destroyed)a.root.position.set(start.x,start.y);this.busy=false;if(!this.destroyed&&!this.suspended&&a.hp>0){a.state='IDLE';this.idle();}},e.actionPlaybackSpeed(),{owners});
  e.lastMercenaryPlayback={code:a.cardId,mode,clockOwner:'V3_REGISTERED_GSAP',spineAutoUpdate:false,individuallyIllustratedCels:true,bodyDeformation:false,damageApplications:applied.size,contactSeconds:contact,durationSeconds:duration,totalDurationSeconds:totalDuration,approachSeconds:approach,returnSeconds:returnTime,placement:placement?{mode:placement.mode,axis:placement.axis,cast:placement.cast,impact:placement.impact}:null,cameraLocked:true};return result;
 }
 destroy(){if(this.destroyed)return;this.pendingFrame=null;this.engine.app?.renderer?.runners?.prerender?.remove(this.drawObserver);super.destroy();}
}
