import {gsap} from 'gsap';
import {SpineBattleAdapter} from '../hakuya/SpineBattleAdapter.mjs';
import {JokroEffects} from './JokroEffects.mjs';
import {JokroAura} from './JokroAura.mjs';
import {makeSwordRoute,routeAt} from './SwordUltimateMotion.mjs';
import registration from './pose-registration.json' with {type:'json'};
import skills from './skills.json' with {type:'json'};
import presentation from './presentation.json' with {type:'json'};
export {skills};
const clamp=x=>Math.max(0,Math.min(1,x)),smooth=x=>{const u=clamp(x);return u*u*(3-2*u);};
export function prepareStrike(engine,attacker,options,skill){
 const valid=t=>!!t&&engine.isAlive(t)&&!t.root?.destroyed&&t.team!==attacker.team&&!t.untargetable,rows=new Map(),applied=new Set();
 if(Array.isArray(options.hits))for(const hit of options.hits){const target=engine.combatantById(hit?.targetId);if(!valid(target)||rows.has(target)||(!skill.area&&options.target&&target!==options.target))continue;rows.set(target,hit);if(!skill.area)break;}
 else if(!skill.area&&valid(options.target))rows.set(options.target,null);
 return {targets:[...rows.keys()],owners:[attacker,...rows.keys()],apply(){for(const[target,hit]of rows){if(applied.has(target)||!valid(target))continue;applied.add(target);const hp=hit?engine.eventHpPercent(target,hit.targetHpAfter,hit.targetMaxHp):options.targetHp,shield=hit?hit.targetShieldAfter:options.targetShield;if(shield!=null)engine.syncTargetShield(target,Number(shield),hit?.targetMaxShield);if(hp!=null)engine.syncTargetHp(target,Number(hp));options.onImpact?.(target);if(hit?.dodge||options.dodge)engine.queueBanner('빗나감',attacker.accent,target.name);else engine.showAccountBattleUnitDamage(target,{damage:hit?Number(hit.damage||0)+Number(hit.absorbed||0):Number(options.damage||0),compactArea:skill.area&&rows.size>1});}},get count(){return applied.size;}};
}
export class JokroBattleAdapter extends SpineBattleAdapter{
 constructor(engine,actor,rig,assets,ghostFactory){super(engine,actor,rig,{bodyPixels:600,bodyHeight:300});this.assets=assets;this.ghostFactory=ghostFactory;this.fxEnabled=true;this.suspended=false;rig.position.set(0,0);rig.label='V35_JIN_JOKRO';this.aura=new JokroAura(this,assets.aura);}
 begin(name){this.auraOffset=(this.aura?.time||0)%4.2;super.begin(name);}
 poseAt(time){let name=this.actionSpec?'guard':this.rig.skeleton.findSlot('body')?.appliedPose?.attachment?.name||'guard';for(const[t,n]of this.actionSpec?.keys||[])if(t<=time+1e-7)name=n;return name;}
 rootAt(time){
  if(!this.travel)return {x:this.actor.baseX,y:this.actor.baseY};const{start,end,spec}=this.travel;
  let u=time<spec.leave?smooth((time-spec.depart)/(spec.arrive-spec.depart)):1-smooth((time-spec.leave)/(spec.home-spec.leave));
  const lift=this.actionSpec?.jump?Math.sin(clamp((time-this.actionSpec.jump.start)/(this.actionSpec.jump.end-this.actionSpec.jump.start))*Math.PI)*this.actionSpec.jump.height*Math.abs(this.actor.root.scale.x):0;
  const orbit=this.actionSpec?.orbit&&time>=spec.depart&&time<this.actionSpec.contact?Math.sin(clamp((time-spec.depart)/(this.actionSpec.contact-spec.depart))*Math.PI*2)*70*Math.abs(this.actor.root.scale.x):0;
  if(this.travel.route){const p=routeAt(this.travel.route,time);return{x:p.x,y:p.y-lift};}
  return {x:start.x+(end.x-start.x)*u+orbit,y:start.y+(end.y-start.y)*u-lift};
 }
 facingAt(time){return this.travel?.route?routeAt(this.travel.route,time).facing:(this.actor.view.scale.x<0?-1:1);}
 socket(name,time=this.clock.time){const pose=registration.poses[this.poseAt(time)],p=pose.sockets[name],root=this.rootAt(time),s=Math.abs(this.actor.root.scale.x)*this.rig.scale.x,facing=this.facingAt(time);return{x:root.x+p[0]*s*facing,y:root.y-p[1]*s};}
 render(time){super.render(time+1e-7);this.clock.time=time;if(this.busy&&this.travel){const p=this.rootAt(time);this.actor.root.position.set(p.x,p.y);this.actor.root.depthSortY=p.y;if(this.travel.route)this.actor.view.scale.x=Math.abs(this.travel.originalViewScale)*this.facingAt(time);this.engine.sortCombatDepth();}this.activeFx?.render(time);this.aura?.render((this.auraOffset||0)+(this.entry?.loop&&this.ambient?this.ambient.instance.totalTime():time));}
 idle(){if(this.destroyed||this.suspended||this.actor.hp<=0)return;this.travel=null;this.actionSpec=null;this.rig.visible=true;this.rig.alpha=1;this.begin('idle');const c={t:0},instance=gsap.timeline({repeat:-1,paused:!this.engine.visible}).to(c,{t:4.2,duration:4.2,ease:'none',onUpdate:()=>this.render(c.t)});this.ambient={instance,settle:()=>this.stopAmbient()};this.timeline=instance;this.engine.simpleTimelines.add(this.ambient);instance.timeScale(this.engine.actionPlaybackSpeed());}
 setFxEnabled(value){this.fxEnabled=!!value;this.activeFx?.render(this.clock.time);this.aura?.render(this.aura.time);}
 attackPlaybackSpeed(){return this.engine.actionPlaybackSpeed()*presentation.combatRate;}
 refreshPlaybackSpeed(){this.ambient?.instance.timeScale(this.engine.actionPlaybackSpeed());this.attackTimeline?.timeScale(this.attackPlaybackSpeed());}
 playState(name,{loop=false}={}){
  if(this.destroyed||this.suspended)return;this.travel=null;this.actionSpec=null;this.rig.visible=true;this.rig.alpha=1;this.begin(name);
  const c={t:0},duration=this.entry.animation.duration,instance=gsap.timeline({repeat:loop?-1:0,paused:!this.engine.visible}).to(c,{t:duration,duration,ease:'none',onUpdate:()=>this.render(c.t)});
  this.entry.loop=loop;this.ambient={instance,settle:()=>this.stopAmbient()};this.timeline=instance;this.engine.simpleTimelines.add(this.ambient);instance.timeScale(this.engine.actionPlaybackSpeed());
  if(!loop)instance.eventCallback('onComplete',()=>{if(name==='dead'){this.engine.simpleTimelines.delete(this.ambient);this.ambient=null;}else if(this.actor.hp>0){this.actor.state='IDLE';this.idle();}});
 }
 setState(state){
  if(this.destroyed)return;
  if(state==='DEAD'){this.engine.settlePendingTails([this.actor]);this.activeFx?.destroy();this.activeFx=null;this.busy=false;this.playState('dead');return;}
  if(this.busy)return;
  if(state==='IDLE')this.idle();else if(state==='MOVE')this.playState('move',{loop:true});else if(state==='HIT')this.playState('hit');else if(state==='EVADE')this.playState('evade');
 }
 async attack(options={}){
  const id=skills[options.action]?options.action:'iaido',skill=skills[id],e=this.engine,a=this.actor;
  if(!skill||this.destroyed||this.busy||this.suspended||!e.isAlive(a))return false;const strike=prepareStrike(e,a,options,skill);if(!strike.targets.length)return false;
  e.settlePendingTails(strike.owners);this.busy=true;this.action=id;this.actionSpec=skill;const target=strike.targets[0],start={x:a.root.x,y:a.root.y},direction=target.root.x>=start.x?1:-1;
  const end={x:target.root.x-direction*(skill.standoff||175)*Math.abs(a.root.scale.x),y:target.root.y},originalViewScale=a.view.scale.x;this.travel={start,end,spec:skill.travel,originalViewScale,...(skill.ultimate?makeSwordRoute(this,id,strike.targets,start,direction):{})};this.begin(id);a.state='ATTACK';
  const epoch=e.playbackEpoch,clock={time:0},hitstop=skill.hitstop??(skill.area?.065:.045);this.hitstop=hitstop;const fx=this.activeFx=new JokroEffects(this,id,strike.targets);
  const valid=()=>!this.destroyed&&!a.root.destroyed&&a.hp>0&&e.playbackEpoch===epoch;
  const result=await e.timeline(t=>{this.attackTimeline=t;t.to(clock,{time:skill.contact,duration:skill.contact,ease:'none'},0);t.to(clock,{time:skill.duration,duration:skill.duration-skill.contact,ease:'none'},skill.contact+hitstop);
   if(this.fxEnabled){e.camera?.addShake(t,{intensity:skill.ultimate?15:skill.area?11:5,duration:skill.ultimate?.28:skill.area?.22:.13,rotation:skill.area?.002:.001,at:skill.contact});for(const beat of skill.visualContacts||[])if(beat<skill.contact-.05)e.camera?.addShake(t,{intensity:5,duration:.10,rotation:.0007,at:beat});}
   t.call(()=>{if(!valid())return;this.render(skill.contact);strike.apply();this.contacts.push({id,time:skill.contact,targets:strike.targets.map(t=>t.id),applications:strike.count});},[],skill.contact);
   t.eventCallback('onUpdate',()=>{if(valid())this.render(clock.time);});
  },()=>{fx.destroy();if(this.activeFx===fx)this.activeFx=null;this.attackTimeline=null;if(clock.time<skill.duration-.001)e.camera?.reset(true);if(!a.root.destroyed){a.root.position.set(start.x,start.y);a.root.depthSortY=start.y;a.view.scale.x=originalViewScale;}this.travel=null;this.busy=false;if(!this.destroyed&&!this.suspended&&a.hp>0){a.state='IDLE';this.idle();}},this.attackPlaybackSpeed(),{owners:strike.owners});
  e.lastMercenaryPlayback={code:a.cardId,mode:id,clockOwner:'V3_REGISTERED_GSAP',spineAutoUpdate:false,damageApplications:strike.count,targetCount:strike.targets.length,contactSeconds:skill.contact,durationSeconds:skill.duration,hitstopSeconds:hitstop,combatRate:presentation.combatRate,wholePoseAttachments:true,authoritative:true,effectTool:'Effekseer 1.70e',production:true};return result;
 }
 destroy(){this.suspended=true;this.engine.settlePendingTails([this.actor]);this.activeFx?.destroy();this.activeFx=null;this.aura?.destroy();super.destroy();}
}
