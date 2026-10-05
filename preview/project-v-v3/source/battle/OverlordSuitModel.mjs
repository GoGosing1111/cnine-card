import manifest from '../../../../assets/ui/project-v/account-battle-suits/overlord-v1/manifest.json' with {type:'json'};
import {MODES} from '../../../battle-suit-crimson-gold-knight-20261005-v1/motion.mjs';
export const OVERLORD_ASSETS=manifest;
export const OVERLORD_EXECUTION_COOLDOWN_MS=10000;
export function takeOverlordBatch(queue,{combatAtMs=null,nextExecutionAtMs=0,actionIndex=0}={}){
 if(!queue.length)return null;
 const entries=[queue.shift()];
 while(queue.length&&entries.length<48&&queue[0].target===entries[0].target)entries.push(queue.shift());
 const mode=entries[0].target?.isBoss===true&&Number.isFinite(combatAtMs)&&combatAtMs>=nextExecutionAtMs?'skill':actionIndex%3===2?'combo':'attack';
 return{mode,entries,combatAtMs,impacts:entries.map((entry,i)=>({entry,atMs:1000*MODES[mode].contacts[Math.floor(i*MODES[mode].contacts.length/entries.length)]}))};
}

