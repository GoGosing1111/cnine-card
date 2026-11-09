import {Assets,Container,Graphics,Sprite,Texture,Rectangle} from 'pixi.js';
import {ROOT,bossByKey} from '../../../../../shared/apocalypse-trio-v1.mjs';
import {CUT_END} from './TrioActorMotion.mjs';
const clamp=v=>Math.max(0,Math.min(1,v));
const smooth=v=>{v=clamp(v);return v*v*(3-2*v);};
const gate=(t,a,b,c,d)=>smooth((t-a)/(b-a))*(1-smooth((t-c)/(d-c)));
export class TrioFX{
 static preload(key){
  // Pixi owns both in-flight loads and cached textures. Leaving a battle
  // unloads these images, so a resolved promise from that battle is stale.
  const load=file=>Assets.load(ROOT+'/assets/'+file);
  return Promise.all([
   load(key+'-battle-ready-v1.png'),load(key+'-cutin-v1.png'),load(key+'-ultimate-sheet-v2.png'),
   load(key+'-action-poses-v1.png').catch(()=>null),load('status-effects-sheet-v1.png')
  ]);
 }
 constructor(skill,textures,points,{viewport,reducedMotion=false,actorMotion=null}={}){
  this.skill=skill;this.boss=bossByKey(skill.boss);this.points=points;this.w=viewport?.width||1440;this.h=viewport?.height||900;this.reducedMotion=reducedMotion;this.actorMotion=actorMotion;this.cursor={time:0};this.released=false;
  this.display=new Container();this.display.label='TRIO_FX_'+this.boss.key+'_'+skill.kind;this.display.eventMode='none';
  this.shade=new Graphics().rect(0,0,this.w,this.h).fill(0x040812);this.display.addChild(this.shade);
  const sprite=texture=>{const s=new Sprite(texture);s.anchor.set(.5);s.eventMode='none';this.display.addChild(s);return s;};
  const frames=(texture,cols,rows)=>Array.from({length:cols*rows},(_,i)=>new Texture({source:texture.source,frame:new Rectangle(i%cols*texture.width/cols,Math.floor(i/cols)*texture.height/rows,texture.width/cols,texture.height/rows)}));
  this.fxFrames=frames(textures[2],3,2);this.statusFrames=frames(textures[4],3,2);this.statusIndex=['infected-soldier','hell-general','archdemon'].indexOf(this.boss.key);
  this.cutTexture=new Texture({source:textures[1].source,frame:new Rectangle(0,Math.round(textures[1].height*.20),textures[1].width,Math.round(textures[1].height*.43))});
  this.cut=sprite(this.cutTexture);this.cut.width=Math.min(1100,this.w*.92);this.cut.height=this.cut.width*this.cutTexture.height/this.cutTexture.width;this.cut.position.set(this.w*.5,this.h*.23);
  this.impacts=points.map(p=>{const s=sprite(this.fxFrames[0]);s.position.set(p.x,p.y-72);return s;});
  this.projectile=sprite(this.fxFrames[1]);
  this.rift=sprite(this.fxFrames[0]);this.rift.position.set(this.w*.40,this.h*.55);
  this.render(0);
 }
 attach(layer){layer.addChild(this.display);return this;}
 render(t){
  if(this.released)return;
  this.cursor.time=t;this.actorMotion?.render(t);const {kind,impactAt:impact,duration:end}=this.skill,ult=kind==='ultimate',key=this.boss.key;
  this.display.alpha=1-smooth((t-end+.6)/.6);this.shade.alpha=t<CUT_END?.26:0;
  this.cut.visible=t<CUT_END;this.cut.alpha=1;this.cut.x=this.w*.5;
  const phase=clamp((t-impact+.12)/1.22);const frame=Math.min(5,Math.floor(phase*6));
  const center=this.points.length?{x:this.points.reduce((n,p)=>n+p.x,0)/this.points.length,y:this.points.reduce((n,p)=>n+p.y-75,0)/this.points.length}:{x:this.w*.3,y:this.h*.5};
  this.rift.visible=ult&&key==='archdemon';this.rift.texture=this.fxFrames[frame];this.rift.alpha=gate(t,impact-.35,impact,impact+.8,impact+1.4);this.rift.width=Math.min(this.w*.65,this.h*.78);this.rift.height=this.rift.width;this.rift.position.set(center.x,center.y);
  this.projectile.visible=ult&&key==='infected-soldier';const flight=clamp((t-impact+.4)/.4),launch=this.actorMotion?.launchPoint()||center;this.projectile.alpha=gate(t,impact-.4,impact-.28,impact-.01,impact+.12);this.projectile.width=210;this.projectile.height=130;this.projectile.x=launch.x+(center.x-launch.x)*flight;this.projectile.y=launch.y+(center.y-launch.y)*flight;this.projectile.scale.x=-Math.abs(this.projectile.scale.x);
  for(const [i,s] of this.impacts.entries()){
   const p=this.points[i];s.position.set(p.x,p.y-72);s.rotation=0;
   if(ult){s.texture=this.fxFrames[frame];s.alpha=gate(t,impact-.12,impact+.06,impact+.85,impact+1.4)*(key==='archdemon'?.6:1);s.width=s.height=key==='hell-general'?250:210;}
   else{
    const wind=smooth((t-.25)/.7),fade=1-smooth((t-impact-.3)/.65);
    s.texture=this.statusFrames[this.statusIndex+(kind==='seal'?0:3)];s.alpha=t<CUT_END?0:wind*fade*.95;
    const size=kind==='seal'?180:220;s.width=size*(1.3-.3*wind);s.height=size*(kind==='curse'?.64:1);
    if(!this.reducedMotion){s.rotation=key==='archdemon'?(kind==='seal'?-.3:.3):0;s.y-=kind==='curse'?16*Math.sin(wind*Math.PI):0;}
   }
  }
 }
 play(tl,{onImpact=()=>{},onSample=()=>{}}={}){
  let applied=false;tl.to(this.cursor,{time:this.skill.duration,duration:this.skill.duration,ease:'none',onUpdate:()=>{this.render(this.cursor.time);onSample(this.cursor.time);}},0);
  tl.call(()=>{if(!applied&&!this.released){applied=true;onImpact();}},[],this.skill.impactAt);return this;
 }
 release(){if(this.released)return;this.released=true;this.actorMotion?.release();this.display.removeFromParent();this.display.destroy({children:true});for(const texture of [...this.fxFrames,...this.statusFrames,this.cutTexture])texture.destroy(false);}
}
