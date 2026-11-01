import {jointGuard,jointGuardEnd} from './_joint_atomic.js';
import {jointInventoryChange} from './_joint_transactions.js';
import {RANKED_COIN_CODE,rankedTierReward,RANKED_REWARD_VERSION} from '../shared/ranked-shop-policy-v1.mjs';

export async function rankedCoinBalance(env,userId){
 return Number((await env.DB.prepare('SELECT quantity FROM cnine_user_inventory WHERE user_id=? AND item_code=?').bind(userId,RANKED_COIN_CODE).first())?.quantity||0);
}
export function rankedCoinCreditStatements(DB,userId,amount,referenceId){
 if(!Number.isSafeInteger(amount)||amount<0||amount>1e9)throw new Error('Invalid ranked coin reward');
 if(!amount)return [];
 const token=crypto.randomUUID();
 return [jointGuard(DB,token,'NOT EXISTS(SELECT 1 FROM cnine_user_inventory WHERE user_id=? AND item_code=? AND (quantity<0 OR unseen_quantity<0 OR quantity>? OR unseen_quantity>?))',[userId,RANKED_COIN_CODE,Number.MAX_SAFE_INTEGER-amount,Number.MAX_SAFE_INTEGER-amount]),
 ...jointInventoryChange(DB,userId,RANKED_COIN_CODE,amount,'랭크전 시즌 티어 보상',referenceId),jointGuardEnd(DB,token)];
}
// Existing settlement delivery uniqueness and the inventory credit commit together.
// Closed seasons never enter this path; no historical rewards are backfilled.
export async function deliverRankedPvpCoins(env,settlementId,settings){
 if(settings.rankedRewardVersion!==RANKED_REWARD_VERSION||settings.tierRewardsEnabled===false)return 0;
 const DB=env.DB,p=(sql,...v)=>DB.prepare(sql).bind(...v);
 const predicate="r.settlement_id=? AND NOT EXISTS(SELECT 1 FROM pvp_season_settlement_deliveries d WHERE d.settlement_id=r.settlement_id AND d.user_id=r.user_id AND d.reward_type='RANKED_COIN' AND d.status='SENT')";
 const rows=(await p('SELECT r.* FROM pvp_season_settlement_ranks r WHERE '+predicate+' ORDER BY r.final_rank LIMIT 15',settlementId).all()).results||[];
 for(const row of rows){
  const amount=rankedTierReward(row.tier_id).rankedCoins,token=crypto.randomUUID();
  await DB.batch([...(DB.dialect==='postgres'?[p('SELECT id FROM users WHERE id=? FOR UPDATE',row.user_id)]:[]),
   jointGuard(DB,token,"NOT EXISTS(SELECT 1 FROM pvp_season_settlement_deliveries WHERE settlement_id=? AND user_id=? AND reward_type='RANKED_COIN')",[settlementId,row.user_id]),
   p("INSERT INTO pvp_season_settlement_deliveries(settlement_id,user_id,reward_type,reward_amount,status) VALUES(?,?,'RANKED_COIN',?,'SENT')",settlementId,row.user_id,amount),
   ...rankedCoinCreditStatements(DB,row.user_id,amount,'ranked-tier:PVP:'+settlementId),jointGuardEnd(DB,token)]);
 }
 return Number((await p('SELECT COUNT(*) AS count FROM pvp_season_settlement_ranks r WHERE '+predicate,settlementId).first())?.count||0);
}
