import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';

export const PLAN=JSON.parse(readFileSync(new URL('./crater-tournament-rewards-20261022-plan.json',import.meta.url),'utf8'));
export const SOURCE=JSON.parse(readFileSync(new URL('./crater-tournament-rewards-20261022.source.json',import.meta.url),'utf8'));
export const hash=v=>createHash('sha256').update(JSON.stringify(v)).digest('hex');
export const PLAN_HASH=hash(PLAN);
export const OPERATION_KEY='ops:crater-tournament-rewards:20261022:v1',CAMPAIGN_KEY='crater-tournament-rewards-20261022-v1';
export const ACTION='OPS_CRATER_TOURNAMENT_REWARD_MESSAGES';
export const TARGETS=[...PLAN.recipients].sort((a,b)=>Number(a.userId)-Number(b.userId));
const ids=TARGETS.map(t=>t.userId),q=async(c,sql,args=[])=>(await c.query(sql,args)).rows;
const parse=v=>typeof v==='string'?JSON.parse(v):v;
export const identityHash=u=>hash({provider:u.provider,providerName:u.provider_name,providerId:u.provider_user_id});
export function body(t){
 assert(['WINNER','PARTICIPANT'].includes(t.tier));
 return (t.tier==='WINNER'?'크레이터 대회 우승을 축하드립니다!\n\n우승 상금: 20조 코인':'크레이터 대회에 참가해 주셔서 감사합니다!\n\n참가상: 1조 코인')+'\n\n아래 보상 수령 버튼을 눌러 받아 주세요.';
}
function validate(expected){
 assert.equal(expected,PLAN_HASH,'Reviewed plan hash required');assert.equal(hash(PLAN),PLAN_HASH,'Plan changed');
 assert.equal(PLAN.operationKey,OPERATION_KEY);assert.equal(SOURCE.operationKey,OPERATION_KEY);assert.equal(PLAN.campaignKey,CAMPAIGN_KEY);assert.equal(PLAN.title,'크레이터 대회 상금');assert.equal(PLAN.delivery,'MESSAGE');
 assert.equal(SOURCE.recipients.length,52);assert.equal(PLAN.recipientCount,TARGETS.length);assert.equal(new Set(ids).size,TARGETS.length);
 const accounted=[...TARGETS,...PLAN.held];assert.equal(accounted.length,52);assert.equal(new Set(accounted.map(t=>t.order)).size,52);
 for(const t of accounted){assert.deepEqual(SOURCE.recipients.find(s=>s.order===t.order),{order:t.order,inputNickname:t.inputNickname,tier:t.tier,amount:t.amount});assert.equal(t.amount,t.tier==='WINNER'?'20000000000000':'1000000000000');}
 assert.deepEqual(TARGETS.filter(t=>t.tier==='WINNER').map(t=>[t.userId,t.nickname]),[['4572','응맨'],['4627','학벌']]);
 for(const t of PLAN.held){assert.equal(t.tier,'PARTICIPANT');assert(t.reason);}
 assert.equal(PLAN.totalCoin,TARGETS.reduce((n,t)=>n+BigInt(t.amount),0n).toString());
 assert.equal(BigInt(PLAN.totalCoin)+PLAN.held.reduce((n,t)=>n+BigInt(t.amount),0n),90000000000000n);
}
export async function inspectRewards(c,{lock=false}={}){
 validate(PLAN_HASH);
 if(lock){await q(c,'SELECT id FROM users WHERE id=ANY($1::bigint[]) ORDER BY id FOR SHARE',[ids]);await q(c,'SELECT user_id FROM user_second_verifications WHERE user_id=ANY($1::bigint[]) ORDER BY user_id FOR SHARE',[ids]);}
 const users=await q(c,`SELECT u.id::text,u.nickname,u.role,u.status,u.coin::text,s.provider,s.provider_name,s.provider_user_id
  FROM users u LEFT JOIN user_second_verifications s ON s.user_id=u.id WHERE u.id=ANY($1::bigint[]) ORDER BY u.id`,[ids]);
 assert.equal(users.length,TARGETS.length,'Missing or ambiguous recipient');
 for(let i=0;i<TARGETS.length;i++){
  const t=TARGETS[i],u=users[i];assert.deepEqual({id:u.id,nickname:u.nickname,role:u.role,status:u.status,identityHash:identityHash(u)},{id:t.userId,nickname:t.nickname,role:t.role,status:'ACTIVE',identityHash:t.identityHash},'Recipient identity changed');
  assert(BigInt(u.coin)>=0n&&BigInt(u.coin)+BigInt(t.amount)<=BigInt(Number.MAX_SAFE_INTEGER),'Coin balance outside supported range');
 }
 const existing=await q(c,`SELECT id::text,user_id::text,campaign_key FROM user_messages
  WHERE campaign_key=$1 OR (user_id=ANY($2::bigint[]) AND title=$3 AND created_at::timestamptz>=$4::timestamptz)`,[CAMPAIGN_KEY,ids,PLAN.title,'2026-10-21T15:00:00Z']);
 return {count:TARGETS.length,planHash:PLAN_HASH,totalCoin:PLAN.totalCoin,existing,wallets:users.map(u=>({userId:u.id,coin:u.coin}))};
}
export async function verifyRewards(c,receipt,{unclaimed=false}={}){
 validate(receipt.planHash);assert.equal(receipt.status,'COMPLETED');assert.equal(receipt.operationKey,OPERATION_KEY);assert.equal(receipt.campaignKey,CAMPAIGN_KEY);assert.equal(receipt.actor,'CODEX_OPERATIONS');
 assert.equal(receipt.delivery,'MESSAGE');assert.equal(receipt.noImmediateCredit,true);assert.equal(receipt.authorization,PLAN.authorization);
 assert.equal(receipt.totalCoin,PLAN.totalCoin);assert.deepEqual(receipt.recipients,TARGETS);assert.deepEqual(receipt.held,PLAN.held);
 const rows=await q(c,`SELECT m.id::text message_id,m.user_id::text user_id,m.title,m.body,m.sender_type,m.message_type,m.is_read,m.hidden_at,
  r.id::text reward_id,r.user_id::text reward_user_id,r.reward_type,r.reward_amount::text reward_amount,r.claimed_at,
  cr.reward_id::text claim_id,cr.message_id::text claim_message_id,cr.user_id::text claim_user_id,cr.reward_type claim_type,cr.reward_amount::text claim_amount,cr.balance_before::text,cr.balance_after::text
  FROM user_messages m LEFT JOIN user_message_rewards r ON r.message_id=m.id LEFT JOIN user_message_reward_claim_receipts_v1222 cr ON cr.reward_id=r.id
  WHERE m.campaign_key=$1 ORDER BY m.user_id`,[CAMPAIGN_KEY]);
 assert.equal(rows.length,TARGETS.length,'Missing or duplicate delivery');assert.deepEqual(rows.map(r=>r.user_id),ids);
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
  const audits=await q(c,'SELECT id::text,admin_id::text,after_data FROM admin_logs WHERE action_type=$1 AND target_id=$2',[ACTION,OPERATION_KEY]);assert.equal(audits.length,1);assert.equal(audits[0].id,receipt.auditId);assert.equal(audits[0].admin_id,'1');
  const {auditId,...audited}=receipt;assert.deepEqual(parse(audits[0].after_data),audited);
 }
 return {recipients:TARGETS.length,participants:TARGETS.filter(t=>t.tier==='PARTICIPANT').length,winners:2,held:PLAN.held.length,messages:rows.length,rewards:rows.length,totalCoin:PLAN.totalCoin,claimed:rows.filter(r=>r.claimed_at).length,missing:0,duplicates:0};
}
// Message attachment only: existing claim transactions credit the recipients.
// Completion, messages, rewards and audit commit together under one operation key.
export async function sendRewards(c,{expectedPlanHash,commit=false}={}){
 validate(expectedPlanHash);await c.query('BEGIN');
 try{
  await c.query("SET LOCAL lock_timeout='5s'");await c.query("SET LOCAL statement_timeout='20s'");
  await q(c,'SELECT pg_advisory_xact_lock(hashtextextended($1,0))',[OPERATION_KEY]);
  const saved=await q(c,'SELECT value FROM app_meta WHERE key=$1',[OPERATION_KEY]);
  if(saved.length){assert.equal(saved.length,1);const receipt=parse(saved[0].value),verification=await verifyRewards(c,receipt);await c.query('ROLLBACK');return {receipt,verification,replayed:true,committed:false};}
  const inspected=await inspectRewards(c,{lock:true});assert.equal(inspected.existing.length,0,'Matching gift already exists');
  const [owner]=await q(c,"SELECT id FROM users WHERE id=1 AND role='OWNER' AND status='ACTIVE'");assert(owner,'Active audit OWNER required');
  const payload=JSON.stringify(TARGETS.map(t=>({user_id:t.userId,body:body(t),amount:t.amount})));
  const messages=await q(c,`INSERT INTO user_messages(user_id,sender_type,title,body,message_type,campaign_key)
   SELECT t.user_id,'ADMIN',$2,t.body,'COIN_REWARD',$3 FROM jsonb_to_recordset($1::jsonb) t(user_id bigint,body text,amount bigint)
   ORDER BY t.user_id RETURNING id::text,user_id::text`,[payload,PLAN.title,CAMPAIGN_KEY]);assert.equal(messages.length,TARGETS.length,'Partial message insert');
  const rewards=await q(c,`INSERT INTO user_message_rewards(message_id,user_id,reward_type,reward_amount)
   SELECT m.id,m.user_id,'COIN',t.amount FROM user_messages m JOIN jsonb_to_recordset($1::jsonb) t(user_id bigint,amount bigint) ON t.user_id=m.user_id
   WHERE m.campaign_key=$2 ORDER BY m.user_id RETURNING id::text,message_id::text,user_id::text`,[payload,CAMPAIGN_KEY]);assert.equal(rewards.length,TARGETS.length,'Partial reward insert');
  const wallets=await q(c,'SELECT id::text user_id,coin::text FROM users WHERE id=ANY($1::bigint[]) ORDER BY users.id',[ids]);
  assert.deepEqual(wallets.map(u=>({userId:u.user_id,coin:u.coin})),inspected.wallets,'Message send must not credit wallets');
  const deliveries=rewards.map(r=>({userId:r.user_id,messageId:r.message_id,rewardId:r.id})).sort((a,b)=>Number(a.userId)-Number(b.userId));
  const receipt={status:'COMPLETED',operationKey:OPERATION_KEY,campaignKey:CAMPAIGN_KEY,planHash:PLAN_HASH,authorization:PLAN.authorization,delivery:'MESSAGE',noImmediateCredit:true,
   recipients:TARGETS,held:PLAN.held,totalCoin:PLAN.totalCoin,deliveries,actor:'CODEX_OPERATIONS',completedAt:new Date().toISOString()};
  await verifyRewards(c,receipt,{unclaimed:true});
  const [audit]=await q(c,"INSERT INTO admin_logs(admin_id,action_type,target_type,target_id,before_data,after_data) VALUES($1,$2,'USER_MESSAGE',$3,$4,$5) RETURNING id::text",
   [owner.id,ACTION,OPERATION_KEY,JSON.stringify({existingMessages:0,held:PLAN.held}),JSON.stringify(receipt)]);assert(audit?.id,'Audit missing');receipt.auditId=audit.id;
  assert.equal((await q(c,'INSERT INTO app_meta(key,value,updated_at) VALUES($1,$2,CURRENT_TIMESTAMP) RETURNING key',[OPERATION_KEY,JSON.stringify(receipt)])).length,1,'Completed receipt missing');
  const verification=await verifyRewards(c,receipt,{unclaimed:true});await c.query(commit?'COMMIT':'ROLLBACK');return {receipt,verification,replayed:false,committed:commit};
 }catch(error){await c.query('ROLLBACK').catch(()=>{});throw error;}
}
