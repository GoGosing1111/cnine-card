import assert from 'node:assert/strict';
import {PLAN as BASE_PLAN,PLAN_HASH as BASE_HASH,OPERATION_KEY as BASE_KEY,body,hash,identityHash,verifyRewards as verifyBase} from './crater-tournament-rewards-20261022.mjs';

export const OPERATION_KEY='ops:crater-tournament-rewards:20261022:moonaldo-v1';
export const CAMPAIGN_KEY='crater-tournament-rewards-20261022-moonaldo-v1';
export const ACTION='OPS_CRATER_TOURNAMENT_REWARD_FOLLOWUP';
export const TARGET=Object.freeze({userId:'4415',nickname:'Moo날두',inputNickname:'족날두'});
export const IDENTITY_HASH='54f88b1f6fc823737412c99508e4ba0769417b4b13b2ae8d042a461b8fed3ec1';
export const AMOUNT='1000000000000',TITLE='크레이터 대회 상금',BODY=body({tier:'PARTICIPANT'});
const q=async(c,s,args=[])=>(await c.query(s,args)).rows,one=r=>(assert.equal(r.length,1),r[0]);
const parse=v=>typeof v==='string'?JSON.parse(v):v;
async function prior(c){
 const receipt=parse(one(await q(c,'SELECT value FROM app_meta WHERE key=$1',[BASE_KEY])).value);
 assert.equal(receipt.planHash,BASE_HASH);assert.equal(receipt.recipients.length,50);assert.equal(receipt.totalCoin,'88000000000000');
 assert(!receipt.recipients.some(t=>t.userId===TARGET.userId));
 assert(receipt.held.some(t=>t.inputNickname==='족날두'&&t.amount===AMOUNT));assert(receipt.held.some(t=>t.inputNickname==='철줌마효진님'&&t.amount===AMOUNT));
 const verification=await verifyBase(c,receipt);return {receipt,verification,digest:hash(receipt)};
}
export async function inspect(c,{lock=false}={}){
 const u=one(await q(c,`SELECT u.id::text,u.nickname,u.status,u.role,u.coin::text,s.provider,s.provider_name,s.provider_user_id
  FROM users u JOIN user_second_verifications s ON s.user_id=u.id WHERE u.id=$1${lock?' FOR SHARE OF u,s':''}`,[TARGET.userId]));
 assert.equal(u.nickname,TARGET.nickname);assert.equal(u.status,'ACTIVE');assert.equal(u.role,'USER');assert.equal(identityHash(u),IDENTITY_HASH,'Recipient identity changed');
 assert(BigInt(u.coin)>=0n&&BigInt(u.coin)+BigInt(AMOUNT)<=BigInt(Number.MAX_SAFE_INTEGER),'Unsupported coin balance');
 const existing=await q(c,`SELECT id::text FROM user_messages WHERE user_id=$1 AND (campaign_key=$2 OR (title=$3 AND created_at::timestamptz>=$4::timestamptz))`,[TARGET.userId,CAMPAIGN_KEY,TITLE,'2026-10-21T15:00:00Z']);
 return {userId:u.id,nickname:u.nickname,coin:u.coin,existing};
}
export async function verify(c,receipt,{unclaimed=false}={}){
 if(!receipt)receipt=parse(one(await q(c,'SELECT value FROM app_meta WHERE key=$1',[OPERATION_KEY])).value);
 assert.equal(receipt.status,'COMPLETED');assert.equal(receipt.actor,'CODEX_OPERATIONS');assert.equal(receipt.operationKey,OPERATION_KEY);assert.equal(receipt.campaignKey,CAMPAIGN_KEY);
 assert.deepEqual(receipt.target,TARGET);assert.equal(receipt.amount,AMOUNT);assert.equal(receipt.delivery,'MESSAGE');assert.equal(receipt.noImmediateCredit,true);
 assert.deepEqual(receipt.remainingHeld,[{inputNickname:'철줌마효진님',amount:AMOUNT,reason:'USER_REQUESTED_HOLD'}]);
 const base=await prior(c);assert.equal(base.digest,receipt.baseReceiptHash,'Original receipt changed');
 const r=one(await q(c,`SELECT m.id::text message_id,m.user_id::text user_id,m.title,m.body,m.sender_type,m.message_type,m.is_read,m.hidden_at,
  r.id::text reward_id,r.user_id::text reward_user_id,r.reward_type,r.reward_amount::text reward_amount,r.claimed_at,
  cr.message_id::text claim_message_id,cr.user_id::text claim_user_id,cr.reward_type claim_type,cr.reward_amount::text claim_amount,cr.balance_before::text,cr.balance_after::text
  FROM user_messages m LEFT JOIN user_message_rewards r ON r.message_id=m.id LEFT JOIN user_message_reward_claim_receipts_v1222 cr ON cr.reward_id=r.id WHERE m.campaign_key=$1`,[CAMPAIGN_KEY]));
 assert.equal(r.user_id,TARGET.userId);assert.equal(r.reward_user_id,TARGET.userId);assert.equal(r.message_id,receipt.messageId);assert.equal(r.reward_id,receipt.rewardId);
 assert.equal(r.title,TITLE);assert.equal(r.body,BODY);assert.equal(r.sender_type,'ADMIN');assert.equal(r.message_type,'COIN_REWARD');assert.equal(r.reward_type,'COIN');assert.equal(r.reward_amount,AMOUNT);
 if(unclaimed){assert.equal(r.claimed_at,null);assert.equal(r.hidden_at,null);assert.equal(Number(r.is_read),0);}
 if(r.claimed_at){assert.equal(r.claim_message_id,r.message_id);assert.equal(r.claim_user_id,TARGET.userId);assert.equal(r.claim_type,'COIN');assert.equal(r.claim_amount,AMOUNT);assert.equal(BigInt(r.balance_after)-BigInt(r.balance_before),BigInt(AMOUNT));}
 else assert.equal(r.claim_message_id,null);
 if(receipt.auditId){const audit=one(await q(c,'SELECT id::text,admin_id::text,after_data FROM admin_logs WHERE action_type=$1 AND target_id=$2',[ACTION,OPERATION_KEY]));assert.equal(audit.id,receipt.auditId);assert.equal(audit.admin_id,'1');const {auditId,...logged}=receipt;assert.deepEqual(parse(audit.after_data),logged);}
 return {status:'VERIFIED',addedRecipients:1,addedCoin:AMOUNT,totalRecipients:51,totalCoin:'89000000000000',remainingHeld:1,messages:1,rewards:1,claimed:r.claimed_at?1:0,baseMessages:base.verification.messages,missing:0,duplicates:0};
}
// User confirmed Moo날두 4415 and explicitly held 철줌마효진님. Original
// campaign and completion receipt stay unchanged; only this recipient is added.
export async function send(c,{commit=false}={}){
 await c.query('BEGIN');try{
  await c.query("SET LOCAL lock_timeout='5s'");await c.query("SET LOCAL statement_timeout='15s'");
  await q(c,'SELECT pg_advisory_xact_lock(hashtextextended($1,0))',[OPERATION_KEY]);
  const saved=await q(c,'SELECT value FROM app_meta WHERE key=$1',[OPERATION_KEY]);
  if(saved.length){const receipt=parse(one(saved).value),verification=await verify(c,receipt);await c.query('ROLLBACK');return {replayed:true,committed:false,receipt,verification};}
  const base=await prior(c),before=await inspect(c,{lock:true});assert.equal(before.existing.length,0,'Matching reward already sent');
  one(await q(c,"SELECT id FROM users WHERE id=1 AND role='OWNER' AND status='ACTIVE'"));
  const message=one(await q(c,"INSERT INTO user_messages(user_id,sender_type,title,body,message_type,campaign_key) VALUES($1,'ADMIN',$2,$3,'COIN_REWARD',$4) RETURNING id::text",[TARGET.userId,TITLE,BODY,CAMPAIGN_KEY]));
  const reward=one(await q(c,"INSERT INTO user_message_rewards(message_id,user_id,reward_type,reward_amount) VALUES($1,$2,'COIN',$3) RETURNING id::text",[message.id,TARGET.userId,AMOUNT]));
  assert.equal(one(await q(c,'SELECT coin::text FROM users WHERE id=$1',[TARGET.userId])).coin,before.coin,'Sending must not credit wallet');
  const receipt={status:'COMPLETED',actor:'CODEX_OPERATIONS',operationKey:OPERATION_KEY,campaignKey:CAMPAIGN_KEY,authorization:'족날두는 Moo날두 (ID 4415) 확정; 철줌마효진님 보류',target:TARGET,amount:AMOUNT,delivery:'MESSAGE',noImmediateCredit:true,
   baseOperationKey:BASE_KEY,baseReceiptHash:base.digest,remainingHeld:[{inputNickname:'철줌마효진님',amount:AMOUNT,reason:'USER_REQUESTED_HOLD'}],messageId:message.id,rewardId:reward.id,completedAt:new Date().toISOString()};
  await verify(c,receipt,{unclaimed:true});
  receipt.auditId=one(await q(c,"INSERT INTO admin_logs(admin_id,action_type,target_type,target_id,before_data,after_data) VALUES(1,$1,'USER_MESSAGE',$2,$3,$4) RETURNING id::text",[ACTION,OPERATION_KEY,JSON.stringify({existingMessages:0,baseReceiptHash:base.digest}),JSON.stringify(receipt)])).id;
  one(await q(c,'INSERT INTO app_meta(key,value,updated_at) VALUES($1,$2,CURRENT_TIMESTAMP) RETURNING key',[OPERATION_KEY,JSON.stringify(receipt)]));
  const verification=await verify(c,receipt,{unclaimed:true});await c.query(commit?'COMMIT':'ROLLBACK');return {replayed:false,committed:commit,receipt,verification};
 }catch(e){await c.query('ROLLBACK').catch(()=>{});throw e;}
}
