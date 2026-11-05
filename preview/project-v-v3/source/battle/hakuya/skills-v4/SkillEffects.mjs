import {Point,Sprite,Graphics,Matrix} from 'pixi.js';
import {SwordTrail} from '../SwordTrail.mjs';
import registration from './pose-registration.json' with {type:'json'};
const clamp=n=>Math.max(0,Math.min(1,n));
export const skillStrokes={
 skill_rift:[{id:'pierce',from:'v4_rift_ready',to:'v4_rift_draw',start:.31,end:.34,followUntil:.42,life:.18,draw:true},{id:'drive',from:'v4_rift_draw',to:'v4_rift_drive',start:.34,end:.42,followUntil:.61,life:.22}],
 skill_echo:[{id:'rise',from:'v4_echo_command',to:'v4_echo_rise',start:1.07,end:1.12,life:.18},{id:'finish',from:'v3_aircut',to:'v4_echo_cut',start:1.39,end:1.51,life:.25}],
 skill_verdict:[{id:'finish',from:'v4_verdict_raise',to:'v4_verdict_cut',start:1.61,end:1.78,life:.30}]
};
export class SkillEffects{
 constructor(owner,adapter,target,mode,{rootAt}){
  Object.assign(this,{owner,adapter,target,mode,rootAt,layer:owner.engine.effectLayer,disposed:false,time:0,frames:{},sprites:{}});
  this.trail=new SwordTrail(this.layer,adapter,owner.assets.trailTexture,mode,rootAt,{registration,strokes:skillStrokes[mode]});
  const list=mode==='skill_rift'?[['tear','v4-rift'],['incision','v4-incision'],['hit','impact-burst']]:mode==='skill_echo'?[['left','v4-echo'],['right','v4-echo'],['high','v4-echo'],['finish','v4-incision'],['hit','impact-burst'],['pressure','v4-pressure']]:[['scar0','v4-rift'],['scar1','v4-rift'],['scar2','v4-rift'],['release','v4-verdict'],['flash','v4-incision'],['pressure','v4-pressure'],['debris','debris']];
  for(const[id,key]of list){const spec=owner.assets.manifest.effects[key],s=new Sprite(owner.assets.textures[key][0]);s.label='V35_WHITECOAT_FX_SKILLS_'+id;s.anchor.set(spec.pivot[0]/spec.frames[0].w,spec.pivot[1]/spec.frames[0].h);s.blendMode=spec.blend;s.visible=false;this.layer.addChild(s);this.sprites[id]={s,key};}
  const ghostSpecs=mode==='skill_rift'?[{start:.37,end:.65,delay:.045},{start:.40,end:.68,delay:.09}]:mode==='skill_echo'?[{start:.43,end:.83,hit:.57,x:-125,y:0,face:1,animation:'skill_rift',before:.34,after:.42},{start:.75,end:1.15,hit:.89,x:145,y:0,face:-1,animation:'skill_echo',before:.37,after:1.12},{start:1.07,end:1.47,hit:1.21,x:25,y:-200,face:1,animation:'skill_echo',before:1.34,after:1.51}]:[];
  this.ghosts=ghostSpecs.map((spec,i)=>{const rig=new adapter.rig.constructor({skeletonData:adapter.rig.skeleton.data,autoUpdate:false,ticker:owner.engine.app.ticker});rig.label='V35_WHITECOAT_FX_SKILL_GHOST_'+i;rig.visible=false;rig.tint=mode==='skill_echo'?0xe8c591:0xffdc9e;const entry=rig.state.setAnimation(0,spec.animation||mode,false);this.layer.addChildAt(rig,0);return {rig,entry,spec};});
  if(mode==='skill_verdict'){this.shade=new Graphics();this.shade.label='V35_WHITECOAT_FX_SKILL_SHADE';this.layer.addChildAt(this.shade,0);this.cutinBand=new Graphics();this.cutinBand.label='V35_WHITECOAT_FX_SKILL_CUTIN_BAND';this.layer.addChild(this.cutinBand);this.cutin=new Sprite(owner.assets.cutinTexture);this.cutin.label='V35_WHITECOAT_FX_SKILL_CUTIN';this.cutin.anchor.set(.5,.5);this.cutin.visible=false;this.layer.addChild(this.cutin);}
 }
 render(time){
  if(this.disposed)return;this.time=time;const {layer,adapter,owner}=this,a=adapter.actor,rig=adapter.rig,root=layer.toLocal(a.root.toGlobal(new Point())),unit=layer.toLocal(a.root.toGlobal(new Point(1,0))),s=Math.hypot(unit.x-root.x,unit.y-root.y),f=a.view.scale.x>=0?1:-1;
  const floor=layer.toLocal(this.target.root.toGlobal(new Point())),at=(x,y)=>new Point(floor.x+f*x*s,floor.y+y*s),body=at(0,-160),active=owner.enabled;
  const show=(id,age,p,width,angle=0,sy=1,alpha=1,speed=1)=>{const {s:sprite,key}=this.sprites[id],spec=owner.assets.manifest.effects[key],frame=Math.floor(age*spec.fps*spec.playbackRate*speed+1e-7);sprite.visible=active&&age>=0&&frame>=0&&frame<spec.frames.length;this.frames[id]=sprite.visible?frame:-1;if(!sprite.visible)return;sprite.texture=owner.assets.textures[key][frame];sprite.position.copyFrom(p);const scale=s*width/512;sprite.scale.set(scale*f/spec.rasterScale[0],scale*sy/spec.rasterScale[1]);sprite.rotation=angle*f;sprite.alpha=alpha;};
  this.trail.render(time,active);
  if(this.mode==='skill_rift'){
   show('tear',time-.34,body,1360,-.025,1,1,1.15);show('incision',time-.48,body,1180,-.025,1);show('hit',time-.48,body,480,0);
  }else if(this.mode==='skill_echo'){
   show('left',time-.44,at(-25,-155),850,-.35,.8);show('right',time-.76,at(22,-150),890,Math.PI+.55,.85);show('high',time-1.08,at(0,-175),930,-1.18,.9);
   show('finish',time-1.51,at(0,-165),1080,-1.3,1.3);show('hit',time-1.51,body,620);show('pressure',time-1.51,floor,950,0);
  }else{
   for(let i=0;i<3;i++){const start=[.66,1.02,1.36][i],age=time-start;let phase=age;if(time<1.78&&age>.17)phase=.17;if(time>=1.78)phase=.18+(time-1.78)*1.3;show('scar'+i,age>=0?phase:-1,at((i-1)*18,-170),[1000,1150,1120][i],[Math.PI/2,-.61,.63][i],.55, time<1.78? .95:clamp(1-(time-1.78)*4));}
   show('release',time-1.78,at(0,-135),1370,0,1,1,.75);show('flash',time-1.78,body,1480,.08,1.3);show('pressure',time-1.78,floor,1380);show('debris',time-1.81,floor,620);
   this.shade.clear();this.shade.visible=active&&time>.2&&time<2.25;if(this.shade.visible)this.shade.rect(floor.x-900*s,floor.y-560*s,1800*s,650*s).fill({color:0x040711,alpha:.34*clamp((time-.2)/.15)*clamp((2.25-time)/.4)});
   this.cutin.visible=active&&time>=.37&&time<.91;this.cutinBand.visible=this.cutin.visible;this.cutinBand.clear();if(this.cutin.visible){const u=(time-.37)/.54,alpha=clamp(u*8)*clamp((1-u)*7)*.93,p=at(-540-130*(1-clamp(u*5)),-450);this.cutin.alpha=alpha;this.cutin.position.copyFrom(p);const size=850*s/this.cutin.texture.width;this.cutin.scale.set(size*f,size);this.cutinBand.poly([p.x-480*s,p.y-120*s,p.x+480*s,p.y-120*s,p.x+400*s,p.y+130*s,p.x-560*s,p.y+130*s]).fill({color:0x080c16,alpha:alpha*.85}).stroke({width:s*2,color:0xd8a353,alpha:alpha*.8});}
  }
  for(const g of this.ghosts){const {rig:ghost,spec,entry}=g;ghost.visible=active&&time>=spec.start&&time<spec.end;if(!ghost.visible){ghost.position.set(0,0);entry.trackTime=0;continue;}const u=clamp((time-spec.start)/(spec.end-spec.start));
   if(spec.delay){const old=Math.max(0,time-spec.delay),p=this.rootAt(old),now=a.root.toGlobal(new Point()),past=a.root.parent.toGlobal(new Point(p.x,p.y)),m=rig.getGlobalTransform(new Matrix());m.tx+=past.x-now.x;m.ty+=past.y-now.y;ghost.setFromMatrix(layer.getGlobalTransform(new Matrix()).invert().append(m));entry.trackTime=old+1e-7;ghost.alpha=.18*(1-u);}
   else {const p=at(spec.x+(time<spec.hit?-35:25)*spec.face,spec.y+(spec.y?u*120:0));ghost.position.copyFrom(p);ghost.scale.set(s*rig.scale.x*f*spec.face,s*rig.scale.y);entry.trackTime=(time<spec.hit?spec.before:spec.after)+1e-7;ghost.alpha=.68*clamp(u*6)*clamp((1-u)*4);}
   ghost.update(0);
  }
 }
 audit(){const trail=this.trail.audit();return {mode:this.mode,time:this.time,frames:{...this.frames},active:Object.values(this.sprites).filter(v=>v.s.visible).length+trail.active+this.ghosts.filter(g=>g.rig.visible).length+(this.cutin?.visible?1:0)+(this.shade?.visible?1:0),trail,ghosts:this.ghosts.map(g=>({visible:g.rig.visible,time:g.entry.trackTime,x:g.rig.x,y:g.rig.y})),cutin:!!this.cutin?.visible,disposed:this.disposed};}
 destroy(){if(this.disposed)return;this.disposed=true;this.trail.destroy();for(const{s}of Object.values(this.sprites)){s.removeFromParent();s.destroy();}for(const{rig}of this.ghosts){rig.removeFromParent();rig.destroy({children:true});}this.cutin?.destroy();this.cutinBand?.destroy();this.shade?.destroy();if(this.owner.session===this)this.owner.session=null;this.owner.completed++;}
}
