import {Assets, Container, Graphics, Rectangle, Sprite, Texture} from 'pixi.js';
import {gsap} from 'gsap';
import atlas from './assets/atlases.json' with {type:'json'};
import {SEQUENCE, impactFrame} from './sequence.mjs';

const BASE = '/preview/battle-suit-quantum-bomb-v1/assets/';
const SHARED = '/preview/battle-suit-skill-chip-v1/assets/textures/';
const clamp = value => Math.min(1, Math.max(0, value));

function splitAtlas(texture, layout) {
  const {columns, rows, cell} = layout;
  if (texture.width !== columns * cell || texture.height !== rows * cell) throw Error('양자폭탄 아틀라스 규격 오류');
  return Array.from({length:rows * columns}, (_, i) => new Texture({
    source:texture.source, frame:new Rectangle((i % columns) * cell, Math.floor(i / columns) * cell, cell, cell)
  }));
}

export class QuantumBombFX {
  static async preload() {
    const [flight, impact, flash, dust, smoke, cinder, exhaust] = await Promise.all([
      Assets.load(BASE+'flight.webp'), Assets.load(BASE+'impact.webp'),
      ...['flash','dust','smoke','cinder','exhaust'].map(name=>Assets.load(SHARED+name+'.webp'))
    ]);
    return {flight:splitAtlas(flight,atlas.flight), impact:splitAtlas(impact,atlas.impact), flash, dust, smoke, cinder, exhaust};
  }
  static release(textures) {
    for (const frame of [...textures.flight,...textures.impact]) frame.destroy(false);
  }
  constructor(engine, textures, onUpdate=()=>{}, {serverDriven=false}={}) {
    this.engine=engine; this.textures=textures; this.serverDriven=serverDriven;
    this.sequence=SEQUENCE; this.key=SEQUENCE.key; this.clock={time:0}; this.speed=1; this.shake=false;
    this.ground=new Container({label:'QuantumBombGround'}); this.ground.depthSortY=-90000;
    this.front=new Container({label:'QuantumBombImpact'});
    engine.combatLayer.addChild(this.ground); engine.effectLayer.addChild(this.front);
    const sprite=(parent, texture, anchor={x:.5,y:.5})=>{
      const s=new Sprite(texture); s.anchor.set(anchor.x,anchor.y); parent.addChild(s); return s;
    };
    this.marker=new Graphics().ellipse(0,0,80,27).stroke({width:3,color:0xe04425})
      .ellipse(0,0,61,20).stroke({width:1.5,color:0xffb444});
    for (const side of [-1,1]) {
      this.marker.moveTo(side*62,0).lineTo(side*98,0).stroke({width:4,color:0xffd381});
      this.marker.moveTo(0,side*19).lineTo(0,side*35).stroke({width:3,color:0xffd381});
    }
    this.marker.circle(0,0,3).fill(0xffde92);
    this.ground.addChild(this.marker);
    this.groundLight=sprite(this.ground,textures.flash); this.groundLight.blendMode='add';
    this.dust=sprite(this.ground,textures.dust); this.dust.tint=0xd1af8e;
    this.ring=sprite(this.ground,textures.dust); this.ring.tint=0xdfcdb3;
    this.rollingDust=Array.from({length:engine.mobile?8:12},(_,i)=>{
      const s=sprite(this.ground,textures.smoke);
      s.tint=i%3===0?0xc4ab92:0x958779;
      return s;
    });
    this.wake=Array.from({length:8},()=>sprite(this.front,textures.smoke));
    this.exhaust=sprite(this.front,textures.exhaust,{x:1,y:.5});
    this.exhaust.rotation=Math.PI/2; this.exhaust.blendMode='add';
    this.capsule=sprite(this.front,textures.flight[0],atlas.flight.anchor);
    this.cloud=sprite(this.front,textures.impact[0],atlas.impact.anchor);
    this.nextCloud=sprite(this.front,textures.impact[0],atlas.impact.anchor);
    this.groundWisps=Array.from({length:4},()=>sprite(this.front,textures.smoke));
    this.flash=sprite(this.front,textures.flash); this.flash.tint=0xffe6a5; this.flash.blendMode='add';
    this.sparks=Array.from({length:engine.mobile?10:16},()=>{
      const s=sprite(this.front,textures.cinder); s.tint=0xffbc63; s.blendMode='add'; return s;
    });
    this.scheduledContact=SEQUENCE.impacts[0]; this.confirmedContact=null;
    // Only the standalone review owns a timeline. Battles sample their existing combat clock.
    if (!serverDriven) {
      this.timeline=gsap.timeline({paused:true,onUpdate:()=>{this.render(this.time);onUpdate(this.time);}});
      this.timeline.to(this.clock,{time:SEQUENCE.duration,duration:SEQUENCE.duration,ease:'none'});
    }
    this.render(0);
  }
  get time(){return this.clock.time;}
  get playing(){return Boolean(this.timeline&&!this.timeline.paused()&&this.time<SEQUENCE.duration);}
  play(){if(this.time>=SEQUENCE.duration)this.seek(0);this.timeline?.play();}
  pause(){this.timeline?.pause();this.render(this.time);}
  seek(time){this.timeline?.pause().time(time);this.render(this.time);}
  setSpeed(speed){this.speed=speed;this.timeline?.timeScale(speed);}

