import {normalizeSkillEffectKind, SKILL_EFFECT_KIND} from './SkillEffectFX.js';

const MUTE_KEY='cnine_battle_sound';
const AudioContextClass=()=>globalThis.AudioContext||globalThis.webkitAudioContext||null;

/**
 * One WebAudio graph for the lifetime of the V3 singleton renderer.
 * It creates no HTMLAudio elements and never blocks the combat timeline.
 */
export class BattleAudioMixer{
  constructor(){
    this.context=null;this.master=null;this.compressor=null;this.noiseBuffer=null;this.unlocked=false;
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
    }
    return this.context;
  }

  unlock(){
    const context=this.ensure();if(!context)return;
    if(context.state==='suspended')context.resume().catch(()=>{});
    this.unlocked=context.state==='running';
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
    if(role===SKILL_EFFECT_KIND.DEFENSE){this.tone({frequency:120,endFrequency:320,duration:.18,type:'triangle',volume:.032});this.tone({frequency:240,endFrequency:520,duration:.16,type:'sine',volume:.02,delay:.035})}
    else if(role===SKILL_EFFECT_KIND.SPEED){[0,.025,.05].forEach((delay,index)=>this.tone({frequency:950+index*160,endFrequency:360+index*70,duration:.08,type:'sawtooth',volume:.012,delay}))}
    else if(role===SKILL_EFFECT_KIND.HP){[196,293,392].forEach((frequency,index)=>this.tone({frequency,endFrequency:frequency*1.42,duration:.23,type:'sine',volume:.018,delay:index*.025}))}
    else{this.noise({duration:.09,volume:.018,frequency:1700});this.tone({frequency:680,endFrequency:170,duration:.13,type:'sawtooth',volume:.026})}
  }

  playImpact(kind,{critical=false,boss=false}={}){
    const role=normalizeSkillEffectKind(kind);const force=(critical?1.22:1)*(boss?1.18:1);
    if(role===SKILL_EFFECT_KIND.DEFENSE){this.noise({duration:.2,volume:.05*force,frequency:410});this.tone({frequency:92,endFrequency:38,duration:.25,type:'square',volume:.055*force});this.tone({frequency:620,endFrequency:310,duration:.13,type:'triangle',volume:.018,delay:.02})}
    else if(role===SKILL_EFFECT_KIND.SPEED){[0,.035,.07].forEach((delay,index)=>{this.noise({duration:.07,volume:.018*force,frequency:1500+index*420,delay});this.tone({frequency:1120-index*140,endFrequency:360,duration:.085,type:'sawtooth',volume:.018*force,delay})})}
    else if(role===SKILL_EFFECT_KIND.HP){this.tone({frequency:156,endFrequency:62,duration:.22,type:'sine',volume:.045*force});this.noise({duration:.14,volume:.028*force,frequency:760});[330,494].forEach((frequency,index)=>this.tone({frequency,endFrequency:frequency*.72,duration:.18,type:'triangle',volume:.016,delay:.025+index*.025}))}
    else{this.noise({duration:.17,volume:.055*force,frequency:680});this.tone({frequency:175,endFrequency:42,duration:.22,type:'square',volume:.063*force});if(critical)this.tone({frequency:1280,endFrequency:460,duration:.13,type:'sawtooth',volume:.018,delay:.025})}
  }

  diagnostics(){return {enabled:this.enabled(),state:this.context?.state||'locked',graph:'compressor-v1'}}

  destroy(){
    globalThis.removeEventListener?.('pointerdown',this.unlock,{capture:true});globalThis.removeEventListener?.('keydown',this.unlock,{capture:true});
    this.master?.disconnect();this.compressor?.disconnect();this.context?.close?.().catch(()=>{});this.context=null;
  }
}
