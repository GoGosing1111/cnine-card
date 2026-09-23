import {Assets,Container,Sprite,Graphics,Texture,Rectangle} from 'pixi.js';
import {gsap} from 'gsap';
import {SEQUENCE,ARRIVAL_ORDER,clamp,smooth,flightPoint,rocketState,impactTime,launchTime,impactFrame} from './sequence.mjs';
import origins from '../assets/textures/frame-origins.json' with {type:'json'};

const BASE='/preview/battle-suit-octaseeker-v1/assets/textures/';
const SHARED='/preview/battle-suit-skill-chip-v1/assets/textures/';
export class OctaSeekerFX {
  static async preload() {
    const [flight,impact,...parts]=await Promise.all([
      Assets.load(BASE+'flight-atlas.webp'),Assets.load(BASE+'impact-atlas.webp'),
      ...['smoke','dust','flash','cinder'].map(name=>Assets.load(SHARED+name+'.webp')),
    ]);
    const frames=atlas=>{
      const cell=atlas.width/6;
      if(cell!==atlas.height/4||!Number.isInteger(cell))throw new Error('유도탄 아틀라스 규격 오류');
      return Array.from({length:24},(_,i)=>new Texture({source:atlas.source,
        frame:new Rectangle(i%6*cell,Math.floor(i/6)*cell,cell,cell)}));
    };
    return {flight:frames(flight),impact:frames(impact),
      ...Object.fromEntries(['smoke','dust','flash','cinder'].map((name,i)=>[name,parts[i]]))};
  }
  constructor(engine,textures,onUpdate=()=>{},{serverDriven=false}={}) {
    this.engine=engine;this.textures=textures;this.onUpdate=onUpdate;
    this.serverDriven=serverDriven;this.confirmedImpacts=new Map();this.scheduledImpacts=new Map();
    this.clock={time:0};this.speed=1;this.shake=true;this.destroyed=false;this.key='octaseeker';
    this.ground=new Container({label:'OctaSeekerPreviewGround'});this.ground.depthSortY=-90000;
    this.front=new Container({label:'OctaSeekerPreviewFX'});
    engine.combatLayer.addChild(this.ground);engine.effectLayer.addChild(this.front);
    this.sprites=[];
    const sprite=(texture,parent=this.front)=>{
      const s=new Sprite(texture);s.anchor.set(.5);s.visible=false;parent.addChild(s);this.sprites.push(s);return s;
    };
    this.trails=new Graphics({label:'EightHomingContrails'});this.front.addChild(this.trails);
    this.rockets=Array.from({length:8},()=>({body:sprite(textures.flight[0]),
      smoke:Array.from({length:engine.mobile?18:26},()=>sprite(textures.smoke))}));
    this.blasts=Array.from({length:8},()=>({first:sprite(textures.impact[0]),second:sprite(textures.impact[0]),
      light:sprite(textures.flash,this.ground),flash:sprite(textures.flash),dust:sprite(textures.dust,this.ground)}));
    this.launch=sprite(textures.flash);this.launch.blendMode='add';
    this.lock=new Graphics({label:'OneTargetLock'});this.ground.addChild(this.lock);
    for(const b of this.blasts){b.light.blendMode='add';b.flash.blendMode='add';}
    this.collisionPoints=new Map();this.lastShake=null;this.bindTarget();
    this.timeline=gsap.timeline({paused:true,onUpdate:()=>{this.render(this.time);this.onUpdate(this.time)},onComplete:()=>this.onUpdate(this.time)});
    this.timeline.to(this.clock,{time:SEQUENCE.duration,duration:SEQUENCE.duration,ease:'none'});
    this.render(0);
  }
  get sequence(){return SEQUENCE}
  get time(){return this.clock.time}
  get playing(){return Boolean(!this.destroyed&&this.timeline&&!this.timeline.paused()&&this.time<SEQUENCE.duration)}
  bindTarget(id) {
    const target=this.engine.enemies.find(e=>(id?e.id===id:true)&&e.battleActive!==false&&e.root.visible);
    this.target=target||null;this.targetId=target?.id;this.castPoints=this.readPoints();this.collisionPoints.clear();
    this.confirmedImpacts.clear();this.scheduledImpacts.clear();
  }
  scheduleImpact(index,time){const rocket=ARRIVAL_ORDER.indexOf(index);if(rocket>=0)this.scheduledImpacts.set(rocket,time)}
  confirmImpact(index,time){
    const rocket=ARRIVAL_ORDER.indexOf(index),target=this.target;
    if(rocket<0||this.confirmedImpacts.has(rocket)||target?.id!==this.targetId||!target?.root.visible)return false;
    const points=this.readPoints()||this.castPoints;if(!points)return false;
    this.collisionPoints.set(rocket,structuredClone(points));this.confirmedImpacts.set(rocket,time);return true;
  }
  readPoints() {
    const target=this.target,unit=this.engine.accountBattleUnit;
    if(!unit||!target||target.id!==this.targetId||target.battleActive===false||!target.root.visible)return null;
    if(this.serverDriven&&Number.isFinite(target.hp)&&target.hp<=0)return null;
    const {x,y}=target.root;
    return {source:{...unit.muzzlePoint()},hit:{x,y:y-62},blast:{x,y}};
  }
  play(){if(this.destroyed)return;if(this.time>=SEQUENCE.duration)this.seek(0);this.timeline.play();this.onUpdate(this.time)}
  pause(){if(this.destroyed)return;this.timeline.pause();this.restoreShake();this.onUpdate(this.time)}
  seek(time){
    if(this.destroyed)return;
    const next=clamp(time,0,SEQUENCE.duration);
    if(next<this.time){this.collisionPoints.clear();this.confirmedImpacts.clear();this.scheduledImpacts.clear();}
    if(next===0)this.castPoints=this.readPoints();
    this.timeline.pause().time(next,true);this.render(this.clock.time);this.onUpdate(this.time);
  }
  setSpeed(speed){this.speed=clamp(speed,.25,2);this.timeline?.timeScale(this.speed)}
  select(key){if(key!=='octaseeker')throw new Error('알 수 없는 검수 스킬');this.seek(0)}
  sized(s,w,h=w){s.width=w;s.height=h}
  render(time) {
    if(this.destroyed)return;
    for(const s of this.sprites)s.visible=false;
    this.trails.clear();this.lock.clear();this.restoreShake();
    const live=this.readPoints();
    // Never reacquire a different enemy if the original dies or a pooled actor is rebound.
    const points=live?{...live,source:this.castPoints?.source||live.source}:this.castPoints;
    if(!points)return;
    const scale=this.engine.mobile?.86:1;
    if(live&&time>0&&time<SEQUENCE.impacts.at(-1)+.15){
      const a=.34*(1-smooth((time-1.35)/.24));
      this.lock.ellipse(points.blast.x,points.blast.y,42*scale,14*scale).stroke({width:2,color:0xffa941,alpha:a});
      for(const dx of [-1,1])this.lock.moveTo(points.blast.x+dx*48*scale,points.blast.y)
        .lineTo(points.blast.x+dx*59*scale,points.blast.y).stroke({width:2,color:0xffc16b,alpha:a});
    }
    if(live&&time>=SEQUENCE.release&&time<.28){
      this.launch.visible=true;this.launch.position.set(points.source.x,points.source.y);
      this.sized(this.launch,98*scale,72*scale);this.launch.alpha=.5*(1-smooth((time-SEQUENCE.release)/.16));
    }
    let shake=0;
    this.rockets.forEach((rocket,i)=>{
      const end=impactTime(i),start=launchTime(i),confirmed=this.confirmedImpacts.get(i);
      const scheduled=this.scheduledImpacts.get(i)??end;
      // The server's collision lane may wait for a card/QTE. Stretch flight to
      // that presentation time; only confirmImpact can ignite a live explosion.
      const flightTime=this.serverDriven?Math.min(end-.0001,start+Math.max(0,time-start)*(end-start)/Math.max(.001,scheduled-start)):time;
      const state=live&&confirmed===undefined&&time>=start?rocketState(i,flightTime,points):null;
      if(state){
        const s=rocket.body;s.visible=true;s.texture=this.textures.flight[state.frame];
        const pivot=origins.flight[state.frame];s.anchor.set(pivot.x,pivot.y);
        s.position.set(state.x,state.y);s.rotation=state.angle;s.alpha=1;this.sized(s,126*scale);
      }
      // Deterministic birth times make pause/reverse seek reconstruct identical trails.
      const frozen=this.collisionPoints.get(i)||points;
      for(let n=0;n<rocket.smoke.length;n++){
        const birth=start+(end-start)*n/(rocket.smoke.length-1),age=(this.serverDriven&&confirmed===undefined?flightTime:time)-birth;
        if(age<0||age>.52||(!live&&!this.collisionPoints.has(i)))continue;
        const p=flightPoint(i,birth,frozen.source,frozen.hit),s=rocket.smoke[n];
        s.visible=true;s.position.set(p.x,p.y-age*22);s.rotation=n*.91+i;
        this.sized(s,(12+age*45)*scale,(10+age*32)*scale);s.alpha=(1-age/.52)*.31;
      }
      // Thin hot core, smoky body supplied by evolving raster frames and trail pool.
      if(live&&time>=start&&confirmed===undefined&&flightTime<end+.18){
        const tailStart=Math.max(start,flightTime-.16),tailEnd=Math.min(flightTime,end);
        for(let n=1;n<=12;n++){
          const a=flightPoint(i,tailStart+(tailEnd-tailStart)*(n-1)/12,points.source,points.hit);
          const b=flightPoint(i,tailStart+(tailEnd-tailStart)*n/12,points.source,points.hit);
          const alpha=(n/12)*.6*(1-clamp((flightTime-end)/.18));
          this.trails.moveTo(a.x,a.y).lineTo(b.x,b.y).stroke({width:(2+n*.3)*scale,color:0xff8229,alpha});
        }
      }
      if(this.serverDriven&&confirmed===undefined)return;
      const age=time-(confirmed??end),frame=impactFrame(age);
      if(!frame)return;
      if(!this.collisionPoints.has(i)&&live)this.collisionPoints.set(i,structuredClone(points));
      const collision=this.collisionPoints.get(i);if(!collision)return;
      const b=this.blasts[i],{x,y}=collision.blast;
      // All eight share the target sole; this is not eight different damage targets.
      const size=(i===4?290:220)*scale;
      for(const [sprite,index] of [[b.first,frame.index],[b.second,frame.next]]){
        sprite.visible=true;sprite.texture=this.textures.impact[index];
        sprite.anchor.set(origins.impact[index].x,origins.impact[index].y);sprite.position.set(x,y);this.sized(sprite,size);
      }
      b.first.alpha=frame.alpha*.72;b.second.alpha=frame.alpha*frame.blend*.72;
      if(age<.28){b.light.visible=true;b.light.position.set(x,y);this.sized(b.light,245*scale,67*scale);b.light.alpha=Math.exp(-age*12)*.11;}
      if(age<.065){b.flash.visible=true;b.flash.position.set(x,y-48*scale);this.sized(b.flash,80*scale,95*scale);b.flash.alpha=(1-age/.065)*.28;}
      if(age<.45){b.dust.visible=true;b.dust.position.set(x,y);const p=smooth(age/.45);this.sized(b.dust,(70+155*p)*scale,(18+35*p)*scale);b.dust.alpha=(1-p)*.14;}
      shake+=age<.11?Math.exp(-age*23)*1.5:0;
    });
    if(this.shake&&this.playing&&shake){
      this.lastShake={x:Math.sin(time*89)*Math.min(3,shake),y:Math.cos(time*107)*Math.min(2,shake*.55)};
      this.engine.stage.x+=this.lastShake.x;this.engine.stage.y+=this.lastShake.y;
    }
  }
  restoreShake(){if(this.lastShake)this.engine.stage.position.set(this.engine.camera.base.x,this.engine.camera.base.y);this.lastShake=null}
  diagnostics(){return {key:this.key,time:this.time,playing:this.playing,targetId:this.targetId,targetCount:this.target?1:0,
    rocketCount:8,activeRockets:this.rockets.filter(r=>r.body.visible).length,impacts:this.collisionPoints.size,
    sprites:this.sprites.length,visible:this.sprites.filter(s=>s.visible).length,ownedTimelines:this.timeline?1:0,
    groundChildren:this.ground.children.length,foregroundChildren:this.front.children.length}}
  destroy(){if(this.destroyed)return;this.timeline?.kill();this.timeline=null;this.restoreShake();
    this.ground.destroy({children:true});this.front.destroy({children:true});this.sprites=[];this.destroyed=true;}
}
