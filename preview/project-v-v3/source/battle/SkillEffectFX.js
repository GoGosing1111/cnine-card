import {AnimatedSprite, Assets, ColorMatrixFilter, Container, Graphics} from 'pixi.js';

export const SKILL_EFFECT_KIND=Object.freeze({
  ATTACK:'ATTACK',
  DEFENSE:'DEFENSE',
  SPEED:'SPEED',
  HEAL:'HEAL'
});

export const SKILL_EFFECT_ASSETS=Object.freeze({
  ATTACK:{atlasPath:'assets/fx/slash_sheet.json',framePrefix:'slash_',frameCount:12,animationSpeed:.58,blendMode:'add'},
  DEFENSE:{atlasPath:'assets/fx/defense_sheet.json',framePrefix:'defense_',frameCount:10,animationSpeed:.52,blendMode:'screen'},
  SPEED:{atlasPath:'assets/fx/speed_sheet.json',framePrefix:'speed_',frameCount:10,animationSpeed:.6,blendMode:'add'},
  HEAL:{atlasPath:'assets/fx/heal_sheet.json',framePrefix:'heal_',frameCount:12,animationSpeed:.5,blendMode:'screen'}
});

const normalizeKind=value=>SKILL_EFFECT_KIND[String(value||'ATTACK').toUpperCase()]||SKILL_EFFECT_KIND.ATTACK;

export function applyWebGLBlendTree(displayObject,mode='add'){
  if(!displayObject)return displayObject;
  displayObject.blendMode=displayObject.effectBlendMode||mode;
  displayObject.children?.forEach(child=>applyWebGLBlendTree(child,mode));
  return displayObject;
}

function makeAttackPlaceholder(){
  const root=new Container({label:'FX_PLACEHOLDER_ATTACK'});
  // Required 150 x 50 neon slash footprint (radius 75 x 25).
  const halo=new Graphics().ellipse(0,0,75,25).stroke({width:7,color:0xffef62,alpha:.72});
  const rim=new Graphics().ellipse(4,-1,70,20).stroke({width:3,color:0x56e7ff,alpha:.96});
  const core=new Graphics().roundRect(-72,-3,144,6,3).fill({color:0xffffff,alpha:.9});
  halo.effectBlendMode='screen';
  rim.effectBlendMode='add';
  core.effectBlendMode='add';
  root.addChild(halo,rim,core);
  root.rotation=-.16;
  return root;
}

function makeDefensePlaceholder(){
  const root=new Container({label:'FX_PLACEHOLDER_DEFENSE'});
  root.addChild(
    new Graphics().poly([0,-48,42,-25,38,29,0,52,-38,29,-42,-25]).stroke({width:6,color:0x56e7ff,alpha:.9}),
    new Graphics().poly([0,-35,29,-17,26,20,0,36,-26,20,-29,-17]).stroke({width:3,color:0xffef62,alpha:.82}),
    new Graphics().circle(0,0,18).fill({color:0xffffff,alpha:.18})
  );
  return root;
}

function makeSpeedPlaceholder(){
  const root=new Container({label:'FX_PLACEHOLDER_SPEED'});
  for(let index=0;index<5;index+=1){
    root.addChild(new Graphics()
      .roundRect(-78-index*8,-25+index*12,142-index*13,5,3)
      .fill({color:index%2?0xffef62:0x56e7ff,alpha:.88-index*.08}));
  }
  root.rotation=-.12;
  return root;
}

function makeHealPlaceholder(){
  const root=new Container({label:'FX_PLACEHOLDER_HEAL'});
  root.addChild(
    new Graphics().circle(0,0,45).stroke({width:5,color:0x56e7ff,alpha:.88}),
    new Graphics().circle(0,0,31).stroke({width:3,color:0xffef62,alpha:.72}),
    new Graphics().roundRect(-7,-28,14,56,5).fill({color:0xffffff,alpha:.85}),
    new Graphics().roundRect(-28,-7,56,14,5).fill({color:0xffffff,alpha:.85})
  );
  return root;
}

function makePlaceholder(kind){
  if(kind===SKILL_EFFECT_KIND.DEFENSE)return makeDefensePlaceholder();
  if(kind===SKILL_EFFECT_KIND.SPEED)return makeSpeedPlaceholder();
  if(kind===SKILL_EFFECT_KIND.HEAL)return makeHealPlaceholder();
  return makeAttackPlaceholder();
}

