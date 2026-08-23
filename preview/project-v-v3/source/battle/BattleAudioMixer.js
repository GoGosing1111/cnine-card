import {normalizeSkillEffectKind, SKILL_EFFECT_KIND} from './SkillEffectFX.js';
import {V3_ROLE_AUDIO_SPRITE} from './RoleAudioSpriteManifest.js';

const MUTE_KEY='cnine_battle_sound';
const AudioContextClass=()=>globalThis.AudioContext||globalThis.webkitAudioContext||null;
const SPRITE_AUDIO_URL=V3_ROLE_AUDIO_SPRITE.asset;
const ROLE_GROUP={
  [SKILL_EFFECT_KIND.ATTACK]:'attack',
  [SKILL_EFFECT_KIND.DEFENSE]:'defense',
  [SKILL_EFFECT_KIND.SPEED]:'speed',
  [SKILL_EFFECT_KIND.HP]:'hp'
};
const CUE_VARIANTS=Object.freeze({
  attack_cast:2,attack_hit:3,defense_cast:2,defense_hit:3,
  speed_cast:2,speed_hit:3,hp_cast:2,hp_hit:3,critical:2,boss:2
});

/**
 * One WebAudio graph for the lifetime of the V3 singleton renderer.
 * It creates no HTMLAudio elements and never blocks the combat timeline.
 */
export class BattleAudioMixer{
  constructor(){
    this.context=null;this.master=null;this.compressor=null;this.noiseBuffer=null;this.unlocked=false;
    this.spriteManifest=V3_ROLE_AUDIO_SPRITE;this.spriteBytes=null;this.spriteBuffer=null;this.spriteDecodePromise=null;
    this.spriteLoadPromise=null;this.spritePreloadTimer=null;
    this.spriteState='idle';this.cueCursor=new Map();this.activeSources=new Set();this.destroyed=false;
    this.abortController=typeof AbortController!=='undefined'?new AbortController():null;
    this.unlock=this.unlock.bind(this);
    globalThis.addEventListener?.('pointerdown',this.unlock,{once:false,passive:true,capture:true});
    globalThis.addEventListener?.('keydown',this.unlock,{once:false,passive:true,capture:true});
  }

  enabled(){try{return localStorage.getItem(MUTE_KEY)!=='OFF'}catch{return true}}

  ensure(){
    if(!this.enabled())return null;
    const Constructor=AudioContextClass();if(!Constructor)return null;
    if(!this.context){
      this.context=new Constructor({latencyHint:'interactive'});
      this.master=this.context.createGain();this.master.gain.value=.48;
      this.compressor=this.context.createDynamicsCompressor();
      this.compressor.threshold.value=-18;this.compressor.knee.value=16;this.compressor.ratio.value=5;this.compressor.attack.value=.002;this.compressor.release.value=.18;
      this.master.connect(this.compressor).connect(this.context.destination);
      if(this.spriteBytes)this.decodeSprite();
    }
    return this.context;
  }

  unlock(){
    const context=this.ensure();if(!context)return;
    const resume=context.state==='suspended'?context.resume():Promise.resolve();
    resume.catch(()=>{}).finally(()=>{
      if(this.destroyed)return;
      this.unlocked=context.state==='running';
      this.decodeSprite();
    });
  }

  prepare(){
    if(this.destroyed)return Promise.resolve(false);
    if(this.spriteBuffer||this.spriteBytes)return Promise.resolve(true);
    if(this.spriteLoadPromise)return this.spriteLoadPromise;
    this.spriteState='loading';
    this.spriteLoadPromise=this.preloadSprite().finally(()=>{this.spriteLoadPromise=null});
    return this.spriteLoadPromise;
  }

  schedulePreload(delay=180){
    if(this.destroyed||this.spriteBuffer||this.spriteBytes||this.spriteLoadPromise||this.spritePreloadTimer!==null)return;
    // Never put combat audio on the renderer's critical mount path. The first
    // battlefield frame is painted first; the compact sprite is fetched next.
    this.spritePreloadTimer=globalThis.setTimeout?.(()=>{
      this.spritePreloadTimer=null;
      this.prepare();
    },Math.max(0,delay))??null;
  }

  async preloadSprite(){
    try{
      const options={cache:'force-cache',signal:this.abortController?.signal};
      const audioResponse=await fetch(SPRITE_AUDIO_URL,options);
      if(!audioResponse.ok)throw new Error(`V3 audio sprite load failed: ${audioResponse.status}`);
      const bytes=await audioResponse.arrayBuffer();
      if(bytes.byteLength!==V3_ROLE_AUDIO_SPRITE.bytes)throw new Error('V3 audio sprite payload is invalid');
      if(this.destroyed)return false;
      this.spriteBytes=bytes;this.spriteState='fetched';
      if(this.context)await this.decodeSprite();
      return true;
    }catch(error){
      if(!this.destroyed){this.spriteState='fallback';console.warn('[V3 audio] asset preload failed; procedural fallback enabled',error)}
      return false;
    }
  }

