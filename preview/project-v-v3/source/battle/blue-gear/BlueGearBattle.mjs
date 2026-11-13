import {Assets,Point,Rectangle,Sprite,Texture} from 'pixi.js';
import {spine} from '../hakuya/vendor/spine-pixi-v8-4.3.13.mjs';
import {SpineBattleAdapter} from './SpineBattleAdapter.mjs';
import {skills} from './skills.mjs';

const clamp=n=>Math.min(1,Math.max(0,n));
const lerp=(a,b,n)=>a+(b-a)*n;
const ease=n=>{n=clamp(n);return n*n*(3-2*n);};
const between=(a,b,n)=>new Point(lerp(a.x,b.x,n),lerp(a.y,b.y,n));
const cache=new Map();

export function loadFighter(f,base,manifest,fxManifest){
  const key=new URL(base,location.href).href+f.id;
  if(cache.has(key))return cache.get(key);
  const data=manifest.actors[f.id],actorBase=base+'actors/'+f.id+'/runtime/',effectBase=base+'effects/runtime/';
  const promise=(async()=>{
    const skeleton=actorBase+data.skeleton, atlas=actorBase+data.atlas;
    const [effects]=await Promise.all([Promise.all(f.skills.map(async id=>{
      const m=fxManifest[id];
      const [sheet,release,painting]=await Promise.all([m.atlas,m.release,m.painting].map(file=>Assets.load(effectBase+file)));
      const frames=Array.from({length:m.frames},(_,i)=>new Texture({source:sheet.source,frame:new Rectangle(
        i%m.cols*(m.cellW+4)+2,Math.floor(i/m.cols)*(m.cellH+4)+2,m.cellW,m.cellH)}));
      return [id,{...m,frames,release,painting}];
    }))]);
    return {skeleton,atlas,bodyPixels:data.bodyPixels,effects:Object.fromEntries(effects)};
  })().finally(()=>cache.delete(key));
  cache.set(key,promise);
  return promise;
}

