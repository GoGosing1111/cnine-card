import {AnimatedSprite, Assets, ColorMatrixFilter, Container, Graphics} from 'pixi.js';

export const SKILL_EFFECT_KIND=Object.freeze({
  ATTACK:'ATTACK',
  DEFENSE:'DEFENSE',
  SPEED:'SPEED',
  HP:'HP',
  HEAL:'HP'
});

export const ROLE_EFFECT_PROFILE=Object.freeze({
  ATTACK:{accent:0xff3b4f,secondary:0xffbd38,label:'ARMOR BREAK',blendMode:'add',shake:22,hitStop:86},
  DEFENSE:{accent:0x38b9ff,secondary:0xe8f8ff,label:'GUARD CRUSH',blendMode:'screen',shake:18,hitStop:105},
  SPEED:{accent:0xa667ff,secondary:0x49ecff,label:'MULTI STRIKE',blendMode:'add',shake:14,hitStop:55},
  HP:{accent:0x45ec9a,secondary:0xffd96b,label:'VITAL DRAIN',blendMode:'screen',shake:17,hitStop:92}
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
  [-.76,.58].forEach((angle,index)=>{
    const group=new Container();
    group.rotation=angle;
    const shadow=new Graphics().poly([-174,-14,135,-8,192,0,135,8,-174,14]).fill({color:0x140005,alpha:.92});
    const edge=new Graphics().poly([-170,-7,145,-4,202,0,145,4,-170,7]).fill({color:index?profile.secondary:profile.accent,alpha:.98});
    const core=new Graphics().poly([-145,-2,155,-1,207,0,155,1,-145,2]).fill({color:0xffffff,alpha:.96});
    edge.blendMode='add';core.blendMode='add';
    group.addChild(shadow,edge,core);
    root.addChild(group);root.arcs.push(group);
  });
  root.ring=new Graphics().ellipse(0,0,92,30).stroke({width:9,color:profile.secondary,alpha:.86});
  root.ring.blendMode='screen';root.addChild(root.ring);
  root.shards=[];
  for(let index=0;index<14;index+=1){
    const angle=Math.PI*2*index/14;
    const shard=addRay(root,{length:30+(index%4)*10,width:3+(index%2),angle,color:index%3?profile.accent:0xffffff,alpha:.92});
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
  const inner=new Graphics().poly([0,-65,49,-34,44,29,0,65,-44,29,-49,-34]).stroke({width:4,color:0xffffff,alpha:.9});
  root.rings=[0,1].map(index=>{
    const ring=new Graphics().ellipse(0,18,82+index*38,32+index*13).stroke({width:7-index*2,color:index?profile.accent:profile.secondary,alpha:.82-index*.12});
    root.addChild(ring);return ring;
  });
  root.addChild(root.shield,inner);
  root.fragments=[];
  for(let index=0;index<10;index+=1){
    const angle=Math.PI*2*index/10;
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
    const length=220-index*18;
    const streak=addRay(root,{length,width:8-index*.65,angle:-.18+(index-3)*.025,color:index%3===0?0xffffff:index%2?profile.secondary:profile.accent,alpha:.94-index*.055});
    streak.position.set(-105-index*12,-54+index*18);streak._baseX=streak.x;root.streaks.push(streak);
  }
  root.ring=new Graphics().ellipse(0,0,84,28).stroke({width:6,color:profile.secondary,alpha:.82});
  root.ring.rotation=-.13;root.ring.blendMode='add';root.addChild(root.ring);
  root.afterimages=[];
  for(let index=0;index<3;index+=1){
    const echo=new Graphics().poly([-82,-20,54,-13,102,0,54,13,-82,20]).stroke({width:3,color:profile.accent,alpha:.32-index*.07});
    echo.position.x=-42-index*30;root.addChild(echo);root.afterimages.push(echo);
  }
  return root;
}

function makeHpFx(profile){
  const root=new Container({label:'ROLE_FX_HP'});
  root.rings=[0,1,2].map(index=>{
    const ring=new Graphics().ellipse(0,12,55+index*31,20+index*11).stroke({width:8-index*1.5,color:index===1?profile.secondary:profile.accent,alpha:.9-index*.14});
    ring.rotation=index*.16;root.addChild(ring);return ring;
  });
  root.tendrils=[];
  for(let index=0;index<8;index+=1){
    const angle=Math.PI*2*index/8;
    const tendril=new Graphics().moveTo(0,0).bezierCurveTo(30,-34,60,34,104,0).stroke({width:5,color:index%2?profile.secondary:profile.accent,alpha:.72});
    tendril.rotation=angle;tendril.blendMode='screen';root.addChild(tendril);root.tendrils.push(tendril);
  }
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
  display.alpha=0;display.visible=false;display.rotation=0;display.scale.set(.3);
  if(kind===SKILL_EFFECT_KIND.ATTACK){
    display.arcs?.forEach(arc=>{arc.alpha=1;arc.scale.set(.12,1)});
    if(display.ring){display.ring.alpha=.86;display.ring.scale.set(.25)}
    display.shards?.forEach(shard=>{shard.alpha=1;shard.scale.set(1);shard.position.set(Math.cos(shard._angle)*30,Math.sin(shard._angle)*22)});
  }else if(kind===SKILL_EFFECT_KIND.DEFENSE){
    if(display.shield){display.shield.alpha=1;display.shield.scale.set(.45)}
    display.rings?.forEach(ring=>{ring.alpha=1;ring.scale.set(.35)});
    display.fragments?.forEach(fragment=>{fragment.alpha=1;fragment.position.set(Math.cos(fragment._angle)*70,Math.sin(fragment._angle)*54)});
  }else if(kind===SKILL_EFFECT_KIND.SPEED){
    display.streaks?.forEach(streak=>{streak.alpha=1;streak.x=streak._baseX-90;streak.scale.set(.15,1)});
    if(display.ring){display.ring.alpha=1;display.ring.scale.set(.3)}
    display.afterimages?.forEach(echo=>{echo.alpha=.32;echo.scale.set(.75)});
  }else{
    display.rings?.forEach(ring=>{ring.alpha=1;ring.scale.set(.3)});
    display.tendrils?.forEach(tendril=>{tendril.alpha=.72;tendril.scale.set(.35)});
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

  static create({kind=SKILL_EFFECT_KIND.ATTACK,x=0,y=0}={}){
    const normalized=normalizeSkillEffectKind(kind);
    const spec=SKILL_EFFECT_ASSETS[normalized];
    const cached=this.atlasCache.get(normalized);
    const frames=Array.isArray(cached)?cached:null;
    const display=frames?.length?new AnimatedSprite({textures:frames,autoUpdate:true}):this.acquireDisplay(normalized);
    if(display instanceof AnimatedSprite){display.anchor.set(.5);display.loop=false;display.animationSpeed=spec.animationSpeed}
    resetPlaceholder(display,normalized);applyWebGLBlendTree(display,spec.blendMode);
    display.position.set(Math.round(x),Math.round(y));
    return new SkillEffectFX({kind:normalized,display,spec,usesAtlas:Boolean(frames?.length)});
  }

  constructor({kind,display,spec,usesAtlas=false}){
    this.kind=kind;this.display=display;this.spec=spec;this.usesAtlas=usesAtlas;this.released=false;
  }

  attach(layer){if(!this.released&&!this.display.parent)layer.addChild(this.display);return this}

  play(timeline,{at=.35,duration=.24}={}){
    const display=this.display;
    timeline.call(()=>{if(this.released)return;display.visible=true;display.alpha=1;if(display instanceof AnimatedSprite)display.gotoAndPlay(0)},[],at);
    if(this.kind===SKILL_EFFECT_KIND.ATTACK){
      display.arcs?.forEach((arc,index)=>{timeline.to(arc.scale,{x:1,duration:.075,ease:'power4.out'},at+index*.018);timeline.to(arc,{alpha:0,duration:.15,ease:'power2.in'},at+.08)});
      timeline.to(display.ring?.scale||display.scale,{x:1.65,y:1.65,duration:.13,ease:'expo.out'},at);
      display.shards?.forEach((shard,index)=>timeline.to(shard,{x:Math.cos(shard._angle)*(118+(index%4)*17),y:Math.sin(shard._angle)*(86+(index%3)*14),alpha:0,duration:.18,ease:'power3.out'},at+.018));
    }else if(this.kind===SKILL_EFFECT_KIND.DEFENSE){
      timeline.to(display.shield.scale,{x:1.2,y:1.2,duration:.095,ease:'back.out(2.4)'},at);
      display.rings.forEach((ring,index)=>{timeline.to(ring.scale,{x:1.7+index*.3,y:1.7+index*.3,duration:.16+index*.035,ease:'expo.out'},at);timeline.to(ring,{alpha:0,duration:.13},at+.08+index*.025)});
      display.fragments.forEach((fragment,index)=>timeline.to(fragment,{x:Math.cos(fragment._angle)*(128+(index%3)*18),y:Math.sin(fragment._angle)*(96+(index%3)*12),alpha:0,duration:.19,ease:'power3.out'},at+.025));
    }else if(this.kind===SKILL_EFFECT_KIND.SPEED){
      display.streaks.forEach((streak,index)=>{timeline.to(streak.scale,{x:1,duration:.045,ease:'power4.out'},at+index*.008);timeline.to(streak,{x:streak._baseX+155,alpha:0,duration:.13,ease:'power3.in'},at+.035+index*.006)});
      timeline.to(display.ring.scale,{x:1.8,y:1.8,duration:.12,ease:'expo.out'},at+.02);timeline.to(display.ring,{alpha:0,duration:.09},at+.08);
      display.afterimages.forEach((echo,index)=>{timeline.to(echo.scale,{x:1.35,y:1.35,duration:.09,ease:'power3.out'},at+index*.018);timeline.to(echo,{alpha:0,duration:.1},at+.05+index*.018)});
    }else{
      display.rings.forEach((ring,index)=>{timeline.to(ring.scale,{x:1.45+index*.25,y:1.45+index*.25,duration:.17+index*.025,ease:'expo.out'},at+index*.012);timeline.to(ring,{alpha:0,duration:.12},at+.09+index*.02)});
      display.tendrils.forEach((tendril,index)=>{timeline.to(tendril.scale,{x:1,y:1,duration:.14,ease:'power3.out'},at+index*.006);timeline.to(tendril,{alpha:0,duration:.12},at+.1)});
      timeline.to(display.core.scale,{x:1.4,y:1.4,duration:.09,ease:'back.out(2.5)'},at);timeline.to(display.core,{alpha:0,duration:.13},at+.08);
    }
    timeline.to(display,{alpha:0,duration:.08,ease:'power2.in'},at+Math.max(.13,duration-.08));
    timeline.call(()=>this.release(),[],at+duration);
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
