import {Container,Sprite,Assets,Texture,Rectangle,Graphics} from 'pixi.js';
import {gsap} from 'gsap';
import {clamp,sample} from '../skill.mjs';
const ROOT='/preview/mercenary-imperial-archer-sss-v1/',mix=(a,b,t)=>a+(b-a)*t;
export async function loadArcherAssets(m){
 const assets={motion:{},effects:{}};
 await Promise.all(['motion','effects'].flatMap(kind=>Object.entries(m[kind]).map(async([key,v])=>{
  const tex=await Assets.load(ROOT+v.atlas);
  assets[kind][key]=v.frames.map((_,i)=>new Texture({source:tex.source,frame:new Rectangle(i%v.columns*v.cellSize,Math.floor(i/v.columns)*v.cellSize,v.cellSize,v.cellSize)}));
 })));return assets;
}
export class ImperialArcherFX{
 constructor(engine,merc,targets,assets,manifest,plan,onUpdate=()=>{}){
  Object.assign(this,{engine,merc,targets,assets,manifest,plan,onUpdate});
  merc.animationController.kill();this.bodyHeight=manifest.displaySizing.physicalBodyHeight;
  this.clock={time:0};this.speed=1;this.effectsEnabled=true;this.motionOnly=false;this.reducedMotion=!!engine.reducedMotion;
  this.layer=new Container({label:'ImperialArcherFX'});this.layer.eventMode='none';engine.effectLayer.addChild(this.layer);
  this.bowString=new Graphics();this.layer.addChild(this.bowString);
  this.pool=Array.from({length:160},()=>{const s=new Sprite();s.visible=false;this.layer.addChild(s);return s;});
  this.targetsBase=targets.map(a=>({x:a.view.x,tint:a.fullBodySprite.tint}));
  this.captureFormation();this.makeTimeline();this.render(0);
 }
 get time(){return this.clock.time}
 get playing(){return !!this.timeline&&!this.timeline.paused()&&this.time<this.plan.duration}
 captureFormation(){this.start={x:this.merc.baseX??this.merc.root.x,y:this.merc.baseY??this.merc.root.y};}
 makeTimeline(){
  this.removeTimeline();this.clock.time=0;
  this.timeline=gsap.timeline({paused:true,onUpdate:()=>this.render(this.clock.time),onComplete:()=>{this.engine.simpleTimelines.delete(this.registration);this.render(this.plan.duration);this.onComplete?.();}}).to(this.clock,{time:this.plan.duration,duration:this.plan.duration,ease:'none'}).timeScale(this.speed);
  this.registration={instance:this.timeline,settle:()=>this.cancel()};
  if(!this.motionOnly&&!this.reducedMotion)for(let i=0;i<this.plan.contacts.length;i++){
   const at=this.plan.contacts[i],last=i===this.plan.contacts.length-1;
   if(this.plan.stop!==null&&at>=this.plan.stop)continue;
   // Keep the normal V3 camera scale. Only short impact recoil is added.
   this.engine.camera?.addShake(this.timeline,{at,intensity:this.plan.mode==='ultimate'?(last?9:1.8):this.plan.mode==='skill'?(last?5:1.7):3.3,duration:last?.17:.08,rotation:0});
  }
 }
 removeTimeline(){if(this.registration)this.engine.simpleTimelines.delete(this.registration);this.timeline?.kill();this.timeline=null;this.registration=null;}
 play(){if(this.destroyed)return;if(!this.timeline)this.makeTimeline();if(this.time>=this.plan.duration)this.seek(0);this.engine.simpleTimelines.add(this.registration);this.timeline.play();this.onUpdate(this);}
 pause(){this.timeline?.pause();this.onUpdate(this);}
 seek(t){if(!this.timeline)this.makeTimeline();t=clamp(t,0,this.plan.duration);this.timeline.pause().time(t,true);this.clock.time=t;this.engine.camera?.reset(true);this.render(t);}
 setSpeed(s){this.speed=clamp(+s,.25,2);this.timeline?.timeScale(this.speed);this.onUpdate(this);}
 setSound(){}
 setEffects(on){this.effectsEnabled=!!on;this.render(this.time);}
 setFocus(on){this.focusEnabled=!!on;this.engine.camera?.reset(true);this.render(this.time);}
 applyFocus(){
  if(!this.focusEnabled)return;
  const c=this.engine.camera,foot=this.ownPoint(),u=this.unit,scene=this.engine.scene;
  const box={left:foot.x-u*.85,right:foot.x+u*.85,top:foot.y-u*1.2,bottom:foot.y+u*.2};
  const scale=Math.min(3,scene.width*.82/(box.right-box.left),scene.height*.84/(box.bottom-box.top));
  const halfW=scene.width/(2*scale),halfH=scene.height/(2*scale);
  c.container.position.set(c.base.x,c.base.y);c.container.pivot.set(clamp((box.left+box.right)/2,halfW,scene.width-halfW),clamp((box.top+box.bottom)/2,halfH,scene.height-halfH));c.container.scale.set(scale);c.container.rotation=0;
 }
 setMotionOnly(on){const t=this.time;this.motionOnly=!!on;this.makeTimeline();this.seek(t);}
 setReducedMotion(on){const t=this.time;this.reducedMotion=!!on;this.makeTimeline();this.seek(t);}
 setPlan(p){this.cancel(false);this.plan=p;this.makeTimeline();this.render(0);}
 cancel(notify=true){
  if(this.destroyed)return;if(notify)this.onCancel?.();this.removeTimeline();this.engine.camera?.reset(true);this.clock.time=0;this.render(0);
  this.pool.forEach(s=>s.visible=false);this.bowString.clear();this.activeFrames=[];this.contactChecks=[];
 }
 ownPoint(x=0,y=0){return this.engine.effectLayer.toLocal(this.merc.view.toGlobal({x,y}));}
 point(a,f=.43){return this.engine.effectLayer.toLocal(a.root.toGlobal({x:0,y:-a.fullBodyHeight*f}));}
 applyPose(pose){
  const f=this.manifest.motion[pose.key].frames[pose.frame],s=this.merc.fullBodySprite;
  s.texture=this.assets.motion[pose.key][pose.frame];s.anchor.set(f.footAnchor.x,f.footAnchor.y);s.position.set(0,0);s.scale.set(this.bodyHeight/f.bodyPixels);this.poseFrame=f;
  const n=this.merc.neutralAvatarPose?.mainSprite;if(n){n.scaleX=s.scale.x;n.scaleY=s.scale.y;}
 }
 anchorPoint(key,f=this.poseFrame){
  const p=f[key];return this.ownPoint((p.x-f.footAnchor.x*768)*this.bodyHeight/f.bodyPixels,(p.y-f.footAnchor.y*768)*this.bodyHeight/f.bodyPixels);
 }
 launchPoint(at){
  const state=sample(this.plan,at),f=this.manifest.motion[state.pose.key].frames[state.pose.frame];
  const origin=this.anchorPoint('tip',f);
  // Recover the release position, independent of follow-through or recoil at the sampled time.
  const offset=this.engine.effectLayer.toLocal(this.merc.root.parent.toGlobal({x:(this.merc.baseX??this.start.x)+state.travel*60-state.recoil*5,y:(this.merc.baseY??this.start.y)-state.jump*this.bodyHeight}));
  const current=this.engine.effectLayer.toLocal(this.merc.root.toGlobal({x:0,y:0}));
  return{x:origin.x+offset.x-current.x,y:origin.y+offset.y-current.y};
 }
 draw(key,frame,point,size,{alpha=1,angle=0,anchor=null}={}){
  if(this.used>=this.pool.length||alpha<=0)return;
  const spec=this.manifest.effects[key],index=Math.floor(clamp(frame,0,spec.frameCount-1)),a=anchor||spec.frames[index].anchor;
  const corners=[[0,0],[1,0],[0,1],[1,1]].map(([x,y])=>({x:(x-a.x)*Math.cos(angle)-(y-a.y)*Math.sin(angle),y:(x-a.x)*Math.sin(angle)+(y-a.y)*Math.cos(angle)}));
  const b={left:Math.min(...corners.map(p=>p.x)),right:Math.max(...corners.map(p=>p.x)),top:Math.min(...corners.map(p=>p.y)),bottom:Math.max(...corners.map(p=>p.y))},scene=this.engine.scene,margin=8;
  if(point.x<margin||point.x>scene.width-margin||point.y<margin||point.y>scene.height-margin)return;
  if(b.left<0)size=Math.min(size,(point.x-margin)/-b.left);
  if(b.right>0)size=Math.min(size,(scene.width-margin-point.x)/b.right);
  if(b.top<0)size=Math.min(size,(point.y-margin)/-b.top);
  if(b.bottom>0)size=Math.min(size,(scene.height-margin-point.y)/b.bottom);
  size=Math.max(0,size);
  const s=this.pool[this.used++];s.texture=this.assets.effects[key][index];s.anchor.set(a.x,a.y);s.position.set(point.x,point.y);s.width=s.height=size;s.rotation=angle;s.alpha=alpha;s.visible=true;s.blendMode='normal';s.tint=0xffffff;
  this.activeFrames.push({key,frame:index,point:{...point},size,alpha,bounds:{left:point.x+b.left*size,right:point.x+b.right*size,top:point.y+b.top*size,bottom:point.y+b.bottom*size}});
 }
 seq(key,t,start,end,point,size,options={}){
  if(t<start||t>=end)return;const q=clamp((t-start)/(end-start));this.draw(key,q*11,point,size,{...options,alpha:(options.alpha??1)*Math.min(1,(1-q)*5)});
 }
 projectile(key,t,launch,hit,from,to,size,penetrate=true){
  const duration=hit-launch,tail=penetrate?.12:0;
  if(t<launch||t>=hit+tail)return;
  const q=(t-launch)/duration,angle=Math.atan2(to.y-from.y,to.x-from.x);
  this.draw(key,clamp(q)*11,{x:mix(from.x,to.x,q),y:mix(from.y,to.y,q)},size,{angle,alpha:t>hit?1-(t-hit)/tail:1});
 }
 ghost(t){
  if(this.reducedMotion)return;
  for(const age of [.14,.27]){
   if(t<age||this.used>=this.pool.length)continue;
   const state=sample(this.plan,t-age),f=this.manifest.motion[state.pose.key].frames[state.pose.frame],s=this.pool[this.used++],pos=this.engine.effectLayer.toLocal(this.merc.root.parent.toGlobal({x:(this.merc.baseX??this.start.x)+state.travel*60,y:(this.merc.baseY??this.start.y)-state.jump*this.bodyHeight}));
   s.texture=this.assets.motion[state.pose.key][state.pose.frame];s.anchor.set(f.footAnchor.x,f.footAnchor.y);s.position.set(pos.x,pos.y);s.scale.set(this.unit/f.bodyPixels);s.rotation=0;s.alpha=age<.2?.22:.11;s.tint=0xc89762;s.blendMode='normal';s.visible=true;
  }
 }
 render(t){
  if(this.destroyed)return;
  this.pool.forEach(s=>s.visible=false);this.bowString.clear();this.used=0;this.activeFrames=[];this.contactChecks=[];
  const state=sample(this.plan,t);this.sample=state;this.applyPose(state.pose);
  this.merc.root.position.set((this.merc.baseX??this.start.x)+state.travel*60-(this.reducedMotion?0:state.recoil*5),(this.merc.baseY??this.start.y)-state.jump*this.bodyHeight);
  this.targets.forEach((a,i)=>{a.view.x=this.targetsBase[i].x;a.fullBodySprite.tint=this.targetsBase[i].tint;});this.engine.sortCombatDepth();
  const foot=this.ownPoint(),head=this.ownPoint(0,-this.bodyHeight),unit=Math.hypot(head.x-foot.x,head.y-foot.y),grip=this.anchorPoint('grip'),hand=this.anchorPoint('hand'),upper=this.anchorPoint('upperTip'),lower=this.anchorPoint('lowerTip'),muzzle=this.anchorPoint('tip'),mode=this.plan.mode;this.unit=unit;
  const resting={x:(upper.x+lower.x)/2,y:grip.y},nock=['draw','ultimate'].includes(state.pose.key)?hand:resting;
  if(mode!=='defeat'||t<.65)for(const [width,alpha]of [[2.6,.18],[.8,.95]])this.bowString.moveTo(upper.x,upper.y).lineTo(nock.x,nock.y).lineTo(lower.x,lower.y).stroke({color:0xffcf78,width,alpha});
  if(this.motionOnly||!this.effectsEnabled||state.cancelled||state.done){this.onUpdate(this);return;}
  if(mode==='dash'&&t>.15&&t<1.15)this.ghost(t);
  if(mode==='attack'||mode==='skill'){
   const skill=mode==='skill';
   for(let i=0;i<this.plan.contacts.length;i++){
    const hit=this.plan.contacts[i],last=i===this.plan.contacts.length-1,launch=hit-(skill?.3:.33),target=this.targets[0],end=this.point(target),origin=this.launchPoint(launch),wide=skill&&last;
    if(t>=launch-(wide?.38:skill?.15:.7)&&t<launch+.08){
     const chargeStart=launch-(wide?.38:skill?.15:.7);
     this.seq('charge',t,chargeStart,launch+.08,muzzle,unit*(wide?.86:skill?.54:.75));
    }
    this.projectile(wide?'volley':'bolt',t,launch,hit,origin,end,unit*(wide?1.55:skill?.95:1.28));
    this.seq('impact',t,hit,hit+(wide?.98:.62),end,unit*(wide?1.6:skill?.84:1.2));
    this.contactChecks.push({at:hit,targetId:target.id,from:origin,to:end,mapping:'BOW_ARROW_TO_TARGET_CHEST',effect:'impact'});
   }
  }
  if(mode==='ultimate'){
   const feet=this.targets.map(a=>this.point(a,0)),center={x:feet.reduce((n,p)=>n+p.x,0)/feet.length,y:feet.reduce((n,p)=>n+p.y,0)/feet.length},top=Math.min(...this.targets.map(a=>this.point(a,.9).y)),sky={x:center.x,y:Math.max(unit*.55+10,top-unit*.32)};
   this.seq('charge',t,.25,1.4,muzzle,unit*.95);
   this.projectile('bolt',t,1.3,1.85,this.launchPoint(1.3),sky,unit*1.35,false);
   const rain=this.plan.contacts.slice(0,-1);
   for(let i=0;i<rain.length;i++){
    const hit=rain[i],target=this.targets[i%this.targets.length],at=feet[i%feet.length],origin={x:clamp(at.x-unit*.42,unit*.6,this.engine.scene.width-unit*.4),y:sky.y},launch=hit-.38;
    this.projectile('bolt',t,launch,hit,origin,at,unit*.76,false);
    this.seq('rain',t,hit,hit+.68,at,unit*.98);
    this.contactChecks.push({at:hit,targetId:target.id,from:origin,to:at,mapping:'ARROW_RAIN_TO_TARGET_GROUND',effect:'rain'});
   }
   const impact=this.plan.contacts.at(-1),target=this.targets[2],at=feet[2],from={x:at.x,y:Math.max(10,at.y-unit*2)};
   this.projectile('bolt',t,impact-.48,impact,from,at,unit*1.9,false);
   // The first three frames are the descending arrow. Frame 3 is the exact ground-contact drawing.
   if(t>=impact&&t<impact+1.75)this.draw('breaker',3+clamp((t-impact)/1.75)*8,at,unit*2.55,{alpha:clamp((impact+1.75-t)/.4)});
   this.contactChecks.push({at:impact,targetId:target.id,from,to:at,mapping:'HEAVY_ARROW_TO_TARGET_GROUND',effect:'breaker'});
  }
  for(const hit of state.contacts){
   const i=this.plan.contacts.indexOf(hit.at),a=this.targets[mode==='ultimate'?(i===this.plan.contacts.length-1?2:i%this.targets.length):0];
   a.fullBodySprite.tint=0xffc87e;if(!this.reducedMotion)a.view.x+=Math.sin(hit.age*60)*(mode==='ultimate'?2.5:1.8);
  }
  this.onUpdate(this);
 }
 diagnostics(){return{ready:!this.destroyed,revision:'arrow-v2',mode:this.plan.mode,time:this.time,playing:this.playing,speed:this.speed,pose:this.sample.pose,cancelled:this.sample.cancelled,visibleSprites:this.pool.filter(s=>s.visible).length,activeFrames:this.activeFrames,contacts:this.contactChecks,registeredTimelines:this.registration&&this.engine.simpleTimelines.has(this.registration)?1:0,effectLayers:this.engine.effectLayer.children.filter(c=>c.label==='ImperialArcherFX').length,motionOnly:this.motionOnly,effectsEnabled:this.effectsEnabled,reducedMotion:this.reducedMotion,clockOwner:'V3_REGISTERED_GSAP',damageAuthority:'NONE_VISUAL_PREVIEW',unit:this.unit};}
 destroy(){if(this.destroyed)return;this.cancel();this.layer.destroy({children:true});for(const a of [...Object.values(this.assets.motion),...Object.values(this.assets.effects)])for(const tex of a)tex.destroy(false);this.destroyed=true;this.pool=[];}
}
