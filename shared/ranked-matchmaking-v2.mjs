import {rankedCandidateAllowed} from './ranked-reform-v1.mjs';

export const RANKED_MATCH_BATCH_SIZE=96;
export const RANKED_MATCH_CANDIDATE_LIMIT=768;
export const RANKED_MATCH_MIN_POOL_SIZE=8;
export const RANKED_MATCH_HISTORY_LIMIT=20;
export const RANKED_MATCH_RECENT_AVOID=8;

// Mercenary strength remains a combat advantage, not an opponent-selection tax.
// Tickets still retain full formation power for the pre-fight change guard.
export function rankedMatchPower(formationPower,mercenaryPower=0){
 const total=Number(formationPower),mercenary=Number(mercenaryPower);
 if(!Number.isFinite(total)||!Number.isFinite(mercenary)||total<=0||mercenary<0)return 0;
 return Math.max(0,total-mercenary);
}

// These bands also govern rematches outside the shared Challenger pool.
export function rankedMatchBands(settings,lowerScore){
 const score=Number(settings.matchSeasonRange??300),power=Number(settings.matchCardRange??15);
 const bands=[[0,0],[100,10],[250,20]].map(([extraScore,extraPower])=>({
  matchSeasonRange:score+extraScore,matchCardRange:Math.min(100,power+extraPower)
 }));
 const diamond=settings.tiers?.find(tier=>tier.id==='diamond');
 if(diamond&&Number.isFinite(lowerScore)&&lowerScore>=diamond.min){
  for(const [ceiling,extra,powerCap] of [[750,500,20],[1000,750,15],[1200,950,12]]){
   const reach=Math.min(ceiling,score+extra);
   if(reach>bands.at(-1).matchSeasonRange)bands.push({matchSeasonRange:reach,matchCardRange:Math.min(power,powerCap)});
  }
 }
 return bands;
}

// A player below Diamond can only be reached through the regular bands.
export function rankedMatchScoreBounds(score,settings){
 const normal=rankedMatchBands(settings).at(-1).matchSeasonRange;
 const widest=rankedMatchBands(settings,score).at(-1).matchSeasonRange;
 if(widest===normal)return [score-normal,score+normal];
 const floor=settings.tiers.find(tier=>tier.id==='diamond').min;
 return [Math.min(score-normal,Math.max(floor,score-widest)),score+widest];
}

export function rankedMatchBand(row,settings){
 if(!Number.isFinite(row.scoreDiff)||row.scoreDiff<0||!Number.isFinite(row.powerDiff)||row.powerDiff<0)return -1;
 if(row.challengerPair===true)return 0;
 return rankedMatchBands(settings,row.lowerScore).findIndex(band=>rankedCandidateAllowed(row,band));
}

const rankedMatchRandom=()=>crypto.getRandomValues(new Uint32Array(1))[0]/4294967296;

export function selectRankedCandidate(rows,settings,{recentOpponentIds=[],random=rankedMatchRandom}={}){
 const recent=recentOpponentIds.slice(0,RANKED_MATCH_HISTORY_LIMIT).map(Number);
 const counts=new Map(),lastMet=new Map();
 for(const [index,id] of recent.entries()){
  counts.set(id,(counts.get(id)||0)+1);
  if(!lastMet.has(id))lastMet.set(id,index);
 }
 let nearestFreshStage=Infinity,oldestIndex=-1,oldest=null;
 const pool=[];
 for(const row of rows){
  const matchStage=rankedMatchBand(row,settings);
  if(matchStage<0)continue;
  const index=lastMet.get(Number(row.id));
  if(index!==undefined&&index<RANKED_MATCH_RECENT_AVOID){
   if(index>oldestIndex){oldestIndex=index;oldest={...row,matchStage};}
   continue;
  }
  const priority=row.challengerPair===true?-1:matchStage;
  if(priority>nearestFreshStage)continue;
  if(priority<nearestFreshStage){nearestFreshStage=priority;pool.length=0;}
  pool.push({...row,matchStage});
 }
 if(!pool.length)return oldest;
 if(pool.length===1)return pool[0];
 const scoreScale=Math.max(1,Number(settings.matchSeasonRange??300)*0.8),powerScale=Math.max(1,Number(settings.matchCardRange??15));
 // Relative weights keep a valid draw even with a zero-point CMS base range.
 const costs=pool.map(row=>{
  const distance=row.challengerPair===true?0:row.scoreDiff/scoreScale+row.powerDiff/powerScale;
  return distance+2*Math.log1p(counts.get(Number(row.id))||0);
 });
 const minimum=Math.min(...costs);
 const weights=costs.map(cost=>Math.exp(minimum-cost));
 const draw=random();if(!Number.isFinite(draw)||draw<0||draw>=1)throw new RangeError('Invalid ranked matchmaking random value');
 let cursor=draw*weights.reduce((sum,weight)=>sum+weight,0);
 for(let i=0;i<pool.length;i++){cursor-=weights[i];if(cursor<0)return pool[i];}
 return pool.at(-1);
}
