import {BLUE_GEAR_BULK_LIMITS} from '../shared/mercenary-blue-gear-pack-v1.mjs';
import {jointGuard,jointGuardEnd} from './_joint_atomic.js';
import {jointError} from './_joint_request.js';

// Only Blue Gear opts into this bound. Keep one debit and one ledger entry in
// the existing atomic purchase transaction, even for a thousand-trillion batch.
export function blueGearCoinDebit(DB,userId,amount,reason){
 if(!Number.isSafeInteger(amount)||amount<0||BigInt(amount)>BigInt(BLUE_GEAR_BULK_LIMITS.maxCost))throw jointError('JOINT_COST','블루기어팩 코인 비용을 확인하세요.');
 const p=(sql,...v)=>DB.prepare(sql).bind(...v),token=crypto.randomUUID();
 return [jointGuard(DB,token,'EXISTS(SELECT 1 FROM users WHERE id=? AND coin>=?)',[userId,amount]),
  p('UPDATE users SET coin=coin-CAST(? AS BIGINT) WHERE id=? AND coin>=?',amount,userId,amount),
  ...(amount?[p('INSERT INTO coin_logs(user_id,change_amount,balance_after,reason) SELECT id,?,coin,? FROM users WHERE id=?',-amount,reason,userId)]:[]),jointGuardEnd(DB,token)];
}
