import {NOX_RHYTHM_RULES,judgeNoxNote} from '../shared/nox-raid-chart-v1.mjs?v=20261119-rhythm2';
export const NOX_CODES = Object.freeze({KeyD:0,KeyF:1,KeyJ:2,KeyK:3});
export function eventTime(event,now=performance.now(),origin=performance.timeOrigin){const t=Number(event.timeStamp);if(!Number.isFinite(t)||t<=0)return now;return Math.min(now,t>1e12?t-origin:t);}
export class NoxInput {
  constructor(root,onPress,{active=()=>true,onHeld=()=>{}}={}){
    this.root=root;this.onPress=onPress;this.active=active;this.onHeld=onHeld;this.held=new Map();this.abort=new AbortController();const opts={signal:this.abort.signal};
    const editable=e=>e.target?.closest?.('input,textarea,select,[contenteditable="true"]');
    document.addEventListener('keydown',e=>{const lane=NOX_CODES[e.code];if(lane===undefined||editable(e)||!this.active())return;e.preventDefault();if(!e.repeat)this.press('key:'+e.code,lane,e);},opts);
    document.addEventListener('keyup',e=>{if(NOX_CODES[e.code]!==undefined)this.release('key:'+e.code);},opts);
    root.addEventListener('pointerdown',e=>{const button=e.target.closest('[data-nox-lane]');if(!button||button.disabled||!this.active()||e.pointerType==='mouse'&&e.button!==0)return;e.preventDefault();button.setPointerCapture?.(e.pointerId);this.press('pointer:'+e.pointerId,Number(button.dataset.noxLane),e);},{...opts,passive:false});
    for(const type of ['pointerup','pointercancel','lostpointercapture'])root.addEventListener(type,e=>this.release('pointer:'+e.pointerId),opts);
    // Accessible activation for switch/keyboard users. Pointer click must not
    // duplicate pointerdown; physical D/F/J/K is handled above.
    root.addEventListener('click',e=>{const b=e.target.closest('[data-nox-lane]');if(b&&!b.disabled&&e.detail===0&&this.active()){this.onPress(Number(b.dataset.noxLane),eventTime(e));}},opts);
    window.addEventListener('blur',()=>this.reset(),opts);document.addEventListener('visibilitychange',()=>{if(document.hidden)this.reset();},opts);
  }
  press(source,lane,event){if(this.held.has(source)||!Number.isInteger(lane)||lane<0||lane>3)return;const repeated=[...this.held.values()].includes(lane);this.held.set(source,lane);this.onHeld(lane,true);if(!repeated)this.onPress(lane,eventTime(event));}
  release(source){const lane=this.held.get(source);this.held.delete(source);if(lane!==undefined&&![...this.held.values()].includes(lane))this.onHeld(lane,false);}
  reset(){const lanes=new Set(this.held.values());this.held.clear();for(const lane of lanes)this.onHeld(lane,false);}
  destroy(){this.abort.abort();this.reset();}
}
export const nearestNoxNote=judgeNoxNote;
// Drawing and judging share this calibrated output clock. A positive offset
// delays the visible chart as well as its judgment; it never shifts floor QTEs.
export function noxRhythmTime(audioTime,calibration=0){return audioTime-calibration;}
export function noxNoteY(noteAt,age,hitY,noteHeight=56){return hitY-(noteAt-age)*hitY/NOX_RHYTHM_RULES.travelMs-noteHeight/2;}
// Reserve the whole late window below the receptor, including the note body.
export function noxHitY(height,noteHeight){return Math.max(1,(height-noteHeight/2-6)/(1+NOX_RHYTHM_RULES.goodMs/NOX_RHYTHM_RULES.travelMs));}

export class NoxAudio {
  constructor(){this.context=null;this.buffers=new Map();this.loading=new Map();this.source=null;this.trackUrl=null;this.musicStartAt=null;this.startContext=0;this.offset=0;this.abort=new AbortController();this.generation=0;}
  unlock(){const AudioContext=window.AudioContext||window.webkitAudioContext;if(!AudioContext)throw new Error('이 브라우저는 정밀 음원 재생을 지원하지 않습니다. 최신 Chrome 또는 Safari에서 다시 열어 주세요.');this.context??=new AudioContext({latencyHint:'interactive'});return this.context.resume();}
  async prepare(url){
    if(this.buffers.has(url))return;if(this.loading.has(url))return this.loading.get(url);
    const generation=this.generation,context=this.context,signal=this.abort.signal;
    const task=(async()=>{const response=await fetch(url,{signal});if(!response.ok)throw new Error('경매 BGM을 불러오지 못했습니다. 다시 준비해 주세요.');const bytes=await response.arrayBuffer(),decoded=await context.decodeAudioData(bytes);
      if(generation!==this.generation||signal.aborted)throw new DOMException('Preparation cancelled','AbortError');
      // Only the 30-second chart and its tail are played. Keep at most three
      // 31-second buffers instead of retaining three full-length stereo songs.
      const length=Math.min(decoded.length,Math.ceil(decoded.sampleRate*31)),buffer=context.createBuffer(decoded.numberOfChannels,length,decoded.sampleRate);
      for(let channel=0;channel<buffer.numberOfChannels;channel++)buffer.copyToChannel(decoded.getChannelData(channel).subarray(0,length),channel);
      this.buffers.set(url,buffer);
    })().finally(()=>{if(generation===this.generation)this.loading.delete(url);});
    this.loading.set(url,task);return task;
  }
  async prepareAll(urls){const generation=this.generation;for(const key of this.buffers.keys())if(!urls.includes(key))this.buffers.delete(key);for(const url of new Set(urls)){if(generation!==this.generation)throw new DOMException('Preparation cancelled','AbortError');await this.prepare(url);}}
  schedule(url,musicStartAt,serverNow){if(this.musicStartAt===musicStartAt&&this.trackUrl===url&&this.source)return;const buffer=this.buffers.get(url);if(!buffer||this.context?.state!=='running')return;this.stop();this.trackUrl=url;this.musicStartAt=musicStartAt;const wait=(musicStartAt-serverNow)/1000;this.startContext=this.context.currentTime+Math.max(.08,wait);this.offset=Math.max(0,.08-wait);const source=this.context.createBufferSource(),gain=this.context.createGain();gain.gain.value=.25;source.buffer=buffer;source.connect(gain);gain.connect(this.context.destination);this.source=source;this.gain=gain;source.start(this.startContext,Math.min(this.offset,buffer.duration-.01));}
  timeAt(perfTime=performance.now()){
    if(!this.context||this.musicStartAt===null)return null;const output=this.context.getOutputTimestamp?.();
    const contextTime=output?.performanceTime>0?output.contextTime+(perfTime-output.performanceTime)/1000:this.context.currentTime+(perfTime-performance.now())/1000-(this.context.outputLatency||this.context.baseLatency||0);
    return (contextTime-this.startContext+this.offset)*1000;
  }
  stop(){if(this.source){try{this.source.stop();}catch{}this.source.disconnect();this.source=null;this.gain?.disconnect();}this.musicStartAt=null;this.trackUrl=null;}
  clear(){this.generation++;this.abort.abort();this.abort=new AbortController();this.loading.clear();this.buffers.clear();}
  async suspend(){this.stop();this.clear();if(this.context?.state==='running')await this.context.suspend();}
  async destroy(){this.stop();this.clear();await this.context?.close();this.context=null;}
}
