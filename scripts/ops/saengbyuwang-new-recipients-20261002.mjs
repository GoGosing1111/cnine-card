import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import targets from './saengbyuwang-new-recipients-20261002.json' with {type:'json'};
import originalRoster from './saengbyuwang-recipients-20260930.json' with {type:'json'};
import {OPERATION_KEY as ORIGINAL_KEY,TITLE,GIFTS as ORIGINAL_GIFTS} from './saengbyuwang-rewards-20260930.mjs';

export const OPERATION_KEY='ops:saengbyuwang-rewards:new-recipients:20261002:v1';
export const GIFTS=ORIGINAL_GIFTS.map(g=>({...g,campaignKey:g.campaignKey.replace('20260930-v1','20261002-supplement-v1')}));
export {TITLE};
const q=async(client,sql,args=[])=>(await client.query(sql,args)).rows;
const fingerprint=rows=>createHash('sha256').update(JSON.stringify(rows.map(r=>[r.sourceKey,r.userId,r.alreadySent]))).digest('hex');
assert.equal(targets.length,16);assert.equal(new Set(targets.map(r=>r.sourceKey)).size,16);
const originalKeys=new Set(originalRoster.map(r=>r.sourceKey));
for(const target of targets){assert.match(target.sourceKey,/^[a-f0-9]{8}$/);assert.match(target.userId,/^[1-9][0-9]*$/);assert.ok(!originalKeys.has(target.sourceKey),'Original recipient cannot be added again');}

// Read all matching messages, including unread, hidden and claimed messages.
// The original durable receipt also excludes accounts whose messages were removed.
export async function inspectNewRecipients(client){
 const saved=await q(client,"SELECT key,value FROM app_meta WHERE key LIKE 'ops:saengbyuwang-rewards:%' ORDER BY key");
 const receipts=saved.map(row=>({key:row.key,receipt:JSON.parse(row.value)}));
 const original=receipts.find(row=>row.key===ORIGINAL_KEY)?.receipt;
 assert.equal(original?.status,'COMPLETED','Original completed receipt required');assert.equal(original.count,50);
 assert.deepEqual(original.recipients.map(r=>[r.sourceKey,r.userId]),originalRoster.map(r=>[r.sourceKey,r.userId]));
 const linked=await q(client,`SELECT LOWER(v.provider_user_id) AS "sourceKey",v.user_id::text AS "userId",u.nickname,u.status
  FROM user_second_verifications v JOIN users u ON u.id=v.user_id
  WHERE v.provider='PLAYDK' AND LOWER(v.provider_user_id)=ANY($1::text[])`,[targets.map(r=>r.sourceKey)]);
 const candidates=targets.map(target=>{
  const matches=linked.filter(row=>row.sourceKey===target.sourceKey);
  assert.equal(matches.length,1,'Exactly one verified account required for '+target.sourceKey);
  assert.equal(matches[0].userId,target.userId,'Verified account changed for '+target.sourceKey);
  return {...target,...matches[0]};
 });
 assert.equal(new Set(candidates.map(r=>r.userId)).size,16,'Candidate accounts overlap');
 const messages=await q(client,`SELECT m.id::text AS "messageId",m.user_id::text AS "userId",m.campaign_key AS "campaignKey",m.title,
  r.reward_type AS "rewardType",r.reward_amount::text AS "rewardAmount",r.claimed_at AS "claimedAt"
  FROM user_messages m LEFT JOIN user_message_rewards r ON r.message_id=m.id
  WHERE m.user_id=ANY($1::bigint[]) AND (m.title=$2 OR m.campaign_key LIKE 'saengbyuwang-%') ORDER BY m.user_id,m.id`,[candidates.map(r=>r.userId),TITLE]);
 const completed=receipts.filter(row=>row.receipt.status==='COMPLETED');
 const paidKeys=new Set(),paidUsers=new Set();
 for(const {receipt} of completed){
  assert.equal(receipt.title,TITLE,'Unexpected reward receipt');
  assert.deepEqual(receipt.gifts.map(g=>[g.rewardType,g.rewardAmount]),ORIGINAL_GIFTS.map(g=>[g.rewardType,g.rewardAmount]));
  for(const row of receipt.recipients){paidKeys.add(row.sourceKey);paidUsers.add(String(row.userId));}
 }
 for(const row of candidates){
  const prior=messages.filter(m=>m.userId===row.userId);
  if(prior.length&&!paidKeys.has(row.sourceKey)&&!paidUsers.has(row.userId)){
   assert.ok(GIFTS.every(g=>prior.some(m=>m.rewardType===g.rewardType&&m.rewardAmount===g.rewardAmount)),'Partial previous delivery requires reconciliation: '+row.sourceKey);
  }
  row.alreadySent=paidKeys.has(row.sourceKey)||paidUsers.has(row.userId)||prior.length>0;
  row.previousMessageCount=prior.length;
 }
 const currentCampaigns=await q(client,'SELECT campaign_key,COUNT(*)::int AS count FROM user_messages WHERE campaign_key=ANY($1::text[]) GROUP BY campaign_key',[GIFTS.map(g=>g.campaignKey)]);
 const items=await q(client,'SELECT code,name,is_active FROM inventory_items WHERE code=ANY($1::text[]) ORDER BY code',[['MASTER_STAR','STARLIGHT_ARMOR_CORE']]);
 assert.deepEqual(items.map(r=>[r.code,r.name,Number(r.is_active)]),[['MASTER_STAR','마스터의 별',1],['STARLIGHT_ARMOR_CORE','미스틱 에너지',1]]);
 const receipt=receipts.find(row=>row.key===OPERATION_KEY)?.receipt||null;
 return {operationKey:OPERATION_KEY,title:TITLE,body:TITLE,candidateCount:16,originalExcludedCount:50,
  candidates,recipients:candidates.filter(r=>!r.alreadySent),excluded:candidates.filter(r=>r.alreadySent),
  recipientHash:fingerprint(candidates),gifts:GIFTS,originalAuditId:original.auditId,currentCampaigns,items,receipt};
}

