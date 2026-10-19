import {Assets,Container,Sprite,Texture,Rectangle,Graphics} from 'pixi.js';
import {gsap} from 'gsap';
import {WhiteAuraAppearance} from './WhiteAuraAppearance.js';
import {MODES,sample,phantomSample,bladeContact,smooth,PHANTOM_COUNT} from '../motion.mjs';
const ROOT='/preview/mercenary-cyan-knight-battle-20261020-v1/',HEIGHT=360,mix=(a,b,t)=>a+(b-a)*t;
export async function loadKnightAssets(m){
 const out={motion:{},effects:{},appearance:[],blade:await Assets.load(ROOT+m.weapon.url)};
 await Promise.all([
 ...Object.entries(m.motion).map(async([k,s])=>{const a=await Assets.load(ROOT+s.url);out.motion[k]=s.frames.map((f,i)=>new Texture({source:a.source,frame:new Rectangle(i%s.columns*s.frameWidth,Math.floor(i/s.columns)*s.frameHeight,s.frameWidth,s.frameHeight)}));}),
 ...Object.entries(m.effects).map(async([k,s])=>{const a=await Assets.load(ROOT+s.url);out.effects[k]=s.frames.map(f=>new Texture({source:a.source,frame:new Rectangle(f.rect.x,f.rect.y,f.rect.width,f.rect.height)}));})
 ]);
 if(m.appearance){const a=await Assets.load(ROOT+m.appearance.url),s=m.appearance;out.appearance=Array.from({length:s.columns*s.rows},(_,i)=>new Texture({source:a.source,frame:new Rectangle(i%s.columns*s.frameWidth,Math.floor(i/s.columns)*s.frameHeight,s.frameWidth,s.frameHeight)}));}
 return out;
}
export class KnightFX{
 constructor(engine,unit,targets,assets,manifest,onUpdate){
  Object.assign(this,{engine,unit,targets,assets,manifest,onUpdate,mode:'array',speed:1,zoom:false,disposed:false,effectsEnabled:true,clock:{time:0}});
  unit.cancelFire();unit.stopIdle();unit.swordAnimation?.cancel();unit.nameHud.visible=false;
  this.back=new Container({label:'CyanKnightBackFX'});this.back.eventMode='none';engine.backgroundLayer.addChild(this.back);
  this.front=new Container({label:'CyanKnightFrontFX'});this.front.eventMode='none';engine.effectLayer.addChild(this.front);
  this.shade=new Graphics();this.back.addChild(this.shade);
  this.swordTrails=new Graphics();this.front.addChild(this.swordTrails);
  this.ghostPool=Array.from({length:4},()=>{const s=new Sprite();s.visible=false;this.back.addChild(s);return s;});
  this.flightPool=Array.from({length:PHANTOM_COUNT},()=>{const s=new Sprite();s.visible=false;this.front.addChild(s);return s;});
  this.pool=Array.from({length:24},()=>{const s=new Sprite();s.visible=false;this.front.addChild(s);return s;});
  // The five physical blades remain visible when the VFX overlay is disabled.
  this.swords=new Container({label:'CyanKnightFiveOriginalSwords'});this.swords.eventMode='none';engine.effectLayer.addChild(this.swords);
  this.swordPool=Array.from({length:PHANTOM_COUNT},()=>{const s=new Sprite(assets.blade);s.visible=false;this.swords.addChild(s);return s;});
  this.appearance=manifest.appearance?new WhiteAuraAppearance(unit,assets.appearance,manifest.appearance):null;
  this.capture();this.makeTimeline();this.render(0);
 }
 capture(){this.home={x:this.unit.root.baseX,y:this.unit.root.baseY};}
 get time(){return this.clock.time;}
 get playing(){return Boolean(this.timeline&&!this.timeline.paused()&&this.time<MODES[this.mode].duration);}
 removeTimeline(){if(this.registration)this.engine.simpleTimelines.delete(this.registration);this.timeline?.kill();this.timeline=null;this.registration=null;}
 makeTimeline(){
  this.removeTimeline();this.timeline=gsap.timeline({paused:true,onUpdate:()=>this.render(this.clock.time),onComplete:()=>{this.engine.simpleTimelines.delete(this.registration);this.render(MODES[this.mode].duration);}})
   .to(this.clock,{time:MODES[this.mode].duration,duration:MODES[this.mode].duration,ease:'none'}).timeScale(this.speed);
  this.registration={instance:this.timeline,settle:()=>this.cancel()};
 }
 play(){if(this.disposed)return;if(!this.timeline)this.makeTimeline();if(this.time>=MODES[this.mode].duration)this.seek(0);this.unit.stopIdle();this.engine.simpleTimelines.add(this.registration);this.timeline.play();this.onUpdate(this);}
 pause(){this.timeline?.pause();this.onUpdate(this);}
 seek(t){if(this.disposed)return;if(!this.timeline)this.makeTimeline();t=Math.max(0,Math.min(MODES[this.mode].duration,t));this.timeline.pause().time(t,true);this.clock.time=t;this.render(t);}
 setMode(mode){if(!MODES[mode])return;this.cancel();this.mode=mode;this.clock.time=0;this.makeTimeline();this.render(0);}
 setSpeed(n){this.speed=Math.max(.25,Math.min(2,Number(n)||1));this.timeline?.timeScale(this.speed);}
 setEffects(enabled){this.effectsEnabled=enabled;this.back.visible=enabled;this.front.visible=enabled;this.render(this.time);}
 contact(target=this.targets[0]){const h=target.fullBodyHeight||300;return this.unit.root.parent.toLocal(target.root.toGlobal({x:0,y:-h*.52}));}
 targetFeet(target=this.targets[0]){return this.unit.root.parent.toLocal(target.root.toGlobal({x:0,y:0}));}
 pose(p){return this.manifest.motion[p.bank].frames[p.index];}
 rootFor(state){
  const feet=this.targetFeet(),size=HEIGHT*this.unit.root.scale.x,scale=size/360;
  const reach=(p)=>{const f=this.pose(p);return feet.x-p.facing*((f.grip.x-f.pivot.x)+(f.tip.x-f.grip.x)*.55)*scale;};
  const anchors={home:this.home,approach:{x:feet.x-size*.9,y:feet.y},command:{x:feet.x-size*1.13,y:feet.y},air:{x:feet.x-size*.72,y:feet.y},traverse:{x:feet.x+size*.6,y:feet.y},finish:{x:feet.x-size*.8,y:feet.y}};
  MODES[this.mode].contacts.forEach((at,i)=>{anchors['hit'+i]={x:reach(sample(this.mode,at).pose),y:feet.y};});
  const a=anchors[state.path.from]||anchors.approach,b=anchors[state.path.to]||anchors.approach;
  return{x:mix(a.x,b.x,state.path.mix),y:mix(a.y,b.y,state.path.mix)-state.lift*size,groundY:mix(a.y,b.y,state.path.mix)};
 }
 applyPose(p){const s=this.unit.bodySprite,f=this.pose(p);s.texture=this.assets.motion[p.bank][p.index];s.anchor.set(f.pivot.x/768,f.pivot.y/768);s.scale.set(HEIGHT/360);s.position.set(0,0);this.unit.weaponSprite.visible=false;this.unit.view.position.set(0,0);this.unit.view.scale.set(p.facing,1);}
 layerPoint(p,layer=this.front){return layer.toLocal(this.unit.root.parent.toGlobal(p));}
 bladePoints(state,root){const f=this.pose(state.pose),s=HEIGHT/360*this.unit.root.scale.x,dir=state.pose.facing;const point=p=>({x:root.x+(p.x-f.pivot.x)*s*dir,y:root.y+(p.y-f.pivot.y)*s});return{grip:point(f.grip),tip:point(f.tip)};}
 drawGhosts(state){
  this.ghostPool.forEach(s=>s.visible=false);if(!state.ghosts)return;
  [.03,.06,.10,.14].forEach((ago,i)=>{if(state.time<ago)return;const past=sample(this.mode,state.time-ago),r=this.rootFor(past),f=this.pose(past.pose),s=this.ghostPool[i];
   if(Math.hypot(r.x-this.unit.root.x,r.y-this.unit.root.y)<2&&past.pose.index===state.pose.index&&past.pose.bank===state.pose.bank)return;
   s.texture=this.assets.motion[past.pose.bank][past.pose.index];s.anchor.set(f.pivot.x/768,f.pivot.y/768);s.scale.set(HEIGHT/360*this.unit.root.scale.x*past.pose.facing,HEIGHT/360*this.unit.root.scale.y);
   const q=this.layerPoint(r,this.back);s.position.set(q.x,q.y);s.tint=0x8de7ff;s.alpha=[.23,.16,.1,.05][i];s.blendMode='add';s.visible=true;
  });
 }
 drawSwords(state,size){
  this.swordPool.forEach(s=>s.visible=false);this.phantomContacts=[];
  this.flightPool.forEach(s=>s.visible=false);
  this.swordTrails.clear();
  const w=this.manifest.weapon,mid={x:mix(w.grip.x,w.tip.x,.52),y:mix(w.grip.y,w.tip.y,.52)},baseAngle=Math.atan2(w.tip.y-w.grip.y,w.tip.x-w.grip.x),scale=size/w.standingHelmetToSole*1.16;
  const geometry=f=>{const target=this.targets[f.targetIndex%this.targets.length],torso=this.contact(target),center={x:torso.x+f.x*size,y:torso.y+f.y*size},rotation=f.angle-baseAngle;
   const point=p=>{const x=(p.x-mid.x)*scale,y=(p.y-mid.y)*scale;return{x:center.x+x*Math.cos(rotation)-y*Math.sin(rotation),y:center.y+x*Math.sin(rotation)+y*Math.cos(rotation)};};return{target,torso,center,rotation,grip:point(w.grip),tip:point(w.tip)};};
  // Painted wakes attach to actual blade tips and point along measured travel, on the same clock.
  const prior=phantomSample(Math.max(0,state.time-.018));
  if(this.mode==='array'&&state.time>.72)for(const f of state.phantoms){
   const old=prior.find(x=>x.index===f.index);if(!old)continue;
   const now=geometry(f),before=geometry(old),dx=now.center.x-before.center.x,dy=now.center.y-before.center.y;
   const speed=Math.hypot(dx,dy)/(.018*size);if(speed<2.4||f.alpha<.1)continue;
   const frame=3+Math.floor(state.time*72+f.index)%5,s=this.flightPool[f.index],art=this.manifest.effects['flight-v3'].frames[frame];
   s.texture=this.assets.effects['flight-v3'][frame];s.anchor.set(art.pivot.x,art.pivot.y);s.rotation=Math.atan2(dy,dx);
   s.scale.set(size*Math.min(2.25,1.25+speed*.024)/s.texture.width*(this.manifest.effects['flight-v3'].displayScale||1));s.alpha=Math.min(.95,speed/12)*f.alpha;s.blendMode='normal';s.visible=true;
   const point=this.layerPoint(now.tip);s.position.set(point.x,point.y);
  }
  // Fine afterimages retain the exact physical sword trajectory beneath the painted wake.
  if(this.mode==='array'&&state.time>.72&&state.time<3.3){
   const history=Array.from({length:15},(_,k)=>phantomSample(Math.max(0,state.time-k*.009)));
   for(let k=history.length-2;k>=0;k--)for(const f of history[k]){
    const old=history[k+1].find(x=>x.index===f.index);if(!old||f.alpha<.1)continue;
    const a=geometry(f),b=geometry(old);if(Math.hypot(a.tip.x-b.tip.x,a.tip.y-b.tip.y)<1.2)continue;
    const q=this.layerPoint(a.tip),r=this.layerPoint(b.tip);this.swordTrails.moveTo(q.x,q.y).lineTo(r.x,r.y).stroke({color:f.index%2?0x42baff:0xffb23d,width:Math.max(.5,(1-k/15)*size*.035),alpha:(1-k/15)*.55});
   }
  }
  for(const f of state.phantoms){
   const {target,torso,center,rotation}=geometry(f),s=this.swordPool[f.index];
   s.anchor.set(mid.x/w.width,mid.y/w.height);s.scale.set(scale);s.rotation=rotation;s.alpha=f.alpha;s.visible=f.alpha>.015;s.blendMode='normal';
   const q=this.layerPoint(center,this.swords);s.position.set(q.x,q.y);
   const point=p=>{const x=(p.x-mid.x)*scale,y=(p.y-mid.y)*scale;return{x:center.x+x*Math.cos(rotation)-y*Math.sin(rotation),y:center.y+x*Math.sin(rotation)+y*Math.cos(rotation)};};
   const grip=point(w.grip),tip=point(w.tip),h=(target.fullBodyHeight||300)*target.root.scale.y;
   this.phantomContacts.push({index:f.index,targetIndex:f.targetIndex%this.targets.length,grip,tip,...bladeContact(grip,tip,torso,h*.27)});
  }
 }
 render(t){
  if(this.disposed)return;
  const u=this.unit,e=this.engine,state=this.state=sample(this.mode,t),size=HEIGHT*u.root.scale.x;
  this.pool.forEach(s=>s.visible=false);this.shade.clear();
  const visualPose=state.done&&this.mode!=='defeat'?{bank:'idle',index:0,facing:1}:state.pose;this.applyPose(visualPose);
  this.appearance?.update(t,visualPose,this.pose(visualPose),this.effectsEnabled,e.reducedMotion);
  const r=this.rootFor(state);u.root.position.set(r.x,r.y);u.root.depthSortY=r.groundY;e.sortCombatDepth();
  const torso=this.contact(),feet=this.targetFeet(),bp=this.bladePoints(state,r),height=(this.targets[0].fullBodyHeight||300)*this.targets[0].root.scale.y;
  this.collision=bladeContact(bp.grip,bp.tip,torso,height*.3);this.groundError=Math.abs(r.y+state.lift*size-r.groundY);
  this.drawGhosts(state);this.drawSwords(state,size);
  const points={body:this.layerPoint(torso),ground:this.layerPoint(feet),actor:this.layerPoint({x:r.x,y:r.y-size*.56}),actorGround:this.layerPoint(r),wake:this.layerPoint({x:r.x-size*.04*state.pose.facing,y:r.y-size*.46})};
  state.effects.forEach((fx,i)=>{const s=this.pool[i],art=this.manifest.effects[fx.key].frames[fx.frame],layer=fx.anchor==='ground'||fx.anchor==='actorGround'?this.back:this.front;if(s.parent!==layer)layer.addChild(s);s.texture=this.assets.effects[fx.key][fx.frame];s.visible=true;s.alpha=fx.alpha;s.blendMode=fx.anchor==='wake'?'add':'normal';s.rotation=fx.angle;s.anchor.set(art.pivot?.x??.5,art.pivot?.y??.5);
   if((fx.anchor==='ground'||fx.anchor==='actorGround')&&!art.pivot)s.anchor.set(.5,fx.key==='ground'?.89:.91);
   if(fx.anchor==='wake')s.anchor.set(.8,.5);
   s.scale.set(size*fx.width/s.texture.width*(this.manifest.effects[fx.key].displayScale||1));if(fx.anchor==='wake')s.scale.x*=state.pose.facing;if(fx.flip)s.scale.x*=fx.flip;
   const q=points[fx.anchor],drift=fx.fromX===undefined?0:mix(fx.fromX,fx.toX,smooth(fx.progress)),point=layer.toLocal(this.front.toGlobal({x:q.x+drift*size,y:q.y}));s.position.set(point.x,point.y);
  });
  if(MODES[this.mode].type==='area'&&t>.15&&!state.done){const opacity=Math.min(.31,smooth((t-.15)/.22)*.31,smooth((MODES[this.mode].duration-t)/.45)*.31);this.shade.rect(-2000,-2000,6000,6000).fill({color:0x030b16,alpha:opacity});}
  this.targets.forEach((target,i)=>{const active=MODES[this.mode].type==='area'||i===0;target.view.x=active?state.impact*Math.sin(t*97+i)*4:0;target.view.y=active?-state.impact*2:0;});
  if(this.zoom){
   const all=this.targets.map(x=>this.contact(x)),xs=all.map(x=>x.x),ys=this.targets.map(x=>this.targetFeet(x).y);
   const cinematic=['array','meteor','zenith'].includes(this.mode)?smooth((t-.16)/.48)*(1-smooth((t-(MODES[this.mode].duration-.37))/.37)):0;
   const leftWide=Math.min(this.home.x-size*(this.appearance?1.2:.65),...xs.map(x=>x-size*1.15));
   const groundWave=this.mode==='meteor'||this.mode==='zenith';
   const left=mix(leftWide,Math.min(...xs)-size*(this.appearance?2.2:2.05),cinematic),right=Math.max(...xs.map(x=>x+size*(groundWave?2.0:2.12)));
   const fan=this.mode==='array'?1-smooth((t-.64)/.23)+smooth((t-2.15)/.18)*(1-smooth((t-2.65)/.2)):0;
   const top=Math.min(...ys)-size*(this.mode==='array'?mix(1.9,2.2,Math.min(1,fan)):this.mode==='zenith'?2.35:this.mode==='meteor'?2.05:1.8),bottom=Math.max(...ys)+size*.22;
   const zoom=Math.min(e.mobile?2.9:mix(2.25,2.5,cinematic),e.scene.width*.90/(right-left),e.scene.height*.90/(bottom-top));
   e.camera.focusAt({x:(left+right)/2,y:(top+bottom)/2+e.scene.height*.10/zoom},zoom);
   const shake=e.reducedMotion?0:state.impact*(this.mode==='zenith'||(this.mode==='array'&&t>3)?4.5:2.1);e.stage.position.set(e.camera.base.x+Math.sin(t*112)*shake,e.camera.base.y+Math.cos(t*97)*shake*.5);
  }else e.camera.reset(true);
  this.onUpdate(this);
 }
 cancel(){this.removeTimeline();this.clock.time=0;if(!this.disposed)this.render(0);}
 diagnostics(){return{ready:!this.disposed,appearance:this.appearance?.diagnostics(),version:this.manifest.version,mode:this.mode,time:this.time,playing:this.playing,speed:this.speed,pose:this.state?.pose,phase:this.state?.phase,contactCount:this.state?.contactCount,bladeContact:this.collision,phantomContacts:this.phantomContacts,groundError:this.groundError,airborne:this.state?.lift>0,visibleEffects:this.effectsEnabled?this.pool.filter(s=>s.visible).length:0,visibleGhosts:this.effectsEnabled?this.ghostPool.filter(s=>s.visible).length:0,visibleSwords:this.swordPool.filter(s=>s.visible).length,registeredTimelines:this.registration&&this.engine.simpleTimelines.has(this.registration)?1:0,...this.manifest.summary,weaponSha256:this.manifest.weapon.sha256,regularAllies:this.engine.allies.length,targets:this.targets.length,clock:'V3_REGISTERED_GSAP',liveEnabled:false,actor:{x:this.unit.root.x,y:this.unit.root.y,height:HEIGHT*this.unit.root.scale.y},contact:this.contact(),ground:this.targetFeet()};}
 destroy(){if(this.disposed)return;this.cancel();this.disposed=true;this.appearance?.destroy();this.engine.camera.reset(true);this.targets.forEach(t=>t.view.position.set(0,0));this.front.destroy({children:true});this.back.destroy({children:true});this.swords.destroy({children:true});for(const frames of[...Object.values(this.assets.motion),...Object.values(this.assets.effects),this.assets.appearance])for(const t of frames)t.destroy(false);}
}
