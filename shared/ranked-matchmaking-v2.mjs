import {rankedCandidateAllowed} from './ranked-reform-v1.mjs';

export const RANKED_MATCH_BATCH_SIZE=96;
export const RANKED_MATCH_CANDIDATE_LIMIT=768;
export const RANKED_MATCH_MIN_POOL_SIZE=8;
export const RANKED_MATCH_HISTORY_LIMIT=20;
export const RANKED_MATCH_RECENT_AVOID=5;

// Keep the CMS range as the first choice. Only an empty band widens the search;
// neither rating nor power can become an unrestricted fallback.
export function rankedMatchBands(settings){
 const score=Number(settings.matchSeasonRange??300),power=Number(settings.matchCardRange??15);
 return [[0,0],[100,10],[250,20]].map(([extraScore,extraPower])=>({
  matchSeasonRange:score+extraScore,matchCardRange:Math.min(100,power+extraPower)
 }));
}

export function rankedMatchBand(row,settings){
 if(!Number.isFinite(row.scoreDiff)||row.scoreDiff<0||!Number.isFinite(row.powerDiff)||row.powerDiff<0)return -1;
 return rankedMatchBands(settings).findIndex(band=>rankedCandidateAllowed(row,band));
}

const rankedMatchRandom=()=>crypto.getRandomValues(new Uint32Array(1))[0]/4294967296;

export function selectRankedCandidate(rows,settings,{recentOpponentIds=[],random=rankedMatchRandom}={}){
 const recent=recentOpponentIds.slice(0,RANKED_MATCH_HISTORY_LIMIT).map(Number);
 const counts=new Map();for(const id of recent)counts.set(id,(counts.get(id)||0)+1);
 const eligible=rows.map(row=>({...row,matchStage:rankedMatchBand(row,settings)})).filter(row=>row.matchStage>=0);
 // A third consecutive opponent is a last resort, not a permanent lockout.
 const repeated=recent.length>=2&&recent[0]===recent[1]?recent[0]:0;
 const alternatives=eligible.filter(row=>Number(row.id)!==repeated),allowed=alternatives.length?alternatives:eligible;
 if(!allowed.length)return null;
 const stage=Math.min(...allowed.map(row=>row.matchStage));
 let pool=allowed.filter(row=>row.matchStage===stage);
 // Stay in the closest valid band. Relax recency only when its pool is exhausted.
 for(const length of [RANKED_MATCH_RECENT_AVOID,2,1]){
  const avoided=new Set(recent.slice(0,length)),fresh=pool.filter(row=>!avoided.has(Number(row.id)));
  if(fresh.length){pool=fresh;break;}
 }
 if(pool.length===1)return pool[0];
 const scoreScale=Math.max(1,Number(settings.matchSeasonRange??300)*0.8),powerScale=Math.max(1,Number(settings.matchCardRange??15));
 const weighted=pool.map(row=>({row,weight:Math.exp(-row.scoreDiff/scoreScale-row.powerDiff/powerScale)/(1+(counts.get(Number(row.id))||0))**2}));
 const draw=random();if(!Number.isFinite(draw)||draw<0||draw>=1)throw new RangeError('Invalid ranked matchmaking random value');
 let cursor=draw*weighted.reduce((sum,item)=>sum+item.weight,0);
 for(const item of weighted){cursor-=item.weight;if(cursor<0)return item.row;}
 return weighted.at(-1).row;
}
