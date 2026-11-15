import {gsap} from 'gsap';
import {SpineBattleAdapter} from './SpineBattleAdapter.mjs';
import {ACTIONS,prepareStrike,BLUEGEAR_EVENT} from './skills.mjs';
export class BlueGearBattleAdapter extends SpineBattleAdapter{
 constructor(e,a,rig,{effects}){super(e,a,rig,{bodyPixels:500,bodyHeight:300,effects});rig.position.set(0,0);rig.label='BLUEGEAR_SPINE';this.skill='idle';this.requestToken=0;}
 render(t){if(this.destroyed||this.suspended)return;super.render(t+1e-7);this.clock.time=t;this.effects?.updateCompanion();}
 idle(){if(this.destroyed||this.suspended||this.actor.hp<=0||!this.engine.visible)return;this.busy=false;this.skill='idle';this.begin('idle');this.rig.visible=true;const c={time:0};const instance=gsap.timeline({repeat:-1}).to(c,{time:3,duration:3,ease:'none',onUpdate:()=>this.render(c.time)});this.ambient={instance,settle:()=>this.stopAmbient()};this.timeline=instance;this.engine.simpleTimelines.add(this.ambient);}
 setState(state){
  if(this.destroyed)return;
  if(state==='DEAD'){this.requestToken++;this.effects.clear();this.busy=false;this.rig.visible=true;this.playUtility('death',.78);return;}
  if(this.busy)return;
  if(state==='HIT'){this.playUtility('hit',.48);return;}
  if(state==='IDLE'||state==='MOVE')this.idle();
 }
 async playUtility(action,duration){
  if(this.destroyed)return;this.busy=true;this.skill=action;this.begin(action);const c={t:0},e=this.engine,a=this.actor,start={x:a.root.x,y:a.root.y};
  return e.timeline(t=>{t.to(c,{t:duration,duration,ease:'none',onUpdate:()=>this.render(c.t)},0);if(action==='move')t.to(a.root,{x:start.x+(a.team==='ALLY'?1:-1)*50*Math.abs(a.root.scale.x),duration:duration/2,ease:'none',repeat:1,yoyo:true},0);},
  ()=>{if(!a.root.destroyed)a.root.position.set(start.x,start.y);this.busy=false;if(!this.destroyed&&a.hp>0&&e.visible)this.idle();},e.actionPlaybackSpeed(),{owners:[a]});
 }
 async attack(options={}){
  const e=this.engine,a=this.actor,mode=ACTIONS[options.action]?options.action:'attack_basic',def=ACTIONS[mode],strike=prepareStrike(e,a,options);
  if(this.busy||!strike.primary||!e.isAlive(a)||!e.visible)return false;
  this.busy=true;const token=++this.requestToken,epoch=e.playbackEpoch;
  try{await this.effects.preload(mode);}catch(error){this.busy=false;throw error;}
  if(this.destroyed||token!==this.requestToken||epoch!==e.playbackEpoch||!e.visible){this.busy=false;return false;}
  e.settlePendingTails(strike.owners);this.skill=mode;this.begin(mode);a.state='ATTACK';
  const start={x:a.root.x,y:a.root.y},c={time:0},fx=this.effects.begin(this,mode,strike.targets);
  let applied=false;const valid=()=>!this.destroyed&&!a.root.destroyed&&a.hp>0&&e.playbackEpoch===epoch;
  const result=await e.timeline(t=>{
   t.to(c,{time:def.duration,duration:def.duration,ease:'none'},0);
   t.call(()=>{if(!valid()||applied)return;applied=true;this.render(def.contact);fx.render(def.contact);strike.apply();this.contacts.push({mode,contact:def.contact,targets:strike.count});},[],def.contact);
   t.eventCallback('onUpdate',()=>{if(valid()){this.render(c.time);fx.render(c.time);}});
  },()=>{fx.destroy();if(!a.root.destroyed)a.root.position.set(start.x,start.y);this.busy=false;if(!this.destroyed&&a.hp>0){a.state='IDLE';if(e.visible)this.idle();}},e.actionPlaybackSpeed(),{owners:strike.owners});
  e.lastMercenaryPlayback={code:a.cardId,mode,clockOwner:'V3_REGISTERED_GSAP',damageApplications:strike.count,targets:strike.targets.map(t=>t.id),duration:def.duration,spineAutoUpdate:false,mechanicalSummons:true};return result;
 }
 destroy(){if(this.destroyed)return;this.requestToken++;this.effects.dispose();super.destroy();}
}
