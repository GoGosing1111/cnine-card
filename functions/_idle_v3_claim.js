import {jointError} from './_joint_request.js';
import {jointGuard,jointGuardEnd} from './_joint_atomic.js';
export async function claimIdleV3(env,user,body){
  const uid=Number(user.id),rid=body?.requestId;
  if(!Number.isSafeInteger(uid)||uid<1||typeof rid!=='string'||!/^[A-Za-z0-9_:-]{1,105}$/.test(rid))throw jointError('IDLE_V3_REQUEST','수령 요청 번호를 확인하세요.');
  const p=(sql,...v)=>env.DB.prepare(sql).bind(...v),prior=await p('SELECT user_id,response_json FROM idle_dungeon_claim_receipts WHERE request_id=?',rid).first();
  if(prior){if(Number(prior.user_id)!==uid)throw jointError('IDLE_V3_REQUEST_CONFLICT','수령 요청 번호가 사용 중입니다.',409);return {...JSON.parse(prior.response_json),replayed:true};}
  const state=await p('SELECT pending_coin,version FROM idle_dungeon_progress WHERE user_id=?',uid).first(),wallet=await p('SELECT CAST(coin AS TEXT) coin FROM users WHERE id=?',uid).first();
  const amount=Number(state?.pending_coin||0),version=Number(state?.version);
  if(!state||!wallet||!Number.isSafeInteger(amount)||amount<0||!Number.isSafeInteger(version))throw jointError('IDLE_V3_RECORD','누적 보상을 확인할 수 없습니다.',409);
  const after=(BigInt(wallet.coin)+BigInt(amount)).toString(),response={ok:true,requestId:rid,rewardCoin:amount,coinAfter:after},token=crypto.randomUUID();
  const statements=[
    jointGuard(env.DB,token,'EXISTS(SELECT 1 FROM users WHERE id=? AND CAST(coin AS TEXT)=?) AND EXISTS(SELECT 1 FROM idle_dungeon_progress WHERE user_id=? AND version=? AND pending_coin=?)',[uid,wallet.coin,uid,version,amount]),
    p('INSERT INTO idle_dungeon_claim_receipts(request_id,user_id,reward_coin,response_json) VALUES(?,?,?,?)',rid,uid,amount,JSON.stringify(response)),
    p('UPDATE idle_dungeon_progress SET pending_coin=0,total_coin=total_coin+?,version=version+1,updated_at=CURRENT_TIMESTAMP WHERE user_id=? AND version=? AND pending_coin=?',amount,uid,version,amount),
    p('UPDATE users SET coin=coin+? WHERE id=?',amount,uid),
    p("INSERT INTO coin_logs(user_id,change_amount,balance_after,reason) SELECT ?,?,coin,'방치형 원정 정산' FROM users WHERE id=?",uid,amount,uid),
    jointGuard(env.DB,token+'-settled','EXISTS(SELECT 1 FROM users WHERE id=? AND CAST(coin AS TEXT)=?) AND EXISTS(SELECT 1 FROM idle_dungeon_progress WHERE user_id=? AND version=? AND pending_coin=0)',[uid,after,uid,version+1]),
    jointGuardEnd(env.DB,token),jointGuardEnd(env.DB,token+'-settled')
  ];
  if(env.DB.dialect==='postgres')statements.unshift(p('SELECT id FROM users WHERE id=? FOR UPDATE',uid));
  try{await env.DB.batch(statements);}catch(error){const done=await p('SELECT response_json FROM idle_dungeon_claim_receipts WHERE user_id=? AND request_id=?',uid,rid).first();if(done?.response_json)return {...JSON.parse(done.response_json),replayed:true};throw jointError('IDLE_V3_CLAIM_PENDING','수령을 완료하지 못했습니다. 같은 요청으로 다시 확인하세요.',503);}
  return response;
}
