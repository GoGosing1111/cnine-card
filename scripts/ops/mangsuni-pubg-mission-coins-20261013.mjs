import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';

export const OPERATION_KEY='ops:mangsuni-pubg-mission-coins:20261013:v1';
export const CAMPAIGN_KEY='mangsuni-pubg-mission-20261013-v1';
export const ACTION='OPS_MANGSUNI_PUBG_MESSAGE_SEND';
export const TITLE='망순이 배그 미션 기념';
export const BODY='망순이 배그 미션 기념 보상입니다.\n1조 코인을 지급합니다. 메시지의 보상 수령 버튼을 눌러 받아주세요.';
export const AMOUNT='1000000000000';
export const TARGETS=Object.freeze([
 {id:'25',nickname:'여우'}, {id:'88',nickname:'0수표'}, {id:'290',nickname:'Mild7'},
 {id:'1195',nickname:'씨나인택갓'}, {id:'1768',nickname:'핫시'}, {id:'4582',nickname:'족단'},
 {id:'4628',nickname:'망순이ෆ'}, {id:'4817',nickname:'음주'}, {id:'4908',nickname:'굳건창수'}, {id:'5504',nickname:'비_니'}
]);
const digest=rows=>createHash('sha256').update(JSON.stringify(rows)).digest('hex');
export const RECIPIENT_HASH=digest(TARGETS);
const ids=TARGETS.map(t=>t.id),names=TARGETS.map(t=>t.nickname),q=async(c,sql,args=[])=>(await c.query(sql,args)).rows;
const parsed=v=>typeof v==='string'?JSON.parse(v):v;

export async function inspectMissionGift(c){
 const users=await q(c,'SELECT id::text,nickname,status,role FROM users WHERE id=ANY($1::bigint[]) OR nickname=ANY($2::text[]) ORDER BY users.id',[ids,names]);
 assert.equal(users.length,10,'Missing or ambiguous account');
 assert.deepEqual(users.map(({id,nickname})=>({id,nickname})),TARGETS,'Recipient identity changed');
 assert.ok(users.every(u=>u.status==='ACTIVE'&&u.role==='USER'),'Inactive or unexpected recipient');
 const existing=await q(c,`SELECT m.id::text,m.user_id::text,m.campaign_key,r.reward_amount::text
  FROM user_messages m LEFT JOIN user_message_rewards r ON r.message_id=m.id
  WHERE m.campaign_key=$1 OR (m.user_id=ANY($2::bigint[]) AND m.title=$3 AND r.reward_type='COIN' AND r.reward_amount=$4::bigint)`,[CAMPAIGN_KEY,ids,TITLE,AMOUNT]);
 const saved=(await q(c,'SELECT value FROM app_meta WHERE key=$1',[OPERATION_KEY]))[0];
 return {recipients:TARGETS,recipientHash:RECIPIENT_HASH,existing,receipt:saved?parsed(saved.value):null};
}

export async function verifyMissionGift(c,receipt,{unclaimed=false}={}){
 assert.equal(receipt.status,'COMPLETED');assert.equal(receipt.operationKey,OPERATION_KEY);assert.equal(receipt.campaignKey,CAMPAIGN_KEY);
 assert.equal(receipt.recipientHash,RECIPIENT_HASH);assert.deepEqual(receipt.recipients,TARGETS);
 assert.equal(receipt.rewardAmount,AMOUNT);assert.equal(receipt.totalAmount,'10000000000000');assert.equal(receipt.count,10);
 assert.equal(receipt.title,TITLE);assert.equal(receipt.body,BODY);assert.equal(receipt.delivery,'MESSAGE');
 const rows=await q(c,`SELECT m.id::text message_id,m.user_id::text user_id,m.title,m.body,m.sender_type,m.message_type,m.hidden_at,m.is_read,
  r.id::text reward_id,r.user_id::text reward_user_id,r.reward_type,r.reward_amount::text reward_amount,r.claimed_at,
  cr.reward_id::text claim_id,cr.reward_amount::text claim_amount,cr.balance_before::text,cr.balance_after::text
  FROM user_messages m LEFT JOIN user_message_rewards r ON r.message_id=m.id
  LEFT JOIN user_message_reward_claim_receipts_v1222 cr ON cr.reward_id=r.id
  WHERE m.campaign_key=$1 ORDER BY m.user_id,m.id`,[CAMPAIGN_KEY]);
 assert.equal(rows.length,10,'Missing or duplicate reward');assert.deepEqual(rows.map(r=>r.user_id),ids);
 for(const r of rows){
  assert.ok(r.reward_id);assert.equal(r.reward_user_id,r.user_id);assert.equal(r.title,TITLE);assert.equal(r.body,BODY);
  assert.equal(r.sender_type,'ADMIN');assert.equal(r.message_type,'COIN_REWARD');assert.equal(r.reward_type,'COIN');assert.equal(r.reward_amount,AMOUNT);
  if(unclaimed){assert.equal(r.claimed_at,null);assert.equal(r.hidden_at,null);assert.equal(Number(r.is_read),0);}
  if(r.claimed_at){assert.ok(r.claim_id,'Claim receipt missing');assert.equal(r.claim_amount,AMOUNT);assert.equal(BigInt(r.balance_after)-BigInt(r.balance_before),BigInt(AMOUNT));}
  else assert.equal(r.claim_id,null);
 }
 if(receipt.auditId){
  const audits=await q(c,'SELECT id::text,admin_id::text,after_data FROM admin_logs WHERE action_type=$1 AND target_id=$2',[ACTION,OPERATION_KEY]);
  assert.equal(audits.length,1);assert.equal(audits[0].id,receipt.auditId);assert.equal(audits[0].admin_id,'1');
  const {auditId,...audited}=receipt;assert.deepEqual(parsed(audits[0].after_data),audited);
 }
 return {messages:10,rewards:10,totalCoin:'10000000000000',claimed:rows.filter(r=>r.claimed_at).length,missing:0,duplicates:0,rows};
}

