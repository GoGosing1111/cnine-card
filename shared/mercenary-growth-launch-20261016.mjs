import {mercenaryLevelDraft,validateMercenaryLevelPolicy,mercenaryLevelReadiness} from './mercenary-level-v1.mjs';
import {MERCENARY_GROWTH_VERSION} from './mercenary-growth-review-v2.mjs';

// Explicit 2026-10-16 launch settings, adopted from the reviewed growth room.
// This is an operation/QA input, never an automatic fallback for missing CMS data.
export const MERCENARY_GROWTH_LAUNCH_VERSION='mercenary-growth-launch-20261016';
export const MERCENARY_GROWTH_LAUNCH_PROFILE=Object.freeze({version:MERCENARY_GROWTH_VERSION,
 perLevel:Object.freeze({hpPercent:25,attackPercent:25,defensePercent:6,speedPercent:1}),
 milestones:Object.freeze([5,10,15,20].map((level,i)=>Object.freeze({level,hpPercent:100,attackPercent:125,defensePercent:15,speedPercent:2,skillPowerPercent:5,mitigationBypassPercent:12.5,actionCatchupPercent:[10,15,20,25][i],actionCreditPercent:[10,15,20,30][i]})))
});
export function mercenaryGrowthLaunchPolicy({revision=0,mode='ON'}={}){
 const policy=mercenaryLevelDraft();
 policy.revision=revision;policy.mode=mode;
 policy.xpPerCard=Object.fromEntries(Object.keys(policy.xpPerCard).map(rank=>[rank,100]));
 // Latest follow-up triples required XP only; material XP remains 100/300.
 policy.levels.forEach(row=>row.requiredXp=3*(200+50*row.level));
 policy.milestones.forEach(row=>row.successChancePpm=100000);
 policy.growth=structuredClone(MERCENARY_GROWTH_LAUNCH_PROFILE);
 const valid=validateMercenaryLevelPolicy(policy);
 if(!mercenaryLevelReadiness(valid,{requireGrowth:true}).ready)throw Error('INCOMPLETE_GROWTH_LAUNCH');
 return valid;
}
