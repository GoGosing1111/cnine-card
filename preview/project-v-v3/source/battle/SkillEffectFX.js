import {AnimatedSprite, Assets, ColorMatrixFilter, Container, Graphics} from 'pixi.js';

export const SKILL_EFFECT_KIND=Object.freeze({
  ATTACK:'ATTACK',
  DEFENSE:'DEFENSE',
  SPEED:'SPEED',
  HP:'HP',
  HEAL:'HP'
});

export const ROLE_EFFECT_PROFILE=Object.freeze({
  ATTACK:{accent:0xff5238,secondary:0xffc553,label:'ARMOR BREAK',blendMode:'add',shake:22,hitStop:86},
  DEFENSE:{accent:0x55b9ff,secondary:0xc9f3ff,label:'GUARD CRUSH',blendMode:'screen',shake:18,hitStop:105},
  SPEED:{accent:0x9c70ff,secondary:0x66f7ff,label:'7 HIT · TOTAL',blendMode:'add',shake:14,hitStop:55},
  HP:{accent:0x45eba0,secondary:0xf6d85d,label:'VITAL DRAIN',blendMode:'screen',shake:17,hitStop:92}
});

export const SKILL_EFFECT_ASSETS=Object.freeze({
  ATTACK:{atlasPath:'assets/fx/role-attack.json',framePrefix:'attack_',frameCount:12,animationSpeed:.58,blendMode:'add'},
  DEFENSE:{atlasPath:'assets/fx/role-defense.json',framePrefix:'defense_',frameCount:12,animationSpeed:.52,blendMode:'screen'},
  SPEED:{atlasPath:'assets/fx/role-speed.json',framePrefix:'speed_',frameCount:12,animationSpeed:.65,blendMode:'add'},
  HP:{atlasPath:'assets/fx/role-hp.json',framePrefix:'hp_',frameCount:12,animationSpeed:.5,blendMode:'screen'}
});

export function normalizeSkillEffectKind(value){
  const raw=String(value||'ATTACK').trim().toUpperCase();
  if(raw==='HEAL'||raw==='HEALER'||raw==='HEALTH'||raw==='VITAL')return SKILL_EFFECT_KIND.HP;
  if(raw==='DEF'||raw==='TANK'||raw==='GUARD')return SKILL_EFFECT_KIND.DEFENSE;
  if(raw==='AGILITY'||raw==='AGI'||raw==='FAST')return SKILL_EFFECT_KIND.SPEED;
  return SKILL_EFFECT_KIND[raw]||SKILL_EFFECT_KIND.ATTACK;
}

export function roleEffectProfile(kind){
  return ROLE_EFFECT_PROFILE[normalizeSkillEffectKind(kind)];
}

export function applyWebGLBlendTree(displayObject,mode='add'){
  if(!displayObject)return displayObject;
  displayObject.blendMode=displayObject.effectBlendMode||mode;
  displayObject.children?.forEach(child=>applyWebGLBlendTree(child,mode));
  return displayObject;
}

function addRay(root,{length,width,angle,color,alpha=.9,radius=20}){
  const ray=new Graphics().roundRect(-length*.5,-width*.5,length,width,radius).fill({color,alpha});
  ray.rotation=angle;
  ray.blendMode='add';
  root.addChild(ray);
  return ray;
}

function makeAttackFx(profile){
  const root=new Container({label:'ROLE_FX_ATTACK'});
  root.arcs=[];
  [-.42,.72].forEach((angle,index)=>{
    const group=new Container();
    group.rotation=angle;
    const radius=index?190:235;
    const edge=new Graphics().arc(0,0,radius,-2.5,.2).stroke({width:index?9:22,color:index?profile.secondary:profile.accent,alpha:.98});
    const core=new Graphics().arc(0,0,radius,-2.5,.2).stroke({width:index?2.2:5,color:0xffffff,alpha:.98});
    edge.blendMode='add';core.blendMode='add';group.scale.y=.32;
    group.addChild(edge,core);
    root.addChild(group);root.arcs.push(group);
  });
  root.ring=new Graphics().ellipse(0,0,46,19).stroke({width:8,color:profile.secondary,alpha:.86});
  root.ring.blendMode='screen';root.addChild(root.ring);
  root.chargeRing=new Graphics().ellipse(0,0,58,22).stroke({width:5,color:profile.accent,alpha:.72});
  root.chargeRing.blendMode='add';root.addChild(root.chargeRing);
  root.shards=[];
  for(let index=0;index<38;index+=1){
    const angle=Math.PI*2*index/38;
    const shard=addRay(root,{length:12+(index%6)*8,width:2+(index%3),angle,color:index%3?profile.accent:profile.secondary,alpha:.92});
    shard._angle=angle;shard.position.set(Math.cos(angle)*30,Math.sin(angle)*22);root.shards.push(shard);
  }
  return root;
}

