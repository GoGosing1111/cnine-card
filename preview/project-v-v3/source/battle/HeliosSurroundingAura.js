import {Container,Sprite,Graphics,BlurFilter,ColorMatrixFilter} from 'pixi.js';

const TAU=Math.PI*2;
function solidColor([r,g,b]){
 const filter=new ColorMatrixFilter();
 // Match Valter's silhouette treatment: preserve the original alpha and holes.
 filter.matrix=[0,0,0,0,r,0,0,0,0,g,0,0,0,0,b,0,0,0,1,0];return filter;
}

// Presentation only. All layers sit behind the untouched, opaque approved body.
export class HeliosSurroundingAura{
 constructor(engine,actor,assets,height){
  Object.assign(this,{engine,actor,assets,height,destroyed:false,time:0});
  this.root=new Container({label:'HeliosSurroundingAura',eventMode:'none',zIndex:10.5});
  actor.view.addChild(this.root);actor.view.sortChildren();
  this.ground=new Graphics();this.ground.blendMode='add';this.root.addChild(this.ground);
  this.mantle=[new Sprite(),new Sprite()];this.halo=[new Sprite(),new Sprite()];
  this.root.addChild(...this.mantle,...this.halo);
  this.outer=new Sprite();this.inner=new Sprite();this.corona=new Container();this.rim=new Container();
  this.inner.blendMode='add';this.root.addChild(this.outer,this.corona,this.inner,this.rim);
  this.coronaCopies=Array.from({length:8},()=>this.corona.addChild(new Sprite()));
  this.rimCopies=Array.from({length:8},()=>this.rim.addChild(new Sprite()));
  this.filters=[];
  if(engine.app?.renderer){
   const outerColor=solidColor([1,.22,.015]),innerColor=solidColor([1,.62,.10]),coronaColor=solidColor([1,.39,.035]),rimColor=solidColor([1,.9,.52]);
   this.outerBlur=new BlurFilter({strength:14,quality:2,resolution:.65,legacy:true});
   this.innerBlur=new BlurFilter({strength:5,quality:2,resolution:1,legacy:true});
   this.outer.filters=[outerColor,this.outerBlur];this.inner.filters=[innerColor,this.innerBlur];
   this.corona.filters=[coronaColor];this.rim.filters=[rimColor];
   this.filters=[outerColor,innerColor,coronaColor,rimColor,this.outerBlur,this.innerBlur];
  }else{
   this.outer.tint=0xff630d;this.inner.tint=0xffc14b;
   this.coronaCopies.forEach(s=>s.tint=0xff921b);this.rimCopies.forEach(s=>s.tint=0xffe99b);
  }
  this.embers=new Graphics();this.embers.blendMode='add';this.root.addChild(this.embers);
 }
 animate(sprites,bank,t,duration,width,x,y){
  const frames=this.assets.effects[bank],at=(t%duration)/duration*frames.length,index=Math.floor(at),blend=at-index;
  sprites.forEach((s,i)=>{
   s.texture=frames[(index+i)%frames.length];s.anchor.set(.5);s.position.set(x,y);
   s.scale.set(width/s.texture.width);s.alpha=i?blend:1-blend;
  });
 }
 update(time){
  if(this.destroyed||this.actor.root.destroyed)return;
  const a=this.actor;this.root.visible=a.hp>0&&a.root.visible!==false;
  if(!this.root.visible)return;
  const t=this.time=this.engine.reducedMotion?0:time,h=this.height,pulse=.5+.5*Math.sin(t*TAU/2.8),main=a.fullBodySprite;
  // Copy only the current pose to separate sprites. Never tint/fade/reset the body,
  // move the actor, or overwrite another combatant's concurrent hit animation.
  for(const s of [this.outer,this.inner,...this.coronaCopies,...this.rimCopies]){
   s.texture=main.texture;s.anchor.copyFrom(main.anchor);s.position.copyFrom(main.position);
   s.scale.copyFrom(main.scale);s.rotation=main.rotation;
  }
  this.coronaCopies.forEach((s,i)=>{const angle=i/8*TAU,r=7.5+pulse;s.x+=Math.cos(angle)*r;s.y+=Math.sin(angle)*r;});
  this.rimCopies.forEach((s,i)=>{const angle=i/8*TAU,r=1.7+pulse*.3;s.x+=Math.cos(angle)*r;s.y+=Math.sin(angle)*r;});
  this.outer.alpha=this.corona.alpha=this.rim.alpha=1;this.inner.alpha=.82+pulse*.12;
  if(this.outerBlur)this.outerBlur.strength=13+pulse*3;
  if(this.innerBlur)this.innerBlur.strength=4.8+pulse*.8;
  this.animate(this.mantle,'mantle',t,2.8,h*1.58,0,-h*.55);
  this.animate(this.halo,'aura',t,5.6,h*.76,0,-h*.98);
  const g=this.ground.clear();
  for(let i=4;i>0;i--)g.ellipse(0,1,h*(.43+i*.025),h*(.066+i*.006)).stroke({width:2+i*2,color:0xff9c21,alpha:.055});
  g.ellipse(0,1,h*.49,h*.083).stroke({width:2.2,color:0xffcf64,alpha:.9});
  g.ellipse(0,1,h*.39,h*.06).stroke({width:1.1,color:0xffe6aa,alpha:.7});
  for(let i=0;i<8;i++){
   const angle=i/8*TAU+t*TAU/5.6,x=Math.cos(angle)*h*.49,y=1+Math.sin(angle)*h*.083;
   g.circle(x,y,2.4).fill({color:0xffefb5,alpha:.92});
  }
  const embers=this.embers.clear();
  for(let i=0;i<24;i++){
   const q=(t/2.8+i/24)%1,side=i%2?1:-1,x=side*h*(.22+(i%5)*.06)+Math.sin(q*TAU+i)*h*.035,y=-h*(.05+q*1.20);
   const alpha=Math.sin(q*Math.PI),size=i%3===0?2.5:1.5;
   embers.moveTo(x,y+8).lineTo(x,y).stroke({width:1,color:0xff9b2c,alpha:alpha*.7});
   embers.circle(x,y,size).fill({color:0xffdf84,alpha});
  }
 }
 hide(){if(!this.destroyed)this.root.visible=false;}
 diagnostics(){return {visible:!this.destroyed&&this.root.visible,time:this.time,behindBody:this.root.zIndex<this.actor.fullBodySprite.zIndex,silhouetteCopies:18,filters:this.filters.length,risingParticles:this.root.visible?24:0,bodyAlpha:this.actor.fullBodySprite.alpha};}
 destroy(){if(this.destroyed)return;this.destroyed=true;this.root.destroy({children:true});for(const filter of this.filters)filter.destroy();this.filters=[];}
}