// Explicitly authorized one-time inbox delivery. No wallet, inventory or account
// update: the existing atomic message-claim API grants the coin upon collection.
export async function sendMissionGift(c,{expectedRecipientHash,dryRun=false}={}){
 assert.equal(expectedRecipientHash,RECIPIENT_HASH,'Reviewed recipients required');
 await c.query('BEGIN ISOLATION LEVEL REPEATABLE READ');
 try{
  await c.query("SET LOCAL lock_timeout='5s'");await c.query("SET LOCAL statement_timeout='20s'");
  const reserved=await q(c,'INSERT INTO app_meta(key,value,updated_at) VALUES($1,$2,CURRENT_TIMESTAMP) ON CONFLICT(key) DO NOTHING RETURNING key',[OPERATION_KEY,JSON.stringify({status:'PENDING'})]);
  if(!reserved.length){
   const saved=(await q(c,'SELECT value FROM app_meta WHERE key=$1',[OPERATION_KEY]))[0],receipt=parsed(saved.value);
   const verification=await verifyMissionGift(c,receipt);await c.query('ROLLBACK');return {receipt,verification,replayed:true,dryRun};
  }
  await q(c,'SELECT id FROM users WHERE id=ANY($1::bigint[]) ORDER BY id FOR SHARE',[ids]);
  const plan=await inspectMissionGift(c);assert.equal(plan.existing.length,0,'Matching gift already exists');
  const [owner]=await q(c,"SELECT id FROM users WHERE id=1 AND role='OWNER' AND status='ACTIVE'");assert.ok(owner,'Active operator required');
  const messages=await q(c,`INSERT INTO user_messages(user_id,sender_type,title,body,message_type,campaign_key)
   SELECT id,'ADMIN',$2,$3,'COIN_REWARD',$4 FROM unnest($1::bigint[]) AS id ORDER BY id RETURNING id`,[ids,TITLE,BODY,CAMPAIGN_KEY]);assert.equal(messages.length,10,'Partial message insert');
  const rewards=await q(c,`INSERT INTO user_message_rewards(message_id,user_id,reward_type,reward_amount)
   SELECT id,user_id,'COIN',$2::bigint FROM user_messages WHERE campaign_key=$1 ORDER BY user_id RETURNING id`,[CAMPAIGN_KEY,AMOUNT]);assert.equal(rewards.length,10,'Partial reward insert');
  const receipt={status:'COMPLETED',operationKey:OPERATION_KEY,campaignKey:CAMPAIGN_KEY,recipientHash:RECIPIENT_HASH,recipients:TARGETS,
   count:10,rewardType:'COIN',rewardAmount:AMOUNT,totalAmount:'10000000000000',title:TITLE,body:BODY,delivery:'MESSAGE',actor:'SYSTEM_OPS',
   authorization:'굳건창수·족단·0수표·음주·Mild7·핫시·씨나인택갓·여우·비_니·망순이ෆ 명단에 망순이 배그 미션 기념 1조코인씩 메시지 지급',completedAt:new Date().toISOString()};
  const audit=await q(c,`INSERT INTO admin_logs(admin_id,action_type,target_type,target_id,before_data,after_data)
   VALUES($1,$2,'USER_MESSAGE',$3,$4,$5) RETURNING id::text`,[owner.id,ACTION,OPERATION_KEY,JSON.stringify({existingMessages:0}),JSON.stringify(receipt)]);assert.equal(audit.length,1,'Audit missing');receipt.auditId=audit[0].id;
  assert.equal((await q(c,'UPDATE app_meta SET value=$2,updated_at=CURRENT_TIMESTAMP WHERE key=$1 RETURNING key',[OPERATION_KEY,JSON.stringify(receipt)])).length,1,'Receipt missing');
  const verification=await verifyMissionGift(c,receipt,{unclaimed:true});
  await c.query(dryRun?'ROLLBACK':'COMMIT');return {receipt,verification,dryRun,replayed:false};
 }catch(error){await c.query('ROLLBACK').catch(()=>{});throw error;}
}