function makeDefenseFx(profile){
  const root=new Container({label:'ROLE_FX_DEFENSE'});
  root.shield=new Graphics()
    .poly([0,-92,75,-52,68,44,0,96,-68,44,-75,-52])
    .fill({color:0x0a3154,alpha:.24})
    .stroke({width:11,color:profile.accent,alpha:.95});
  root.innerShield=new Graphics().poly([0,-65,49,-34,44,29,0,65,-44,29,-49,-34]).stroke({width:4,color:0xffffff,alpha:.9});
  root.rings=[0,1].map(index=>{
    const ring=new Graphics().ellipse(0,18,65-index*24,32-index*17).stroke({width:index?4:13,color:index?0xffffff:profile.accent,alpha:.9-index*.1});
    root.addChild(ring);return ring;
  });
  root.addChild(root.shield,root.innerShield);
  root.fragments=[];
  for(let index=0;index<28;index+=1){
    const angle=Math.PI*2*index/28;
    const fragment=new Graphics().poly([0,-8,18,0,0,8,-8,0]).fill({color:index%2?profile.accent:0xffffff,alpha:.82});
    fragment.blendMode='screen';fragment.rotation=angle;fragment.position.set(Math.cos(angle)*70,Math.sin(angle)*54);
    fragment._angle=angle;root.addChild(fragment);root.fragments.push(fragment);
  }
  return root;
}

function makeSpeedFx(profile){
  const root=new Container({label:'ROLE_FX_SPEED'});
  root.streaks=[];
  for(let index=0;index<7;index+=1){
    const length=300-index*14;
    const streak=addRay(root,{length,width:9-index*.55,angle:-.18+(index-3)*.025,color:index%3===0?0xffffff:index%2?profile.secondary:profile.accent,alpha:.94-index*.055});
    streak.position.set(-155-index*18,-72+index*23);streak._baseX=streak.x;root.streaks.push(streak);
  }
  root.ring=new Graphics().ellipse(0,0,84,28).stroke({width:6,color:profile.secondary,alpha:.82});
  root.ring.rotation=-.13;root.ring.blendMode='add';root.addChild(root.ring);
  root.afterimages=[];
  for(let index=0;index<3;index+=1){
    const echo=new Graphics().poly([-82,-20,54,-13,102,0,54,13,-82,20]).stroke({width:3,color:profile.accent,alpha:.32-index*.07});
    echo.position.x=-42-index*30;root.addChild(echo);root.afterimages.push(echo);
  }
  root.slashes=[];
  for(let index=0;index<5;index+=1){
    const group=new Container();group.rotation=-.8+index*.38;group.position.set((index-2)*18,(index%2)*45-18);group.scale.y=.32;
    const radius=150+index*14;
    const edge=new Graphics().arc(0,0,radius,-2.5,.2).stroke({width:8,color:index%2?profile.secondary:profile.accent,alpha:.96});
    const core=new Graphics().arc(0,0,radius,-2.5,.2).stroke({width:2,color:0xffffff,alpha:.9});edge.blendMode='add';core.blendMode='add';group.addChild(edge,core);root.addChild(group);root.slashes.push(group);
  }
  return root;
}

function makeHpFx(profile){
  const root=new Container({label:'ROLE_FX_HP'});
  root.rings=[0,1,2].map(index=>{
    const ring=new Graphics().ellipse(0,12,55+index*31,20+index*11).stroke({width:8-index*1.5,color:index===1?profile.secondary:profile.accent,alpha:.9-index*.14});
    ring.rotation=index*.16;root.addChild(ring);return ring;
  });
  root.beamHost=new Container();root.tendrils=[];
  for(let index=0;index<5;index+=1){
    const offset=(index-2)*12;
    const tendril=new Graphics().moveTo(0,offset).bezierCurveTo(150,-70+offset,360,70-offset,520,offset).stroke({width:10-index,color:index===2?profile.secondary:profile.accent,alpha:.82-index*.05});
    tendril.blendMode='screen';root.beamHost.addChild(tendril);root.tendrils.push(tendril);
  }
  root.addChild(root.beamHost);
  root.impactRing=new Graphics().ellipse(0,0,72,30).stroke({width:9,color:profile.accent,alpha:.8});root.impactRing.blendMode='screen';root.addChild(root.impactRing);
  root.core=new Graphics().circle(0,0,24).fill({color:0xffffff,alpha:.92});
  root.core.blendMode='add';root.addChild(root.core);
  return root;
}

