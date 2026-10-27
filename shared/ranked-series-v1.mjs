import {COMPANION_RELEASE,COMPANION_PREPARATION_REVIEW,validatePreparedMercenaries} from './companion-loadout-v2.mjs';

export const RANKED_SINGLE_SERIES_RULES=Object.freeze({version:'ranked-series-20261019',mercenariesPerRound:1,rosterSize:3,rounds:3});
export const RANKED_DUAL_SERIES_RULES=Object.freeze({version:'ranked-series-pairs-20261028',mercenariesPerRound:2,rosterSize:6,rounds:3});
// Preparation only until the existing dual-companion launch gate is approved.
export const RANKED_SERIES_RULES=COMPANION_RELEASE.dualMercenaries?RANKED_DUAL_SERIES_RULES:RANKED_SINGLE_SERIES_RULES;
export const RANKED_SERIES_VERSION=RANKED_SERIES_RULES.version;
export function rankedSeriesCodes(codes,rules=RANKED_SERIES_RULES){
  if(![RANKED_SINGLE_SERIES_RULES,RANKED_DUAL_SERIES_RULES].includes(rules))throw Error('INVALID_RANKED_SERIES_RULES');
  if(!Array.isArray(codes)||codes.length!==rules.rosterSize||codes.some(code=>typeof code!=='string'||!/^V-\d{3}$/.test(code))||new Set(codes).size!==rules.rosterSize)
    throw Object.assign(Error(`서로 다른 용병 ${rules.rosterSize}종을 출전 순서대로 선택하세요.`),{status:400,code:'PVP_SERIES_ROSTER'});
  return [...codes];
}
export function rankedSeriesRoster(rows,rules=RANKED_SERIES_RULES){
  rankedSeriesCodes(rows.map(row=>row?.code),rules);
  if(rules.mercenariesPerRound===2)for(let i=0;i<rows.length;i+=2){
    try{validatePreparedMercenaries(rows.slice(i,i+2));}
    catch(error){throw Object.assign(Error(`${i/2+1}차전: ${error.message}`),{status:400,code:'PVP_SERIES_ROSTER'});}
  }
  return rows;
}
export const rankedPublicMercenary=({code,name,rank,sourceArt,battleSprite})=>({code,name,rank,sourceArt,battleSprite});
// Public selection is sorted by code. Never leak the opponent's saved order.
export const rankedPublicRoster=rows=>rows.map(rankedPublicMercenary).sort((a,b)=>a.code.localeCompare(b.code));
export function simulateRankedSeries({createBattle,options,attackerMercenaries,defenderMercenaries,seed,rules=RANKED_SERIES_RULES}){
  rankedSeriesRoster(attackerMercenaries,rules);rankedSeriesRoster(defenderMercenaries,rules);
  const score={A:0,B:0},rounds=[];
  for(let i=0;i<3&&score.A<2&&score.B<2;i++){
    const start=i*rules.mercenariesPerRound,a=attackerMercenaries.slice(start,start+rules.mercenariesPerRound),b=defenderMercenaries.slice(start,start+rules.mercenariesPerRound);
    // Fresh actors, HP, shield, energy and cooldowns every round. No battle object is reused.
    const selection=rules.mercenariesPerRound===2?{attackerMercenary:null,defenderMercenary:null,attackerMercenaries:a,defenderMercenaries:b,[COMPANION_PREPARATION_REVIEW]:true}:{attackerMercenary:a[0],defenderMercenary:b[0]};
    const battle=createBattle(structuredClone({...options,seed:(seed+Math.imul(i+1,0x9e3779b9))>>>0,...selection}));
    const winner=battle.result.winner;
    if(winner!=='A'&&winner!=='B')throw Error('랭크전 차전 승패를 확정하지 못했습니다.');
    score[winner]++;rounds.push({number:i+1,winner,score:{...score},attacker:rankedPublicMercenary(a[0]),defender:rankedPublicMercenary(b[0]),...(rules.mercenariesPerRound===2?{attackerMercenaries:a.map(rankedPublicMercenary),defenderMercenaries:b.map(rankedPublicMercenary)}:{}),battleV2:battle});
  }
  return {version:rules.version,mercenariesPerRound:rules.mercenariesPerRound,winsRequired:2,winner:score.A===2?'A':'B',score,rounds};
}
export const rankedSeriesReceipt=series=>({...series,rounds:series.rounds.map(({battleV2,...round})=>({...round,reason:battleV2.result.reason,actions:battleV2.result.actions}))});
