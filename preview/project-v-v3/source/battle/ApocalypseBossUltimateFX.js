import {AnimatedSprite, Assets} from 'pixi.js';

const ASSET_VERSION='1-apocalypse-runtime';
const SPEC=Object.freeze({
  atlasPath:`/assets/ui/project-v/fx/apocalypse-boss-ultimate-v1/boss-ultimate-impact-atlas-v2.json?v=${ASSET_VERSION}`,
  framePrefix:'boss-ultimate_',
  frameCount:12,
  fps:17,
  collisionFrame:6,
  impactAt:.56,
  blendMode:'screen',
  scale:1.86,
  alpha:.96,
  hitStopMs:148,
  shake:34
});

function atlasFrames(resource){
  const textures=resource?.textures||resource?.data?.textures||{};
  const frames=Object.entries(textures)
    .filter(([name])=>name.startsWith(SPEC.framePrefix))
    .sort(([left],[right])=>left.localeCompare(right,undefined,{numeric:true}))
    .slice(0,SPEC.frameCount)
    .map(([,texture])=>texture);
  if(frames.length!==SPEC.frameCount){
    throw new Error(`APOCALYPSE_BOSS_ULTIMATE_ATLAS_FRAME_MISMATCH:${frames.length}/${SPEC.frameCount}`);
  }
  return frames;
}

/**
 * Authored in-battle Apocalypse finisher. It intentionally renders inside the
 * V3 EffectLayer: no video, DOM overlay, full-screen cutscene or procedural
 * substitute is allowed to replace a missing atlas.
 */
export class ApocalypseBossUltimateFX{
  static frames=null;
  static loadPromise=null;
  static failure=null;

  static async preload(){
    if(Array.isArray(this.frames))return this.frames;
    if(this.loadPromise)return this.loadPromise;
    this.loadPromise=Assets.load(SPEC.atlasPath).then(resource=>{
      this.frames=atlasFrames(resource);
      this.failure=null;
      return this.frames;
    }).catch(error=>{
      this.frames=null;
      this.failure=error;
      console.error('[V3 Apocalypse FX] boss ultimate atlas unavailable; no procedural fallback is used',error);
      return [];
    }).finally(()=>{this.loadPromise=null});
    return this.loadPromise;
  }

  static create({x=0,y=0,scale=1}={}){
    if(!Array.isArray(this.frames)||this.frames.length!==SPEC.frameCount){
      return new ApocalypseBossUltimateFX(null);
    }
    const display=new AnimatedSprite({textures:this.frames,autoUpdate:false});
    display.label='V3_APOCALYPSE_BOSS_ULTIMATE_ATLAS';
    display.anchor.set(.5);
    display.position.set(Math.round(x),Math.round(y));
    display.scale.set(SPEC.scale*Math.max(.5,Number(scale)||1));
    display.alpha=0;
    display.visible=false;
    display.loop=false;
    display.eventMode='none';
    display.blendMode=SPEC.blendMode;
    return new ApocalypseBossUltimateFX(display);
  }

  static async release(){
    this.frames=null;
    this.failure=null;
    try{await Assets.unload(SPEC.atlasPath)}catch{}
  }

  static diagnostics(){
    return {
      renderer:'pixi-animated-sprite-atlas-only',
      binding:'PVE_APOCALYPSE_BOSS_ULTIMATE',
      ready:Array.isArray(this.frames)&&this.frames.length===SPEC.frameCount,
      failed:Boolean(this.failure),
      frameCount:SPEC.frameCount,
      collisionFrame:SPEC.collisionFrame,
      impactAtMs:Math.round(SPEC.impactAt*1000),
      hitStopMs:SPEC.hitStopMs,
      proceduralFallback:false,
      screenOverlay:false
    };
  }

  constructor(display){
    this.display=display;
    this.released=false;
  }

  attach(layer){
    if(!this.released&&this.display&&!this.display.parent)layer.addChild(this.display);
    return this;
  }

  play(timeline,{impactAt=SPEC.impactAt}={}){
    if(!this.display||this.released)return this;
    const display=this.display;
    const impact=Math.max(.1,Number(impactAt)||SPEC.impactAt);
    const preDuration=SPEC.collisionFrame/SPEC.fps;
    const postDuration=(SPEC.frameCount-1-SPEC.collisionFrame)/SPEC.fps;
    const revealAt=Math.max(0,impact-preDuration);
    const releaseAt=impact+postDuration+.12;
    const frameState={value:0};
    const renderFrame=()=>display.gotoAndStop(Math.max(0,Math.min(SPEC.frameCount-1,Math.floor(frameState.value))));
    timeline.call(()=>{
      if(this.released||!this.display)return;
      display.visible=true;
      display.alpha=SPEC.alpha;
      display.gotoAndStop(0);
    },[],revealAt);
    timeline.to(frameState,{value:SPEC.collisionFrame,duration:preDuration,ease:'none',onUpdate:renderFrame},revealAt);
    timeline.to(frameState,{value:SPEC.frameCount-1,duration:postDuration,ease:'none',onUpdate:renderFrame},impact);
    timeline.to(display,{alpha:0,duration:.1,ease:'power2.in'},releaseAt-.1);
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
}

export const APOCALYPSE_BOSS_ULTIMATE_PROFILE=SPEC;
