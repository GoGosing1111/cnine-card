import {Point, Sprite} from 'pixi.js';
import {SwordTrail, swordStrokes} from '../SwordTrail.mjs';
import {skillStrokes} from '../skills-v4/SkillEffects.mjs';
import {tempestStrokes} from '../action-v3/TempestEffects.mjs';
import {flightAt} from '../action-v3/timing.mjs';
import registration from '../skills-v4/pose-registration.json' with {type:'json'};

const clamp = x => Math.max(0,Math.min(1,x));
const mix = (a,b,u) => new Point(a.x+(b.x-a.x)*u,a.y+(b.y-a.y)*u);
const steel = 'v4-incision', pressure = 'v4-pressure';

export class SwordplayEffects {
  constructor(owner, adapter, motion, {rootAt,strike}) {
    this.owner=owner;
    this.adapter=adapter;
    this.layer=owner.engine.effectLayer;
    this.motion=motion;
    this.mode=strike.technique;
    this.targets=strike.targets;
    this.primary=strike.primary;
    this.time=0;
    this.disposed=false;
    this.layers=new Map();
    this.frames={};
    const airborne=motion==='skill_tempest';
    this.trail=new SwordTrail(this.layer,adapter,owner.assets.trailTexture,motion,rootAt,{
      registration, strokes:airborne ? tempestStrokes : (skillStrokes[motion] || swordStrokes[motion]),
      poseOffsetAt:airborne ? flightAt : undefined
    });
    const art='v5-'+this.mode.slice('skill_'.length);
    if (this.mode==='skill_flash') {
      this.add('draw',art); this.add('return-edge',art);
      this.add('sheath',steel); this.add('bite','impact-burst'); this.add('filings','v5-splinters');
    } else if (this.mode==='skill_thrust') {
      this.add('drive',art);
      for (let i=0;i<3;i++) this.add('scar'+i,steel);
      this.add('entry','v5-splinters'); this.add('exit','v5-splinters');
    } else if (this.mode==='skill_wheel') {
      this.add('wind',art); this.add('rim',art); this.add('break',pressure); this.add('leading-edge','v5-rimlight');
      this.targets.forEach((_,i)=>this.add('grazing'+i,steel));
    } else {
      this.add('fall',art);
      this.targets.forEach((_,i)=>{
        this.add('aim'+i,steel); this.add('sword'+i,art);
        this.add('land'+i,pressure); this.add('chips'+i,'debris'); this.add('shatter'+i,'v5-splinters');
      });
    }
  }
  add(id,asset) {
    const spec=this.owner.assets.manifest.effects[asset];
    const sprite=new Sprite(this.owner.assets.textures[asset][0]);
    sprite.label='V35_WHITECOAT_FX_SWORDPLAY_'+id;
    sprite.anchor.set(spec.pivot[0]/spec.frames[0].w,spec.pivot[1]/spec.frames[0].h);
    sprite.blendMode=spec.blend;
    sprite.visible=false;
    this.layer.addChild(sprite);
    this.layers.set(id,{asset,sprite,spec});
  }
  paint(id,phase,at,width,{angle=0,height,alpha=1,mirror=this.facing,origin}={}) {
    const {asset,sprite,spec}=this.layers.get(id);
    const frame=Math.floor(phase*spec.frames.length+1e-7);
    sprite.visible=this.owner.enabled && frame>=0 && frame<spec.frames.length && alpha>0;
    this.frames[id]=sprite.visible ? frame : -1;
    if (!sprite.visible) return;
    sprite.texture=this.owner.assets.textures[asset][frame];
    sprite.position.copyFrom(at);
    const bounds=spec.inkBounds || spec.crop;
    if(origin){
      const tex=spec.frames[frame];
      sprite.anchor.set((bounds.left+bounds.width*origin[0]-spec.crop.left)*spec.rasterScale[0]/tex.w,
        (bounds.top+bounds.height*origin[1]-spec.crop.top)*spec.rasterScale[1]/tex.h);
    }
    const sx=width/bounds.width, sy=height==null ? sx : height/bounds.height;
    sprite.scale.set(mirror*sx/spec.rasterScale[0],sy/spec.rasterScale[1]);
    sprite.rotation=angle;
    sprite.alpha=alpha;
  }
  floor(target) {
    return this.layer.toLocal(target.root.toGlobal(new Point(0,0)));
  }
  fallingSword(index,time,ground,height,angle) {
    const id='sword'+index, {spec,sprite}=this.layers.get(id), blade=spec.fallingBlade;
    const start=1.22+(index%3)*.075, u=clamp((time-start)/(1.78-start));
    const visible=time>=start && time<1.98;
    this.frames[id]=visible && this.owner.enabled ? 0 : -1;
    sprite.visible=this.frames[id]===0;
    if(!sprite.visible)return;
    // Pin the actual painted point of the first falling-blade drawing to the
    // impact track, independently of its halo and transparent atlas margins.
    const frame=spec.frames[0], sx=spec.rasterScale[0], sy=spec.rasterScale[1];
    sprite.anchor.set((blade.x-spec.crop.left)*sx/frame.w,(blade.y-spec.crop.top)*sy/frame.h);
    const scale=height/blade.height;
    sprite.scale.set(scale/sx,scale/sy);
    sprite.rotation=angle;
    const travel=(1-u*u)*height*1.12;
    sprite.position.set(ground.x+Math.sin(angle)*travel,ground.y-Math.cos(angle)*travel);
    sprite.alpha=clamp((time-start)/.09)*clamp((1.98-time)/.20);
  }
  render(time) {
    if (this.disposed) return;
    this.time=time;
    const {actor}=this.adapter;
    this.facing=actor.view.scale.x<0 ? -1 : 1;
    const root=this.floor(actor), axis=this.layer.toLocal(actor.root.toGlobal(new Point(1,0)));
    const unit=Math.hypot(axis.x-root.x,axis.y-root.y);
    const screen=this.owner.engine.app.screen;
    const left=this.layer.toLocal(new Point(0,0)), right=this.layer.toLocal(new Point(screen.width,screen.height));
    const fieldWidth=Math.abs(right.x-left.x), fieldHeight=Math.abs(right.y-left.y);
    const floors=this.targets.map(target=>this.floor(target)), primary=this.floor(this.primary);
    const chest=new Point(primary.x,primary.y-142*unit);
    this.trail.render(time,this.owner.enabled);

    // Keep the broad free travelling waves in the field. Impact sparks stay
    // pinned to each actual victim and the textured trail stays on the sword.
    const fitX=(x,width)=>Math.max(left.x+width/2,Math.min(right.x-width/2,x));
    if (this.mode==='skill_flash') {
      const draw=this.trail.anchor('draw-cut'), rise=this.trail.anchor('rising-cut');
      const width=Math.min(fieldWidth*.54,1300*unit);
      const cut=mix(draw.hand,draw.tip,.74), up=mix(rise.hand,rise.tip,.67);
      const shape=this.layers.get('draw').spec.inkBounds, aspect=shape.height/shape.width;
      // Upper-row targets leave less space above a rising sword. Keep the
      // largest full crescent that will fit without detaching its origin.
      const room=p=>Math.max(1,p.y-left.y-fieldHeight*.025);
      const cutWidth=Math.min(width,room(cut)/(.83*aspect));
      const riseWidth=Math.min(width*.70,room(up)/(.80*aspect+.30));
      this.paint('sheath',(time-.255)/.22,draw.hand,width*.38,{angle:draw.angle,mirror:1});
      this.paint('draw',(time-.30)/.58,cut,cutWidth,{origin:[.25,.83]});
      this.paint('return-edge',(time-.51)/.51,up,riseWidth,{angle:-.38*this.facing,alpha:.88,origin:[.21,.80]});
      this.paint('bite',(time-.30)/.38,chest,width*.33);
      this.paint('filings',(time-.51)/.44,rise.tip,width*.48,{angle:rise.angle,mirror:1});
    } else if (this.mode==='skill_thrust') {
      const thrust=this.trail.anchor('drive'), width=Math.min(fieldWidth*.63,1580*unit);
      const entry=mix(thrust.hand,chest,.45), front=mix(entry,chest,clamp((time-.34)/.18));
      front.x=fitX(front.x,width);
      this.paint('drive',(time-.34)/.77,front,width,{height:width*.32});
      this.paint('entry',(time-.48)/.43,chest,width*.38,{angle:-.35*this.facing});
      this.paint('exit',(time-.57)/.51,thrust.tip,width*.34,{angle:.40*this.facing});
      for (let i=0;i<3;i++) {
        const p=new Point(chest.x+(i-1)*12*unit*this.facing,chest.y+(i-1)*23*unit);
        this.paint('scar'+i,(time-.48-i*.085)/.44,p,width*(.55+i*.08),{angle:(i-1)*.145*this.facing});
      }
    } else {
      const xs=floors.map(p=>p.x), ys=floors.map(p=>p.y);
      const xMin=Math.min(...xs), xMax=Math.max(...xs);
      const floorY=(Math.min(...ys)+Math.max(...ys))/2;
      const mid=(xMin+xMax)/2;
      if (this.mode==='skill_wheel') {
        const turn=this.trail.anchor('turn'), width=fieldWidth*.86;
        const centerX=fitX(mid,width);
        const center=new Point(centerX,floorY-86*unit);
        const wind=mix(turn.tip,center,clamp((time-.64)/.34));
        this.paint('wind',(time-.64)/.78,wind,width*.82,{height:Math.min(fieldHeight*.32,420*unit)});
        this.paint('rim',(time-1.075)/.83,center,width,{height:Math.min(fieldHeight*.39,480*unit)});
        this.paint('leading-edge',(time-1.12)/.65,center,width,{height:Math.min(fieldHeight*.37,470*unit)});
        this.paint('break',(time-1.22)/.56,new Point(centerX,floorY),width*.80,{height:95*unit});
        floors.forEach((p,i)=>this.paint('grazing'+i,(time-1.22)/.49,
          new Point(p.x,p.y-102*unit),width*.28,{angle:(i%2 ? -.31 : .19)*this.facing}));
      } else {
        const width=Math.min(fieldWidth*.81,Math.max(fieldWidth*.61,xMax-xMin+490*unit));
        const height=Math.min(fieldHeight*.62,920*unit), centerX=fitX(mid,width);
        const phase=(time-1.33)/1.04;
        const descending=1-clamp((time-1.38)/.40);
        const center=new Point(centerX,floorY-height*.43-descending*height*.12);
        // Keep the katana's forged proportions even on an extremely wide
        // formation. Individual falling blades cover the outer victims.
        const fan=this.layers.get('fall').spec.inkBounds;
        this.paint('fall',phase,center,Math.min(width,height*fan.width/fan.height),{alpha:.92});
        floors.forEach((p,i)=>{
          // Gleaming points hang over the marked targets. They cross the
          // target's chest together with the final down-cut, then hit its feet.
          const aimTime=.66+Math.min(i,2)*.27, age=time-aimTime;
          const markPhase=age<.16 ? age/.4 : .4+Math.max(0,time-1.78)/.36;
          const y=p.y-112*unit-height*.64*(1-clamp((time-1.52)/.26));
          this.paint('aim'+i,markPhase,new Point(p.x,y),width*.21,{angle:Math.PI*.5,mirror:1,alpha:.9});
          const slant=this.facing*((i%3)-1)*.19;
          this.fallingSword(i,time,p,Math.min(height*.84,650*unit),slant);
          this.paint('land'+i,(time-1.78)/.65,p,width*.39,{height:105*unit});
          this.paint('chips'+i,(time-1.78)/.54,p,Math.min(335*unit,width*.30));
          this.paint('shatter'+i,(time-1.78)/.53,p,width*.32,{height:height*.38});
        });
      }
    }
  }
  audit() {
    const trail=this.trail.audit(), visible=[...this.layers.values()].filter(v=>v.sprite.visible);
    return {mode:this.mode,motion:this.motion,time:this.time,targets:this.targets.map(t=>t.id),
      active:visible.length+trail.active,frames:{...this.frames},trail,disposed:this.disposed};
  }
  destroy() {
    if (this.disposed) return;
    this.disposed=true;
    this.trail.destroy();
    for (const {sprite} of this.layers.values()) { sprite.removeFromParent(); sprite.destroy(); }
    if (this.owner.session===this) this.owner.session=null;
    this.owner.completed++;
  }
}
