import {Container,Sprite,BlurFilter,ColorMatrixFilter} from 'pixi.js';
const TAU=Math.PI*2;
function white(){const f=new ColorMatrixFilter();f.matrix=[0,0,0,0,1,0,0,0,0,1,0,0,0,0,1,0,0,0,1,0];return f;}

// Appearance layers follow the existing pose; the original body and sword textures stay untouched.
export class WhiteAuraAppearance{
 constructor(unit,frames,spec){
  Object.assign(this,{unit,frames,spec,destroyed:false});
  this.root=new Container({label:'WhiteAuraMantleAndNeon',zIndex:9,eventMode:'none'});unit.view.addChild(this.root);unit.view.sortChildren();
  this.capes=[new Sprite(),new Sprite()];this.root.addChild(...this.capes);
  this.outer=new Sprite();this.inner=new Sprite();this.rim=new Container();this.root.addChild(this.outer,this.inner,this.rim);
  this.rimCopies=Array.from({length:8},()=>this.rim.addChild(new Sprite()));
  this.outerBlur=new BlurFilter({strength:10,quality:2,resolution:1,legacy:true});
  this.innerBlur=new BlurFilter({strength:3.4,quality:2,resolution:1,legacy:true});
  const outerWhite=white(),innerWhite=white(),rimWhite=white();
  this.outer.filters=[outerWhite,this.outerBlur];this.inner.filters=[innerWhite,this.innerBlur];this.rim.filters=[rimWhite];
  this.filters=[outerWhite,innerWhite,rimWhite,this.outerBlur,this.innerBlur];
 }
 update(time,pose,registration,enabled,reducedMotion=false){
  if(this.destroyed)return;
  this.root.visible=enabled;const t=reducedMotion?0:time,h=360,body=this.unit.bodySprite;
  const pulse=.5+.5*Math.sin(t*TAU/2.8);
  for(const s of [this.outer,this.inner,...this.rimCopies]){
   s.texture=body.texture;s.anchor.copyFrom(body.anchor);s.position.copyFrom(body.position);s.scale.copyFrom(body.scale);s.rotation=body.rotation;
  }
  this.rimCopies.forEach((s,i)=>{const angle=i/8*TAU;s.x+=Math.cos(angle)*1.8;s.y+=Math.sin(angle)*1.8;});
  this.outer.alpha=.40+pulse*.05;this.inner.alpha=.72;this.rim.alpha=.98;
  // Use the authored body's registered floor and component extent, never normalize the body itself.
  const box=registration.componentBox,foot=registration.sourceFoot;
  const sourceScale=h/(registration.sourceUpright||760);
  const torsoX=Math.max(-h*.15,Math.min(h*.15,(box.left+box.width*.5-foot[0])*sourceScale));
  const posture=Math.min(1,box.height*sourceScale/h),torsoY=-h*(.78*posture);
  const frameAt=(t%this.spec.cycleSeconds)/this.spec.cycleSeconds*this.frames.length,index=Math.floor(frameAt),blend=frameAt-index;
  this.capes.forEach((s,i)=>{
   const frame=(index+i)%this.frames.length,[x,y]=this.spec.attachPoints[frame];
   s.texture=this.frames[frame];s.anchor.set(x/this.spec.frameWidth,y/this.spec.frameHeight);
   s.position.set(torsoX-h*.035,torsoY);s.scale.set(h*.81/this.spec.capeHeightPixels);
   s.rotation=Math.sin(t*TAU/this.spec.cycleSeconds)*.018;s.alpha=(i?blend:1-blend)*.96;
  });
  this.root.alpha=pose.bank==='defeat'?Math.max(0,1-time/1.05):1;
 }
 diagnostics(){return{enabled:this.root.visible,behindBody:this.root.zIndex<this.unit.bodySprite.zIndex,capeFrames:this.frames.length,bodyAlpha:this.unit.bodySprite.alpha,originalTexture:this.unit.bodySprite.texture.uid,rimColor:'WHITE',destroyed:this.destroyed};}
 destroy(){if(this.destroyed)return;this.destroyed=true;this.root.destroy({children:true});for(const f of this.filters)f.destroy();}
}
