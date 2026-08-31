import {normalizeSkillEffectKind, SKILL_EFFECT_KIND} from './SkillEffectFX.js';
import {V3_ROLE_AUDIO_ASSETS} from './RoleAudioSpriteManifest.js';
import {normalizeAdvancementAudioCode, V3_ADVANCEMENT_AUDIO_ASSETS} from './AdvancementAudioManifest.js';

const MUTE_KEY='cnine_battle_sound';
const AudioContextClass=()=>globalThis.AudioContext||globalThis.webkitAudioContext||null;

/**
 * Asset-only WebAudio mixer for Project V V3 role impacts.
 *
 * The retired combined audio sprite and every oscillator/noise fallback are
 * intentionally absent. A missing asset produces silence, never the old hit
 * sound. The authored sync point is scheduled onto the authoritative V3 hit.
 */
export class BattleAudioMixer{
  constructor(){
    this.context=null;
    this.ownsContext=false;
    this.master=null;
    this.compressor=null;
    this.unlocked=false;
    this.bytes=new Map();
    this.buffers=new Map();
    this.failures=new Map();
    this.advancementBytes=new Map();
    this.advancementBuffers=new Map();
    this.advancementFailures=new Map();
    this.advancementLoads=new Map();
    this.advancementGeneration=0;
    this.loadPromise=null;
    this.preloadTimer=null;
    this.activeSources=new Set();
    this.destroyed=false;
    this.abortController=typeof AbortController!=='undefined'?new AbortController():null;
    this.unlock=this.unlock.bind(this);
    globalThis.addEventListener?.('pointerdown',this.unlock,{passive:true,capture:true});
    globalThis.addEventListener?.('keydown',this.unlock,{passive:true,capture:true});
    // The live shell is mounted after the start-button pointerdown. Reuse the
    // already-unlocked app context so the first automatic V3 hit is audible;
    // standalone previews still create their own context on the next gesture.
    if(globalThis.__CNINE_SHARED_BATTLE_AUDIO_CONTEXT)this.ensure();
  }

  enabled(){
    try{return localStorage.getItem(MUTE_KEY)!=='OFF'}catch{return true}
  }

  ensure(){
    if(!this.enabled()||this.destroyed)return null;
    const shared=globalThis.__CNINE_SHARED_BATTLE_AUDIO_CONTEXT;
    const Constructor=AudioContextClass();
    if(!shared&&!Constructor)return null;
    if(!this.context){
      if(shared&&shared.state!=='closed'){
        this.context=shared;
        this.ownsContext=false;
      }else{
        this.context=new Constructor({latencyHint:'interactive'});
        this.ownsContext=true;
      }
      this.master=this.context.createGain();
      this.master.gain.value=.46;
      this.compressor=this.context.createDynamicsCompressor();
      this.compressor.threshold.value=-17;
      this.compressor.knee.value=14;
      this.compressor.ratio.value=5;
      this.compressor.attack.value=.002;
      this.compressor.release.value=.22;
      this.master.connect(this.compressor).connect(this.context.destination);
      if(this.bytes.size)this.decodeAll();
      if(this.advancementBytes.size)this.decodeAdvancements([...this.advancementBytes.keys()]);
    }
    return this.context;
  }

  unlock(){
    const context=this.ensure();
    if(!context)return;
    const resume=context.state==='suspended'?context.resume():Promise.resolve();
    resume.catch(()=>{}).finally(()=>{
      if(this.destroyed)return;
      this.unlocked=context.state==='running';
      this.prepare();
    });
  }

  schedulePreload(delay=60){
    if(this.destroyed||this.loadPromise||this.bytes.size||this.preloadTimer!==null)return;
    this.preloadTimer=globalThis.setTimeout?.(()=>{
      this.preloadTimer=null;
      this.prepare();
    },Math.max(0,delay))??null;
  }

  prepare(){
    if(this.destroyed)return Promise.resolve(false);
    if(this.buffers.size===4||this.bytes.size===4)return Promise.resolve(true);
    if(this.loadPromise)return this.loadPromise;
    this.loadPromise=Promise.all(Object.entries(V3_ROLE_AUDIO_ASSETS).map(async([kind,spec])=>{
      try{
        const response=await fetch(spec.asset,{cache:'force-cache',signal:this.abortController?.signal});
        if(!response.ok)throw new Error(`HTTP_${response.status}`);
        const payload=await response.arrayBuffer();
        if(payload.byteLength!==spec.bytes)throw new Error(`PAYLOAD_${payload.byteLength}_${spec.bytes}`);
        if(!this.destroyed){this.bytes.set(kind,payload);this.failures.delete(kind)}
        return true;
      }catch(error){
        if(!this.destroyed){
          this.failures.set(kind,error);
          console.error(`[V3 role audio] ${kind} unavailable; retired audio will not be used`,error);
        }
        return false;
      }
    })).then(async results=>{
      if(this.context)await this.decodeAll();
      return results.every(Boolean);
    }).finally(()=>{this.loadPromise=null});
    return this.loadPromise;
  }

