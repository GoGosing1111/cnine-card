import {AnimatedSprite, Assets} from 'pixi.js';

const ASSET_VERSION='1-v3-advancement-awakening';
const FRAME_COUNT=12;

export const ADVANCEMENT_EFFECT_PROFILES=Object.freeze({
  SHATTER:Object.freeze({
    code:'SHATTER',title:'파쇄자 · 홍련 용각성',atlasVersion:3,framePrefix:'shatter_',
    fps:24,collisionFrame:6,impactAt:.42,scale:1.34,alpha:.98,hitStopMs:82,shake:22
  }),
  RIPOSTE:Object.freeze({
    code:'RIPOSTE',title:'반격자 · 역전의 방벽',atlasVersion:1,framePrefix:'riposte_',
    fps:20,collisionFrame:7,impactAt:.46,scale:1.3,alpha:.97,hitStopMs:104,shake:18
  }),
  AFTERIMAGE:Object.freeze({
    code:'AFTERIMAGE',title:'잔영자 · 시공매 초월가속',atlasVersion:3,framePrefix:'afterimage_',
    fps:28,collisionFrame:6,impactAt:.32,scale:1.28,alpha:.97,hitStopMs:32,shake:8
  }),
  IMMORTAL:Object.freeze({
    code:'IMMORTAL',title:'불멸자 · 세계수 완전개화',atlasVersion:3,framePrefix:'immortal_',
    fps:18,collisionFrame:8,impactAt:.5,scale:1.24,alpha:.96,hitStopMs:76,shake:10
  })
});

export const ADVANCEMENT_EFFECT_ASSETS=Object.freeze(Object.fromEntries(
  Object.entries(ADVANCEMENT_EFFECT_PROFILES).map(([code,profile])=>[
    code,
    Object.freeze({
      atlasPath:`/assets/ui/project-v/fx/advancement-awakening-v1/${code.toLowerCase()}-advancement-atlas-v${profile.atlasVersion}.json?v=${ASSET_VERSION}`,
      framePrefix:profile.framePrefix,frameCount:FRAME_COUNT,fps:profile.fps,
      collisionFrame:profile.collisionFrame,impactAt:profile.impactAt,
      blendMode:'screen',scale:profile.scale,alpha:profile.alpha
    })
  ])
));

export function normalizeAdvancementEffectCode(value){
  const code=String(value||'').trim().toUpperCase();
  return ADVANCEMENT_EFFECT_PROFILES[code]?code:'';
}

export function advancementEffectProfile(value){
  return ADVANCEMENT_EFFECT_PROFILES[normalizeAdvancementEffectCode(value)]||null;
}

function atlasFrames(resource,spec){
  const textures=resource?.textures||resource?.data?.textures||{};
  const frames=Object.entries(textures)
    .filter(([name])=>name.startsWith(spec.framePrefix))
    .sort(([left],[right])=>left.localeCompare(right,undefined,{numeric:true}))
    .slice(0,spec.frameCount)
    .map(([,texture])=>texture);
  if(frames.length!==spec.frameCount){
    throw new Error(`V3_ADVANCEMENT_ATLAS_FRAME_MISMATCH:${spec.atlasPath}:${frames.length}/${spec.frameCount}`);
  }
  return frames;
}

/**
 * Atlas-only advancement renderer. Only server-authoritative activation codes
 * are allowed to create an effect. There is deliberately no procedural or
 * role-atlas fallback, and the Pixi ticker never advances authored frames.
 */
export class AdvancementEffectFX{
  static atlasCache=new Map();
  static failures=new Map();
  static retainedCodes=new Set();
  static activeCounts=new Map();

  static async preload(value){
    const code=normalizeAdvancementEffectCode(value);
    if(!code)return [];
    const cached=this.atlasCache.get(code);
    if(Array.isArray(cached))return cached;
    if(cached instanceof Promise)return cached;
    const spec=ADVANCEMENT_EFFECT_ASSETS[code];
    const pending=Assets.load(spec.atlasPath).then(resource=>{
      const frames=atlasFrames(resource,spec);
      this.atlasCache.set(code,frames);
      this.failures.delete(code);
      // A rapid session swap can retire a code while its network/decode work is
      // still in flight. Release that late result instead of pinning a stale
      // 2048px atlas in mobile WebGL memory until the next battle.
      if(!this.retainedCodes.has(code)&&(this.activeCounts.get(code)||0)===0)void this.unloadCode(code);
      return frames;
    }).catch(error=>{
      this.atlasCache.delete(code);
      this.failures.set(code,error);
      console.error(`[V3 advancement FX] ${code} atlas unavailable; no fallback is used`,error);
      return [];
    });
    this.atlasCache.set(code,pending);
    return pending;
  }

