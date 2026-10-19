import {Assets,Container,Sprite,Texture,Rectangle} from 'pixi.js';
import {gsap} from 'gsap';
import {MODES,sample,bladeContact} from '../motion.mjs';
export const BATHORY_RESOURCE_ROOT='/preview/mercenary-bathory-halloween-20261019-v1/';
const mix=(a,b,t)=>a+(b-a)*t;
export async function loadBathoryAssets(manifest){
 const out={motion:{},effects:{}};
 await Promise.all(['motion','effects'].flatMap(kind=>Object.entries(manifest[kind]).map(async([key,s])=>{
  const atlas=await Assets.load(BATHORY_RESOURCE_ROOT+s.url);
  out[kind][key]=s.frames.map((f,i)=>{const r=f.rect||{x:i%s.columns*s.frameWidth,y:Math.floor(i/s.columns)*s.frameHeight,width:s.frameWidth,height:s.frameHeight};return new Texture({source:atlas.source,frame:new Rectangle(r.x,r.y,r.width,r.height)});});
 })));return out;
}
export class BathoryFX{
 constructor(engine,merc,targets,assets,manifest,onUpdate=()=>{},options={}){
  Object.assign(this,{engine,merc,targets,assets,manifest,onUpdate,mode:'idle',speed:1,effectsEnabled:true,zoom:true,disposed:false,clock:{time:0},...options});
  this.bodyHeight=333;merc.animationController.kill();merc.stateHalo.visible=false;merc.hud.visible=false;
  this.back=new Container({label:'BathoryMotionHistory'});this.front=new Container({label:'BathoryPrismaticFX'});
  this.back.eventMode=this.front.eventMode='none';engine.backgroundLayer.addChild(this.back);engine.effectLayer.addChild(this.front);
  this.ghosts=Array.from({length:3},()=>{const s=new Sprite();s.visible=false;this.back.addChild(s);return s;});
  this.pool=Array.from({length:5},()=>{const s=new Sprite();s.visible=false;this.front.addChild(s);return s;});
  this.captureFormation();this.makeTimeline();this.render(0);
 }
 get direction(){return this.merc.team==='ENEMY'?-1:1;}
 get target(){return this.targets[0];}
 get time(){return this.clock.time;}
 get playing(){return !!this.timeline&&!this.timeline.paused()&&(this.mode==='idle'||this.time<MODES[this.mode].duration);}
 captureFormation(){this.home={x:this.merc.baseX??this.merc.root.x,y:this.merc.baseY??this.merc.root.y};}
 removeTimeline(){if(this.registration)this.engine.simpleTimelines.delete(this.registration);this.timeline?.kill();this.timeline=null;this.registration=null;}
 makeTimeline(){
  this.removeTimeline();this.timeline=gsap.timeline({paused:true,repeat:this.mode==='idle'?-1:0,onUpdate:()=>this.render(this.clock.time),onComplete:()=>{this.engine.simpleTimelines.delete(this.registration);this.render(MODES[this.mode].duration);this.onComplete?.();}}).to(this.clock,{time:MODES[this.mode].duration,duration:MODES[this.mode].duration,ease:'none'}).timeScale(this.speed);
  this.registration={instance:this.timeline,settle:()=>this.cancel()};
 }
 play(){if(this.disposed)return;if(!this.timeline)this.makeTimeline();if(this.time>=MODES[this.mode].duration)this.seek(0);this.engine.simpleTimelines.add(this.registration);this.timeline.play();}
 pause(){this.timeline?.pause();this.onUpdate(this);}
 seek(t){if(this.disposed)return;if(!this.timeline)this.makeTimeline();t=Math.max(0,Math.min(MODES[this.mode].duration,t));this.timeline.pause().time(t,true);this.clock.time=t;this.render(t);}
 setMode(mode){if(!MODES[mode])return;this.cancel();this.mode=mode;this.clock.time=0;this.makeTimeline();this.render(0);}
 setSpeed(n){this.speed=Math.max(.25,Math.min(2,Number(n)||1));this.timeline?.timeScale(this.speed);}
 setEffects(enabled){this.effectsEnabled=enabled;this.back.visible=this.front.visible=enabled;this.onUpdate(this);}
 targetPoint(fraction=.57){const h=this.target.art?.bodyHeight||this.target.fullBodyHeight||300;return this.merc.root.parent.toLocal(this.target.root.toGlobal({x:0,y:-h*fraction}));}
 pose(p){return this.manifest.motion[p.bank].frames[p.index];}
 rootFor(state){
  const feet=this.targetPoint(0),scale=this.bodyHeight/360*this.merc.root.scale.x,reach=(bank,index)=>{const f=this.manifest.motion[bank].frames[index];return (mix(f.bladeStart.x,f.tip.x,.48)-f.pivot.x)*scale*this.direction;};
  const anchors={home:this.home,near:{x:feet.x-reach('attack',1),y:feet.y},rise:{x:feet.x-reach('skill',2),y:feet.y},finish:{x:feet.x-reach('skill',5),y:feet.y}};
  const a=anchors[state.path.from],b=anchors[state.path.to],q=state.path.mix;return{x:mix(a.x,b.x,q),y:mix(a.y,b.y,q),groundY:mix(a.y,b.y,q)};
 }
 applyPose(p){const f=this.pose(p),s=this.merc.fullBodySprite;s.texture=this.assets.motion[p.bank][p.index];s.anchor.set(f.pivot.x/768,f.pivot.y/768);s.scale.set(this.bodyHeight/360);s.position.set(0,0);this.merc.view.position.set(0,0);this.merc.view.scale.set(this.direction,1);}
 point(p,layer=this.front){return layer.toLocal(this.merc.root.parent.toGlobal(p));}
 bladePoints(state,root){const f=this.pose(state.pose),scale=this.bodyHeight/360*this.merc.root.scale.x;const cv=p=>({x:root.x+(p.x-f.pivot.x)*scale*this.direction,y:root.y+(p.y-f.pivot.y)*scale});return{grip:cv(f.grip),start:cv(f.bladeStart),tip:cv(f.tip)};}
 render(t){
  if(this.disposed||this.merc.root.destroyed||this.target.root.destroyed)return;
  const e=this.engine,state=this.state=sample(this.mode,t),r=this.rootFor(state),size=this.bodyHeight*this.merc.root.scale.x;
  this.applyPose(state.pose);this.merc.root.position.set(r.x,r.y);this.merc.root.depthSortY=r.groundY;e.sortCombatDepth();
  this.pool.forEach(s=>s.visible=false);this.ghosts.forEach(s=>s.visible=false);
  const torso=this.targetPoint(),feet=this.targetPoint(0),bp=this.bladePoints(state,r),targetHeight=(this.target.art?.bodyHeight||this.target.fullBodyHeight||300)*this.target.root.scale.y;
  this.collision=bladeContact(bp.start,bp.tip,torso,targetHeight*.28);this.groundError=Math.abs(r.y-r.groundY);
  if(state.ghosts&&this.effectsEnabled)this.ghosts.forEach((s,i)=>{const ago=[.035,.07,.11][i];if(t<ago)return;const past=sample(this.mode,t-ago),pr=this.rootFor(past);if(Math.abs(pr.x-r.x)<2&&past.pose.bank===state.pose.bank&&past.pose.index===state.pose.index)return;const f=this.pose(past.pose);s.texture=this.assets.motion[past.pose.bank][past.pose.index];s.anchor.set(f.pivot.x/768,f.pivot.y/768);s.scale.set(this.bodyHeight/360*this.merc.root.scale.x*this.direction,this.bodyHeight/360*this.merc.root.scale.y);const pos=this.point(pr,this.back);s.position.set(pos.x,pos.y);s.alpha=[.20,.12,.06][i];s.tint=0xff4968;s.blendMode='add';s.visible=true;});
  if(this.effectsEnabled)state.effects.forEach((f,i)=>{
   const textures=this.assets.effects[f.key],index=Math.min(textures.length-1,Math.floor(f.progress*textures.length)),s=this.pool[i];s.texture=textures[index];s.anchor.set(.5,f.anchor==='ground'?.86:.5);s.rotation=f.angle*this.direction;s.scale.set(size*f.width/s.texture.width*this.direction,size*f.width/s.texture.width);s.alpha=f.alpha;s.blendMode='normal';
   const pos=this.point(f.anchor==='ground'?feet:f.anchor==='wake'?{x:r.x-size*.18*this.direction,y:r.y-size*.46}:torso);s.position.set(pos.x,pos.y);s.visible=true;
  });
  // Visual recoil only; authoritative HP is applied by the host event once.
  this.target.view.x=state.impact*Math.sin(t*90)*(this.mode==='skill'&&t>1.4?8:4);this.target.view.y=-state.impact*2;
  if(this.zoom){
   const bounds={left:Math.min(r.x,feet.x)-size*1.2,right:Math.max(r.x,feet.x)+size*1.3,top:Math.min(r.y-size*1.85,feet.y-targetHeight*1.2),bottom:Math.max(r.y,feet.y)+size*.20};
   const zoom=Math.max(1,Math.min(e.mobile?1.45:1.75,e.scene.width*.86/(bounds.right-bounds.left),e.scene.height*.78/(bounds.bottom-bounds.top)));
   const halfW=e.scene.width/(2*zoom),halfH=e.scene.height/(2*zoom),focus={x:Math.max(halfW,Math.min(e.scene.width-halfW,(bounds.left+bounds.right)/2)),y:Math.max(halfH,Math.min(e.scene.height-halfH,(bounds.top+bounds.bottom)/2))};
   e.camera.focusAt(focus,zoom);const shake=state.impact*(this.mode==='skill'&&t>1.4?4:1.5);e.stage.position.set(e.camera.base.x+Math.sin(t*110)*shake,e.camera.base.y+Math.cos(t*90)*shake*.5);
  }else if(!this.externalClock)e.camera.reset(true);
  this.onUpdate(this);
 }
 cancel(){this.removeTimeline();this.clock.time=0;if(!this.disposed)this.render(0);}
 diagnostics(){return{ready:!this.disposed,mode:this.mode,time:this.time,playing:this.playing,speed:this.speed,phase:this.state?.phase,pose:this.state?.pose,contactCount:this.state?.contactCount,bladeContact:this.collision,groundError:this.groundError,visibleEffects:this.pool.filter(s=>s.visible).length,visibleGhosts:this.ghosts.filter(s=>s.visible).length,registeredTimelines:this.registration&&this.engine.simpleTimelines.has(this.registration)?1:0,...this.manifest.summary,weaponSha256:this.manifest.weapon.sha256,clock:'V3_REGISTERED_GSAP',liveEnabled:false,actor:{x:this.merc.root.x,y:this.merc.root.y},target:this.targetPoint()};}
 destroy(){if(this.disposed)return;this.cancel();this.disposed=true;if(!this.externalClock)this.engine.camera.reset(true);if(!this.target.root.destroyed)this.target.view.position.set(0,0);this.front.destroy({children:true});this.back.destroy({children:true});for(const bank of[...Object.values(this.assets.motion),...Object.values(this.assets.effects)])for(const texture of bank)texture.destroy(false);}
}
