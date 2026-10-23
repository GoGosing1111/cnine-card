import assert from 'node:assert/strict';
import fs from 'node:fs';
import {createHash} from 'node:crypto';
export const PLAN=JSON.parse(fs.readFileSync(new URL('./plan.json',import.meta.url),'utf8'));
export const OP=PLAN.operationKey,ACTION='OPS_HEEYA_MISSION_VERIFIED_COIN_MESSAGES';
const hash=v=>createHash('sha256').update(JSON.stringify(v)).digest('hex');
export const HASH=hash(PLAN);
const q=async(c,sql,args=[])=>(await c.query(sql,args)).rows;
const one=rows=>(assert.equal(rows.length,1,'Expected exactly one row'),rows[0]);
const parse=v=>typeof v==='string'?JSON.parse(v):v;
const ids=PLAN.recipients.map(r=>r.userId),identity=rows=>rows.map(({userId,role,provider,identityHash})=>({userId,role,provider,identityHash}));
export async function recipients(c,{lock=false}={}){
 const rows=await q(c,`SELECT u.id::text AS "userId",u.nickname,u.role,u.status,u.coin::text,s.provider,s.provider_user_id FROM users u JOIN user_second_verifications s ON s.user_id=u.id WHERE UPPER(TRIM(COALESCE(u.status,'ACTIVE')))='ACTIVE' ORDER BY u.id ${lock?'FOR SHARE OF u,s':''}`);
 return rows.map(({provider_user_id,...r})=>({...r,identityHash:hash({provider:r.provider,providerUserId:provider_user_id})}));
}
export async function receipt(c){const rows=await q(c,'SELECT value FROM app_meta WHERE key=$1',[OP]);return rows.length?parse(one(rows).value):null;}
export async function artifacts(c){return one(await q(c,`SELECT
 (SELECT COUNT(*)::text FROM user_messages WHERE campaign_key=$1) AS messages,
 (SELECT COUNT(*)::text FROM user_message_rewards r JOIN user_messages m ON m.id=r.message_id WHERE m.campaign_key=$1) AS rewards,
 (SELECT COUNT(*)::text FROM admin_logs WHERE action_type=$2 AND target_id=$1) AS audits,
 (SELECT COUNT(*)::text FROM app_meta WHERE key=$1) AS receipts`,[OP,ACTION]));}
