import {gsap} from 'gsap';
import {SpineBattleAdapter} from '../hakuya/SpineBattleAdapter.mjs';
import {SummonedWeapons} from './SummonedWeapons.mjs';
import {RoyalEffects} from './sss-v2/RoyalEffects.mjs';
import {RoyalAura} from './aura-v3/RoyalAura.mjs';
import skills from './skills.json' with {type:'json'};
export {skills};

export function prepareStrike(engine,attacker,options,skill){
 const valid=target=>!!target&&engine.isAlive(target)&&!target.root?.destroyed&&target.team!==attacker.team&&!target.untargetable;
 const rows=new Map(),applied=new Set();
 if(Array.isArray(options.hits))for(const hit of options.hits){
  const target=engine.combatantById(hit?.targetId);
  if(!valid(target)||rows.has(target)||(!skill.area&&options.target&&target!==options.target))continue;
  rows.set(target,hit);if(!skill.area)break;
 }else if(!skill.area&&valid(options.target))rows.set(options.target,null);
 const targets=[...rows.keys()];
 return {targets,owners:[attacker,...targets],
  apply(){for(const[target,hit]of rows){
   if(applied.has(target)||!valid(target))continue;applied.add(target);
   const hp=hit?engine.eventHpPercent(target,hit.targetHpAfter,hit.targetMaxHp):options.targetHp;
   const shield=hit?hit.targetShieldAfter:options.targetShield;
   if(shield!=null)engine.syncTargetShield(target,Number(shield),hit?.targetMaxShield);
   if(hp!=null)engine.syncTargetHp(target,Number(hp));
   options.onImpact?.(target);if(hit?.dodge||options.dodge)engine.queueBanner('빗나감',attacker.accent,target.name);else engine.showAccountBattleUnitDamage(target,{damage:hit?Number(hit.damage||0)+Number(hit.absorbed||0):Number(options.damage||0),compactArea:skill.area&&targets.length>1});
  }},get count(){return applied.size;}
 };
}
export class HeliosBattleAdapter extends SpineBattleAdapter {
 constructor(engine,actor,rig,textures,royalAssets,auraAssets){super(engine,actor,rig,{bodyPixels:600,bodyHeight:300});this.textures=textures;this.royalAssets=royalAssets;this.propsEnabled=true;this.fxEnabled=true;rig.position.set(0,0);rig.label='V35_HELIOS_KING';this.auraOrigin=0;this.aura=new RoyalAura(this,auraAssets);}
 begin(name){this.auraOrigin=this.aura?.time||0;super.begin(name);}
 render(time){super.render(time+1e-7);this.clock.time=time;this.activeProps?.render(time);this.activeFx?.render(time);this.aura?.render(this.auraOrigin+time);}
 idle(){
  if(this.destroyed||this.suspended||this.actor.hp<=0)return;
  this.rig.visible=true;this.begin('idle');const c={t:0};
  // 84 seconds is a common multiple of native idle and all aura periods.
  const instance=gsap.timeline({repeat:-1,paused:!this.engine.visible}).to(c,{t:84,duration:84,ease:'none',onUpdate:()=>this.render(c.t)});
  this.ambient={instance,settle:()=>this.stopAmbient()};this.timeline=instance;this.engine.simpleTimelines.add(this.ambient);this.refreshAmbientSpeed();
 }
 refreshAmbientSpeed(){this.ambient?.instance.timeScale(this.engine.actionPlaybackSpeed());}
 setPropsEnabled(value){this.propsEnabled=!!value;if(this.activeProps)this.activeProps.container.visible=this.propsEnabled;}
 setFxEnabled(value){this.fxEnabled=!!value;this.activeProps?.render(this.clock.time);this.activeFx?.render(this.clock.time);this.aura?.render(this.aura.time);}
 setAuraEnabled(value){this.aura?.setEnabled(value);}
 setState(state){if(state==='DEAD'){this.activeProps?.destroy();this.activeProps=null;this.activeFx?.destroy();this.activeFx=null;this.busy=false;}super.setState(state);this.aura?.render(this.aura.time);}
 async attack(options={}){
  const id=skills[options.action]?options.action:'royal_swords',skill=skills[id],e=this.engine,a=this.actor;
  if(this.destroyed||this.busy||!e.isAlive(a))return false;
  const strike=prepareStrike(e,a,options,skill);if(!strike.targets.length)return false;
  e.settlePendingTails(strike.owners);this.busy=true;this.action=id;this.actionSpec=skill;this.begin(id);a.state='ATTACK';
  const epoch=e.playbackEpoch,start={x:a.root.x,y:a.root.y},clock={time:0},hitstop=this.fxEnabled?(skill.area?.065:.045):0;
  this.hitstop=hitstop;
  this.activeProps=new SummonedWeapons(this,id,strike.targets,this.textures);const props=this.activeProps;
  this.activeFx=new RoyalEffects(this,id,strike.targets,props);const fx=this.activeFx;
  const valid=()=>!this.destroyed&&!a.root.destroyed&&a.hp>0&&e.playbackEpoch===epoch;
  const result=await e.timeline(t=>{
   this.attackTimeline=t;
   t.to(clock,{time:skill.contact,duration:skill.contact,ease:'none'},0);
   t.to(clock,{time:skill.duration,duration:skill.duration-skill.contact,ease:'none'},skill.contact+hitstop);
   if(this.fxEnabled)e.camera?.addShake(t,{intensity:skill.area?13:7,duration:skill.area?.24:.18,rotation:skill.area?.003:.0015,at:skill.contact});
   t.call(()=>{if(!valid())return;this.render(skill.contact);strike.apply();this.contacts.push({id,time:skill.contact,targets:strike.targets.map(t=>t.id),applications:strike.count});},[],skill.contact);
   t.eventCallback('onUpdate',()=>{if(valid())this.render(clock.time);});
  },()=>{
   props.destroy();fx.destroy();if(this.activeProps===props)this.activeProps=null;if(this.activeFx===fx)this.activeFx=null;this.attackTimeline=null;
   if(clock.time<skill.duration-.001)e.camera?.reset(true);
   if(!a.root.destroyed)a.root.position.set(start.x,start.y);this.busy=false;
   if(!this.destroyed&&a.hp>0){a.state='IDLE';this.idle();}
  },e.actionPlaybackSpeed(),{owners:strike.owners});
  e.lastMercenaryPlayback={code:a.cardId,mode:id,clockOwner:'V3_REGISTERED_GSAP',spineAutoUpdate:false,damageApplications:strike.count,targetCount:strike.targets.length,contactSeconds:skill.contact,durationSeconds:skill.duration,hitstopSeconds:hitstop,wholePoseAttachments:true,authoritative:true,effectRevision:'royal-sss-v2+golden-aura-v3',effectTool:'Effekseer 1.70e',summonedWeapons:props.specs.length,aura:true};
  return result;
 }
 destroy(){this.activeProps?.destroy();this.activeProps=null;this.activeFx?.destroy();this.activeFx=null;this.aura?.destroy();super.destroy();}
}
