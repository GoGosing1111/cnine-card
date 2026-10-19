export const RANKED_SERIES_VERSION='ranked-series-20261019';
export function rankedSeriesCodes(codes){
  if(!Array.isArray(codes)||codes.length!==3||codes.some(code=>typeof code!=='string'||!/^V-?\d{3}$/.test(code))||new Set(codes).size!==3)
    throw Object.assign(Error('서로 다른 용병 3종을 출전 순서대로 선택하세요.'),{status:400,code:'PVP_SERIES_ROSTER'});
  return [...codes];
}
export const rankedPublicMercenary=({code,name,rank,sourceArt,battleSprite})=>({code,name,rank,sourceArt,battleSprite});
// Public selection is sorted by code. Never leak the opponent's saved order.
export const rankedPublicRoster=rows=>rows.map(rankedPublicMercenary).sort((a,b)=>a.code.localeCompare(b.code));
export function simulateRankedSeries({createBattle,options,attackerMercenaries,defenderMercenaries,seed}){
  rankedSeriesCodes(attackerMercenaries.map(m=>m.code));rankedSeriesCodes(defenderMercenaries.map(m=>m.code));
  const score={A:0,B:0},rounds=[];
  for(let i=0;i<3&&score.A<2&&score.B<2;i++){
    // Fresh actors, HP, shield, energy and cooldowns every round. No battle object is reused.
    const battle=createBattle(structuredClone({...options,seed:(seed+Math.imul(i+1,0x9e3779b9))>>>0,attackerMercenary:attackerMercenaries[i],defenderMercenary:defenderMercenaries[i]}));
    const winner=battle.result.winner;
    if(winner!=='A'&&winner!=='B')throw Error('랭크전 차전 승패를 확정하지 못했습니다.');
    score[winner]++;rounds.push({number:i+1,winner,score:{...score},attacker:rankedPublicMercenary(attackerMercenaries[i]),defender:rankedPublicMercenary(defenderMercenaries[i]),battleV2:battle});
  }
  return {version:RANKED_SERIES_VERSION,winsRequired:2,winner:score.A===2?'A':'B',score,rounds};
}
export const rankedSeriesReceipt=series=>({...series,rounds:series.rounds.map(({battleV2,...round})=>({...round,reason:battleV2.result.reason,actions:battleV2.result.actions}))});
