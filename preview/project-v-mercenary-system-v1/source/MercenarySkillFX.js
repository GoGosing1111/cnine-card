import {Container, Sprite} from 'pixi.js';
import {gsap} from 'gsap';
import {sampleRehearsal} from '../skill-rehearsal.mjs';

const clamp = (n, a=0, b=1) => Math.max(a, Math.min(b,n));
const mix = (a,b,t) => a+(b-a)*t;
const smooth = n => {const t=clamp(n);return t*t*(3-2*t)};

// One existing V3 renderer, one registered GSAP clock. No independent animation
// ticker, collision callback, RNG, audio scheduler or live damage calculation.
export class MercenarySkillFX {
  constructor(engine, actors, skill, plan, texture, onUpdate=()=>{}) {
    Object.assign(this, {engine, actors, skill, plan, texture, onUpdate});
    this.clock={time:0};this.speed=1;this.timeline=null;this.registration=null;this.destroyed=false;
    this.layer=new Container({label:`MercenarySkill:${skill.id}`});this.layer.eventMode='none';
    engine.effectLayer.addChild(this.layer);
    this.sprites=Array.from({length:18},()=>{const s=new Sprite(texture);s.anchor.set(.5);s.visible=false;this.layer.addChild(s);return s});
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
    const merc=this.actors.get('M');if(merc){merc.root.position.set(merc.baseX,merc.baseY);merc.root.rotation=0;}
    for(const actor of this.actors.values()) {actor.fullBodySprite.tint=0xffffff;}
  }
  render(time){
    if(this.destroyed)return;
    this.restore();for(const s of this.sprites)s.visible=false;let used=0;
    const sample=sampleRehearsal(this.plan,time);
    const activeIds=new Set(sample.actors.map(a=>a.id));
    for(const [id,actor] of this.actors){
      const state=sample.actors.find(a=>a.id===id);
      actor.root.visible=activeIds.has(id);actor.root.alpha=state?.hp>0?1:.22;
      if(state){actor.hp=state.hp/state.maxHp*100;actor.layoutHudBars();actor.setShield(state.shield,Math.max(30,state.shield));}
    }
    const show=(point,size,alpha=1,rotation=0)=>{
      if(used>=this.sprites.length||alpha<=0)return;
      const sprite=this.sprites[used++];sprite.visible=true;sprite.position.set(point.x,point.y);
      sprite.width=sprite.height=size*(this.engine.mobile?.87:1);sprite.alpha=clamp(alpha);sprite.rotation=rotation;
    };
    const target=this.plan.targets[0], v=this.skill.visual, mode=v.motion;
    const source=this.point('M'), hit=this.point(target), reduced=this.engine.reducedMotion;
    const cancelled=this.plan.events.some(e=>e.kind==='CANCEL'&&e.at<=time);
    const fade=(at,life=.75)=>{const age=time-at;return age<0||age>life?0:Math.min(1,age/.06)*(1-smooth((age-life*.55)/(life*.45)))};
    const journey=(at,ids,size=240,travel=.28,life=.5)=>{
      for(const id of ids){const dest=this.point(id),age=time-at;
        if(age>=-travel&&age<0&&!reduced){const p=smooth((age+travel)/travel);show({x:mix(source.x,dest.x,p),y:mix(source.y,dest.y,p)},size*.7,Math.sin(p*Math.PI)*.85,Math.atan2(dest.y-source.y,dest.x-source.x));}
        if(age>=0)show(dest,size,fade(at,life),0);
      }
    };
    const hits=this.plan.events.filter(e=>e.kind==='HIT'&&e.targets[0]!=='M'&&!e.sourceId&&e.at<=time+.45);
    const merc=this.actors.get('M');
    if(['INTERCEPT','INFILTRATE','FRACTURE','INTERRUPT','RIPOSTE'].includes(mode)&&!reduced&&!cancelled){
      const dest=mode==='INTERCEPT'?{x:hit.x-34,y:hit.y+55}: {x:hit.x-67,y:hit.y+60};
      const forward=smooth((time-(v.windup-.15))/.32),back=smooth((time-(mode==='RIPOSTE'?1.45:1.12))/.42),p=forward*(1-back);
      if(merc){merc.root.x=mix(merc.baseX,dest.x,p);merc.root.y=mix(merc.baseY,dest.y,p);}
    }
    if(!cancelled)switch(mode){
      case 'INTERCEPT':
        show({x:hit.x-20,y:hit.y+4},260,fade(.45,1.25),-.08);
        if(this.plan.scenario!=='counter')show(this.point('M'),175,fade(1.05,.7),.1);break;
      case 'PRECISION':
        show(hit,85,.3*smooth(time/.6)*(1-smooth((time-1.4)/.2)));
        hits.forEach(e=>journey(e.at,e.targets,300,.3,.6));break;
      case 'FRACTURE':
        show(hit,100+smooth((time-.6)/.8)*210,fade(.7,1.3),reduced?0:mix(-.22,.18,smooth((time-.7)/1.3)));break;
      case 'CONVERGE':
        hits.forEach((e,i)=>journey(e.at,e.targets,175+i*30,.2,.4));break;
      case 'RELAY':
        this.plan.targets.forEach((id,i)=>{const p=this.point(id);show({x:p.x,y:p.y-25},125,fade(.45+i*.055,1.35),-.2+i*.07)});break;
      case 'INFILTRATE':
        hits.forEach((e,i)=>{if(i===0)journey(e.at,e.targets,270,.38,.5);else show(this.point(e.targets[0]),210,fade(e.at,.7),-.3)});break;
      case 'VEIL': {
        const points=this.plan.targets.map(id=>this.point(id)),p={x:points.reduce((n,p)=>n+p.x,0)/points.length,y:points.reduce((n,p)=>n+p.y,0)/points.length};
        show(p,340,fade(.65,this.plan.scenario==='counter'?1:1.45));break;
      }
      case 'STITCH':
        journey(.8,[target],190,.4,.65);
        show({x:hit.x,y:hit.y-10},180+smooth((time-1.4)/.55)*90,fade(1.45,1.1),reduced?0:(time-1.45)*.13);break;
      case 'RIPOSTE':
        show(this.point('M'),180,.6*fade(.55,.85),-.25);
        if(this.plan.scenario!=='counter')journey(1.4,[target],290,.22,.65);break;
      case 'STILLNESS':
        show(source,135,.5*fade(.15,1.95),-.1);
        hits.forEach(e=>journey(e.at,e.targets,this.plan.scenario==='counter'?210:360,.38,.8));break;
      case 'BARRAGE':
        hits.forEach((e,i)=>{const p=this.point(e.targets[0]);show({x:p.x,y:p.y+12},225,fade(e.at,.48),i%2?-.18:.12)});break;
      case 'BLOOM':
        this.plan.targets.forEach((id,i)=>{const p=this.point(id,true);show({x:p.x,y:p.y-37},210,fade(.65+i*.04,this.plan.scenario==='counter'?.8:1.65),0)});break;
      case 'FINISH':
        hits.forEach(e=>journey(e.at,e.targets,e.amount>=50?300:220,.32,.75));break;
      case 'INTERRUPT':
        journey(.85,[target],this.plan.scenario==='boss'?205:310,.3,.75);break;
      case 'RESTRAIN':
        journey(.95,[target],140,.23,.45);
        if(this.plan.scenario!=='counter')show(hit,245,fade(1.2,1.05),reduced?0:mix(-.4,.05,smooth((time-1.2)/.5)));break;
      case 'DOUBLE_BEAT':
        hits.forEach((e,i)=>journey(e.at,e.targets,i?295:160,i?.35:.2,i?.65:.4));break;
    }
    // Collision emphasis samples the same resolved event time, including seeking.
    // No setTimeout white-flash handle that can outlive pause/cancel.
    for(const e of this.plan.events){
      if(e.kind==='HIT'&&time>=e.at&&time<e.at+.05)for(const id of e.targets){const actor=this.actors.get(id);if(actor)actor.fullBodySprite.tint=Number.parseInt(v.color.slice(1),16);}
    }
    if(time>=this.plan.duration){for(const s of this.sprites)s.visible=false;this.restore();}
    this.onUpdate(time,this,sample);
  }
  diagnostics(){return {skillId:this.skill.id,time:this.time,playing:this.playing,speed:this.speed,
    visibleSprites:this.sprites.filter(s=>s.visible).length,ownedTimelines:this.timeline?1:0,
    registeredTimelines:this.registration&&this.engine.simpleTimelines.has(this.registration)?1:0,
    layerChildren:this.layer?.children.length||0,clockOwner:'V3_REGISTERED_GSAP',destroyed:this.destroyed};}
  destroy(){if(this.destroyed)return;this.removeTimeline();this.restore();this.layer.destroy({children:true});this.sprites=[];this.destroyed=true;}
}
