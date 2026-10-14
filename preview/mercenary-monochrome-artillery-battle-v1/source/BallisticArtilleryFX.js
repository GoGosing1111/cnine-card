import {Container,Sprite,Assets,Texture,Rectangle,AlphaFilter} from 'pixi.js';
import {gsap} from 'gsap';
import {clamp,sample,RIFLE_FLIGHT} from '../skill.mjs';
const ROOT='/preview/mercenary-monochrome-artillery-battle-v1/',mix=(a,b,t)=>a+(b-a)*t;
export async function loadBallisticAssets(m){const out={motion:{},effects:{}};await Promise.all(['motion','effects'].flatMap(kind=>Object.entries(m[kind]).filter(([,v])=>v.previewEnabled!==false).map(async([key,v])=>{const tex=await Assets.load(ROOT+v.atlas);out[kind][key]=v.frames.map((_,i)=>new Texture({source:tex.source,frame:new Rectangle(i%v.columns*v.cellSize,Math.floor(i/v.columns)*v.cellSize,v.cellSize,v.cellSize)}));})));return out;}
// The projectile starts tangent to the actual barrel, then follows a shallow ballistic arc.
export function trajectory(a,b,angle,q,bend){const p={x:a.x+Math.cos(angle)*bend,y:a.y+Math.sin(angle)*bend},c={x:b.x-bend*.25,y:b.y-bend*.2},u=1-q,x=u*u*u*a.x+3*u*u*q*p.x+3*u*q*q*c.x+q*q*q*b.x,y=u*u*u*a.y+3*u*u*q*p.y+3*u*q*q*c.y+q*q*q*b.y,dx=3*u*u*(p.x-a.x)+6*u*q*(c.x-p.x)+3*q*q*(b.x-c.x),dy=3*u*u*(p.y-a.y)+6*u*q*(c.y-p.y)+3*q*q*(b.y-c.y);return{x,y,angle:Math.atan2(dy,dx)};}
export class BallisticArtilleryFX{
 constructor(engine,merc,targets,assets,manifest,plan,onUpdate=()=>{}){Object.assign(this,{engine,merc,targets,assets,manifest,plan,onUpdate});merc.animationController.kill();this.bodyHeight=manifest.displaySizing.physicalBodyHeight;this.clock={time:0};this.speed=1;this.auraEnabled=true;this.motionOnly=false;this.reducedMotion=!!engine.reducedMotion;this.layer=new Container({label:'BallisticArtilleryFX'});this.layer.eventMode='none';engine.effectLayer.addChild(this.layer);this.pool=Array.from({length:100},()=>{const s=new Sprite();s.visible=false;this.layer.addChild(s);return s;});this.targetsBase=targets.map(a=>({x:a.view.x,tint:a.fullBodySprite.tint}));this.ambientOffset=0;this.makeBodyAura();this.makeHalo();this.captureFormation();this.makeTimeline();this.render(0);}
 get time(){return this.clock.time}get playing(){return !!this.timeline&&!this.timeline.paused()&&this.time<this.plan.duration}
 makeBodyAura(){
  this.bodyAuraBack=new Container({label:'WhiteTigerAuraBack'});this.bodyAuraBack.zIndex=5;this.merc.view.addChild(this.bodyAuraBack);
  this.bodyAuraFront=new Container({label:'WhiteTigerAuraFront'});this.bodyAuraFront.zIndex=this.merc.fullBodySprite.zIndex+.01;this.merc.view.addChild(this.bodyAuraFront);
  this.bodyAuraFilters=[new AlphaFilter({alpha:1}),new AlphaFilter({alpha:1})];
  this.bodyAuraBack.filters=[this.bodyAuraFilters[0]];this.bodyAuraFront.filters=[this.bodyAuraFilters[1]];
  this.bodyAuraSprites=[0,1].map(()=>{const s=new Sprite();this.bodyAuraBack.addChild(s);return s;});
  this.bodyAuraFrontSprites=[0,1].map(()=>{const s=new Sprite();this.bodyAuraFront.addChild(s);return s;});this.merc.view.sortChildren();
 }
 updateBodyAura(state){
  this.bodyAuraBack.visible=this.bodyAuraFront.visible=this.auraEnabled&&!this.motionOnly&&!state.cancelled;
  if(!this.bodyAuraBack.visible)return;
  const r=this.manifest.bodyAura,count=this.manifest.effects[r.rear].frameCount,time=this.ambientOffset+state.time;
  const phase=this.reducedMotion?0:(1-Math.cos(time/r.cycleSeconds*Math.PI*2))*(count-1)/2,i=Math.floor(phase),q=phase-i;
  this.bodyAuraFrame=phase;this.bodyAuraPosition={x:this.bodyHeight*r.noseOffset.x,y:this.bodyHeight*r.noseOffset.y};
  const point=this.ownPoint(this.bodyAuraPosition.x,this.bodyAuraPosition.y),foot=this.ownPoint(),top=this.ownPoint(0,-this.bodyHeight),unit=Math.hypot(top.x-foot.x,top.y-foot.y),e=r.envelope,scene=this.engine.scene;
  const size=Math.max(0,Math.min(unit*r.sizeInBodyHeights,(point.x-8)/-e.left,(scene.width-8-point.x)/e.right,(point.y-8)/-e.top,(scene.height-8-point.y)/e.bottom));
  this.bodyAuraSize=size*this.bodyHeight/unit;this.bodyAuraBounds={left:point.x+e.left*size,right:point.x+e.right*size,top:point.y+e.top*size,bottom:point.y+e.bottom*size};
  for(const [key,sprites]of [[r.rear,this.bodyAuraSprites],[r.front,this.bodyAuraFrontSprites]])for(let j=0;j<2;j++){
   const n=Math.min(count-1,i+j),s=sprites[j],a=this.manifest.effects[key].frames[n].anchor;
   s.texture=this.assets.effects[key][n];s.anchor.set(a.x,a.y);s.position.set(this.bodyAuraPosition.x,this.bodyAuraPosition.y);
   s.width=s.height=this.bodyAuraSize;s.rotation=0;s.alpha=j?q:1-q;s.blendMode='add';
  }
 }
 makeHalo(){this.haloBack=new Container({label:'MandatoryHeadHalo'});this.haloBack.zIndex=10;this.merc.view.addChild(this.haloBack);this.haloSprites=[0,1].map(()=>{const s=new Sprite();this.haloBack.addChild(s);return s;});this.merc.view.sortChildren();}
 updateHalo(state){this.haloBack.visible=this.auraEnabled&&!this.motionOnly&&!state.cancelled;if(!this.haloBack.visible)return;const p=this.localAnchor('head'),phase=(this.reducedMotion?0:state.time%6/6*12),i=Math.floor(phase),q=phase-i;this.haloFrame=phase;this.haloPosition={x:p.x,y:p.y-this.bodyHeight*.035};for(let j=0;j<2;j++){const s=this.haloSprites[j],idx=(i+j)%12,a=this.manifest.effects.halo.frames[idx].anchor;s.texture=this.assets.effects.halo[idx];s.anchor.set(a.x,a.y);s.position.set(this.haloPosition.x,this.haloPosition.y);s.width=s.height=this.bodyHeight*.64;s.alpha=j?q:1-q;s.rotation=0;}}
 captureFormation(){this.start={x:this.merc.baseX??this.merc.root.x,y:this.merc.baseY??this.merc.root.y};}
 makeTimeline(){this.removeTimeline();this.clock.time=0;this.timeline=gsap.timeline({paused:true,onUpdate:()=>this.render(this.clock.time),onComplete:()=>{this.engine.simpleTimelines.delete(this.registration);this.render(this.plan.duration);const handled=this.onComplete?.();if(!handled&&this.plan.mode==='aura'&&!this.reducedMotion&&this.plan.stop===null){this.ambientOffset+=this.plan.duration;this.clock.time=0;this.engine.simpleTimelines.add(this.registration);this.timeline.restart();}}}).to(this.clock,{time:this.plan.duration,duration:this.plan.duration,ease:'none'}).timeScale(this.speed);this.registration={instance:this.timeline,settle:()=>this.cancel()};if(this.plan.mode==='ultimate'&&!this.motionOnly&&!this.reducedMotion)for(const at of this.plan.contacts)if(this.plan.stop===null||at<this.plan.stop)this.engine.camera?.addShake(this.timeline,{at,intensity:2.3,duration:.12,rotation:0});}
 removeTimeline(){if(this.registration)this.engine.simpleTimelines.delete(this.registration);this.timeline?.kill();this.timeline=null;this.registration=null;}
 play(){if(this.destroyed)return;if(!this.timeline)this.makeTimeline();if(this.time>=this.plan.duration)this.seek(0);this.engine.simpleTimelines.add(this.registration);this.timeline.play();this.onUpdate(this);}
 pause(){this.timeline?.pause();this.onUpdate(this);}
 seek(t){if(!this.timeline)this.makeTimeline();t=clamp(t,0,this.plan.duration);this.timeline.pause().time(t,true);this.clock.time=t;this.engine.camera?.reset(true);this.render(t);}
 setSpeed(s){this.speed=clamp(+s,.25,2);this.timeline?.timeScale(this.speed);this.onUpdate(this);}
 setSound(){}setAura(on){this.auraEnabled=!!on;this.render(this.time);}
 setMotionOnly(on){const t=this.time;this.motionOnly=!!on;this.makeTimeline();this.seek(t);}
 setReducedMotion(on){const t=this.time;this.reducedMotion=!!on;this.makeTimeline();this.seek(t);}
 setPlan(p){this.ambientOffset+=this.time;this.cancel(false);this.plan=p;this.makeTimeline();this.render(0);}
 cancel(notify=true){if(this.destroyed)return;if(notify)this.onCancel?.();this.removeTimeline();this.engine.camera?.reset(true);this.clock.time=0;this.render(0);this.pool.forEach(s=>s.visible=false);this.activeFrames=[];this.haloBack.visible=false;this.bodyAuraBack.visible=this.bodyAuraFront.visible=false;}
 ownPoint(x=0,y=0){return this.engine.effectLayer.toLocal(this.merc.view.toGlobal({x,y}));}
 point(a,f=.43){return this.engine.effectLayer.toLocal(a.root.toGlobal({x:0,y:-a.fullBodyHeight*f}));}
 localAnchor(key,pose=this.sample.pose){const spec=this.manifest.motion[pose.key],f=spec.frames[pose.frame],p=f[key],k=this.bodyHeight/f.bodyPixels;return{x:(p.x-f.footAnchor.x*spec.cellSize)*k,y:(p.y-f.footAnchor.y*spec.cellSize)*k};}
 anchorPoint(key,pose){const p=this.localAnchor(key,pose);return this.ownPoint(p.x,p.y);}
 applyPose(pose){const f=this.manifest.motion[pose.key].frames[pose.frame],s=this.merc.fullBodySprite;s.texture=this.assets.motion[pose.key][pose.frame];s.anchor.set(f.footAnchor.x,f.footAnchor.y);s.position.set(0,0);s.scale.set(this.bodyHeight/f.bodyPixels);this.poseFrame=f;const n=this.merc.neutralAvatarPose?.mainSprite;if(n){n.scaleX=s.scale.x;n.scaleY=s.scale.y;}}
 draw(key,frame,p,size,{alpha=1,angle=0,anchor=null,stretch=1,smooth=true}={}){if(this.used>=this.pool.length-2||alpha<=0)return;frame=clamp(frame,0,11);const i=Math.floor(frame),q=smooth?frame-i:0,spec=this.manifest.effects[key];let result;
  for(const [j,opacity]of [[i,1-q],[Math.min(11,i+1),q]]){if(opacity<.001)continue;const a=anchor||spec.frames[j].anchor,s=this.pool[this.used++];s.texture=this.assets.effects[key][j];s.anchor.set(a.x,a.y);s.position.set(p.x,p.y);s.width=size;s.height=size*stretch;s.rotation=angle;s.alpha=alpha*opacity;s.visible=true;s.blendMode='normal';result={key,frame:j,point:{...p},size,height:size*stretch,angle,anchor:a,alpha:s.alpha};this.activeFrames.push(result);}return result;}
 skullBurst(t,first,last,target,size){
  if(t<first||t>last+.8)return;
  const age=t-first,tail=t-last,frame=tail>0?mix(6,11,clamp(tail/.8)):age<.22?mix(0,5,age/.22):5+Math.sin(age*7)*.3;
  this.draw('skull',frame,this.point(target,.94),size,{alpha:Math.min(1,age/.075,clamp((last+.8-t)/.18))});
 }
 rifle(t,muzzle,axis,unit){
  const mode=this.plan.mode,launches=this.plan.rifleLaunches;
  // Preview aim selects the nearest chest height; the initial tangent stays on the barrel axis.
  const target=this.targets.reduce((a,b)=>Math.abs(this.point(a).y-muzzle.y)<Math.abs(this.point(b).y-muzzle.y)?a:b);
  this.rifleTarget=target;const end=this.point(target);
  if(mode==='aura'||(mode==='skill'&&t<launches[0])){
   for(let i=0;i<(mode==='aura'?2:3);i++){
    const offset=unit*(.1+i*.12),p={x:muzzle.x+Math.cos(axis)*offset,y:muzzle.y+Math.sin(axis)*offset};
    this.draw('ar-ballistics',4,p,unit*.18,{angle:axis,alpha:mode==='aura'?.68:.88});
    this.muzzleChecks.push({kind:'ALIGNED_AMMUNITION',from:muzzle,to:p,crossAxisError:Math.abs((p.x-muzzle.x)*Math.sin(axis)-(p.y-muzzle.y)*Math.cos(axis))});
   }
  }
  for(const [i,launch]of launches.entries()){
   const hit=launch+RIFLE_FLIGHT,age=t-launch,pose=sample(this.plan,launch+.001).pose,start=this.anchorPoint('muzzle',pose);
   if(age>=0&&age<.047){
    const phase=age<.014?0:age<.032?1:2;
    this.draw('ar-ballistics',phase,muzzle,unit*(mode==='skill'?.45:.36),{angle:axis,alpha:clamp((.047-age)/.014),smooth:false});
    this.muzzleChecks.push({kind:'RIFLE_FLASH',from:muzzle,to:muzzle,crossAxisError:0});
   }
   if(age>=0&&t<hit){
    const q=clamp(age/RIFLE_FLIGHT),p=trajectory(start,end,axis,q,unit*.32);
    this.draw('ar-ballistics',4+q*3,p,unit*(mode==='skill'?.62:.5),{angle:p.angle});
   }
   if(t>=hit&&t<hit+.24){
    const q=(t-hit)/.24;
    this.draw('ar-ballistics',8+q*3,end,unit*(mode==='skill'?.78:.61),{alpha:clamp((hit+.24-t)/.08)});
   }
   this.contactChecks.push({kind:'RIFLE',shot:i,at:hit,targetId:target.id,from:start,to:end,mapping:'MUZZLE_TO_TARGET_CHEST',angle:axis});
   if(t>=hit&&t<hit+.045)target.fullBodySprite.tint=0xf4f5f7;
  }
  if(mode==='skill')this.skullBurst(t,launches[0]+RIFLE_FLIGHT,launches.at(-1)+RIFLE_FLIGHT+.08,target,unit*.9);
 }
 artilleryFrame(t){
  if(t<.1)return null;
  if(t<1.1)return mix(0,2,clamp((t-.1)/1));
  if(t<1.8)return mix(2,3,clamp((t-1.1)/.7));
  if(t>5.15)return mix(10,11,clamp((t-5.15)/.8));
  const i=this.plan.launches.findLastIndex(at=>at<=t),age=t-this.plan.launches[i];
  if(age<.13)return i%2===0?4:6;
  if(age<.26)return i%2===0?5:7;
  return t<4.85?8:10;
 }
 artillery(t,unit){
  const feet=this.targets.map(a=>this.point(a,0)),xs=feet.map(p=>p.x),ys=feet.map(p=>p.y),w=this.engine.scene.width;
  const ground={x:w*.5,y:(Math.min(...ys)+Math.max(...ys))*.5+unit*.55},size=Math.min(unit*3.65,w*.76),frame=this.artilleryFrame(t);
  if(frame!==null&&t<6.12)this.draw('artillery-v3',frame,ground,size,{smooth:t<1.8||t>5.15,alpha:clamp((6.12-t)/.35)});
  this.artilleryGround=ground;
  const left=Math.max(unit*.02,Math.min(...xs)-unit*.8),right=Math.min(w-unit*.02,Math.max(...xs)+unit*.9);
  const area={x:(left+right)/2,y:Math.max(...ys)+unit*.14},blastWidth=(right-left)*1.27,span=Math.max(...ys)-Math.min(...ys),blastHeight=Math.min((span+unit*1.65)*1.08,blastWidth*.95);
  const blastCenters=span>blastHeight?[area,{x:area.x,y:area.y-span*.48},{x:area.x,y:Math.min(...ys)+unit*.18}]:[area];
  this.formationBlastBounds={left,right,top:Math.min(...ys)-unit*.8,bottom:area.y,center:area,width:blastWidth,height:blastHeight};
  for(const [i,launch]of this.plan.launches.entries()){
   const hit=this.plan.contacts[i],fi=i%2===0?4:6,f=this.manifest.effects['artillery-v3'].frames[fi];
   const start={x:ground.x+(f.muzzle.x-f.anchor.x)*size,y:ground.y+(f.muzzle.y-f.anchor.y)*size},a=f.barrelAngleRadians;
   const end={x:area.x,y:area.y-unit*.12};
   if(t>=launch&&t<hit){
    const q=(t-launch)/(hit-launch),p=trajectory(start,end,a,q,unit*.65);
    this.draw('ar-ballistics',4+q*3,p,unit*.95,{angle:p.angle});
   }
   const age=t-hit;
   if(age>=0&&age<1.17){
    const phase=age<.17?age/.17*3:age<.61?3+(age-.17)/.44*4:7+(age-.61)/.56*4;
    for(const [row,center]of blastCenters.entries()){
     const local=age-row*.035;if(local<0)continue;
     const localPhase=local<.17?local/.17*3:local<.61?3+(local-.17)/.44*4:7+(local-.61)/.56*4;
     this.draw('wide-barrage',localPhase,center,blastWidth*(i===4?1.08:1),{stretch:Math.min(blastHeight,center.y-unit*.08)/blastWidth,alpha:Math.min(.86,clamp(local/.035),clamp((1.17-local)/.27))});
    }
    for(const [j,target]of this.targets.entries()){
     const localAge=age-j*.026;
     if(localAge>=0&&localAge<.55){
      this.draw('wide-barrage',3+localAge/.55*5,feet[j],unit*1.25,{alpha:Math.min(.75,clamp(localAge/.025),clamp((.55-localAge)/.18))});
      target.fullBodySprite.tint=0xf0f2f5;
     }
    }
   }
   this.contactChecks.push({kind:'ARTILLERY',salvo:i,at:hit,from:start,to:end,mapping:'REGISTERED_CANNON_MUZZLE_TO_FORMATION',angle:a});
   for(const [j,target]of this.targets.entries())this.contactChecks.push({kind:'GROUND_STRIKE',salvo:i,at:hit+j*.026,targetId:target.id,from:start,to:feet[j],mapping:'ACTUAL_TARGET_FEET'});
  }
  for(const target of this.targets)this.skullBurst(t,this.plan.contacts[0]+.15,this.plan.contacts.at(-1)+.2,target,unit*.88);
 }
 render(t){
  if(this.destroyed)return;
  this.pool.forEach(s=>s.visible=false);this.used=0;this.activeFrames=[];this.contactChecks=[];this.muzzleChecks=[];this.artilleryGround=null;this.formationBlastBounds=null;
  const state=sample(this.plan,t);this.sample=state;this.applyPose(state.pose);
  this.merc.root.position.set(this.merc.baseX??this.start.x,this.merc.baseY??this.start.y);this.updateHalo(state);this.updateBodyAura(state);
  this.targets.forEach((a,i)=>{a.view.x=this.targetsBase[i].x;a.fullBodySprite.tint=this.targetsBase[i].tint;});this.engine.sortCombatDepth();
  if(this.motionOnly||state.cancelled||state.done){this.onUpdate(this);return;}
  const foot=this.ownPoint(),top=this.ownPoint(0,-this.bodyHeight),unit=Math.hypot(top.x-foot.x,top.y-foot.y);this.unit=unit;
  this.rifle(t,this.anchorPoint('muzzle'),this.poseFrame.weaponAxisRadians,unit);
  if(this.plan.mode==='ultimate')this.artillery(t,unit);
  this.onUpdate(this);
 }
 diagnostics(){return{ready:!this.destroyed,mode:this.plan.mode,time:this.time,playing:this.playing,speed:this.speed,pose:this.sample.pose,cancelled:this.sample.cancelled,visibleSprites:this.pool.filter(s=>s.visible).length,activeFrames:this.activeFrames,contacts:this.contactChecks,muzzleChecks:this.muzzleChecks,registeredTimelines:this.registration&&this.engine.simpleTimelines.has(this.registration)?1:0,effectLayers:this.engine.effectLayer.children.filter(c=>c.label==='BallisticArtilleryFX').length,motionOnly:this.motionOnly,auraEnabled:this.auraEnabled,auraVisible:this.haloBack.visible,haloPosition:this.haloPosition,haloFrame:this.haloFrame,bodyAuraVisible:this.bodyAuraBack.visible,bodyAuraPosition:this.bodyAuraPosition,bodyAuraFrame:this.bodyAuraFrame,reducedMotion:this.reducedMotion,rifleShots:this.plan.rifleLaunches.length,artilleryGround:this.artilleryGround,formationBlastBounds:this.formationBlastBounds,clockOwner:'V3_REGISTERED_GSAP',damageAuthority:'NONE_VISUAL_PREVIEW',unit:this.unit};}
 destroy(){if(this.destroyed)return;this.cancel();this.layer.destroy({children:true});this.haloBack.destroy({children:true});this.bodyAuraBack.destroy({children:true});this.bodyAuraFront.destroy({children:true});this.bodyAuraFilters.forEach(f=>f.destroy());for(const a of [...Object.values(this.assets.motion),...Object.values(this.assets.effects)])for(const tex of a)tex.destroy(false);this.destroyed=true;this.pool=[];}
}
