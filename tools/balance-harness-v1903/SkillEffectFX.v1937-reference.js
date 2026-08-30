import {AnimatedSprite, Assets, ColorMatrixFilter} from 'pixi.js';

export const SKILL_EFFECT_KIND=Object.freeze({
  ATTACK:'ATTACK',
  DEFENSE:'DEFENSE',
  SPEED:'SPEED',
  HP:'HP',
  HEAL:'HP',
  // V1937: 판정 이펙트 6종. 전부 엔진에 이미 있는 판정에 붙는다(신규 메커니즘 0개).
  CRITICAL:'CRITICAL',
  DODGE:'DODGE',
  COUNTER:'COUNTER',
  REVIVE:'REVIVE',
  ULTIMATE:'ULTIMATE',
  BOSS_ULTIMATE:'BOSS_ULTIMATE'
});

// V1937: 판정 이펙트는 '누가 쓰느냐(계열)' 가 아니라 '무슨 일이 일어났느냐(판정)' 에 붙는다.
//   역할 이펙트(ATTACK/DEFENSE/SPEED/HP)와 동시에 뜨면 화면이 뭉개지므로
//   아래 우선순위로 한 번에 하나만 재생한다.
export const EVENT_EFFECT_PRIORITY=Object.freeze([
  'BOSS_ULTIMATE','REVIVE','ULTIMATE','COUNTER','CRITICAL','DODGE'
]);
export const EVENT_EFFECT_KINDS=Object.freeze(EVENT_EFFECT_PRIORITY.slice());

export const ROLE_EFFECT_PROFILE=Object.freeze({
  ATTACK:{accent:0xff493d,secondary:0xffbd6d,label:'CRIMSON BLADE',shake:22,hitStop:86},
  DEFENSE:{accent:0x45d8ff,secondary:0xd6f8ff,label:'AQUA GUARD',shake:18,hitStop:105},
  SPEED:{accent:0x42cfff,secondary:0xd9fbff,label:'LIGHTNING VELOCITY',shake:14,hitStop:55},
  HP:{accent:0x45eba0,secondary:0xd9ffe9,label:'VERDANT RESTORE',shake:12,hitStop:72},
  CRITICAL:{accent:0xff3b30,secondary:0xffd6c2,label:'CRITICAL',shake:26,hitStop:110},
  DODGE:{accent:0x8ee9ff,secondary:0xe6fbff,label:'DODGE',shake:8,hitStop:0},
  COUNTER:{accent:0x4aa8ff,secondary:0xffb3a7,label:'COUNTER',shake:20,hitStop:95},
  REVIVE:{accent:0x3fe0a4,secondary:0xffe9a8,label:'REVIVE',shake:10,hitStop:60},
  ULTIMATE:{accent:0xa06bff,secondary:0xffd97a,label:'ULTIMATE',shake:30,hitStop:140},
  BOSS_ULTIMATE:{accent:0x8c1f1f,secondary:0x2a2a2e,label:'BOSS ULTIMATE',shake:36,hitStop:170}
});

const ASSET_VERSION='3-v3-live-atlas';
const EVENT_ASSET_VERSION='1-v1937-event-fx';

