import fs from 'node:fs';
import assert from 'node:assert/strict';
import {KEY,ACTION,TITLE,BODY,hash,counts,identities,eligible} from './notice-common.mjs';
export {KEY};
export const PLAN=JSON.parse(fs.readFileSync(new URL('./notice-plan.json',import.meta.url)));
export const HASH=JSON.parse(fs.readFileSync(new URL('./notice-plan-hash.json',import.meta.url))).planHash;
export const IDS=PLAN.recipients.map(r=>r.userId).sort((a,b)=>Number(a)-Number(b));
const q=async(c,s,a=[])=>(await c.query(s,a)).rows;
function validate(){
 assert.equal(hash(PLAN),HASH);assert.equal(PLAN.operationKey,KEY);assert.equal(PLAN.title,TITLE);assert.equal(PLAN.body,BODY);assert.equal(PLAN.messageType,'SYSTEM');assert.equal(PLAN.rewardAttachments,0);
 assert.equal(PLAN.recipientCount,IDS.length);assert.equal(new Set(IDS).size,IDS.length);assert.equal(new Set(PLAN.recipients.map(r=>r.identityHash)).size,IDS.length);assert(PLAN.recipients.every(r=>r.status==='ACTIVE'));
 assert.equal(hash(identities(PLAN.recipients)),PLAN.recipientHash);assert.deepEqual(counts(PLAN.recipients,'role'),PLAN.roleCounts);assert.deepEqual(counts(PLAN.recipients,'provider'),PLAN.providerCounts);
}
validate();
const checkRecipients=async c=>assert.equal(hash(identities(await eligible(c))),PLAN.recipientHash,'Active season-pass purchaser list changed');
export async function receipt(c){const [r]=await q(c,'SELECT value FROM app_meta WHERE key=$1',[KEY]);return r?JSON.parse(r.value):null;}
export async function verify(c,r,{unread=false}={}){
 validate();assert.equal(r.status,'COMPLETED');assert.equal(r.operationKey,KEY);assert.equal(r.planHash,HASH);assert.deepEqual(r.recipientIds,IDS);assert.equal(r.title,TITLE);assert.equal(r.body,BODY);assert.equal(r.rewardAttachments,0);
 const rows=await q(c,'SELECT id::text,user_id::text,sender_type,title,body,message_type,campaign_key,is_read,hidden_at FROM user_messages WHERE campaign_key=$1 ORDER BY user_messages.user_id',[KEY]);
 assert.equal(rows.length,IDS.length);assert.deepEqual(rows.map(r=>r.user_id),IDS);assert.deepEqual(rows.map(r=>r.id),r.messageIds);
 for(const m of rows){assert.equal(m.sender_type,'ADMIN');assert.equal(m.title,TITLE);assert.equal(m.body,BODY);assert.equal(m.message_type,'SYSTEM');assert.equal(m.campaign_key,KEY);if(unread){assert.equal(Number(m.is_read),0);assert.equal(m.hidden_at,null);}}
 assert.equal((await q(c,'SELECT r.id FROM user_message_rewards r JOIN user_messages m ON m.id=r.message_id WHERE m.campaign_key=$1',[KEY])).length,0);
 if(r.auditId){const a=await q(c,'SELECT id::text,action_type,admin_id::text,after_data FROM admin_logs WHERE target_id=$1',[KEY]);assert.equal(a.length,1);assert.equal(a[0].id,r.auditId);assert.equal(a[0].action_type,ACTION);assert.equal(a[0].admin_id,r.adminId);const {auditId,...payload}=r;assert.deepEqual(JSON.parse(a[0].after_data),payload);}
 return {recipients:IDS.length,messages:rows.length,rewardAttachments:0,missing:0,duplicates:0,read:rows.filter(r=>Number(r.is_read)===1).length};
}
export async function send(c,approvedHash){
 validate();const previous=await receipt(c);if(previous)return {replayed:true,receipt:previous,verification:await verify(c,previous)};
 assert.equal(approvedHash,HASH,'Reviewed plan required');await q(c,'SELECT pg_advisory_xact_lock(hashtextextended($1,0))',[KEY]);
 const saved=await receipt(c);if(saved)return {replayed:true,receipt:saved,verification:await verify(c,saved)};
 const [time]=await q(c,"SELECT to_char(CURRENT_TIMESTAMP AT TIME ZONE 'Asia/Seoul','YYYY-MM-DD') kst,CURRENT_TIMESTAMP < TIMESTAMPTZ '2026-11-03 00:00:00+09' open");assert.equal(time.kst,PLAN.dateKST);assert.equal(time.open,true);
 assert.equal((await q(c,'SELECT user_id FROM account_sync_versions_v1 WHERE user_id=ANY($1::bigint[]) ORDER BY user_id::text FOR UPDATE',[IDS])).length,IDS.length);
 await checkRecipients(c);
 assert.equal((await q(c,'SELECT id FROM user_messages WHERE campaign_key=$1 OR title=$2 OR body=$3',[KEY,TITLE,BODY])).length,0,'Duplicate/orphan message');
 assert.equal((await q(c,'SELECT id FROM admin_logs WHERE target_id=$1 OR action_type=$2',[KEY,ACTION])).length,0,'Prior audit');
 const owner=await q(c,"SELECT id::text FROM users WHERE id=1 AND role='OWNER' AND status='ACTIVE'");assert.equal(owner.length,1);
 const messages=await q(c,"INSERT INTO user_messages(user_id,sender_type,title,body,message_type,campaign_key) SELECT uid,'ADMIN',$2,$3,'SYSTEM',$4 FROM unnest($1::bigint[]) t(uid) ORDER BY uid RETURNING id::text,user_id::text",[IDS,TITLE,BODY,KEY]);assert.equal(messages.length,IDS.length);
 messages.sort((a,b)=>Number(a.user_id)-Number(b.user_id));
 const r={status:'COMPLETED',operationKey:KEY,planHash:HASH,recipientIds:IDS,recipientHash:PLAN.recipientHash,messageIds:messages.map(m=>m.id),title:TITLE,body:BODY,rewardAttachments:0,roleCounts:PLAN.roleCounts,providerCounts:PLAN.providerCounts,authorization:PLAN.authorization,liveDeployment:PLAN.liveDeployment,adminId:owner[0].id,completedAt:new Date().toISOString()};
 await verify(c,r,{unread:true});await checkRecipients(c);
 const [audit]=await q(c,"INSERT INTO admin_logs(admin_id,action_type,target_type,target_id,before_data,after_data) VALUES(1,$1,'ACTIVE_SEASON_PASS_PURCHASERS',$2,$3,$4) RETURNING id::text",[ACTION,KEY,JSON.stringify({messages:0,rewardAttachments:0}),JSON.stringify(r)]);assert(audit);r.auditId=audit.id;
 assert.equal((await c.query('INSERT INTO app_meta(key,value,updated_at) VALUES($1,$2,CURRENT_TIMESTAMP)',[KEY,JSON.stringify(r)])).rowCount,1);
 return {replayed:false,receipt:r,verification:await verify(c,r,{unread:true})};
}
