import {jointError} from './_joint_request.js';
import {jointGuard,jointGuardEnd} from './_joint_atomic.js';

export const packageCoinKey=userId=>'support_package_coin_v1:'+Number(userId);
const GRANT='시즌패스 패키지 구매 ',BET='코인 승부예측 참여';
const safe=n=>Number.isSafeInteger(n)&&n>=0;
const empty=()=>({version:1,revision:0,cursor:0,restricted:0,auctionReserved:{},precredited:null});
function validate(state){
 if(state.version!==1||!safe(state.revision)||!safe(state.cursor)||!safe(state.restricted)||!state.auctionReserved||typeof state.auctionReserved!=='object'||Array.isArray(state.auctionReserved)||Object.entries(state.auctionReserved).some(([id,n])=>!/^\d+$/.test(id)||!safe(n)))throw Error('Invalid package coin accounting');
 return state;
}
// Coin logs are the existing authoritative debit ledger. Ordinary spending uses
// package coins first; prediction debits never reduce the restricted balance.
// Auction reservations retain their origin when a losing/cancelled bid is refunded.
export function reconcilePackageCoinLogs(before,logs){
 const state=structuredClone(validate(before));
 for(const row of logs){
  const amount=Number(row.change_amount),id=Number(row.id),reason=String(row.reason||'');
  if(!Number.isSafeInteger(amount)||!safe(id)||id<=state.cursor)throw Error('Invalid package coin log');
  state.cursor=id;
  if(amount>0&&reason.startsWith(GRANT)){
   if(reason.slice(GRANT.length)===state.precredited)state.precredited=null;
   else state.restricted+=amount;
  }else if(amount<0&&reason!==BET){
   const consumed=Math.min(state.restricted,-amount);state.restricted-=consumed;
   const auction=reason.match(/^경매 #(\d+) 누적 입찰$/);
   if(auction&&consumed)state.auctionReserved[auction[1]]=(state.auctionReserved[auction[1]]||0)+consumed;
  }else if(amount>0){
   const refund=reason.match(/^경매 #(\d+) (?:유찰·차순위 환급|운영자 무효 전액 환불)$/);
   if(refund){const restored=Math.min(amount,state.auctionReserved[refund[1]]||0);state.restricted+=restored;const left=(state.auctionReserved[refund[1]]||0)-restored;if(left)state.auctionReserved[refund[1]]=left;else delete state.auctionReserved[refund[1]];}
  }
  validate(state);
 }
 return state;
}
export async function readPackageCoinAccounting(env,userId){
 const key=packageCoinKey(userId),[stored,wallet]=await Promise.all([
  env.DB.prepare('SELECT value FROM app_meta WHERE key=?').bind(key).first(),
  env.DB.prepare('SELECT coin,(SELECT COALESCE(MAX(id),0) FROM coin_logs WHERE user_id=users.id) AS last_log FROM users WHERE id=?').bind(userId).first()
 ]);
 const total=Number(wallet?.coin||0),lastLog=Number(wallet?.last_log||0);if(!safe(total)||!safe(lastLog))throw Error('Invalid coin wallet');
 const raw=stored?.value??null;let state=raw?validate(JSON.parse(raw)):empty(),tracked=raw!==null;
 if(!tracked){
  // Recover a package fulfilled by the preceding release without changing its grant.
  const orders=await env.DB.prepare("SELECT value FROM app_meta WHERE key LIKE ? ESCAPE '!'").bind('support_package_order_v1:'+Number(userId)+'!_%').all();
  tracked=orders.results.some(r=>JSON.parse(r.value).status==='FULFILLED');
  if(tracked){const first=await env.DB.prepare('SELECT MIN(id) AS id FROM coin_logs WHERE user_id=? AND reason LIKE ?').bind(userId,GRANT+'%').first();if(!first?.id)throw Error('Package grant proof missing');state.cursor=Number(first.id)-1;}
 }
 if(tracked){
  // Bounded pages avoid retaining a player's entire spending history in memory.
  let after=state.cursor;
  while(after<lastLog){
   const rows=await env.DB.prepare('SELECT id,change_amount,reason FROM coin_logs WHERE user_id=? AND id>? AND id<=? ORDER BY id LIMIT 2000').bind(userId,after,lastLog).all();
   if(!rows.results.length)throw Error('Coin ledger checkpoint is unavailable');
   state=reconcilePackageCoinLogs(state,rows.results);after=state.cursor;
  }
 }
 state.cursor=lastLog;
 const restricted=Math.min(total,state.restricted);
 return {key,raw,state,tracked,total,lastLog,restricted,available:total-restricted};
}
export function packageCoinGuardStatements(env,userId,snapshot,{grant=0,orderId=null,token=crypto.randomUUID()}={}){
 if(!safe(grant)||grant>0&&!orderId)throw Error('Invalid package coin grant');
 const DB=env.DB,p=(sql,...a)=>DB.prepare(sql).bind(...a),next={...snapshot.state,revision:snapshot.state.revision+1,restricted:snapshot.state.restricted+grant,...(grant?{precredited:orderId}:{})};validate(next);
 const statements=[
  ...(DB.dialect==='postgres'?[p('SELECT id FROM users WHERE id=? FOR UPDATE',userId)]:[]),
  jointGuard(DB,token,snapshot.raw===null?'NOT EXISTS(SELECT 1 FROM app_meta WHERE key=?)':'EXISTS(SELECT 1 FROM app_meta WHERE key=? AND value=?)',snapshot.raw===null?[snapshot.key]:[snapshot.key,snapshot.raw]),
  jointGuard(DB,token+'wallet','EXISTS(SELECT 1 FROM users WHERE id=? AND coin=?) AND (SELECT COALESCE(MAX(id),0) FROM coin_logs WHERE user_id=?)=?',[userId,snapshot.total,userId,snapshot.lastLog])
 ];
 // Ordinary players do not acquire a package ledger just by visiting prediction.
 if(snapshot.tracked||grant)statements.push(p('INSERT INTO app_meta(key,value,updated_at) VALUES(?,?,CURRENT_TIMESTAMP) ON CONFLICT(key) DO UPDATE SET value=excluded.value,updated_at=CURRENT_TIMESTAMP',snapshot.key,JSON.stringify(next)));
 statements.push(jointGuardEnd(DB,token),jointGuardEnd(DB,token+'wallet'));
 return statements;
}
export function requirePredictionCoins(snapshot,amount){
 if(amount>snapshot.available)throw jointError('PREDICTION_PACKAGE_COIN',snapshot.restricted?'패키지 코인은 승부예측에 사용할 수 없습니다. 베팅 가능 코인은 '+snapshot.available.toLocaleString('ko-KR')+'코인입니다.':'승부예측에 사용할 수 있는 코인이 부족합니다.',409);
}
