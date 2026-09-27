import {Assets,Container,Sprite,Texture,Rectangle} from 'pixi.js';
import {gsap} from 'gsap';
import {sampleIconSequence} from '../sequence.mjs';

export async function loadIconSequence(effect){
  const url='/preview/icon-battle-assets-v1/'+effect.runtime;
  const texture=await Assets.load(url);
  const frames=Array.from({length:effect.frameCount},(_,i)=>new Texture({source:texture.source,
    frame:new Rectangle((i%effect.columns)*effect.cellSize,Math.floor(i/effect.columns)*effect.cellSize,effect.cellSize,effect.cellSize)}));
  return {url,frames};
}
export async function releaseIconSequence(sequence){
  if(!sequence)return;
  // Frame views belong to this preview; the shared V3 textures never do.
  sequence.frames.forEach(texture=>texture.destroy(false));
  await Assets.unload(sequence.url);
}
export class IconEffectPlayback{
  constructor(engine,{actor,target,effect,sequence},onUpdate=()=>{}){
    Object.assign(this,{engine,actor,target,effect,sequence,onUpdate});
    this.clock={time:0};this.speed=1;this.destroyed=false;
    this.layer=new Container({label:'ICON_PREVIEW_EFFECT',eventMode:'none'});
    this.sprites=[new Sprite(sequence.frames[0]),new Sprite(sequence.frames[0])];
    this.sprites.forEach(sprite=>{sprite.anchor.set(.5);sprite.visible=false;this.layer.addChild(sprite)});
    engine.effectLayer.addChild(this.layer);
    this.makeTimeline();this.render(0);
  }
  get time(){return this.clock.time}
  get playing(){return !!this.timeline&&!this.timeline.paused()&&this.time<this.effect.duration}
  makeTimeline(){
    this.removeTimeline();
    this.timeline=gsap.timeline({paused:true,onUpdate:()=>this.render(this.clock.time),onComplete:()=>{
      this.engine.simpleTimelines.delete(this.registration);this.render(this.effect.duration);
    }}).to(this.clock,{time:this.effect.duration,duration:this.effect.duration,ease:'none'}).timeScale(this.speed);
    this.registration={instance:this.timeline,settle:()=>this.cancel()};
  }
  removeTimeline(){this.engine.simpleTimelines.delete(this.registration);this.timeline?.kill();this.timeline=null;this.registration=null}
  play(){
    if(this.destroyed)return;
    if(!this.timeline)this.makeTimeline();
    if(this.time>=this.effect.duration)this.seek(0);
    this.engine.simpleTimelines.add(this.registration);this.timeline.play();this.onUpdate(this);
  }
  pause(){this.timeline?.pause();this.engine.simpleTimelines.delete(this.registration);this.onUpdate(this)}
  seek(time){
    if(this.destroyed)return;
    if(!this.timeline)this.makeTimeline();
    const t=sampleIconSequence(this.effect,time).time;
    this.timeline.pause().time(t,true);this.engine.simpleTimelines.delete(this.registration);this.clock.time=t;this.render(t);
  }
  setSpeed(speed){this.speed=Math.max(.25,Math.min(2,Number(speed)||1));this.timeline?.timeScale(this.speed);this.onUpdate(this)}
  cancel(){if(this.destroyed)return;this.removeTimeline();this.clock.time=0;this.render(0)}
  render(time){
    if(this.destroyed)return;
    const state=this.sample=sampleIconSequence(this.effect,time);
    const self=['critical-chance','lifesteal'].includes(this.effect.id),subject=self?this.actor:this.target;
    const point=this.engine.effectLayer.toLocal(subject.root.toGlobal({x:0,y:-subject.fullBodyHeight*.54}));
    const size=this.effect.kind==='SKILL'?360:this.effect.kind==='HIT'?205:260;
    this.sprites.forEach((sprite,i)=>{
      sprite.visible=state.visible;sprite.texture=this.sequence.frames[i?state.nextFrame:state.frame];
      sprite.position.set(point.x,point.y);sprite.width=size;sprite.height=size;
      sprite.alpha=i?state.mix:1-state.mix;
    });
    this.onUpdate(this);
  }
  diagnostics(){return {effect:this.effect.id,playing:this.playing,time:this.time,speed:this.speed,...this.sample,
    clock:'GSAP',autoAnimationTicker:false,activeSprites:this.sprites.filter(s=>s.visible).length,
    registered:this.engine.simpleTimelines.has(this.registration),damageCalculated:false,releaseEnabled:false}}
  destroy(){if(this.destroyed)return;this.cancel();this.destroyed=true;this.layer.removeFromParent();this.layer.destroy({children:true,texture:false,textureSource:false})}
}
