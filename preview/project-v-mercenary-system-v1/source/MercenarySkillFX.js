import {Container, Sprite, Graphics} from 'pixi.js';
import {gsap} from 'gsap';
import {renderAuthored} from './RenderAuthoredSkill.js';

const clamp = (n, a=0, b=1) => Math.max(a, Math.min(b,n));

// One existing V3 renderer, one registered GSAP clock. No independent animation
// ticker, collision callback, RNG, audio scheduler or live damage calculation.
export class MercenarySkillFX {
  constructor(engine, actors, skill, plan, sequence, auxiliary, onUpdate=()=>{}) {
    if(sequence?.frames?.length!==16)throw new Error('A skill requires its own sixteen-frame authored sequence, not a still image.');
    Object.assign(this, {engine, actors, skill, plan, sequence, auxiliary, onUpdate});
    this.clock={time:0};this.speed=1;this.timeline=null;this.registration=null;this.destroyed=false;
    this.layer=new Container({label:`MercenarySkill:${skill.id}`});this.layer.eventMode='none';
    engine.effectLayer.addChild(this.layer);
    this.lines=new Graphics();this.layer.addChild(this.lines);
    this.ground=new Container({label:`MercenarySkillGround:${skill.id}`});this.ground.depthSortY=-90000;engine.combatLayer.addChild(this.ground);
    this.sprites=[];
    const pool=(n,parent)=>Array.from({length:n},()=>{const s=new Sprite(sequence.frames[0]);s.anchor.set(.5);s.visible=false;parent.addChild(s);this.sprites.push(s);return s});
    this.foreground=pool(engine.mobile?88:124,this.layer);this.groundSprites=pool(24,this.ground);
    this.origins=new Map([...actors].map(([id,a])=>[id,{x:a.baseX,y:a.baseY,rotation:a.root.rotation||0}]));this.lastShake={x:0,y:0};
    this.makeTimeline();this.render(0);
  }
  get time(){return this.clock.time}
  get playing(){return !!this.timeline&&!this.timeline.paused()&&this.time<this.plan.duration}
  makeTimeline(){
    this.removeTimeline();
    this.timeline=gsap.timeline({paused:true,onUpdate:()=>this.render(this.clock.time),onComplete:()=>{
      this.engine.simpleTimelines.delete(this.registration);this.render(this.plan.duration);
    }}).to(this.clock,{time:this.plan.duration,duration:this.plan.duration,ease:'none'}).timeScale(this.speed);
    this.registration={instance:this.timeline,settle:()=>{this.removeTimeline();this.clock.time=0;this.render(0)}};
  }
  removeTimeline(){
    if(this.registration)this.engine.simpleTimelines.delete(this.registration);
    this.timeline?.kill();this.timeline=null;this.registration=null;
  }
  play(){
    if(this.destroyed)return;
    if(!this.timeline)this.makeTimeline();
    if(this.time>=this.plan.duration)this.seek(0);
    this.engine.simpleTimelines.add(this.registration);this.timeline.play();this.onUpdate(this.time,this);
  }
  pause(){this.timeline?.pause();this.onUpdate(this.time,this)}
  seek(time){
    if(this.destroyed)return;
    if(!this.timeline)this.makeTimeline();
    this.timeline.pause().time(clamp(time,0,this.plan.duration),true);this.render(this.clock.time);
  }
  setSpeed(speed){this.speed=clamp(Number(speed)||1,.5,2);this.timeline?.timeScale(this.speed)}
  cancel(){this.removeTimeline();this.clock.time=0;this.render(0)}
  point(id, foot=false){
    const actor=this.actors.get(id);if(!actor)return {x:0,y:0};
    const root=actor.root, height=actor.fullBodyHeight||260;
    return {x:root.x,y:root.y-(foot?0:height*root.scale.y*.54)};
  }
  restore(){
    if((this.lastShake.x||this.lastShake.y)&&this.engine.camera?.base)this.engine.stage.position.set(this.engine.camera.base.x,this.engine.camera.base.y);
    this.lastShake={x:0,y:0};
    for(const [id,actor] of this.actors){const p=this.origins.get(id);actor.root.position.set(p.x,p.y);actor.root.rotation=p.rotation;actor.fullBodySprite.tint=0xffffff;}
  }
  syncFormation(){
    for(const [id,actor] of this.actors){const p=this.origins.get(id);p.x=actor.baseX;p.y=actor.baseY;}
  }
  render(time){renderAuthored(this,time)}
  diagnostics(){return {skillId:this.skill.id,time:this.time,playing:this.playing,speed:this.speed,
    visibleSprites:this.sprites.filter(s=>s.visible).length,ownedTimelines:this.timeline?1:0,
    registeredTimelines:this.registration&&this.engine.simpleTimelines.has(this.registration)?1:0,
    layerChildren:this.layer?.children.length||0,clockOwner:'V3_REGISTERED_GSAP',destroyed:this.destroyed,primaryAnimation:'INDIVIDUAL_AUTHORED_SEQUENCE_V2',totalAuthoredFrames:this.sequence.frames.length,activeFrames:this.activeFrames,poolOverflow:this.poolOverflow};}
  destroy(){if(this.destroyed)return;this.removeTimeline();this.restore();this.layer.destroy({children:true});this.ground.destroy({children:true});this.sprites=[];this.destroyed=true;}
}