class SkillEffect {
  constructor(adapter,target,id){
    this.adapter=adapter;this.engine=adapter.engine;this.layer=this.engine.effectLayer;this.target=target;
    this.skill=skills[id];this.art=adapter.assets.effects[id];
    this.release=new Sprite(this.art.release);
    this.impact=new Sprite(this.art.painting);
    this.particles=new Sprite(this.art.frames[0]);
    for(const s of [this.release,this.impact,this.particles]){s.label='BLUE_GEAR_FX_'+id;s.visible=false;s.eventMode='none';this.layer.addChild(s);}
    this.release.anchor.set(.5);this.impact.anchor.set(.5);this.particles.anchor.set(...this.art.anchor);
  }
  render(time){
    const s=this.skill,a=this.adapter, attack=s.shape,layer=this.layer;
    if(!a.effectsEnabled){this.release.visible=false;this.impact.visible=false;this.particles.visible=false;return;}
    const age=time-s.hit;
    const anticipation=['rail','orbital','geyser'].includes(attack);
    const start=s.release-(anticipation?.20:.015);
    const r=this.release,p=this.impact,particles=this.particles;
    const phase=age/(s.end-s.hit-.14);
    r.visible=time>=start&&age<.12;
    p.visible=particles.visible=phase>=0&&phase<1;
    if(r.visible&&age>=0)r.alpha=1-clamp(age/.12);
    if(p.visible){
      p.alpha=1-clamp((phase-.58)/.42);
      particles.texture=this.art.frames[Math.min(this.art.frames.length-1,Math.floor(phase*this.art.frames.length))];
    }
    const placeRelease=r.visible&&(age<0||!this.releaseLanded),placeImpact=p.visible&&!this.impactPlaced;
    if(!placeRelease&&!placeImpact)return;
    const direction=a.actor.view.scale.x<0?-1:1;
    const at=(display,x,y)=>layer.toLocal({x,y},display);
    const foot=at(this.target.root,0,0),chest=at(this.target.root,0,-120);
    const screen=this.engine.app.screen,top=layer.toLocal({x:0,y:0}),right=layer.toLocal({x:screen.width,y:screen.height});
    const fw=Math.abs(right.x-top.x),fh=Math.abs(right.y-top.y);
    if(placeRelease){
      const t=clamp((time-s.release)/(s.hit-s.release));
      const fromBone=a.rig.skeleton.findBone('tip').appliedPose;
      const muzzle=at(a.rig,fromBone.worldX,fromBone.worldY);
      const charge=clamp((time-start)/Math.max(.05,s.release-start));
      let width=fw*.35,height=fh*.22,p=between(muzzle,chest,t),angle=0;
      const dx=chest.x-muzzle.x,dy=chest.y-muzzle.y;
      const aim=Math.atan2(dy,Math.abs(dx))*direction;
      switch(attack){
        case 'volley': width=fw*(.17+.27*t);height=width*.42;angle=aim;break;
        case 'rail': width=fw*(.11+.29*charge);height=width*.76;p=between(muzzle,chest,.13*t);angle=aim;break;
        case 'slash': width=fw*(.16+.27*t);height=width*.76;p=between(muzzle,chest,.56*t);angle=direction*(-.22+.38*t);break;
        case 'shield': width=fw*(.13+.20*t);height=width*.94;p=between(muzzle,chest,.65*t);break;
        case 'rocket': width=fw*(.16+.21*t);height=width*.49;angle=aim;break;
        case 'gravity': {
          const apex=new Point(lerp(muzzle.x,chest.x,.58),Math.max(top.y+fh*.10,Math.min(muzzle.y,chest.y)-fh*.44));
          p=t<.43?between(muzzle,apex,t/.43):between(apex,chest,(t-.43)/.57);
          width=fw*(.13+.15*t);height=width;angle=direction*(t<.43?-1.48:0);break;
        }
        case 'lance': width=fw*(.24+.30*t);height=width*.39;p=between(muzzle,chest,.52*t);angle=aim;break;
        case 'geyser': width=fw*(.12+.19*charge);height=width*(.37+.6*t);p=new Point(foot.x,foot.y-height*.45);break;
        case 'optic': width=Math.max(fw*.27,Math.hypot(dx,dy)*(.66+.34*t));height=width*.25;p=between(muzzle,chest,.47);angle=aim;break;
        case 'orbital': width=fw*(.19+.14*charge);height=width*.68;p=new Point(foot.x,foot.y-height*.42);break;
      }
      r.position.copyFrom(p);r.width=width;r.height=Math.min(fh*.65,height);r.scale.x=Math.abs(r.scale.x)*direction;
      r.rotation=angle;
      if(age<0)r.alpha=anticipation?Math.max(.1,charge):1;
      this.releaseLanded=age>=0;
    }
    if(placeImpact){
      // One source pixel is one battle-world unit. Compact fields may shrink
      // the whole image to fit. The hit and its fade share this transform.
      const source=p.texture.orig;
      const scale=Math.min(1,fw/source.width,fh/source.height);
      const width=source.width*scale,height=source.height*scale;
      const x=Math.max(top.x+width/2,Math.min(right.x-width/2,chest.x));
      const y=['gravity','geyser','orbital','rocket'].includes(attack)?foot.y-height*.40:chest.y-height*.11;
      p.position.set(x,Math.max(top.y+height/2,Math.min(right.y-height/2,y)));
      p.scale.set(direction*scale,scale);
      particles.position.copyFrom(p.position);
      const particleScale=scale*this.art.pixelsPerParticleTexel;
      particles.scale.set(direction*particleScale,particleScale);
      this.impactPlaced=true;
    }
  }
  destroy(){for(const s of [this.release,this.impact,this.particles]){s.removeFromParent();s.destroy();}}
}

