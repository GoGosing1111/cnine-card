import {Container,Sprite} from 'pixi.js';
import {MODES,smooth,clamp,bladeContact} from '../motion.mjs';
const HEIGHT=360,TAU=Math.PI*2,mix=(a,b,t)=>a+(b-a)*t;

// One spectral greatsword uses the existing battle clock; it never changes the held weapon.
export class ZeroGiantSwordEcho{
 constructor(fx,texture,frames,spec){
  Object.assign(this,{fx,unit:fx.unit,spec,frames,destroyed:false,finishPhase:'dormant'});
  this.root=new Container({label:'ZeroGiantSwordEcho',zIndex:8,eventMode:'none'});
  this.sprite=new Sprite(texture);this.rim=new Sprite(texture);this.rim.blendMode='add';
  for(const s of [this.sprite,this.rim]){s.anchor.set(spec.grip.x/spec.width,spec.grip.y/spec.height);s.scale.set(HEIGHT*spec.lengthInBodies/spec.bladePixels);}
  this.root.addChild(this.sprite,this.rim);this.unit.view.addChild(this.root);this.unit.view.sortChildren();
  this.finishRoot=new Container({label:'ZeroGiantSwordFinisher',eventMode:'none'});fx.engine.effectLayer.addChild(this.finishRoot);
  this.sweep=new Sprite();this.sweep.anchor.set(.5);this.finishRoot.addChild(this.sweep);
  this.ghosts=Array.from({length:3},()=>{const s=new Sprite(texture);s.anchor.copyFrom(this.sprite.anchor);s.blendMode='add';return this.finishRoot.addChild(s);});
  this.strike=new Sprite(texture);this.strike.anchor.copyFrom(this.sprite.anchor);this.finishRoot.addChild(this.strike);
 }
 update(time,pose,registration,enabled,reducedMotion=false){
  if(this.destroyed)return;
  const f=this.fx,state=f.state,h=HEIGHT,t=reducedMotion?0:time,box=registration.componentBox,foot=registration.sourceFoot;
  const sourceScale=h/(registration.sourceUpright||760),torsoX=Math.max(-h*.15,Math.min(h*.15,(box.left+box.width*.5-foot[0])*sourceScale));
  const isArea=MODES[state.mode].type==='area',hit=isArea?MODES[state.mode].contacts.at(-1):null;
  const charge=hit===null?state.impact*.24:smooth((time-(hit-.82))/.52)*(1-smooth((time-(hit+.10))/.30));
  const released=hit===null?0:smooth((time-(hit-.38))/.10)*(1-smooth((time-(hit+.44))/.32));
  this.root.visible=enabled;this.finishRoot.visible=enabled;this.finishPhase='dormant';
  this.root.position.set(torsoX-h*.52*pose.facing,-h*.20+Math.sin(t*TAU/3.8)*h*.009);
  this.root.scale.x=pose.facing;this.root.rotation=(.30+Math.sin(t*TAU/4.8)*.012)*pose.facing;
  this.sprite.alpha=(.48+charge*.36)*(1-released*.94);
  this.rim.alpha=(.13+charge*.17)*(1-released);
  this.root.alpha=pose.bank==='defeat'?Math.max(0,1-time/1.05):1;
  if(!f.zoom)this.fitToViewport(f.engine.app.screen);
  this.strike.visible=false;this.sweep.visible=false;this.ghosts.forEach(s=>s.visible=false);
  this.contact=null;
  if(hit===null||state.done)return;
  if(time>hit-.82&&time<hit-.34)this.finishPhase='charging';
  const delta=time-hit;
  if(delta<-.34||delta>.60)return;
  const size=h*this.unit.root.scale.x,reach=size*this.spec.finishReachInBodies;
  const target=f.layerPoint(f.contact(),this.finishRoot),grip={x:target.x-reach*.58,y:target.y+reach*.23};
  const contactAngle=Math.atan2(.58,.23),scale=reach/(this.spec.grip.y-this.spec.tip.y);
  const angleAt=d=>d<0?mix(.30,contactAngle,Math.pow(clamp((d+.22)/.22),2.4)):mix(contactAngle,2.13,1-Math.pow(1-clamp(d/.13),2));
  const alpha=(delta<-.22?smooth((delta+.34)/.12):1)*(1-smooth((delta-.15)/.32));
  this.finishPhase=delta<-.22?'release':delta<0?'downswing':delta<.15?'impact':'dissolve';
  if(reducedMotion){
   this.strike.visible=delta>=0&&delta<.22;this.strike.position.set(grip.x,grip.y);this.strike.rotation=contactAngle;this.strike.scale.set(scale);this.strike.alpha=.55*(1-clamp(delta/.22));
  }else{
   const source=this.finishRoot.toLocal(this.root.toGlobal({x:0,y:0})),travel=smooth((delta+.34)/.12);
   this.strike.position.set(mix(source.x,grip.x,travel),mix(source.y,grip.y,travel));this.strike.rotation=angleAt(delta);this.strike.scale.set(mix(size*this.spec.lengthInBodies/this.spec.bladePixels,scale,travel));this.strike.alpha=alpha*.94;this.strike.visible=alpha>.001;
   this.ghosts.forEach((s,i)=>{const d=delta-[.016,.034,.055][i];s.visible=delta>-.14&&delta<.28&&d>-.22;s.position.set(grip.x,grip.y);s.scale.set(scale);s.rotation=angleAt(d);s.alpha=[.17,.10,.045][i]*alpha;});
  }
  const sweepStart=reducedMotion?0:-.18,sweepEnd=reducedMotion?.25:.33;
  if(delta>=sweepStart&&delta<sweepEnd){
   const progress=(delta-sweepStart)/(sweepEnd-sweepStart),frame=reducedMotion?3:Math.min(this.frames.length-1,Math.floor(progress*this.frames.length));
   const pivot=this.spec.effect.pivots?.[frame]||{x:.82,y:.82};
   this.sweep.texture=this.frames[frame];this.sweep.anchor.set(pivot.x,pivot.y);this.sweep.visible=true;this.sweep.position.set(target.x,target.y);this.sweep.scale.set(size*3.05/this.sweep.texture.width);this.sweep.alpha=(reducedMotion?.50:.92)*(1-smooth((progress-.7)/.3));
  }
  if(this.strike.visible){const actualGrip=this.finishRoot.toLocal(this.strike.toGlobal({x:0,y:0})),actualTip=this.finishRoot.toLocal(this.strike.toGlobal({x:this.spec.tip.x-this.spec.grip.x,y:this.spec.tip.y-this.spec.grip.y}));this.contact={...bladeContact(actualGrip,actualTip,target,size*.12),grip:actualGrip,tip:actualTip,target,atFinalHit:Math.abs(delta)<.001};}
 }
 fitToViewport(screen){
  if(!this.root.visible||this.destroyed)return;
  const b=this.root.getBounds(),margin=6;
  const dx=b.minX<margin?margin-b.minX:b.maxX>screen.width-margin?screen.width-margin-b.maxX:0;
  const dy=b.minY<margin?margin-b.minY:b.maxY>screen.height-margin?screen.height-margin-b.maxY:0;
  if(dx||dy){const p=this.root.getGlobalPosition();this.root.position.copyFrom(this.root.parent.toLocal({x:p.x+dx,y:p.y+dy}));}
  if(this.sweep.visible){
   const q=this.sweep.getGlobalPosition(),b=this.sweep.getBounds();
   const ratios=[1];
   if(b.minX<margin)ratios.push((q.x-margin)/(q.x-b.minX));
   if(b.maxX>screen.width-margin)ratios.push((screen.width-margin-q.x)/(b.maxX-q.x));
   if(b.minY<margin)ratios.push((q.y-margin)/(q.y-b.minY));
   if(b.maxY>screen.height-margin)ratios.push((screen.height-margin-q.y)/(b.maxY-q.y));
   const fit=Math.max(.1,Math.min(...ratios));this.sweep.scale.set(this.sweep.scale.x*fit);
  }
 }
 diagnostics(){return{enabled:this.root.visible,behindBody:this.root.zIndex<this.unit.bodySprite.zIndex,id:this.spec.id,visualApproval:false,finishPhase:this.finishPhase,finishVisible:this.finishRoot.visible&&this.strike.visible,trailVisible:this.finishRoot.visible&&this.sweep.visible,contact:this.contact,destroyed:this.destroyed};}
 destroy(){if(this.destroyed)return;this.destroyed=true;this.root.destroy({children:true});this.finishRoot.destroy({children:true});}
}