  async decodeAll(){
    if(!this.context||this.destroyed)return false;
    await Promise.all([...this.bytes.entries()].map(async([kind,payload])=>{
      if(this.buffers.has(kind))return;
      try{
        const buffer=await this.context.decodeAudioData(payload.slice(0));
        if(!this.destroyed){this.buffers.set(kind,buffer);this.failures.delete(kind)}
      }catch(error){
        if(!this.destroyed){
          this.failures.set(kind,error);
          console.error(`[V3 role audio] ${kind} decode failed; retired audio will not be used`,error);
        }
      }
    }));
    return this.buffers.size===4;
  }

  async prepareAdvancements(values=[]){
    const codes=[...new Set((Array.isArray(values)?values:[]).map(normalizeAdvancementAudioCode).filter(Boolean))];
    if(!codes.length||this.destroyed)return true;
    const generation=this.advancementGeneration;
    const results=await Promise.all(codes.map(async code=>{
      if(this.advancementBytes.has(code)||this.advancementBuffers.has(code))return true;
      if(this.advancementLoads.has(code))return this.advancementLoads.get(code);
      const spec=V3_ADVANCEMENT_AUDIO_ASSETS[code];
      const pending=fetch(spec.asset,{cache:'force-cache',signal:this.abortController?.signal}).then(async response=>{
        if(!response.ok)throw new Error(`HTTP_${response.status}`);
        const payload=await response.arrayBuffer();
        if(payload.byteLength!==spec.bytes)throw new Error(`PAYLOAD_${payload.byteLength}_${spec.bytes}`);
        if(!this.destroyed&&generation===this.advancementGeneration){this.advancementBytes.set(code,payload);this.advancementFailures.delete(code)}
        return true;
      }).catch(error=>{
        if(!this.destroyed&&generation===this.advancementGeneration){
          this.advancementFailures.set(code,error);
          console.error(`[V3 advancement audio] ${code} unavailable; no fallback is used`,error);
        }
        return false;
      }).finally(()=>{if(this.advancementLoads.get(code)===pending)this.advancementLoads.delete(code)});
      this.advancementLoads.set(code,pending);
      return pending;
    }));
    if(this.context&&generation===this.advancementGeneration)await this.decodeAdvancements(codes,generation);
    return generation===this.advancementGeneration&&results.every(Boolean);
  }

  async decodeAdvancements(values=[],expectedGeneration=this.advancementGeneration){
    if(!this.context||this.destroyed)return false;
    const codes=[...new Set((Array.isArray(values)?values:[]).map(normalizeAdvancementAudioCode).filter(Boolean))];
    await Promise.all(codes.map(async code=>{
      if(this.advancementBuffers.has(code))return;
      const payload=this.advancementBytes.get(code);
      if(!payload)return;
      try{
        const buffer=await this.context.decodeAudioData(payload.slice(0));
        if(!this.destroyed&&expectedGeneration===this.advancementGeneration){this.advancementBuffers.set(code,buffer);this.advancementFailures.delete(code)}
      }catch(error){
        if(!this.destroyed&&expectedGeneration===this.advancementGeneration){
          this.advancementFailures.set(code,error);
          console.error(`[V3 advancement audio] ${code} decode failed; no fallback is used`,error);
        }
      }
    }));
    return expectedGeneration===this.advancementGeneration&&codes.every(code=>this.advancementBuffers.has(code));
  }

  releaseAdvancements(){
    this.advancementGeneration+=1;
    this.advancementBytes.clear();
    this.advancementBuffers.clear();
    this.advancementFailures.clear();
    this.advancementLoads.clear();
    return true;
  }

  scheduleImpact(kind,{impactAt=.25,playbackSpeed=1.3,critical=false,boss=false,pan=0}={}){
    const role=normalizeSkillEffectKind(kind);
    const spec=V3_ROLE_AUDIO_ASSETS[role]||V3_ROLE_AUDIO_ASSETS[SKILL_EFFECT_KIND.ATTACK];
    const context=this.ensure();
    const buffer=this.buffers.get(role);
    if(!context||context.state!=='running'||!buffer)return false;
    const realImpact=Math.max(0,Number(impactAt)||0)/Math.max(.1,Number(playbackSpeed)||1);
    const authoredSync=Math.max(0,Number(spec.syncPointMs)||0)/1000;
    const delay=Math.max(0,realImpact-authoredSync);
    const offset=Math.max(0,authoredSync-realImpact);
    return this.startBuffer(role,{delay,offset,critical,boss,pan});
  }

