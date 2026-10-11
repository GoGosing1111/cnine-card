import {cityShift} from '../shared/jokgak-city-v1.mjs';
import {defaultCityRoundRewards,validateCityRoundRewards,rankCityRoundCandidates,hasCityRoundReward} from '../shared/jokgak-city-round-rewards-v1.mjs';
import {EQUIPMENT_FORGE_RELEASE_PROTECTION_CODE} from '../shared/equipment-forge-release-v1.mjs';
import {prepareUnifiedDropGrant} from './_drop_pool.js';
import {cityGuard,cityGuardEnd} from './_jokgak_city_rewards.js';
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
      const rewards=[...(coin?[{rewardType:'COIN',rewardRef:'',rewardName:'코인',quantity:coin}]:[]),...[...items].map(([code,quantity])=>({rewardType:'INVENTORY_ITEM',rewardRef:code,quantity}))];
      const requestId='JOKGAK_CITY_ROUND:'+epoch+':'+candidate.id;
      const grant=await prepareUnifiedDropGrant(env,{userId:candidate.id,requestId,sourceType:'JOKGAK_CITY_ROUND',sourceId:String(epoch),rewards},{writePoolLedger:false});
      const guard=token+':round-reward:'+candidate.id;
      for(const code of items.keys())statements.push(cityGuard(env,guard+':'+code,'EXISTS(SELECT 1 FROM inventory_items WHERE code=? AND is_active=1 AND code<>?)',[code,EQUIPMENT_FORGE_RELEASE_PROTECTION_CODE]),cityGuardEnd(env,guard+':'+code));
      if(!Number.isSafeInteger(grant.balances.coin))throw Error('CITY_ROUND_REWARD_BALANCE_OVERFLOW');
      statements.push(...grant.statements,cityGuard(env,guard,grant.proofs.map(proof=>'('+proof.sql+')').join(' AND ')||'1=0',grant.proofs.flatMap(proof=>proof.values)),cityGuardEnd(env,guard));
      recipients.push({userId:candidate.id,rank:candidate.rank,cash:candidate.cash,attacks:candidate.attacks,kinds:earned.map(row=>row.kind),coin,items:[...items].map(([code,quantity])=>({code,quantity}))});
    }
    // This receipt, all grants, TOP cursor and expired action cleanup share the
    // caller's transaction. A retry or lost response cannot grant twice.
    statements.push(p(env,'INSERT INTO app_meta(key,value) VALUES(?,?)',cityRoundRewardReceiptKey(epoch),JSON.stringify({epoch,settledAt:new Date(group.round.endsAt).toISOString(),candidateCount:group.candidates.length,policy:frozen,participation,top5,recipients})));
  }
  return statements;
}