function makePlaceholder(kind){
  const normalized=normalizeSkillEffectKind(kind);
  const profile=roleEffectProfile(normalized);
  if(normalized===SKILL_EFFECT_KIND.DEFENSE)return makeDefenseFx(profile);
  if(normalized===SKILL_EFFECT_KIND.SPEED)return makeSpeedFx(profile);
  if(normalized===SKILL_EFFECT_KIND.HP)return makeHpFx(profile);
  return makeAttackFx(profile);
}

function resetPlaceholder(display,kind){
  display.alpha=0;display.visible=false;display.rotation=0;display.scale.set(1);
  if(kind===SKILL_EFFECT_KIND.ATTACK){
    display.arcs?.forEach(arc=>{arc.alpha=1;arc.scale.set(.12,.32)});
    if(display.ring){display.ring.alpha=.86;display.ring.scale.set(.25)}
    if(display.chargeRing){display.chargeRing.alpha=.72;display.chargeRing.scale.set(.7)}
    display.shards?.forEach(shard=>{shard.alpha=1;shard.scale.set(1);shard.position.set(Math.cos(shard._angle)*30,Math.sin(shard._angle)*22)});
  }else if(kind===SKILL_EFFECT_KIND.DEFENSE){
    if(display.shield){display.shield.alpha=1;display.shield.scale.set(.45)}
    if(display.innerShield){display.innerShield.alpha=1;display.innerShield.scale.set(.45)}
    display.rings?.forEach(ring=>{ring.alpha=1;ring.scale.set(.35)});
    display.fragments?.forEach(fragment=>{fragment.alpha=1;fragment.position.set(Math.cos(fragment._angle)*70,Math.sin(fragment._angle)*54)});
  }else if(kind===SKILL_EFFECT_KIND.SPEED){
    display.streaks?.forEach(streak=>{streak.alpha=1;streak.x=streak._baseX-90;streak.scale.set(.15,1)});
    if(display.ring){display.ring.alpha=1;display.ring.scale.set(.3)}
    display.afterimages?.forEach(echo=>{echo.alpha=.32;echo.scale.set(.75)});
    display.slashes?.forEach(slash=>{slash.alpha=1;slash.scale.set(.12,.32)});
  }else{
    display.rings?.forEach(ring=>{ring.alpha=1;ring.scale.set(.3)});
    display.tendrils?.forEach(tendril=>{tendril.alpha=.82});
    if(display.beamHost){display.beamHost.alpha=0;display.beamHost.scale.set(.08,1)}
    if(display.impactRing){display.impactRing.alpha=.8;display.impactRing.scale.set(.3)}
    if(display.core){display.core.alpha=.95;display.core.scale.set(.4)}
  }
}

function atlasFrames(resource,spec){
  const textures=resource?.textures||resource?.data?.textures||{};
  const entries=Object.entries(textures)
    .filter(([name])=>name.startsWith(spec.framePrefix))
    .sort(([left],[right])=>left.localeCompare(right,undefined,{numeric:true}))
    .slice(0,spec.frameCount)
    .map(([,texture])=>texture);
  if(entries.length!==spec.frameCount)throw new Error(`SKILL_FX_ATLAS_FRAME_MISMATCH:${spec.atlasPath}:${entries.length}/${spec.frameCount}`);
  return entries;
}

function layoutPlaceholder(display,kind,{x=0,y=0,originX=x,originY=y}={}){
  display.position.set(Math.round(x),Math.round(y));
  const dx=Math.round(originX-x);const dy=Math.round(originY-y);
  if(kind===SKILL_EFFECT_KIND.ATTACK&&display.chargeRing)display.chargeRing.position.set(dx,dy);
  if(kind===SKILL_EFFECT_KIND.DEFENSE){display.shield?.position.set(dx,dy);display.innerShield?.position.set(dx,dy)}
  if(kind===SKILL_EFFECT_KIND.HP){
    display.rings?.forEach(ring=>ring.position.set(dx,dy));
    if(display.core)display.core.position.set(dx,dy);
    if(display.beamHost){
      const distance=Math.max(1,Math.hypot(dx,dy));
      display.beamHost.position.set(dx,dy);
      display.beamHost.rotation=Math.atan2(-dy,-dx);
      display.beamHost._targetScaleX=distance/520;
    }
  }
  return display;
}

/**
 * EffectLayer-only role FX. Procedural WebGL graphics are production-safe now;
 * once the final atlas exists, preload(kind,{useAtlas:true}) switches this same
 * factory to Assets.load('assets/fx/role-*.json') without changing timelines.
 */
