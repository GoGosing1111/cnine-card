import {Assets,Container,Sprite,Texture,Rectangle} from 'pixi.js';
import {gsap} from 'gsap';
import {LIMITED_DUO_ASSETS} from '../../../../shared/mercenary-limited-duo-assets-20261008.mjs';
import {limitedDuo,LIMITED_DUO,LIMITED_DUO_VERSION} from '../../../../shared/mercenary-limited-duo-20261008.mjs';
import {makePlan,sample,clamp} from '../../../mercenary-limited-ayoon-heeya-v3-20261008/skill.mjs';
const mix=(a,b,t)=>a+(b-a)*t;
export function limitedDuoBattleArt(code){
 const c=LIMITED_DUO_ASSETS[code];if(!c)return null;const bodyHeight=312.3894230769231,scale=bodyHeight/c.bodyHeight;
 return {code,name:c.name,sourceArt:c.source,battleSprite:c.sprite.replace(/^\//,''),spriteUrl:c.sprite+'?v='+c.spriteSha256.slice(0,16),footAnchor:{x:c.feet.x/c.cell,y:c.feet.y/c.cell},fullBodyHeight:c.cell*scale,bodyHeight,originalTextureHeight:c.cell*scale};
}
export async function loadDuoAssets(code){
 const spec=LIMITED_DUO_ASSETS[code];if(!spec)throw Error('LIMITED_DUO_ASSETS');
 const [motion,effects]=await Promise.all([Assets.load(spec.atlas+'?v='+spec.atlasSha256.slice(0,16)),Assets.load(spec.effects.url)]);
 const frames=(source,rows)=>rows.map(f=>new Texture({source:source.source,frame:new Rectangle(f.rect.x,f.rect.y,f.rect.width,f.rect.height)}));
 return {spec,motion:frames(motion,spec.frames),effects:frames(effects,spec.effects.frames)};
}
export class LimitedDuoFX{
 constructor(engine,actor,target,assets,plan,onUpdate=()=>{}){
  Object.assign(this,{engine,actor,target,assets,plan,onUpdate});this.clock={time:0};this.speed=1;this.showEffects=true;this.destroyed=false;
  actor.animationController.kill();const s=actor.fullBodySprite;
  this.idle={texture:s.texture,scaleX:s.scale.x,scaleY:s.scale.y,anchorX:s.anchor.x,anchorY:s.anchor.y};
  this.useAuthoredPose=actor.cardId===assets.spec.code;
  this.bodyHeight=actor.art?.bodyHeight||(this.useAuthoredPose?312.3894230769231:actor.fullBodyHeight);this.poseScale=this.bodyHeight/assets.spec.bodyHeight;
  this.layer=new Container({label:'LimitedDuoV3FX'});this.layer.eventMode='none';engine.effectLayer.addChild(this.layer);
  this.pool=Array.from({length:28},()=>{const p=new Sprite();p.visible=false;this.layer.addChild(p);return p;});
  this.captureFormation();this.makeTimeline();this.render(0);
 }
 get time(){return this.clock.time;}
 get playing(){return !!this.timeline&&!this.timeline.paused()&&this.time<this.plan.duration;}
 captureFormation(){this.start={x:this.actor.baseX??this.actor.root.x,y:this.actor.baseY??this.actor.root.y};}
 makeTimeline(){this.removeTimeline();this.timeline=gsap.timeline({paused:true,onUpdate:()=>this.render(this.clock.time),onComplete:()=>{this.engine.simpleTimelines.delete(this.registration);this.render(this.plan.duration);}}).to(this.clock,{time:this.plan.duration,duration:this.plan.duration,ease:'none'}).timeScale(this.speed);this.registration={instance:this.timeline,settle:()=>this.cancel()};}
 removeTimeline(){if(this.registration)this.engine.simpleTimelines.delete(this.registration);this.timeline?.kill();this.timeline=null;this.registration=null;}
 play(){if(this.destroyed)return;if(!this.timeline)this.makeTimeline();if(this.time>=this.plan.duration)this.seek(0);this.engine.simpleTimelines.add(this.registration);this.timeline.play();this.onUpdate(this);}
 pause(){this.timeline?.pause();this.onUpdate(this);}
 seek(t){if(this.destroyed)return;if(!this.timeline)this.makeTimeline();t=clamp(t,0,this.plan.duration);this.timeline.pause().time(t,true);this.clock.time=t;this.render(t);}
 setSpeed(n){this.speed=clamp(Number(n)||1,.25,2);this.timeline?.timeScale(this.speed);this.onUpdate(this);}
 setPlan(p){this.cancel();this.plan=p;this.makeTimeline();this.render(0);}
 cancel(){this.removeTimeline();this.clock.time=0;this.render(0);}
 point(actor,height=0){return this.engine.effectLayer.toLocal(actor.root.toGlobal({x:0,y:-(actor.art?.bodyHeight||actor.fullBodyHeight)*height}));}
 pixel(p){
  if(!this.useAuthoredPose){const q=this.point(this.actor,.56),dir=this.actor.team==='ENEMY'?-1:1;return{x:q.x+dir*this.bodyHeight*Math.abs(this.actor.root.scale.x)*(p.x>this.assets.spec.feet.x?.22:.08),y:q.y};}
  return this.engine.effectLayer.toLocal({x:p.x-this.assets.spec.feet.x,y:p.y-this.assets.spec.feet.y},this.actor.fullBodySprite);
 }
 pose(index){if(!this.useAuthoredPose)return;const s=this.actor.fullBodySprite,f=this.assets.spec.frames[index];s.texture=this.assets.motion[index];s.anchor.set(f.feet.x/this.assets.spec.cell,f.feet.y/this.assets.spec.cell);s.scale.set(this.poseScale);const neutral=this.actor.neutralAvatarPose?.mainSprite;if(neutral){neutral.scaleX=s.scale.x;neutral.scaleY=s.scale.y;}}
 draw(index,p,width,{alpha=1,angle=0,anchor=[.5,.5],blend='normal'}={}){
  if(!this.showEffects||alpha<=0)return;const s=this.pool[this.used++];if(!s)return;s.texture=this.assets.effects[index];s.anchor.set(...anchor);s.position.set(p.x,p.y);s.scale.set(width/s.texture.width);s.rotation=angle;s.alpha=alpha;s.blendMode=blend;s.visible=true;
 }
 render(t){
  if(this.destroyed)return;if(this.actor.root.destroyed||this.target.root.destroyed){this.removeTimeline();return;}
  this.clock.time=t;const state=sample(this.plan,t);this.sample=state;this.pool.forEach(p=>p.visible=false);this.used=0;this.pose(state.pose);
  const spec=this.assets.spec,ayoon=this.plan.spec.id==='ayoon',f=spec.frames[state.pose],foot=this.point(this.target),hit=this.point(this.target,.48);
  if(ayoon&&state.travel){
   // Ground plane is the target's feet. Only the horizontal destination uses
   // the registered cutting edge; no vertical teleport to fabricate contact.
   const hitPose=spec.frames[this.plan.mode==='basic'?2:[2,4,6][state.destination]],sprite=this.actor.fullBodySprite;
   const offset=this.actor.root.parent.toLocal(sprite.toGlobal({x:hitPose.contact.x-spec.feet.x,y:hitPose.contact.y-spec.feet.y}));
   const targetFoot=this.actor.root.parent.toLocal(this.target.root.toGlobal({x:0,y:0}));
   const dx=this.useAuthoredPose?offset.x-this.actor.root.x:(this.actor.team==='ENEMY'?-1:1)*this.bodyHeight*Math.abs(this.actor.root.scale.x)*.55;
   this.actor.root.position.set(mix(this.start.x,targetFoot.x-dx,state.travel),mix(this.start.y,targetFoot.y,state.travel));
  }else this.actor.root.position.set(this.start.x,this.start.y);
  this.engine.sortCombatDepth();
  if(!state.done&&t>0&&this.plan.mode!=='idle'){
   const unit=this.bodyHeight*Math.abs(this.actor.root.scale.y);
   if(ayoon){
    if(state.travel>0&&state.travel<1)this.draw(8+Math.min(3,Math.floor((t%.4)/.4*4)),this.point(this.actor),unit*.75,{anchor:[.72,.83],alpha:.72});
    for(const c of this.plan.contacts){const age=t-c.at;if(age>=-.12&&age<.42){const k=Math.min(3,Math.floor(clamp((age+.12)/.54)*4)),p=this.pixel(f.contact);this.draw(k,p,unit*1.02,{alpha:1-clamp((age-.2)/.22),angle:this.actor.team==='ENEMY'?Math.PI:0});if(!c.dodge&&age>=0)this.draw(4+Math.min(3,Math.floor(age/.42*4)),hit,unit*.7,{alpha:1-clamp((age-.24)/.18)});}}
   }else{
    const muzzles=f.muzzles,back=f.axisBack;
    for(let i=0;i<this.plan.contacts.length;i++){
     const c=this.plan.contacts[i],fire=c.at-.28,age=t-fire;
     if(age<0||age>.8)continue;
     const index=this.plan.mode==='basic'?2:i%7,p=this.pixel(muzzles[index]),b=this.pixel(back[index]),angle=Math.atan2(p.y-b.y,p.x-b.x);
     if(age<.24)this.draw(Math.min(3,Math.floor(age/.24*4)),p,unit*.35,{angle,anchor:[.25,.5],alpha:1-clamp((age-.15)/.09)});
     if(age<.28){
      const q=age/.28,lead={x:p.x+Math.cos(angle)*unit*.25,y:p.y+Math.sin(angle)*unit*.25};
      const pos={x:(1-q)**2*p.x+2*(1-q)*q*lead.x+q*q*hit.x,y:(1-q)**2*p.y+2*(1-q)*q*lead.y+q*q*hit.y};
      const tangent=Math.atan2((1-q)*(lead.y-p.y)+q*(hit.y-lead.y),(1-q)*(lead.x-p.x)+q*(hit.x-lead.x));
      this.draw(4+Math.min(3,Math.floor(q*4)),pos,unit*.42,{angle:tangent,anchor:[.8,.5]});
     }
     const impact=t-c.at;if(!c.dodge&&impact>=0&&impact<.48)this.draw(8+Math.min(3,Math.floor(impact/.48*4)),hit,unit*(i===this.plan.contacts.length-1?.82:.46),{alpha:1-clamp((impact-.3)/.18)});
    }
   }
  }
  this.onUpdate(this);
 }
 diagnostics(){return{code:this.plan.code,mode:this.plan.mode,time:this.time,playing:this.playing,speed:this.speed,pose:this.sample.pose,visibleEffects:this.pool.filter(p=>p.visible).length,registeredTimelines:this.registration&&this.engine.simpleTimelines.has(this.registration)?1:0,clockOwner:'V3_REGISTERED_GSAP',damageAuthority:'SERVER_ONLY',foot:this.point(this.actor),station:this.start,contact:this.assets.spec.frames[this.sample.pose].contact?this.pixel(this.assets.spec.frames[this.sample.pose].contact):null,bodyHeight:this.bodyHeight,weaponScale:this.assets.spec.frames[this.sample.pose].weaponScale};}
 destroy(){if(this.destroyed)return;this.cancel();if(!this.actor.root.destroyed){const s=this.actor.fullBodySprite;s.texture=this.idle.texture;s.anchor.set(this.idle.anchorX,this.idle.anchorY);s.scale.set(this.idle.scaleX,this.idle.scaleY);}this.layer.destroy({children:true});for(const t of [...this.assets.motion,...this.assets.effects])t.destroy(false);this.destroyed=true;}
}
async function playback(engine,actor,target,mode,contacts,visualCode=actor.cardId){
 const epoch=engine.mercenaryEpoch,playbackEpoch=engine.playbackEpoch,valid=()=>actor&&target&&!actor.root.destroyed&&!target.root.destroyed&&engine.visible&&epoch===engine.mercenaryEpoch&&playbackEpoch===engine.playbackEpoch;
 if(!valid())return false;const assets=await loadDuoAssets(visualCode);
 if(!valid()){for(const t of [...assets.motion,...assets.effects])t.destroy(false);return false;}
 engine.settlePendingTails?.([actor,target]);const plan=makePlan(visualCode,mode,contacts),fx=new LimitedDuoFX(engine,actor,target,assets,plan),clock={time:0};fx.removeTimeline();engine.mercenaryFx=fx;
 try{
  await engine.timeline(t=>{t.to(clock,{time:plan.duration,duration:plan.duration,ease:'none',onUpdate(){if(valid())fx.render(clock.time);}});for(const c of contacts)t.call(()=>{if(valid())c.apply();},[],c.at);});
  engine.lastMercenaryPlayback={code:actor.cardId,version:LIMITED_DUO_VERSION,eventType:mode==='skill'?'MERCENARY_HIT':'ATTACK',impacts:contacts.length,clockOwner:'V3_REGISTERED_GSAP',authoritative:true};
  return valid();
 }finally{fx.destroy();if(engine.mercenaryFx===fx)engine.mercenaryFx=null;if(valid()&&actor.hp>0)actor.animationController.setState('IDLE');}
}
export function playLimitedDuoSkill(engine,event){
 const actor=engine.combatantById(event.actorId),target=engine.combatantById(event.targetId);if(!actor||!target)return true;
 const code=Object.keys(LIMITED_DUO).find(code=>LIMITED_DUO[code].skillId===event.skillId);if(!code)return true;
 engine.queueBanner(event.skillName,parseInt(limitedDuo(code).accent.slice(1),16),actor.name);
 // Several authored visual beats display one authoritative server impact.
 // Do not split, reroll, or replay damage while importing the prepared motion.
 const spec=limitedDuo(code),contacts=spec.impacts.map((at,index)=>({at,dodge:Boolean(event.dodge),apply(){
  if(index!==spec.impacts.length-1)return;
  if(Number.isFinite(event.targetHpAfter))engine.syncTargetHp(target,engine.eventHpPercent(target,event.targetHpAfter,event.targetMaxHp));
  if(Number.isFinite(event.targetShieldAfter))engine.syncTargetShield(target,event.targetShieldAfter,event.targetMaxShield);
  if(event.dodge)engine.queueBanner('빗나감',actor.accent,event.skillName);
  else engine.showAccountBattleUnitDamage(target,{damage:event.damage});
 }}));
 return playback(engine,actor,target,'skill',contacts,code);
}
export function playLimitedDuoBasic(engine,{attacker:actor,target,damage=0,targetHp=null,targetShield=null,onImpact=()=>{}}={}){
 if(!engine.isAlive(actor)||!engine.isAlive(target))return false;
 return playback(engine,actor,target,'basic',[{at:limitedDuo(actor.cardId).basicImpact,dodge:false,apply(){if(targetHp!==null&&Number.isFinite(Number(targetHp)))engine.syncTargetHp(target,Number(targetHp));if(targetShield!==null&&Number.isFinite(Number(targetShield)))engine.syncTargetShield(target,Number(targetShield));onImpact(target);engine.showAccountBattleUnitDamage(target,{damage});}}]);
}