export class BlueGearBattle extends SpineBattleAdapter {
  constructor(engine,actor,f,assets) {
    const rig=spine.Spine.from({skeleton:assets.skeleton,atlas:assets.atlas,autoUpdate:false,ticker:engine.app.ticker});
    super(engine,actor,rig,{bodyPixels:assets.bodyPixels,bodyHeight:300});
    this.rig.position.set(0,0);this.fighter=f;this.assets=assets;this.effectsEnabled=true;
  }
  render(t){super.render(t+1e-6);this.clock.time=t;}
  async attack(options={}){
    const e=this.engine,a=this.actor,target=options.target,id=options.action||this.fighter.skills[0],s=skills[id];
    if(!this.fighter.skills.includes(id)||this.busy||this.destroyed||!e.isAlive(a)||!e.isAlive(target)||target.team===a.team)return false;
    e.settlePendingTails([a,target]);
    const epoch=e.playbackEpoch,origin=new Point(a.root.x,a.root.y),q=new Point(target.view.x,target.view.y);
    const direction=target.root.x>=origin.x?1:-1,unit=Math.abs(a.root.scale.x);
    const dest=s.reach?new Point(target.root.x-direction*s.reach*unit,target.root.y):new Point(origin.x+direction*s.stride*unit,origin.y);
    let applied=false;
    this.busy=true;this.begin(id);a.state='ATTACK';
    const fx=this.fx=new SkillEffect(this,target,id),c={t:0};
    const valid=()=>!this.destroyed&&!a.root.destroyed&&!target.root.destroyed&&a.hp>0&&e.playbackEpoch===epoch;
    const draw=t=>{
      if(!valid())return;
      const advance=s.reach?ease((t-.09)/(s.hit-.09)):ease(t/s.release);
      const back=ease((t-s.recover)/(s.end-s.recover)),pos=between(origin,dest,advance*(1-back));
      if(s.shape==='geyser')pos.y-=Math.sin(Math.PI*clamp((t-.22)/(s.release-.22)))*55*unit;
      a.root.position.copyFrom(pos);this.render(t);fx.render(t);
      const age=t-s.hit, recoil=age>=0&&age<.19?s.kick*Math.exp(-age*21)*Math.cos(age*38):0;
      target.view.position.set(q.x+direction*recoil,q.y-Math.abs(recoil)*.17);
    };
    this.drawCurrent=draw;
    const ok=await e.timeline(timeline=>{
      timeline.to(c,{t:s.hit,duration:s.hit,ease:'none'},0);
      timeline.call(()=>{
        if(!valid()||applied)return;
        draw(s.hit);applied=true;
        if(options.applyHits){options.applyHits();return;}
        if(options.targetShield!=null)e.syncTargetShield(target,Number(options.targetShield),options.targetMaxShield);
        if(options.targetHp!=null)e.syncTargetHp(target,Number(options.targetHp));
        options.onImpact?.(target);e.showAccountBattleUnitDamage(target,{damage:options.damage??0});
      },[],s.hit);
      timeline.to(c,{t:s.end,duration:s.end-s.hit,ease:'none'},s.hit+s.hold);
      timeline.eventCallback('onUpdate',()=>draw(c.t));
    },()=>{
      this.drawCurrent=null;fx.destroy();this.fx=null;
      if(!a.root.destroyed)a.root.position.copyFrom(origin);
      if(!target.view.destroyed)target.view.position.copyFrom(q);
      this.busy=false;
      if(!this.destroyed&&!this.suspended&&a.hp>0&&e.visible&&e.playbackEpoch===epoch){a.state='IDLE';this.idle();}
    },e.actionPlaybackSpeed(),{owners:[a,target]});
    e.lastMercenaryPlayback={variantId:'blue-gear-'+this.fighter.id,action:id,damageApplications:Number(applied),clock:'V3_GSAP',hit:s.hit,end:s.end+s.hold};
    return ok;
  }
}
