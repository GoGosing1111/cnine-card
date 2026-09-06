import {Assets,Container,Sprite,Texture,Rectangle} from 'pixi.js';
import {gsap} from 'gsap';
import {SEQUENCES,clamp,mix,smooth,explosionFrame} from './sequence.js';
import frameOrigins from '../assets/textures/explosion-origins.json' with {type:'json'};

const BASE='/preview/battle-suit-skill-chip-v1/assets/';
const names=['helicopter','rotor','rocket','exhaust','smoke','dust','cinder','flash'];
const ROCKET_IMPACT_OFFSET_Y=30; // V3 world units; keep muzzle and ground anchors unchanged.

export class SkillChipFX{
  static async preload(){
    const [atlas,...parts]=await Promise.all([Assets.load(`${BASE}textures/explosion-atlas.webp`),...names.map(name=>Assets.load(`${BASE}textures/${name}.webp`))]);
    const w=atlas.width/6,h=atlas.height/4;
    if(w!==h||!Number.isInteger(w))throw new Error('폭발 아틀라스 격자 규격 오류');
    return {atlas,frames:Array.from({length:24},(_,i)=>new Texture({source:atlas.source,frame:new Rectangle(i%6*w,Math.floor(i/6)*h,w,h)})),...Object.fromEntries(names.map((name,i)=>[name,parts[i]]))};
  }
  constructor(engine,textures,onUpdate=()=>{}){
    this.engine=engine;this.textures=textures;this.onUpdate=onUpdate;this.clock={time:0};this.key='airstrike';this.speed=1;this.shake=true;this.timeline=null;this.destroyed=false;
    this.ground=new Container({label:'SkillChipPreviewGround'});this.ground.depthSortY=-90000;engine.combatLayer.addChild(this.ground);
    this.front=new Container({label:'SkillChipPreviewFX'});engine.effectLayer.addChild(this.front);
    this.sprites=[];
    const sprite=(texture,parent=this.front)=>{const s=new Sprite(texture);s.anchor.set(.5);s.visible=false;parent.addChild(s);this.sprites.push(s);return s;};
    this.heli=sprite(textures.helicopter,this.ground);this.heli.tint=0x000000;
    this.rotor=sprite(textures.rotor,this.ground);this.rotor.tint=0x000000;
    this.rocket=sprite(textures.rocket);this.exhaust=sprite(textures.exhaust);this.exhaust.anchor.set(1,.5);this.exhaust.blendMode='add';
    this.launch=sprite(textures.flash);this.launch.blendMode='add';
    this.trail=Array.from({length:14},()=>sprite(textures.smoke));
    this.blasts=Array.from({length:4},()=>({
      first:sprite(textures.frames[0]),second:sprite(textures.frames[0]),
      dust:sprite(textures.dust,this.ground),light:sprite(textures.flash,this.ground),flash:sprite(textures.flash),
      cinders:Array.from({length:engine.mobile?12:20},()=>sprite(textures.cinder))
    }));
    for(const b of this.blasts){b.first.anchor.set(.5,.89);b.second.anchor.set(.5,.89);b.flash.blendMode='add';b.light.blendMode='add';for(const p of b.cinders)p.blendMode='add';}
    this.lastShake={x:0,y:0};this.makeTimeline();this.render(0);
  }
  get sequence(){return SEQUENCES[this.key]}
  get time(){return this.clock.time}
  get playing(){return Boolean(this.timeline&&!this.timeline.paused()&&this.time<this.sequence.duration)}
  makeTimeline(){
    this.timeline?.kill();this.clock.time=0;
    this.timeline=gsap.timeline({paused:true,onUpdate:()=>{this.render(this.clock.time);this.onUpdate(this.clock.time)},onComplete:()=>this.onUpdate(this.clock.time)});
    this.timeline.to(this.clock,{time:this.sequence.duration,duration:this.sequence.duration,ease:'none'}).timeScale(this.speed);
  }
  select(key){if(!SEQUENCES[key])throw new Error('알 수 없는 스킬');this.key=key;this.makeTimeline();this.render(0);this.onUpdate(0)}
  play(){if(this.destroyed)return;if(this.time>=this.sequence.duration)this.seek(0);this.timeline.play();this.onUpdate(this.time)}
  pause(){this.timeline.pause();this.render(this.time);this.onUpdate(this.time)}
  seek(time){this.timeline.pause().time(clamp(time,0,this.sequence.duration),true);this.render(this.clock.time);this.onUpdate(this.clock.time)}
  setSpeed(speed){this.speed=clamp(speed,.25,2);this.timeline.timeScale(this.speed)}
  getPoints(){
    const unit=this.engine.accountBattleUnit;const target=this.engine.enemies.find(x=>x.battleActive!==false&&x.root.visible);
    const root=target?.root;if(!unit||!root)return null;
    // Both layers share the original V3 stage; no screen-space guesses or new formation.
    const source=unit.muzzlePoint();const impactOffsetY=this.key==='missile'?ROCKET_IMPACT_OFFSET_Y:0;
    return {source,foot:{x:root.x,y:root.y-14},hit:{x:root.x,y:root.y-92+impactOffsetY}};
  }
  sized(sprite,width,height=width){sprite.width=width;sprite.height=height;return sprite}
  render(time){
    if(this.destroyed)return;
    for(const s of this.sprites)s.visible=false;
    this.restoreShake();
    const points=this.getPoints();if(!points)return;
    const seq=this.sequence;const unitScale=this.engine.mobile?.78:1;
    let shake=0;
    if(this.key==='airstrike'){
      const p=clamp((time-.06)/1.3);const opacity=smooth(p/.12)*(1-smooth((p-.73)/.27));
      if(opacity>0&&time<1.38){
        const x=mix(points.foot.x-530,points.foot.x+560,p),y=mix(points.foot.y-330,points.foot.y+175,p);
        this.heli.visible=this.rotor.visible=true;this.heli.position.set(x,y);this.heli.rotation=.36;this.heli.alpha=opacity*.54;
        this.sized(this.heli,520*unitScale,222*unitScale);
        this.rotor.position.set(x-35*unitScale,y-12*unitScale);this.rotor.rotation=time*35;this.rotor.alpha=opacity*.36;this.sized(this.rotor,440*unitScale,260*unitScale);
      }
    }else{
      const start=seq.release,end=seq.flightEnd;const p=clamp((time-start)/(end-start));
      const angle=Math.atan2(points.hit.y-points.source.y,points.hit.x-points.source.x);
      const x=mix(points.source.x,points.hit.x,p),y=mix(points.source.y,points.hit.y,p);
      if(time>=start&&time<end){
        this.rocket.visible=this.exhaust.visible=true;this.rocket.position.set(x,y);this.rocket.rotation=angle;this.sized(this.rocket,70*unitScale,18*unitScale);
        this.exhaust.position.set(x-Math.cos(angle)*25*unitScale,y-Math.sin(angle)*25*unitScale);this.exhaust.rotation=angle;this.exhaust.alpha=.8;this.sized(this.exhaust,(90+Math.sin(time*111)*8)*unitScale,28*unitScale);
      }
      if(time>=start&&time<start+.11){this.launch.visible=true;this.launch.position.set(points.source.x,points.source.y);this.launch.alpha=(1-(time-start)/.11)*.75;this.sized(this.launch,90*unitScale,62*unitScale)}
      for(let i=0;i<this.trail.length;i++){
        const birth=start+i/(this.trail.length-1)*(end-start);const age=time-birth;
        if(age<0||age>.55)continue;
        const q=i/(this.trail.length-1),s=this.trail[i];s.visible=true;s.position.set(mix(points.source.x,points.hit.x,q),mix(points.source.y,points.hit.y,q)-age*22);
        this.sized(s,(18+age*40)*unitScale,(13+age*28)*unitScale);s.rotation=i*.71;s.alpha=(1-age/.55)*.32;
      }
    }
    const offsets=this.key==='airstrike'?[[-130,-76],[22,-18],[158,52],[-30,87]]:[[0,0]];
    seq.impacts.forEach((at,i)=>{
      const age=time-at;const f=explosionFrame(age,seq.life);if(!f)return;
      const b=this.blasts[i],point=this.key==='missile'?points.hit:points.foot;
      const x=point.x+offsets[i][0]*unitScale,y=point.y+offsets[i][1]*unitScale;
      const size=(this.key==='airstrike'?365:390)*unitScale;
      b.first.texture=this.textures.frames[f.index];b.second.texture=this.textures.frames[f.next];
      b.first.anchor.set(.5,frameOrigins[f.index].y);b.second.anchor.set(.5,frameOrigins[f.next].y);
      for(const s of [b.first,b.second]){s.visible=true;s.position.set(x,y);this.sized(s,size,size);}
      // Keep the current fire/smoke density underneath the incoming frame.
      // Fading both straight-alpha sprites would make the impact artificially
      // see-through at every frame midpoint.
      b.first.alpha=f.alpha;b.second.alpha=f.alpha*f.blend;
      const groundY=this.key==='missile'?points.foot.y:y;
      if(age<.78){b.dust.visible=true;b.dust.position.set(x,groundY);const p=smooth(age/.78);this.sized(b.dust,(110+280*p)*unitScale,(40+83*p)*unitScale);b.dust.alpha=(1-p)*.5;}
      if(age<.45){b.light.visible=true;b.light.position.set(x,groundY);this.sized(b.light,size*1.45,size*.42);b.light.alpha=Math.exp(-age*7)*.35;}
      if(age<.14){b.flash.visible=true;b.flash.position.set(x,y-20*unitScale);const peak=1-smooth(age/.14);this.sized(b.flash,(150+age*900)*unitScale,(130+age*700)*unitScale);b.flash.alpha=peak*.85;}
      b.cinders.forEach((s,n)=>{
        const delay=(n%4)*.012,a=age-delay,life=.45+(n%7)*.09;if(a<0||a>life)return;
        const theta=(n*2.399963229728653+i*.63);const v=80+(n%9)*18;const outward=Math.cos(theta)*v;
        s.visible=true;s.position.set(x+outward*a,y-18*unitScale-(90+Math.abs(Math.sin(theta))*v)*a+220*a*a);
        const scale=(3+n%4)*unitScale;this.sized(s,scale,scale*1.65);s.rotation=theta+a*6;s.alpha=(1-a/life)*.88;
      });
      shake+=age<.23?Math.exp(-age*17)*4.5:0;
    });
    // Offset only this preview's camera container, never the account actor or card dock.
    if(this.shake&&this.playing&&shake>0){
      this.lastShake={x:Math.sin(time*89)*shake,y:Math.cos(time*107)*shake*.55};
      this.engine.stage.x+=this.lastShake.x;this.engine.stage.y+=this.lastShake.y;
    }
  }
  restoreShake(){
    if(this.lastShake&&(this.lastShake.x||this.lastShake.y)){
      // Resize can reset the production camera before this preview's handler.
      // Restoring the canonical base (not subtracting a stale delta) avoids drift.
      this.engine.stage.position.set(this.engine.camera.base.x,this.engine.camera.base.y);
    }
    this.lastShake={x:0,y:0};
  }
  diagnostics(){return {key:this.key,time:this.time,playing:this.playing,sprites:this.sprites.length,visible:this.sprites.filter(s=>s.visible).length,ownedTimelines:this.timeline?1:0,groundChildren:this.ground.children.length,foregroundChildren:this.front.children.length}}
  destroy(){if(this.destroyed)return;this.timeline?.kill();this.timeline=null;this.restoreShake();this.ground.destroy({children:true});this.front.destroy({children:true});this.sprites=[];this.destroyed=true}
}
