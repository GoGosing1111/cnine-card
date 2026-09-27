import manifest from '../../../../assets/ui/project-v/account-battle-suits/x-sword-v1/manifest.json' with {type:'json'};
import {MODES} from '../../../battle-suit-x-v1/motion.mjs';
export const X_SWORD=manifest;
export const X_BODY_FLURRY_COOLDOWN_MS=10000;
export const isXBody=code=>String(code||'').trim().toUpperCase()===manifest.suitCode;
// Group only consecutive, existing receipts for the same actor. Visual flurry
// contacts distribute these receipts without manufacturing hits or damage.
export function takeXBodyBatch(queue,{combatAtMs=null,nextFlurryAtMs=0}={}){
 if(!queue.length)return null;
 const entries=[queue.shift()];
 while(queue.length&&entries.length<48&&queue[0].target===entries[0].target)entries.push(queue.shift());
 // The shared, pausable battle clock owns the cooldown. Neither large receipt
 // queues nor a new monster identity can make a normal mob eligible.
 const mode=entries[0].target?.isBoss===true&&Number.isFinite(combatAtMs)&&combatAtMs>=nextFlurryAtMs?'skill':'attack';
 return{mode,entries,combatAtMs,impacts:entries.map((entry,i)=>({entry,atMs:1000*MODES[mode].contacts[Math.floor(i*MODES[mode].contacts.length/entries.length)]}))};
}
