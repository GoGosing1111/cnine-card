import {Assets,Container,Sprite,Texture,Rectangle,Graphics,GraphicsContext,BlurFilter} from 'pixi.js';
import {gsap} from 'gsap';
import {SKILLS,sample,clamp,ease} from './SkillPlan.mjs';
import {READY_POSE} from './MotionAtlas.mjs';
import {PrimeNeonRim} from './PrimeNeonRim.js';
import {PrimeIdleAura,IDLE_AURA_DURATION} from './PrimeIdleAura.js';
const mix=(a,b,q)=>({x:a.x+(b.x-a.x)*q,y:a.y+(b.y-a.y)*q});
export async function loadPrimeAssets(manifest,root){
  const groups={};
  const result=await Promise.allSettled(Object.entries(manifest.sheets).map(async([key,sheet])=>{
    const source=await Assets.load(root+sheet.path);source.source.scaleMode='linear';
    groups[key]=sheet.frames.map(f=>new Texture({source:source.source,frame:new Rectangle(f.rect.x,f.rect.y,f.rect.width,f.rect.height)}));
  }));
  const error=result.find(r=>r.status==='rejected');
  if(error){for(const group of Object.values(groups))for(const texture of group)texture.destroy(false);throw error.reason;}
  return groups;
}
export class PrimeRequiemFX{
  constructor(engine,actor,targets,assets,manifest,update=()=>{}){
    Object.assign(this,{engine,actor,targets,assets,manifest,update});
    actor.animationController.kill();this.clock={time:0};this.speed=2;this.destroyed=false;
    this.plan=SKILLS[0];this.state=sample(this.plan,0);this.bodyHeight=410;
    this.targetDefaults=targets.map(t=>({x:t.view.x,y:t.view.y,tint:t.fullBodySprite.tint}));
    this.clips=manifest.sheets['motion-user-eight-v2'].frames.map(f=>new GraphicsContext().poly(f.clip).fill(0xffffff));
    this.layer=new Container({label:'PrimeRequiemBloodFX',eventMode:'none'});engine.effectLayer.addChild(this.layer);
    this.pool=Array.from({length:48},()=>{const s=new Sprite();s.anchor.set(.5);s.visible=false;this.layer.addChild(s);return s;});
    this.auraBack=new Sprite();this.auraBack.zIndex=7;this.auraBack.anchor.set(.5);this.auraBack.blendMode='add';
    this.neonWideLayer=new Container({label:'PrimeOuterRedGlow'});this.neonWideLayer.zIndex=8;
    this.neonWide=new Sprite();this.neonWide.tint=0xff001a;this.neonWide.blendMode='add';this.neonWideLayer.addChild(this.neonWide);
    this.neonWideLayer.filters=[new BlurFilter({strength:12,quality:4,resolution:2})];
    this.neonLayer=new Container({label:'PrimeNeonContour'});this.neonLayer.zIndex=13;
    this.neon=new Sprite();this.neonLayer.addChild(this.neon);
    this.neonRim=new PrimeNeonRim();this.neonLayer.filters=[this.neonRim];
    this.auraFront=new Sprite();this.auraFront.zIndex=12;this.auraFront.anchor.set(.5);
    this.idleAura=new PrimeIdleAura(actor,assets,manifest,engine.reducedMotion);
    actor.view.addChild(this.auraBack,this.neonWideLayer,this.neonLayer,this.auraFront);actor.view.sortChildren();
    actor.fullBodySprite.filters=null;
    this.captureFormation();this.makeIdleTimeline();this.render(0,0);
  }
  get time(){return this.mode==='ambient'?0:this.clock.time;}
  get playing(){return this.mode==='attack'&&!!this.timeline&&!this.timeline.paused()&&this.time<this.plan.duration;}
  captureFormation(){this.start={x:this.actor.baseX,y:this.actor.baseY};}
  register(){this.registration={instance:this.timeline,settle:()=>this.cancel()};this.engine.simpleTimelines.add(this.registration);}
  makeIdleTimeline(){
    this.removeTimeline();this.mode='ambient';this.clock.time=0;
    this.timeline=gsap.timeline({repeat:-1,onUpdate:()=>this.render(0,this.clock.time)})
      .to(this.clock,{time:IDLE_AURA_DURATION,duration:IDLE_AURA_DURATION,ease:'none'});this.register();
  }
  makeTimeline(){
    this.removeTimeline();this.mode='attack';this.clock.time=0;
    this.timeline=gsap.timeline({paused:true,onUpdate:()=>this.render(this.time),onComplete:()=>{
      const finished=this.timeline;
      this.engine.simpleTimelines.delete(this.registration);finished.pause();this.render(this.plan.duration);
      // Sequence advancement is queued by update(); return to living idle
      // only when that callback has not selected the next skill.
      queueMicrotask(()=>{if(!this.destroyed&&this.timeline===finished&&this.mode==='attack'){
        this.makeIdleTimeline();this.render(0,0);
      }});
    }}).to(this.clock,{time:this.plan.duration,duration:this.plan.duration,ease:'none'}).timeScale(this.speed);
    this.registration={instance:this.timeline,settle:()=>this.cancel()};
  }
  removeTimeline(){if(this.registration)this.engine.simpleTimelines.delete(this.registration);this.timeline?.kill();this.timeline=null;this.registration=null;}
  play(){if(this.destroyed)return;if(!this.timeline||this.mode==='ambient')this.makeTimeline();if(this.time>=this.plan.duration)this.seek(0);this.engine.simpleTimelines.add(this.registration);this.timeline.play();this.update(this);}
  pause(){this.timeline?.pause();this.update(this);}
  seek(time){if(this.destroyed)return;if(!this.timeline||this.mode==='ambient')this.makeTimeline();const t=clamp(time,0,this.plan.duration);this.timeline.pause().time(t,true);this.clock.time=t;this.render(t);}
  setSpeed(speed){this.speed=clamp(speed,.25,2);if(this.mode==='attack')this.timeline?.timeScale(this.speed);this.update(this);}
  select(id){const plan=SKILLS.find(s=>s.id===id);if(!plan)throw Error('알 수 없는 기술');this.removeTimeline();this.plan=plan;this.makeIdleTimeline();this.render(0,0);}
  cancel(){if(this.destroyed)return;this.removeTimeline();this.mode='stopped';this.clock.time=0;this.render(0,0);}
  point(actor,part=.48){return this.engine.effectLayer.toLocal(actor.root.toGlobal({x:0,y:-actor.fullBodyHeight*part}));}
  resolvePose(index){const key='motion-user-eight-v2',sheet=this.manifest.sheets[key];return{sheet,key,index,frame:sheet.frames[index]};}
  setClip(sprite,index){
    if(!sprite.primeClip){sprite.primeClip=new Graphics(this.clips[index]);sprite.addChild(sprite.primeClip);}
    sprite.primeClip.context=this.clips[index];sprite.primeClip.visible=true;sprite.mask=sprite.primeClip;
  }
  applyBody(sprite,index){
    const {sheet,key,frame}=this.resolvePose(index);sprite.texture=this.assets[key][index];
    sprite.anchor.set(frame.foot.x/frame.rect.width,frame.foot.y/frame.rect.height);
    sprite.scale.set(this.bodyHeight/sheet.bodyPixels);this.setClip(sprite,index);return frame;
  }
  pose(index){
    const frame=this.applyBody(this.actor.fullBodySprite,index);this.applyBody(this.neon,index);this.applyBody(this.neonWide,index);
    this.neonWide.scale.set(this.neonWide.scale.x*1.055);
    const neutral=this.actor.neutralAvatarPose?.mainSprite,s=this.actor.fullBodySprite;
    if(neutral){neutral.scaleX=s.scale.x;neutral.scaleY=s.scale.y;}
    this.activeSheet='motion-user-eight-v2';return frame;
  }
  destination(hit){
    const {sheet,frame}=this.resolvePose(hit.pose),scale=this.bodyHeight/sheet.bodyPixels;
    const target=this.targets[hit.target%this.targets.length];
    const p=this.actor.root.parent.toLocal(target.root.toGlobal({x:0,y:-target.fullBodyHeight*.48}));
    return{x:p.x-(frame.emitter.x-frame.foot.x)*scale*this.actor.root.scale.x*this.actor.view.scale.x,
      y:p.y-(frame.emitter.y-frame.foot.y)*scale*this.actor.root.scale.y*this.actor.view.scale.y};
  }
  positionFor(time){
    if(this.plan.kind==='tiger'||time<=0||time>=this.plan.duration)return this.start;
    if(this.plan.kind==='cataclysm'){
      const end=this.destination(this.plan.hits[0]),gather={x:this.start.x+100*(this.facing??1),y:this.start.y+190},lift={x:gather.x,y:gather.y-45};
      const path=[{time:0,at:this.start},{time:.25,at:this.start},{time:.65,at:gather},{time:.94,at:lift},{time:1.36,at:lift},
        {time:1.625,at:end},{time:3.5,at:end},{time:4.2,at:this.start}];
      for(let i=1;i<path.length;i++)if(time<=path[i].time){const a=path[i-1],b=path[i];return mix(a.at,b.at,ease((time-a.time)/(b.time-a.time)));}
      return this.start;
    }
    const path=[{time:0,at:this.start},{time:.22,at:this.start}];
    for(const [i,h]of this.plan.hits.entries()){
      const at=this.destination(h);path.push({time:h.time-.055,at},{time:h.time+.065,at});
      if(this.plan.kind==='moonfall'&&i===11)path.push({time:3.3,at});
    }
    const last=path.at(-1);path.push({time:this.plan.duration-.3,at:last.at},{time:this.plan.duration-.06,at:this.start});
    for(let i=1;i<path.length;i++)if(time<=path[i].time){const a=path[i-1],b=path[i];return mix(a.at,b.at,ease((time-a.time)/(b.time-a.time)));}
    return this.start;
  }
  bodyPoint(frame,key){const p=frame[key];return this.engine.effectLayer.toLocal(this.actor.fullBodySprite.toGlobal({x:p.x-frame.foot.x,y:p.y-frame.foot.y}));}
  alloc(){
    const s=this.pool[this.used++];if(!s)throw Error('FX pool limit');s.mask=null;if(s.primeClip)s.primeClip.visible=false;
    s.visible=true;s.alpha=1;s.tint=0xffffff;s.rotation=0;s.anchor.set(.5);s.blendMode='normal';s.fxKey=null;s.fxFrame=null;return s;
  }
  draw(key,index,at,size,alpha=1,rotation=0){
    const s=this.alloc();index=Math.max(0,Math.min(this.assets[key].length-1,index));s.texture=this.assets[key][index];
    s.position.set(at.x,at.y);s.scale.set(size/s.texture.width);s.alpha=clamp(alpha);s.rotation=rotation;s.fxKey=key;s.fxFrame=index;return s;
  }
  echo(time,delay,alpha){
    const past=sample(this.plan,Math.max(0,time-delay));if(past.time<=.22||past.done)return;
    const {sheet,frame}=this.resolvePose(past.pose),s=this.alloc();this.applyBody(s,past.pose);
    const p=this.positionFor(past.time),at=this.engine.effectLayer.toLocal(this.actor.root.parent.toGlobal(p));
    s.position.set(at.x,at.y);const scale=this.bodyHeight/sheet.bodyPixels;
    s.scale.set(scale*this.actor.root.scale.x*this.actor.view.scale.x,scale*this.actor.root.scale.y*this.actor.view.scale.y);
    s.tint=0xff1647;s.alpha=alpha;s.blendMode='add';s.fxKey='sword-afterimage';s.fxFrame=past.pose;
  }
  renderAura(time,frame){
    const index=Math.floor(time*10)%16,scale=this.bodyHeight/this.manifest.sheets['motion-user-eight-v2'].bodyPixels;
    const height=(frame.foot.y-frame.crown.y)*scale;
    const x=(frame.core.x-frame.foot.x)*scale*.45,y=-height*.49;
    for(const [s,offset]of [[this.auraBack,0],[this.auraFront,8]]){
      s.texture=this.assets['fx-blood-mantle-v3'][(index+offset)%16];s.scale.set(height*1.13/s.texture.height);s.position.set(x,y);
    }
    const idleWeight=1-clamp(this.state.time/.24)*clamp((this.plan.duration-this.state.time)/.32);
    const idleX=((frame.crown.x+frame.core.x)/2-frame.foot.x)*scale;
    this.idleAura.render(time,height,idleX,idleWeight);
    const pulse=this.idleAura.pulse;
    const opacity=this.manifest.revision.auraOpacity??1;
    this.auraBack.visible=this.auraFront.visible=idleWeight<1;
    this.auraBack.alpha=(.9+pulse*.1)*opacity*(1-idleWeight);this.auraFront.alpha=(.58+pulse*.08)*opacity*(1-idleWeight);
    this.neon.alpha=1;this.neonLayer.alpha=.88+pulse*.12;
    this.neonWide.alpha=.78+pulse*.22;this.auraFrame=index;
  }
  targetCenter(points){return{x:points.reduce((n,p)=>n+p.x,0)/points.length,y:points.reduce((n,p)=>n+p.y,0)/points.length};}
  renderCataclysm(time,frame,points){
    const grip=this.bodyPoint(frame,'grip'),tip=this.bodyPoint(frame,'emitter'),center=this.targetCenter(points);
    const span=Math.min(this.engine.scene.width*.5,680),impact=1.68;
    if(time>=.24&&time<impact+.08){
      const index=Math.min(7,Math.floor((time-.24)/1.1*8)),fade=time<1.5?1:clamp((impact+.08-time)/.26);
      const blade=this.draw('fx-blood-titanblade-v3',index,grip,span*.49,fade);
      blade.anchor.set(.5,.975);blade.rotation=Math.atan2(tip.y-grip.y,tip.x-grip.x)+Math.PI/2;
    }
    // The source video's gathering streams resolve into the blade before the ground burst.
    if(time>.26&&time<1.25)for(const [i,p]of points.entries()){
      const q=clamp((time-.26-i*.045)/.65),at=mix(p,grip,ease(q));
      this.draw('fx-blood-mooncleave-v3',12+Math.min(3,Math.floor(q*4)),at,span*.34,Math.sin(q*Math.PI)*.65,(i-2)*.36);
    }
    if(time>1.44&&time<1.95){
      const q=clamp((time-1.44)/.51);
      this.draw('fx-blood-mooncleave-v3',4+Math.min(3,Math.floor(q*4)),mix(grip,points[1%points.length],.68),span,Math.sin(q*Math.PI));
    }
    // Separate delayed columns occupy the enemy formation; they do not move the caster.
    const columns=[{at:center,start:impact,size:span},...points.map((p,i)=>({at:p,start:1.91+i*.19,size:span*(i===4?.67:.52)}))];
    for(const c of columns){
      const age=time-c.start;if(age<0||age>1.42)continue;
      const f=Math.min(15,Math.floor(age/1.42*16)),alpha=age>1.16?clamp((1.42-age)/.26):1;
      const plume=this.draw('fx-blood-cataclysm-v3',f,{x:c.at.x,y:c.at.y+82},c.size,alpha);
      plume.anchor.set(.5,.80);
    }
    if(time>.62&&time<1.68)this.engine.parallaxLayers.forEach(p=>p.sprite.tint=0x644252);
    if(time>=impact&&time<3.18)this.engine.parallaxLayers.forEach(p=>p.sprite.tint=0x84536c);
    if(time>.72&&time<1.8)for(let i=2;i>=1;i--)this.echo(time,.1*i,.15-i*.035);
  }
  renderMoonfall(time,frame,points,size){
    const last=this.plan.hits.at(-1),center=this.targetCenter(points);
    for(const [i,h]of this.plan.hits.entries()){
      if(h.heavy)continue;
      const age=time-h.time;if(age<-.12||age>.3)continue;
      const f=(i%2)*4+Math.min(3,Math.floor(clamp((age+.12)/.42)*4));
      const alpha=age<0?.72:clamp(1-age/.3);
      this.draw('fx-blood-mooncleave-v3',f,points[h.target%points.length],size*1.7,alpha);
      if(age>=0)this.draw('fx-blood-echo',8+Math.min(7,Math.floor(age/.3*8)),points[h.target%points.length],size*.65,alpha*.8);
    }
    if(time>.35&&time<last.time+.2)for(let i=5;i>=1;i--)this.echo(time,.055*i,.27-i*.035);
    const span=Math.min(this.engine.scene.width*.76,1040),age=time-last.time;
    const sweepCenter={x:clamp(center.x,span*.56,this.engine.scene.width-span*.56),y:center.y};
    if(age>=-.22&&age<1.03){
      const f=age<0?8:age<.12?9:age<.28?10:age<.44?11:12+Math.min(3,Math.floor((age-.44)/.59*4));
      const alpha=age<0?clamp((age+.22)/.22):age<.5?1:clamp((1.03-age)/.53);
      this.draw('fx-blood-mooncleave-v3',f,sweepCenter,span,alpha,-.12);
      if(age>=.05)for(const [i,p]of points.entries()){
        const q=clamp((age-.05-i*.025)/.65);
        this.draw('fx-blood-cataclysm-v3',8+Math.min(7,Math.floor(q*8)),{x:p.x,y:p.y+28},size*1.05,(1-q)*.8);
      }
    }
    if(time>3.02&&time<last.time)this.engine.parallaxLayers.forEach(p=>p.sprite.tint=0x503544);
    else if(age>=0&&age<.65)this.engine.parallaxLayers.forEach(p=>p.sprite.tint=0xad6881);
  }
  renderSwordHits(time,frame,points,size){
    const tip=this.bodyPoint(frame,'emitter'),grip=this.bodyPoint(frame,'grip');
    for(const [i,h]of this.plan.hits.entries()){
      const age=time-h.time;if(age<-.14||age>.36)continue;
      const impact=points[h.target%points.length],at=age<0?mix(mix(grip,tip,.58),impact,clamp((age+.14)/.14)):impact;
      let f;
      if(this.plan.kind==='frenzy')f=h.group*4+(age<0?Math.min(1,Math.floor((age+.14)/.07)):age<.065?2:3);
      else if(this.plan.kind==='execution')f=h.heavy?8+Math.min(7,Math.floor(Math.max(0,age)*20)):age<0?2+Math.min(1,Math.floor((age+.14)/.07)):4+(i%4);
      else f=age<0?Math.min(7,Math.floor((age+.14)/.14*8)):8+Math.min(7,Math.floor(age/.36*8));
      const alpha=age<0?.72:clamp(1-(age-.07)/.29),power=h.heavy?1.55:this.plan.kind==='dash'?1.1:1;
      this.draw(this.plan.effect,f,at,size*power,alpha,i%2&&this.plan.kind==='echo'?.3:0);
      if(h.heavy&&h.area){
        for(const [j,p]of points.entries())if(j!==h.target)this.draw(this.plan.effect,f,p,size*1.05,alpha*.75,(j-2)*.12);
      }
    }
    const last=this.plan.hits.at(-1);
    if(this.plan.kind==='execution'&&time>last.time+.36&&time<this.plan.phases[4]){
      const q=(time-last.time-.36)/(this.plan.phases[4]-last.time-.36);
      for(const p of points)this.draw(this.plan.effect,12+Math.min(3,Math.floor(q*4)),p,size*1.25,1-q);
    }
  }
  render(time,auraTime=time){
    if(this.destroyed)return;this.used=0;for(const s of this.pool)s.visible=false;
    this.state=sample(this.plan,time);const state=this.state,frame=this.pose(state.pose),position=this.positionFor(time);
    this.actor.root.position.set(position.x,position.y);this.renderAura(auraTime,frame);
    this.targets.forEach((t,i)=>{t.view.position.set(this.targetDefaults[i].x,this.targetDefaults[i].y);t.fullBodySprite.tint=this.targetDefaults[i].tint;});
    this.engine.parallaxLayers.forEach(p=>p.sprite.tint=0xffffff);this.engine.sortCombatDepth();
    const points=this.targets.map(t=>this.point(t,.48)),origin=this.bodyPoint(frame,'emitter');
    const h=this.plan.hits[state.contactIndex>=0?state.contactIndex:0],target=points[h.target%points.length];
    this.contactDistance=Math.hypot(origin.x-target.x,origin.y-target.y);
    if(time<=0||state.done){this.update(this);return;}
    const size=Math.min(this.engine.scene.width*.2,235);
    if(this.plan.kind==='cataclysm'){
      this.renderCataclysm(time,frame,points);
    }else if(this.plan.kind==='moonfall'){
      this.renderMoonfall(time,frame,points,size);
    }else if(this.plan.kind==='tiger'){
      if(time>=.1&&time<2.28){
        const center={x:points.reduce((n,p)=>n+p.x,0)/points.length,y:points.reduce((n,p)=>n+p.y,0)/points.length};
        const sequence=[[.1,0],[.36,1],[.62,2],[.86,3],[1.02,4],[1.23,5],[1.43,6],[1.63,7],[1.82,8],[1.98,9],[2.1,10],[2.2,11]];
        const f=sequence.findLast(p=>time>=p[0])[1],alpha=time<.25?.65+(time-.1)/.15*.35:time>1.9?clamp((2.28-time)/.38):1;
        this.draw('fx-blood-tiger-burst',f,center,Math.min(this.engine.scene.width*.48,560),alpha);
        if(time>=1.02&&time<1.5)for(const p of points)this.draw('fx-blood-echo',8+Math.min(7,Math.floor((time-1.02)*16)),p,size*.65,.65);
      }
    }else{
      if(time>.28&&time<this.plan.hits.at(-1).time+.2)for(let i=3;i>=1;i--)this.echo(time,.065*i,.19-i*.035);
      this.renderSwordHits(time,frame,points,size);
    }
    if(state.strike>0){
      const hit=this.plan.hits[state.contactIndex],units=hit.area?this.targets:[this.targets[hit.target%this.targets.length]];
      for(const t of units){t.fullBodySprite.tint=0xffb2bb;if(!this.engine.reducedMotion)t.view.x+=state.strike*(hit.heavy?8:4);}
      if(hit.heavy)this.engine.parallaxLayers.forEach(p=>p.sprite.tint=0xc5a6b8);
    }
    this.update(this);
  }
  diagnostics(){return{ready:!this.destroyed,skill:this.plan.id,time:this.time,playing:this.playing,speed:this.speed,pose:this.state.pose,
    activeSheet:this.activeSheet,motionSourceSha256:this.manifest.sheets[this.activeSheet].sha256,mode:this.mode,
    effectFrame:this.state.effectFrame,phase:this.state.phase,visibleEffects:this.pool.filter(s=>s.visible).length,
    effectFrames:this.pool.filter(s=>s.visible).map(s=>({key:s.fxKey,frame:s.fxFrame})),auraFrame:this.auraFrame,
    auraVisible:this.idleAura.layer.visible||this.auraFront.visible,
    auraAsset:this.idleAura.layer.visible?this.manifest.revision.idleAura.moon:'fx-blood-mantle-v3',
    idleAura:this.idleAura.diagnostics(),bloodAuraVisible:this.auraFront.visible,auraFrontAlpha:this.auraFront.alpha,
    neonLayers:2,neonInnerAlpha:this.neon.alpha,neonContourAlpha:this.neonLayer.alpha,neonOuterAlpha:this.neonWide.alpha,
    neonRim:'SOURCE_ALPHA_CONTOUR',neonRimWidth:this.neonRim.resources?.rimUniforms?.uniforms?.uWidth??0,neonAboveAura:this.neonLayer.zIndex>this.auraFront.zIndex,
    registeredTimelines:this.registration&&this.engine.simpleTimelines.has(this.registration)?1:0,ownTimelines:this.timeline?1:0,
    regularAllies:this.engine.allies.length,mercenaryInRegularArray:this.engine.allies.includes(this.actor),
    effectLayers:this.engine.effectLayer.children.filter(c=>c.label==='PrimeRequiemBloodFX').length,
    scaleX:this.actor.fullBodySprite.scale.x,scaleY:this.actor.fullBodySprite.scale.y,
    expectedScale:this.bodyHeight/this.manifest.sheets[this.activeSheet].bodyPixels,contactDistance:this.contactDistance,
    rendererResolution:this.engine.app.renderer.resolution,clock:'ONE_V3_REGISTERED_GSAP',damageAuthority:'NONE_VISUAL_PREVIEW'};}
  destroy(){
    if(this.destroyed)return;this.cancel();this.actor.fullBodySprite.mask=null;this.actor.fullBodySprite.primeClip?.destroy({context:false});
    this.layer.destroy({children:true,texture:false,context:false});this.auraBack.destroy();this.auraFront.destroy();this.idleAura.destroy();
    this.neonLayer.destroy({children:true,texture:false,context:false});
    this.neonWideLayer.destroy({children:true,texture:false,context:false});
    this.neonRim.destroy();
    for(const context of this.clips)context.destroy();
    for(const group of Object.values(this.assets))for(const t of group)t.destroy(false);this.destroyed=true;
  }
}
