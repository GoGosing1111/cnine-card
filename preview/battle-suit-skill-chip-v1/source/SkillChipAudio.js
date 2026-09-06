import {SEQUENCES,clamp} from './sequence.js';
const BASE='/preview/battle-suit-skill-chip-v1/assets/audio/';
export const AUDIO_FILES=Object.freeze({
  rotor:`${BASE}helicopter-187681-cc0.mp3`,
  explosion:`${BASE}explosion-182797-cc0.mp3`,
  launch:'/preview/project-v-v3/assets/audio/firearm-qc-v1/m4a1-colt-socom-cc0-freesound-737569.mp3'
});

export class SkillChipAudio{
  constructor(){this.context=null;this.master=null;this.buffers={};this.sources=new Set();this.enabled=true;this.ready=false;this.epoch=0;this.syncRecords=[];this.loadPromise=null;}
  async prepare(){
    if(this.loadPromise)return this.loadPromise;
    this.loadPromise=(async()=>{
      const Audio=window.AudioContext||window.webkitAudioContext;
      if(!Audio)throw new Error('Web Audio를 사용할 수 없는 브라우저입니다.');
      const context=this.context=new Audio({latencyHint:'interactive'});
      this.master=context.createGain();this.master.gain.value=.58;this.master.connect(context.destination);
      await Promise.all(Object.entries(AUDIO_FILES).map(async([key,url])=>{
        const response=await fetch(url);if(!response.ok)throw new Error(`효과음 로드 실패: ${key}`);
        this.buffers[key]=await context.decodeAudioData(await response.arrayBuffer());
      }));
      this.ready=true;return true;
    })();return this.loadPromise;
  }
  async unlock(){
    if(!this.ready)await this.prepare();
    const context=this.context;
    if(context.state==='suspended')await context.resume();
    // Fresh contexts initially report zero output timestamps/latency. Wait a
    // bounded fraction of a second before the first shot, with no autoplay.
    if(context.getOutputTimestamp&&!(context.getOutputTimestamp().contextTime>0))await new Promise(resolve=>{
      const started=performance.now();
      const probe=()=>{if(context.state!=='running'||context.getOutputTimestamp().contextTime>0||performance.now()-started>160)resolve();else setTimeout(probe,12)};
      probe();
    });
    return context.state==='running';
  }
  setEnabled(value){this.enabled=Boolean(value);if(!this.enabled)this.stop()}
  stop(){this.epoch++;for(const entry of this.sources){entry.source.onended=null;try{entry.source.stop()}catch{}entry.source.disconnect();entry.gain.disconnect();entry.pan.disconnect();}this.sources.clear()}
  events(key){
    const seq=SEQUENCES[key],events=[];
    if(key==='airstrike')events.push({asset:'rotor',at:0,offset:0,duration:1.9,gain:.24,fadeIn:.24,fadeOut:.48,pan:-.2});
    else events.push({asset:'launch',at:seq.release-.02,offset:.04323,duration:.24,gain:.28,fadeIn:.003,fadeOut:.10,pan:-.35});
    seq.impacts.forEach((impact,i)=>{
      // Measured PCM first clipped peak = .5826875 s. The principal peak is at
      // impact, with a 20 ms original-recording lead-in, never a synthesized tone.
      events.push({asset:'explosion',at:impact-.02,offset:.5626875,duration:.46,gain:key==='airstrike'?.38:.60,fadeIn:.002,fadeOut:.30,pan:(i%3-1)*.12,impact,peakLead:.02});
      events.push({asset:'explosion',at:impact+.16,offset:.7626875,duration:Math.min(1.62,seq.duration-impact-.16),gain:.12,fadeIn:.04,fadeOut:1.0,pan:.15});
    });return events;
  }
  schedule(key,from=0,speed=1){
    this.stop();this.syncRecords=[];
    if(!this.ready||!this.enabled||this.context.state!=='running')return;
    const context=this.context,now=context.currentTime,rate=clamp(speed,.25,2);
    const performanceNow=performance.now(),stamp=context.getOutputTimestamp?.();
    // Map visual time to DAC/output time, not merely AudioContext render time.
    // This compensates the observed ~40 ms device latency in desktop QA.
    const validStamp=stamp&&stamp.contextTime>0&&stamp.performanceTime>0;
    const outputNow=validStamp?stamp.contextTime+(performanceNow-stamp.performanceTime)/1000:now-(context.outputLatency||context.baseLatency||0);
    this.outputCompensationMs=(now-outputNow)*1000;
    for(const event of this.events(key)){
      const wanted=outputNow+(event.at-from)/rate,when=Math.max(now,wanted);
      const skipped=Math.max(0,(when-wanted)*rate),remaining=event.duration-skipped;
      if(remaining<=0)continue;
      const source=context.createBufferSource(),gain=context.createGain(),pan=context.createStereoPanner();
      source.buffer=this.buffers[event.asset];source.playbackRate.value=rate;pan.pan.value=event.pan||0;
      source.connect(gain).connect(pan).connect(this.master);
      const duration=remaining/rate,volume=event.gain;
      const inDuration=Math.min(.06,(skipped>0?.012:event.fadeIn)/rate,duration*.2);
      const outDuration=Math.min(event.fadeOut/rate,duration*.8);
      gain.gain.setValueAtTime(0,when);gain.gain.linearRampToValueAtTime(volume,when+inDuration);
      gain.gain.setValueAtTime(volume,Math.max(when+inDuration,when+duration-outDuration));gain.gain.linearRampToValueAtTime(0,when+duration);
      const entry={source,gain,pan};this.sources.add(entry);
      source.onended=()=>{this.sources.delete(entry);source.disconnect();gain.disconnect();pan.disconnect()};
      source.start(when,event.offset+skipped,remaining);source.stop(when+duration+.01);
      if(event.impact!==undefined&&skipped<=event.peakLead)this.syncRecords.push({visualImpact:event.impact,predictedOutputPeakDeltaMs:(when+(event.peakLead-skipped)/rate-(outputNow+(event.impact-from)/rate))*1000});
    }
  }
  diagnostics(){return {ready:this.ready,enabled:this.enabled,state:this.context?.state||'unavailable',activeSources:this.sources.size,sync:this.syncRecords,outputCompensationMs:this.outputCompensationMs||0,baseLatencyMs:(this.context?.baseLatency||0)*1000,outputLatencyMs:(this.context?.outputLatency||0)*1000}}
  async destroy(){this.stop();await this.context?.close();this.context=null;this.ready=false}
}
