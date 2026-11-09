import {martialRecharge,martialSqlUtc} from './martial-law-v1.mjs';
export const RANKED_REFORM_VERSION='20261002';
export const rankedUtcMs=value=>Date.parse(/[zZ]|[+-]\d\d:\d\d$/.test(String(value||''))?value:String(value||'').replace(' ','T')+'Z');
export const rankedSqlUtc=ms=>new Date(ms).toISOString().replace('T',' ').slice(0,19);

const highTierPoints=Object.freeze({win:24,loss:24});
const climbPoints=new Map([
 ['bronze',{win:30,loss:14}],['silver',{win:28,loss:16}],
 ['gold',{win:26,loss:18}],['platinum',{win:24,loss:20}]
]);
export const rankedEqualPoints=tierId=>climbPoints.get(tierId)||highTierPoints;

// Preserve the original Elo curve at high tiers; scale each lower tier off
// the same pair of opponent-adjusted awards, rounded once to whole points.
export function rankedScoreAdjustment(isWin,myScore,opponentScore,tierId){
 const scoreDiff=Number(opponentScore)-Number(myScore);
 const expectedWinRate=1/(1+10**(Math.max(-4000,Math.min(4000,scoreDiff))/400));
 const formerLoss=Math.round(48*expectedWinRate);
 const points=rankedEqualPoints(tierId);
 const change=Math.round(isWin?(48-formerLoss)*points.win/24:formerLoss*points.loss/24);
 return {change,scoreDiff,expectedWinRate,label:scoreDiff===0?'동점 상대':scoreDiff>0?(isWin?'상위 점수 상대 승리 보너스':'상위 점수 상대 패배 완화'):(isWin?'하위 점수 상대 승리 조정':'하위 점수 상대 패배 감점')};
}

// highest_score is already season-scoped and drives tier rewards. A previous
// personal best therefore also grants free re-entry to that tier this season.
export function rankedPromotionStatus(profile,tiers,seasonKey,tierId){
 const score=Number(profile.season_score),best=Math.max(score,Number(profile.highest_score??score));
 const ladder=(tiers||[]).filter(tier=>!tier.rankingBased&&tier.id!=='challenger');
 const index=ladder.findIndex((tier,i)=>i>0&&tier.min>best);
 if(index<0)return null;
 const target=ladder[index],gate=Number(target.min)-1;
 const floor=Number(ladder[index-1].min),retryScore=Math.max(floor,gate-rankedEqualPoints(tierId).loss);
 const progress={targetId:target.id,targetName:target.name,targetScore:Number(target.min),retryScore};
 if(score===gate&&profile.promotion_state){
  let run;
  try{run=JSON.parse(profile.promotion_state);}catch{/* Discard obsolete progress on the next settlement. */}
  if(run?.seasonKey===seasonKey&&run?.targetId===target.id&&run.targetScore===progress.targetScore&&
     [run.wins,run.losses].every(n=>Number.isInteger(n)&&n>=0&&n<3)){
   // The retry score is quoted when the run opens, including for a player
   // who enters or leaves the top twenty while the run is in progress.
   const lockedRetry=Number.isInteger(run.retryScore)?Math.max(floor,Math.min(gate,run.retryScore)):retryScore;
   return {...progress,retryScore:lockedRetry,status:'ACTIVE',wins:run.wins,losses:run.losses};
  }
 }
 return {...progress,status:'CLIMBING',wins:0,losses:0};
}

export function rankedLadderGame(isWin,score,opponentScore,progress,tierId){
 const base=rankedScoreAdjustment(isWin,score,opponentScore,tierId);
 let scoreAfter=score+(isWin?base.change:-base.change),promotion=null;
 if(progress?.status==='ACTIVE'){
  const wins=progress.wins+Number(isWin),losses=progress.losses+Number(!isWin);
  const status=wins===3?'PROMOTED':losses===3?'FAILED':'ACTIVE';
  promotion={...progress,status,wins,losses};
  scoreAfter=status==='PROMOTED'?progress.targetScore:status==='FAILED'?progress.retryScore:score;
 }else if(isWin&&progress&&scoreAfter>=progress.targetScore){
  promotion={...progress,status:'STARTED'};
  scoreAfter=progress.targetScore-1;
 }
 const adjustment=promotion?{...base,change:Math.abs(scoreAfter-score),label:'승급전'}:base;
 return {scoreAfter,adjustment,promotion};
}

export function rankedMatchForecast(profile,opponentScore,tiers,seasonKey,tierId){
 const score=Number(profile.season_score),promotion=rankedPromotionStatus(profile,tiers,seasonKey,tierId);
 const win=rankedLadderGame(true,score,opponentScore,promotion,tierId),loss=rankedLadderGame(false,score,opponentScore,promotion,tierId);
 return {promotion,expectedWin:win.scoreAfter-score,expectedLoss:score-loss.scoreAfter};
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
 if(cfg.__martialLaw){const charge=martialRecharge(energy,last,cfg,now);return {enabled:true,unlimited:false,energy:charge.energy,maxEnergy,costPerBattle,rechargeMinutes:Number(cfg.rechargeMinutes),nextRechargeAt:charge.nextRechargeAt,lastRechargedAt:martialSqlUtc(charge.last)};}
 if(energy<maxEnergy){const gained=Math.max(0,Math.floor((now-last)/interval));if(gained){energy=Math.min(maxEnergy,energy+gained);last=energy===maxEnergy?now:last+gained*interval;}}
 return {enabled:true,unlimited:false,energy,maxEnergy,costPerBattle,rechargeMinutes:Number(cfg.rechargeMinutes),nextRechargeAt:energy>=maxEnergy?null:new Date(last+interval).toISOString(),lastRechargedAt:rankedSqlUtc(last)};
}