  formation(actors) {
    if (!actors.length) return null;
    const xs=actors.map(a=>a.root.x), ys=actors.map(a=>a.root.y);
    const left=Math.min(...xs), right=Math.max(...xs), top=Math.min(...ys), bottom=Math.max(...ys);
    const radiusX=Math.max(this.engine.mobile?365:500,(right-left)*.74+120);
    return {x:(left+right)/2,y:(top+bottom)/2,radiusX,radiusY:Math.max(radiusX*.32,(bottom-top)*.74+75)};
  }
  bindTarget(id,event) {
    const ids=event.targetIds??[id];
    const targets=ids.map(id=>this.engine.combatantById(id)).filter(a=>a?.root.visible&&a.battleActive!==false&&ids.includes(a.id));
    // Freeze the cast footprint before any slot can die, move, or be reused.
    this.targetIds=new Set(targets.map(a=>a.id));
    this.center=this.formation(targets);
  }
  scheduleImpact(index,time){if(index===0)this.scheduledContact=time;}
  confirmImpact(index,time,event) {
    if(index!==0||this.confirmedContact!==null||!this.targetIds?.has(event.targetId))return false;
    this.confirmedContact=time; return true;
  }
  render(time) {
    if(this.destroyed)return;
    const center=this.serverDriven?this.center:this.formation(this.engine.enemies.filter(a=>a.root.visible&&a.battleActive!==false));
    this.ground.visible=this.front.visible=Boolean(center);
    if(!center)return;
    const {x,y,radiusX,radiusY}=center;
    const screenTop=this.engine.effectLayer.toLocal({x:0,y:0}).y;
    const contact=this.serverDriven?this.confirmedContact:SEQUENCE.impacts[0];
    const landed=contact!==null&&time>=contact;
    const p=clamp((time-SEQUENCE.release)/(this.scheduledContact-SEQUENCE.embed-SEQUENCE.release));
    const startY=screenTop+18, travelDuration=this.scheduledContact-SEQUENCE.embed-SEQUENCE.release;
    const size=this.engine.mobile?244:286;
    const fallY=q=>startY+(y-startY)*(.38*q+.62*q*q);
    this.marker.visible=time>0&&!landed;
    this.marker.position.set(x,y); this.marker.scale.set(1.85-.95*clamp(time/SEQUENCE.release));
    this.marker.alpha=Math.min(1,time/.08)*(.75+.20*p);
    this.capsule.visible=time>=SEQUENCE.release&&!landed;
    this.exhaust.visible=this.capsule.visible&&p<1;
    if(this.capsule.visible){
      this.capsule.texture=this.textures.flight[Math.min(7,Math.floor(p*8))];
      this.capsule.position.set(x,fallY(p));
      this.capsule.width=this.capsule.height=size;
      this.exhaust.position.set(x,fallY(p)-size*.657);
      this.exhaust.width=size*(.21+.025*Math.sin(time*110)); this.exhaust.height=size*.095;
      this.exhaust.alpha=.80;
    }
    this.wake.forEach((s,i)=>{
      const q=i/(this.wake.length-1), t=time-(SEQUENCE.release+travelDuration*q);
      s.visible=t>=0&&t<.38;
      if(!s.visible)return;
      s.position.set(x+Math.sin(i*2.3)*t*10,fallY(q)-size*.68-t*19);
      s.width=15+t*75;s.height=21+t*60;s.rotation=i*.74;s.alpha=(1-t/.38)*.38;
    });
    const age=landed?time-contact:-1, frame=impactFrame(age);
    this.cloud.visible=this.nextCloud.visible=Boolean(frame);
    if(frame){
      this.cloud.texture=this.textures.impact[frame.index];
      this.nextCloud.texture=this.textures.impact[Math.min(this.textures.impact.length-1,frame.index+1)];
      const fade=clamp((SEQUENCE.life-age)/.30);
      const kick=this.shake&&this.playing?Math.exp(-age*16)*4:0;
      const height=Math.min(radiusX*2.08,(y-screenTop-16)/atlas.impact.anchor.y);
      const width=Math.min(radiusX*2.05,height*1.53);
      let lean=0;
      if(this.engine.mobile){
        const {screen}=this.engine.app.renderer, layer=this.engine.effectLayer;
        const left=layer.toLocal({x:6,y:0}).x, right=layer.toLocal({x:screen.width-6,y:0}).x;
        const spill=Math.max(0,x+width*.5-right)-Math.max(0,left-x+width*.5);
        // Keep the base planted at contact while the upper plume rolls into the visible field.
        lean=Math.max(-.38,Math.min(.38,Math.atan2(spill,height*.66)))*clamp(age/.26);
      }
      for(const cloud of [this.cloud,this.nextCloud]){
        cloud.position.set(x+kick*Math.sin(age*96),y);
        cloud.width=width; cloud.height=height; cloud.skew.x=lean;
      }
      this.cloud.alpha=fade*(1-frame.blend**2); this.nextCloud.alpha=fade*frame.blend;
    }
    this.groundWisps.forEach((s,i)=>{
      const t=age-.055-(i%2)*.065, life=.86+(i%2)*.24;
      s.visible=t>=0&&t<life;
      if(!s.visible)return;
      const spread=1-(1-t/life)**2, side=i<2?-1:1;
      s.position.set(x+side*radiusX*(.025+spread*(.17+.11*(i%2))),y+7-spread*(12+i));
      s.width=radiusX*(.19+.20*spread);s.height=s.width*(.16+.03*(i%2));
      s.tint=0xc9b298;s.alpha=.55*clamp(t/.13)*(1-t/life);
    });
    this.groundLight.visible=age>=0&&age<.55;
    if(this.groundLight.visible){
      this.groundLight.position.set(x,y);this.groundLight.tint=0xffb15c;
      this.groundLight.width=radiusX*(1.5+age);this.groundLight.height=radiusY*.86;
      this.groundLight.alpha=.55*Math.exp(-age*7);
    }
    this.ring.visible=this.dust.visible=age>=0&&age<1.0;
    if(this.ring.visible){
      const sweep=1-(1-age)**3;
      this.ring.position.set(x,y);this.ring.width=radiusX*(.15+2.28*sweep);
      this.ring.height=radiusY*(.15+2.28*sweep);this.ring.alpha=.78*(1-age);
      this.dust.position.set(x,y); this.dust.width=radiusX*(.5+1.45*sweep);
      this.dust.height=radiusY*(.5+1.35*sweep);this.dust.alpha=.7*(1-age);
    }
    this.rollingDust.forEach((s,i)=>{
      const t=age-.055-(i%3)*.018, life=.64+(i%4)*.13;
      s.visible=t>=0&&t<life;
      if(!s.visible)return;
      const angle=(i+.3)*Math.PI*2/this.rollingDust.length;
      const progress=1-(1-t/life)**3;
      s.position.set(x+Math.cos(angle)*radiusX*progress,y+Math.sin(angle)*radiusY*progress-16*progress);
      s.width=(58+progress*96)*(i%3===0?1.2:1);s.height=s.width*(.31+.11*progress);
      s.alpha=clamp(t/.09)*(1-t/life)*.66;
    });
    this.flash.visible=age>=0&&age<.13;
    if(this.flash.visible){
      this.flash.position.set(x,y-9);this.flash.width=radiusX*.93;this.flash.height=radiusY*.97;
      this.flash.alpha=.85*(1-age/.13);
    }
    this.sparks.forEach((s,i)=>{
      const t=age-(i%4)*.014, life=.38+(i%6)*.10;
      s.visible=t>=0&&t<life;
      if(!s.visible)return;
      const angle=i*2.39996, reach=radiusX*(.48+(i%5)*.10);
      s.position.set(x+Math.cos(angle)*reach*t,y-12-(130+Math.abs(Math.sin(angle))*230)*t+235*t*t);
      s.width=4+i%4; s.height=s.width*1.9; s.rotation=angle+t*4; s.alpha=1-t/life;
    });
  }
  diagnostics(){return {key:this.key,time:this.time,playing:this.playing,flight:this.capsule.visible,blast:this.cloud.visible};}
  destroy(){
    if(this.destroyed)return;
    this.destroyed=true; this.timeline?.kill(); this.timeline=null;
    this.ground.destroy({children:true}); this.front.destroy({children:true});
  }
}
