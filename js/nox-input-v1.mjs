import {NOX_RHYTHM_RULES,judgeNoxNote} from '../shared/nox-raid-chart-v1.mjs?v=20261123-hold1';
export const NOX_CODES = Object.freeze({KeyD:0,KeyF:1,KeyJ:2,KeyK:3});
export const NOX_DEFAULT_KEYS = Object.freeze(Object.keys(NOX_CODES));

const keyNames = new Map(Object.entries({
  ArrowLeft:'←', ArrowDown:'↓', ArrowUp:'↑', ArrowRight:'→', Space:'Space', Enter:'Enter',
  ShiftLeft:'L Shift', ShiftRight:'R Shift', ControlLeft:'L Ctrl', ControlRight:'R Ctrl', AltLeft:'L Alt', AltRight:'R Alt',
  Backspace:'Backspace', Delete:'Del', Insert:'Ins', Home:'Home', End:'End', PageUp:'PgUp', PageDown:'PgDn',
  CapsLock:'Caps Lock', NumLock:'Num Lock', ScrollLock:'Scroll Lock', Lang1:'한/영', Lang2:'한자',
  Backquote:'`', Minus:'-', Equal:'=', BracketLeft:'[', BracketRight:']', Backslash:'\\',
  Semicolon:';', Quote:"'", Comma:',', Period:'.', Slash:'/', IntlBackslash:'Intl \\', IntlRo:'ろ', IntlYen:'¥',
  NumpadAdd:'Num +', NumpadSubtract:'Num −', NumpadMultiply:'Num ×', NumpadDivide:'Num /', NumpadDecimal:'Num .',
  NumpadEnter:'Num ↵', NumpadComma:'Num ,', NumpadEqual:'Num ='
}));

export function noxKeyLabel(code) {
  if (typeof code !== 'string') return '';
  if (/^Key[A-Z]$/.test(code)) return code.slice(3);
  if (/^Digit[0-9]$/.test(code)) return code.slice(5);
  if (/^Numpad[0-9]$/.test(code)) return 'Num ' + code.slice(6);
  if (/^F(?:[1-9]|1[0-9]|2[0-4])$/.test(code)) return code;
  return keyNames.get(code) || '';
}

export function readNoxRhythmKeys(saved) {
  try {
    const keys = JSON.parse(saved);
    if (Array.isArray(keys) && keys.length === 4 && new Set(keys).size === 4 && keys.every(noxKeyLabel)) return keys;
  } catch {}
  return [...NOX_DEFAULT_KEYS];
}