  static async preloadMany(values=[]){
    const codes=[...new Set((Array.isArray(values)?values:[]).map(normalizeAdvancementEffectCode).filter(Boolean))];
    const loaded=await Promise.all(codes.map(code=>this.preload(code)));
    return Object.fromEntries(codes.map((code,index)=>[code,loaded[index].length===FRAME_COUNT]));
  }

  static async unloadCode(value){
    const code=normalizeAdvancementEffectCode(value);
    if(!code||this.retainedCodes.has(code)||(this.activeCounts.get(code)||0)>0)return false;
    const spec=ADVANCEMENT_EFFECT_ASSETS[code];
    this.atlasCache.delete(code);
    this.failures.delete(code);
    try{await Assets.unload(spec.atlasPath)}catch(error){
      console.warn(`[V3 advancement FX] ${code} stale atlas release failed`,error);
      return false;
    }
    return true;
  }

  static async retain(values=[]){
    const next=new Set((Array.isArray(values)?values:[]).map(normalizeAdvancementEffectCode).filter(Boolean));
    const stale=[...this.atlasCache.keys()].filter(code=>!next.has(code));
    this.retainedCodes=next;
    await Promise.allSettled(stale.map(code=>this.unloadCode(code)));
    return [...next];
  }

  static create(value,{x=0,y=0,scale=1}={}){
    const code=normalizeAdvancementEffectCode(value);
    const spec=ADVANCEMENT_EFFECT_ASSETS[code];
    const frames=this.atlasCache.get(code);
    if(!spec||!Array.isArray(frames)||frames.length!==spec.frameCount){
      return new AdvancementEffectFX({code,display:null,spec});
    }
    const display=new AnimatedSprite({textures:frames,autoUpdate:false});
    display.label=`V3_ADVANCEMENT_ATLAS_${code}`;
    display.anchor.set(.5);
    display.position.set(Math.round(x),Math.round(y));
    display.scale.set(spec.scale*Math.max(.5,Number(scale)||1));
    display.alpha=0;
    display.visible=false;
    display.loop=false;
    display.eventMode='none';
    display.blendMode=spec.blendMode;
    this.activeCounts.set(code,(this.activeCounts.get(code)||0)+1);
    return new AdvancementEffectFX({code,display,spec});
  }

  constructor({code,display,spec}){
    this.code=code;
    this.display=display;
    this.spec=spec;
    this.released=false;
  }

  attach(layer){
    if(!this.released&&this.display&&!this.display.parent)layer.addChild(this.display);
    return this;
  }

  play(timeline,{impactAt=.25}={}){
    if(!this.display||this.released)return this;
    const display=this.display;
    const impact=Math.max(.05,Number(impactAt)||.25);
    const preDuration=Math.min(impact,this.spec.collisionFrame/this.spec.fps);
    const postDuration=(this.spec.frameCount-1-this.spec.collisionFrame)/this.spec.fps;
    const revealAt=Math.max(0,impact-preDuration);
    const releaseAt=impact+postDuration+.1;
    const frameState={value:0};
    const renderFrame=()=>display.gotoAndStop(Math.max(0,Math.min(this.spec.frameCount-1,Math.floor(frameState.value))));
    timeline.call(()=>{
      if(this.released||!this.display)return;
      display.visible=true;
      display.alpha=this.spec.alpha;
      display.gotoAndStop(0);
    },[],revealAt);
    timeline.to(frameState,{value:this.spec.collisionFrame,duration:preDuration,ease:'none',onUpdate:renderFrame},revealAt);
    timeline.to(frameState,{value:this.spec.frameCount-1,duration:postDuration,ease:'none',onUpdate:renderFrame},impact);
    timeline.to(display,{alpha:0,duration:.09,ease:'power2.in'},releaseAt-.09);
    timeline.call(()=>this.release(),[],releaseAt);
    return this;
  }

  release(){
    if(this.released)return;
    this.released=true;
    if(this.display){
      this.display.stop();
      this.display.removeFromParent();
      this.display.destroy();
      this.display=null;
      this.constructor.activeCounts.set(this.code,Math.max(0,(this.constructor.activeCounts.get(this.code)||1)-1));
    }
    if(!this.constructor.retainedCodes.has(this.code))void this.constructor.unloadCode(this.code);
  }

  static diagnostics(){
    return {
      renderer:'atlas-only',frameClock:'gsap-only',autoUpdate:false,frameCount:FRAME_COUNT,
      blendMode:'screen',ready:[...this.atlasCache.entries()].filter(([,frames])=>Array.isArray(frames)&&frames.length===FRAME_COUNT).map(([code])=>code),
      retained:[...this.retainedCodes],failures:[...this.failures.keys()],proceduralFallback:false,eagerPreloadAll:false
    };
  }
}
