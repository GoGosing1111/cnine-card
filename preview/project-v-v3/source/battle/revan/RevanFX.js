import {Assets,Container,Sprite,Texture,Rectangle,Graphics} from 'pixi.js';
import {gsap} from 'gsap';
import {SKILLS,clamp,lerp,sampleSkill,smooth,weaponBehindBody} from './skill.mjs';
import {AtlasEdgeFilter} from './AtlasEdgeFilter.js';
export const ROOT='/assets/ui/project-v/mercenaries/revan-20261027/';
export async function loadRevanAssets(manifest){
 const poses={},effects={};
 async function frames(spec){const atlas=await Assets.load(ROOT+spec.file);return spec.frames.map(f=>new Texture({source:atlas.source,frame:new Rectangle(f.rect.x,f.rect.y,f.rect.width,f.rect.height)}));}
 await Promise.all(Object.entries(manifest.poses).map(async([k,v])=>{poses[k]=await frames(v)}));
 await Promise.all(Object.entries(manifest.effects).map(async([k,v])=>{effects[k]=await frames(v)}));
 return {poses,effects,weapon:await Assets.load(ROOT+manifest.weapon.file)};
}
export class RevanFX{
 constructor(engine,merc,targets,assets,manifest,onUpdate=()=>{}){
  Object.assign(this,{engine,merc,targets,assets,manifest,onUpdate});this.clock={time:0};this.speed=2;this.auraEnabled=true;this.fxEnabled=true;this.reducedMotion=false;this.mode='idle';this.destroyed=false;
  this.layer=new Container({label:'Revan authored skill FX',sortableChildren:true});engine.effectLayer.addChild(this.layer);
  this.edgeFilter=new AtlasEdgeFilter();
  this.pool=Array.from({length:56},()=>{const s=new Sprite();s.visible=false;s.filters=[this.edgeFilter];this.layer.addChild(s);return s});
  this.weapon=new Sprite(assets.weapon);this.weapon.label='Revan fixed original greatsword';this.weapon.zIndex=11.2;merc.view.addChild(this.weapon);
  // Reuse the exact authored glove pixels above the grip. The blade remains
  // in front of the torso and bent knee instead of disappearing behind them.
  this.gripOverlay=new Sprite();this.gripOverlay.label='Revan foreground gripping fingers';this.gripOverlay.zIndex=11.4;merc.view.addChild(this.gripOverlay);
  this.gripMask=new Graphics();this.gripMask.zIndex=11.5;merc.view.addChild(this.gripMask);this.gripOverlay.mask=this.gripMask;
  this.auraRear=[0,1].map(()=>{const s=new Sprite();s.zIndex=3;merc.view.addChild(s);return s});
  this.auraFront=[0,1].map(()=>{const s=new Sprite();s.zIndex=12;merc.view.addChild(s);return s});
  this.bladeAura=[0,1].map(()=>{const s=new Sprite();s.zIndex=10.4;merc.view.addChild(s);return s});
  for(const s of [...this.auraRear,...this.auraFront,...this.bladeAura])s.filters=[this.edgeFilter];
  this.flash=new Sprite(Texture.WHITE);this.flash.tint=0xf51730;this.flash.alpha=0;this.flash.zIndex=200;this.layer.addChild(this.flash);
  this.merc.fullBodySprite.zIndex=11;merc.view.sortChildren();
  for(const a of [merc]){a.animationAdapter?.kill?.();a.animationController?.kill?.();}
  this.setMode('idle');
 }
 get plan(){return SKILLS[this.mode]}
 get time(){return this.clock.time}
 get playing(){return !!this.timeline&&!this.timeline.paused()&&!this.destroyed&&(this.mode==='idle'||this.time<this.plan.duration-.001)}
 clearTimeline(){if(this.registration)this.engine.simpleTimelines.delete(this.registration);this.timeline?.kill();this.timeline=null;this.registration=null}
 setMode(mode){if(!SKILLS[mode]||this.destroyed)return;this.clearTimeline();this.mode=mode;this.clock.time=0;
  this.timeline=gsap.timeline({paused:true,repeat:mode==='idle'?-1:0,onUpdate:()=>this.render(this.clock.time),onComplete:()=>{this.engine.simpleTimelines.delete(this.registration);this.render(this.plan.duration);this.onComplete?.();}})
   .to(this.clock,{time:this.plan.duration,duration:this.plan.duration,ease:'none'}).timeScale(this.speed);
  this.registration={instance:this.timeline,settle:()=>this.cancel()};this.render(0);
 }
 play(){if(this.destroyed)return;if(!this.timeline)this.setMode(this.mode);if(this.time>=this.plan.duration&&this.mode!=='idle')this.seek(0);this.engine.simpleTimelines.add(this.registration);this.timeline.play();this.onUpdate(this)}
 pause(){this.timeline?.pause();this.onUpdate(this)}
 seek(t){if(this.destroyed)return;if(!this.timeline)this.setMode(this.mode);t=clamp(Number(t)||0,0,this.plan.duration);this.timeline.pause().time(t,true);this.clock.time=t;this.render(t)}
 setSpeed(v){this.speed=clamp(Number(v)||1,.25,2);this.timeline?.timeScale(this.speed);this.onUpdate(this)}
 cancel(){this.clearTimeline();this.clock.time=0;this.render(0);this.onCancel?.();this.onUpdate(this)}
 setAura(v){this.auraEnabled=!!v;this.render(this.time)}
 setEffects(v){this.fxEnabled=!!v;this.render(this.time)}
 setReducedMotion(v){this.reducedMotion=!!v;this.render(this.time)}
 pair(sprites,textures,phase,{x=0,y=0,height=500,alpha=1,anchorX=.5,anchorY=1,rotation=0,loop=true}={}){
  const index=Math.floor(phase),mix=phase-index;
  sprites.forEach((s,i)=>{const n=loop?(index+i)%textures.length:Math.min(textures.length-1,index+i);s.texture=textures[Math.max(0,n)];s.anchor.set(anchorX,anchorY);s.scale.set(height/s.texture.height);s.position.set(x,y);s.rotation=rotation;s.alpha=alpha*(i?mix:1-mix);s.visible=s.alpha>.001;});
 }
 applyPose(state){
  const key=state.finished?'idle':this.mode,index=key==='idle'?0:state.frame,spec=this.manifest.poses[key],frame=spec.frames[index],s=this.merc.fullBodySprite;
  const k=this.manifest.sprite.physicalBodyHeight/spec.bodyPixels;
  s.texture=this.assets.poses[key][index];s.anchor.set(frame.foot.x/frame.rect.width,frame.foot.y/frame.rect.height);s.scale.set(k);s.position.set(0,0);s.rotation=0;s.skew.set(0,0);s.alpha=1;s.visible=true;
  const w=this.weapon,ws=this.manifest.weapon;
  const scale=ws.bladeLengthWorld/(ws.tip.x-ws.bladeRoot.x);
  w.anchor.set(ws.grip.x/ws.width,ws.grip.y/ws.height);w.scale.set(scale);w.position.set((frame.grip.x-frame.foot.x)*k,(frame.grip.y-frame.foot.y)*k);w.rotation=frame.weaponAngle;w.visible=true;
  w.zIndex=weaponBehindBody(key,index)?10.5:11.2;this.merc.view.sortChildren();
  const hand=this.gripOverlay;hand.texture=s.texture;hand.anchor.copyFrom(s.anchor);hand.scale.copyFrom(s.scale);hand.position.copyFrom(s.position);hand.rotation=0;hand.alpha=1;hand.visible=true;
  const radius=spec.bodyPixels*.046;
  this.gripMask.clear().ellipse((frame.grip.x-frame.foot.x)*k,(frame.grip.y-frame.foot.y)*k,radius*k,radius*.85*k).fill(0xffffff);
  this.activePose={key,index,scale:k,frame};
  this.merc.view.position.set(state.travel,this.mode==='idle'&&!this.reducedMotion?-Math.sin(state.time*Math.PI/2)*1.8:0);
  this.merc.view.rotation=0;this.merc.view.scale.set(1);
 }
 renderAura(t,state){
  const intensity=this.auraEnabled?1+state.charge*.32:0,phase=(t*6)%12;
  const textures=this.assets.effects.aura;
  this.pair(this.auraRear,textures,phase,{x:-10,y:15,height:545,alpha:.85*intensity});
  this.pair(this.auraFront,textures,(phase+5.4)%12,{x:8,y:5,height:390,alpha:.32*intensity});
  // Same native black/red aura texture also follows the rigid blade. No blade mesh deformation.
  const sword=this.weapon,ws=this.manifest.weapon,k=sword.scale.x;
  const center=(ws.bladeRoot.x+ws.tip.x)/2-ws.grip.x;
  const x=sword.x+Math.cos(sword.rotation)*center*k,y=sword.y+Math.sin(sword.rotation)*center*k;
  this.pair(this.bladeAura,textures,(phase+2)%12,{x,y,height:435,alpha:.48*intensity,anchorY:.5,rotation:sword.rotation+Math.PI/2});
 }
 point(actor){return this.engine.effectLayer.toLocal(actor.root.toGlobal({x:0,y:0}))}
 drawFrame(key,phase,x,y,height,{alpha=1,anchorX=.5,anchorY=1,rotation=0}={}){
  if(phase<0||phase>11||alpha<=0)return;
  const index=Math.floor(phase),mix=phase-index;
  for(let j=0;j<2;j++){
   const s=this.pool[this.used++];if(!s)throw Error('Revan FX pool capacity exceeded');
   s.texture=this.assets.effects[key][Math.min(index+j,11)];s.anchor.set(anchorX,anchorY);s.scale.set(height/s.texture.height);s.position.set(x,y);s.rotation=rotation;s.alpha=alpha*(j?mix:1-mix);s.visible=s.alpha>.001;s.blendMode='normal';
  }
 }
 phase(age,duration){return age>=0&&age<=duration?clamp(age/duration)*11:-1}
 mappedPhase(t,keys){if(t<keys[0][0]||t>keys.at(-1)[0])return -1;for(let i=1;i<keys.length;i++)if(t<=keys[i][0])return lerp(keys[i-1][1],keys[i][1],clamp((t-keys[i-1][0])/(keys[i][0]-keys[i-1][0])));return 11}
 renderEffects(t,state){
  const plan=this.plan,targets=this.targets.map(a=>this.point(a)),a=this.point(this.merc);
  if(!this.fxEnabled||plan.kind==='IDLE')return;
  if(this.mode==='myeol'){
   const age=t-plan.fxAt,phase=this.mappedPhase(t,[[plan.fxAt,0],[1.23,5],[plan.fxAt+plan.fxDuration,11]]),alpha=smooth(age/.12)*(1-smooth((age-plan.fxDuration+.45)/.45));
   const sweep=smooth((t-.86)/.62),center=lerp(1120,1450,sweep);
   this.drawFrame('myeol',phase,center,665,850,{alpha,anchorY:.5});
   this.drawFrame('myeol',this.phase(age-.18,1.65),center-130,690,620,{alpha:alpha*.48,anchorY:.5,rotation:.06});
   this.drawFrame('aura',this.phase(age,1.7),a.x+state.travel,860,610,{alpha:alpha*.6});
   return;
  }
  if(plan.kind==='SINGLE'){
   const age=t-plan.fxAt,phase=this.mode==='danjoe'?this.mappedPhase(t,[[plan.fxAt,0],[.83,5],[plan.fxAt+plan.fxDuration,11]]):this.mappedPhase(t,[[plan.fxAt,0],[.70,4],[1.20,8],[plan.fxAt+plan.fxDuration,11]]),alpha=smooth(age/.10)*(1-smooth((age-plan.fxDuration+.3)/.3));
   if(this.mode==='danjoe'){
    this.drawFrame('danjoe',phase,targets[0].x-140,targets[0].y+20,690,{alpha,anchorX:.62});
    this.drawFrame('danjoe',this.phase(age-.15,plan.fxDuration),targets[0].x-220,targets[0].y+65,520,{alpha:alpha*.4,anchorX:.62,rotation:-.18});
   }else{
    this.drawFrame('heukwol',phase,targets[0].x,targets[0].y+20,755,{alpha});
    this.drawFrame('aura',this.phase(age,plan.fxDuration),targets[0].x-25,targets[0].y+8,520,{alpha:alpha*.4});
   }
  }else{
   const age=t-plan.fxAt,phase=this.mappedPhase(t,[[plan.fxAt,0],[1.66,6],[plan.fxAt+plan.fxDuration,11]]),alpha=smooth(age/.12)*(1-smooth((age-plan.fxDuration+.45)/.45));
   // Distinct local impact blooms travel along the entire enemy line; the large
   // central authored wave and layered ground tears retain their native proportions.
   this.drawFrame('jongeon',phase,1060,878,930,{alpha:alpha*.96});
   for(let i=0;i<3;i++){
    const delay=i*.18,localAge=age-delay;
    const localPhase=this.mappedPhase(t,[[plan.fxAt+delay,0],[plan.contacts[i],6],[plan.fxAt+delay+1.72,11]]);
    this.drawFrame('jongeon',localPhase,targets[i].x,targets[i].y+25,560+i*35,{alpha:alpha*.9});
   }
   this.drawFrame('danjoe',this.phase(age-.22,1.65),1170,820,610,{alpha:alpha*.55,anchorX:.55,rotation:-.1});
   this.drawFrame('aura',this.phase(age,2.15),a.x+state.travel,870,660,{alpha:alpha*.6});
  }
 }
 render(t){
  if(this.destroyed)return;const state=sampleSkill(this.mode,t);this.state=state;this.used=0;
  for(const s of this.pool)s.visible=false;
  this.applyPose(state);this.renderAura(t,state);this.renderEffects(t,state);
  let shake=0;
  this.targets.forEach((target,i)=>{
   const visible=this.plan.kind==='AREA'||i===0;target.root.visible=visible;
   const h=this.plan.kind==='AREA'?state.hits[i]?.strength||0:i===0?Math.max(0,...state.hits.map(h=>h.strength)):0;
   target.view.position.set(h*18,-h*9);target.view.rotation=this.reducedMotion?0:h*.045;target.fullBodySprite.tint=h>.15?0xff7681:0x8e94a1;target.root.alpha=.65+h*.35;
   shake=Math.max(shake,h);
  });
  this.flash.width=1800;this.flash.height=1000;this.flash.position.set(0,0);this.flash.alpha=this.fxEnabled&&!this.reducedMotion?shake*(this.mode==='jongeon'?.07:.035):0;
  // Camera motion is rendered from the same seekable clock. It never drives contacts.
  this.engine.stage.position.set(this.engine.stage.pivot.x+(this.reducedMotion?0:Math.sin(t*145)*shake*5),this.engine.stage.pivot.y+(this.reducedMotion?0:Math.cos(t*117)*shake*3));
  // Seeking must also refresh the canvas when a hidden preview has stopped its ticker.
  if(!this.engine.app.ticker.started||document.hidden)this.engine.app.render();
  this.onUpdate(this);
 }
 diagnostics(){const p=this.activePose,expected=p?this.merc.view.toGlobal({x:(p.frame.grip.x-p.frame.foot.x)*p.scale,y:(p.frame.grip.y-p.frame.foot.y)*p.scale}):{x:0,y:0},actual=this.weapon.toGlobal({x:0,y:0});return {mode:this.mode,time:this.time,playing:this.playing,speed:this.speed,pose:p?.key,frame:p?.index,bodyScale:{x:this.merc.fullBodySprite.scale.x,y:this.merc.fullBodySprite.scale.y},weaponScale:{x:this.weapon.scale.x,y:this.weapon.scale.y},weaponSource:this.manifest.weapon.sha256,weaponAngle:this.weapon.rotation,handError:Math.hypot(expected.x-actual.x,expected.y-actual.y),activeSkillSprites:this.pool.filter(s=>s.visible).length,aura:this.auraEnabled,targets:this.targets.filter(a=>a.root.visible).length,contacts:this.state?.hits.filter(h=>h.age>=0).length,liveTimelines:this.registration&&this.engine.simpleTimelines.has(this.registration)?1:0,destroyed:this.destroyed}}
 destroy(){if(this.destroyed)return;this.clearTimeline();this.destroyed=true;this.layer.destroy({children:true});for(const s of [...this.auraRear,...this.auraFront,...this.bladeAura,this.weapon,this.gripOverlay,this.gripMask])s.destroy();this.edgeFilter.destroy();}
}