export function rebindNoxLane(keys, lane, code) {
  if (!Number.isInteger(lane) || lane < 0 || lane >= keys.length || !noxKeyLabel(code)) return keys;
  const next = [...keys], other = keys.indexOf(code);
  if (other >= 0) next[other] = keys[lane];
  next[lane] = code;
  return next;
}
export function eventTime(event,now=performance.now(),origin=performance.timeOrigin){const t=Number(event.timeStamp);if(!Number.isFinite(t)||t<=0)return now;return Math.min(now,t>1e12?t-origin:t);}
export class NoxInput {
  constructor(root,onPress,{active=()=>true,onHeld=()=>{},onRelease=()=>{},laneKeys=()=>NOX_DEFAULT_KEYS}={}){
    this.root=root;this.onPress=onPress;this.active=active;this.onHeld=onHeld;this.onRelease=onRelease;this.held=new Map();this.abort=new AbortController();const opts={signal:this.abort.signal};
    const editable=e=>e.target?.closest?.('input,textarea,select,[contenteditable="true"]');
    const modifierHeld=name=>this.held.has('key:'+name+'Left')||this.held.has('key:'+name+'Right');
    document.addEventListener('keydown',e=>{
      if(editable(e)||!this.active())return;
      const keys=laneKeys();
      // Browser shortcuts stay available unless the held modifier is itself a play key.
      if(e.metaKey||(e.ctrlKey&&!e.code?.startsWith('Control')&&!modifierHeld('Control'))||
          (e.altKey&&!e.code?.startsWith('Alt')&&!modifierHeld('Alt')))return;
      let lane=keys.indexOf(e.code);
      if(e.key==='Enter'||e.key===' '){
        const button=e.target?.closest?.('button,a[href],[role="button"]');
        if(button&&(!root.contains(button)||!button.hasAttribute('data-nox-lane')||button.disabled))return;
        if(lane<0&&button)lane=Number(button.dataset.noxLane);
      }
      if(lane<0)return;
      e.preventDefault();
      if(!e.repeat)this.press('key:'+e.code,lane,e);
    },opts);
    document.addEventListener('keyup',e=>this.release('key:'+e.code,eventTime(e)),opts);
    root.addEventListener('pointerdown',e=>{const button=e.target.closest('[data-nox-lane]');if(!button||button.disabled||!this.active()||e.pointerType==='mouse'&&e.button!==0)return;e.preventDefault();button.setPointerCapture?.(e.pointerId);this.press('pointer:'+e.pointerId,Number(button.dataset.noxLane),e);},{...opts,passive:false});
    for(const type of ['pointerup','pointercancel','lostpointercapture'])root.addEventListener(type,e=>this.release('pointer:'+e.pointerId,eventTime(e)),opts);
    // Accessible activation for switch/keyboard users. Pointer click must not
    // duplicate pointerdown; physical lane keys are handled above.
    root.addEventListener('click',e=>{const b=e.target.closest('[data-nox-lane]');if(b&&!b.disabled&&e.detail===0&&this.active()){this.onPress(Number(b.dataset.noxLane),eventTime(e));}},opts);
    window.addEventListener('blur',()=>this.reset(),opts);document.addEventListener('visibilitychange',()=>{if(document.hidden)this.reset();},opts);
  }
  isHeld(lane){return [...this.held.values()].includes(lane);}
  press(source,lane,event){if(this.held.has(source)||!Number.isInteger(lane)||lane<0||lane>3)return;const repeated=this.isHeld(lane);this.held.set(source,lane);this.onHeld(lane,true);if(!repeated)this.onPress(lane,eventTime(event));}
  release(source,at){const lane=this.held.get(source);this.held.delete(source);if(lane!==undefined&&!this.isHeld(lane)){this.onHeld(lane,false);this.onRelease(lane,at);}}
  reset(){const lanes=new Set(this.held.values()),at=performance.now();this.held.clear();for(const lane of lanes){this.onHeld(lane,false);this.onRelease(lane,at);}}
  destroy(){this.abort.abort();this.reset();}
}
export const nearestNoxNote=judgeNoxNote;
// Drawing and judging share this calibrated output clock. A positive offset
// delays the visible chart as well as its judgment; it never shifts floor QTEs.
export function noxRhythmTime(audioTime,calibration=0){return audioTime-calibration;}
const lateFallRatio=.55,lateDropPx=36;
export function noxNoteY(noteAt,age,hitY,noteHeight=56,travelMs=NOX_RHYTHM_RULES.travelMs){
  const elapsed=age-noteAt,fallSpeed=hitY/travelMs;
  const speed=elapsed<=0?fallSpeed:Math.min(fallSpeed*lateFallRatio,lateDropPx/NOX_RHYTHM_RULES.goodMs);
  return hitY+elapsed*speed-noteHeight/2;
}
// Lower the receptor while keeping the late judgment window inside the chart.
export function noxHitY(height,noteHeight,travelMs=NOX_RHYTHM_RULES.travelMs){
  const bottom=height-noteHeight/2-6;
  return Math.max(1,bottom/(1+lateFallRatio*NOX_RHYTHM_RULES.goodMs/travelMs),bottom-lateDropPx);
}
// A full song may have hundreds of notes; visit only the visible time range.
// Binary search also handles resyncs/backwards corrections without stale cursors.
export function noxNoteStart(notes,at){let lo=0,hi=notes.length;while(lo<hi){const mid=(lo+hi)>>>1;if(notes[mid].at<at)lo=mid+1;else hi=mid;}return lo;}

