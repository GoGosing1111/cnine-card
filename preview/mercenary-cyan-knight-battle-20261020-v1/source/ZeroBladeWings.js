import {Container,Sprite} from 'pixi.js';
const TAU=Math.PI*2,HEIGHT=360;

// A separate rear ornament keeps the approved body, blade and mantle textures intact.
export class ZeroBladeWings{
 constructor(unit,texture,spec){
  Object.assign(this,{unit,spec,destroyed:false});
  this.root=new Container({label:'ZeroBladeWings',zIndex:8,eventMode:'none'});
  this.sprite=new Sprite(texture);this.sprite.anchor.set(spec.anchor.x,spec.anchor.y);
  this.sprite.scale.set(HEIGHT*spec.heightInBodies/spec.height);
  this.root.addChild(this.sprite);unit.view.addChild(this.root);unit.view.sortChildren();
 }
 update(time,pose,registration,enabled,reducedMotion=false){
  if(this.destroyed)return;
  const h=HEIGHT,t=reducedMotion?0:time,box=registration.componentBox,foot=registration.sourceFoot;
  const sourceScale=h/(registration.sourceUpright||760),posture=Math.min(1,box.height*sourceScale/h);
  const torsoX=Math.max(-h*.15,Math.min(h*.15,(box.left+box.width*.5-foot[0])*sourceScale));
  this.root.visible=enabled;
  this.root.position.set(torsoX-h*.025,-h*this.spec.attachHeight*posture+Math.sin(t*TAU/3.6)*h*.006);
  this.sprite.rotation=Math.sin(t*TAU/4.8)*.008;
  this.sprite.alpha=.94+.06*Math.sin(t*TAU/2.8);
  this.root.alpha=pose.bank==='defeat'?Math.max(0,1-time/1.05):1;
 }
 fitToViewport(screen){
  if(!this.root.visible||this.destroyed)return;
  const b=this.root.getBounds(),margin=6;
  const dx=b.minX<margin?margin-b.minX:b.maxX>screen.width-margin?screen.width-margin-b.maxX:0;
  const dy=b.minY<margin?margin-b.minY:b.maxY>screen.height-margin?screen.height-margin-b.maxY:0;
  if(!dx&&!dy)return;
  // Detached spires can drift inward at an edge without moving or scaling the actor/camera.
  const p=this.root.getGlobalPosition();
  this.root.position.copyFrom(this.root.parent.toLocal({x:p.x+dx,y:p.y+dy}));
 }
 diagnostics(){return{enabled:this.root.visible,behindBody:this.root.zIndex<this.unit.bodySprite.zIndex,layer:this.root.zIndex,id:this.spec.id,visualApproval:this.spec.visualApproval===true,destroyed:this.destroyed};}
 destroy(){if(this.destroyed)return;this.destroyed=true;this.root.destroy({children:true});}
}
