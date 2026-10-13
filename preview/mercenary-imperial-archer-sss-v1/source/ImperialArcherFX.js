import {Container,Sprite,Assets,Texture,Rectangle,Graphics,AlphaFilter} from 'pixi.js';import {gsap} from 'gsap';import {clamp,sample} from '../skill.mjs';import {sampleAura} from '../aura-loop.mjs';
const ROOT='/preview/mercenary-imperial-archer-sss-v1/',mix=(a,b,t)=>a+(b-a)*t;
export async function loadArcherAssets(m){const a={motion:{},effects:{}};await Promise.all(['motion','effects'].flatMap(kind=>Object.entries(m[kind]).filter(([k])=>kind!=='effects'||k!=='aura').map(async([k,v])=>{const tex=await Assets.load(ROOT+v.atlas);a[kind][k]=v.frames.map((_,i)=>new Texture({source:tex.source,frame:new Rectangle(i%v.columns*v.cellSize,Math.floor(i/v.columns)*v.cellSize,v.cellSize,v.cellSize)}));})));return a;}
export class ImperialArcherFX{
 constructor(engine,merc,targets,assets,manifest,plan,onUpdate=()=>{}){Object.assign(this,{engine,merc,targets,assets,manifest,plan,onUpdate});merc.animationController.kill();this.bodyHeight=manifest.displaySizing.physicalBodyHeight;this.clock={time:0};this.speed=1;this.auraEnabled=true;this.motionOnly=false;this.reducedMotion=!!engine.reducedMotion;this.layer=new Container({label:'ImperialArcherFX'});this.layer.eventMode='none';engine.effectLayer.addChild(this.layer);this.rearLayer=new Container({label:'VermilionAuraRear'});engine.stage.addChildAt(this.rearLayer,engine.stage.getChildIndex(engine.combatLayer));this.frontAuraLayer=new Container({label:'VermilionAuraFront'});this.layer.addChild(this.frontAuraLayer);this.auraFilters=[new AlphaFilter({alpha:1}),new AlphaFilter({alpha:1})];this.rearLayer.filters=[this.auraFilters[0]];this.frontAuraLayer.filters=[this.auraFilters[1]];this.bowString=new Graphics();this.layer.addChild(this.bowString);this.pool=Array.from({length:120},()=>{const s=new Sprite();s.visible=false;this.layer.addChild(s);return s;});this.targetsBase=targets.map(a=>({x:a.view.x,tint:a.fullBodySprite.tint}));this.captureFormation();this.makeTimeline();this.render(0);}
 get time(){return this.clock.time}get playing(){return !!this.timeline&&!this.timeline.paused()&&this.time<this.plan.duration}
 captureFormation(){this.start={x:this.merc.baseX??this.merc.root.x,y:this.merc.baseY??this.merc.root.y};}
 makeTimeline(){this.removeTimeline();this.clock.time=0;this.timeline=gsap.timeline({paused:true,onUpdate:()=>this.render(this.clock.time),onComplete:()=>{this.engine.simpleTimelines.delete(this.registration);this.render(this.plan.duration);this.onComplete?.();}}).to(this.clock,{time:this.plan.duration,duration:this.plan.duration,ease:'none'}).timeScale(this.speed);this.registration={instance:this.timeline,settle:()=>this.cancel()};if(!this.motionOnly&&!this.reducedMotion)for(const at of this.plan.contacts)if(this.plan.stop===null||at<this.plan.stop)this.engine.camera?.addShake(this.timeline,{at,intensity:this.plan.mode==='ultimate'?9:3,duration:.16,rotation:.001});}
 removeTimeline(){if(this.registration)this.engine.simpleTimelines.delete(this.registration);this.timeline?.kill();this.timeline=null;this.registration=null;}
 play(){if(this.destroyed)return;if(!this.timeline)this.makeTimeline();if(this.time>=this.plan.duration)this.seek(0);this.engine.simpleTimelines.add(this.registration);this.timeline.play();this.onUpdate(this);}
 pause(){this.timeline?.pause();this.onUpdate(this);}
 seek(t){if(!this.timeline)this.makeTimeline();t=clamp(t,0,this.plan.duration);this.timeline.pause().time(t,true);this.clock.time=t;this.engine.camera?.reset(true);this.render(t);}
 setSpeed(s){this.speed=clamp(+s,.25,2);this.timeline?.timeScale(this.speed);this.onUpdate(this);}
 setSound(){}setAura(on){this.auraEnabled=!!on;this.render(this.time);}
 setFocus(on){this.focusEnabled=!!on;this.engine.camera?.reset(true);this.render(this.time);}
 applyFocus(){
  if(!this.focusEnabled)return;const c=this.engine.camera,foot=this.ownPoint(),u=this.unit,scene=this.engine.scene;
  const aura=this.activeFrames.find(a=>a.key==='aura-rear')?.bounds,box={left:foot.x-u*.8,right:foot.x+u*.9,top:foot.y-u*1.22,bottom:foot.y+u*.2};
  if(aura){box.left=Math.min(box.left,aura.left);box.right=Math.max(box.right,aura.right);box.top=Math.min(box.top,aura.top);box.bottom=Math.max(box.bottom,aura.bottom);}
  const scale=Math.min(4,scene.width*.82/(box.right-box.left),scene.height*.84/(box.bottom-box.top));
  const halfW=scene.width/(2*scale),halfH=scene.height/(2*scale),x=clamp((box.left+box.right)/2,halfW,scene.width-halfW),y=clamp((box.top+box.bottom)/2,halfH,scene.height-halfH);
  c.container.position.set(c.base.x,c.base.y);c.container.pivot.set(x,y);c.container.scale.set(scale);c.container.rotation=0;
 }
 setMotionOnly(on){const t=this.time;this.motionOnly=!!on;this.makeTimeline();this.seek(t);}
 setReducedMotion(on){const t=this.time;this.reducedMotion=!!on;this.makeTimeline();this.seek(t);}
 setPlan(p){this.cancel(false);this.plan=p;this.makeTimeline();this.render(0);}
 cancel(notify=true){if(this.destroyed)return;if(notify)this.onCancel?.();this.removeTimeline();this.engine.camera?.reset(true);this.clock.time=0;this.render(0);this.pool.forEach(s=>s.visible=false);this.bowString.clear();this.activeFrames=[];this.auraSample=null;this.rearLayer.visible=this.frontAuraLayer.visible=false;}
 ownPoint(x=0,y=0){return this.engine.effectLayer.toLocal(this.merc.view.toGlobal({x,y}));}
 point(a,f=.43){return this.engine.effectLayer.toLocal(a.root.toGlobal({x:0,y:-a.fullBodyHeight*f}));}
 applyPose(pose){const f=this.manifest.motion[pose.key].frames[pose.frame],s=this.merc.fullBodySprite;s.texture=this.assets.motion[pose.key][pose.frame];s.anchor.set(f.footAnchor.x,f.footAnchor.y);s.position.set(0,0);s.scale.set(this.bodyHeight/f.bodyPixels);this.poseFrame=f;const n=this.merc.neutralAvatarPose?.mainSprite;if(n){n.scaleX=s.scale.x;n.scaleY=s.scale.y;}}
 anchorPoint(key){const f=this.poseFrame,p=f[key];return this.ownPoint((p.x-f.footAnchor.x*768)*this.bodyHeight/f.bodyPixels,(p.y-f.footAnchor.y*768)*this.bodyHeight/f.bodyPixels);}
 drawAura(t){
  const r=this.manifest.auraPlayback,pose=sampleAura(t,this.reducedMotion),layer=this.engine.effectLayer,foot=layer.toLocal(this.merc.root.toGlobal({x:0,y:0})),head=layer.toLocal(this.merc.root.toGlobal({x:0,y:-this.bodyHeight})),unit=Math.hypot(head.x-foot.x,head.y-foot.y),point={x:foot.x+unit*r.beakOffset.x,y:foot.y+unit*r.beakOffset.y},b=r.envelope,scene=this.engine.scene;
  // One size and one anatomical attachment for the complete loop, including its seam.
  const size=Math.max(0,Math.min(unit*r.sizeInBodyHeights,(point.x-10)/-b.left,(scene.width-10-point.x)/b.right,(point.y-10)/-b.top,(scene.height-10-point.y)/b.bottom)),bounds={left:point.x+b.left*size,right:point.x+b.right*size,top:point.y+b.top*size,bottom:point.y+b.bottom*size};
  this.rearLayer.visible=this.frontAuraLayer.visible=true;this.auraSample={...pose,point:{...point},size,bounds};
  for(const [key,parent]of [['aura-rear',this.rearLayer],['aura-front',this.frontAuraLayer]]){
   for(const [index,weight]of [[pose.from,1-pose.weight],[pose.to,pose.weight]]){if(weight<=0)continue;const s=this.pool[this.used++],f=r.sourceFrames.find(f=>f.index===index);if(s.parent!==parent)parent.addChild(s);s.texture=this.assets.effects[key][index];s.anchor.set(f.beak.x/r.cellSize,f.beak.y/r.cellSize);s.position.set(point.x,point.y);s.width=size;s.height=size*r.verticalRatio;s.rotation=0;s.alpha=weight;s.visible=true;
    // Premultiplied frames sum in an isolated transparent target, then composite normally.
    // Adding straight onto the battlefield would wash out the requested deep red.
    s.blendMode='add';
   }
   this.activeFrames.push({key,frame:pose.from,nextFrame:pose.to,blend:pose.weight,point:{...point},size,alpha:1,bounds:{...bounds},registration:'BEAK_FIXED_V2'});
  }
 }
 draw(key,frame,point,size,{alpha=1,angle=0,anchor=null,stretch=1,back=false,solid=false}={}){if(this.used>=this.pool.length||alpha<=0)return;frame=clamp(frame,0,11);const i=Math.floor(frame),q=solid?0:frame-i,spec=this.manifest.effects[key],a=anchor||spec.frames[i].anchor;
  const corners=[[0,0],[1,0],[0,1],[1,1]].map(([x,y])=>({x:(x-a.x)*Math.cos(angle)-(y-a.y)*stretch*Math.sin(angle),y:(x-a.x)*Math.sin(angle)+(y-a.y)*stretch*Math.cos(angle)})),bounds={left:Math.min(...corners.map(p=>p.x)),right:Math.max(...corners.map(p=>p.x)),top:Math.min(...corners.map(p=>p.y)),bottom:Math.max(...corners.map(p=>p.y))},scene=this.engine.scene,margin=10;
  if(bounds.left<0)size=Math.min(size,(point.x-margin)/-bounds.left);if(bounds.right>0)size=Math.min(size,(scene.width-margin-point.x)/bounds.right);if(bounds.top<0)size=Math.min(size,(point.y-margin)/-bounds.top);if(bounds.bottom>0)size=Math.min(size,(scene.height-margin-point.y)/bounds.bottom);size=Math.max(0,size);
  for(const [j,opacity]of [[i,1-q],[Math.min(11,i+1),q]]){if(opacity<.001)continue;const s=this.pool[this.used++],parent=back?this.rearLayer:this.layer;if(s.parent!==parent)parent.addChild(s);s.texture=this.assets.effects[key][j];s.anchor.set(a.x,a.y);s.position.set(point.x,point.y);s.width=size;s.height=size*stretch;s.rotation=angle;s.alpha=alpha*opacity;s.visible=true;s.blendMode='normal';}this.activeFrames.push({key,frame,point:{...point},size,alpha,bounds:{left:point.x+bounds.left*size,right:point.x+bounds.right*size,top:point.y+bounds.top*size,bottom:point.y+bounds.bottom*size}});}
 seq(key,t,start,end,p,size,options={}){if(t<start||t>end)return;const q=clamp((t-start)/(end-start));this.draw(key,q*11,p,size,{...options,alpha:(options.alpha??1)*Math.min(1,(1-q)*5)});}
 render(t){
  if(this.destroyed)return;this.pool.forEach(s=>s.visible=false);this.rearLayer.visible=this.frontAuraLayer.visible=false;this.auraSample=null;this.bowString.clear();this.used=0;this.activeFrames=[];this.contactChecks=[];
  const state=sample(this.plan,t);this.sample=state;this.applyPose(state.pose);this.merc.root.position.set((this.merc.baseX??this.start.x)+state.travel*60,(this.merc.baseY??this.start.y)-state.jump*this.bodyHeight);
  this.targets.forEach((a,i)=>{a.view.x=this.targetsBase[i].x;a.fullBodySprite.tint=this.targetsBase[i].tint;});this.engine.sortCombatDepth();
  const foot=this.ownPoint(),head=this.ownPoint(0,-this.bodyHeight),unit=Math.hypot(head.x-foot.x,head.y-foot.y),grip=this.anchorPoint('grip'),hand=this.anchorPoint('hand'),upper=this.anchorPoint('upperTip'),lower=this.anchorPoint('lowerTip'),muzzle=this.anchorPoint('tip'),scene=this.engine.scene,mode=this.plan.mode;this.unit=unit;
  // A single rigid approved bow is baked into each pose. Only its physical string changes tension.
  const resting={x:(upper.x+lower.x)/2,y:grip.y},nock=['draw','ultimate'].includes(state.pose.key)?hand:resting;
  if(mode!=='defeat'||t<.65){for(const [width,alpha]of [[3,.15],[.8,.9]])this.bowString.moveTo(upper.x,upper.y).lineTo(nock.x,nock.y).lineTo(lower.x,lower.y).stroke({color:0xffcf78,width,alpha});}
  if(this.motionOnly||state.cancelled){this.onUpdate(this);return;}
  if(this.auraEnabled&&mode!=='defeat')this.drawAura(t);
  if(state.done){this.onUpdate(this);return;}
  if(mode==='attack'&&t<.8)this.draw('shot',clamp(t/.8)*3,muzzle,unit*.6,{alpha:.92});
  if(mode==='skill'&&t<.72)this.draw('flight',clamp(t/.72)*2,muzzle,unit*.96);
  if(mode==='attack'||mode==='skill')for(let i=0;i<this.plan.contacts.length;i++){
   const hit=this.plan.contacts[i],target=this.targets[mode==='attack'?0:i%this.targets.length],end=this.point(target),launch=hit-.42,key=mode==='attack'?'shot':'flight',start=muzzle;
   // Re-sample the authored release pose so a later follow-through cannot drag a projectile's origin.
   const launchPose=sample(this.plan,launch).pose,f=this.manifest.motion[launchPose.key].frames[launchPose.frame],origin=this.ownPoint((f.tip.x-f.footAnchor.x*768)*this.bodyHeight/f.bodyPixels,(f.tip.y-f.footAnchor.y*768)*this.bodyHeight/f.bodyPixels);
   if(t>=launch&&t<hit){const q=clamp((t-launch)/.42),pt={x:mix(origin.x,end.x,q),y:mix(origin.y,end.y,q)},angle=Math.atan2(end.y-origin.y,end.x-origin.x);this.draw(key,3+q*3,pt,unit*(mode==='skill'?1.7:1.05),{angle,anchor:{x:.86,y:.53}});}
   if(t>=hit&&t<hit+.68)this.draw(key,7+clamp((t-hit)/.68)*4,end,unit*(mode==='skill'?1.7:1.13),{alpha:clamp((hit+.68-t)/.22),anchor:{x:.7,y:.53}});
   this.contactChecks.push({at:hit,targetId:target.id,from:origin,to:end,mapping:'REGISTERED_BOW_EMISSION_TO_TARGET_CHEST'});
  }
  if(mode==='ultimate'){
   const feet=this.targets.map(a=>this.point(a,0)),center={x:feet.reduce((s,p)=>s+p.x,0)/feet.length,y:feet.reduce((s,p)=>s+p.y,0)/feet.length},top=Math.min(...this.targets.map(a=>this.point(a,.8).y)),sky={x:center.x,y:Math.max(unit*.5+20,top-unit*.22)};
   this.seq('array',t,.35,4.3,sky,Math.min(unit*2.9,scene.width*.5));
   if(t>=1.35&&t<1.92){const q=clamp((t-1.35)/.57),to={x:sky.x,y:sky.y},point={x:mix(muzzle.x,to.x,q),y:mix(muzzle.y,to.y,q)};this.draw('shot',3+q*3,point,unit*1.15,{angle:Math.atan2(to.y-muzzle.y,to.x-muzzle.x),anchor:{x:.86,y:.53}});}
   for(let i=0;i<5;i++){
    const hit=this.plan.contacts[i],at=feet[i],origin={x:sky.x+(i-2)*unit*.18,y:sky.y},fallStart=hit-.5;
    if(t>=fallStart&&t<hit){const q=clamp((t-fallStart)/.5),pt={x:mix(origin.x,at.x,q),y:mix(origin.y,at.y,q)};this.draw('shot',3+q*3,pt,unit*.9,{angle:Math.atan2(at.y-origin.y,at.x-origin.x),anchor:{x:.86,y:.53}});}
    if(t>=hit&&t<hit+1.4)this.draw('ground',2+clamp((t-hit)/1.4)*9,at,unit*1.55,{alpha:clamp((hit+1.4-t)/.4)});
    this.contactChecks.push({at:hit,targetId:this.targets[i].id,from:origin,to:at,mapping:'SKY_ARROW_TO_TARGET_GROUND'});
   }
   const impact=this.plan.contacts[5],at=feet[0];
   if(t>=impact-1.15&&t<impact+2.25){const frame=t<impact?clamp((t-impact+1.15)/1.15)*5:5+clamp((t-impact)/2.25)*6;this.draw('descent',frame,at,Math.min(unit*3.45,scene.width*.56),{alpha:clamp((impact+2.25-t)/.45)});}
   this.contactChecks.push({at:impact,targetId:this.targets[0].id,from:{x:at.x,y:sky.y},to:at,mapping:'VERMILION_BIRD_TO_TARGET_GROUND'});
  }
  if(mode==='dash'&&t>.2&&t<1.15){const p={x:foot.x-unit*.35,y:foot.y-unit*.28};this.seq('flight',t,.2,1.15,p,unit*.8,{alpha:.5});}
  for(const hit of state.contacts){const index=this.plan.contacts.indexOf(hit.at),a=this.targets[mode==='attack'?0:index%this.targets.length];a.fullBodySprite.tint=0xffbd72;if(!this.reducedMotion)a.view.x+=Math.sin(hit.age*60)*2;}
  this.onUpdate(this);
 }
 diagnostics(){return{ready:!this.destroyed,mode:this.plan.mode,time:this.time,playing:this.playing,speed:this.speed,pose:this.sample.pose,cancelled:this.sample.cancelled,visibleSprites:this.pool.filter(s=>s.visible).length,activeFrames:this.activeFrames,contacts:this.contactChecks,registeredTimelines:this.registration&&this.engine.simpleTimelines.has(this.registration)?1:0,effectLayers:this.engine.effectLayer.children.filter(c=>c.label==='ImperialArcherFX').length,motionOnly:this.motionOnly,auraEnabled:this.auraEnabled,auraSample:this.auraSample,reducedMotion:this.reducedMotion,clockOwner:'V3_REGISTERED_GSAP',damageAuthority:'NONE_VISUAL_PREVIEW',unit:this.unit};}
 destroy(){if(this.destroyed)return;this.cancel();this.layer.destroy({children:true});this.rearLayer.destroy({children:true});this.auraFilters.forEach(f=>f.destroy());for(const a of [...Object.values(this.assets.motion),...Object.values(this.assets.effects)])for(const tex of a)tex.destroy(false);this.destroyed=true;this.pool=[];}
}
