import manifest from '../../../../assets/ui/project-v/account-battle-suits/x-sword-v1/manifest.json' with {type:'json'};
import {MODES} from '../../../battle-suit-x-v1/motion.mjs';
export const X_SWORD=manifest;
export const isXBody=code=>String(code||'').trim().toUpperCase()===manifest.suitCode;
// Group only consecutive, existing receipts for the same actor. Visual flurry
// contacts distribute these receipts without manufacturing hits or damage.
export function takeXBodyBatch(queue,actionIndex=0,previousTarget=null){
 if(!queue.length)return null;
 const entries=[queue.shift()];
 while(queue.length&&entries.length<48&&queue[0].target===entries[0].target)entries.push(queue.shift());
 // A stable target can receive a flurry even when live receipts arrive one
 // at a time. Retain the short action when sparse receipts switch targets,
 // so retiring monster generations do not wait behind repeated long casts.
 const sameTarget=Boolean(previousTarget&&previousTarget.target===entries[0].target&&previousTarget.id===entries[0].target?.id);
 const mode=actionIndex%3===1&&(sameTarget||entries.length>=MODES.skill.contacts.length)?'skill':'attack';
 return{mode,entries,impacts:entries.map((entry,i)=>({entry,atMs:1000*MODES[mode].contacts[Math.floor(i*MODES[mode].contacts.length/entries.length)]}))};
}
