import {rankedCandidateAllowed} from './ranked-reform-v1.mjs';

export const RANKED_MATCH_BATCH_SIZE=96;
export const RANKED_MATCH_CANDIDATE_LIMIT=768;
export const RANKED_MATCH_MIN_POOL_SIZE=8;
export const RANKED_MATCH_HISTORY_LIMIT=20;
export const RANKED_MATCH_RECENT_AVOID=5;

// Mercenary strength remains a combat advantage, not an opponent-selection tax.
// Tickets still retain full formation power for the pre-fight change guard.
export function rankedMatchPower(formationPower,mercenaryPower=0){
 const total=Number(formationPower),mercenary=Number(mercenaryPower);
 if(!Number.isFinite(total)||!Number.isFinite(mercenary)||total<=0||mercenary<0)return 0;
 return Math.max(0,total-mercenary);
}

// All searches, including a rematch fallback, share these score and power caps.
export function rankedMatchBands(settings,lowerScore){
 const score=Number(settings.matchSeasonRange??300),power=Number(settings.matchCardRange??15);
 const bands=[[0,0],[100,10],[250,20]].map(([extraScore,extraPower])=>({
  matchSeasonRange:score+extraScore,matchCardRange:Math.min(100,power+extraPower)
 }));
 const diamond=settings.tiers?.find(tier=>tier.id==='diamond');
 if(diamond&&Number.isFinite(lowerScore)&&lowerScore>=diamond.min&&bands[2].matchSeasonRange<750){
  bands.push({matchSeasonRange:Math.min(750,score+500),matchCardRange:Math.min(20,power)});
 }
 return bands;
}

export function rankedMatchBand(row,settings){
 if(!Number.isFinite(row.scoreDiff)||row.scoreDiff<0||!Number.isFinite(row.powerDiff)||row.powerDiff<0)return -1;
 return rankedMatchBands(settings,row.lowerScore).findIndex(band=>rankedCandidateAllowed(row,band));
}

const rankedMatchRandom=()=>crypto.getRandomValues(new Uint32Array(1))[0]/4294967296;

export function selectRankedCandidate(rows,settings,{recentOpponentIds=[],random=rankedMatchRandom}={}){
 const recent=recentOpponentIds.slice(0,RANKED_MATCH_HISTORY_LIMIT).map(Number);
 const counts=new Map();for(const id of recent)counts.set(id,(counts.get(id)||0)+1);
 const eligible=rows.map(row=>({...row,matchStage:rankedMatchBand(row,settings)})).filter(row=>row.matchStage>=0);
 const regular=eligible.filter(row=>row.matchStage<3);
 const rescue=eligible.filter(row=>row.matchStage===3);
 const useRescue=rescue.length&&(!regular.length||(regular.length===1&&Number(regular[0].id)===recent[0]));
 const candidates=useRescue?rescue:regular;
 // A third consecutive opponent is a last resort, not a permanent lockout.
 const repeated=recent.length>=2&&recent[0]===recent[1]?recent[0]:0;
 const alternatives=candidates.filter(row=>Number(row.id)!==repeated),allowed=alternatives.length?alternatives:candidates;
 if(!allowed.length)return null;
 const stage=Math.min(...allowed.map(row=>row.matchStage));
 let pool=allowed.filter(row=>row.matchStage===stage);
 // Prefer the closest band. If everyone there was just played, look one
 // band farther for a fresh opponent before repeating a recent matchup.
 const justPlayed=new Set(recent.slice(0,RANKED_MATCH_RECENT_AVOID));
 if(pool.every(row=>justPlayed.has(Number(row.id)))){
  const neighbors=allowed.filter(row=>row.matchStage===stage+1&&!justPlayed.has(Number(row.id)));
  if(neighbors.length)pool=neighbors;
 }
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
