import {cityShift} from '../shared/jokgak-city-v1.mjs';
import {defaultCityRoundRewards,validateCityRoundRewards,rankCityRoundCandidates,hasCityRoundReward} from '../shared/jokgak-city-round-rewards-v1.mjs';
import {prepareCityRewardMessage} from './_jokgak_city_message_reward.js';
import {readRuntimeData,cacheRuntimeData} from './_runtime_data_cache.js';

const p=(env,sql,...v)=>env.DB.prepare(sql).bind(...v);
export const cityRoundRewardPolicyKey=epoch=>'jokgak_city_round_reward_policy_v1:'+epoch;
export const cityRoundRewardReceiptKey=epoch=>'jokgak_city_round_reward_receipt_v1:'+epoch;
// Freeze before an action or CMS edit. Missing historical snapshots are OFF:
// a later configuration must never invent rewards for an already-ended round.
export async function freezeCityRoundRewards(env,policy,now){
  const key=cityRoundRewardPolicyKey(cityShift(now).id);
  if(readRuntimeData(env,key))return;
  await p(env,'INSERT INTO app_meta(key,value) VALUES(?,?) ON CONFLICT(key) DO NOTHING',key,JSON.stringify(validateCityRoundRewards(policy.roundRewards))).run();
  cacheRuntimeData(env,key,true,300000);
}
export async function prepareCityRoundRewards(env,{byEpoch,policy,token}){
  const statements=[];
  if(policy.mode!=='ON')return statements;
  for(const [epoch,group] of [...byEpoch].sort((a,b)=>a[0]-b[0])){
    const key=cityRoundRewardPolicyKey(epoch),raw=(await p(env,'SELECT value FROM app_meta WHERE key=?',key).first())?.value;
    const frozen=raw?validateCityRoundRewards(JSON.parse(raw)):defaultCityRoundRewards();
    const participation=frozen.participation.enabled&&policy.roundRewards.participation.enabled;
    const top5=frozen.top5.enabled&&policy.roundRewards.top5.enabled;
    if(!participation&&!top5)continue;
    const recipients=[];
    for(const candidate of rankCityRoundCandidates(group.candidates)){
      const earned=[];
      if(participation&&candidate.attacks>=frozen.participation.minAttacks)earned.push({kind:'PARTICIPATION',...frozen.participation});
      if(top5&&candidate.rank<=5&&hasCityRoundReward(frozen.top5.ranks[candidate.rank-1]))earned.push({kind:'TOP5',...frozen.top5.ranks[candidate.rank-1]});
      if(!earned.length)continue;
      const coin=earned.reduce((sum,row)=>sum+row.coin,0),items=new Map();
      for(const row of earned)for(const item of row.items)items.set(item.code,(items.get(item.code)||0)+item.quantity);
      const start=new Date(group.round.startsAt+9*3600000).toISOString(),end=new Date(group.round.endsAt+9*3600000).toISOString();
      const window=start.slice(0,10)+' '+start.slice(11,16)+' ~ '+end.slice(11,16)+' (KST)';
      const kinds=earned.map(row=>row.kind),details=[kinds.includes('PARTICIPATION')?'참여 보상 · 일반 공격 '+candidate.attacks+'회':'',kinds.includes('TOP5')?'현금 TOP 5 보상 · '+candidate.rank+'위 / '+candidate.cash.toLocaleString('ko-KR')+'원':''].filter(Boolean).join('\n');
      const delivery=await prepareCityRewardMessage(env,{userId:candidate.id,campaign:'jokgak-city:round:'+epoch+':'+candidate.id,title:'[족각도시] 회차 보상 도착',body:window+' 회차가 종료되었습니다.\n'+details,coin,items:[...items].map(([code,quantity])=>({code,quantity}))});
      statements.push(...delivery.statements);
      recipients.push({userId:candidate.id,rank:candidate.rank,cash:candidate.cash,attacks:candidate.attacks,kinds,coin,items:delivery.bundle.items,delivery:'MESSAGE',campaign:delivery.campaign});
    }
    // This receipt, all messages, TOP cursor and expired action cleanup share the
    // caller's transaction. A retry or lost response cannot grant twice.
    statements.push(p(env,'INSERT INTO app_meta(key,value) VALUES(?,?)',cityRoundRewardReceiptKey(epoch),JSON.stringify({epoch,settledAt:new Date(group.round.endsAt).toISOString(),candidateCount:group.candidates.length,policy:frozen,participation,top5,delivery:'MESSAGE',recipients})));
  }
  return statements;
}
