import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';

export const OP='ops:pldi-highest-rank-verified-30t-message:20261026:v1';
export const ACTION='OPS_PLDI_HIGHEST_RANK_VERIFIED_COIN_MESSAGES';
export const TITLE='피로 달성한 플디 최고계급 기념';
export const BODY='피로 달성한 플디 최고계급을 기념하여 2차 인증을 완료하신 유저 여러분께 30조 코인을 드립니다. 메시지함에서 보상을 수령해 주세요.';
export const AMOUNT='30000000000000';
export const hash=value=>createHash('sha256').update(JSON.stringify(value)).digest('hex');
const q=async(c,sql,args=[])=>(await c.query(sql,args)).rows;
const one=rows=>(assert.equal(rows.length,1,'Expected one row'),rows[0]);
const parse=value=>typeof value==='string'?JSON.parse(value):value;

export async function receipt(c){const rows=await q(c,'SELECT value FROM app_meta WHERE key=$1',[OP]);return rows.length?parse(one(rows).value):null;}
export async function artifacts(c){return one(await q(c,`SELECT
 (SELECT COUNT(*)::int FROM user_messages WHERE campaign_key=$1) AS messages,
 (SELECT COUNT(*)::int FROM user_message_rewards r JOIN user_messages m ON m.id=r.message_id WHERE m.campaign_key=$1) AS rewards,
 (SELECT COUNT(*)::int FROM admin_logs WHERE action_type=$2 AND target_id=$1) AS audits,
 (SELECT COUNT(*)::int FROM app_meta WHERE key=$1) AS receipts,
 (SELECT COUNT(*)::int FROM user_messages WHERE title=$3 OR body LIKE $4) AS "matchingMessages",
 (SELECT COUNT(*)::int FROM coin_logs WHERE created_at>='2026-10-25 15:00:00' AND (reason=$3 OR reason LIKE $4)) AS "matchingCoinLogs"`,[OP,ACTION,TITLE,'%피로 달성한 플디 최고계급%']));}
export async function inspect(c){
 const rows=await q(c,`SELECT u.id::text AS "userId",UPPER(TRIM(COALESCE(u.role,'USER'))) AS role,
 u.coin::text AS coin,s.provider,s.provider_user_id FROM users u JOIN user_second_verifications s ON s.user_id=u.id
 WHERE UPPER(TRIM(COALESCE(u.status,'ACTIVE')))='ACTIVE' ORDER BY u.id`);
 assert.ok(rows.length>0&&rows.length<=5000,'Unexpected recipient count');
 assert.equal(new Set(rows.map(r=>r.userId)).size,rows.length,'Duplicate verified identity');
 const recipients=rows.map(({userId,role,provider,provider_user_id})=>({userId,role,provider,identityHash:hash({provider,providerUserId:provider_user_id})}));
 const counts=key=>recipients.reduce((a,r)=>(a[r[key]]=(a[r[key]]||0)+1,a),{});
 return {operationKey:OP,title:TITLE,body:BODY,delivery:'MESSAGE_ATTACHMENT',coinPerRecipient:AMOUNT,
  authorization:'2차인증유저 전체 30조 메세지 지급 / 피로 달성한 플디 최고계급 기념',
  eligibility:'All ACTIVE accounts in user_second_verifications, including verified USER, ADMIN and OWNER; all providers',
  recipientCount:recipients.length,totalCoin:String(BigInt(AMOUNT)*BigInt(recipients.length)),recipientHash:hash(recipients),recipients,
  roles:counts('role'),providers:counts('provider'),
  unsafeBalances:rows.filter(r=>BigInt(r.coin)<0n||BigInt(r.coin)+BigInt(AMOUNT)>BigInt(Number.MAX_SAFE_INTEGER)).length,
  statusCounts:await q(c,"SELECT UPPER(TRIM(COALESCE(u.status,'ACTIVE'))) AS status,COUNT(*)::int AS count FROM users u WHERE EXISTS(SELECT 1 FROM user_second_verifications s WHERE s.user_id=u.id) GROUP BY 1 ORDER BY 1"),
  inspectedAt:one(await q(c,'SELECT clock_timestamp()::text AS at')).at};
}
export function validatePlan(plan,expectedHash){
 assert.equal(expectedHash,hash(plan),'Reviewed plan hash mismatch');assert.equal(plan.operationKey,OP);
 assert.equal(plan.title,TITLE);assert.equal(plan.body,BODY);assert.equal(plan.delivery,'MESSAGE_ATTACHMENT');
 assert.equal(plan.coinPerRecipient,AMOUNT);assert.equal(plan.unsafeBalances,0);assert.ok(plan.recipientCount>0&&plan.recipientCount<=5000);
 assert.equal(plan.recipientCount,plan.recipients.length);assert.equal(new Set(plan.recipients.map(r=>r.userId)).size,plan.recipientCount);
 assert.equal(plan.recipientHash,hash(plan.recipients));assert.equal(plan.totalCoin,String(BigInt(AMOUNT)*BigInt(plan.recipientCount)));
}
export async function verify(c,r,plan,{unclaimed=false}={}){
 validatePlan(plan,r.planHash);assert.equal(r.status,'COMPLETED');assert.equal(r.operationKey,OP);assert.deepEqual(r.plan,plan);
 const rows=await q(c,`SELECT m.id::text AS "messageId",m.user_id::text AS "userId",m.sender_type,m.title,m.body,m.message_type,
 m.is_read,m.hidden_at,r.id::text AS "rewardId",r.user_id::text AS "rewardUserId",r.reward_type,r.reward_amount::text AS amount,r.claimed_at
 FROM user_messages m LEFT JOIN user_message_rewards r ON r.message_id=m.id WHERE m.campaign_key=$1 ORDER BY m.user_id`,[OP]);
 assert.deepEqual(rows.map(x=>x.userId),plan.recipients.map(x=>x.userId),'Missing or duplicate recipient');
 assert.equal(new Set(rows.map(x=>x.messageId)).size,plan.recipientCount);assert.equal(new Set(rows.map(x=>x.rewardId)).size,plan.recipientCount);
 assert.equal(r.messages.length,plan.recipientCount);const saved=new Map(r.messages.map(m=>[m.userId,m]));let total=0n;
 for(const row of rows){const m=saved.get(row.userId);assert.ok(m&&row.rewardId);assert.equal(row.messageId,m.messageId);assert.equal(row.rewardId,m.rewardId);
  assert.equal(row.rewardUserId,row.userId);assert.equal(row.sender_type,'ADMIN');assert.equal(row.title,TITLE);assert.equal(row.body,BODY);
  assert.equal(row.message_type,'COIN_REWARD');assert.equal(row.reward_type,'COIN');assert.equal(row.amount,AMOUNT);total+=BigInt(row.amount);
  if(unclaimed){assert.equal(row.claimed_at,null);assert.equal(Number(row.is_read),0);assert.equal(row.hidden_at,null);}}
 assert.equal(String(total),plan.totalCoin);assert.equal(r.directWalletStatements,0);
 const a=one(await q(c,'SELECT id::text,admin_id::text,after_data FROM admin_logs WHERE action_type=$1 AND target_id=$2',[ACTION,OP]));
 assert.equal(a.id,r.auditId);assert.equal(a.admin_id,r.adminId);const {auditId,...logged}=r;assert.deepEqual(parse(a.after_data),logged);
 return {status:'VERIFIED',recipients:rows.length,messages:rows.length,rewards:rows.length,coinPerRecipient:AMOUNT,totalCoin:String(total),
  missing:0,duplicates:0,claimed:rows.filter(x=>x.claimed_at).length,auditId:r.auditId,noImmediateWalletCredit:true};
}