export class SkillEffectFX{
  static atlasCache=new Map();
  static displayPool=new Map();
  static poolLimit=12;

  static async preload(kind,{useAtlas=false}={}){
    const normalized=normalizeSkillEffectKind(kind);
    if(!useAtlas)return null;
    if(this.atlasCache.has(normalized))return this.atlasCache.get(normalized);
    const spec=SKILL_EFFECT_ASSETS[normalized];
    const pending=Assets.load(spec.atlasPath).then(resource=>atlasFrames(resource,spec));
    this.atlasCache.set(normalized,pending);
    try{const frames=await pending;this.atlasCache.set(normalized,frames);return frames}catch(error){this.atlasCache.delete(normalized);throw error}
  }

  static acquireDisplay(kind){
    const bucket=this.displayPool.get(kind)||[];
    this.displayPool.set(kind,bucket);
    return bucket.pop()||makePlaceholder(kind);
  }

  static recycleDisplay(kind,display){
    const bucket=this.displayPool.get(kind)||[];
    this.displayPool.set(kind,bucket);
    display.removeFromParent();resetPlaceholder(display,kind);
    if(bucket.length<this.poolLimit)bucket.push(display);else display.destroy({children:true});
  }

  static create({kind=SKILL_EFFECT_KIND.ATTACK,x=0,y=0,originX=x,originY=y}={}){
    const normalized=normalizeSkillEffectKind(kind);
    const spec=SKILL_EFFECT_ASSETS[normalized];
    const cached=this.atlasCache.get(normalized);
    const frames=Array.isArray(cached)?cached:null;
    const display=frames?.length?new AnimatedSprite({textures:frames,autoUpdate:true}):this.acquireDisplay(normalized);
    if(display instanceof AnimatedSprite){display.anchor.set(.5);display.loop=false;display.animationSpeed=spec.animationSpeed}
    resetPlaceholder(display,normalized);applyWebGLBlendTree(display,spec.blendMode);
    layoutPlaceholder(display,normalized,{x,y,originX,originY});
    return new SkillEffectFX({kind:normalized,display,spec,usesAtlas:Boolean(frames?.length)});
  }

  constructor({kind,display,spec,usesAtlas=false}){
    this.kind=kind;this.display=display;this.spec=spec;this.usesAtlas=usesAtlas;this.released=false;
  }

  attach(layer){if(!this.released&&!this.display.parent)layer.addChild(this.display);return this}

