import {SkillChipAudio} from '../../battle-suit-skill-chip-v1/source/SkillChipAudio.js';
import manifest from '../skill-audio-v1.json' with {type:'json'};

const clamp=(n,a,b)=>Math.min(b,Math.max(a,n));
export function mercenaryAudioEvents(skill,plan){
  const profile=manifest.profiles[skill.id];if(!profile)return [];
  const out=[],notice=manifest.assets[profile.notice];
  const noticeDuration=Math.min(.16,notice.peak>.045?notice.peak-.025:.09);
  out.push({asset:profile.notice,at:0,offset:0,duration:noticeDuration,gain:.06/Math.max(.2,notice.peakAmplitude),fadeIn:.012,fadeOut:.05,pan:-.12,layer:'NOTICE'});
  const cancel=plan.events.find(e=>e.kind==='CANCEL')?.at??Infinity;
  const impacts=plan.authoritative
    ?plan.events.map(e=>({at:e.at,index:e.phaseIndex||0}))
    :skill.visual.impacts.flatMap((at,index)=>plan.events.some(e=>Math.abs(e.at-at)<.001&&['HIT','STATUS','SHIELD','HEAL','CLEANSE','INTERRUPT'].includes(e.kind))&&at<cancel?[{at,index}]:[]);
  for(const {at,index} of impacts){
    if(at>=cancel)continue;const asset=profile.impacts[Math.min(index,profile.impacts.length-1)],row=manifest.assets[asset];
    const lead=Math.min(.018,row.peak),gain=profile.gains[Math.min(index,profile.gains.length-1)]/Math.max(.2,row.peakAmplitude);
    out.push({asset,at:at-lead,offset:row.peak-lead,duration:Math.min(.19,row.duration-row.peak+lead),gain,fadeIn:.001,fadeOut:.12,pan:0,impact:at,peakLead:lead,layer:'IMPACT'});
    const offset=row.peak+.15,duration=Math.min(.95,row.duration-offset,plan.duration-at-.13);
    if(duration>.02)out.push({asset,at:at+.13,offset,duration,gain:gain*.22,fadeIn:.025,fadeOut:duration*.8,pan:.12,layer:'TAIL'});
  }
  return out;
}

export class MercenarySkillAudio extends SkillChipAudio{
  constructor(context){
    if(!context)throw Error('MERCENARY_AUDIO_REQUIRES_V3_SHARED_CONTEXT');
    super({sharedContext:context,files:Object.fromEntries(Object.entries(manifest.assets).map(([k,v])=>[k,v.url])),maxPlaybackRate:8});
    this.planEvents=[];this.panDirection=1;this.lastRate=1;
  }
  select(skill,plan,{panDirection=1}={}){this.stop();this.planEvents=mercenaryAudioEvents(skill,plan);this.panDirection=panDirection;}
  events(){return this.planEvents.map(e=>({...e,pan:e.pan*this.panDirection}));}
  scheduleFrom(from,rate){this.lastRate=clamp(rate,.25,8);this.schedule('mercenary',from,this.lastRate);}
  diagnostics(){return {...super.diagnostics(),sourceType:manifest.sourceType,sharedV3Context:true,profileEvents:this.planEvents.length,rate:this.lastRate};}
}
export function getMercenaryAudio(engine){
  if(engine.mercenaryAudio)return engine.mercenaryAudio;
  engine.audio?.ensure();
  if(!engine.audio?.context)return null;
  return engine.mercenaryAudio=new MercenarySkillAudio(engine.audio.context);
}
