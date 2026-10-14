import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';

export const PLAN=JSON.parse(readFileSync(new URL('./named-coin-rewards-20261015-plan.json',import.meta.url),'utf8'));
export const PLAN_HASH='9d4d586a941fdf937301b6a69fe4702d101530cef77417770371c6d2fc753c2f';
export const OPERATION_KEY='ops:named-coin-rewards:20261015:v1',CAMPAIGN_KEY='named-coin-rewards-20261015-v1';
export const ACTION='OPS_NAMED_COIN_REWARD_MESSAGES';
export const TARGETS=[...PLAN.recipients].sort((a,b)=>Number(a.userId)-Number(b.userId));
const ids=TARGETS.map(t=>t.userId),q=async(c,s,v=[])=>(await c.query(s,v)).rows,parse=v=>typeof v==='string'?JSON.parse(v):v;
export const body=t=>`코인 보상으로 ${t.units}조 코인을 지급합니다.\n지급 기준: ${t.units}코인 × 1조\n\n아래 보상 수령 버튼을 눌러 받아 주세요.`;
function validate(hash){
 assert.equal(hash,PLAN_HASH,'Reviewed plan hash required');assert.equal(createHash('sha256').update(JSON.stringify(PLAN)).digest('hex'),PLAN_HASH,'Plan changed');
 assert.equal(PLAN.operationKey,OPERATION_KEY);assert.equal(PLAN.campaignKey,CAMPAIGN_KEY);assert.equal(PLAN.recipientCount,23);assert.equal(TARGETS.length,23);assert.equal(new Set(ids).size,23);
 assert.equal(PLAN.unitValue,'1000000000000');assert.equal(PLAN.totalCoin,'39000000000000');
 for(const t of PLAN.recipients){assert.equal(t.units,t.order<=15?1:3);assert.equal(t.amount,(BigInt(t.units)*BigInt(PLAN.unitValue)).toString());}
 assert.equal(TARGETS.reduce((n,t)=>n+BigInt(t.amount),0n).toString(),PLAN.totalCoin);
}
export async function inspectNamedCoinRewards(c,{lock=false}={}){
 validate(PLAN_HASH);
 const users=await q(c,`SELECT u.id::text,u.nickname,u.role,u.status,u.coin::text,s.provider,s.provider_name,s.provider_user_id
  FROM users u JOIN user_second_verifications s ON s.user_id=u.id WHERE u.id=ANY($1::bigint[]) OR u.nickname=ANY($2::text[]) ORDER BY u.id${lock?' FOR SHARE OF u,s':''}`,[ids,TARGETS.map(t=>t.nickname)]);
 assert.equal(users.length,23,'Missing or ambiguous recipient');
 for(let i=0;i<TARGETS.length;i++){
  const t=TARGETS[i],u=users[i];assert.deepEqual({id:u.id,nickname:u.nickname,role:u.role,status:u.status,provider:u.provider,providerName:u.provider_name,providerId:u.provider_user_id},{id:t.userId,nickname:t.nickname,role:t.role,status:'ACTIVE',provider:t.provider,providerName:t.providerName,providerId:t.providerId},'Recipient identity changed');
  assert.ok(BigInt(u.coin)>=0n&&BigInt(u.coin)+BigInt(t.amount)<=BigInt(Number.MAX_SAFE_INTEGER),'Coin balance outside supported range');
 }
 const existing=await q(c,'SELECT id::text,user_id::text,campaign_key FROM user_messages WHERE campaign_key=$1 OR (user_id=ANY($2::bigint[]) AND title=$3)',[CAMPAIGN_KEY,ids,PLAN.title]);
 return {count:23,oneTrillionRecipients:15,threeTrillionRecipients:8,totalCoin:PLAN.totalCoin,planHash:PLAN_HASH,existing};
}
export async function verifyNamedCoinRewards(c,receipt,{unclaimed=false}={}){
 validate(receipt.planHash);assert.equal(receipt.status,'COMPLETED');assert.equal(receipt.operationKey,OPERATION_KEY);assert.equal(receipt.campaignKey,CAMPAIGN_KEY);
 assert.equal(receipt.delivery,'MESSAGE');assert.equal(receipt.noImmediateCredit,true);assert.equal(receipt.authorization,PLAN.authorization);assert.equal(receipt.totalCoin,PLAN.totalCoin);assert.deepEqual(receipt.recipients,TARGETS);
 const rows=await q(c,`SELECT m.id::text message_id,m.user_id::text user_id,m.title,m.body,m.sender_type,m.message_type,m.is_read,m.hidden_at,
  r.id::text reward_id,r.user_id::text reward_user_id,r.reward_type,r.reward_amount::text reward_amount,r.claimed_at,
  cr.reward_id::text claim_id,cr.message_id::text claim_message_id,cr.user_id::text claim_user_id,cr.reward_type claim_type,cr.reward_amount::text claim_amount,cr.balance_before::text,cr.balance_after::text
  FROM user_messages m LEFT JOIN user_message_rewards r ON r.message_id=m.id LEFT JOIN user_message_reward_claim_receipts_v1222 cr ON cr.reward_id=r.id
  WHERE m.campaign_key=$1 ORDER BY m.user_id`,[CAMPAIGN_KEY]);
 assert.equal(rows.length,23,'Missing or duplicate delivery');assert.deepEqual(rows.map(r=>r.user_id),ids);
 for(let i=0;i<TARGETS.length;i++){
  const t=TARGETS[i],r=rows[i];assert.ok(r.reward_id);assert.equal(r.reward_user_id,t.userId);assert.equal(r.reward_type,'COIN');assert.equal(r.reward_amount,t.amount);
  assert.equal(r.title,PLAN.title);assert.equal(r.body,body(t));assert.equal(r.sender_type,'ADMIN');assert.equal(r.message_type,'COIN_REWARD');
  if(unclaimed){assert.equal(r.claimed_at,null);assert.equal(r.hidden_at,null);assert.equal(Number(r.is_read),0);}
  if(r.claimed_at){assert.ok(r.claim_id);assert.equal(r.claim_message_id,r.message_id);assert.equal(r.claim_user_id,r.user_id);assert.equal(r.claim_type,'COIN');assert.equal(r.claim_amount,t.amount);assert.equal(BigInt(r.balance_after)-BigInt(r.balance_before),BigInt(t.amount));}else assert.equal(r.claim_id,null);
 }
 assert.equal(rows.reduce((n,r)=>n+BigInt(r.reward_amount),0n).toString(),PLAN.totalCoin);
 assert.deepEqual(rows.map(r=>({userId:r.user_id,messageId:r.message_id,rewardId:r.reward_id})),receipt.deliveries);
 if(receipt.auditId){const audits=await q(c,'SELECT id::text,admin_id::text,after_data FROM admin_logs WHERE action_type=$1 AND target_id=$2',[ACTION,OPERATION_KEY]);assert.equal(audits.length,1);assert.equal(audits[0].id,receipt.auditId);assert.equal(audits[0].admin_id,'1');const {auditId,...audited}=receipt;assert.deepEqual(parse(audits[0].after_data),audited);}
 return {recipients:23,oneTrillionRecipients:15,threeTrillionRecipients:8,messages:23,rewards:23,totalCoin:PLAN.totalCoin,claimed:rows.filter(r=>r.claimed_at).length,missing:0,duplicates:0};
}
// One authorized message per fixed recipient. The existing claim API credits the
// actual wallet; message, attachment, audit and completed receipt commit together.
export async function sendNamedCoinRewards(c,{expectedPlanHash,commit=false}={}){
 validate(expectedPlanHash);await c.query('BEGIN ISOLATION LEVEL REPEATABLE READ');
 try{
  await c.query("SET LOCAL lock_timeout='5s'");await c.query("SET LOCAL statement_timeout='20s'");
  const reserved=await q(c,'INSERT INTO app_meta(key,value,updated_at) VALUES($1,$2,CURRENT_TIMESTAMP) ON CONFLICT(key) DO NOTHING RETURNING key',[OPERATION_KEY,JSON.stringify({status:'PENDING'})]);
  if(!reserved.length){const [saved]=await q(c,'SELECT value FROM app_meta WHERE key=$1',[OPERATION_KEY]);const receipt=parse(saved.value),verification=await verifyNamedCoinRewards(c,receipt);await c.query('ROLLBACK');return {receipt,verification,replayed:true,committed:false};}
  const inspected=await inspectNamedCoinRewards(c,{lock:true});assert.equal(inspected.existing.length,0,'Matching gift already exists');
  const [owner]=await q(c,"SELECT id FROM users WHERE id=1 AND role='OWNER' AND status='ACTIVE'");assert.ok(owner,'Active audit OWNER required');
  const payload=JSON.stringify(TARGETS.map(t=>({user_id:t.userId,body:body(t),amount:t.amount})));
  const messages=await q(c,`INSERT INTO user_messages(user_id,sender_type,title,body,message_type,campaign_key)
   SELECT t.user_id,'ADMIN',$2,t.body,'COIN_REWARD',$3 FROM jsonb_to_recordset($1::jsonb) t(user_id bigint,body text,amount bigint) ORDER BY t.user_id RETURNING id::text,user_id::text`,[payload,PLAN.title,CAMPAIGN_KEY]);assert.equal(messages.length,23,'Partial message insert');
  const rewards=await q(c,`INSERT INTO user_message_rewards(message_id,user_id,reward_type,reward_amount)
   SELECT m.id,m.user_id,'COIN',t.amount FROM user_messages m JOIN jsonb_to_recordset($1::jsonb) t(user_id bigint,amount bigint) ON t.user_id=m.user_id WHERE m.campaign_key=$2 ORDER BY m.user_id RETURNING id::text,message_id::text,user_id::text`,[payload,CAMPAIGN_KEY]);assert.equal(rewards.length,23,'Partial reward insert');
  const deliveries=rewards.map(r=>({userId:r.user_id,messageId:r.message_id,rewardId:r.id})).sort((a,b)=>Number(a.userId)-Number(b.userId));
  const receipt={status:'COMPLETED',operationKey:OPERATION_KEY,campaignKey:CAMPAIGN_KEY,planHash:PLAN_HASH,authorization:PLAN.authorization,delivery:'MESSAGE',noImmediateCredit:true,recipients:TARGETS,totalCoin:PLAN.totalCoin,deliveries,actor:'SYSTEM_OPS',completedAt:new Date().toISOString()};
  await verifyNamedCoinRewards(c,receipt,{unclaimed:true});
  const [audit]=await q(c,"INSERT INTO admin_logs(admin_id,action_type,target_type,target_id,before_data,after_data) VALUES($1,$2,'USER_MESSAGE',$3,$4,$5) RETURNING id::text",[owner.id,ACTION,OPERATION_KEY,JSON.stringify({existingMessages:0}),JSON.stringify(receipt)]);assert.ok(audit?.id,'Audit missing');receipt.auditId=audit.id;
  assert.equal((await q(c,'UPDATE app_meta SET value=$2,updated_at=CURRENT_TIMESTAMP WHERE key=$1 RETURNING key',[OPERATION_KEY,JSON.stringify(receipt)])).length,1,'Completed receipt missing');
  const verification=await verifyNamedCoinRewards(c,receipt,{unclaimed:true});await c.query(commit?'COMMIT':'ROLLBACK');return {receipt,verification,replayed:false,committed:commit};
 }catch(error){await c.query('ROLLBACK').catch(()=>{});throw error;}
}
