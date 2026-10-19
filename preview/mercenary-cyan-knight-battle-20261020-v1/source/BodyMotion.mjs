import {MODES,sample} from '../motion.mjs';

export const BODY_PLAYBACK_RATE=2;
export const EFFECT_PLAYBACK_RATE=1;
export const CALM_IDLE_POSE=Object.freeze({bank:'idle',index:0,facing:1});

// Speed up the body between hit beats, then hold its recovery/ready pose.
// The effect clock, projectile contacts and authoritative damage never move.
// Array's sword impacts are independent of the caster's command gestures.
const commandBeats=[.35,.9,3.05,3.6];
export function bodyTime(mode,time){
 const spec=MODES[mode],t=Math.max(0,Math.min(spec.duration,Number(time)||0));
 if(mode==='idle')return 0;
 if(!['skill','area'].includes(spec.type))return t;
 const beats=mode==='array'?commandBeats:spec.contacts;
 const next=beats.findIndex(at=>t<=at);
 if(next===0)return Math.max(0,beats[0]-(beats[0]-t)*BODY_PLAYBACK_RATE);
 if(next<0)return Math.min(spec.duration,beats.at(-1)+(t-beats.at(-1))*BODY_PLAYBACK_RATE);
 const a=beats[next-1],b=beats[next],mid=(a+b)/2;
 return t<mid?Math.min(mid,a+(t-a)*BODY_PLAYBACK_RATE):Math.max(mid,b-(b-t)*BODY_PLAYBACK_RATE);
}
export function sampleBody(mode,time){
 const state=sample(mode,bodyTime(mode,time));
 return state.done&&mode!=='defeat'?{...state,pose:CALM_IDLE_POSE}:state;
}