// Caller owns one transaction. No runtime imports, direct wallet changes or auto-claims.
export async function send(c,plan,expectedHash){
 validatePlan(plan,expectedHash);
 const prior=await receipt(c);if(prior)return {replayed:true,receipt:prior,verification:await verify(c,prior,plan)};
 await q(c,'SELECT pg_advisory_xact_lock(hashtextextended($1,0))',[OP]);
 const saved=await receipt(c);if(saved)return {replayed:true,receipt:saved,verification:await verify(c,saved,plan)};
 for(const n of Object.values(await artifacts(c)))assert.equal(n,0,'Prior campaign records require reconciliation');
 const columns=await q(c,"SELECT data_type FROM information_schema.columns WHERE table_schema='public' AND ((table_name='users' AND column_name='coin') OR (table_name='user_message_rewards' AND column_name='reward_amount') OR (table_name='user_message_reward_claim_receipts_v1222' AND column_name IN ('reward_amount','balance_after')) OR (table_name='coin_logs' AND column_name IN ('change_amount','balance_after')))");
 assert.equal(columns.length,6);assert.ok(columns.every(r=>r.data_type==='bigint'),'Coin storage must be BIGINT');
 const current=await inspect(c);assert.deepEqual(current.recipients,plan.recipients,'Eligibility changed; inspect a new plan');assert.equal(current.unsafeBalances,0);
 const owner=one(await q(c,"SELECT id::text FROM users WHERE UPPER(TRIM(role))='OWNER' AND UPPER(TRIM(status))='ACTIVE' ORDER BY id LIMIT 1"));
 const ids=plan.recipients.map(r=>r.userId),now=new Date().toISOString();
 const messages=await q(c,`INSERT INTO user_messages(user_id,sender_type,title,body,message_type,campaign_key,created_at)
  SELECT uid,'ADMIN',$2,$3,'COIN_REWARD',$4,$5 FROM unnest($1::bigint[]) x(uid) ORDER BY uid RETURNING id::text AS "messageId",user_id::text AS "userId"`,[ids,TITLE,BODY,OP,now]);
 assert.equal(messages.length,ids.length);
 const rewards=await q(c,`INSERT INTO user_message_rewards(message_id,user_id,reward_type,reward_amount)
  SELECT id,user_id,'COIN',$2::bigint FROM user_messages WHERE campaign_key=$1 ORDER BY user_id
  RETURNING id::text AS "rewardId",message_id::text AS "messageId",user_id::text AS "userId"`,[OP,AMOUNT]);assert.equal(rewards.length,ids.length);
 const rewardMap=new Map(rewards.map(r=>[r.messageId,r]));for(const m of messages){const r=rewardMap.get(m.messageId);assert.equal(r.userId,m.userId);m.rewardId=r.rewardId;}messages.sort((a,b)=>Number(a.userId)-Number(b.userId));
 const result={status:'COMPLETED',actor:'CODEX_OPERATIONS',operationKey:OP,planHash:expectedHash,plan,completedAt:now,
  eligibilityConfirmedAt:current.inspectedAt,adminId:owner.id,messages,directWalletStatements:0,noImmediateWalletCredit:true};
 result.auditId=one(await q(c,"INSERT INTO admin_logs(admin_id,action_type,target_type,target_id,before_data,after_data) VALUES($1,$2,'VERIFIED_USERS',$3,$4,$5) RETURNING id::text",[owner.id,ACTION,OP,JSON.stringify({messagesBefore:0,rewardsBefore:0}),JSON.stringify(result)])).id;
 one(await q(c,'INSERT INTO app_meta(key,value,updated_at) VALUES($1,$2,$3) RETURNING key',[OP,JSON.stringify(result),now]));
 return {replayed:false,receipt:result,verification:await verify(c,result,plan,{unclaimed:true})};
}
