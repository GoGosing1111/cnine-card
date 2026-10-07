import base from '../../../battle-suit-sx-v1/manifest.json' with {type:'json'};
import ultimate from '../../../battle-suit-sx-v1/ultimate-v3/manifest.json' with {type:'json'};
import {MODES} from '../../../battle-suit-sx-v1/motion.mjs';
import {DURATION} from '../../../battle-suit-sx-v1/ultimate-v3/motion.mjs';
import {SX_AREA_SKILL,SX_ATTACK_SPEED} from '../../../../shared/sx-suit-v1.mjs';
export const SX_BASE=base,SX_ULTIMATE=ultimate;
export const SX_RUNTIME_VERSION='SX_LIVE_20261007_2X_V1';
export const SX_SKILL_COOLDOWN_MS=10000;
export function takeSxBatch(queue,{combatAtMs=null,nextSkillAtMs=0}={}){
  if(!queue.length)return null;
  const entries=[queue.shift()];
  while(queue.length&&entries.length<48&&queue[0].target===entries[0].target)entries.push(queue.shift());
  const mode=entries[0].target?.isBoss===true&&Number.isFinite(combatAtMs)&&combatAtMs>=nextSkillAtMs?'skill':'attack';
  return {mode,entries,combatAtMs,impacts:entries.map((entry,i)=>({entry,atMs:1000*MODES[mode].contacts[Math.floor(i*MODES[mode].contacts.length/entries.length)]/SX_ATTACK_SPEED})),duration:MODES[mode].duration/SX_ATTACK_SPEED};
}
export function sxAreaMotionTime(time,contacts){
  const authored=SX_AREA_SKILL.impactOffsetsMs.map(ms=>ms/1000),last=authored.length-1;
  if(time<contacts[0])return Math.max(0,authored[0]+time-contacts[0]);
  for(let i=1;i<=last;i++)if(time<contacts[i])return authored[i-1]+(time-contacts[i-1])/Math.max(.000001,contacts[i]-contacts[i-1])*(authored[i]-authored[i-1]);
  return Math.min(DURATION,authored[last]+time-contacts[last]);
}
export const sxAreaMotionEnd=contacts=>contacts.at(-1)+DURATION-SX_AREA_SKILL.impactOffsetsMs.at(-1)/1000;
