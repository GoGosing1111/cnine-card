import {Container,Sprite,Graphics,Rectangle,Texture} from 'pixi.js';
import {clamp,track} from '../skill.mjs';

// Cut the current battlefield into two rigid pieces; never use character artwork.
export class JokroAwakeningFX {
 constructor(engine,assets,manifest){
  Object.assign(this,{engine,assets,manifest});this.snapshot=null;this.captures=0;
  this.layer=new Container({label:'JokroAwakeningFX'});this.layer.eventMode='none';engine.effectLayer.addChild(this.layer);
  this.shade=new Graphics();this.layer.addChild(this.shade);
  this.pieces=Array.from({length:2},()=>{const root=new Container(),sprite=new Sprite(),mask=new Graphics();root.addChild(sprite,mask);sprite.mask=mask;this.layer.addChild(root);return {root,sprite,mask};});
  this.sprites=Array.from({length:6},()=>{const s=new Sprite();s.anchor.set(.5);s.visible=false;this.layer.addChild(s);return s;});
  this.layer.visible=false;
 }
 release(){for(const p of this.pieces)p.sprite.texture=Texture.EMPTY;this.snapshot?.destroy(true);this.snapshot=null;this.snapshotSize='';}
 capture(w,h){
  if(this.snapshot&&this.snapshotSize===w+'x'+h)return;
  this.release();const {effectLayer,uiLayer,stage,app}=this.engine,ev=effectLayer.visible,uv=uiLayer.visible;
  try{effectLayer.visible=false;uiLayer.visible=false;this.snapshot=app.renderer.generateTexture({target:stage,frame:new Rectangle(0,0,w,h),resolution:1,clearColor:[0,0,0,0]});this.captures++;}
  finally{effectLayer.visible=ev;uiLayer.visible=uv;}
  this.snapshotSize=w+'x'+h;for(const p of this.pieces)p.sprite.texture=this.snapshot;
 }
 frame(sprite,key,frame,x,y,scale,rotation=0,alpha=1){
  sprite.texture=this.assets.effects[key][clamp(Math.floor(frame),0,11)];sprite.position.set(x,y);sprite.scale.set(scale);sprite.rotation=rotation;sprite.alpha=clamp(alpha);sprite.visible=alpha>.001;
 }
 render(plan,state,{motionOnly=false,reducedMotion=false}={}){
  const active=plan.mode==='awakening'&&!state.cancelled&&!state.done&&!motionOnly,t=state.time;
  this.layer.visible=active;this.sprites.forEach(s=>s.visible=false);this.pieces.forEach(p=>p.root.visible=false);this.shade.clear();this.splitVisible=false;
  if(!active){this.release();return;}
  const {width:w,height:h}=this.engine.scene,left=h*.64,right=h*.32,dy=right-left,len=Math.hypot(w,dy),angle=Math.atan2(dy,w),cx=w*.5,cy=(left+right)*.5;
  const split=!reducedMotion&&t>=2.12&&t<3.28;
  if(split){
   this.capture(w,h);this.splitVisible=true;
   const gap=track([[2.12,0],[2.23,19],[2.66,19],[2.77,32],[3.04,14],[3.28,0]],t),nx=-dy/len,ny=w/len;
   this.shade.rect(0,0,w,h).fill({color:0x01100b,alpha:.98});
   this.pieces.forEach((p,i)=>{const sign=i===0?-1:1;p.root.visible=true;p.root.position.set(nx*gap*sign,ny*gap*sign);p.root.alpha=track([[2.12,1],[3.1,1],[3.28,0]],t);p.mask.clear().poly(i===0?[0,0,w,0,w,right,0,left]:[0,left,w,right,w,h,0,h]).fill(0xffffff);});
  }else{
   this.release();
   const dim=track([[0,0],[.5,.1],[1.8,.2],[2.12,.05],[3.28,.05],[3.7,0]],t);if(dim)this.shade.rect(0,0,w,h).fill({color:0x001009,alpha:dim});
  }
  if(t>=2.04&&t<4.55){
   const spec=this.manifest.effects.cleave,b=spec.visibleBounds,viewportWidth=this.engine.app.screen.width/this.engine.root.scale.x,scale=Math.hypot(Math.max(w,viewportWidth),dy)*1.04/(b.right-b.left),frame=track([[2.04,0],[2.12,2],[2.5,3],[2.72,5],[3.35,8],[4.55,11]],t);
   this.frame(this.sprites[0],'cleave',frame,cx,cy,scale,angle,track([[2.04,0],[2.11,1],[3.8,1],[4.55,0]],t));
  }
  for(let i=0;i<5;i++){
   const start=2.67+i*.035,age=t-start;if(age<0||age>=1.45)continue;
   const q=.12+i*.19,b=this.manifest.effects.shatter.visibleBounds,scale=Math.min(w*.31,h*.53)/(b.right-b.left);
   this.frame(this.sprites[i+1],'shatter',age/1.45*12,w*q,left+dy*q,scale,angle*.3,track([[0,0],[.08,1],[1.1,1],[1.45,0]],age));
  }
 }
 diagnostics(){return {splitVisible:this.splitVisible,snapshotAlive:!!this.snapshot,captures:this.captures,visibleSprites:this.sprites.filter(s=>s.visible).length,illustrationCutIn:false};}
 destroy(){this.release();this.layer.destroy({children:true});}
}
