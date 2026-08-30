import {AnimatedSprite, Assets} from 'pixi.js';

export const EVENT_EFFECTS=Object.freeze({
  critical:Object.freeze({
    id:'critical',index:'01',label:'CRITICAL',labelKo:'치명타',title:'CRITICAL IMPACT',
    accent:0xff536d,secondary:0xffc2a0,fps:24,collisionFrame:6,impactAt:.42,scale:1.42,alpha:.96,
    hitStop:82,shake:22,audio:'critical-combat-v4.mp3',audioSyncMs:250,audioDurationMs:1300,
    description:'짧은 선행 검풍 뒤 절제된 이중 칼날이 충돌하는 치명타 연출.',
    intent:'BINDING UNASSIGNED'
  }),
  counter:Object.freeze({
    id:'counter',index:'02',label:'COUNTER',labelKo:'반격',title:'COUNTER REVERSAL',
    accent:0x69d8ff,secondary:0xff8a64,fps:20,collisionFrame:6,impactAt:.46,scale:1.34,alpha:.95,
    hitStop:104,shake:18,audio:'counter-combat-v2.mp3',audioSyncMs:300,audioDurationMs:1180,
    description:'금속 방어 충돌을 먼저 세운 뒤 역방향 검풍으로 되받아치는 2단 반격 연출.',
    intent:'BINDING UNASSIGNED'
  }),
  ultimate:Object.freeze({
    id:'ultimate',index:'03',label:'ULTIMATE',labelKo:'궁극기',title:'ROYAL EXECUTION',
    accent:0xc88bff,secondary:0xffd97e,fps:18,collisionFrame:6,impactAt:.5,scale:1.62,alpha:.96,
    hitStop:122,shake:27,audio:'ultimate-combat-v2.mp3',audioSyncMs:333,audioDurationMs:2100,
    description:'마력 응축에서 대형 마검 절단과 지면 파열까지 이어지는 궁극기 피니시.',
    intent:'BINDING UNASSIGNED'
  }),
  'boss-ultimate':Object.freeze({
    id:'boss-ultimate',index:'04',label:'BOSS ULT.',labelKo:'보스 궁극기',title:'CALAMITY DESCENT',
    accent:0xff7b45,secondary:0xffd8a3,fps:17,collisionFrame:6,impactAt:.56,scale:1.86,alpha:.96,
    hitStop:148,shake:34,audio:'boss-ultimate-combat-v2.mp3',audioSyncMs:353,audioDurationMs:2650,
    description:'압력 강하와 거대 집행 타격, 붕괴 잔향을 화면 전역으로 확장한 보스 전멸기 연출.',
    intent:'BINDING UNASSIGNED'
  }),
  dodge:Object.freeze({
    id:'dodge',index:'05',label:'DODGE',labelKo:'회피',title:'PHANTOM STEP',
    accent:0x72eaff,secondary:0xe4ffff,fps:28,collisionFrame:5,impactAt:.32,scale:1.26,alpha:.93,
    hitStop:32,shake:8,audio:'dodge-combat-v2.mp3',audioSyncMs:178,audioDurationMs:860,
    description:'공기 절단이 빈 자리를 가르고 대상은 잔상만 남긴 채 측면으로 이탈하는 회피 연출.',
    intent:'BINDING UNASSIGNED'
  }),
  revive:Object.freeze({
    id:'revive',index:'06',label:'REVIVE',labelKo:'불굴 · 부활',title:'LAST STAND',
    accent:0x69f0b1,secondary:0xffe39b,fps:18,collisionFrame:6,impactAt:.5,scale:1.46,alpha:.94,
    hitStop:76,shake:10,audio:'revive-combat-v2.mp3',audioSyncMs:333,audioDurationMs:2400,
    description:'꺼진 생명력이 아래에서 역류하고 파편이 되감기며 전투 자세를 복구하는 부활 연출.',
    intent:'BINDING UNASSIGNED'
  })
});

const PREVIEW_VERSION='2-live-style-candidate';

