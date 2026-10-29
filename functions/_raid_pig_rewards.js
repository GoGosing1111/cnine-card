import {jointGuard,jointGuardEnd} from './_joint_atomic.js';

// Lich and Varsen freeze the amount at departure and reserve their weekly slot
// in the same transaction as this ledger and wallet update.
export function raidPigCoinRewardStatements(env,{userId,source,roomId,amount,guardSql,guardBindings=[],at=Date.now()}){
  if(!amount)return [];
  if(!['LICH_RAID','MADARA_RAID','BLACKWING_RAID'].includes(source)||!Number.isSafeInteger(amount)||amount<1||amount>1000000000||!Number.isSafeInteger(userId)||userId<1||!roomId||!guardSql)throw Error('Invalid raid pig coin reward');
  const DB=env.DB,token=crypto.randomUUID(),ref=String(roomId),p=(sql,...args)=>DB.prepare(sql).bind(...args);
  const guard=`(${guardSql}) AND NOT EXISTS(SELECT 1 FROM pig_coin_ledger_v1 WHERE user_id=? AND source=? AND reference_id=?)`,bind=[...guardBindings,userId,source,ref];
  return [
    p(`INSERT INTO pig_coin_wallets_v1(user_id,balance) SELECT ?,0 WHERE ${guard} ON CONFLICT(user_id) DO NOTHING`,userId,...bind),
    ...(DB.dialect==='postgres'?[p('SELECT user_id FROM pig_coin_wallets_v1 WHERE user_id=? FOR UPDATE',userId)]:[]),
    p(`INSERT INTO pig_coin_ledger_v1(id,user_id,amount,balance_after,source,reference_id,created_at) SELECT ?,user_id,?,balance+?,?,?,? FROM pig_coin_wallets_v1 WHERE user_id=? AND ${guard} ON CONFLICT(user_id,source,reference_id) DO NOTHING`,token,amount,amount,source,ref,new Date(at).toISOString(),userId,...bind),
    jointGuard(DB,token, 'EXISTS(SELECT 1 FROM pig_coin_ledger_v1 WHERE id=? AND amount=?)',[token,amount]),
    p('UPDATE pig_coin_wallets_v1 SET balance=balance+(SELECT amount FROM pig_coin_ledger_v1 WHERE id=?) WHERE user_id=?',token,userId),
    jointGuardEnd(DB,token)
  ];
}
