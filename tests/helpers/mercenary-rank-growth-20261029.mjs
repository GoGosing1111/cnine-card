import {roster} from '../../scripts/measure-mercenary-growth-roster-20261020.mjs';
import {limitedDeploymentSnapshot} from '../../shared/mercenary-limited-deployment-v1.mjs';
import {tierCards} from './mercenary-operating-roster-v2144.mjs';
import {buildMercenaryFighter} from '../../functions/_mercenary_combat.js';
import {buildFighter} from '../../functions/_battle_v2_preview.js';
export {roster,tierCards};
export function rankedSnapshot(code,level=1){
 const base=limitedDeploymentSnapshot(code)||roster.snapshots.find(s=>s.code===code);
 if(!base)throw Error('UNKNOWN_TEST_MERCENARY '+code);
 return {...structuredClone(base),mercenaryLevel:{version:2,level,breakthroughMask:[5,10,15,20].reduce((m,l,i)=>m|(l<level?1<<i:0),0),policyRevision:roster.growthRevision,growth:roster.growth}};
}
export function rankedTeam(code,level,side='A',power=250000,mode='PVP',ownerId){
 const team=[...tierCards(power).map((c,i)=>buildFighter(c,i,side,null,mode)),buildMercenaryFighter(rankedSnapshot(code,level),side,mode,buildFighter)];
 if(ownerId)for(const a of team){a.ownerId=ownerId;a.id=side+':OWNER:'+ownerId+':'+a.id;}
 return team;
}
