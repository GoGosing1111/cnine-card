import {SkillChipAudio,AUDIO_FILES} from '../../battle-suit-skill-chip-v1/source/SkillChipAudio.js';
import {SEQUENCE} from './sequence.mjs';

// Reuse the approved recorded-source/output-latency scheduler. No new synthesizer.
export class OctaSeekerAudio extends SkillChipAudio {
  constructor(options={}){super({files:{launch:AUDIO_FILES.launch,explosion:AUDIO_FILES.explosion},...options});}
  sequence(key){return key==='octaseeker'?SEQUENCE:super.sequence(key)}
  events(key='octaseeker'){
    if(key!=='octaseeker')return super.events(key);
    const events=[{asset:'launch',at:SEQUENCE.release-.02,offset:.04323,duration:.24,gain:.24,fadeIn:.003,fadeOut:.10,pan:-.2}];
    SEQUENCE.impacts.forEach((impact,i)=>events.push({asset:'explosion',at:impact-.02,
      offset:.5626875,duration:.31,gain:i===7?.22:.12,fadeIn:.002,fadeOut:.24,pan:.14,impact,peakLead:.02}));
    events.push({asset:'explosion',at:SEQUENCE.impacts.at(-1)+.16,offset:.7626875,duration:1.5,
      gain:.13,fadeIn:.04,fadeOut:1.1,pan:.14});
    return events;
  }
  // Inherit the shared append/phase/confirmed-hit scheduler, including pause,
  // device output compensation and simultaneous legacy-chip sounds.
}
