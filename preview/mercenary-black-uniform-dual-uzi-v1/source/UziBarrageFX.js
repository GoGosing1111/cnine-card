import {Assets,Container,Sprite,Graphics,Texture,Rectangle,BlurFilter,ColorMatrixFilter} from 'pixi.js';
import {gsap} from 'gsap';
import {PLANS,sample,clamp} from '../skill.mjs';
import {auraTransform} from '../aura-registration.mjs';
import {strikeLayout,missileTip} from '../missile-flight.mjs';
import {BULLET,bulletSegment} from '../bullet-flight.mjs';

export async function loadAssets(manifest,root){
 const out={};
 await Promise.all(Object.entries({burst:manifest.motion.burst,...manifest.effects,...manifest.props}).filter(([key])=>key!=='convergence').map(async([key,spec])=>{
  const sheet=await Assets.load(root+spec.path);
  out[key]=spec.frames.map(f=>new Texture({source:sheet.source,frame:new Rectangle(f.rect.x,f.rect.y,f.rect.width,f.rect.height)}));
 }));return out;
}
function whiteAlpha(){const f=new ColorMatrixFilter();f.matrix=[0,0,0,0,1,0,0,0,0,1,0,0,0,0,1,0,0,0,1,0];return f;}
export class UziBarrageFX{
 constructor(engine,actor,targets,assets,manifest,onUpdate=()=>{}){
  Object.assign(this,{engine,actor,targets,assets,manifest,onUpdate});
  this.clock={time:0};this.speed=1;this.destroyed=false;this.auraEnabled=true;this.rimEnabled=true;this.mode='quantum';this.plan=PLANS[this.mode];
  actor.animationController.kill();
  this.original={texture:actor.fullBodySprite.texture,anchor:{x:actor.fullBodySprite.anchor.x,y:actor.fullBodySprite.anchor.y},width:actor.fullBodySprite.width,height:actor.fullBodySprite.height};
  this.bodyHeight=340;this.targetDefaults=targets.map(t=>({alpha:t.view.alpha,x:t.view.x,tint:t.fullBodySprite.tint}));
  this.layer=new Container({label:'UziBarrageFX',eventMode:'none'});engine.effectLayer.addChild(this.layer);
  this.dim=new Graphics();this.ground=new Graphics();this.lines=new Graphics();this.flash=new Graphics();this.layer.addChild(this.dim,this.ground,this.lines);
  this.pool=Array.from({length:96},()=>{const s=new Sprite();s.anchor.set(.5);s.visible=false;this.layer.addChild(s);return s;});this.layer.addChild(this.flash);
  this.aura=new Container({label:'RegisteredScopeAura',eventMode:'none'});this.aura.zIndex=10;
  this.auraSheets=[new Sprite(assets.aura[0]),new Sprite(assets.aura[0])];this.aura.addChild(...this.auraSheets);actor.view.addChild(this.aura);
  this.makeRim();actor.view.sortChildren();this.makeTimeline();this.render(0);
 }
 makeRim(){
  this.rim=new Container({label:'WhiteSilhouetteLight',eventMode:'none'});this.rim.zIndex=10.5;this.actor.view.addChild(this.rim);
  this.outer=new Sprite();this.inner=new Sprite();this.rimEdge=new Container();this.rimCopies=Array.from({length:8},()=>new Sprite());this.rimEdge.addChild(...this.rimCopies);
  this.rim.addChild(this.outer,this.inner,this.rimEdge);
  this.outerBlur=new BlurFilter({strength:9,quality:2,resolution:.75});this.innerBlur=new BlurFilter({strength:3,quality:2,resolution:1});
  this.rimFilters=[whiteAlpha(),whiteAlpha(),whiteAlpha(),this.outerBlur,this.innerBlur];
  this.outer.filters=[this.rimFilters[0],this.outerBlur];this.inner.filters=[this.rimFilters[1],this.innerBlur];this.rimEdge.filters=[this.rimFilters[2]];
 }
 updateRim(state){
  this.rim.visible=this.rimEnabled;if(!this.rimEnabled)return;
  const main=this.actor.fullBodySprite,boost=this.mode==='quantum'&&state.time>2.7&&state.time<3.8?.16:0;
  for(const s of [this.outer,this.inner,...this.rimCopies]){s.texture=main.texture;s.anchor.copyFrom(main.anchor);s.position.copyFrom(main.position);s.scale.copyFrom(main.scale);s.rotation=main.rotation;}
  this.outer.alpha=.53+boost;this.inner.alpha=.65+boost;this.rimEdge.alpha=.82;
  this.rimCopies.forEach((s,i)=>{const a=i/8*Math.PI*2;s.x+=Math.cos(a)*1.65;s.y+=Math.sin(a)*1.65;});
 }
 updateAura(time){
  this.aura.visible=this.auraEnabled;if(!this.auraEnabled)return;
  const f=(time*8)%12,index=Math.floor(f),q=f-index;
  // Register the artwork's scope center before rotation; cell margins never move the ring.
  this.auraSheets.forEach((s,n)=>{
   const i=(index+n)%12,frame=this.manifest.effects.aura.frames[i],tr=auraTransform(frame,this.bodyHeight,time);
   s.texture=this.assets.aura[i];s.anchor.set(tr.anchorX,tr.anchorY);s.scale.set(tr.scale);s.position.set(tr.x,tr.y);s.rotation=tr.rotation;s.alpha=(n?q:1-q)*.8;
  });
 }
 get time(){return this.clock.time}
 get playing(){return !!this.timeline&&!this.timeline.paused()&&this.time<this.plan.duration}
 makeTimeline(){
  this.removeTimeline();this.timeline=gsap.timeline({paused:true,onUpdate:()=>this.render(this.clock.time),onComplete:()=>{this.engine.simpleTimelines.delete(this.registration);this.render(this.plan.duration);}})
   .to(this.clock,{time:this.plan.duration,duration:this.plan.duration,ease:'none'}).timeScale(this.speed);
  this.registration={instance:this.timeline,settle:()=>this.cancel()};
 }
 removeTimeline(){if(this.registration)this.engine.simpleTimelines.delete(this.registration);this.timeline?.kill();this.timeline=null;this.registration=null;}
 play(){if(this.destroyed)return;if(!this.timeline)this.makeTimeline();if(this.time>=this.plan.duration)this.seek(0);this.engine.simpleTimelines.add(this.registration);this.timeline.play();this.onUpdate(this);}
 pause(){this.timeline?.pause();this.onUpdate(this);}
 seek(t){if(this.destroyed)return;if(!this.timeline)this.makeTimeline();this.timeline.pause().time(clamp(t,0,this.plan.duration),true);this.clock.time=clamp(t,0,this.plan.duration);this.render(this.time);}
 setSpeed(v){this.speed=clamp(Number(v)||1,.25,2);this.timeline?.timeScale(this.speed);this.onUpdate(this);}
 setMode(mode){if(!PLANS[mode]||this.destroyed)return;this.cancel();this.mode=mode;this.plan=PLANS[mode];this.makeTimeline();this.render(0);}
 cancel(){if(this.destroyed)return;this.removeTimeline();this.clock.time=0;this.render(0);}
 setAura(v){this.auraEnabled=Boolean(v);this.render(this.time);}
 setRim(v){this.rimEnabled=Boolean(v);this.render(this.time);}
 draw(key,index,point,width,{alpha=1,anchorX=.5,anchorY=.5,angle=0,add=false}={}){
  const sprite=this.pool[this.used++];if(!sprite)throw Error('FX pool exhausted');
  sprite.texture=this.assets[key][Math.max(0,Math.min(this.assets[key].length-1,index))];sprite.anchor.set(anchorX,anchorY);sprite.position.set(point.x,point.y);
  sprite.width=width;sprite.height=width*sprite.texture.height/sprite.texture.width;sprite.alpha=clamp(alpha);sprite.rotation=angle;sprite.blendMode=add?'add':'normal';sprite.visible=alpha>0;return sprite;
 }
 sequence(key,frame,point,width,options={}){
  const i=Math.floor(frame),q=frame-i,spec=this.manifest.effects[key];this.activeFrames.push({key,index:i,next:Math.min(i+1,spec.frameCount-1)});
  for(let n=0;n<2;n++){const a=(n?q:1-q)*(options.alpha??1);if(a<.001)continue;const index=Math.min(i+n,spec.frameCount-1),r=spec.frames[index].registration;
   this.draw(key,index,point,width,{...options,alpha:a,anchorX:r?r.x/spec.frames[index].rect.width:.5,anchorY:r?r.y/spec.frames[index].rect.height:.5});}
 }
 targetPoint(target,fraction=.48){return this.engine.effectLayer.toLocal(target.fullBodySprite.toGlobal({x:0,y:-target.fullBodySprite.texture.height*fraction}));}
 applyPose(index){const f=this.manifest.motion.burst.frames[index],s=this.actor.fullBodySprite;s.texture=this.assets.burst[index];s.anchor.set(f.foot.x/f.rect.width,f.foot.y/f.rect.height);s.width=this.bodyHeight*f.rect.width/f.bodyHeight;s.height=this.bodyHeight*f.rect.height/f.bodyHeight;s.position.set(0,0);return f;}
 muzzlePoint(f,gun){const [x,y]=f.muzzles[gun],s=this.actor.fullBodySprite;return this.engine.effectLayer.toLocal(s.toGlobal({x:x-f.foot.x,y:y-f.foot.y}));}
 restoreTargets(){this.targets.forEach((t,i)=>{const d=this.targetDefaults[i];t.view.alpha=d.alpha;t.view.x=d.x;t.fullBodySprite.tint=d.tint;});}
 tracer(origin,hit,age,gun){
  const segment=bulletSegment(origin,hit,age);if(!segment)return;
  const {start,end,alpha}=segment;
  // A crisp white core inside two narrow light layers: every layer has identical straight endpoints.
  for(const [width,color,opacity] of [[12,0xffe6bd,.16],[5.5,0xfff0d6,.76],[2.6,0xffffff,1]])
   this.lines.moveTo(start.x,start.y).lineTo(end.x,end.y).stroke({width:width*(gun?.9:1),color,alpha:opacity*alpha});
  this.lastTracers.push({gun,origin:{...origin},hit:{...hit},...segment});
 }
 drawShots(state,points){
  for(const shot of state.shots){const age=state.time-shot.at,target=points[shot.target];
   const hit={x:target.x+Math.sin(shot.at*93)*9,y:target.y+Math.cos(shot.at*73)*12};
   for(let gun=0;gun<2;gun++){const origin=this.lastMuzzles[gun];
    if(age<BULLET.muzzleDuration)this.draw('muzzle',Math.min(7,Math.floor(age/BULLET.muzzleDuration*8)),origin,124,{anchorX:.36,anchorY:.5,angle:gun?.015:-.055,add:true,alpha:this.engine.reducedMotion?.65:1});
    this.tracer(origin,hit,age,gun);
   }
   const impactAge=age-BULLET.flight;
   if(impactAge>=0&&impactAge<BULLET.impactDuration){
    this.draw('impact',4+Math.min(3,Math.floor(impactAge/BULLET.impactDuration*4)),hit,158,{alpha:.96});
    const q=impactAge/.08;
    if(q<1)for(let i=0;i<6;i++){const a=i*Math.PI/3+shot.at*11,r=8+q*48,length=18*(1-q);
     this.lines.moveTo(hit.x+Math.cos(a)*r,hit.y+Math.sin(a)*r).lineTo(hit.x+Math.cos(a)*(r+length),hit.y+Math.sin(a)*(r+length)).stroke({width:2.2,color:0xfff8e8,alpha:(1-q)*.9});
    }
    this.targets[shot.target].fullBodySprite.tint=0xfff3df;
    this.lastBulletHits.push({target:shot.target,point:hit,at:shot.at+BULLET.flight,age:impactAge});
   }
  }
 }
 scopes(points,time,until){
  if(time>=until)return;
  points.forEach((p,i)=>{const age=time-i*.11;if(age<0)return;this.draw('impact',Math.min(3,Math.floor(age/.16)),p,240,{alpha:Math.min(.82,age*3)});
   if(this.mode==='quantum'&&time>.7){const r=37,a=time*.65+i;for(let k=0;k<4;k++){const b=a+k*Math.PI/2;this.ground.arc(p.x,p.y,r,b,b+.3).stroke({color:0xeaf1f2,width:1.3,alpha:.6});}}
  });
 }
 drawMissiles(state,points,epicenter){
  const mainLength=clamp(this.engine.scene.width*.105,130,170);
  for(const m of state.missiles){
   const hit=m.target===null?epicenter:points[m.target],length=mainLength*m.scale;
   // Smoke samples share the GSAP clock and preserve the missile's vertical flight path.
   for(let i=0;i<11;i++){
    const birth=m.launch+(m.impact-m.launch)*i/11,age=state.time-birth;
    if(age<0||age>.55)continue;
    const p=missileTip(m,birth,hit,length);
    this.draw('missileSmoke',0,{x:p.x+Math.sin(i*2.4)*age*8,y:p.y-length-age*24},(24+age*80)*m.scale,{alpha:(1-age/.55)*.24});
   }
   if(state.time>=m.impact)continue;
   const tip=missileTip(m,state.time,hit,length);
   const tail={x:tip.x,y:tip.y-length*.91};
   this.draw('missileExhaust',0,tail,length*(.7+Math.sin(state.time*31)*.06),{anchorX:1,anchorY:.5,angle:Math.PI/2,add:true,alpha:.9});
   this.draw('missile',0,tip,length,{anchorX:1,anchorY:.5,angle:Math.PI/2});
   this.lastMissiles.push({id:m.id,target:m.target,tip:{x:tip.x,y:tip.y},hit:{...hit},impact:m.impact,progress:tip.progress});
  }
 }
 quantum(state,points){
  const {width,height}=this.engine.scene;
  const {epicenter,size}=strikeLayout(points,this.engine.scene,this.manifest.effects.collapse.extents);
  this.lastEpicenter=epicenter;this.lastBlastSize=size;
  if(state.dim>0)this.dim.rect(0,0,width,height).fill({color:0x03070c,alpha:state.dim});
  this.scopes(points,state.time,3.5);this.drawShots(state,points);
  if(state.blast){
   const age=state.blast.age;
   for(let i=0;i<3;i++){const q=(age-.18-i*.14)/1.6;if(q<=0||q>=1)continue;const r=size*(.09+q*.57);
    this.ground.ellipse(epicenter.x,epicenter.y+14,r,r*.27).stroke({width:14*(1-q),color:0x07090d,alpha:(1-q)*.85});
    this.ground.ellipse(epicenter.x,epicenter.y+14,r+5,r*.27+2).stroke({width:3.4*(1-q)+.8,color:0xf3f7f7,alpha:(1-q)*.86});
   }
   this.sequence('collapse',state.blast.frame,epicenter,size,{alpha:state.blast.alpha});
   if(age>.2&&age<2.3)for(let i=0;i<44;i++){
    const life=age-.2-(i%5)*.025;if(life<0)continue;const a=i*2.399963,v=size*(.17+(i%7)*.025),px=epicenter.x+Math.cos(a)*v*life,py=epicenter.y-Math.abs(Math.sin(a))*v*life+size*.1*life*life;
    this.lines.moveTo(px,py).lineTo(px-Math.cos(a)*12,py+Math.abs(Math.sin(a))*18).stroke({width:i%4===0?2.4:1.2,color:i%7===0?0xffe5ba:0xf3ffff,alpha:clamp(1-life/2.1)*.9});
   }
  }
  this.drawMissiles(state,points,epicenter);
  if(state.flash>0)this.flash.rect(0,0,width,height).fill({color:0xf4f8ff,alpha:state.flash*(this.engine.reducedMotion?.22:1)});
 }
 render(time){
  if(this.destroyed)return;this.used=0;this.activeFrames=[];this.lastMissiles=[];this.lastTracers=[];this.lastBulletHits=[];for(const s of this.pool)s.visible=false;for(const g of [this.dim,this.ground,this.lines,this.flash])g.clear();
  const state=sample(time,this.mode);this.state=state;this.restoreTargets();
  const frame=this.applyPose(state.pose);this.updateAura(state.time);this.updateRim(state);
  const points=this.targets.slice(0,this.mode==='quantum'?5:3).map(t=>this.targetPoint(t));this.lastMuzzles=[this.muzzlePoint(frame,0),this.muzzlePoint(frame,1)];
  if(state.time>0&&!state.done){
   if(this.mode==='quantum')this.quantum(state,points);else{this.scopes(points,state.time,3.15);this.drawShots(state,points);}
   state.finishes.forEach(e=>{this.sequence('impact',8+Math.min(7,e.age/1.7*7),points[e.target],this.mode==='quantum'?320:355,{alpha:Math.min(1,(1.7-e.age)*2)});
    if(e.age>.18)this.targets[e.target].view.alpha=this.targetDefaults[e.target].alpha*Math.max(.12,1-(e.age-.18)*1.8);
   });
  }
  this.diagnosticsState={mode:this.mode,time:state.time,pose:state.pose,phase:state.label,usedSprites:this.used,muzzles:this.lastMuzzles,targets:points,clock:'GSAP',frameCount:this.manifest.validation.frameCount,activeFrames:this.activeFrames,gameplayMutation:false};this.onUpdate(this);
 }
 diagnostics(){return {...this.diagnosticsState,playing:this.playing,speed:this.speed,aura:this.auraEnabled,
  auraCenters:this.auraSheets.map(s=>({x:s.x,y:s.y})),auraRadius:this.bodyHeight*.305,auraRotation:this.auraSheets[0].rotation,
  rim:{enabled:this.rimEnabled,color:'WHITE',textureMatchesPose:[this.outer,this.inner,...this.rimCopies].every(s=>s.texture===this.actor.fullBodySprite.texture)},
  epicenter:this.lastEpicenter,blastSize:this.lastBlastSize,missiles:this.lastMissiles,tracers:this.lastTracers,bulletHits:this.lastBulletHits,timelineRegistered:this.engine.simpleTimelines.has(this.registration),destroyed:this.destroyed};}
 destroy(){
  if(this.destroyed)return;this.cancel();this.aura.destroy({children:true,texture:false});this.rim.destroy({children:true,texture:false});this.rimFilters.forEach(f=>f.destroy());this.layer.destroy({children:true,texture:false});
  const s=this.actor.fullBodySprite;s.texture=this.original.texture;s.anchor.set(this.original.anchor.x,this.original.anchor.y);s.width=this.original.width;s.height=this.original.height;
  for(const textures of Object.values(this.assets))for(const texture of textures)texture.destroy(false);this.destroyed=true;
 }
}
