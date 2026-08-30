import {EVENT_EFFECTS} from './EventEffectFX.js';

const AudioContextClass=()=>globalThis.AudioContext||globalThis.webkitAudioContext||null;
const PREVIEW_AUDIO_ROOT='/preview/project-v-v3-live-style-event-fx-v2/assets/audio';

/**
 * Preview-only WebAudio mixer. Every buffer is an authored recorded/foley
 * combat asset; absence is intentionally silent and never replaced by a tone.
 */
export class EventAudioMixer{
  constructor({volume=.72}={}){
    this.context=null;
    this.master=null;
    this.compressor=null;
    this.volume=Math.max(0,Math.min(1,Number(volume)||0));
    this.enabled=true;
    this.bytes=new Map();
    this.buffers=new Map();
    this.failures=new Map();
    this.activeSources=new Set();
    this.loadPromise=null;
    this.destroyed=false;
  }

  ensure(){
    if(this.destroyed)return null;
    const Constructor=AudioContextClass();
    if(!Constructor)return null;
    if(!this.context){
      this.context=new Constructor({latencyHint:'interactive'});
      this.master=this.context.createGain();
      this.master.gain.value=this.volume;
      this.compressor=this.context.createDynamicsCompressor();
      this.compressor.threshold.value=-17;
      this.compressor.knee.value=14;
      this.compressor.ratio.value=5;
      this.compressor.attack.value=.002;
      this.compressor.release.value=.22;
      this.master.connect(this.compressor).connect(this.context.destination);
    }
    return this.context;
  }

  async prepare(){
    if(this.destroyed)return false;
    if(this.loadPromise)return this.loadPromise;
    const entries=Object.values(EVENT_EFFECTS);
    this.loadPromise=Promise.all(entries.map(async profile=>{
      if(this.bytes.has(profile.id)||this.buffers.has(profile.id))return true;
      try{
        // Range 요청은 프로젝트 서비스워커의 미디어 캐시 경로를 우회해
        // 프리뷰의 최신 승인 MP3 바이트를 정적 서버에서 직접 읽는다.
        const response=await fetch(`${PREVIEW_AUDIO_ROOT}/${profile.audio}`,{
          cache:'no-store',
          headers:{Range:'bytes=0-'}
        });
        if(!response.ok){
          const type=response.headers.get('content-type')||'unknown';
          throw new Error(`HTTP_${response.status}:${type}:${response.url}`);
        }
        const payload=await response.arrayBuffer();
        this.bytes.set(profile.id,payload);
        this.failures.delete(profile.id);
        return true;
      }catch(error){
        this.failures.set(profile.id,error);
        console.error(`[V3 event audio] ${profile.id} unavailable; no procedural fallback will be used.`,error);
        return false;
      }
    })).then(async results=>{
      if(this.context)await this.decodeAll();
      return results.every(Boolean);
    }).finally(()=>{this.loadPromise=null});
    return this.loadPromise;
  }

  async unlock(){
    const context=this.ensure();
    if(!context)return false;
    if(context.state==='suspended')await context.resume();
    await this.prepare();
    await this.decodeAll();
    return context.state==='running';
  }

  async decodeAll(){
    if(!this.context||this.destroyed)return false;
    await Promise.all([...this.bytes.entries()].map(async([id,payload])=>{
      if(this.buffers.has(id))return;
      try{
        const buffer=await this.context.decodeAudioData(payload.slice(0));
        this.buffers.set(id,buffer);
        this.failures.delete(id);
      }catch(error){
        this.failures.set(id,error);
        console.error(`[V3 event audio] ${id} decode failed; no procedural fallback will be used.`,error);
      }
    }));
    return this.buffers.size===Object.keys(EVENT_EFFECTS).length;
  }

  schedule(id,{impactAt=.42,playbackSpeed=1,pan=0}={}){
    if(!this.enabled)return false;
    const profile=EVENT_EFFECTS[id];
    const context=this.context;
    const buffer=this.buffers.get(id);
    if(!profile||!context||context.state!=='running'||!buffer)return false;
    const realImpact=Math.max(0,Number(impactAt)||0)/Math.max(.1,Number(playbackSpeed)||1);
    const authoredSync=profile.audioSyncMs/1000;
    const delay=Math.max(0,realImpact-authoredSync);
    const offset=Math.max(0,authoredSync-realImpact);
    const source=context.createBufferSource();
    const gain=context.createGain();
    source.buffer=buffer;
    gain.gain.value=id==='boss-ultimate'?.92:id==='ultimate'?.84:.78;
    let tail=gain;
    if(typeof context.createStereoPanner==='function'){
      const panner=context.createStereoPanner();
      panner.pan.value=Math.max(-1,Math.min(1,Number(pan)||0));
      gain.connect(panner);
      tail=panner;
    }
    source.connect(gain);
    tail.connect(this.master);
    this.activeSources.add(source);
    source.onended=()=>{
      this.activeSources.delete(source);
      try{source.disconnect();gain.disconnect();if(tail!==gain)tail.disconnect()}catch{}
    };
    const safeOffset=Math.min(offset,Math.max(0,buffer.duration-.025));
    source.start(context.currentTime+delay,safeOffset);
    return true;
  }

  setEnabled(value){this.enabled=Boolean(value)}

  setVolume(value){
    this.volume=Math.max(0,Math.min(1,Number(value)||0));
    if(this.master&&this.context)this.master.gain.setTargetAtTime(this.volume,this.context.currentTime,.018);
  }

  stopAll(){
    for(const source of this.activeSources){try{source.stop();source.disconnect()}catch{}}
    this.activeSources.clear();
  }

  diagnostics(){
    return {
      renderer:'webaudio-buffer-assets',
      state:this.context?.state||'locked',
      ready:[...this.buffers.keys()],
      failures:[...this.failures.keys()],
      activeSources:this.activeSources.size,
      proceduralSynthesis:false,
      runtimeSynthesis:false
    };
  }

  destroy(){
    this.destroyed=true;
    this.stopAll();
    this.master?.disconnect();
    this.compressor?.disconnect();
    this.context?.close?.().catch(()=>{});
    this.context=null;
    this.buffers.clear();
    this.bytes.clear();
  }
}
