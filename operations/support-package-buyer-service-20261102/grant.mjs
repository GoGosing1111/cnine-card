import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {KEY,ACTION,TITLE,BODY,AMOUNT,START,END,CODES,hash,eligible,identity} from './common.mjs';
export {KEY};
export const PLAN=JSON.parse(readFileSync(new URL('plan.json',import.meta.url)));
export const HASH='bbae37df66c96a45966a34e8d197e9ecbbe6e0ef294e77deb59f62724d3c67c4';
export const IDS=PLAN.recipients.map(r=>r.userId);
const q=async(c,s,a=[])=>(await c.query(s,a)).rows;
const sorted=a=>[...a].sort();
export function validate(){
 assert.equal(hash(PLAN),HASH,'Frozen plan changed');assert.equal(PLAN.operationKey,KEY);
 assert.equal(PLAN.title,TITLE);assert.equal(PLAN.body,BODY);assert.equal(PLAN.delivery,'MESSAGE_ATTACHMENT');assert.equal(PLAN.rewardType,'COIN');
 assert.equal(PLAN.startUtc,START);assert.equal(PLAN.endUtc,END);assert.equal(PLAN.amountPerBuyer,AMOUNT);
 assert.equal(PLAN.recipientCount,21);assert.equal(IDS.length,21);assert.equal(new Set(IDS).size,21);
 assert.equal(PLAN.totalCoin,'21000000000000000');assert.equal(PLAN.recipientHash,hash(PLAN.recipients));
 assert.equal(PLAN.orders.length,40);assert.equal(PLAN.orderCount,40);assert.equal(PLAN.purchaseUnits,98);
 assert.equal(new Set(PLAN.orders.map(o=>o.orderId)).size,40);assert(PLAN.orders.every(o=>CODES.includes(o.productCode)&&IDS.includes(o.userId)));
 assert(PLAN.recipients.every(r=>r.amount===AMOUNT&&r.status==='ACTIVE'));
 assert.equal(new Set(PLAN.recipients.map(r=>r.identityHash)).size,21);
}
validate();
async function checkRecipients(c){
 const all=await q(c,"SELECT key,value FROM app_meta WHERE key LIKE 'support_package_order_v1:%' ORDER BY key");
 const selected=all.map(r=>({...r,order:JSON.parse(r.value)})).filter(r=>eligible(r.order));
 assert.deepEqual(selected.map(r=>({key:r.key,hash:hash(r.value)})),PLAN.orders.map(r=>({key:r.key,hash:r.orderHash})),'Frozen purchase set changed');
 const people=await q(c,'SELECT u.id::text,u.status,u.role,u.coin::text,v.provider,v.provider_user_id FROM users u LEFT JOIN user_second_verifications v ON v.user_id=u.id WHERE u.id=ANY($1::bigint[]) ORDER BY u.id',[IDS]);
 assert.deepEqual(people.map(u=>u.id),IDS);
 for(const u of people){const p=PLAN.recipients.find(r=>r.userId===u.id);assert.equal(identity(u),p.identityHash);assert.equal(u.status,p.status);assert.equal(u.role,p.role);assert(BigInt(u.coin)>=0n&&BigInt(u.coin)+BigInt(AMOUNT)<=9223372036854775807n);}
 const processes=await q(c,'SELECT key,value FROM app_meta WHERE key=ANY($1::text[]) ORDER BY key',[PLAN.orders.map(o=>o.processKey)]);assert.equal(processes.length,40);
 for(const p of processes)assert.equal(hash(p.value),PLAN.orders.find(o=>o.processKey===p.key).processHash);
 const audits=await q(c,'SELECT id::text,action_type,target_id,created_at,before_data,after_data FROM admin_logs WHERE id=ANY($1::bigint[]) ORDER BY id',[PLAN.orders.map(o=>o.auditId)]);assert.equal(audits.length,40);
 for(const a of audits)assert.equal(hash(a),PLAN.orders.find(o=>o.auditId===a.id).auditHash);
 const logs=await q(c,'SELECT id::text,user_id::text,change_amount::text,balance_after::text,reason,created_at FROM coin_logs WHERE id=ANY($1::bigint[]) ORDER BY id',[PLAN.orders.map(o=>o.coinLogId)]);assert.equal(logs.length,40);
 for(const l of logs)assert.equal(hash(l),PLAN.orders.find(o=>o.coinLogId===l.id).coinLogHash);
}
export async function verify(c,receipt,{unclaimed=false}={}){
 validate();assert.equal(receipt.status,'COMPLETED');assert.equal(receipt.operationKey,KEY);assert.equal(receipt.planHash,HASH);
 assert.equal(receipt.delivery,'MESSAGE_ATTACHMENT');assert.deepEqual(receipt.recipientIds,IDS);assert.equal(receipt.recipientHash,PLAN.recipientHash);
 assert.equal(receipt.amountPerBuyer,AMOUNT);assert.equal(receipt.totalCoin,PLAN.totalCoin);assert.equal(receipt.directWalletStatements,0);
 assert.equal(receipt.messageIds.length,21);assert.equal(new Set(receipt.messageIds).size,21);assert.equal(receipt.rewardIds.length,21);assert.equal(new Set(receipt.rewardIds).size,21);
 const rows=await q(c,`SELECT m.id::text mid,m.user_id::text uid,m.campaign_key,m.sender_type,m.title,m.body,m.message_type,m.is_read,m.hidden_at,
 r.id::text rid,r.user_id::text ruid,r.reward_type,r.reward_amount::text amount,r.claimed_at,
 cr.reward_id::text claim_id,cr.message_id::text claim_mid,cr.user_id::text claim_uid,cr.reward_type claim_type,
 cr.reward_amount::text claim_amount,cr.balance_after::text
 FROM user_messages m LEFT JOIN user_message_rewards r ON r.message_id=m.id
 LEFT JOIN user_message_reward_claim_receipts_v1222 cr ON cr.reward_id=r.id
 WHERE m.campaign_key=$1 ORDER BY m.user_id`,[KEY]);
 assert.equal(rows.length,21);assert.deepEqual(rows.map(r=>r.uid),IDS);assert.deepEqual(sorted(rows.map(r=>r.mid)),sorted(receipt.messageIds));assert.deepEqual(sorted(rows.map(r=>r.rid)),sorted(receipt.rewardIds));
 let total=0n,claimed=0;
 for(const r of rows){
  assert.equal(r.uid,r.ruid);assert.equal(r.campaign_key,KEY);assert.equal(r.sender_type,'ADMIN');assert.equal(r.title,TITLE);assert.equal(r.body,BODY);assert.equal(r.message_type,'COIN_REWARD');assert.equal(r.reward_type,'COIN');assert.equal(r.amount,AMOUNT);total+=BigInt(r.amount);
  if(unclaimed){assert.equal(r.claimed_at,null);assert.equal(r.claim_id,null);assert.equal(r.hidden_at,null);assert.equal(Number(r.is_read),0);}
  if(r.claimed_at){assert.equal(r.claim_id,r.rid);assert.equal(r.claim_mid,r.mid);assert.equal(r.claim_uid,r.uid);assert.equal(r.claim_type,'COIN');assert.equal(r.claim_amount,AMOUNT);claimed++;}else assert.equal(r.claim_id,null);
 }
 assert.equal(String(total),PLAN.totalCoin);
 if(claimed){
  const logs=await q(c,'SELECT user_id::text uid,change_amount::text amount,balance_after::text,reason FROM coin_logs WHERE id>$1::bigint AND user_id=ANY($2::bigint[]) AND reason=ANY($3::text[])',[receipt.coinLogFloor,IDS,rows.filter(r=>r.claim_id).map(r=>'MESSAGE_REWARD#'+r.rid)]);
  assert.equal(logs.length,claimed);
  for(const r of rows.filter(r=>r.claim_id)){const match=logs.filter(l=>l.reason==='MESSAGE_REWARD#'+r.rid);assert.equal(match.length,1);assert.equal(match[0].uid,r.uid);assert.equal(match[0].amount,AMOUNT);assert.equal(match[0].balance_after,r.balance_after);}
 }
 if(receipt.auditId){
  const audits=await q(c,'SELECT id::text,admin_id::text,action_type,target_type,target_id,after_data FROM admin_logs WHERE target_id=$1',[KEY]);assert.equal(audits.length,1);
  const a=audits[0];assert.equal(a.id,receipt.auditId);assert.equal(a.admin_id,receipt.adminId);assert.equal(a.action_type,ACTION);assert.equal(a.target_type,'SUPPORT_PACKAGE_BUYERS');
  const {auditId,...saved}=receipt;assert.deepEqual(JSON.parse(a.after_data),saved);
 }
 return {recipients:21,messages:21,rewardAttachments:21,coinPerRecipient:AMOUNT,totalCoin:String(total),claimed,pending:21-claimed,missing:0,duplicates:0,noImmediateWalletCredit:true};
}
// Caller owns a transaction. Only messages, attachments, audit and receipt are written.
export async function send(c,expectedHash){
 validate();const read=async()=>{const [r]=await q(c,'SELECT value FROM app_meta WHERE key=$1',[KEY]);return r?JSON.parse(r.value):null;};
 const completed=await read();if(completed)return {receipt:completed,replayed:true,verification:await verify(c,completed)};
 assert.equal(expectedHash,HASH,'Inspected frozen plan hash required');await c.query('SELECT pg_advisory_xact_lock(hashtextextended($1,0))',[KEY]);
 const saved=await read();if(saved)return {receipt:saved,replayed:true,verification:await verify(c,saved)};
 const [clock]=await q(c,"SELECT to_char(CURRENT_TIMESTAMP AT TIME ZONE 'Asia/Seoul','YYYY-MM-DD') kst,clock_timestamp()::text at");assert.equal(clock.kst,PLAN.dateKST);
 assert.equal((await q(c,'SELECT user_id FROM account_sync_versions_v1 WHERE user_id=ANY($1::bigint[]) ORDER BY user_id::text FOR UPDATE',[IDS])).length,21);
 await checkRecipients(c);
 const [existing]=await q(c,"SELECT COUNT(*)::int n FROM user_messages WHERE campaign_key=$1 OR (title=$2 AND created_at>='2026-10-31 15:00:00')",[KEY,TITLE]);assert.equal(existing.n,0,'Existing purchase-service delivery requires reconciliation');
 assert.equal((await q(c,'SELECT id FROM admin_logs WHERE target_id=$1 OR action_type=$2',[KEY,ACTION])).length,0);
 const required=[['users','coin'],['user_message_rewards','reward_amount'],['user_message_reward_claim_receipts_v1222','reward_amount'],['user_message_reward_claim_receipts_v1222','balance_after'],['coin_logs','change_amount'],['coin_logs','balance_after']];
 const columns=await q(c,"SELECT table_name,column_name,data_type FROM information_schema.columns WHERE table_schema='public' AND table_name=ANY($1::text[])",[[...new Set(required.map(([t])=>t))]]);assert(required.every(([t,col])=>columns.some(r=>r.table_name===t&&r.column_name===col&&r.data_type==='bigint')));
 const [owner]=await q(c,"SELECT id::text FROM users WHERE role='OWNER' AND status='ACTIVE' ORDER BY id LIMIT 1");assert(owner);
 const [{floor}]=await q(c,'SELECT COALESCE(MAX(id),0)::text floor FROM coin_logs');
 const messages=await q(c,`INSERT INTO user_messages(user_id,sender_type,title,body,message_type,campaign_key)
 SELECT uid,'ADMIN',$2,$3,'COIN_REWARD',$4 FROM unnest($1::bigint[]) t(uid) ORDER BY uid RETURNING id::text,user_id::text`,[IDS,TITLE,BODY,KEY]);assert.equal(messages.length,21);
 const rewards=await q(c,`INSERT INTO user_message_rewards(message_id,user_id,reward_type,reward_amount)
 SELECT id,user_id,'COIN',$2::bigint FROM user_messages WHERE campaign_key=$1 ORDER BY user_id RETURNING id::text`,[KEY,AMOUNT]);assert.equal(rewards.length,21);
 const receipt={status:'COMPLETED',operationKey:KEY,planHash:HASH,delivery:'MESSAGE_ATTACHMENT',recipientIds:IDS,recipientHash:PLAN.recipientHash,
 title:TITLE,body:BODY,rewardType:'COIN',amountPerBuyer:AMOUNT,totalCoin:PLAN.totalCoin,messageIds:messages.map(r=>r.id),rewardIds:rewards.map(r=>r.id),
 authorization:PLAN.authorization,startUtc:START,endUtc:END,qualifyingOrderCount:40,purchaseUnits:98,coinLogFloor:floor,
 directWalletStatements:0,noImmediateWalletCredit:true,adminId:owner.id,completedAt:clock.at};
 await verify(c,receipt,{unclaimed:true});await checkRecipients(c);
 const [audit]=await q(c,`INSERT INTO admin_logs(admin_id,action_type,target_type,target_id,before_data,after_data)
 VALUES($1,$2,'SUPPORT_PACKAGE_BUYERS',$3,$4,$5) RETURNING id::text`,[owner.id,ACTION,KEY,JSON.stringify({messages:0,rewards:0,oneTime:true}),JSON.stringify(receipt)]);assert(audit);receipt.auditId=audit.id;
 assert.equal((await c.query('INSERT INTO app_meta(key,value,updated_at) VALUES($1,$2,CURRENT_TIMESTAMP)',[KEY,JSON.stringify(receipt)])).rowCount,1);
 return {receipt,replayed:false,verification:await verify(c,receipt,{unclaimed:true})};
}
