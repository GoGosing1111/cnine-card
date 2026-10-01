const BASE='/preview/project-v-v3-event-fx-v1/assets/audio/';
const FILES={dash:'dodge-combat-v2.mp3',slash:'critical-combat-v4.mp3',ultimate:'ultimate-combat-v2.mp3'};
export class CueAudio{
 constructor(){this.enabled=false;this.context=null;this.buffers=null;this.nodes=new Set();this.revision=0;this.scheduled=[];}
 async ready(){
  if(!this.context)this.context=new AudioContext();
  await this.context.resume();
  if(!this.buffers)this.buffers=Promise.all(Object.entries(FILES).map(async([key,file])=>{const r=await fetch(BASE+file);if(!r.ok)throw Error('Audio asset unavailable');return [key,await this.context.decodeAudioData(await r.arrayBuffer())];})).then(Object.fromEntries);
  return this.buffers;
 }
 stop(){this.revision++;for(const node of this.nodes){try{node.stop();}catch{}node.disconnect();}this.nodes.clear();this.scheduled=[];}
 async play(plan,time,speed,getTime=()=>time){
  this.stop();if(!this.enabled)return;const revision=this.revision;
  try{
   const buffers=await this.ready();if(revision!==this.revision||!this.enabled)return;time=getTime();
   const cues=plan.audioCues;
   for(const [key,contact,sync]of cues){
    if(plan.stop!==null&&contact>=plan.stop)continue;
    const start=contact-sync,offset=Math.max(0,time-start),buffer=buffers[key];if(offset>=buffer.duration)continue;
    const source=this.context.createBufferSource(),gain=this.context.createGain();source.buffer=buffer;source.playbackRate.value=speed;gain.gain.value=key==='ultimate'?.48:.38;
    source.connect(gain);gain.connect(this.context.destination);const when=this.context.currentTime+Math.max(0,start-time)/speed;
    source.start(when,offset);this.nodes.add(source);source.onended=()=>{this.nodes.delete(source);source.disconnect();gain.disconnect();};this.scheduled.push({key,contact,sourceSync:sync,when,offset,speed});
   }
  }catch(error){this.error=error.message;this.stop();}
 }
 destroy(){this.stop();void this.context?.close();this.context=null;}
}