  scheduleAdvancementImpact(value,{impactAt=.25,playbackSpeed=1.3,pan=0}={}){
    const code=normalizeAdvancementAudioCode(value);
    const spec=V3_ADVANCEMENT_AUDIO_ASSETS[code];
    const context=this.ensure();
    const buffer=this.advancementBuffers.get(code);
    if(!code||!context||context.state!=='running'||!spec||!buffer)return false;
    const realImpact=Math.max(0,Number(impactAt)||0)/Math.max(.1,Number(playbackSpeed)||1);
    const authoredSync=Math.max(0,Number(spec.syncPointMs)||0)/1000;
    const delay=Math.max(0,realImpact-authoredSync);
    const offset=Math.max(0,authoredSync-realImpact);
    return this.startAdvancementBuffer(code,{delay,offset,pan});
  }

  startAdvancementBuffer(code,{delay=0,offset=0,pan=0}={}){
    const context=this.ensure();
    const spec=V3_ADVANCEMENT_AUDIO_ASSETS[code];
    const buffer=this.advancementBuffers.get(code);
    if(!context||context.state!=='running'||!spec||!buffer)return false;
    const source=context.createBufferSource();
    const gain=context.createGain();
    source.buffer=buffer;
    gain.gain.value=spec.gain;
    let tail=gain;
    if(typeof context.createStereoPanner==='function'){
      const panner=context.createStereoPanner();
      panner.pan.value=Math.max(-1,Math.min(1,Number(pan)||0));
      gain.connect(panner);
      tail=panner;
    }
    source.connect(gain);
    tail.connect(this.master);
    const when=context.currentTime+Math.max(0,Number(delay)||0);
    const safeOffset=Math.min(Math.max(0,Number(offset)||0),Math.max(0,buffer.duration-.025));
    this.activeSources.add(source);
    source.onended=()=>{
      this.activeSources.delete(source);
      try{source.disconnect();gain.disconnect();if(tail!==gain)tail.disconnect()}catch{}
    };
    source.start(when,safeOffset);
    return true;
  }

  startBuffer(kind,{delay=0,offset=0,critical=false,boss=false,pan=0}={}){
    const context=this.ensure();
    const spec=V3_ROLE_AUDIO_ASSETS[kind];
    const buffer=this.buffers.get(kind);
    if(!context||context.state!=='running'||!spec||!buffer)return false;
    const source=context.createBufferSource();
    const gain=context.createGain();
    source.buffer=buffer;
    gain.gain.value=spec.gain*(critical?1.08:1)*(boss?1.06:1);
    let tail=gain;
    if(typeof context.createStereoPanner==='function'){
      const panner=context.createStereoPanner();
      panner.pan.value=Math.max(-1,Math.min(1,Number(pan)||0));
      gain.connect(panner);
      tail=panner;
    }
    source.connect(gain);
    tail.connect(this.master);
    const when=context.currentTime+Math.max(0,Number(delay)||0);
    const safeOffset=Math.min(Math.max(0,Number(offset)||0),Math.max(0,buffer.duration-.025));
    this.activeSources.add(source);
    source.onended=()=>{
      this.activeSources.delete(source);
      try{source.disconnect();gain.disconnect();if(tail!==gain)tail.disconnect()}catch{}
    };
    source.start(when,safeOffset);
    return true;
  }

  stopAll(){
    for(const source of this.activeSources){
      try{source.stop();source.disconnect()}catch{}
    }
    this.activeSources.clear();
  }

  diagnostics(){
    return {
      enabled:this.enabled(),
      state:this.context?.state||'locked',
      graph:'compressor-v3-role-assets',
      assetState:this.buffers.size===4?'ready':this.bytes.size===4?'fetched':this.failures.size?'partial':'idle',
      ready:[...this.buffers.keys()],
      failures:[...this.failures.keys()],
      advancement:{
        strategy:'timeline-codes-only',
        fetched:[...this.advancementBytes.keys()],
        ready:[...this.advancementBuffers.keys()],
        failures:[...this.advancementFailures.keys()],
        eagerPreloadAll:false,
        proceduralFallback:false
      },
      activeSources:this.activeSources.size,
      requestCount:4+new Set([...this.advancementBytes.keys(),...this.advancementBuffers.keys(),...this.advancementLoads.keys()]).size,
      contextOwner:this.ownsContext?'v3':'shared-live',
      proceduralFallback:false,
      retiredAudioSprite:false
    };
  }

  destroy(){
    this.destroyed=true;
    this.abortController?.abort();
    if(this.preloadTimer!==null)globalThis.clearTimeout?.(this.preloadTimer);
    this.preloadTimer=null;
    globalThis.removeEventListener?.('pointerdown',this.unlock,{capture:true});
    globalThis.removeEventListener?.('keydown',this.unlock,{capture:true});
    this.stopAll();
    this.master?.disconnect();
    this.compressor?.disconnect();
    if(this.ownsContext)this.context?.close?.().catch(()=>{});
    this.buffers.clear();
    this.bytes.clear();
    this.releaseAdvancements();
    this.context=null;
    this.ownsContext=false;
  }
}