function atlasFrames(resource,spec){
  const textures=resource?.textures||resource?.data?.textures||{};
  const entries=Object.entries(textures)
    .filter(([name])=>name.startsWith(spec.framePrefix))
    .sort(([left],[right])=>left.localeCompare(right,undefined,{numeric:true}))
    .slice(0,spec.frameCount)
    .map(([,texture])=>texture);
  if(entries.length!==spec.frameCount){
    throw new Error(`SKILL_FX_ATLAS_FRAME_MISMATCH:${spec.atlasPath}:${entries.length}/${spec.frameCount}`);
  }
  return entries;
}

/**
 * EffectLayer-only skill FX handle.
 *
 * Placeholder mode is the current production-safe default. When final art is
 * delivered, call `SkillEffectFX.preload(kind, {useAtlas:true})`; the factory
 * then switches to `Assets.load('assets/fx/slash_sheet.json')` (or the matching
 * catalog path) and creates an AnimatedSprite without changing combat code.
 */
export class SkillEffectFX{
  static atlasCache=new Map();

  static async preload(kind,{useAtlas=false}={}){
    const normalized=normalizeKind(kind);
    if(!useAtlas)return null;
    if(this.atlasCache.has(normalized))return this.atlasCache.get(normalized);
    const spec=SKILL_EFFECT_ASSETS[normalized];
    const pending=Assets.load(spec.atlasPath).then(resource=>atlasFrames(resource,spec));
    this.atlasCache.set(normalized,pending);
    try{
      const frames=await pending;
      this.atlasCache.set(normalized,frames);
      return frames;
    }catch(error){
      this.atlasCache.delete(normalized);
      throw error;
    }
  }

  static create({kind=SKILL_EFFECT_KIND.ATTACK,x=0,y=0,accent=null}={}){
    const normalized=normalizeKind(kind);
    const spec=SKILL_EFFECT_ASSETS[normalized];
    const cached=this.atlasCache.get(normalized);
    const frames=Array.isArray(cached)?cached:null;
    const display=frames?.length
      ?new AnimatedSprite({textures:frames,autoUpdate:true})
      :makePlaceholder(normalized);
    if(display instanceof AnimatedSprite){
      display.anchor.set(.5);
      display.loop=false;
      display.animationSpeed=spec.animationSpeed;
      display.onComplete=()=>instance.release();
    }
    applyWebGLBlendTree(display,spec.blendMode);
    display.alpha=0;
    display.visible=false;
    display.scale.set(.3);
    display.position.set(Math.round(x),Math.round(y));
    if(accent!=null)display.effectAccent=accent;
    const instance=new SkillEffectFX({kind:normalized,display,spec,usesAtlas:Boolean(frames?.length)});
    return instance;
  }

  constructor({kind,display,spec,usesAtlas=false}){
    this.kind=kind;
    this.display=display;
    this.spec=spec;
    this.usesAtlas=usesAtlas;
    this.released=false;
  }

  attach(layer){
    if(!this.released&&!this.display.parent)layer.addChild(this.display);
    return this;
  }

  play(timeline,{at=.35,duration=.2}={}){
    const burstDuration=Math.min(.1,duration*.5);
    const fadeOut=Math.max(.06,duration-burstDuration);
    timeline.call(()=>{
      if(this.released)return;
      this.display.visible=true;
      this.display.alpha=1;
      this.display.scale.set(.3);
      if(this.display instanceof AnimatedSprite)this.display.gotoAndPlay(0);
    },[],at);
    timeline.to(this.display.scale,{x:1.5,y:1.5,duration:burstDuration,ease:'expo.out'},at);
    timeline.to(this.display,{alpha:0,duration:fadeOut,ease:'power2.in'},at+burstDuration);
    timeline.call(()=>this.release(),[],at+duration);
    return this;
  }

  release(){
    if(this.released)return;
    this.released=true;
    if(this.display instanceof AnimatedSprite){
      this.display.onComplete=null;
      this.display.stop();
    }
    this.display.removeFromParent();
    this.display.destroy({children:true});
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
  filter.matrix=new Float32Array([
    0,0,0,0,1,
    0,0,0,0,1,
    0,0,0,0,1,
    0,0,0,1,0
  ]);
  const previous=Array.isArray(visual.filters)?visual.filters.filter(Boolean):[];
  visual.filters=[...previous,filter];
  let active=true;
  let timer=0;
  const release=()=>{
    if(!active)return;
    active=false;
    clearTimeout(timer);
    visual.filters=(Array.isArray(visual.filters)?visual.filters:[]).filter(item=>item!==filter);
    if(activeWhiteFlashes.get(visual)?.filter===filter)activeWhiteFlashes.delete(visual);
    filter.destroy?.();
  };
  const handle={filter,release};
  activeWhiteFlashes.set(visual,handle);
  timer=setTimeout(release,Math.max(0,Number(durationMs)||50));
  return handle;
}
