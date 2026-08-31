const AudioContextClass=()=>globalThis.AudioContext||globalThis.webkitAudioContext||null;
const MANIFEST_URL='assets/audio/manifest.json?v=1-original-advancement-sfx';
const EFFECT_CODES=Object.freeze(['SHATTER','RIPOSTE','AFTERIMAGE','IMMORTAL']);

function pickEffectTable(manifest){
  return manifest?.assets||manifest?.effects||manifest?.classes||manifest?.cues||manifest?.advancements||manifest||{};
}

function normalizedSpec(code,raw,manifestUrl){
  if(!raw||typeof raw!=='object')return null;
  const source=raw.src||raw.path||raw.file||raw.asset||raw.audio;
  if(!source)return null;
  return Object.freeze({
    code,
    src:new URL(String(source).startsWith('assets/')?`../../${source}`:source,manifestUrl).href,
    syncPointMs:Math.max(0,Number(raw.syncPointMs??raw.audioSyncMs??0)||0),
    durationMs:Math.max(0,Number(raw.durationMs)||0),
    gain:Math.max(0,Math.min(1.5,Number(raw.gain??.86)||.86))
  });
}

/**
 * Preview-local, recorded-asset-only WebAudio scheduler.
 *
 * There is no generated tone or audio sprite. The authored syncPointMs is
 * placed exactly on the GSAP logical impact: playback either waits for the
 * lead-in or starts at the matching offset when the lead-in is longer.
 */
export class AdvancementAudioScheduler{
  constructor(){
    this.context=null;
    this.master=null;
    this.compressor=null;
    this.manifestUrl=new URL(MANIFEST_URL,document.baseURI).href;
    this.specs=new Map();
    this.bytes=new Map();
    this.buffers=new Map();
    this.failures=new Map();
    this.activeSources=new Set();
    this.manifestPromise=null;
    this.fetchPromise=null;
    this.destroyed=false;
  }

  async loadManifest(){
    if(this.manifestPromise)return this.manifestPromise;
    this.manifestPromise=fetch(this.manifestUrl,{cache:'no-cache'}).then(async response=>{
      if(!response.ok)throw new Error(`AUDIO_MANIFEST_HTTP_${response.status}`);
      const manifest=await response.json();
      const table=pickEffectTable(manifest);
      for(const code of EFFECT_CODES){
        const raw=table[code]||table[code.toLowerCase()];
        const spec=normalizedSpec(code,raw,this.manifestUrl);
        if(!spec)throw new Error(`AUDIO_MANIFEST_EFFECT_MISSING:${code}`);
        this.specs.set(code,spec);
      }
      return manifest;
    }).catch(error=>{
      this.failures.set('manifest',error);
      console.error('[Advancement preview] audio manifest unavailable; visual audition remains active.',error);
      return null;
    });
    return this.manifestPromise;
  }

  async prepare(){
    await this.loadManifest();
    if(this.specs.size!==EFFECT_CODES.length||this.destroyed)return false;
    if(this.fetchPromise)return this.fetchPromise;
    this.fetchPromise=Promise.all(EFFECT_CODES.map(async code=>{
      if(this.bytes.has(code))return true;
      const spec=this.specs.get(code);
      try{
        const response=await fetch(spec.src,{cache:'force-cache'});
        if(!response.ok)throw new Error(`AUDIO_HTTP_${response.status}`);
        const bytes=await response.arrayBuffer();
        if(!bytes.byteLength)throw new Error('AUDIO_EMPTY_PAYLOAD');
        if(!this.destroyed){
          this.bytes.set(code,bytes);
          this.failures.delete(code);
        }
        return true;
      }catch(error){
        this.failures.set(code,error);
        console.error(`[Advancement preview] ${code} recorded SFX unavailable.`,error);
        return false;
      }
    })).then(async results=>{
      if(this.context)await this.decodeAll();
      return results.every(Boolean);
    }).finally(()=>{this.fetchPromise=null});
    return this.fetchPromise;
  }

  ensureContext(){
    if(this.destroyed)return null;
    const Constructor=AudioContextClass();
    if(!Constructor)return null;
    if(!this.context){
      this.context=new Constructor({latencyHint:'interactive'});
      this.master=this.context.createGain();
      this.master.gain.value=.52;
      this.compressor=this.context.createDynamicsCompressor();
      this.compressor.threshold.value=-16;
      this.compressor.knee.value=12;
      this.compressor.ratio.value=5;
      this.compressor.attack.value=.002;
      this.compressor.release.value=.24;
      this.master.connect(this.compressor).connect(this.context.destination);
    }
    return this.context;
  }

  async decodeAll(){
    if(!this.context||this.destroyed)return false;
    await Promise.all([...this.bytes.entries()].map(async([code,bytes])=>{
      if(this.buffers.has(code))return;
      try{
        const buffer=await this.context.decodeAudioData(bytes.slice(0));
        if(!this.destroyed){
          this.buffers.set(code,buffer);
          this.failures.delete(code);
        }
      }catch(error){
        this.failures.set(code,error);
        console.error(`[Advancement preview] ${code} SFX decode failed.`,error);
      }
    }));
    return this.buffers.size===EFFECT_CODES.length;
  }

  async unlock(){
    const context=this.ensureContext();
    if(!context)return false;
    if(context.state==='suspended')await context.resume().catch(()=>{});
    await this.prepare();
    await this.decodeAll();
    return context.state==='running';
  }

  scheduleImpact(code,{impactAt=0}={}){
    const normalized=String(code||'').toUpperCase();
    const context=this.context;
    const spec=this.specs.get(normalized);
    const buffer=this.buffers.get(normalized);
    if(!context||context.state!=='running'||!spec||!buffer)return false;
    const logicalImpact=Math.max(0,Number(impactAt)||0);
    const authoredSync=spec.syncPointMs/1000;
    const delay=Math.max(0,logicalImpact-authoredSync);
    const offset=Math.max(0,authoredSync-logicalImpact);
    const source=context.createBufferSource();
    const gain=context.createGain();
    source.buffer=buffer;
    gain.gain.value=spec.gain;
    source.connect(gain).connect(this.master);
    this.activeSources.add(source);
    source.onended=()=>{
      this.activeSources.delete(source);
      try{source.disconnect();gain.disconnect()}catch{}
    };
    const safeOffset=Math.min(offset,Math.max(0,buffer.duration-.025));
    source.start(context.currentTime+delay,safeOffset);
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
      engine:'preview-local-web-audio',
      source:'new-recorded-assets-only',
      manifest:this.manifestUrl,
      sync:'syncPointMs-to-logical-impact',
      toleranceMs:20,
      state:this.context?.state||'locked',
      specs:[...this.specs.keys()],
      ready:[...this.buffers.keys()],
      failures:[...this.failures.keys()],
      fallback:false
    };
  }

  destroy(){
    this.destroyed=true;
    this.stopAll();
    try{this.master?.disconnect();this.compressor?.disconnect()}catch{}
    this.context?.close?.().catch(()=>{});
    this.context=null;
    this.bytes.clear();
    this.buffers.clear();
  }
}
