// Private helpers for Blackcrown only. No schema changes or release overrides.
import {LIMITED_RATE_TOTAL} from '../shared/mercenary-limited-rates-v1.mjs';
import {jointGuard,jointGuardEnd} from './_joint_atomic.js';

export function createBlackcrownBulkRandom(fill=words=>crypto.getRandomValues(words)){
 const words=new Uint32Array(4096);let cursor=words.length;
 const word=()=>{if(cursor===words.length){fill(words);cursor=0;}return words[cursor++];};
 return max=>{
  if(!Number.isSafeInteger(max)||max<1||max>LIMITED_RATE_TOTAL)throw Error('Invalid Blackcrown random bound');
  const wide=max>0xffffffff,range=wide?2**40:2**32,limit=Math.floor(range/max)*max;let value;
  do{value=wide?(word()&255)*2**32+word():word();}while(value>=limit);
  return value%max;
 };
}
export function blackcrownBulkAcquisitionStatements(DB,{userId,requestId,draw,createdAt,acquisitionIndex=null}){
 const {mercenaryCode:code,quantity}=draw;
 if(!Number.isSafeInteger(quantity)||quantity<1||quantity>100000)throw Error('Invalid Blackcrown quantity');
 if(acquisitionIndex!==null&&(!Number.isSafeInteger(acquisitionIndex)||acquisitionIndex<0||acquisitionIndex>=10||quantity!==1))throw Error('Invalid Blackcrown acquisition index');
 const p=(sql,...args)=>DB.prepare(sql).bind(...args),token=crypto.randomUUID(),aid=requestId+(acquisitionIndex===null?':bulk:'+code:':'+acquisitionIndex);
 // The caller locks/rechecks the exact CMS and draw-policy revisions in this
 // same transaction. A bulk acquisition is one event; its quantity is durable
 // in joint_operations_v1.normalDraws, and the ledger stores the exact balance.
 return [jointGuard(DB,token,'NOT EXISTS(SELECT 1 FROM user_mercenary_cards_v1 WHERE user_id=? AND mercenary_code=? AND total_copies>?)',[userId,code,2147483647-quantity]),
  p('INSERT INTO user_mercenary_cards_v1(user_id,mercenary_code,total_copies,duplicate_count,first_obtained_at,last_obtained_at) VALUES(?,?,?,?,?,?) ON CONFLICT(user_id,mercenary_code) DO UPDATE SET total_copies=user_mercenary_cards_v1.total_copies+excluded.total_copies,duplicate_count=user_mercenary_cards_v1.duplicate_count+excluded.total_copies,last_obtained_at=excluded.last_obtained_at',userId,code,quantity,quantity-1,createdAt,createdAt),
  p('INSERT INTO mercenary_card_acquisitions_v1(acquisition_id,user_id,mercenary_code,is_duplicate,total_copies_after,duplicate_count_after,created_at) SELECT ?,user_id,mercenary_code,CASE WHEN total_copies>1 THEN 1 ELSE 0 END,total_copies,duplicate_count,? FROM user_mercenary_cards_v1 WHERE user_id=? AND mercenary_code=?',aid,createdAt,userId,code),jointGuardEnd(DB,token)];
}