export const EVENT_EFFECT_ASSETS=Object.freeze(Object.fromEntries(Object.values(EVENT_EFFECTS).map(profile=>[
  profile.id,
  Object.freeze({
    atlasPath:`assets/atlases/${profile.id}-impact-atlas-v2.json?v=${PREVIEW_VERSION}`,
    framePrefix:`${profile.id}_`,
    frameCount:12,
    fps:profile.fps,
    collisionFrame:profile.collisionFrame,
    blendMode:'screen',
    scale:profile.scale,
    alpha:profile.alpha
  })
])));

function atlasFrames(resource,spec){
  const textures=resource?.textures||resource?.data?.textures||{};
  const frames=Object.entries(textures)
    .filter(([name])=>name.startsWith(spec.framePrefix))
    .sort(([left],[right])=>left.localeCompare(right,undefined,{numeric:true}))
    .slice(0,spec.frameCount)
    .map(([,texture])=>texture);
  if(frames.length!==spec.frameCount){
    throw new Error(`EVENT_ATLAS_FRAME_MISMATCH:${spec.atlasPath}:${frames.length}/${spec.frameCount}`);
  }
  return frames;
}

export class EventEffectFX{
  static atlasCache=new Map();
  static failures=new Map();

  static async preload(id,{force=false}={}){
    const spec=EVENT_EFFECT_ASSETS[id];
    if(!spec)throw new Error(`UNKNOWN_EVENT_EFFECT:${id}`);
    if(force)this.atlasCache.delete(id);
    const cached=this.atlasCache.get(id);
    if(Array.isArray(cached))return cached;
    if(cached instanceof Promise)return cached;
    const pending=Assets.load(spec.atlasPath).then(resource=>{
      const frames=atlasFrames(resource,spec);
      this.atlasCache.set(id,frames);
      this.failures.delete(id);
      return frames;
    }).catch(error=>{
      this.atlasCache.delete(id);
      this.failures.set(id,error);
      console.error(`[V3 event FX] ${id} atlas unavailable; no procedural fallback will be used.`,error);
      return [];
    });
    this.atlasCache.set(id,pending);
    return pending;
  }

  static async preloadAll(){
    const results=await Promise.all(Object.keys(EVENT_EFFECT_ASSETS).map(id=>this.preload(id)));
    return results.filter(frames=>frames.length===12).length;
  }

  static create({id,x=0,y=0,scale=1}={}){
    const spec=EVENT_EFFECT_ASSETS[id];
    const frames=this.atlasCache.get(id);
    if(!spec||!Array.isArray(frames)||frames.length!==spec.frameCount){
      return new EventEffectFX({id,display:null,spec});
    }
    const display=new AnimatedSprite({textures:frames,autoUpdate:false});
    display.label=`V3_EVENT_ATLAS_${id.toUpperCase()}`;
    display.anchor.set(.5);
    display.position.set(Math.round(x),Math.round(y));
    display.scale.set(spec.scale*Math.max(.5,Number(scale)||1));
    display.alpha=0;
    display.visible=false;
    display.loop=false;
    display.eventMode='none';
    display.blendMode=spec.blendMode;
    return new EventEffectFX({id,display,spec});
  }

  constructor({id,display,spec}){
    this.id=id;
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
    const preDuration=this.spec.collisionFrame/this.spec.fps;
    const postDuration=(this.spec.frameCount-1-this.spec.collisionFrame)/this.spec.fps;
    const revealAt=Math.max(0,impact-preDuration);
    const releaseAt=impact+postDuration+.11;
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
    timeline.to(frameState,{value:this.spec.collisionFrame,duration:preDuration,ease:'none',onUpdate:renderFrame},revealAt);
    timeline.to(frameState,{value:this.spec.frameCount-1,duration:postDuration,ease:'none',onUpdate:renderFrame},impact);
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

  static diagnostics(){
    return {
      renderer:'pixi-animated-sprite-atlas-only',
      frameContract:'12-frame-rgba',
      ready:Object.keys(EVENT_EFFECT_ASSETS).filter(id=>Array.isArray(this.atlasCache.get(id))&&this.atlasCache.get(id).length===12),
      failures:[...this.failures.keys()],
      proceduralFallback:false
    };
  }
}