  async decodeSprite(){
    if(this.spriteBuffer)return true;
    if(this.spriteDecodePromise)return this.spriteDecodePromise;
    if(!this.context||!this.spriteBytes||this.destroyed)return false;
    this.spriteState='decoding';
    this.spriteDecodePromise=this.context.decodeAudioData(this.spriteBytes.slice(0)).then(buffer=>{
      if(this.destroyed)return false;
      this.spriteBuffer=buffer;this.spriteState='ready';return true;
    }).catch(error=>{
      if(!this.destroyed){this.spriteState='fallback';console.warn('[V3 audio] decode failed; procedural fallback enabled',error)}
      return false;
    }).finally(()=>{this.spriteDecodePromise=null});
    return this.spriteDecodePromise;
  }

  nextCue(group){
    const count=CUE_VARIANTS[group]||1;
    const cursor=this.cueCursor.has(group)?this.cueCursor.get(group):Math.floor(Math.random()*count);
    this.cueCursor.set(group,(cursor+1)%count);
    return this.spriteManifest?.cues?.[`${group}_${cursor+1}`]||null;
  }

  playCue(group,{volume=.72,delay=0,detune=0,pan=0}={}){
    const context=this.ensure();
    if(!context||context.state!=='running'||!this.spriteBuffer||!this.spriteManifest)return false;
    const cue=this.nextCue(group);if(!cue)return false;
    const source=context.createBufferSource(),gain=context.createGain();
    source.buffer=this.spriteBuffer;source.detune.value=detune;gain.gain.value=Math.max(.0001,volume);
    let tail=gain;
    if(typeof context.createStereoPanner==='function'){
      const panner=context.createStereoPanner();panner.pan.value=Math.max(-1,Math.min(1,pan));gain.connect(panner);tail=panner;
    }
    source.connect(gain);tail.connect(this.master);
    const when=context.currentTime+Math.max(0,delay),duration=Math.max(.025,Number(cue.duration)||.1);
    this.activeSources.add(source);
    source.onended=()=>{this.activeSources.delete(source);try{source.disconnect();gain.disconnect();tail!==gain&&tail.disconnect()}catch{}};
    source.start(when,Math.max(0,Number(cue.offset)||0),duration);
    source.stop(when+duration*Math.pow(2,-detune/1200)+.04);
    return true;
  }

  tone({frequency=220,endFrequency=80,duration=.12,type='sine',volume=.05,delay=0,detune=0}={}){
    const context=this.ensure();if(!context||context.state!=='running')return;
    const start=context.currentTime+Math.max(0,delay);const end=start+Math.max(.025,duration);
    const oscillator=context.createOscillator();const gain=context.createGain();
    oscillator.type=type;oscillator.detune.value=detune;
    oscillator.frequency.setValueAtTime(Math.max(20,frequency),start);oscillator.frequency.exponentialRampToValueAtTime(Math.max(20,endFrequency),end);
    gain.gain.setValueAtTime(.0001,start);gain.gain.exponentialRampToValueAtTime(Math.max(.0002,volume),start+.008);gain.gain.exponentialRampToValueAtTime(.0001,end);
    oscillator.connect(gain).connect(this.master);oscillator.start(start);oscillator.stop(end+.02);
  }

  noise({duration=.12,volume=.04,frequency=900,delay=0}={}){
    const context=this.ensure();if(!context||context.state!=='running')return;
    if(!this.noiseBuffer){
      const length=Math.ceil(context.sampleRate*.5);this.noiseBuffer=context.createBuffer(1,length,context.sampleRate);const data=this.noiseBuffer.getChannelData(0);
      for(let index=0;index<length;index+=1)data[index]=(Math.random()*2-1)*(1-index/length*.35);
    }
    const start=context.currentTime+Math.max(0,delay);const source=context.createBufferSource();const filter=context.createBiquadFilter();const gain=context.createGain();
    source.buffer=this.noiseBuffer;filter.type='bandpass';filter.frequency.value=frequency;filter.Q.value=.75;
    gain.gain.setValueAtTime(Math.max(.0002,volume),start);gain.gain.exponentialRampToValueAtTime(.0001,start+duration);
    source.connect(filter).connect(gain).connect(this.master);source.start(start);source.stop(start+duration+.02);
  }

