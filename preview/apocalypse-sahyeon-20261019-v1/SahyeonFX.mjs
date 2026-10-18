import {Assets,Container,Graphics,Sprite,Texture,Rectangle} from 'pixi.js';
import {ROOT} from './boss.mjs';
const clamp=v=>Math.max(0,Math.min(1,v)),smooth=v=>{v=clamp(v);return v*v*(3-2*v);};
export class SahyeonFX{
 static pending=null;
 static preload(){return this.pending??=Promise.all(['sahyeon-guardian-v1.png','sahyeon-lens-v1.png','sahyeon-eyes-v1.png'].map(f=>Assets.load(ROOT+'/assets/'+f))).catch(e=>{this.pending=null;throw e;});}
 constructor(skill,textures,points,{viewport,reducedMotion=false}={}){
  this.skill=skill;this.points=points;this.w=viewport?.width||1440;this.h=viewport?.height||900;this.reducedMotion=reducedMotion;this.cursor={time:0};this.released=false;
  this.display=new Container();this.display.label='SAHYEON_FX_'+skill.kind;this.display.eventMode='none';
  this.shade=new Graphics().rect(0,0,this.w,this.h).fill(0x090712);this.display.addChild(this.shade);
  const sprite=(texture)=>{const s=new Sprite(texture);s.anchor.set(.5);s.eventMode='none';this.display.addChild(s);return s;};
  this.guardian=sprite(textures[0]);this.guardianFit=Math.min(this.w*.55/textures[0].width,this.h*.91/textures[0].height);
  this.guardian.position.set(this.w*.64,this.h*.47);this.guardian.scale.set(this.guardianFit);
  this.portal=sprite(textures[1]);this.portal.position.set(this.w*.48,this.h*.55);this.portalSize=Math.min(this.w*.48,this.h*.70);
  this.rings=points.map(p=>{const s=sprite(textures[1]);s.position.set(p.x,p.y-75);return s;});
  this.splinters=Array.from({length:12},(_,i)=>{const s=sprite(textures[1]);s.rotation=i*.71;return s;});
  const eyeTexture=new Texture({source:textures[2].source,frame:new Rectangle(0,Math.round(textures[2].height*.27),textures[2].width,Math.round(textures[2].height*.40))});
  this.eyeTexture=eyeTexture;this.eyes=sprite(eyeTexture);this.eyeWidth=Math.min(this.w*.76,1050);this.eyes.width=this.eyeWidth;this.eyes.height=this.eyeWidth*eyeTexture.height/eyeTexture.width;this.eyes.position.set(this.w*.5,this.h*.18);
  this.render(0);
 }
 attach(layer){layer.addChild(this.display);return this;}
 render(t){
  if(this.released)return;this.cursor.time=t;
  const ultimate=this.skill.kind==='ultimate',impact=this.skill.impactAt,end=this.skill.duration;
  const opening=smooth(t/.35),closing=1-smooth((t-(end-.65))/.65),gather=smooth((t-.6)/(impact-.6)),burst=smooth((t-impact)/.45);
  this.display.alpha=closing;this.shade.alpha=opening*(ultimate?.54:.28);
  this.eyes.alpha=smooth(t/.22)*(1-smooth((t-.9)/.5));this.eyes.x=this.w*.5+(this.reducedMotion?0:(1-smooth(t/.5))*this.w*.12);
  this.guardian.visible=ultimate;this.guardian.alpha=smooth((t-.65)/.8)*(1-smooth((t-3.6)/.8));this.guardian.y=this.h*(.49-.025*gather);
  this.guardian.scale.set(this.guardianFit*(.92+.08*gather));
  this.portal.visible=ultimate;this.portal.alpha=smooth((t-1.0)/.7)*(1-smooth((t-impact-.15)/.8));
  const size=this.portalSize*(.35+.65*gather);this.portal.width=size*(t<impact?1-.85*smooth((t-impact+.35)/.35):.15+burst*2.7);this.portal.height=size*(t<impact?1:1-.84*burst);this.portal.rotation=this.reducedMotion?0:Math.min(t,impact)*.12;
  for(const [i,s]of this.rings.entries()){
   s.visible=!ultimate;const p=this.points[i],phase=smooth((t-.42)/.65),fade=1-smooth((t-impact-.30)/.60),base=this.skill.kind==='curse'?190:165;
   s.alpha=phase*fade*.9;s.width=base*(1.35-.35*phase);s.height=base*(this.skill.kind==='curse'?.62:1)*(1.35-.35*phase);
   s.rotation=this.reducedMotion?0:(this.skill.kind==='curse'?-1:1)*(t*.32+i*.18);s.x=p.x;s.y=p.y-70-(this.skill.kind==='curse'?18*Math.sin(Math.min(t,impact)*2):0);
  }
  for(const [i,s]of this.splinters.entries()){
   const pulse=ultimate?clamp((t-impact)/.8):clamp((t-impact)/.6),angle=i/12*Math.PI*2;
   s.visible=ultimate&&t>=impact&&!this.reducedMotion;s.alpha=(1-pulse)*.7;s.width=12+6*(i%3);s.height=s.width*.55;
   s.position.set(this.w*.48+Math.cos(angle)*pulse*this.w*.45,this.h*.55+Math.sin(angle)*pulse*this.h*.32);s.rotation=angle+pulse;
  }
 }
 play(tl,{onImpact=()=>{},onSample=()=>{}}={}){
  let applied=false;tl.to(this.cursor,{time:this.skill.duration,duration:this.skill.duration,ease:'none',onUpdate:()=>{this.render(this.cursor.time);onSample(this.cursor.time);}},0);
  tl.call(()=>{if(!applied&&!this.released){applied=true;onImpact();}},[],this.skill.impactAt);return this;
 }
 release(){if(this.released)return;this.released=true;this.display.removeFromParent();this.display.destroy({children:true});this.eyeTexture.destroy(false);}
}
