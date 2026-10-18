import {Assets,Container,Sprite,Texture,Rectangle,Graphics,Text} from 'pixi.js';
import {gsap} from 'gsap';
import {MODES,sample,bladeContact,smooth,clamp} from '../motion.mjs';
const ROOT='/preview/mercenary-leonel-sss-limited-20261018-v2/',mix=(a,b,t)=>a+(b-a)*t;
export async function loadLeonelAssets(m){
 const out={motion:{},effects:{},cinematics:{}};
 await Promise.all(['motion','effects','cinematics'].flatMap(kind=>Object.entries(m[kind]||{}).map(async([key,s])=>{
  const atlases=await Promise.all((s.pages||[{url:s.url||s.atlas}]).map(p=>Assets.load(ROOT+p.url))),w=s.frameWidth||s.cellWidth||s.cellSize,h=s.frameHeight||s.cellHeight||s.cellSize;
  out[kind][key]=s.frames.map((f,i)=>{const r=f.rect||{x:i%s.columns*w,y:Math.floor(i/s.columns)*h,width:w,height:h};return new Texture({source:atlases[f.page||0].source,frame:new Rectangle(r.x,r.y,r.width,r.height)});});
 })));
 return out;
}
export class LeonelFX{
 constructor(engine,merc,targets,assets,manifest,onUpdate=()=>{}){
  Object.assign(this,{engine,merc,targets,assets,manifest,onUpdate,mode:'idle',speed:1,effectsEnabled:true,auraEnabled:true,zoom:true,disposed:false,clock:{time:0}});
  this.bodyHeight=manifest.displaySizing?.physicalBodyHeight||333;
  merc.animationController.kill();merc.stateHalo.visible=false;merc.hud.visible=false;
  this.back=new Container({label:'LeonelPressureBack'});this.back.eventMode='none';engine.backgroundLayer.addChild(this.back);
  this.front=new Container({label:'LeonelSwordFX'});this.front.eventMode='none';engine.effectLayer.addChild(this.front);
  this.shade=new Graphics();this.back.addChild(this.shade);
  this.aura=new Sprite();this.back.addChild(this.aura);this.backgroundAura=new Sprite();this.back.addChildAt(this.backgroundAura,0);
  this.ghosts=Array.from({length:4},()=>{const s=new Sprite();s.visible=false;this.back.addChild(s);return s;});
  this.pool=Array.from({length:16},()=>{const s=new Sprite();s.visible=false;this.front.addChild(s);return s;});
  this.screenLayer=new Container({label:'LeonelAwakeningCutIn'});this.screenLayer.eventMode='none';engine.app.stage.addChild(this.screenLayer);
  this.cinemaShade=new Graphics();this.cinemaPressure=new Sprite();this.cinemaPortrait=new Sprite();this.screenLayer.addChild(this.cinemaShade,this.cinemaPressure,this.cinemaPortrait);this.cinemaMask=new Graphics();this.cinemaPortrait.mask=this.cinemaMask;this.screenLayer.addChild(this.cinemaMask);this.cinemaTitle=new Text({text:'검극',style:{fontFamily:'Malgun Gothic',fontSize:70,fontWeight:'bold',fill:0xfff3d1,letterSpacing:6}});this.cinemaSubtitle=new Text({text:'전선 단절',style:{fontFamily:'Malgun Gothic',fontSize:26,fontWeight:'bold',fill:0xc9c6ef,letterSpacing:5}});this.screenLayer.addChild(this.cinemaTitle,this.cinemaSubtitle);this.screenLayer.visible=false;
  this.captureFormation();this.makeTimeline();this.render(0);
 }
 get target(){return this.targets[0];}
 get time(){return this.clock.time;}
 get playing(){return !!this.timeline&&!this.timeline.paused()&&(this.mode==='idle'||this.time<MODES[this.mode].duration);}
 captureFormation(){this.home={x:this.merc.baseX??this.merc.root.x,y:this.merc.baseY??this.merc.root.y};}
 removeTimeline(){if(this.registration)this.engine.simpleTimelines.delete(this.registration);this.timeline?.kill();this.timeline=null;this.registration=null;}
 makeTimeline(){
  this.removeTimeline();
  this.timeline=gsap.timeline({paused:true,repeat:this.mode==='idle'?-1:0,onUpdate:()=>this.render(this.clock.time),onComplete:()=>{this.engine.simpleTimelines.delete(this.registration);this.render(MODES[this.mode].duration);this.onComplete?.();}}).to(this.clock,{time:MODES[this.mode].duration,duration:MODES[this.mode].duration,ease:'none'}).timeScale(this.speed);
  this.registration={instance:this.timeline,settle:()=>this.cancel()};
 }
 play(){if(this.disposed)return;if(!this.timeline)this.makeTimeline();if(this.time>=MODES[this.mode].duration)this.seek(0);this.engine.simpleTimelines.add(this.registration);this.timeline.play();this.onUpdate(this);}
 pause(){this.timeline?.pause();this.onUpdate(this);}
 seek(time){if(this.disposed)return;if(!this.timeline)this.makeTimeline();const t=clamp(time,0,MODES[this.mode].duration);this.timeline.pause().time(t,true);this.clock.time=t;this.render(t);}
 setMode(mode){if(!MODES[mode])return;this.cancel();this.mode=mode;this.clock.time=0;this.makeTimeline();this.render(0);}
 setSpeed(n){this.speed=clamp(Number(n)||1,.25,2);this.timeline?.timeScale(this.speed);this.onUpdate(this);}
 setEffects(enabled){this.effectsEnabled=enabled;this.back.visible=this.front.visible=enabled;this.render(this.time);}
 setAura(enabled){this.auraEnabled=enabled;this.render(this.time);}
 targetPoint(actor=this.target,fraction=.64){return this.merc.root.parent.toLocal(actor.root.toGlobal({x:0,y:-(actor.fullBodyHeight||300)*fraction}));}
 pose(p){const bank=this.manifest.motion[p.bank],index=p.index%bank.frames.length;return{...bank.frames[index],index,bank};}
 scaleFor(f){return this.bodyHeight/(f.bank.referenceHeight||this.manifest.referenceHeight||360);}
 rootFor(state){
  const hitFrame={idle:0,dash:3,attack:3,skill:1,ultimate:5}[this.mode];
  const feet=this.targetPoint(this.target,0),torso=this.targetPoint();
  // Solve lateral reach on the authored blade segment, while keeping ground Y fixed.
  const reach=index=>{const f=this.pose({bank:this.mode,index,facing:1}),s=this.scaleFor(f)*this.merc.root.scale.x,start=f.bladeStart||f.grip;return(mix(start.x,f.tip.x,.5)-f.pivot.x)*s;};
  const anchors={home:this.home,left:{x:feet.x-reach(hitFrame),y:feet.y},second:{x:feet.x-reach(this.mode==='skill'?2:hitFrame),y:feet.y},third:{x:feet.x-reach(this.mode==='skill'?5:hitFrame),y:feet.y},right:{x:feet.x+this.bodyHeight*this.merc.root.scale.x*.7,y:feet.y}};
  const a=anchors[state.path.from],b=anchors[state.path.to],q=state.path.mix,groundY=mix(a.y,b.y,q);
  return{x:mix(a.x,b.x,q),y:groundY-state.lift*this.bodyHeight*this.merc.root.scale.y,groundY};
 }
 applyPose(p){
  const f=this.pose(p),s=this.merc.fullBodySprite,t=this.assets.motion[p.bank][f.index];s.texture=t;s.anchor.set(f.pivot.x/t.width,f.pivot.y/t.height);s.scale.set(this.scaleFor(f));s.position.set(0,0);this.merc.view.scale.set(p.facing,1);this.merc.view.position.set(0,0);
 }
 point(p,layer=this.front){return layer.toLocal(this.merc.root.parent.toGlobal(p));}
  bladePoints(state,r){const f=this.pose(state.pose),s=this.scaleFor(f)*this.merc.root.scale.x,dir=state.pose.facing;const point=p=>({x:r.x+(p.x-f.pivot.x)*s*dir,y:r.y+(p.y-f.pivot.y)*s});return{grip:point(f.grip),start:point(f.bladeStart||f.grip),tip:point(f.tip)};}
 textureFrame(key,progress){const a=this.assets.effects[key];return a?.[Math.min(a.length-1,Math.floor(clamp(progress)*a.length))];}
  draw(sprite,texture,p,width,{alpha=1,angle=0,anchorX=.5,anchorY=.5,blend='normal',facing=1,key}={}){
  if(!texture){sprite.visible=false;return;}const bounds=this.manifest.effects[key]?.contentBounds;
  if(bounds){anchorX=(bounds.left+bounds.width*anchorX)/texture.width;anchorY=(bounds.top+bounds.height*anchorY)/texture.height;width*=texture.width/bounds.width;}
  sprite.texture=texture;sprite.visible=alpha>0;sprite.position.set(p.x,p.y);sprite.anchor.set(anchorX,anchorY);sprite.scale.set(width/texture.width*facing,width/texture.width);sprite.alpha=alpha;sprite.rotation=angle;sprite.tint=0xffffff;sprite.blendMode=blend;
 }
 render(t){
  if(this.disposed)return;const e=this.engine,m=this.merc,state=this.state=sample(this.mode,t),size=this.bodyHeight*m.root.scale.x;
  this.pool.forEach(s=>s.visible=false);this.ghosts.forEach(s=>s.visible=false);this.shade.clear();
  const resting=state.done&&this.mode!=='idle',p=resting?{bank:'idle',index:0,facing:1}:state.pose;this.applyPose(p);
  const r=resting?{...this.home,groundY:this.home.y}:this.rootFor(state);m.root.position.set(r.x,r.y);m.root.depthSortY=r.groundY;e.sortCombatDepth();
  const torso=this.targetPoint(),feet=this.targetPoint(this.target,0),target=this.point(torso),ground=this.point(feet),own=this.point(r),center=this.targets.reduce((v,a)=>{const p=this.point(this.targetPoint(a));return{x:v.x+p.x/this.targets.length,y:v.y+p.y/this.targets.length};},{x:0,y:0});
  const auraOn=this.effectsEnabled&&this.auraEnabled;this.aura.visible=this.backgroundAura.visible=auraOn;
  if(auraOn){
   const ambientPhase=(t%4)/4,tex=this.textureFrame('aura',ambientPhase),pressure=this.textureFrame('pressure',ambientPhase),at=this.point(r,this.back);
   // Register both ambient layers at the actor's feet, including during movement.
   this.draw(this.aura,tex,at,size*1.75,{anchorY:.98,alpha:.78,key:'aura'});
   this.draw(this.backgroundAura,pressure,at,size*3.1,{anchorY:.98,alpha:.4,key:'pressure'});
  }
  if(state.ghosts&&!resting){[.035,.075,.12,.18].forEach((ago,i)=>{if(t<ago)return;const old=sample(this.mode,t-ago),r0=this.rootFor(old),f=this.pose(old.pose),s=this.ghosts[i],texture=this.assets.motion[old.pose.bank][f.index];s.texture=texture;s.anchor.set(f.pivot.x/texture.width,f.pivot.y/texture.height);s.scale.set(this.scaleFor(f)*m.root.scale.x*old.pose.facing,this.scaleFor(f)*m.root.scale.y);s.position.copyFrom(this.point(r0,this.back));s.alpha=[.23,.16,.10,.05][i];s.tint=0xc7d9e5;s.blendMode='add';s.visible=true;});}
  this.activeFrames=[];
  state.effects.forEach((fx,i)=>{
   const layer=['ultimate','pressure'].includes(fx.key)?this.back:this.front;if(this.pool[i].parent!==layer)layer.addChild(this.pool[i]);
   let pt=target,width=size*fx.width,anchorY=.5;
   if(fx.anchor==='wake')pt={x:own.x-size*.25,y:own.y-size*.45};
   if(fx.anchor==='actor')pt={x:own.x,y:own.y-size*.53};
   if(fx.anchor==='ground'){pt=ground;anchorY=.85;}
   if(fx.anchor==='field'){pt=center;width=Math.max(size*3.5,Math.min(size*fx.width,e.scene.width*.9/e.stage.scale.x));}
   if(fx.anchor==='fieldground'){pt={x:center.x,y:ground.y};width=Math.max(size*3.3,Math.min(size*fx.width,e.scene.width*.86/e.stage.scale.x));anchorY=.83;}
   const tex=this.textureFrame(fx.key,fx.progress);this.draw(this.pool[i],tex,pt,width,{alpha:fx.alpha,angle:fx.angle,anchorY,blend:fx.anchor==='wake'?'add':'normal',key:fx.key});this.activeFrames.push({key:fx.key,progress:fx.progress,position:pt,width});
  });
  if(this.mode==='ultimate'&&t>.1&&t<4)this.shade.rect(-2000,-2000,6000,6000).fill({color:0x08071b,alpha:Math.min(.42,smooth((t-.1)/.25)*.42,smooth((4-t)/.4)*.42)});
  this.screenLayer.visible=Boolean(state.cinematic&&this.effectsEnabled);
  if(this.screenLayer.visible){
   const c=state.cinematic,w=e.app.screen.width,h=e.app.screen.height,a=this.assets.cinematics.awakening,tex=a[Math.min(a.length-1,Math.floor(c.progress*a.length))];
   this.cinemaShade.clear().rect(0,0,w,h).fill({color:0x050713,alpha:.74*c.alpha});
   this.draw(this.cinemaPressure,this.textureFrame('pressure',c.progress),{x:w*.47,y:h*.53},w*1.2,{alpha:.72*c.alpha,key:'pressure'});
   this.cinemaPortrait.texture=tex;this.cinemaPortrait.anchor.set(1,1);const scale=Math.min(h*.98/tex.height,w*.86/tex.width);this.cinemaPortrait.scale.set(scale);
   const dock=e.host.closest('.battle-v3-live-shell')?.querySelector('[data-v3-dock]')?.getBoundingClientRect(),canvas=e.app.canvas.getBoundingClientRect();const cinematicBottom=e.mobile&&dock?clamp((dock.top-canvas.top)*h/canvas.height,h*.45,h):h+2;
   const slide=(1-smooth(c.progress/.22))*w*.10;this.cinemaPortrait.position.set(w+2+slide,cinematicBottom);this.cinemaPortrait.alpha=c.alpha;
   const portraitLeft=w+2+slide-tex.width*scale;this.cinemaMask.clear().poly([portraitLeft+tex.width*scale*.06,0,w+10,0,w+10,cinematicBottom+10,portraitLeft+tex.width*scale*.3,cinematicBottom-(e.mobile?48:0)]).fill(0xffffff);
   this.cinemaTitle.style.fontSize=e.mobile?31:Math.min(74,h*.2);this.cinemaSubtitle.style.fontSize=e.mobile?15:28;this.cinemaTitle.position.set(w*.10,(e.mobile ? cinematicBottom*.14 : h*.43));this.cinemaSubtitle.position.set(w*.10,(e.mobile ? cinematicBottom*.14 : h*.43)+this.cinemaTitle.height+9);this.cinemaTitle.alpha=this.cinemaSubtitle.alpha=c.alpha;
  }
  const bp=this.bladePoints(state,r),height=(this.target.fullBodyHeight||300)*this.target.root.scale.y;
  // The authored cuts cross waist, chest, and head at different heights. Test the
  // real blade segment against that fixed target body band, never the handle.
  const contactPoint={x:torso.x,y:clamp(mix(bp.start.y,bp.tip.y,.5),feet.y-height*.94,feet.y-height*.38)};
  this.collision={...bladeContact(bp.start,bp.tip,contactPoint,height*.14),targetHeightFraction:(feet.y-contactPoint.y)/height,segment:'bladeStart-to-tip'};this.groundError=Math.abs(r.y+state.lift*this.bodyHeight*m.root.scale.y-r.groundY);
  for(const a of this.targets){a.view.x=state.impact*Math.sin(t*103)*(this.mode==='ultimate'?6:3);a.view.y=-state.impact*1.8;}
  if(this.zoom&&this.mode==='idle'){
   // Review-only camera close-up: retain native registered sprite/formation scale.
   const z=Math.min(3.6,e.scene.height*.90/(size*1.18),e.scene.width*.80/(size*2.1));
   e.camera.focusAt({x:r.x-size*.14,y:r.y-size*.53},z);e.stage.position.set(e.camera.base.x,e.camera.base.y);
  }else if(this.zoom){
   const whole=this.mode==='ultimate'?smooth((t-1.75)/.45)*(1-smooth((t-3.65)/.4)):0;
   const group=this.targets.map(a=>this.targetPoint(a,1));
   const top=mix(Math.min(r.y-size,feet.y-height),Math.min(r.y-size,...group.map(p=>p.y)),whole),bottom=Math.max(r.y,feet.y),spanY=bottom-top+size*.18,spanX=Math.abs(r.x-torso.x)+size*2.1;
   const base=Math.min(3.6,e.scene.width*.88/spanX,e.scene.height*.90/spanY);
   const z=Math.max(.55,base),focus={x:(r.x+torso.x)/2,y:(top+bottom)/2};
   e.camera.focusAt({x:focus.x,y:focus.y+e.scene.height*.04/z},z);
   const shake=e.reducedMotion?0:state.impact*(this.mode==='ultimate'?4:1.5);e.stage.position.set(e.camera.base.x+Math.sin(t*107)*shake,e.camera.base.y+Math.cos(t*97)*shake*.5);
  }else e.camera.reset(true);
  this.onUpdate(this);
 }
 cancel(){this.removeTimeline();this.clock.time=0;if(!this.disposed){this.render(0);this.pool.forEach(s=>s.visible=false);this.ghosts.forEach(s=>s.visible=false);this.shade.clear();this.screenLayer.visible=false;this.cinemaShade.clear();}this.onCancel?.();}
  diagnostics(){return{ready:!this.disposed,mode:this.mode,time:this.time,playing:this.playing,speed:this.speed,motionPlaybackRate:this.state?.motionPlaybackRate,effectPlaybackRate:this.state?.effectPlaybackRate,referenceHeight:610,physicalBodyHeight:this.bodyHeight,cinematicVisible:this.screenLayer.visible,phase:this.state?.phase,pose:this.state?.pose,contactCount:this.state?.contactCount,bladeContact:this.collision,groundError:this.groundError,airborne:this.state?.lift>0,visibleEffects:this.front.visible?this.pool.filter(s=>s.visible).length:0,visibleGhosts:this.back.visible?this.ghosts.filter(s=>s.visible).length:0,auraVisible:this.back.visible&&this.aura.visible,registeredTimelines:this.registration&&this.engine.simpleTimelines.has(this.registration)?1:0,activeFrames:this.activeFrames,weaponSha256:this.manifest.weapon?.sha256,regularAllies:this.engine.allies.length,targets:this.targets.length,clock:'V3_REGISTERED_GSAP',liveEnabled:false,actor:{x:this.merc.root.x,y:this.merc.root.y}};}
 destroy(){if(this.disposed)return;this.cancel();this.disposed=true;this.engine.camera.reset(true);for(const a of this.targets)a.view.position.set(0,0);this.front.destroy({children:true});this.back.destroy({children:true});this.screenLayer.destroy({children:true});for(const a of [...Object.values(this.assets.motion),...Object.values(this.assets.effects),...Object.values(this.assets.cinematics)])for(const t of a)t.destroy(false);}
}
