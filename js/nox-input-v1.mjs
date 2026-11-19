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
export function nearestNoxNote(notes,hits,lane,at,windowMs=90){let best=null,delta=Infinity;for(const note of notes){if(note.lane!==lane||hits.has(note.id))continue;const d=Math.abs(note.at-at);if(d<=windowMs&&d<delta){best=note;delta=d;}}return best?{note:best,delta,grade:delta<=35?'PERFECT':'GOOD'}:null;}
// Drawing and judging share this calibrated output clock. A positive offset
// delays the visible chart as well as its judgment; it never shifts floor QTEs.
export function noxRhythmTime(audioTime,calibration=0){return audioTime-calibration;}
export function noxNoteY(noteAt,age,hitY,noteHeight=16){return hitY-(noteAt-age)*hitY/1400-noteHeight/2;}

export class NoxAudio {
  constructor(){this.context=null;this.buffer=null;this.loading=null;this.source=null;this.musicStartAt=null;this.startContext=0;this.offset=0;this.abort=null;this.generation=0;}
  unlock(){const AudioContext=window.AudioContext||window.webkitAudioContext;if(!AudioContext)throw new Error('이 브라우저는 정밀 음원 재생을 지원하지 않습니다. 최신 Chrome 또는 Safari에서 다시 열어 주세요.');this.context??=new AudioContext({latencyHint:'interactive'});return this.context.resume();}
  async prepare(url){if(this.buffer)return;if(this.loading)return this.loading;this.abort=new AbortController();this.loading=(async()=>{const response=await fetch(url,{signal:this.abort.signal});if(!response.ok)throw new Error('경매 BGM을 불러오지 못했습니다. 다시 준비해 주세요.');const bytes=await response.arrayBuffer();this.buffer=await this.context.decodeAudioData(bytes);})().finally(()=>{this.loading=null;});return this.loading;}
  schedule(musicStartAt,serverNow){if(this.musicStartAt===musicStartAt&&this.source)return;if(!this.buffer||this.context?.state!=='running')return;this.stop();this.musicStartAt=musicStartAt;const wait=(musicStartAt-serverNow)/1000;this.startContext=this.context.currentTime+Math.max(.08,wait);this.offset=Math.max(0,.08-wait);const source=this.context.createBufferSource(),gain=this.context.createGain();gain.gain.value=.25;source.buffer=this.buffer;source.connect(gain);gain.connect(this.context.destination);this.source=source;this.gain=gain;source.start(this.startContext,Math.min(this.offset,this.buffer.duration-.01));}
  timeAt(perfTime=performance.now()){
    if(!this.context||this.musicStartAt===null)return null;const output=this.context.getOutputTimestamp?.();
    const contextTime=output?.performanceTime>0?output.contextTime+(perfTime-output.performanceTime)/1000:this.context.currentTime+(perfTime-performance.now())/1000-(this.context.outputLatency||this.context.baseLatency||0);
    return (contextTime-this.startContext+this.offset)*1000;
  }
  stop(){if(this.source){try{this.source.stop();}catch{}this.source.disconnect();this.source=null;this.gain?.disconnect();}this.musicStartAt=null;}
  async suspend(){this.stop();this.abort?.abort();if(this.context?.state==='running')await this.context.suspend();}
  async destroy(){this.stop();this.abort?.abort();await this.context?.close();this.context=null;this.buffer=null;}
}