  playCast(kind){
    const role=normalizeSkillEffectKind(kind);
    const group=ROLE_GROUP[role]||'attack';
    if(this.playCue(`${group}_cast`,{volume:role===SKILL_EFFECT_KIND.DEFENSE?.58:.48,detune:(Math.random()-.5)*22,pan:(Math.random()-.5)*.16}))return;
    if(role===SKILL_EFFECT_KIND.DEFENSE){this.tone({frequency:120,endFrequency:320,duration:.18,type:'triangle',volume:.032});this.tone({frequency:240,endFrequency:520,duration:.16,type:'sine',volume:.02,delay:.035})}
    else if(role===SKILL_EFFECT_KIND.SPEED){[0,.025,.05].forEach((delay,index)=>this.tone({frequency:950+index*160,endFrequency:360+index*70,duration:.08,type:'sawtooth',volume:.012,delay}))}
    else if(role===SKILL_EFFECT_KIND.HP){[196,293,392].forEach((frequency,index)=>this.tone({frequency,endFrequency:frequency*1.42,duration:.23,type:'sine',volume:.018,delay:index*.025}))}
    else{this.noise({duration:.09,volume:.018,frequency:1700});this.tone({frequency:680,endFrequency:170,duration:.13,type:'sawtooth',volume:.026})}
  }

  playImpact(kind,{critical=false,boss=false}={}){
    const role=normalizeSkillEffectKind(kind);const force=(critical?1.22:1)*(boss?1.18:1);
    const group=ROLE_GROUP[role]||'attack';
    const assetPlayed=this.playCue(`${group}_hit`,{volume:.68*force,detune:(Math.random()-.5)*28,pan:(Math.random()-.5)*.12});
    if(assetPlayed){
      if(critical)this.playCue('critical',{volume:.54*(boss?1.12:1),delay:.004,detune:(Math.random()-.5)*18,pan:(Math.random()-.5)*.08});
      if(boss)this.playCue('boss',{volume:.58*(critical?1.08:1),delay:.008,detune:-8+(Math.random()-.5)*12});
      return;
    }
    if(role===SKILL_EFFECT_KIND.DEFENSE){this.noise({duration:.2,volume:.05*force,frequency:410});this.tone({frequency:92,endFrequency:38,duration:.25,type:'square',volume:.055*force});this.tone({frequency:620,endFrequency:310,duration:.13,type:'triangle',volume:.018,delay:.02})}
    else if(role===SKILL_EFFECT_KIND.SPEED){[0,.035,.07].forEach((delay,index)=>{this.noise({duration:.07,volume:.018*force,frequency:1500+index*420,delay});this.tone({frequency:1120-index*140,endFrequency:360,duration:.085,type:'sawtooth',volume:.018*force,delay})})}
    else if(role===SKILL_EFFECT_KIND.HP){this.tone({frequency:156,endFrequency:62,duration:.22,type:'sine',volume:.045*force});this.noise({duration:.14,volume:.028*force,frequency:760});[330,494].forEach((frequency,index)=>this.tone({frequency,endFrequency:frequency*.72,duration:.18,type:'triangle',volume:.016,delay:.025+index*.025}))}
    else{this.noise({duration:.17,volume:.055*force,frequency:680});this.tone({frequency:175,endFrequency:42,duration:.22,type:'square',volume:.063*force});if(critical)this.tone({frequency:1280,endFrequency:460,duration:.13,type:'sawtooth',volume:.018,delay:.025})}
  }

  diagnostics(){return {
    enabled:this.enabled(),state:this.context?.state||'locked',graph:'compressor-v2-audio-sprite',
    assetState:this.spriteState,assetBytes:this.spriteBytes?.byteLength||0,cues:Object.keys(this.spriteManifest?.cues||{}).length,
    activeSources:this.activeSources.size,requestCount:1,proceduralFallback:this.spriteState!=='ready'
  }}

  destroy(){
    this.destroyed=true;this.abortController?.abort();
    if(this.spritePreloadTimer!==null)globalThis.clearTimeout?.(this.spritePreloadTimer);
    this.spritePreloadTimer=null;
    globalThis.removeEventListener?.('pointerdown',this.unlock,{capture:true});globalThis.removeEventListener?.('keydown',this.unlock,{capture:true});
    for(const source of this.activeSources){try{source.stop();source.disconnect()}catch{}}
    this.activeSources.clear();this.master?.disconnect();this.compressor?.disconnect();this.context?.close?.().catch(()=>{});
    this.spriteBuffer=null;this.spriteBytes=null;this.context=null;
  }
}
