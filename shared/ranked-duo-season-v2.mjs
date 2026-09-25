// Score names and cutoffs are copied from the authoritative ranked season at
// creation. These defaults keep pre-automation seasons readable.
export const DUO_RECRUIT_HOURS=24;
export const DUO_TIER_ART='/assets/ui/ranked-duo/';
export const DUO_SCORE_TIERS=Object.freeze([
 {id:'bronze',name:'브론즈',min:0,color:'#b87333'},
 {id:'silver',name:'실버',min:1100,color:'#c9d4e3'},
 {id:'gold',name:'골드',min:1250,color:'#ffd15c'},
 {id:'platinum',name:'플래티넘',min:1450,color:'#5ff0df'},
 {id:'diamond',name:'다이아',min:1700,color:'#69cfff'},
 {id:'master',name:'마스터',min:2050,color:'#bd7cff'},
 {id:'grandmaster',name:'그랜드마스터',min:2500,color:'#ff6f91'}
]);
export const DUO_CHALLENGER={id:'challenger',name:'챌린저',rankLimit:10,color:'#79c8ef'};
export const duoTierArt=id=>DUO_TIER_ART+(DUO_SCORE_TIERS.some(t=>t.id===id)||id==='challenger'?id:'bronze')+'-v1.webp';
export function duoTiers(settings={}){
 const tiers=(settings.tiers?.length?settings.tiers:DUO_SCORE_TIERS).filter(t=>t.id!=='challenger').slice(0,20)
  .map(t=>({id:String(t.id),name:String(t.name),min:Math.max(0,Number(t.min)||0),color:/^#[a-f0-9]{6}$/i.test(t.color)?t.color:'#c9d4e3',art:duoTierArt(t.id)})).sort((a,b)=>a.min-b.min);
 return {tiers,challenger:{...DUO_CHALLENGER,art:duoTierArt('challenger')}};
}
export function resolveDuoTier(score,config={},rank=0){
 const {tiers,challenger}=duoTiers(config);
 if(Number.isInteger(rank)&&rank>=1&&rank<=challenger.rankLimit)return challenger;
 return [...tiers].reverse().find(t=>Number(score)>=t.min)||tiers[0];
}
// Ranked settings store SQL UTC timestamps; never interpret them as local time.
export function duoUtcMs(value){
 if(!value)return NaN;
 const raw=String(value);return Date.parse(/(?:Z|[+-]\d\d:\d\d)$/i.test(raw)?raw:raw.replace(' ','T')+'Z');
}
export const duoSourceKey=s=>[String(s.seasonName||'').trim(),new Date(duoUtcMs(s.startsAt)).toISOString()].join('|').slice(0,220);
export function duoAutomaticConfig(settings,now,previous={}){
 const start=duoUtcMs(settings.startsAt),end=duoUtcMs(settings.endsAt);
 if(settings.enabled===false||!Number.isFinite(start)||!Number.isFinite(end)||now<start)return null;
 // A late first deployment still gives everyone a full day to register.
 const recruitStart=Math.max(start,now),until=recruitStart+DUO_RECRUIT_HOURS*3600000;
 if(until>=end)return null;
 const maximum=Math.max(1,Math.min(999,Number(settings.energy?.maxEnergy)||5)),cost=Math.max(1,Math.min(maximum,Number(settings.energy?.costPerBattle)||1));
 const {tiers}=duoTiers(settings);
 return {revision:0,name:'랭크 듀오 '+settings.seasonName,visible:true,recruitHours:DUO_RECRUIT_HOURS,
  startsAt:new Date(until).toISOString(),endsAt:new Date(end).toISOString(),
  energy:{mode:'RANKED',maximum,dailyGrant:maximum,cost,rechargeMinutes:Math.max(1,Math.min(1440,Number(settings.energy?.rechargeMinutes)||30))},
  score:{initial:Number(settings.initialScore??1000),win:Number(settings.winScore??24),loss:Number(settings.loseScore??16)},
  mercenaryWeights:previous.mercenaryWeights||{},tiers,
  rankedSeason:{key:duoSourceKey(settings),name:String(settings.seasonName),startsAt:new Date(start).toISOString(),endsAt:new Date(end).toISOString(),recruitStartsAt:new Date(recruitStart).toISOString()},
  automatic:true,competitionStartedAt:null};
}