export const SKILL_EFFECT_ASSETS=Object.freeze({
  ATTACK:{
    atlasPath:`/assets/ui/project-v/fx/role-impact-v2/attack-impact-atlas-v2.json?v=${ASSET_VERSION}`,
    framePrefix:'attack_',frameCount:12,fps:22,collisionFrame:6,blendMode:'screen',scale:1.46,alpha:.94
  },
  DEFENSE:{
    atlasPath:`/assets/ui/project-v/fx/role-impact-v2/defense-impact-atlas-v2.json?v=${ASSET_VERSION}`,
    framePrefix:'defense_',frameCount:12,fps:18,collisionFrame:7,blendMode:'screen',scale:1.4,alpha:.92
  },
  SPEED:{
    atlasPath:`/assets/ui/project-v/fx/role-impact-v2/speed-impact-atlas-v2.json?v=${ASSET_VERSION}`,
    framePrefix:'speed_',frameCount:12,fps:26,collisionFrame:8,blendMode:'screen',scale:1.46,alpha:.96
  },
  HP:{
    atlasPath:`/assets/ui/project-v/fx/role-impact-v2/heal-impact-atlas-v2.json?v=${ASSET_VERSION}`,
    framePrefix:'heal_',frameCount:12,fps:17,collisionFrame:8,blendMode:'screen',scale:.94,alpha:.9
  },
  // V1937: 판정 이펙트 6종.
  //   12프레임 512x455, 4x3 아틀라스 2048x1365, RGBA8888 PNG + PixiJS v8 JSON
  //   24fps = 500ms, 충돌 프레임 6 = 250ms, blend screen (제작 규격 그대로)
  CRITICAL:{
    atlasPath:`/assets/ui/project-v/fx/event-impact-v2/critical-impact-atlas-v2.json?v=${EVENT_ASSET_VERSION}`,
    framePrefix:'critical_',frameCount:12,fps:24,collisionFrame:6,blendMode:'screen',scale:1.52,alpha:.96
  },
  DODGE:{
    atlasPath:`/assets/ui/project-v/fx/event-impact-v2/dodge-impact-atlas-v2.json?v=${EVENT_ASSET_VERSION}`,
    framePrefix:'dodge_',frameCount:12,fps:24,collisionFrame:6,blendMode:'screen',scale:1.30,alpha:.90
  },
  COUNTER:{
    atlasPath:`/assets/ui/project-v/fx/event-impact-v2/counter-impact-atlas-v2.json?v=${EVENT_ASSET_VERSION}`,
    framePrefix:'counter_',frameCount:12,fps:24,collisionFrame:6,blendMode:'screen',scale:1.44,alpha:.94
  },
  REVIVE:{
    atlasPath:`/assets/ui/project-v/fx/event-impact-v2/revive-impact-atlas-v2.json?v=${EVENT_ASSET_VERSION}`,
    framePrefix:'revive_',frameCount:12,fps:24,collisionFrame:6,blendMode:'screen',scale:1.36,alpha:.94
  },
  ULTIMATE:{
    atlasPath:`/assets/ui/project-v/fx/event-impact-v2/ultimate-impact-atlas-v2.json?v=${EVENT_ASSET_VERSION}`,
    framePrefix:'ultimate_',frameCount:12,fps:24,collisionFrame:6,blendMode:'screen',scale:1.72,alpha:.97
  },
  BOSS_ULTIMATE:{
    atlasPath:`/assets/ui/project-v/fx/event-impact-v2/boss-ultimate-impact-atlas-v2.json?v=${EVENT_ASSET_VERSION}`,
    framePrefix:'boss-ultimate_',frameCount:12,fps:24,collisionFrame:6,blendMode:'screen',scale:1.86,alpha:.97
  }
});

export function isEventEffectKind(value){
  return EVENT_EFFECT_KINDS.includes(String(value||'').trim().toUpperCase());
}

export function normalizeSkillEffectKind(value){
  const raw=String(value||'ATTACK').trim().toUpperCase().replace(/-/g,'_');
  if(EVENT_EFFECT_KINDS.includes(raw))return raw;
  if(raw==='HEAL'||raw==='HEALER'||raw==='HEALTH'||raw==='VITAL')return SKILL_EFFECT_KIND.HP;
  if(raw==='DEF'||raw==='TANK'||raw==='GUARD')return SKILL_EFFECT_KIND.DEFENSE;
  if(raw==='AGILITY'||raw==='AGI'||raw==='FAST')return SKILL_EFFECT_KIND.SPEED;
  return SKILL_EFFECT_KIND[raw]||SKILL_EFFECT_KIND.ATTACK;
}

export function roleEffectProfile(kind){
  return ROLE_EFFECT_PROFILE[normalizeSkillEffectKind(kind)];
}

export function applyWebGLBlendTree(displayObject,mode='screen'){
  if(!displayObject)return displayObject;
  displayObject.blendMode=mode;
  displayObject.children?.forEach(child=>applyWebGLBlendTree(child,mode));
  return displayObject;
}

function atlasFrames(resource,spec){
  const textures=resource?.textures||resource?.data?.textures||{};
  const frames=Object.entries(textures)
    .filter(([name])=>name.startsWith(spec.framePrefix))
    .sort(([left],[right])=>left.localeCompare(right,undefined,{numeric:true}))
    .slice(0,spec.frameCount)
    .map(([,texture])=>texture);
  if(frames.length!==spec.frameCount){
    throw new Error(`V3_ROLE_ATLAS_FRAME_MISMATCH:${spec.atlasPath}:${frames.length}/${spec.frameCount}`);
  }
  return frames;
}

/**
 * Atlas-only Project V V3 role impact renderer.
 *
 * There is deliberately no Graphics/procedural fallback. If an asset is not
 * available the combat result still resolves, but the engine stays visually
 * silent instead of reviving the retired circle/slash effects.
 */
export class SkillEffectFX{
  static atlasCache=new Map();
  static preloadPromise=null;
  static failures=new Map();

