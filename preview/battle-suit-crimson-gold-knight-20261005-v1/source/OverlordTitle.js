import {Container,Sprite,Text,FillGradient,Graphics} from 'pixi.js';

export const OVERLORD_TITLE='종말 위에 군림하는 자';
export class OverlordTitle{
 constructor(unit,assets){
  this.unit=unit;this.enabled=true;
  // Root follows the actor, while view flips with sword poses. Lettering must never flip.
  this.view=new Container({label:'OverlordExclusiveTitle',eventMode:'none',zIndex:50});unit.root.addChild(this.view);
  this.frame=new Sprite(assets.titleOrnament);this.frame.anchor.set(.5);this.frame.scale.set(462/this.frame.texture.width);
  this.frameLight=new Sprite(assets.titleOrnament);this.frameLight.anchor.set(.5);this.frameLight.scale.copyFrom(this.frame.scale);this.frameLight.blendMode='add';
  this.gradient=new FillGradient({type:'linear',start:{x:0,y:0},end:{x:0,y:1},colorStops:[{offset:0,color:'#fff5cc'},{offset:.36,color:'#ffe29a'},{offset:.49,color:'#d9a253'},{offset:.56,color:'#fff0b8'},{offset:1,color:'#b76c2e'}]});
  const style={fontFamily:'OverlordTitle',fontSize:25,letterSpacing:.15,fill:this.gradient,stroke:{color:'#231012',width:3.2,join:'round'},dropShadow:{color:'#020104',alpha:1,blur:3,distance:2,angle:Math.PI/2},padding:8};
  this.text=new Text({text:OVERLORD_TITLE,style,resolution:2});this.text.anchor.set(.5);this.text.y=13;
  if(this.text.width>246)this.text.scale.set(246/this.text.width);
  this.gleam=new Text({text:OVERLORD_TITLE,style:{...style,fill:'#fff9df',stroke:{color:'#fff2b0',width:.7},dropShadow:{color:'#ffd581',alpha:.65,blur:3,distance:0}},resolution:2});
  this.gleam.anchor.set(.5);this.gleam.position.copyFrom(this.text.position);this.gleam.scale.copyFrom(this.text.scale);
  this.gleamMask=new Graphics();this.gleam.mask=this.gleamMask;
  this.sparks=Array.from({length:6},(_,i)=>{const s=new Sprite(assets.auraFlash);s.anchor.set(.5);s.blendMode='add';s.tint=i%2?0xffd083:0xff7448;return s;});
  this.view.addChild(this.frame,this.frameLight,this.text,this.gleam,this.gleamMask,...this.sparks);
 }
 render(time,height,effects=true,mobile=false){
  this.view.visible=this.enabled;if(!this.enabled)return;
  const scale=mobile?1.32:1;this.view.scale.set(scale);
  this.view.position.set(0,-height-this.frame.height*.53*scale-height*.045);
  // Shared GSAP time: no independent ticker, CSS animation or wall-clock drift.
  this.frameLight.alpha=effects ? .055+.025*Math.sin(time*2.4) : 0;
  const phase=(time%2.4)/2.4,sweep=phase<.58?phase/.58:null;
  this.gleam.visible=effects&&sweep!==null;this.gleamMask.clear();
  if(sweep!==null){const x=-160+sweep*320;this.gleamMask.poly([x-23,-16,x-8,-16,x+20,43,x+5,43]).fill(0xffffff);this.gleam.alpha=.64*Math.sin(sweep*Math.PI);}
  this.sparks.forEach((s,i)=>{const side=i%2?-1:1,q=(time*.16+i*.173)%1,fade=Math.sin(q*Math.PI);s.visible=effects;s.position.set(side*(145+q*58),-8-q*45);s.width=3.6+i%3*1.4;s.height=s.width*1.8;s.alpha=fade*.58;s.rotation=.5+time*.1;});
 }
 diagnostics(){const b=this.view.getBounds();return{enabled:this.enabled,text:OVERLORD_TITLE,actorAttached:true,mirrored:this.view.worldTransform.a<0,independentClock:false,screenBounds:{x:b.x,y:b.y,width:b.width,height:b.height},font:'Black Han Sans / OFL',frameSource:'BUILT_IN_IMAGE_GEN'};}
 destroy(){this.view.destroy({children:true});this.gradient.destroy();}
}
