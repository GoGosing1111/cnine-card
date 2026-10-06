import {Container,Sprite,Text,FillGradient,Graphics} from 'pixi.js';

export class SXTitle{
 constructor(unit,texture){
  this.halfWidth=200;this.top=90;this.bottom=64;
  this.view=new Container({label:'SXBlueReaperTitle',eventMode:'none'});unit.root.addChild(this.view);
  // Open silver sword wings: the center is transparent, with no panel or rectangular border.
  this.ornament=new Sprite(texture);this.ornament.anchor.set(.5);this.ornament.scale.set(390/texture.width);this.ornament.y=-14;
  this.ornamentLight=new Sprite(texture);this.ornamentLight.anchor.set(.5);this.ornamentLight.scale.copyFrom(this.ornament.scale);this.ornamentLight.y=-14;this.ornamentLight.blendMode='add';
  this.gradient=new FillGradient({type:'linear',start:{x:0,y:0},end:{x:0,y:1},colorStops:[{offset:0,color:'#ffffff'},{offset:.28,color:'#e1f4ff'},{offset:.46,color:'#83afe0'},{offset:.51,color:'#f8fdff'},{offset:.69,color:'#b9d9f8'},{offset:1,color:'#547cbb'}]});
  const style={fontFamily:'SXTitleSerif',fontWeight:'900',fontSize:34,letterSpacing:3.5,fill:this.gradient,stroke:{color:'#07152d',width:2.1,join:'round'},dropShadow:{color:'#000817',alpha:.95,blur:3,distance:2,angle:Math.PI/2},padding:12};
  this.depth=new Text({text:'푸른 사신',style:{...style,fill:'#1e406f',stroke:{color:'#050c1e',width:2.8}},resolution:3});this.depth.anchor.set(.5);this.depth.position.set(.5,21.6);
  this.text=new Text({text:'푸른 사신',style,resolution:3});this.text.anchor.set(.5);this.text.position.set(0,20);
  this.glow=new Text({text:'푸른 사신',style:{...style,fill:'#236aff',stroke:{color:'#2869eb',width:.5},dropShadow:{color:'#3576ff',alpha:.8,blur:10,distance:0}},resolution:3});this.glow.anchor.set(.5);this.glow.position.copyFrom(this.text.position);this.glow.blendMode='add';
  this.gleam=new Text({text:'푸른 사신',style:{...style,fill:'#ffffff',stroke:{color:'#e9faff',width:.3},dropShadow:{color:'#a5dfff',alpha:.45,blur:2,distance:0}},resolution:3});this.gleam.anchor.set(.5);this.gleam.position.copyFrom(this.text.position);
  this.mask=new Graphics();this.gleam.mask=this.mask;this.sparks=new Graphics();
  this.view.addChild(this.ornament,this.ornamentLight,this.glow,this.depth,this.text,this.gleam,this.mask,this.sparks);
 }
 render(time,position,enabled,scale=1){
  this.view.scale.set(scale);this.view.position.set(position.x,position.y);
  this.ornamentLight.alpha=enabled ? .055+.025*Math.sin(time*2.4) : 0;this.glow.visible=enabled;this.glow.alpha=.30+.08*Math.sin(time*2.4);
  const q=time%2.8/2.8,sweep=q<.56?q/.56:null;this.mask.clear();this.gleam.visible=enabled&&sweep!==null;
  if(sweep!==null){const x=-105+sweep*210;this.mask.poly([x-19,-8,x-9,-8,x+16,49,x+6,49]).fill(0xffffff);this.gleam.alpha=.7*Math.sin(sweep*Math.PI);}
  this.sparks.clear();if(enabled)for(let i=0;i<6;i++){const q=(time*.16+i*.171)%1,x=(i%2?1:-1)*(116+q*58),y=24-q*60,a=Math.sin(q*Math.PI)*.65;this.sparks.circle(x,y,i%3?1:1.5).fill({color:i%2?0x86bdff:0xe4f5ff,alpha:a});}
 }
 diagnostics(){const b=this.view.getBounds();return{text:this.text.text,mirrored:this.view.worldTransform.a<0,actorAttached:true,independentClock:false,font:'Noto Serif KR 900 / OFL',frame:'OPEN_SWORD_WINGS_NO_RECTANGULAR_PANEL',bounds:{x:b.x,y:b.y,width:b.width,height:b.height}};}
 destroy(){this.view.destroy({children:true});this.gradient.destroy();}
}
