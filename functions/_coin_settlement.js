import {coinInteger,MAX_COIN_INTEGER} from '../shared/coin-integer-v1.mjs';
import {jointGuard,jointGuardEnd} from './_joint_atomic.js';

// Compose with the caller's receipt/claim writes in one DB.batch. Never round a
// wallet through the driver's numeric BIGINT parser or bind it back as Number.
export function coinChangeStatements(DB,userId,amount,reason,adminId=null){
  if(typeof amount==='number'&&!Number.isSafeInteger(amount))throw new Error('Invalid coin change');
  if(!['string','number','bigint'].includes(typeof amount)||! /^-?\d+$/.test(String(amount)))throw new Error('Invalid coin change');
  const delta=BigInt(amount),magnitude=coinInteger(delta<0n?-delta:delta);
  const minimum=delta<0n?magnitude:0n,maximum=delta>0n?MAX_COIN_INTEGER-magnitude:MAX_COIN_INTEGER;
  const p=(sql,...values)=>DB.prepare(sql).bind(...values),token=crypto.randomUUID();
  return [
    ...(DB.dialect==='postgres'?[p('SELECT id FROM users WHERE id=? FOR UPDATE',userId)]:[]),
    jointGuard(DB,token,'EXISTS(SELECT 1 FROM users WHERE id=? AND coin BETWEEN CAST(? AS BIGINT) AND CAST(? AS BIGINT))',[userId,minimum.toString(),maximum.toString()]),
    p('UPDATE users SET coin=coin+CAST(? AS BIGINT) WHERE id=?',delta.toString(),userId),
    adminId===null
      ?p('INSERT INTO coin_logs(user_id,change_amount,balance_after,reason) SELECT id,CAST(? AS BIGINT),coin,? FROM users WHERE id=?',delta.toString(),reason,userId)
      :p('INSERT INTO coin_logs(user_id,change_amount,balance_after,reason,admin_id) SELECT id,CAST(? AS BIGINT),coin,?,? FROM users WHERE id=?',delta.toString(),reason,adminId,userId),
    jointGuardEnd(DB,token)
  ];
}
