import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';

export const PLAN=JSON.parse(readFileSync(new URL('./fortress-rewards-20261020-plan.json',import.meta.url),'utf8'));
export const PLAN_HASH='f78b653b82c03bb105e0fd07ee5cb5b28572d7b2423ca8af6ca459c491b2733c';
export const OPERATION_KEY='ops:fortress-rewards:20261020:v1',CAMPAIGN_KEY='fortress-rewards-20261020-v1';
export const ACTION='OPS_FORTRESS_REWARD_MESSAGES';
export const TARGETS=[...PLAN.recipients].sort((a,b)=>Number(a.userId)-Number(b.userId));
const ids=TARGETS.map(t=>t.userId),q=async(c,sql,args=[])=>(await c.query(sql,args)).rows;
const parse=v=>typeof v==='string'?JSON.parse(v):v;
const hash=v=>createHash('sha256').update(JSON.stringify(v)).digest('hex');
export const identityHash=u=>hash({provider:u.provider,providerName:u.provider_name,providerId:u.provider_user_id});
export function body(t){
 const text={
  PARTICIPANT:'포트리스에 참가해 주셔서 감사합니다!\n\n참가상: 3,000억 코인',
  WINNER:'포트리스 우승을 축하드립니다!\n\n우승 보상: 10조 코인',
  RUNNER_UP:'포트리스 준우승을 축하드립니다!\n\n준우승 보상: 5조 코인'
 }[t.tier];
 assert(text);return text+'\n\n아래 보상 수령 버튼을 눌러 받아 주세요.';
}
function validate(expected){
 assert.equal(expected,PLAN_HASH,'Reviewed plan hash required');assert.equal(hash(PLAN),PLAN_HASH,'Plan changed');
 assert.equal(PLAN.operationKey,OPERATION_KEY);assert.equal(PLAN.campaignKey,CAMPAIGN_KEY);assert.equal(PLAN.title,'포트리스 보상');
 assert.equal(PLAN.delivery,'MESSAGE');assert.equal(PLAN.recipientCount,55);assert.equal(TARGETS.length,55);assert.equal(new Set(ids).size,55);
 assert.deepEqual(PLAN.held,[{inputNickname:'철줌마효진',tier:'PARTICIPANT',amount:'300000000000',reason:'USER_REQUESTED_HOLD_IDENTITY_UNRESOLVED'}]);
 assert(!TARGETS.some(t=>t.inputNickname==='철줌마효진'));
 assert.deepEqual(PLAN.tiers,{PARTICIPANT:{count:49,amount:'300000000000'},WINNER:{count:3,amount:'10000000000000'},RUNNER_UP:{count:3,amount:'5000000000000'}});
 for(const [tier,spec]of Object.entries(PLAN.tiers)){
  const selected=TARGETS.filter(t=>t.tier===tier);assert.equal(selected.length,spec.count);
  for(const t of selected)assert.equal(t.amount,spec.amount);
 }
 assert.equal(PLAN.totalCoin,'59700000000000');assert.equal(TARGETS.reduce((n,t)=>n+BigInt(t.amount),0n).toString(),PLAN.totalCoin);
}
export async function inspectRewards(c,{lock=false}={}){
 validate(PLAN_HASH);
 const users=await q(c,`SELECT u.id::text,u.nickname,u.role,u.status,u.coin::text,s.provider,s.provider_name,s.provider_user_id
 FROM users u JOIN user_second_verifications s ON s.user_id=u.id
 WHERE u.id=ANY($1::bigint[]) OR u.nickname=ANY($2::text[]) ORDER BY u.id${lock?' FOR SHARE OF u,s':''}`,[ids,TARGETS.map(t=>t.nickname)]);
 assert.equal(users.length,55,'Missing or ambiguous recipient');
 for(let i=0;i<TARGETS.length;i++){
  const t=TARGETS[i],u=users[i];
  assert.deepEqual({id:u.id,nickname:u.nickname,role:u.role,status:u.status,identityHash:identityHash(u)},{id:t.userId,nickname:t.nickname,role:t.role,status:'ACTIVE',identityHash:t.identityHash},'Recipient identity changed');
  assert(BigInt(u.coin)>=0n&&BigInt(u.coin)+BigInt(t.amount)<=BigInt(Number.MAX_SAFE_INTEGER),'Coin balance outside supported range');
 }
 const existing=await q(c,`SELECT id::text,user_id::text,campaign_key FROM user_messages
 WHERE campaign_key=$1 OR (user_id=ANY($2::bigint[]) AND title=$3 AND created_at::timestamptz>=$4::timestamptz)`,
 [CAMPAIGN_KEY,ids,PLAN.title,'2026-10-19T15:00:00Z']);
 return {count:55,planHash:PLAN_HASH,totalCoin:PLAN.totalCoin,existing,wallets:users.map(u=>({userId:u.id,coin:u.coin}))};
}
export async function verifyRewards(c,receipt,{unclaimed=false}={}){
 validate(receipt.planHash);assert.equal(receipt.status,'COMPLETED');assert.equal(receipt.operationKey,OPERATION_KEY);assert.equal(receipt.campaignKey,CAMPAIGN_KEY);
 assert.equal(receipt.delivery,'MESSAGE');assert.equal(receipt.noImmediateCredit,true);assert.equal(receipt.authorization,PLAN.authorization);
 assert.equal(receipt.totalCoin,PLAN.totalCoin);assert.deepEqual(receipt.recipients,TARGETS);assert.deepEqual(receipt.held,PLAN.held);
 const rows=await q(c,`SELECT m.id::text message_id,m.user_id::text user_id,m.title,m.body,m.sender_type,m.message_type,m.is_read,m.hidden_at,
 r.id::text reward_id,r.user_id::text reward_user_id,r.reward_type,r.reward_amount::text reward_amount,r.claimed_at,
 cr.reward_id::text claim_id,cr.message_id::text claim_message_id,cr.user_id::text claim_user_id,cr.reward_type claim_type,cr.reward_amount::text claim_amount,cr.balance_before::text,cr.balance_after::text
 FROM user_messages m LEFT JOIN user_message_rewards r ON r.message_id=m.id LEFT JOIN user_message_reward_claim_receipts_v1222 cr ON cr.reward_id=r.id
 WHERE m.campaign_key=$1 ORDER BY m.user_id`,[CAMPAIGN_KEY]);
 assert.equal(rows.length,55,'Missing or duplicate delivery');assert.deepEqual(rows.map(r=>r.user_id),ids);
 for(let i=0;i<TARGETS.length;i++){
  const t=TARGETS[i],r=rows[i];assert(r.reward_id);assert.equal(r.reward_user_id,t.userId);assert.equal(r.reward_type,'COIN');assert.equal(r.reward_amount,t.amount);
  assert.equal(r.title,PLAN.title);assert.equal(r.body,body(t));assert.equal(r.sender_type,'ADMIN');assert.equal(r.message_type,'COIN_REWARD');
  if(unclaimed){assert.equal(r.claimed_at,null);assert.equal(r.hidden_at,null);assert.equal(Number(r.is_read),0);}
  if(r.claimed_at){assert(r.claim_id);assert.equal(r.claim_message_id,r.message_id);assert.equal(r.claim_user_id,r.user_id);assert.equal(r.claim_type,'COIN');assert.equal(r.claim_amount,t.amount);assert.equal(BigInt(r.balance_after)-BigInt(r.balance_before),BigInt(t.amount));}
  else assert.equal(r.claim_id,null);
 }
 assert.equal(rows.reduce((n,r)=>n+BigInt(r.reward_amount),0n).toString(),PLAN.totalCoin);
 assert.deepEqual(rows.map(r=>({userId:r.user_id,messageId:r.message_id,rewardId:r.reward_id})),receipt.deliveries);
 if(receipt.auditId){
  const audits=await q(c,'SELECT id::text,admin_id::text,after_data FROM admin_logs WHERE action_type=$1 AND target_id=$2',[ACTION,OPERATION_KEY]);
  assert.equal(audits.length,1);assert.equal(audits[0].id,receipt.auditId);assert.equal(audits[0].admin_id,'1');
  const {auditId,...audited}=receipt;assert.deepEqual(parse(audits[0].after_data),audited);
 }
 return {recipients:55,participants:49,winners:3,runnersUp:3,held:1,messages:55,rewards:55,totalCoin:PLAN.totalCoin,claimed:rows.filter(r=>r.claimed_at).length,missing:0,duplicates:0};
}
// The existing claim endpoint credits each wallet once. Sending only creates
// messages, attached rewards and their atomic audit/completion record.
export async function sendRewards(c,{expectedPlanHash,commit=false}={}){
 validate(expectedPlanHash);await c.query('BEGIN ISOLATION LEVEL REPEATABLE READ');
 try{
  await c.query("SET LOCAL lock_timeout='5s'");await c.query("SET LOCAL statement_timeout='20s'");
  const reserved=await q(c,'INSERT INTO app_meta(key,value,updated_at) VALUES($1,$2,CURRENT_TIMESTAMP) ON CONFLICT(key) DO NOTHING RETURNING key',[OPERATION_KEY,JSON.stringify({status:'PENDING'})]);
  if(!reserved.length){
   const [saved]=await q(c,'SELECT value FROM app_meta WHERE key=$1',[OPERATION_KEY]),receipt=parse(saved.value),verification=await verifyRewards(c,receipt);
   await c.query('ROLLBACK');return {receipt,verification,replayed:true,committed:false};
  }
  const inspected=await inspectRewards(c,{lock:true});assert.equal(inspected.existing.length,0,'Matching gift already exists');
  const [owner]=await q(c,"SELECT id FROM users WHERE id=1 AND role='OWNER' AND status='ACTIVE'");assert(owner,'Active audit OWNER required');
  const payload=JSON.stringify(TARGETS.map(t=>({user_id:t.userId,body:body(t),amount:t.amount})));
  const messages=await q(c,`INSERT INTO user_messages(user_id,sender_type,title,body,message_type,campaign_key)
   SELECT t.user_id,'ADMIN',$2,t.body,'COIN_REWARD',$3 FROM jsonb_to_recordset($1::jsonb) t(user_id bigint,body text,amount bigint)
   ORDER BY t.user_id RETURNING id::text,user_id::text`,[payload,PLAN.title,CAMPAIGN_KEY]);
  assert.equal(messages.length,55,'Partial message insert');
  const rewards=await q(c,`INSERT INTO user_message_rewards(message_id,user_id,reward_type,reward_amount)
   SELECT m.id,m.user_id,'COIN',t.amount FROM user_messages m JOIN jsonb_to_recordset($1::jsonb) t(user_id bigint,amount bigint) ON t.user_id=m.user_id
   WHERE m.campaign_key=$2 ORDER BY m.user_id RETURNING id::text,message_id::text,user_id::text`,[payload,CAMPAIGN_KEY]);
  assert.equal(rewards.length,55,'Partial reward insert');
  const wallets=await q(c,'SELECT id::text user_id,coin::text FROM users WHERE id=ANY($1::bigint[]) ORDER BY id',[ids]);
  assert.deepEqual(wallets.map(u=>({userId:u.user_id,coin:u.coin})),inspected.wallets,'Message send must not credit wallets');
  const deliveries=rewards.map(r=>({userId:r.user_id,messageId:r.message_id,rewardId:r.id})).sort((a,b)=>Number(a.userId)-Number(b.userId));
  const receipt={status:'COMPLETED',operationKey:OPERATION_KEY,campaignKey:CAMPAIGN_KEY,planHash:PLAN_HASH,authorization:PLAN.authorization,delivery:'MESSAGE',noImmediateCredit:true,
   recipients:TARGETS,held:PLAN.held,totalCoin:PLAN.totalCoin,deliveries,actor:'SYSTEM_OPS',completedAt:new Date().toISOString()};
  await verifyRewards(c,receipt,{unclaimed:true});
  const [audit]=await q(c,"INSERT INTO admin_logs(admin_id,action_type,target_type,target_id,before_data,after_data) VALUES($1,$2,'USER_MESSAGE',$3,$4,$5) RETURNING id::text",
   [owner.id,ACTION,OPERATION_KEY,JSON.stringify({existingMessages:0,held:PLAN.held}),JSON.stringify(receipt)]);
  assert(audit?.id,'Audit missing');receipt.auditId=audit.id;
  assert.equal((await q(c,'UPDATE app_meta SET value=$2,updated_at=CURRENT_TIMESTAMP WHERE key=$1 RETURNING key',[OPERATION_KEY,JSON.stringify(receipt)])).length,1,'Completed receipt missing');
  const verification=await verifyRewards(c,receipt,{unclaimed:true});await c.query(commit?'COMMIT':'ROLLBACK');
  return {receipt,verification,replayed:false,committed:commit};
 }catch(error){await c.query('ROLLBACK').catch(()=>{});throw error;}
}