export class NoxAudio {
  constructor(){this.context=null;this.buffers=new Map();this.loading=new Map();this.hitBuffers=new Map();this.hitVoices=new Set();this.source=null;this.trackUrl=null;this.musicStartAt=null;this.startContext=0;this.offset=0;this.abort=new AbortController();this.generation=0;}
  unlock(){const AudioContext=window.AudioContext||window.webkitAudioContext;if(!AudioContext)throw new Error('이 브라우저는 정밀 음원 재생을 지원하지 않습니다. 최신 Chrome 또는 Safari에서 다시 열어 주세요.');this.context??=new AudioContext({latencyHint:'interactive'});return this.context.resume();}
  async prepare(url){
    if(this.buffers.has(url))return;if(this.loading.has(url))return this.loading.get(url);
    const generation=this.generation,context=this.context,signal=this.abort.signal;
    const task=(async()=>{const response=await fetch(url,{signal});if(!response.ok)throw new Error('경매 BGM을 불러오지 못했습니다. 다시 준비해 주세요.');const bytes=await response.arrayBuffer(),decoded=await context.decodeAudioData(bytes);
      if(generation!==this.generation||signal.aborted)throw new DOMException('Preparation cancelled','AbortError');
      // Keep the three selected songs through their endings. Reuse the decoded
      // buffer directly, avoiding a second full-song allocation/copy.
      this.buffers.set(url,decoded);
    })().finally(()=>{if(generation===this.generation)this.loading.delete(url);});
    this.loading.set(url,task);return task;
  }
  async prepareAll(urls){const generation=this.generation;for(const key of this.buffers.keys())if(!urls.includes(key))this.buffers.delete(key);for(const url of new Set(urls)){if(generation!==this.generation)throw new DOMException('Preparation cancelled','AbortError');await this.prepare(url);}}
  schedule(url,musicStartAt,serverNow){
    const buffer=this.buffers.get(url),ctx=this.context;
    if(!buffer||ctx?.state!=='running')return;
    const wait=(musicStartAt-serverNow)/1000;
    if(this.musicStartAt===musicStartAt&&this.trackUrl===url&&this.source){
      // A suspended audio clock can resume seconds behind the live round.
      // Compare transport clocks; device output latency still belongs in timeAt.
      const drift=ctx.currentTime-this.startContext+this.offset+wait;
      if(Math.abs(drift)<.35)return;
    }
    this.stop();this.trackUrl=url;this.musicStartAt=musicStartAt;
    this.startContext=ctx.currentTime+Math.max(.08,wait);this.offset=Math.max(0,.08-wait);
    const source=ctx.createBufferSource(),gain=ctx.createGain();
    gain.gain.value=.25;source.buffer=buffer;source.connect(gain);gain.connect(ctx.destination);
    this.source=source;this.gain=gain;source.start(this.startContext,Math.min(this.offset,buffer.duration-.01));
  }
  timeAt(perfTime=performance.now()){
    if(!this.context||this.musicStartAt===null)return null;const output=this.context.getOutputTimestamp?.();
    const contextTime=output?.performanceTime>0?output.contextTime+(perfTime-output.performanceTime)/1000:this.context.currentTime+(perfTime-performance.now())/1000-(this.context.outputLatency||this.context.baseLatency||0);
    return (contextTime-this.startContext+this.offset)*1000;
  }
  hit(grade){
    const ctx=this.context;if(ctx?.state!=='running'||!['PERFECT','GOOD'].includes(grade))return;
    let buffer=this.hitBuffers.get(grade);
    if(!buffer){
      buffer=ctx.createBuffer(1,Math.ceil(ctx.sampleRate*.11),ctx.sampleRate);const data=buffer.getChannelData(0),perfect=grade==='PERFECT';let noise=19,filtered=0;
      for(let i=0;i<data.length;i++){const t=i/ctx.sampleRate;noise=(Math.imul(noise,1664525)+1013904223)>>>0;filtered=.65*filtered+.35*(noise/2147483648-1);const attack=Math.min(1,t/.0015),body=Math.sin(2*Math.PI*(115*t-180*t*t))*Math.exp(-t*42),click=(Math.sin(2*Math.PI*(perfect?1350:1050)*t)*.16+filtered*.28)*Math.exp(-t*95);data[i]=(body*.55+click)*attack;}
      this.hitBuffers.set(grade,buffer);
    }
    while(this.hitVoices.size>=6)this.hitVoices.values().next().value.dispose();
    const source=ctx.createBufferSource(),gain=ctx.createGain();source.buffer=buffer;gain.gain.value=grade==='PERFECT'?.24:.18;source.connect(gain);gain.connect(ctx.destination);
    const voice={dispose:()=>{source.onended=null;try{source.stop();}catch{}source.disconnect();gain.disconnect();this.hitVoices.delete(voice);}};
    source.onended=voice.dispose;this.hitVoices.add(voice);source.start();
  }
  stop(){for(const voice of this.hitVoices)voice.dispose();if(this.source){try{this.source.stop();}catch{}this.source.disconnect();this.source=null;this.gain?.disconnect();}this.musicStartAt=null;this.trackUrl=null;}
  clear(){this.generation++;this.abort.abort();this.abort=new AbortController();this.loading.clear();this.buffers.clear();this.hitBuffers.clear();}
  async suspend(){this.stop();this.clear();if(this.context?.state==='running')await this.context.suspend();}
  async destroy(){this.stop();this.clear();await this.context?.close();this.context=null;}
}
