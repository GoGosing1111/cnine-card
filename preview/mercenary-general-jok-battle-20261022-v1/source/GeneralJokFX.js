import {Assets,Container,Sprite} from 'pixi.js';
import {gsap} from 'gsap';
import {clamp,impulse,sample} from '../skill.mjs';
import {GoldenRimFilter} from './GoldenRimFilter.js';
import {GeneralJokArtillery} from './GeneralJokArtillery.js';
import {GeneralJokNaval} from './GeneralJokNaval.js';
import {GeneralJokCritical} from './GeneralJokCritical.js';
import {C9AuraFlag} from './C9AuraFlag.js';
export const ROOT='/preview/mercenary-general-jok-battle-20261022-v1/';
export async function loadGeneralJokAssets(manifest){
 const effects={};
 await Promise.all(Object.entries(manifest.effects).map(async([key,frames])=>{effects[key]=await Promise.all(frames.map(f=>Assets.load(ROOT+f.file)));}));
 const poses={};await Promise.all(Object.entries(manifest.poses).map(async([key,spec])=>{poses[key]=await Assets.load(ROOT+spec.file);}));
 return {effects,poses,standing:poses.ready,panel:await Assets.load(ROOT+manifest.ui.panel)};
}
export class GeneralJokFX{
 constructor(engine,merc,targets,assets,manifest,plan,onUpdate=()=>{}){
  Object.assign(this,{engine,merc,targets,assets,manifest,plan,onUpdate});
  this.clock={time:0};this.speed=1;this.auraEnabled=true;this.flagEnabled=true;this.rimEnabled=true;this.motionOnly=false;this.reducedMotion=!!engine.reducedMotion;
  this.layer=new Container({label:'GeneralJokFX'});engine.effectLayer.addChild(this.layer);
  this.pool=Array.from({length:192},()=>{const s=new Sprite();s.visible=false;this.layer.addChild(s);return s;});
  this.c9Flag=new C9AuraFlag(this);this.flag=this.c9Flag.root;
  this.auraRear=this.makeAuraLayer('auraRear',4);this.auraFront=this.makeAuraLayer('auraFront',14);merc.view.sortChildren();
  this.originalFilters=merc.fullBodySprite.filters||[];this.neon=new GoldenRimFilter();
  merc.fullBodySprite.filters=[...this.originalFilters,this.neon];
  for(const a of [merc]){a.animationAdapter?.kill?.();a.animationController?.kill?.();}
  this.artillery=new GeneralJokArtillery(this);
  this.naval=new GeneralJokNaval(this);
  this.critical=new GeneralJokCritical(this);
  this.captureFormation();this.makeTimeline();this.render(0);
 }
 get time(){return this.clock.time}
 get playing(){return !!this.timeline&&!this.timeline.paused()&&this.time<this.plan.duration}
 makeAuraLayer(key,zIndex){return Array.from({length:2},(_,i)=>{const s=new Sprite(this.assets.effects[key][0]);s.label=`GeneralJok-${key}-${i}`;s.zIndex=zIndex;this.merc.view.addChild(s);return s;});}
 captureFormation(){
  this.applyPose('ready');this.merc.fullBodySprite.position.set(0,0);
  this.bases=this.targets.map((a,i)=>({x:a.view.x,y:a.view.y,rotation:a.view.rotation,tint:this.bases?.[i]?.tint??a.fullBodySprite.tint}));
 }
 applyPose(key){
  const spec=this.manifest.poses[key],s=this.merc.fullBodySprite;
  this.activePose=key;this.poseSpec=spec;this.bodyScale=spec.physicalBodyHeight/spec.bodyPixels;
  s.texture=this.assets.poses[key];s.anchor.set(spec.foot.x/spec.width,spec.foot.y/spec.height);
  s.scale.set(this.bodyScale);s.rotation=0;s.skew.set(0,0);
 }
 removeTimeline(){if(this.registration)this.engine.simpleTimelines.delete(this.registration);this.timeline?.kill();this.registration=null;this.timeline=null}
 makeTimeline(){
  this.removeTimeline();this.clock.time=0;
  this.timeline=gsap.timeline({paused:true,onUpdate:()=>this.render(this.clock.time),onComplete:()=>{this.engine.simpleTimelines.delete(this.registration);this.render(this.plan.duration);this.onComplete?.();}})
   .to(this.clock,{time:this.plan.duration,duration:this.plan.duration,ease:'none'}).timeScale(this.speed);
  this.registration={instance:this.timeline,settle:()=>this.cancel()};
 }
 play(){if(this.destroyed)return;if(!this.timeline)this.makeTimeline();if(this.time>=this.plan.duration)this.seek(0);this.engine.simpleTimelines.add(this.registration);this.timeline.play();this.onUpdate(this)}
 pause(){this.timeline?.pause();this.onUpdate(this)}
 seek(t){if(this.destroyed)return;if(!this.timeline)this.makeTimeline();t=clamp(t,0,this.plan.duration);this.timeline.pause().time(t,true);if(t>=this.plan.duration)this.engine.simpleTimelines.delete(this.registration);this.clock.time=t;this.render(t)}
 setPlan(plan){this.cancel(false);this.plan=plan;this.makeTimeline();this.render(0)}
 setSpeed(speed){this.speed=clamp(Number(speed)||1,.25,2);this.timeline?.timeScale(this.speed);this.onUpdate(this)}
 setAura(on){this.auraEnabled=!!on;this.render(this.time)}
 setFlag(on){this.flagEnabled=!!on;this.render(this.time)}
 setRim(on){this.rimEnabled=!!on;this.render(this.time)}
 setMotionOnly(on){this.motionOnly=!!on;this.render(this.time)}
 setReducedMotion(on){this.reducedMotion=!!on;this.engine.camera?.reset(true);this.render(this.time)}
 cancel(notify=true){if(this.destroyed)return;this.removeTimeline();this.clock.time=0;this.engine.camera?.reset(true);this.render(0);if(notify)this.onCancel?.()}
 get effectScale(){return 1;}
 get facing(){return 1;}
 stagePoint(x,y){return {x,y};}
 alive(a){return a&&a.hp>0&&a.battleActive!==false&&!a.root?.destroyed;}
 knockTarget(a,distance){if(this.alive(a))a.view.x+=distance*this.facing;}
 blastWidth(x,opening){return Math.min(opening?680:790,(this.engine.scene.width-12-x)/.44);}
 localPoint(point){return this.engine.effectLayer.toLocal(this.merc.view.toGlobal(point))}
 muzzleAtRest(){const s=this.manifest.poses.ready,k=s.physicalBodyHeight/s.bodyPixels;return this.localPoint({x:(s.muzzle.x-s.foot.x)*k,y:(s.muzzle.y-s.foot.y)*k})}
 muzzleNow(){const s=this.poseSpec;return this.engine.effectLayer.toLocal(this.merc.fullBodySprite.toGlobal({x:s.muzzle.x-s.foot.x,y:s.muzzle.y-s.foot.y}))}
 muzzleAngle(){const s=this.poseSpec;return Math.atan2(s.muzzle.y-s.breech.y,s.muzzle.x-s.breech.x)}
 shotGround(shot){return this.localPoint({x:sample(this.plan,shot.fire).offsetX*(this.reducedMotion?.16:1),y:0})}
 shotOrigin(shot){const p=this.muzzleAtRest(),foot=this.localPoint({x:0,y:0}),ground=this.shotGround(shot);return {x:p.x+ground.x-foot.x,y:p.y}}
 actorGround(actor){return this.engine.effectLayer.toLocal(actor.root.toGlobal({x:0,y:0}))}
 targetPoint(actor){const p=this.engine.effectLayer.toLocal(actor.root.toGlobal({x:0,y:0}));return {x:p.x,y:this.muzzleAtRest().y}}
 draw(texture,p,width,{alpha=1,anchor={x:.5,y:.5},rotation=0,blendMode='normal',tint=0xffffff}={}){
  if(this.used>=this.pool.length){this.poolOverflow++;return;}const sprite=this.pool[this.used++];
  sprite.texture=texture;sprite.anchor.set(anchor.x,anchor.y);sprite.position.set(p.x,p.y);sprite.scale.set(width/texture.width);sprite.rotation=rotation;sprite.alpha=alpha;sprite.blendMode=blendMode;sprite.tint=tint;sprite.visible=alpha>.001;return sprite;
 }
 drawRifleMuzzle(age,width,duration=.16){
  if(age<0||age>=duration)return;
  const frames=this.assets.effects.muzzle,index=Math.min(frames.length-1,Math.floor(age/duration*frames.length));
  this.draw(frames[index],this.muzzleNow(),width,{anchor:{x:.35,y:.52},rotation:this.muzzleAngle(),alpha:clamp((duration-age)*16)*(this.reducedMotion?.65:1)});
 }
 drawBatteryMuzzle(p,age,width,rotation=0){
  const duration=.42;if(age<0||age>=duration)return;
  const frames=this.assets.effects.batteryMuzzle,phase=age/duration*(frames.length-1),index=Math.floor(phase),mix=phase-index,alpha=Math.min(1,(duration-age)*9)*(this.reducedMotion?.65:1);
  this.draw(frames[index],p,width,{anchor:this.manifest.effects.batteryMuzzle[index].anchor,rotation,alpha:alpha*(1-mix)});
  if(index<frames.length-1)this.draw(frames[index+1],p,width,{anchor:this.manifest.effects.batteryMuzzle[index+1].anchor,rotation,alpha:alpha*mix});
 }
 renderAura(t,state){
  const phase=this.reducedMotion?0:t*3,frame=Math.floor(phase)%4,mix=this.reducedMotion?0:phase%1;
  const shot=this.plan.shots[0],charge=this.plan.mode==='ultimate'&&shot&&t<shot.fire?clamp((t-shot.fire+.85)/.85):0;
  const show=this.auraEnabled&&!this.motionOnly&&!state.cancelled;
  for(const [key,sprites]of [['auraRear',this.auraRear],['auraFront',this.auraFront]]){
   sprites.forEach((s,i)=>{
    const index=(frame+i)%4,spec=this.manifest.effects[key][index];s.texture=this.assets.effects[key][index];
    s.anchor.set(spec.anchor.x,spec.anchor.y);s.scale.set(450/spec.height);s.position.set(this.merc.fullBodySprite.x,5);
    s.alpha=(i?mix:1-mix)*(key==='auraRear'?.87:.57)*(this.reducedMotion?.7:1+charge*.3);s.visible=show&&s.alpha>.001;
   });
  }
  this.neon.enabled=this.rimEnabled&&!this.motionOnly&&!state.cancelled;
  this.neon.strength=this.reducedMotion?1.05:1.15+.12*Math.sin(t*2.1)+charge*.45+state.recoil*.15;
 }
 render(t){
  if(this.destroyed)return;this.pool.forEach(p=>p.visible=false);this.used=0;this.poolOverflow=0;this.activeProjectiles=[];this.activeGroundSmoke=[];this.impactCount=0;this.goldImpactCount=0;
  const state=sample(this.plan,t);
  if(this.plan.shots.length&&(!this.alive(this.targets[0])))Object.assign(state,{cancelled:true,offsetX:0,recoil:0,hit:0,pose:'ready',label:'대상 없음 · 원위치'});
  this.sample=state;
  // The latest two user references replace the older single-pose lock. The
  // authored firing sprite supplies muzzle rise; runtime never bends the gun
  // or squashes the body. Both poses retain the same cap-to-boot body height.
  const reduction=this.reducedMotion?.16:1;
  this.applyPose(this.reducedMotion?'ready':state.pose);
  this.merc.fullBodySprite.position.set(state.offsetX*reduction,0);
  this.merc.fullBodySprite.rotation=0;this.merc.fullBodySprite.scale.set(this.bodyScale);
  this.targets.forEach((a,i)=>{a.view.position.set(this.bases[i].x,this.bases[i].y);a.view.rotation=this.bases[i].rotation;a.fullBodySprite.tint=this.bases[i].tint;});
  this.c9Flag.render(t,state);
  this.renderAura(t,state);
  if(!state.cancelled&&!state.done){
   for(const shot of this.plan.shots){
    const age=t-shot.fire;
    const primary=this.targets[0];if(!this.alive(primary))continue;
    const target=this.targetPoint(primary),start=this.shotOrigin(shot);
    if(age>=0&&age<.92&&!this.motionOnly){
     const index=Math.min(5,Math.floor(age/.92*6)),spec=this.manifest.effects.groundSmoke[index],p=this.shotGround(shot);
     this.draw(this.assets.effects.groundSmoke[index],p,this.plan.mode==='ultimate'?640:490,{anchor:spec.anchor,alpha:(this.reducedMotion?.5:1)*Math.min(1,(.92-age)*5)});
     this.activeGroundSmoke.push({shot:shot.index,frame:index,origin:{...p},position:{...p},stationary:true});
    }
    if(age>=0&&age<.12&&!this.motionOnly&&!['breaker','critical','sabotage','airburst'].includes(this.plan.mode)){const i=Math.min(3,Math.floor(age/.12*4));this.draw(this.assets.effects.muzzle[i],this.muzzleNow(),this.plan.mode==='ultimate'?310:210,{anchor:{x:.35,y:.52},rotation:this.muzzleAngle(),alpha:Math.min(1,(.12-age)*14)*(this.activePose==='fire'?.45:1)});}
    if(age>=0&&t<shot.impact&&!this.motionOnly&&!['ultimate','artillery','breaker','critical','sabotage','airburst'].includes(this.plan.mode)){
     const progress=clamp(age/(shot.impact-shot.fire));
     const point={x:start.x+(target.x-start.x)*progress,y:start.y};
     this.draw(this.assets.effects.bullet[Math.min(3,Math.floor(progress*4))],point,this.plan.mode==='ultimate'?170:120,{anchor:{x:.94,y:.5}});
     this.activeProjectiles.push({shot:shot.index,origin:{...start},position:point,target:{...target},horizontalError:Math.abs(point.y-start.y)});
    }
    if(['ultimate','artillery','breaker','critical','sabotage','airburst'].includes(this.plan.mode))continue;
    const affected=this.plan.area?this.targets:[primary];
    for(const [i,actor]of affected.entries()){
     if(!this.alive(actor))continue;
     const at=shot.impact+(this.plan.area?i*(this.plan.mode==='ultimate'?.085:.035):0),hitAge=t-at;
     const knock=impulse(t,at,.78)*(this.plan.mode==='ultimate'?72:48)*reduction;
     const index=this.targets.indexOf(actor);this.knockTarget(actor,knock);
     if(this.plan.area&&hitAge>=0&&hitAge<1.12&&!this.motionOnly){
      const frame=Math.min(5,Math.floor(hitAge/1.12*6)),spec=this.manifest.effects.goldBreach[frame],tex=this.assets.effects.goldBreach[frame];
      const ground=this.actorGround(actor),width=this.plan.mode==='ultimate'?(i===0?540:390):350;
      const p={x:clamp(ground.x,width/2+10,this.engine.scene.width-width/2-10),y:ground.y};
      this.draw(tex,p,width,{anchor:spec.anchor,alpha:(this.reducedMotion?.65:1)*Math.min(1,(1.12-hitAge)*5)});
      this.impactCount++;this.goldImpactCount++;
     }else if(!this.plan.area&&hitAge>=0&&hitAge<.86&&!this.motionOnly){
      const tex=this.assets.effects.impact[Math.min(3,Math.floor(hitAge/.86*4))];
      const atPoint=this.targetPoint(actor),width=(this.plan.mode==='ultimate'?410:290)*(.4+.6*Math.min(1,hitAge/.18)),height=width*tex.height/tex.width;
      // Keep all blast pixels in the authored side-view canvas. Bullet origin
      // and direction are never clamped or moved to accommodate a visual.
      const p={x:clamp(atPoint.x,14+width/2,this.engine.scene.width-14-width/2),y:Math.max(atPoint.y,14+height/2)};
      this.draw(tex,p,width,{alpha:Math.min(1,(.86-hitAge)*5)});this.impactCount++;
     }
     if(!Number.isFinite(actor.view.x))actor.view.x=this.bases[index].x;
    }
   }
  }
  this.artillery.render(t,state);
  this.critical.render(t,state);
  this.naval.render(t,state);
  this.onUpdate(this);
 }
 diagnostics(){return {...this.artillery.diagnostics(),...this.naval.diagnostics(),...this.critical.diagnostics(),...this.c9Flag.diagnostics(),poolOverflow:this.poolOverflow,ready:!this.destroyed,mode:this.plan.mode,time:this.time,playing:this.playing,speed:this.speed,standingLocked:true,
  pose:this.activePose,poseFile:this.poseSpec.file,poseHeight:this.poseSpec.bodyPixels*this.bodyScale,muzzleAngleDegrees:this.muzzleAngle()*180/Math.PI,
  recoilX:this.merc.fullBodySprite.x,recoilY:this.merc.fullBodySprite.y,rotation:this.merc.fullBodySprite.rotation,uniformScale:Math.abs(this.merc.fullBodySprite.scale.x-this.merc.fullBodySprite.scale.y)<1e-9,
  muzzle:this.muzzleNow(),restMuzzle:this.muzzleAtRest(),projectiles:this.activeProjectiles,impactCount:this.impactCount,goldImpactCount:this.goldImpactCount,groundSmoke:this.activeGroundSmoke,
  targetOffsets:this.targets.map((a,i)=>({x:a.view.x-this.bases[i].x,y:a.view.y-this.bases[i].y,rotation:a.view.rotation-this.bases[i].rotation})),
  flagVisible:this.flag.visible,auraType:'GOLDEN_FULL_BODY_HELIX',auraRearVisible:this.auraRear.some(s=>s.visible),auraFrontVisible:this.auraFront.some(s=>s.visible),auraOffsetX:this.auraRear[0].x,neonRimEnabled:this.neon.enabled,neonStrength:this.neon.strength,neonFilterCount:this.merc.fullBodySprite.filters.filter(f=>f===this.neon).length,bodyLightning:false,visibleSprites:this.pool.filter(s=>s.visible).length,
  regularAllies:this.engine.allies.length,regularEnemies:this.engine.enemies.length,mercenaryInRegularArray:this.engine.allies.includes(this.merc),
  cancelled:this.sample.cancelled,reducedMotion:this.reducedMotion,motionOnly:this.motionOnly,clockOwner:'V3_REGISTERED_GSAP',
  registeredTimelines:this.registration&&this.engine.simpleTimelines.has(this.registration)?1:0,effectLayers:this.engine.effectLayer.children.filter(c=>c.label==='GeneralJokFX').length,
  liveDamageWrites:0,liveInventoryWrites:0,sourceResolution:{width:this.poseSpec.width,height:this.poseSpec.height}}}
 destroy(){if(this.destroyed)return;this.cancel(false);this.critical.destroy();this.naval.destroy();this.artillery.destroy();this.merc.fullBodySprite.filters=this.originalFilters;this.neon.destroy();for(const s of [...this.auraRear,...this.auraFront])s.destroy();this.c9Flag.destroy();this.layer.destroy({children:true});this.destroyed=true;this.pool=[]}
}