  play(timeline,{at=.35,duration=.24}={}){
    const display=this.display;
    const fullDuration=Math.max(.48,duration);
    const revealAt=Math.max(0,at-.2);
    timeline.call(()=>{if(this.released)return;display.visible=true;display.alpha=1;if(display instanceof AnimatedSprite)display.gotoAndPlay(0)},[],revealAt);
    if(this.kind===SKILL_EFFECT_KIND.ATTACK){
      timeline.to(display.chargeRing.scale,{x:1.8,y:1.8,duration:.2,ease:'power2.out'},revealAt);
      timeline.to(display.chargeRing,{alpha:0,duration:.15},at-.03);
      display.arcs?.forEach((arc,index)=>{timeline.to(arc.scale,{x:1,y:.32,duration:.09,ease:'power4.out'},at+index*.025);timeline.to(arc,{alpha:0,duration:.27,ease:'power2.in'},at+.16)});
      timeline.to(display.ring.scale,{x:6.1,y:6.1,duration:.31,ease:'expo.out'},at);
      timeline.to(display.ring,{alpha:0,duration:.22,ease:'power2.in'},at+.16);
      display.shards?.forEach((shard,index)=>timeline.to(shard,{x:Math.cos(shard._angle)*(155+(index%6)*24),y:Math.sin(shard._angle)*(92+(index%5)*16),alpha:0,duration:.34+(index%4)*.018,ease:'power3.out'},at+.025));
    }else if(this.kind===SKILL_EFFECT_KIND.DEFENSE){
      timeline.to(display.shield.scale,{x:1.08,y:1.08,duration:.2,ease:'back.out(2.2)'},revealAt);
      timeline.to(display.innerShield.scale,{x:1.08,y:1.08,duration:.2,ease:'back.out(2.2)'},revealAt);
      timeline.to(display.shield,{alpha:.28,duration:.28},at+.05);timeline.to(display.innerShield,{alpha:.18,duration:.28},at+.05);
      display.rings.forEach((ring,index)=>{timeline.to(ring.scale,{x:index?4.15:5.2,y:index?4.15:5.2,duration:.35+index*.035,ease:'expo.out'},at);timeline.to(ring,{alpha:0,duration:.2},at+.19+index*.03)});
      display.fragments.forEach((fragment,index)=>timeline.to(fragment,{x:Math.cos(fragment._angle)*(165+(index%4)*28),y:Math.sin(fragment._angle)*(110+(index%4)*18),alpha:0,rotation:fragment._angle+(index%2?.8:-.8),duration:.38,ease:'power3.out'},at+.02));
    }else if(this.kind===SKILL_EFFECT_KIND.SPEED){
      display.streaks.forEach((streak,index)=>{timeline.to(streak.scale,{x:1,duration:.06,ease:'power4.out'},at-.1+index*.012);timeline.to(streak,{x:streak._baseX+320,alpha:0,duration:.24,ease:'power3.in'},at+.02+index*.012)});
      display.slashes.forEach((slash,index)=>{timeline.to(slash.scale,{x:1,y:.32,duration:.055,ease:'power4.out'},at-.04+index*.035);timeline.to(slash,{alpha:0,duration:.22,ease:'power2.in'},at+.12+index*.035)});
      timeline.to(display.ring.scale,{x:4.1,y:4.1,duration:.3,ease:'expo.out'},at+.02);timeline.to(display.ring,{alpha:0,duration:.18},at+.18);
      display.afterimages.forEach((echo,index)=>{timeline.to(echo.scale,{x:2.2,y:2.2,duration:.16,ease:'power3.out'},revealAt+index*.035);timeline.to(echo,{alpha:0,duration:.22},at+.08+index*.035)});
    }else{
      display.rings.forEach((ring,index)=>{timeline.to(ring.scale,{x:1.6+index*.55,y:1.6+index*.55,duration:.24+index*.035,ease:'power2.out'},revealAt+index*.015);timeline.to(ring,{alpha:.18,duration:.28},at+.09+index*.02)});
      timeline.to(display.core.scale,{x:1.65,y:1.65,duration:.18,ease:'back.out(2.5)'},revealAt);
      timeline.to(display.beamHost,{alpha:1,duration:.035,ease:'none'},at);
      timeline.to(display.beamHost.scale,{x:display.beamHost._targetScaleX||1,y:1,duration:.15,ease:'power4.out'},at);
      timeline.to(display.beamHost,{alpha:0,duration:.25,ease:'power2.in'},at+.22);
      timeline.to(display.impactRing.scale,{x:4.25,y:4.25,duration:.34,ease:'expo.out'},at);timeline.to(display.impactRing,{alpha:0,duration:.2},at+.2);
      timeline.to(display.core,{alpha:0,duration:.22},at+.14);
    }
    timeline.to(display,{alpha:0,duration:.1,ease:'power2.in'},at+fullDuration-.1);
    timeline.call(()=>this.release(),[],at+fullDuration);
    return this;
  }

  release(){
    if(this.released)return;this.released=true;
    if(this.display instanceof AnimatedSprite){this.display.stop();this.display.removeFromParent();this.display.destroy();return}
    SkillEffectFX.recycleDisplay(this.kind,this.display);
  }
}

function targetVisual(target){
  if(target?.mainSprite?.visible)return target.mainSprite;
  if(target?.fullBodySprite?.visible)return target.fullBodySprite;
  if(target?.rig?.root)return target.rig.root;
  return target?.view||target?.root||target||null;
}

const activeWhiteFlashes=new WeakMap();

/** Flash only the combat body, never its HUD, for exactly 50ms by default. */
export function triggerWhiteFlash(target,{durationMs=50}={}){
  const visual=targetVisual(target);
  if(!visual)return {release(){}};
  activeWhiteFlashes.get(visual)?.release();
  const filter=new ColorMatrixFilter();
  filter.matrix=new Float32Array([0,0,0,0,1,0,0,0,0,1,0,0,0,0,1,0,0,0,1,0]);
  const previous=Array.isArray(visual.filters)?visual.filters.filter(Boolean):[];
  visual.filters=[...previous,filter];
  let active=true;let timer=0;
  const release=()=>{
    if(!active)return;active=false;clearTimeout(timer);
    visual.filters=(Array.isArray(visual.filters)?visual.filters:[]).filter(item=>item!==filter);
    if(activeWhiteFlashes.get(visual)?.filter===filter)activeWhiteFlashes.delete(visual);
    filter.destroy?.();
  };
  const handle={filter,release};activeWhiteFlashes.set(visual,handle);
  timer=setTimeout(release,Math.max(0,Number(durationMs)||50));return handle;
}