export async function verifyNewRecipients(client,receipt){
 assert.equal(receipt.status,'COMPLETED');assert.equal(receipt.operationKey,OPERATION_KEY);
 assert.equal(receipt.delivery,'MESSAGE');assert.equal(receipt.noImmediateWalletCredit,true);
 assert.equal(receipt.title,TITLE);assert.equal(receipt.body,TITLE);
 assert.equal(receipt.count,receipt.recipients.length);assert.equal(receipt.count+receipt.excluded.length,16);
 assert.deepEqual(receipt.gifts,GIFTS);
 assert.equal(new Set(receipt.recipients.map(r=>r.userId)).size,receipt.count);
 assert.equal(new Set(receipt.recipients.map(r=>r.sourceKey)).size,receipt.count);
 const rows=await q(client,`SELECT m.id::text AS message_id,m.user_id::text AS user_id,m.title,m.body,m.sender_type,m.message_type,m.campaign_key,
  r.id::text AS reward_id,r.user_id::text AS reward_user_id,r.reward_type,r.reward_amount::text AS reward_amount,r.claimed_at,
  c.reward_id::text AS claim_id,c.user_id::text AS claim_user_id,c.message_id::text AS claim_message_id,
  c.reward_type AS claim_type,c.reward_amount::text AS claim_amount,c.balance_before::text AS balance_before,c.balance_after::text AS balance_after
  FROM user_messages m LEFT JOIN user_message_rewards r ON r.message_id=m.id
  LEFT JOIN user_message_reward_claim_receipts_v1222 c ON c.reward_id=r.id
  WHERE m.campaign_key=ANY($1::text[]) ORDER BY m.user_id,m.campaign_key`,[GIFTS.map(g=>g.campaignKey)]);
 assert.equal(rows.length,receipt.count*3,'Partial delivery');
 const recipientIds=new Set(receipt.recipients.map(r=>r.userId)),seen=new Set();
 for(const row of rows){
  const gift=GIFTS.find(g=>g.campaignKey===row.campaign_key);assert.ok(gift&&recipientIds.has(row.user_id),'Unexpected recipient');
  const key=row.user_id+':'+gift.rewardType;assert.ok(!seen.has(key),'Duplicate reward');seen.add(key);
  assert.equal(row.title,TITLE);assert.equal(row.body,TITLE);assert.equal(row.sender_type,'ADMIN');assert.equal(row.message_type,gift.messageType);
  assert.equal(row.reward_user_id,row.user_id);assert.equal(row.reward_type,gift.rewardType);assert.equal(row.reward_amount,gift.rewardAmount);
  assert.ok(receipt.messageIds.includes(row.message_id)&&receipt.rewardIds.includes(row.reward_id));
  if(row.claimed_at){
   assert.ok(row.claim_id);assert.equal(row.claim_user_id,row.user_id);assert.equal(row.claim_message_id,row.message_id);
   assert.equal(row.claim_type,gift.rewardType);assert.equal(row.claim_amount,gift.rewardAmount);
   assert.equal(BigInt(row.balance_after)-BigInt(row.balance_before),BigInt(gift.rewardAmount));
  }else assert.equal(row.claim_id,null);
 }
 if(receipt.auditId){
  const [audit]=await q(client,'SELECT action_type,target_id,after_data FROM admin_logs WHERE id=$1',[receipt.auditId]);
  assert.equal(audit?.action_type,'SAENGBYUWANG_REWARD_MESSAGE_SEND_SUPPLEMENT');assert.equal(audit.target_id,OPERATION_KEY);
  const {auditId,...audited}=receipt;assert.deepEqual(JSON.parse(audit.after_data),audited);
 }
 return {recipients:receipt.count,messages:rows.length,rewards:rows.length,missing:0,duplicates:0,
  totals:GIFTS.map(g=>({rewardType:g.rewardType,perRecipient:g.rewardAmount,totalAmount:String(BigInt(g.rewardAmount)*BigInt(receipt.count))}))};
}

