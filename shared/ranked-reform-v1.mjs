export const RANKED_REFORM_VERSION='20261002';
export const rankedUtcMs=value=>Date.parse(/[zZ]|[+-]\d\d:\d\d$/.test(String(value||''))?value:String(value||'').replace(' ','T')+'Z');
export const rankedSqlUtc=ms=>new Date(ms).toISOString().replace('T',' ').slice(0,19);

// Equal ratings: +24 / -24. The two possible changes sum to K=48,
// so a player performing at the expected win rate has no rating drift.
export function rankedScoreAdjustment(isWin,myScore,opponentScore){
 const scoreDiff=Number(opponentScore)-Number(myScore);
 const expectedWinRate=1/(1+10**(Math.max(-4000,Math.min(4000,scoreDiff))/400));
 const change=isWin?48-Math.round(48*expectedWinRate):Math.round(48*expectedWinRate);
 return {change,scoreDiff,expectedWinRate,label:scoreDiff===0?'동점 상대':scoreDiff>0?(isWin?'상위 점수 상대 승리 보너스':'상위 점수 상대 패배 완화'):(isWin?'하위 점수 상대 승리 조정':'하위 점수 상대 패배 감점')};
}

// Symmetric power distance: eligibility must be the same from either side.
export function rankedPowerDifference(a,b){return a>0&&b>0?(Math.max(a,b)/Math.min(a,b)-1)*100:Infinity;}
export function rankedCandidateAllowed(row,settings){
 return row.scoreDiff<=Number(settings.matchSeasonRange??300)&&row.powerDiff<=Number(settings.matchCardRange??15)+1e-8;
}

// Preserve fractional minutes while storing an exact whole-second interval.
export function normalizeRankedRechargeMinutes(value,fallback=2.5){
 const parsed=Number(value),minutes=Number.isFinite(parsed)?parsed:fallback;
 return Math.round(Math.min(1440,Math.max(1,minutes))*60)/60;
}

export function rankedEnergyFromRow(row,cfg,now=Date.now()){
 const maxEnergy=Number(cfg.maxEnergy),costPerBattle=Number(cfg.costPerBattle),interval=Number(cfg.rechargeMinutes)*60000;
 let energy=Math.max(0,Math.min(maxEnergy,Number(row.energy))),last=rankedUtcMs(row.last_recharged_at);
 if(!Number.isFinite(last)||last>now)last=now;
 if(energy<maxEnergy){const gained=Math.max(0,Math.floor((now-last)/interval));if(gained){energy=Math.min(maxEnergy,energy+gained);last=energy===maxEnergy?now:last+gained*interval;}}
 return {enabled:true,unlimited:false,energy,maxEnergy,costPerBattle,rechargeMinutes:Number(cfg.rechargeMinutes),nextRechargeAt:energy>=maxEnergy?null:new Date(last+interval).toISOString(),lastRechargedAt:rankedSqlUtc(last)};
}
