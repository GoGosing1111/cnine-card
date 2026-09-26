import {duoTiers,DUO_RECRUIT_HOURS} from './ranked-duo-season-v2.mjs';

export const DUO_WEEKLY_POLICY_KEY='ranked_duo_weekly_policy_v3';
export const DUO_BATTLE_DAYS=7;
export const DUO_REWARD_BATCH=20;
const iso=n=>new Date(n).toISOString();
const invalid=label=>Object.assign(new Error(label+' 설정을 확인하세요.'),{code:'DUO_CONFIG',status:400});
const integer=(v,min,max,label)=>{if(!Number.isSafeInteger(v)||v<min||v>max)throw invalid(label);return v;};
export function duoRewardAmounts(raw={}){
 return {rewardCoin:integer(raw.rewardCoin??0,0,Number.MAX_SAFE_INTEGER,'티어 코인'),rewardShards:integer(raw.rewardShards??0,0,100000000,'티어 카드조각')};
}
export function validateDuoPolicy(raw){
 if(!raw||!Number.isFinite(Date.parse(raw.anchor)))throw invalid('첫 모집 시각');
 const maximum=integer(raw.energy?.maximum,1,999,'행동력 최대치');
 const tiers=duoTiers(raw).tiers;
 if(tiers.length!==7||new Set(tiers.map(t=>t.id)).size!==7||!['bronze','silver','gold','platinum','diamond','master','grandmaster'].every(id=>tiers.some(t=>t.id===id)))throw invalid('티어');
 for(const tier of tiers){integer(tier.min,0,100000000,'티어 점수');Object.assign(tier,duoRewardAmounts(raw.tiers.find(t=>t.id===tier.id)));}
 return {revision:integer(raw.revision??0,0,2147483646,'운영 버전'),enabled:raw.enabled!==false,anchor:iso(Date.parse(raw.anchor)),
  energy:{mode:'RANKED',maximum,dailyGrant:maximum,cost:integer(raw.energy.cost,1,maximum,'공격 비용'),rechargeMinutes:integer(raw.energy.rechargeMinutes,1,1440,'충전 간격')},
  score:{initial:integer(raw.score?.initial,0,1000000,'시작 점수'),win:integer(raw.score?.win,0,100000,'승리 점수'),loss:integer(raw.score?.loss,0,100000,'패배 점수')},
  rewards:{winCoin:integer(raw.rewards?.winCoin,0,Number.MAX_SAFE_INTEGER,'승리 코인'),tierEnabled:raw.rewards?.tierEnabled!==false},
  tiers,challenger:{...duoTiers().challenger,...duoRewardAmounts(raw.challenger)},mercenaryWeights:raw.mercenaryWeights||{},
  source:{name:String(raw.source?.name||'').slice(0,80),copiedAt:raw.source?.copiedAt||raw.anchor}};
}
export function copyRankedDuoPolicy(settings,anchor){
 return validateDuoPolicy({revision:0,enabled:true,anchor,energy:{maximum:Number(settings.energy.maxEnergy),cost:Number(settings.energy.costPerBattle),rechargeMinutes:Number(settings.energy.rechargeMinutes)},
  score:{initial:Number(settings.initialScore),win:Number(settings.winScore),loss:Number(settings.loseScore)},tiers:settings.tiers,challenger:settings.challengerTier,
  rewards:{winCoin:Number(settings.winCoin),tierEnabled:settings.tierRewardsEnabled!==false},source:{name:settings.seasonName,copiedAt:anchor}});
}
export function duoWeeklyConfig(raw,recruitStart,sequence=1){
 const policy=validateDuoPolicy(raw),startsAt=iso(recruitStart+DUO_RECRUIT_HOURS*3600000),endsAt=iso(Date.parse(startsAt)+DUO_BATTLE_DAYS*86400000);
 return {revision:0,name:'랭크 듀오 시즌 '+sequence,visible:true,automatic:true,recruitHours:DUO_RECRUIT_HOURS,startsAt,endsAt,competitionStartedAt:null,
  energy:policy.energy,score:policy.score,tiers:policy.tiers,challenger:policy.challenger,rewards:policy.rewards,mercenaryWeights:policy.mercenaryWeights,
  weekly:{sequence,policyRevision:policy.revision,recruitStartsAt:iso(recruitStart)},
  rankedSeason:{key:'duo-weekly|'+sequence+'|'+iso(recruitStart),name:policy.source.name||'독립 시즌',startsAt:iso(recruitStart),endsAt,recruitStartsAt:iso(recruitStart)}};
}
