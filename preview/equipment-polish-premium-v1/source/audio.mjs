const ROOT='/assets/sfx/v3-advancement-awakening-v1/';
export const SOUND_CUES=Object.freeze([
 {time:.65,peak:.178,file:'afterimage-advancement-v1.mp3',gain:.045},
 {time:2.50,peak:.300,file:'riposte-advancement-v1.mp3',gain:.090},
 {time:4.35,peak:.333,file:'immortal-advancement-v1.mp3',gain:.065}
]);
export class PolishAudio{
 constructor(){this.enabled=false;this.nodes=[];this.buffers=new Map();this.generation=0;this.syncErrorMs=0;}
 async enable(value){this.enabled=!!value;if(!value){this.stop();return false;}try{this.context??=new(window.AudioContext||window.webkitAudioContext)();await this.context.resume();await Promise.all(SOUND_CUES.map(async cue=>{if(this.buffers.has(cue.file))return;const r=await fetch(ROOT+cue.file);if(!r.ok)throw new Error('Sound unavailable');this.buffers.set(cue.file,await this.context.decodeAudioData(await r.arrayBuffer()));}));return this.context.state==='running';}catch{this.enabled=false;return false;}}
 stop(){this.generation++;for(const {source,gain} of this.nodes){try{source.stop();}catch{}source.disconnect();gain.disconnect();}this.nodes=[];}
 schedule(from,to,speed=1){this.stop();if(!this.enabled||!this.context)return;const base=this.context.currentTime;for(const cue of SOUND_CUES){const start=cue.time-cue.peak,buffer=this.buffers.get(cue.file);if(!buffer||cue.time>to||from>cue.time+.15)continue;const offset=Math.max(0,from-start);if(offset>=buffer.duration)continue;const delay=Math.max(0,(start-from)/speed);const source=this.context.createBufferSource(),gain=this.context.createGain();source.buffer=buffer;source.playbackRate.value=speed;gain.gain.value=cue.gain;source.connect(gain).connect(this.context.destination);source.start(base+delay,offset);this.nodes.push({source,gain});this.syncErrorMs=Math.max(this.syncErrorMs,Math.abs(delay+(cue.peak-offset)/speed-(cue.time-from)/speed)*1000);}}
 destroy(){this.stop();this.context?.close().catch(()=>{});}
}