  static async preload(kind){
    const normalized=normalizeSkillEffectKind(kind);
    const cached=this.atlasCache.get(normalized);
    if(Array.isArray(cached))return cached;
    if(cached instanceof Promise)return cached;
    const spec=SKILL_EFFECT_ASSETS[normalized];
    const pending=Assets.load(spec.atlasPath).then(resource=>{
      const frames=atlasFrames(resource,spec);
      this.atlasCache.set(normalized,frames);
      this.failures.delete(normalized);
      return frames;
    }).catch(error=>{
      this.atlasCache.delete(normalized);
      this.failures.set(normalized,error);
      console.error(`[V3 role FX] ${normalized} atlas unavailable; retired FX will not be used`,error);
      return [];
    });
    this.atlasCache.set(normalized,pending);
    return pending;
  }

  static preloadAll(){
    if(!this.preloadPromise){
      // V1937: 역할 4종은 필수, 판정 6종은 선택이다.
      //   판정 아틀라스가 없어도 전투는 그대로 진행되고 연출만 생략된다.
      const roleKinds=['ATTACK','DEFENSE','SPEED','HP'];
      this.preloadPromise=Promise.all(roleKinds.map(kind=>this.preload(kind)))
        .then(results=>{
          Promise.all(EVENT_EFFECT_KINDS.map(kind=>this.preload(kind))).catch(()=>{});
          return results.every(frames=>frames.length===12);
        })
        .finally(()=>{this.preloadPromise=null});
    }
    return this.preloadPromise;
  }

  static create({kind=SKILL_EFFECT_KIND.ATTACK,x=0,y=0,scale=1}={}){
    const normalized=normalizeSkillEffectKind(kind);
    const spec=SKILL_EFFECT_ASSETS[normalized];
    const cached=this.atlasCache.get(normalized);
    const frames=Array.isArray(cached)?cached:null;
    if(!frames?.length)return new SkillEffectFX({kind:normalized,display:null,spec});
    const display=new AnimatedSprite({textures:frames,autoUpdate:false});
    display.label=`V3_ROLE_ATLAS_${normalized}`;
    display.anchor.set(.5);
    display.position.set(Math.round(x),Math.round(y));
    display.scale.set(spec.scale*Math.max(.5,Number(scale)||1));
    display.alpha=0;
    display.visible=false;
    display.loop=false;
    display.eventMode='none';
    display.blendMode=spec.blendMode;
    return new SkillEffectFX({kind:normalized,display,spec});
  }

  constructor({kind,display,spec}){
    this.kind=kind;
    this.display=display;
    this.spec=spec;
    this.released=false;
  }

  attach(layer){
    if(!this.released&&this.display&&!this.display.parent)layer.addChild(this.display);
    return this;
  }

  play(timeline,{at=.35,playbackSpeed=1.3,duration=0}={}){
    if(!this.display||this.released)return this;
    const display=this.display;
    const impactAt=Math.max(.05,Number(at)||.35);
    const preCollisionDuration=Math.min(impactAt,this.spec.collisionFrame/this.spec.fps);
    const postCollisionDuration=(this.spec.frameCount-1-this.spec.collisionFrame)/this.spec.fps;
    const revealAt=Math.max(0,impactAt-preCollisionDuration);
    const releaseAt=Math.max(impactAt+postCollisionDuration+.08,Number(duration)||0);
    const frameState={value:0};
    const renderFrame=()=>display.gotoAndStop(Math.max(0,Math.min(this.spec.frameCount-1,Math.floor(frameState.value))));
    timeline.call(()=>{
      if(this.released||!this.display)return;
      display.visible=true;
      display.alpha=this.spec.alpha;
      display.gotoAndStop(0);
    },[],revealAt);
    // GSAP owns the atlas frame instead of Pixi's ticker. Timeline acceleration,
    // hit-stop, visibility cancellation and the authoritative hit hook therefore
    // stay frame-exact at every resolution and backlog speed.
    timeline.to(frameState,{value:this.spec.collisionFrame,duration:preCollisionDuration,ease:'none',onUpdate:renderFrame},revealAt);
    timeline.to(frameState,{value:this.spec.frameCount-1,duration:postCollisionDuration,ease:'none',onUpdate:renderFrame},impactAt);
    timeline.to(display,{alpha:0,duration:.09,ease:'power2.in'},Math.max(impactAt+.06,releaseAt-.09));
    timeline.call(()=>this.release(),[],releaseAt);
    return this;
  }

  release(){
    if(this.released)return;
    this.released=true;
    if(!this.display)return;
    this.display.stop();
    this.display.removeFromParent();
    this.display.destroy();
    this.display=null;
  }

  static diagnostics(){
    return {
      renderer:'atlas-only',
      ready:Object.keys(SKILL_EFFECT_ASSETS).filter(kind=>Array.isArray(this.atlasCache.get(kind))&&this.atlasCache.get(kind).length===12),
      failures:[...this.failures.keys()],
      proceduralFallback:false
    };
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
