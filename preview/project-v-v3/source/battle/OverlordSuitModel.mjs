import manifest from '../../../../assets/ui/project-v/account-battle-suits/overlord-v1/manifest.json' with {type:'json'};
import {MODES} from '../../../battle-suit-crimson-gold-knight-20261005-v1/motion.mjs';
export const OVERLORD_ASSETS=manifest;
export const OVERLORD_EXECUTION_COOLDOWN_MS=10000;
export const OVERLORD_MOTION_SPEED=3.5;
export const OVERLORD_COMBO_EFFECT_SCALE=1.3;
// Accelerate anticipation/recovery around authoritative contacts. The brief
// five-hit volley retains its receipt timestamps instead of advancing damage.
export function overlordAreaMotionTime(time,contacts){
 const authored=MODES.aoe.contacts,last=authored.length-1;
 if(time<contacts[0])return Math.max(0,authored[0]+(time-contacts[0])*OVERLORD_MOTION_SPEED);
 for(let i=1;i<=last;i++)if(time<contacts[i]){
  const fraction=(time-contacts[i-1])/Math.max(.000001,contacts[i]-contacts[i-1]);
  return authored[i-1]+fraction*(authored[i]-authored[i-1]);
 }
 return Math.min(MODES.aoe.duration,authored[last]+(time-contacts[last])*OVERLORD_MOTION_SPEED);
}
export function overlordAreaMotionEnd(contacts){return contacts.at(-1)+(MODES.aoe.duration-MODES.aoe.contacts.at(-1))/OVERLORD_MOTION_SPEED;}
export function takeOverlordBatch(queue,{combatAtMs=null,nextExecutionAtMs=0,actionIndex=0}={}){
 if(!queue.length)return null;
 const entries=[queue.shift()];
 while(queue.length&&entries.length<48&&queue[0].target===entries[0].target)entries.push(queue.shift());
 const mode=entries[0].target?.isBoss===true&&Number.isFinite(combatAtMs)&&combatAtMs>=nextExecutionAtMs?'skill':actionIndex%3===2?'combo':'attack';
 return{mode,entries,combatAtMs,impacts:entries.map((entry,i)=>({entry,atMs:1000*MODES[mode].contacts[Math.floor(i*MODES[mode].contacts.length/entries.length)]}))};
}

