import {Container,Sprite,Graphics,Assets,Texture,Rectangle,BlurFilter,ColorMatrixFilter} from 'pixi.js';
import {gsap} from 'gsap';
import {sample} from '../skill.mjs';
const clamp=(n,a=0,b=1)=>Math.min(b,Math.max(a,n)),mix=(a,b,q)=>a+(b-a)*q;
export async function loadBerkanAssets(manifest){
 const root='/preview/mercenary-berkan-sss-v1/',result={motion:{},effects:{}};
 const frames=async spec=>{const atlas=await Assets.load(root+spec.atlas);return Array.from({length:spec.frameCount},(_,i)=>new Texture({source:atlas.source,frame:new Rectangle(i%spec.columns*spec.cellSize,Math.floor(i/spec.columns)*spec.cellSize,spec.cellSize,spec.cellSize)}));};
 await Promise.all(['motion','effects'].flatMap(group=>Object.entries(manifest[group]).map(async([key,spec])=>{result[group][key]=await frames(spec);})));
 return result;
}
function color(rgb){const f=new ColorMatrixFilter(),[r,g,b]=rgb;f.matrix=[0,0,0,0,r,0,0,0,0,g,0,0,0,0,b,0,0,0,1,0];return f;}
// Same V3 effect layer and registered GSAP clock as the approved Cryvern player.
// Only authored images and placement change. No renderer, ticker or damage loop.
export class BerkanFX{
 constructor(engine,merc,targets,assets,manifest,plan,onUpdate=()=>{},options={}){
  Object.assign(this,{engine,merc,targets,assets,manifest,plan,onUpdate,options});
  merc.animationController.kill();this.clock={time:0};this.speed=1;this.auraEnabled=true;this.destroyed=false;
  this.layer=new Container({label:'BerkanFX'});this.layer.eventMode='none';engine.effectLayer.addChild(this.layer);
  this.ground=new Graphics();this.layer.addChild(this.ground);
  this.pool=Array.from({length:40},()=>{const s=new Sprite(Texture.EMPTY);s.visible=false;this.layer.addChild(s);return s;});
  const s=merc.fullBodySprite;this.idle={texture:s.texture,width:s.width,height:s.height,anchorX:s.anchor.x,anchorY:s.anchor.y};
  this.bodyHeight=this.idle.height*manifest.bodyPixels/manifest.battleSpriteInfo.height;
  this.targetDefaults=targets.map(t=>({x:t.view.x,tint:t.fullBodySprite.tint}));
  this.makeAura();if(!options.authoritative)this.makeTimeline();this.render(0);
 }
 makeAura(){
  this.aura=new Container({label:'BerkanGoldenSilhouette'});this.aura.eventMode='none';this.aura.zIndex=10.5;
  this.merc.view.addChildAt(this.aura,Math.max(0,this.merc.view.getChildIndex(this.merc.fullBodySprite)));this.merc.view.sortChildren();
  this.auraSheets=[new Sprite(),new Sprite()];this.auraSheets.forEach(s=>this.aura.addChild(s));
  this.outer=new Sprite(this.idle.texture);this.inner=new Sprite(this.idle.texture);this.amber=new Container();this.rim=new Container();
  this.aura.addChild(this.outer,this.amber,this.inner,this.rim);
  this.amberCopies=Array.from({length:8},()=>{const s=new Sprite(this.idle.texture);this.amber.addChild(s);return s;});
  this.rimCopies=Array.from({length:8},()=>{const s=new Sprite(this.idle.texture);this.rim.addChild(s);return s;});
  this.filters=[];
  if(this.engine.app?.renderer){
   const outerColor=color([1,.29,.01]),innerColor=color([1,.65,.06]),amberColor=color([1,.4,.015]),rimColor=color([1,.9,.5]);
   // The optimized WebGL multipass reuses an uncleared intermediate texture.
   // A smaller idle pose can sample the previous skill's rectangular bounds.
   // The clearing pass keeps the same filters/pool while removing that history.
   this.outerBlur=new BlurFilter({strength:12,quality:2,resolution:.65,legacy:true});this.innerBlur=new BlurFilter({strength:4.5,quality:2,resolution:1,legacy:true});
   this.outer.filters=[outerColor,this.outerBlur];this.inner.filters=[innerColor,this.innerBlur];this.amber.filters=[amberColor];this.rim.filters=[rimColor];
   this.filters=[outerColor,innerColor,amberColor,rimColor,this.outerBlur,this.innerBlur];
  }else{this.outer.tint=0xff8a18;this.inner.tint=0xffda69;this.amberCopies.forEach(s=>s.tint=0xe79022);this.rimCopies.forEach(s=>s.tint=0xffe3a0);}
  this.outer.blendMode=this.inner.blendMode='add';
 }
 get time(){return this.clock.time;}
 get playing(){return !!this.timeline&&!this.timeline.paused()&&!this.destroyed&&(this.loop||this.time<this.plan.duration);}
 makeTimeline(){
  this.removeTimeline();this.loop=['aura','idle'].includes(this.plan.mode);
  this.timeline=gsap.timeline({paused:true,repeat:this.loop?-1:0,onUpdate:()=>this.render(this.clock.time),onComplete:()=>{this.engine.simpleTimelines.delete(this.registration);this.render(this.plan.duration);}})
   .to(this.clock,{time:this.plan.duration,duration:this.plan.duration,ease:'none'}).timeScale(this.speed);
  this.registration={instance:this.timeline,settle:()=>this.cancel()};
 }
 removeTimeline(){if(this.registration)this.engine.simpleTimelines.delete(this.registration);this.timeline?.kill();this.timeline=null;this.registration=null;}
 play(){if(this.destroyed)return;this.resting=false;if(!this.timeline)this.makeTimeline();if(this.time>=this.plan.duration)this.seek(0);this.engine.simpleTimelines.add(this.registration);this.timeline.play();this.onUpdate(this);}
 pause(){this.timeline?.pause();this.onUpdate(this);}
 seek(t){if(this.destroyed)return;this.resting=false;if(!this.timeline)this.makeTimeline();const time=clamp(Number(t)||0,0,this.plan.duration);this.timeline.pause().time(time,true);this.render(time);}
 setSpeed(speed){this.speed=clamp(Number(speed)||1,.25,2);this.timeline?.timeScale(this.speed);this.onUpdate(this);}
 setAura(enabled){this.auraEnabled=!!enabled;this.render(this.time);}
 setPlan(plan){this.cancel();this.plan=plan;this.resting=false;this.makeTimeline();this.render(0);}
 cancel(){this.removeTimeline();this.clock.time=0;this.resting=true;this.render(0);}
 applyPose(pose){
  if(this.options.useAuthoredPose===false)return;
  const s=this.merc.fullBodySprite;if(this.merc.animationController.timeline)this.merc.animationController.kill();
  const spec=this.manifest.motion[pose.key],frame=spec.frames[pose.frame];s.texture=this.assets.motion[pose.key][pose.frame];s.anchor.set(frame.footAnchor.x,frame.footAnchor.y);
  s.height=this.bodyHeight*spec.cellSize/spec.bodyPixels;s.width=s.height;
  const neutral=this.merc.neutralAvatarPose?.mainSprite;if(neutral){neutral.scaleX=s.scale.x;neutral.scaleY=s.scale.y;}
 }
 point(actor,fraction=0){return this.engine.effectLayer.toLocal(actor.root.toGlobal({x:0,y:-actor.fullBodyHeight*fraction}));}
 bowPoint(pose){
  const spec=this.manifest.motion[pose.key],frame=spec.frames[pose.frame],scale=this.bodyHeight/spec.bodyPixels;
  const authored=pose.key==='ultimate'?[[301,217],[650,156],[1044,162],[1383,151],[353,499],[697,515],[1062,510],[1366,527],[350,903],[675,879],[1030,893],[1360,899]][pose.frame]
   :pose.key==='attack'?[[284,243],[671,168],[1045,242],[1402,180],[350,519],[709,520],[1032,550],[1388,535],[309,885],[670,920],[1012,950],[1380,948]][pose.frame]:null;
  const p=authored?{x:(authored[0]-frame.sourceFeet[0])*scale,y:(authored[1]-frame.sourceFeet[1])*scale}:{x:this.bodyHeight*.32,y:-this.bodyHeight*.5};
  return this.engine.effectLayer.toLocal(this.merc.view.toGlobal(p));
 }
 updateAura(state){
  this.aura.visible=this.auraEnabled&&state.pose.key!=='defeat';
  if(!this.aura.visible)return;
  const main=this.merc.fullBodySprite,t=state.cancelled?0:state.time,pulse=.5+.5*Math.sin(t*Math.PI),boost=state.auraBoost;
  for(const s of [this.outer,this.inner,...this.amberCopies,...this.rimCopies]){s.texture=main.texture;s.anchor.copyFrom(main.anchor);s.position.copyFrom(main.position);s.scale.copyFrom(main.scale);s.rotation=main.rotation;}
  this.outer.alpha=.8+.12*pulse;this.inner.alpha=.86+.1*pulse;this.amber.alpha=.8+.15*pulse;this.rim.alpha=.84+.13*pulse;
  const radius=2.2+.45*pulse+boost,outerRadius=5+.7*pulse+boost*1.5;
  this.amberCopies.forEach((s,i)=>{const a=i/8*Math.PI*2;s.x+=Math.cos(a)*outerRadius;s.y+=Math.sin(a)*outerRadius;});
  this.rimCopies.forEach((s,i)=>{const a=i/8*Math.PI*2;s.x+=Math.cos(a)*radius;s.y+=Math.sin(a)*radius;});
  if(this.outerBlur)this.outerBlur.strength=12+pulse*3+boost*5;if(this.innerBlur)this.innerBlur.strength=4.5+pulse*.5+boost*1.5;
  const spec=this.manifest.effects.aura,f=(t*6)%spec.frameCount,i=Math.floor(f),q=f-i;
  this.auraSheets.forEach((s,n)=>{const at=(i+n)%spec.frameCount;s.texture=this.assets.effects.aura[at];s.anchor.set(spec.frames[at].anchor.x,spec.frames[at].anchor.y);s.position.set(0,5);s.width=this.bodyHeight*2.35;s.height=s.width;s.alpha=(n?q:1-q)*(.55+boost*.25);});
 }
 draw(texture,p,size,{alpha=1,angle=0,anchor={x:.5,y:.5},blend='normal'}={}){
  if(this.used>=this.pool.length)throw Error('Berkan sprite pool exhausted');
  const s=this.pool[this.used++];s.texture=texture;s.visible=alpha>0;s.anchor.set(anchor.x,anchor.y);s.position.set(p.x,p.y);s.width=s.height=size;s.alpha=clamp(alpha);s.rotation=angle;s.blendMode=blend;return s;
 }
 sequence(key,state,p,size,extra={}){
  const spec=this.manifest.effects[key],f=clamp(state.frame,0,spec.frameCount-1),i=Math.floor(f),j=Math.min(i+1,spec.frameCount-1),q=f-i;
  this.activeFrames.push({key,index:i,next:j,position:{...p}});
  this.draw(this.assets.effects[key][i],p,size,{alpha:state.alpha*(1-q),anchor:spec.frames[i].anchor,...extra});
  if(q>.001)this.draw(this.assets.effects[key][j],p,size,{alpha:state.alpha*q,anchor:spec.frames[j].anchor,...extra});
 }
 render(time){
  if(this.destroyed)return;this.clock.time=time;this.used=0;this.activeFrames=[];this.pool.forEach(s=>s.visible=false);this.ground.clear();
  const state=sample(this.plan,time);if(this.resting)Object.assign(state,{pose:{key:'idle',frame:0},effects:[],projectile:null,charge:0,auraBoost:0,recoil:0,label:'대기 자세 복귀'});this.sample=state;this.applyPose(state.pose);this.updateAura(state);
  const dodged=target=>this.plan.dodge||this.plan.targetDodges?.[target.id];
  if(!this.options.authoritative)this.targets.forEach((target,i)=>{const recoil=(this.plan.mode==='ultimate'||i===0)&&!dodged(target)?state.recoil:0;target.view.x=this.targetDefaults[i].x+recoil;target.fullBodySprite.tint=recoil>.1?0xffda8b:this.targetDefaults[i].tint;});
  const foot=this.point(this.merc),bow=this.bowPoint(state.pose),own=this.bodyHeight*Math.abs(this.merc.root.scale.y);
  const targets=this.targets.slice(0,this.plan.mode==='ultimate'?2:1).filter(target=>!target.root.destroyed).map(actor=>({actor,point:this.point(actor,.46)}));
  if(this.auraEnabled&&state.pose.key!=='defeat'){
   for(let i=0;i<20;i++){const q=(time*.3+i/20)%1,a=i*2.399963+time*.16,x=foot.x+Math.cos(a)*own*(.26+.15*q),y=foot.y-own*q*1.05,alpha=Math.sin(q*Math.PI)*(.65+state.charge*.3);
    this.ground.circle(x,y,1.2+i%3*.6).fill({color:i%3?0xffc451:0xfff0bd,alpha});
   }
   this.ground.ellipse(foot.x,foot.y+2,own*.4,own*.09).stroke({color:0xffcf73,width:1.3,alpha:.32+state.charge*.35});
  }
  if(!state.cancelled&&!state.done){
   for(const e of state.effects){const points=e.anchor==='bow'?[bow]:e.anchor==='feet'?[foot]:targets.filter(t=>!dodged(t.actor)).map(t=>t.point);
    const size=e.key==='charge'?own*1.1:e.key==='afterglow'?own*1.75:e.key==='impact'?own*(this.plan.mode==='ultimate'?2.1:.9):own;
    for(const p of points)this.sequence(e.key,e,p,size);
   }
   if(state.projectile)for(const {point:target}of targets){
    // Arrow tip and damage contact share the same destination. The flight is
    // a sequence of different authored wakes; translation only places it.
    const q=state.projectile.progress,p={x:mix(bow.x,target.x,q),y:mix(bow.y,target.y,q)},angle=Math.atan2(target.y-bow.y,target.x-bow.x);
    this.sequence('projectile',{frame:state.projectile.frame,alpha:1},p,own*(state.projectile.ultimate?1.12:.55),{angle,anchor:{x:.87,y:.5}});
   }
  }
  this.engine.sortCombatDepth();this.onUpdate(this);
 }
 diagnostics(){return {mode:this.plan.mode,time:this.time,pose:this.sample.pose,usedSprites:this.used,poolSize:this.pool.length,activeFrames:this.activeFrames,registeredTimelines:this.engine.simpleTimelines.size,aura:this.auraEnabled,position:{x:this.merc.root.x,y:this.merc.root.y},damageAuthority:this.plan.damageAuthority,destroyed:this.destroyed};}
 destroy(){
  if(this.destroyed)return;this.removeTimeline();if(!this.options.authoritative)this.targets.forEach((t,i)=>{t.view.x=this.targetDefaults[i].x;t.fullBodySprite.tint=this.targetDefaults[i].tint;});
  const s=this.merc.fullBodySprite;s.texture=this.idle.texture;s.anchor.set(this.idle.anchorX,this.idle.anchorY);s.width=this.idle.width;s.height=this.idle.height;
  this.layer.destroy({children:true});this.aura.destroy({children:true});this.filters.forEach(f=>f.destroy());this.destroyed=true;
  for(const group of Object.values(this.assets))for(const frames of Object.values(group))frames.forEach(t=>t.destroy(false));
 }
}
