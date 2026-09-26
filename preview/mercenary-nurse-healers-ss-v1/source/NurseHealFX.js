import {Assets,Container,Sprite,Texture,Rectangle,Graphics} from 'pixi.js';
import {gsap} from 'gsap';
import {NURSE_SKILL,sampleNurseSkill} from '../skill.mjs';

export async function loadHealSequence(manifest){
 const atlas=await Assets.load('/'+manifest.skill.atlas),cell=manifest.skill.cellSize;
 if(atlas.width!==cell*4||atlas.height!==cell*4)throw Error('회복 아틀라스 크기가 일치하지 않습니다.');
 return {atlas,frames:Array.from({length:16},(_,i)=>new Texture({source:atlas.source,frame:new Rectangle((i%4)*cell,Math.floor(i/4)*cell,cell,cell)}))};
}

export class NurseHealFX{
 constructor(engine,merc,targets,sequence,onUpdate){
  Object.assign(this,{engine,merc,targets,sequence,onUpdate,speed:1,destroyed:false});
  this.clock={time:0};this.layer=new Container({label:'NurseWhiteOath'});this.layer.eventMode='none';engine.effectLayer.addChild(this.layer);
  this.ground=new Container({label:'NurseWhiteOathGround'});this.ground.depthSortY=-90000;engine.combatLayer.addChild(this.ground);
  this.groundLight=new Graphics();this.ground.addChild(this.groundLight);
  this.pairs=[merc,...targets].map(()=>Array.from({length:2},()=>{const s=new Sprite(sequence.frames[0]);s.anchor.set(.5,.62);s.visible=false;this.layer.addChild(s);return s}));
  this.makeTimeline();this.render(0);
 }
 get time(){return this.clock.time}
 get playing(){return !!this.timeline&&!this.timeline.paused()&&this.time<NURSE_SKILL.duration}
 makeTimeline(){
  this.removeTimeline();
  this.timeline=gsap.timeline({paused:true,onUpdate:()=>this.render(this.clock.time),onComplete:()=>{this.engine.simpleTimelines.delete(this.registration);this.render(NURSE_SKILL.duration)}})
   .to(this.clock,{time:NURSE_SKILL.duration,duration:NURSE_SKILL.duration,ease:'none'}).timeScale(this.speed);
  this.registration={instance:this.timeline,settle:()=>this.cancel()};
 }
 removeTimeline(){if(this.registration)this.engine.simpleTimelines.delete(this.registration);this.timeline?.kill();this.timeline=null;this.registration=null;}
 play(){if(this.destroyed)return;if(!this.timeline)this.makeTimeline();if(this.time>=NURSE_SKILL.duration)this.seek(0);this.engine.simpleTimelines.add(this.registration);this.timeline.play();this.onUpdate(this);}
 pause(){this.timeline?.pause();this.onUpdate(this);}
 seek(time){if(this.destroyed)return;if(!this.timeline)this.makeTimeline();this.timeline.pause().time(Math.max(0,Math.min(NURSE_SKILL.duration,Number(time)||0)),true);this.render(this.clock.time);}
 setSpeed(speed){this.speed=Math.max(.25,Math.min(2,Number(speed)||1));this.timeline?.timeScale(this.speed);this.onUpdate(this);}
 cancel(){if(this.destroyed)return;this.removeTimeline();this.clock.time=0;this.render(0);}
 render(time){
  if(this.destroyed)return;this.clock.time=time;this.sample=sampleNurseSkill(time);this.groundLight.clear();this.contacts=[];
  for(const [i,actor]of [this.merc,...this.targets].entries()){
   const pair=this.pairs[i],height=actor.fullBodyHeight||260;
   const p=this.layer.toLocal(actor.root.toGlobal({x:0,y:-height*.2}));
   const foot=this.ground.toLocal(actor.root.toGlobal({x:0,y:0}));
   this.contacts.push({x:p.x,y:p.y});
   const show=this.sample.visible&&actor.root.visible!==false;
   pair.forEach(s=>s.visible=show);if(!show)continue;
   const size=Math.min(this.engine.mobile?145:180,height*actor.root.scale.y);
   for(let j=0;j<2;j++){
    const s=pair[j];s.texture=this.sequence.frames[j?this.sample.next:this.sample.index];s.position.copyFrom(p);s.width=s.height=size;
    s.alpha=this.sample.alpha*(j?this.sample.blend:1);
   }
   // Secondary ground light only; the primary recovery changes authored texture every frame.
   const glow=Math.max(0,1-Math.abs(time-NURSE_SKILL.contactAt)/.7)*.2;
   if(glow)this.groundLight.ellipse(foot.x,foot.y,size*.24,size*.075).fill({color:0x9fffe0,alpha:glow});
  }
  this.onUpdate(this);
 }
 diagnostics(){return {ready:!this.destroyed,skillId:NURSE_SKILL.id,time:this.time,speed:this.speed,playing:this.playing,phase:this.sample?.phase,
  activeFrame:this.sample?.index,blend:this.sample?.blend,visibleSprites:this.pairs.flat().filter(s=>s.visible).length,
  ownedTimelines:this.timeline?1:0,registeredTimelines:this.registration&&this.engine.simpleTimelines.has(this.registration)?1:0,
  clockOwner:'V3_REGISTERED_GSAP',frameCount:16,targetCount:this.targets.length,contacts:this.contacts,
  regularCards:this.engine.allies.length,mercenaryInRegularArray:this.engine.allies.includes(this.merc),destroyed:this.destroyed};}
 destroy(){if(this.destroyed)return;this.removeTimeline();this.layer.destroy({children:true});this.ground.destroy({children:true});this.destroyed=true;this.pairs=[];}
}
