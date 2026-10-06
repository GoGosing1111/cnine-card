import {rankedCandidateAllowed} from './ranked-reform-v1.mjs';

export const RANKED_MATCH_BATCH_SIZE=96;
export const RANKED_MATCH_CANDIDATE_LIMIT=768;

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

export function selectRankedCandidate(rows,settings){
 const eligible=rows.map(row=>({...row,matchStage:rankedMatchBand(row,settings)})).filter(row=>row.matchStage>=0);
 // A third consecutive opponent is a last resort, not a permanent lockout.
 const alternatives=eligible.filter(row=>!row.repeat),pool=alternatives.length?alternatives:eligible;
 pool.sort((a,b)=>a.matchStage-b.matchStage||Number(a.recent)-Number(b.recent)||a.matchWeight-b.matchWeight||Number(a.id)-Number(b.id));
 return pool[0]||null;
}
