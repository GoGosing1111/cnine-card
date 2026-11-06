import {Assets,Texture,Rectangle,Container,Sprite,Graphics,Point} from 'pixi.js';
const clamp=x=>Math.max(0,Math.min(1,x));
export class RoyalEffects {
 static async load(base){
  const manifest=await(await fetch(base+'effects/runtime/fx-manifest.json')).json(),textures={};
  for(const[id,s]of Object.entries(manifest.effects)){
   const atlas=await Assets.load(base+'effects/runtime/'+s.atlas);
   textures[id]=s.frames.map(f=>new Texture({source:atlas.source,frame:new Rectangle(f.x,f.y,f.w,f.h)}));
  }
  return {manifest,textures};
 }
 constructor(adapter,id,targets,props){
  Object.assign(this,{adapter,id,targets,props,assets:adapter.royalAssets,disposed:false,time:0});
  this.layers=new Map();this.frames={};const e=adapter.engine;
  this.back=new Container();this.back.label='HELIOS_ROYAL_FX_BACK';this.back.zIndex=-100000;e.combatLayer.addChildAt(this.back,0);
  this.front=new Container();this.front.label='HELIOS_ROYAL_FX_FRONT';this.front.zIndex=100000;e.combatLayer.addChild(this.front);
  this.shade=new Graphics().rect(-200,-400,2400,1800).fill({color:0x070d25,alpha:1});this.shade.alpha=0;this.back.addChild(this.shade);
  for(let i=0;i<(id==='kings_arsenal'?3:id==='royal_swords'?2:id==='heavenly_descent'?targets.length:1);i++)this.add('gate'+i,'gate',true);
  props.specs.forEach((p,i)=>{this.add('trail'+i,'trail');if(p.finisher||id!=='kings_arsenal')this.add('shot-impact'+i,'impact');});
  targets.forEach((_,i)=>{this.add('impact'+i,'impact');this.add('shards'+i,'shards');this.add('ground'+i,'pressure');if(id==='heavenly_descent')this.add('pillar'+i,'judgment');});
  if(id==='sovereign_lance'){this.add('lance','lance');this.add('lance-echo','lance');}
  this.add('charge','pressure',true);this.add('charge-sparks','shards');
 }
 add(id,asset,back=false){const spec=this.assets.manifest.effects[asset],sprite=new Sprite(this.assets.textures[asset][0]);sprite.label='HELIOS_FX_'+id;sprite.blendMode=spec.blend;sprite.visible=false;(back?this.back:this.front).addChild(sprite);this.layers.set(id,{sprite,spec,asset});}
 paint(id,phase,point,width,{height,angle=0,alpha=1,origin,blend}={}){
  const row=this.layers.get(id);if(!row)return;const{sprite,spec,asset}=row,index=Math.floor(phase*spec.frames.length+1e-7);
  sprite.visible=this.adapter.fxEnabled&&index>=0&&index<spec.frames.length&&alpha>.005;this.frames[id]=sprite.visible?index:-1;if(!sprite.visible)return;
  const f=spec.frames[index],ink=spec.inkBounds;sprite.texture=this.assets.textures[asset][index];
  const pivot=origin?[ink.left+ink.width*origin[0],ink.top+ink.height*origin[1]]:spec.groundPixel||[256,256];
  sprite.anchor.set((pivot[0]-spec.crop.left)*spec.rasterScale[0]/f.w,(pivot[1]-spec.crop.top)*spec.rasterScale[1]/f.h);
  const sx=width/ink.width,sy=height==null?sx:height/ink.height;sprite.scale.set(sx/spec.rasterScale[0],sy/spec.rasterScale[1]);sprite.position.copyFrom(point);sprite.rotation=angle;sprite.alpha=alpha;sprite.blendMode=blend||spec.blend;
 }
 local(x,y){return this.adapter.engine.combatLayer.toLocal(this.adapter.actor.view.toGlobal(new Point(x,y)));}
 floor(a){return this.adapter.engine.combatLayer.toLocal(a.root.toGlobal(new Point(0,0)));}
 gate(id,t,spawn,release,at,width,flatten=1){
  const age=t-spawn,phase=age<.22?age/.55:t<release?.46+Math.sin(t*9)*.025:.62+(t-release)/.58;
  this.paint(id,phase,at,width,{height:width*flatten,alpha:clamp(age/.09)*clamp((release+.24-t)/.22)});
 }
 render(t){
  if(this.disposed)return;this.time=t;
  const a=this.adapter.actor,s=Math.abs(a.root.scale.x),contact=this.adapter.actionSpec.contact,area=this.adapter.actionSpec.area;
  this.back.visible=this.front.visible=this.adapter.fxEnabled;
  this.shade.alpha=(area?.28:.15)*clamp(t/.18)*clamp((this.adapter.actionSpec.duration-t)/.30);
  const start=this.local(-125,-220),floors=this.targets.map(x=>this.floor(x));
  if(this.id==='royal_swords'){
   this.gate('gate0',t,.06,.83,this.local(-220,-260),430*s);
   this.gate('gate1',t,.16,.91,this.local(-115,-135),245*s);
  }else if(this.id==='sovereign_lance')this.gate('gate0',t,.07,.94,this.local(-220,-235),520*s);
  else if(this.id==='kings_arsenal')for(let i=0;i<3;i++)this.gate('gate'+i,t,.06+i*.075,1.20,this.local(-360+i*140,-250-(i%2)*75),400*s);
  else floors.forEach((p,i)=>this.gate('gate'+i,t,.18+i*.045,1.36,{x:p.x,y:p.y-405*s},370*s,.35));
  this.paint('charge',(t-.05)/.60,this.floor(a),(area?620:430)*s,{height:140*s,alpha:.75});
  this.paint('charge-sparks',(t-.15)/.64,start,(area?580:360)*s,{alpha:.6});
  this.props.samples.forEach((p,i)=>{
   const spec=this.props.specs[i],age=t-p.launch,flight=(t-p.launch)/(p.arrival-p.launch),trailAge=clamp(flight)*.52;
   this.paint('trail'+i,age<0?-1:trailAge,p.tip,(spec.finisher?650:this.id==='sovereign_lance'?840:380)*s,{height:(spec.finisher?125:85)*s,angle:p.angle,origin:[1,.5],alpha:clamp(age/.045)*clamp((p.arrival+.04-t)/.08),blend:'add'});
   if(this.layers.has('shot-impact'+i))this.paint('shot-impact'+i,(t-p.arrival)/.30,p.destination,(spec.finisher?440:230)*s,{alpha:spec.finisher?.95:.70});
  });
  if(this.id==='sovereign_lance'){
   const shot=this.props.samples[0],age=t-.69;
   if(shot){const width=Math.min(1280*s,Math.hypot(shot.destination.x-start.x,shot.destination.y-start.y)*1.05);
    this.paint('lance',age/.64,shot.tip,width,{height:270*s,origin:[1,.5],angle:shot.angle,alpha:.95});
    this.paint('lance-echo',(t-.81)/.62,shot.destination,width*.92,{height:170*s,origin:[1,.5],angle:shot.angle,alpha:.5,blend:'add'});
   }
  }
  floors.forEach((p,i)=>{
   const body=this.targets[i],unit=Math.abs(body.root.scale.x),chest={x:p.x,y:p.y-(body.art?.bodyHeight||285)*unit*.45};
   const finish=t-contact,impactWidth=(this.id==='royal_swords'?470:this.id==='sovereign_lance'?720:this.id==='kings_arsenal'?640:750)*s;
   this.paint('impact'+i,finish<0?-1:.36+finish/.60,chest,impactWidth,{alpha:.94});
   this.paint('shards'+i,finish/.55,chest,impactWidth*1.2,{alpha:.95});
   this.paint('ground'+i,finish/.58,p,impactWidth*1.25,{height:150*s,alpha:.92});
   if(this.id==='heavenly_descent'){
    const phase=(t-(contact-.27))/.84;
    this.paint('pillar'+i,phase,p,600*s,{height:790*s,alpha:.94});
   }
  });
 }
 audit(){return {time:this.time,enabled:this.adapter.fxEnabled,active:[...this.layers.values()].filter(x=>x.sprite.visible).length,frames:{...this.frames},native:'Effekseer 1.70e',disposed:this.disposed};}
 destroy(){if(this.disposed)return;this.disposed=true;this.back.removeFromParent();this.front.removeFromParent();this.back.destroy({children:true,texture:false,textureSource:false});this.front.destroy({children:true,texture:false,textureSource:false});}
}
