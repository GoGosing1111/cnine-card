import {Assets,Container,Sprite,Texture,Rectangle,Graphics} from 'pixi.js';
import {gsap} from 'gsap';
import {MODES,sample} from '../motion.mjs';
const ROOT='/preview/battle-suit-x-v1/',mix=(a,b,t)=>a+(b-a)*t;
const attackAnchors=[[.36,.45],[.52,.56],[.75,.68],[.92,.83],[.94,.77],[.74,.67],[.67,.66],[.66,.66],[.5,.5],[.5,.5],[.5,.5],[.5,.5]];
export async function loadXAssets(m){
 const out={motion:{},effects:{},idle:await Assets.load(ROOT+m.sourceArt)};
 await Promise.all([...Object.entries(m.motion).map(async([k,s])=>{const a=await Assets.load(ROOT+s.url);out.motion[k]=s.frames.map((f,i)=>new Texture({source:a.source,frame:new Rectangle(i%4*768,Math.floor(i/4)*768,768,768)}));}),...Object.entries(m.effects).map(async([k,s])=>{const a=await Assets.load(ROOT+s.url);out.effects[k]=s.frames.map(f=>new Texture({source:a.source,frame:new Rectangle(f.rect.x,f.rect.y,f.rect.width,f.rect.height)}));})]);
 return out;
}
export class XBodyFX{
 constructor(engine,unit,target,assets,manifest,onUpdate){
  Object.assign(this,{engine,unit,target,assets,manifest,onUpdate,mode:'skill',speed:1,zoom:true,disposed:false,clock:{time:0}});
  unit.cancelFire();unit.stopIdle();unit.swordAnimation?.cancel();unit.nameHud.visible=false;
  this.front=new Container({label:'XBodyPreviewFX'});this.front.eventMode='none';engine.effectLayer.addChild(this.front);
  this.ground=new Graphics();this.front.addChild(this.ground);
  this.pool=Array.from({length:5},()=>{const s=new Sprite();s.visible=false;this.front.addChild(s);return s;});
  this.capture();this.makeTimeline();this.render(0);
 }
 capture(){this.home={x:this.unit.root.baseX,y:this.unit.root.baseY};}
 get time(){return this.clock.time;}get playing(){return Boolean(this.timeline&&!this.timeline.paused()&&this.time<MODES[this.mode].duration);}
 removeTimeline(){if(this.registration)this.engine.simpleTimelines.delete(this.registration);this.timeline?.kill();this.timeline=null;this.registration=null;}
 makeTimeline(){this.removeTimeline();this.timeline=gsap.timeline({paused:true,onUpdate:()=>this.render(this.clock.time),onComplete:()=>{this.engine.simpleTimelines.delete(this.registration);this.render(MODES[this.mode].duration);}}).to(this.clock,{time:MODES[this.mode].duration,duration:MODES[this.mode].duration,ease:'none'}).timeScale(this.speed);this.registration={instance:this.timeline,settle:()=>this.cancel()};}
 play(){if(this.disposed)return;if(!this.timeline)this.makeTimeline();if(this.time>=MODES[this.mode].duration)this.seek(0);this.unit.stopIdle();this.engine.simpleTimelines.add(this.registration);this.timeline.play();this.onUpdate(this);}
 pause(){this.timeline?.pause();this.onUpdate(this);}
 seek(t){if(this.disposed)return;if(!this.timeline)this.makeTimeline();t=Math.max(0,Math.min(MODES[this.mode].duration,t));this.timeline.pause().time(t,true);this.clock.time=t;this.render(t);}
 setMode(mode){if(!MODES[mode])return;this.cancel();this.mode=mode;this.clock.time=0;this.makeTimeline();this.render(0);}
 setSpeed(n){this.speed=Math.max(.25,Math.min(2,Number(n)||1));this.timeline?.timeScale(this.speed);}
 point(local){return this.engine.effectLayer.toLocal(this.unit.bodySprite.toGlobal(local));}
 contact(){const h=this.target.fullBodyHeight||300;return this.unit.root.parent.toLocal(this.target.root.toGlobal({x:0,y:-h*.52}));}
 applyPose(index,idle=false){
  if(idle){const s=this.unit.bodySprite;s.texture=this.assets.idle;s.anchor.set(600/1145,1351/1374);s.scale.set(333.70859375/1317);s.position.set(0,0);this.unit.weaponSprite.visible=false;this.unit.view.position.set(0,0);this.unit.view.scale.set(1);return{pivot:{x:600,y:1351},grip:{x:411,y:647},tip:{x:1111,y:1173}};}
  const spec=this.manifest.motion[this.mode],f=spec.frames[index],s=this.unit.bodySprite;
  s.texture=this.assets.motion[this.mode][index];s.anchor.set(f.pivot.x/768,f.pivot.y/768);s.scale.set(333.70859375/360);s.position.set(0,0);this.unit.weaponSprite.visible=false;this.unit.view.position.set(0,0);this.unit.view.scale.set(1);return f;
 }
 render(t){
  if(this.disposed)return;const u=this.unit,e=this.engine,state=this.state=sample(this.mode,t);this.pool.forEach(p=>p.visible=false);this.ground.clear();
  const frame=this.applyPose(state.frame,t<=0),spec=this.manifest.motion[this.mode],hit=spec.frames[this.mode==='skill'?5:this.mode==='attack'?3:6],contact=this.contact();if(t<=0)state.phase='대기';
  const scale=u.bodySprite.scale.x*u.root.scale.x,stop={x:contact.x-(hit.tip.x-hit.pivot.x)*scale,y:contact.y-(hit.tip.y-hit.pivot.y)*scale};
  const q=t<=0?0:state.travel;u.root.position.set(mix(this.home.x,stop.x,q),mix(this.home.y,stop.y,q));u.root.depthSortY=u.root.y;e.sortCombatDepth();
  const grip=this.point({x:frame.grip.x-frame.pivot.x,y:frame.grip.y-frame.pivot.y});
  const hitPoint=e.effectLayer.toLocal(u.root.parent.toGlobal(contact)),feet=e.effectLayer.toLocal(u.root.toGlobal({x:0,y:0}));
  const size=333.70859375*u.root.scale.x;
  state.effects.forEach((fx,i)=>{
   const s=this.pool[i];s.texture=this.assets.effects[fx.key][fx.frame];s.visible=true;s.alpha=fx.alpha*(this.mode==='skill'?.47:.85);s.blendMode='add';s.anchor.set(.5);
   if(fx.key==='attack')s.anchor.set(...attackAnchors[fx.frame]);
   if(fx.key==='skill'&&fx.frame>=4&&fx.frame<8)s.anchor.set(.58,.9);
   if(fx.key==='skill'&&fx.frame>=8&&fx.frame<12)s.anchor.set(.5,.55);
   let width=size*(this.mode==='skill'?(fx.frame<8?2.05:2.3):1.95),p=hitPoint;
   if(fx.anchor==='wake'){p={x:feet.x-size*.22,y:feet.y-size*.5};width=size*2.2;s.anchor.set(.83,.55);}
   if(fx.anchor==='grip'){p=grip;width=size*1.12;}
   s.scale.set(width/s.texture.width);s.position.set(p.x,p.y);
  });
  if(state.impact>0){const color=this.mode==='skill'?0xffe9b0:0xa8efff;this.ground.ellipse(hitPoint.x,hitPoint.y+size*.42,size*(1-state.impact)*1.15+12,8+(1-state.impact)*size*.22).stroke({color,width:2.4,alpha:state.impact*.55});}
  const visibleTip=this.point({x:frame.tip.x-frame.pivot.x,y:frame.tip.y-frame.pivot.y});this.contactError=Math.hypot(visibleTip.x-hitPoint.x,visibleTip.y-hitPoint.y);
  this.target.view.x=state.impact*Math.sin(state.impact*8)*4;
  if(this.zoom){
   const bladeY=u.root.y+(frame.tip.y-frame.pivot.y)*scale;
   const top=Math.min(u.root.y-size*1.12,bladeY-size*.08),bottom=u.root.y+size*.18;
   const focus={x:mix(u.root.x,contact.x,.4),y:(top+bottom)/2};
   const zoom=Math.min(e.mobile?2.05:2.4,e.scene.height*.68/(bottom-top));
   e.camera.focusAt(focus,zoom);e.stage.position.set(e.scene.width/2,e.scene.height*.43);
  }else e.camera.reset(true);
  this.onUpdate(this);
 }
 cancel(){this.removeTimeline();this.clock.time=0;if(!this.disposed)this.render(0);}
 diagnostics(){return{ready:!this.disposed,mode:this.mode,time:this.time,playing:this.playing,speed:this.speed,frame:this.state?.frame,phase:this.state?.phase,contactError:this.contactError,visibleEffects:this.pool.filter(s=>s.visible).length,registeredTimelines:this.registration&&this.engine.simpleTimelines.has(this.registration)?1:0,bodyFrames:24,effectFrames:40,weaponSources:1,weaponSha256:this.manifest.weapon.sha256,weaponRedrawnPixels:0,regularAllies:this.engine.allies.length,clock:'V3_REGISTERED_GSAP',liveEnabled:false,actor:{x:this.unit.root.x,y:this.unit.root.y},contact:this.contact()};}
 destroy(){if(this.disposed)return;this.cancel();this.disposed=true;this.engine.camera.reset(true);this.target.view.x=0;this.front.destroy({children:true});this.unit.swordAnimation?.ready();for(const frames of [...Object.values(this.assets.motion),...Object.values(this.assets.effects)])for(const t of frames)t.destroy(false);}
}
