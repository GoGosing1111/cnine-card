import {AnimatedSprite, Assets} from 'pixi.js';

export const ADVANCEMENT_EFFECTS=Object.freeze({
  SHATTER:Object.freeze({
    code:'SHATTER',title:'파쇄자 · 홍련 용각성',role:'attack',concept:'awakening-dragon',
    atlas:'shatter',assetVersion:3,framePrefix:'shatter_',
    fps:24,collisionFrame:6,impactAt:.42,scale:1.34,alpha:.98,hitStopMs:82,shake:22
  }),
  RIPOSTE:Object.freeze({
    code:'RIPOSTE',title:'반격자 · 역전의 방벽',role:'counter',concept:'counter-guard',
    atlas:'riposte',assetVersion:1,framePrefix:'riposte_',
    fps:20,collisionFrame:7,impactAt:.46,scale:1.3,alpha:.97,hitStopMs:104,shake:18
  }),
  AFTERIMAGE:Object.freeze({
    code:'AFTERIMAGE',title:'잔영자 · 시공매 초월가속',role:'speed',concept:'awakening-chrono-falcon',
    atlas:'afterimage',assetVersion:3,framePrefix:'afterimage_',
    fps:28,collisionFrame:6,impactAt:.32,scale:1.28,alpha:.97,hitStopMs:32,shake:8
  }),
  IMMORTAL:Object.freeze({
    code:'IMMORTAL',title:'불멸자 · 세계수 완전개화',role:'heal',concept:'awakening-world-tree',
    atlas:'immortal',assetVersion:3,framePrefix:'immortal_',
    fps:18,collisionFrame:8,impactAt:.5,scale:1.24,alpha:.96,hitStopMs:76,shake:10
  })
});

const PREVIEW_ASSET_VERSION='3-role-awakening-fx';
const FRAME_COUNT=12;

export const ADVANCEMENT_ATLASES=Object.freeze(Object.fromEntries(
  Object.entries(ADVANCEMENT_EFFECTS).map(([code,profile])=>[
    code,
    Object.freeze({
      path:`assets/atlases/${profile.atlas}-advancement-atlas-v${profile.assetVersion}.json?v=${PREVIEW_ASSET_VERSION}`,
      assetVersion:profile.assetVersion,
      framePrefix:profile.framePrefix,
      frameCount:FRAME_COUNT,
      fps:profile.fps,
      collisionFrame:profile.collisionFrame,
      blendMode:'screen',
      scale:profile.scale,
      alpha:profile.alpha
    })
  ])
));

function atlasFrames(resource,spec){
  const textures=resource?.textures||resource?.data?.textures||{};
  let entries=Object.entries(textures)
    .filter(([name])=>name.startsWith(spec.framePrefix));
  // Authoring tools may retain a neutral prefix. Accept it only when the atlas
  // still contains exactly the twelve authored frames for this one effect.
  if(entries.length!==spec.frameCount&&Object.keys(textures).length===spec.frameCount){
    entries=Object.entries(textures);
  }
  const frames=entries
    .sort(([left],[right])=>left.localeCompare(right,undefined,{numeric:true}))
    .slice(0,spec.frameCount)
    .map(([,texture])=>texture);
  if(frames.length!==spec.frameCount){
    throw new Error(`ADVANCEMENT_ATLAS_FRAME_MISMATCH:${spec.path}:${frames.length}/${spec.frameCount}`);
  }
  return frames;
}

export class AdvancementEffectFX{
  static atlasCache=new Map();
  static failures=new Map();

  static async preload(code,{force=false}={}){
    const normalized=String(code||'').toUpperCase();
    const spec=ADVANCEMENT_ATLASES[normalized];
    if(!spec)throw new Error(`UNKNOWN_ADVANCEMENT_EFFECT:${normalized}`);
    if(force)this.atlasCache.delete(normalized);
    const cached=this.atlasCache.get(normalized);
    if(Array.isArray(cached))return cached;
    if(cached instanceof Promise)return cached;
    const pending=Assets.load(spec.path).then(resource=>{
      const frames=atlasFrames(resource,spec);
      this.atlasCache.set(normalized,frames);
      this.failures.delete(normalized);
      return frames;
    }).catch(error=>{
      this.atlasCache.delete(normalized);
      this.failures.set(normalized,error);
      console.error(`[Advancement preview] ${normalized} atlas unavailable; no fallback is used.`,error);
      return [];
    });
    this.atlasCache.set(normalized,pending);
    return pending;
  }

  static async preloadAll(){
    const codes=Object.keys(ADVANCEMENT_ATLASES);
    const loaded=await Promise.all(codes.map(code=>this.preload(code)));
    return Object.fromEntries(codes.map((code,index)=>[code,loaded[index].length===FRAME_COUNT]));
  }

  static create(code,{x=0,y=0,scale=1}={}){
    const normalized=String(code||'').toUpperCase();
    const spec=ADVANCEMENT_ATLASES[normalized];
    const frames=this.atlasCache.get(normalized);
    if(!spec||!Array.isArray(frames)||frames.length!==spec.frameCount){
      return new AdvancementEffectFX({code:normalized,display:null,spec});
    }
    const display=new AnimatedSprite({textures:frames,autoUpdate:false});
    display.label=`ADVANCEMENT_${normalized}_ATLAS`;
    display.anchor.set(.5);
    display.position.set(Math.round(x),Math.round(y));
    display.scale.set(spec.scale*Math.max(.5,Number(scale)||1));
    display.alpha=0;
    display.visible=false;
    display.loop=false;
    display.eventMode='none';
    display.blendMode=spec.blendMode;
    return new AdvancementEffectFX({code:normalized,display,spec});
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

  play(timeline,{impactAt=.42,onFrame=()=>{}}={}){
    if(!this.display||this.released)return this;
    const display=this.display;
    const impact=Math.max(.08,Number(impactAt)||.42);
    const preDuration=Math.min(impact,this.spec.collisionFrame/this.spec.fps);
    const postDuration=(this.spec.frameCount-1-this.spec.collisionFrame)/this.spec.fps;
    const revealAt=Math.max(0,impact-preDuration);
    const releaseAt=impact+postDuration+.1;
    const frameState={value:0};
    const renderFrame=()=>{
      const frame=Math.max(0,Math.min(this.spec.frameCount-1,Math.floor(frameState.value)));
      display.gotoAndStop(frame);
      onFrame(frame);
    };
    timeline.call(()=>{
      if(this.released||!this.display)return;
      display.visible=true;
      display.alpha=this.spec.alpha;
      display.gotoAndStop(0);
      onFrame(0);
    },[],revealAt);
    // GSAP is the only frame clock. The first tween terminates on the authored
    // collision frame at the exact logical impact time, where hit-stop begins.
    timeline.to(frameState,{value:this.spec.collisionFrame,duration:preDuration,ease:'none',onUpdate:renderFrame},revealAt);
    timeline.to(frameState,{value:this.spec.frameCount-1,duration:postDuration,ease:'none',onUpdate:renderFrame},impact);
    timeline.to(display,{alpha:0,duration:.09,ease:'power2.in'},releaseAt-.09);
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
      renderer:'preview-local-pixi-animated-sprite',
      frameClock:'gsap-only',
      autoUpdate:false,
      frameContract:'12-frame-rgba',
      blendMode:'screen',
      ready:Object.keys(ADVANCEMENT_ATLASES).filter(code=>Array.isArray(this.atlasCache.get(code))),
      failures:[...this.failures.keys()],
      oneAtlasPerEffect:true,
      fallback:false
    };
  }
}