export async function balances(c){return q(c,'SELECT id::text,coin::text,card_shards::text,magic_crystals::text FROM users WHERE id=ANY($1::bigint[]) ORDER BY id',[ids]);}
export async function verify(c,r,{unclaimed=false}={}){
 assert.equal(r.status,'COMPLETED');assert.equal(r.actor,'CODEX_OPERATIONS');assert.equal(r.operationKey,OP);assert.equal(r.planHash,HASH);assert.deepEqual(r.plan,PLAN);assert.equal(r.messages.length,PLAN.recipientCount);
 const rows=await q(c,`SELECT m.id::text AS "messageId",m.user_id::text AS "userId",m.sender_type,m.title,m.body,m.message_type,m.campaign_key,m.is_read,m.hidden_at,r.id::text AS "rewardId",r.user_id::text AS "rewardUserId",r.reward_type,r.reward_amount::text AS amount,r.claimed_at FROM user_messages m LEFT JOIN user_message_rewards r ON r.message_id=m.id WHERE m.campaign_key=$1 ORDER BY m.user_id`,[OP]);
 assert.deepEqual(rows.map(x=>x.userId),ids);assert.equal(new Set(rows.map(x=>x.messageId)).size,ids.length);assert.equal(new Set(rows.map(x=>x.rewardId)).size,ids.length);
 const saved=new Map(r.messages.map(m=>[m.userId,m]));let total=0n;
 for(const row of rows){const m=saved.get(row.userId);assert(m);assert.equal(row.messageId,m.messageId);assert.equal(row.rewardId,m.rewardId);assert.equal(row.rewardUserId,row.userId);assert.equal(row.sender_type,'ADMIN');assert.equal(row.title,PLAN.title);assert.equal(row.body,PLAN.body);assert.equal(row.message_type,'COIN_REWARD');assert.equal(row.reward_type,'COIN');assert.equal(row.amount,PLAN.coinPerRecipient);if(unclaimed){assert.equal(row.claimed_at,null);assert.equal(Number(row.is_read),0);assert.equal(row.hidden_at,null);}total+=BigInt(row.amount);}
 assert.equal(String(total),PLAN.totalCoin);assert.equal(r.directWalletStatements,0);
 const audit=one(await q(c,'SELECT id::text,admin_id::text,after_data FROM admin_logs WHERE action_type=$1 AND target_id=$2',[ACTION,OP]));assert.equal(audit.id,r.auditId);assert.equal(audit.admin_id,r.adminId);const {auditId,...logged}=r;assert.deepEqual(parse(audit.after_data),logged);
 return {status:'VERIFIED',recipients:ids.length,messages:rows.length,rewardAttachments:rows.length,coinPerRecipient:PLAN.coinPerRecipient,totalCoin:String(total),missing:0,duplicates:0,claimed:rows.filter(x=>x.claimed_at).length,noImmediateWalletCredit:true};
}
// Caller owns one transaction. Mail, attached rewards, audit and receipt commit together.
export async function send(c,expected){
 assert.equal(expected,HASH);assert.equal(OP,'ops:heeya-mission-success-verified-coins:20261023:v1');assert.equal(PLAN.title,'희야 미션 성공 보상');assert.equal(PLAN.coinPerRecipient,'30000000000000');assert.equal(PLAN.delivery,'MESSAGE_ATTACHMENT');assert.equal(PLAN.recipientCount,ids.length);assert.equal(new Set(ids).size,ids.length);assert.equal(PLAN.totalCoin,String(BigInt(PLAN.coinPerRecipient)*BigInt(ids.length)));
 const prior=await receipt(c);if(prior)return {replayed:true,receipt:prior,verification:await verify(c,prior)};
 await q(c,'SELECT pg_advisory_xact_lock(hashtextextended($1,0))',[OP]);
 const saved=await receipt(c);if(saved)return {replayed:true,receipt:saved,verification:await verify(c,saved)};
 for(const n of Object.values(await artifacts(c)))assert.equal(n,'0','Orphan campaign records');
 const columns=await q(c,"SELECT data_type FROM information_schema.columns WHERE table_schema='public' AND ((table_name='users' AND column_name='coin') OR (table_name='user_message_rewards' AND column_name='reward_amount') OR (table_name='user_message_reward_claim_receipts_v1222' AND column_name IN ('reward_amount','balance_after')) OR (table_name='coin_logs' AND column_name IN ('change_amount','balance_after')))");
 assert.equal(columns.length,6);assert(columns.every(r=>r.data_type==='bigint'));
 const people=await recipients(c);assert.deepEqual(identity(people),identity(PLAN.recipients),'Eligible roster changed; refresh the plan before sending');
 for(const u of people)assert(BigInt(u.coin)>=0n&&BigInt(u.coin)+BigInt(PLAN.coinPerRecipient)<=BigInt(Number.MAX_SAFE_INTEGER));
 const owner=one(await q(c,"SELECT id::text FROM users WHERE role='OWNER' AND status='ACTIVE' ORDER BY id LIMIT 1"));
 const now=new Date().toISOString();
 const messages=await q(c,`INSERT INTO user_messages(user_id,sender_type,title,body,message_type,campaign_key,created_at) SELECT uid,'ADMIN',$2,$3,'COIN_REWARD',$4,$5 FROM unnest($1::bigint[]) x(uid) ORDER BY uid RETURNING id::text AS "messageId",user_id::text AS "userId"`,[ids,PLAN.title,PLAN.body,OP,now]);assert.equal(messages.length,ids.length);
 const rewards=await q(c,`INSERT INTO user_message_rewards(message_id,user_id,reward_type,reward_amount) SELECT id,user_id,'COIN',$2::bigint FROM user_messages WHERE campaign_key=$1 ORDER BY user_id RETURNING id::text AS "rewardId",message_id::text AS "messageId",user_id::text AS "userId"`,[OP,PLAN.coinPerRecipient]);assert.equal(rewards.length,ids.length);
 const rewardByMessage=new Map(rewards.map(r=>[r.messageId,r]));for(const m of messages){const r=rewardByMessage.get(m.messageId);assert.equal(r.userId,m.userId);m.rewardId=r.rewardId;}messages.sort((a,b)=>Number(a.userId)-Number(b.userId));
 const r={status:'COMPLETED',actor:'CODEX_OPERATIONS',operationKey:OP,planHash:HASH,plan:PLAN,completedAt:now,eligibilityConfirmedAt:now,adminId:owner.id,messages,directWalletStatements:0,noImmediateWalletCredit:true};
 r.auditId=one(await q(c,"INSERT INTO admin_logs(admin_id,action_type,target_type,target_id,before_data,after_data) VALUES($1,$2,'VERIFIED_USERS',$3,$4,$5) RETURNING id::text",[owner.id,ACTION,OP,JSON.stringify({actor:'CODEX_OPERATIONS',operationKey:OP,messagesBefore:0,rewardsBefore:0}),JSON.stringify(r)])).id;
 one(await q(c,'INSERT INTO app_meta(key,value,updated_at) VALUES($1,$2,$3) RETURNING key',[OP,JSON.stringify(r),now]));
 return {replayed:false,receipt:r,verification:await verify(c,r,{unclaimed:true})};
}