// Explicit one-time grant to the inspected newly eligible accounts. Caller owns the transaction.
export async function sendNewRecipients(client,expectedRecipientHash){
 assert.match(String(expectedRecipientHash||''),/^[a-f0-9]{64}$/,'Inspected candidate hash required');
 for(const key of [ORIGINAL_KEY,OPERATION_KEY])await client.query('SELECT pg_advisory_xact_lock(hashtextextended($1,0))',[key]);
 const [saved]=await q(client,'SELECT value FROM app_meta WHERE key=$1 FOR UPDATE',[OPERATION_KEY]);
 if(saved){
  const receipt=JSON.parse(saved.value);assert.equal(receipt.recipientHash,expectedRecipientHash);
  return {receipt,verification:await verifyNewRecipients(client,receipt),replayed:true};
 }
 const [date]=await q(client,"SELECT to_char(CURRENT_TIMESTAMP AT TIME ZONE 'Asia/Seoul','YYYY-MM-DD') AS kst");
 assert.equal(date.kst,'2026-10-02','One-time operation date expired');
 await q(client,"SELECT user_id FROM user_second_verifications WHERE provider='PLAYDK' AND LOWER(provider_user_id)=ANY($1::text[]) ORDER BY user_id FOR SHARE",[targets.map(r=>r.sourceKey)]);
 await q(client,'SELECT id FROM users WHERE id=ANY($1::bigint[]) ORDER BY id FOR UPDATE',[targets.map(r=>r.userId)]);
 const plan=await inspectNewRecipients(client);assert.equal(plan.recipientHash,expectedRecipientHash,'Verified candidates or prior delivery changed; inspect again');
 assert.deepEqual(plan.currentCampaigns,[],'Unreceipted campaign messages exist');
 const [owner]=await q(client,"SELECT id FROM users WHERE UPPER(TRIM(role))='OWNER' AND UPPER(TRIM(status))='ACTIVE' ORDER BY id LIMIT 1");assert.ok(owner,'Audit owner required');
 const messageIds=[],rewardIds=[];
 for(const gift of GIFTS){
  const messages=await q(client,`INSERT INTO user_messages(user_id,sender_type,title,body,message_type,campaign_key)
   SELECT user_id,'ADMIN',$2,$2,$3,$4 FROM unnest($1::bigint[]) AS user_id ORDER BY user_id RETURNING id::text`,[plan.recipients.map(r=>r.userId),TITLE,gift.messageType,gift.campaignKey]);
  assert.equal(messages.length,plan.recipients.length,'Partial message insert');messageIds.push(...messages.map(r=>r.id));
  const rewards=await q(client,`INSERT INTO user_message_rewards(message_id,user_id,reward_type,reward_amount)
   SELECT id,user_id,$2,$3::bigint FROM user_messages WHERE campaign_key=$1 ORDER BY user_id RETURNING id::text`,[gift.campaignKey,gift.rewardType,gift.rewardAmount]);
  assert.equal(rewards.length,plan.recipients.length,'Partial reward insert');rewardIds.push(...rewards.map(r=>r.id));
 }
 const receipt={operationKey:OPERATION_KEY,status:'COMPLETED',title:TITLE,body:TITLE,delivery:'MESSAGE',noImmediateWalletCredit:true,
  count:plan.recipients.length,candidateCount:16,originalExcludedCount:50,originalAuditId:plan.originalAuditId,
  recipientHash:plan.recipientHash,recipients:plan.recipients,excluded:plan.excluded,gifts:GIFTS,messageIds,rewardIds,
  actor:'SYSTEM_OPS',authorization:'사용자 지시: 기존 지급 50명을 제외한 신규 16명에게 같은 상품으로 메시지 지급',completedAt:new Date().toISOString()};
 const verification=await verifyNewRecipients(client,receipt);
 const [audit]=await q(client,`INSERT INTO admin_logs(admin_id,action_type,target_type,target_id,before_data,after_data)
  VALUES($1,'SAENGBYUWANG_REWARD_MESSAGE_SEND_SUPPLEMENT','USER_MESSAGE',$2,$3,$4) RETURNING id::text`,[owner.id,OPERATION_KEY,JSON.stringify({newCampaignMessages:0,originalExcludedCount:50,additionalExcluded:plan.excluded}),JSON.stringify(receipt)]);
 assert.ok(audit);receipt.auditId=audit.id;
 const stored=await q(client,'INSERT INTO app_meta(key,value,updated_at) VALUES($1,$2,CURRENT_TIMESTAMP) RETURNING key',[OPERATION_KEY,JSON.stringify(receipt)]);assert.equal(stored.length,1);
 return {receipt,verification,replayed:false};
}
