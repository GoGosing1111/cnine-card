import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';

export const PLAN=JSON.parse(readFileSync(new URL('./playdk-board-heroes-20261014-plan.json',import.meta.url),'utf8'));
export const OPERATION_KEY='ops:playdk-board-heroes-top30:20261014:v1';
export const CAMPAIGN_KEY='playdk-board-heroes-top30-20261014-v1';
export const ACTION='OPS_PLAYDK_BOARD_HEROES_MESSAGE_SEND';
export const TITLE='갤을 지키는 용사 보상';
export const BODY='숲켓몬 게시판을 꾸준히 지켜 주신 용사님께 감사드립니다.\n\n2026년 10월 14일 집계한 DK 숲켓몬 게시판 전체 기간 글 작성 상위 30명에게 5조 코인을 드립니다.\n\n아래 보상 수령 버튼을 눌러 받아 주세요. 앞으로도 함께해 주세요!';
export const AMOUNT='5000000000000';
export const TOTAL='150000000000000';
export const TARGETS=PLAN.recipients;
export const RECIPIENT_HASH=createHash('sha256').update(JSON.stringify(TARGETS)).digest('hex');
const ids=TARGETS.map(t=>t.id).sort((a,b)=>Number(a)-Number(b));
const sortedTargets=[...TARGETS].sort((a,b)=>Number(a.id)-Number(b.id));
const q=async(c,sql,args=[])=>(await c.query(sql,args)).rows;
const parsed=v=>typeof v==='string'?JSON.parse(v):v;
const identity=t=>({id:t.id,nickname:t.nickname,providerUuid:t.providerUuid,role:t.role});
assert.equal(PLAN.operationKey,OPERATION_KEY);assert.equal(PLAN.campaignKey,CAMPAIGN_KEY);assert.equal(PLAN.title,TITLE);
assert.equal(PLAN.amount,AMOUNT);assert.equal(PLAN.totalAmount,TOTAL);assert.equal(TARGETS.length,30);
assert.equal(new Set(ids).size,30);assert.equal(new Set(TARGETS.map(t=>t.providerUuid)).size,30);
assert.deepEqual(TARGETS.map(t=>t.rank),Array.from({length:30},(_,i)=>i+1));
assert.equal(String(BigInt(AMOUNT)*30n),TOTAL);

export async function inspectHeroesGift(c,{lock=false}={}){
 const users=await q(c,`SELECT u.id::text,u.nickname,u.status,u.role,s.provider_user_id AS "providerUuid"
  FROM users u JOIN user_second_verifications s ON s.user_id=u.id AND s.provider='PLAYDK'
  WHERE u.id=ANY($1::bigint[]) OR s.provider_user_id=ANY($2::text[]) ORDER BY u.id${lock?' FOR SHARE OF u,s':''}`,
  [ids,TARGETS.map(t=>t.providerUuid)]);
 assert.equal(users.length,30,'Missing or ambiguous verified account');
 assert.deepEqual(users.map(identity),sortedTargets.map(identity),'Recipient identity changed');
 assert.ok(users.every(u=>u.status==='ACTIVE'),'Inactive recipient');
 const existing=await q(c,`SELECT m.id::text,m.user_id::text,m.campaign_key FROM user_messages m
  WHERE m.campaign_key=$1 OR (m.user_id=ANY($2::bigint[]) AND m.title=$3)`,[CAMPAIGN_KEY,ids,TITLE]);
 const saved=(await q(c,'SELECT value FROM app_meta WHERE key=$1',[OPERATION_KEY]))[0];
 return {recipientCount:users.length,recipientHash:RECIPIENT_HASH,existing,receipt:saved?parsed(saved.value):null};
}

export async function verifyHeroesGift(c,receipt,{unclaimed=false}={}){
 assert.equal(receipt.status,'COMPLETED');assert.equal(receipt.operationKey,OPERATION_KEY);assert.equal(receipt.campaignKey,CAMPAIGN_KEY);
 assert.equal(receipt.recipientHash,RECIPIENT_HASH);assert.deepEqual(receipt.recipients,TARGETS);
 assert.equal(receipt.rewardAmount,AMOUNT);assert.equal(receipt.totalAmount,TOTAL);assert.equal(receipt.count,30);
 assert.equal(receipt.title,TITLE);assert.equal(receipt.body,BODY);assert.equal(receipt.delivery,'MESSAGE');
 assert.equal(receipt.sourceFileSha256,PLAN.sourceFileSha256);assert.equal(receipt.sourceCutoff,PLAN.sourceCutoff);
 const rows=await q(c,`SELECT m.id::text message_id,m.user_id::text user_id,m.title,m.body,m.sender_type,m.message_type,m.hidden_at,m.is_read,
  r.id::text reward_id,r.user_id::text reward_user_id,r.reward_type,r.reward_amount::text reward_amount,r.claimed_at,
  cr.reward_id::text claim_id,cr.message_id::text claim_message_id,cr.user_id::text claim_user_id,cr.reward_type claim_type,
  cr.reward_amount::text claim_amount,cr.balance_before::text,cr.balance_after::text
  FROM user_messages m LEFT JOIN user_message_rewards r ON r.message_id=m.id
  LEFT JOIN user_message_reward_claim_receipts_v1222 cr ON cr.reward_id=r.id
  WHERE m.campaign_key=$1 ORDER BY m.user_id,m.id`,[CAMPAIGN_KEY]);
 assert.equal(rows.length,30,'Missing or duplicate reward');assert.deepEqual(rows.map(r=>r.user_id),ids);
 for(const r of rows){
  assert.ok(r.reward_id);assert.equal(r.reward_user_id,r.user_id);assert.equal(r.title,TITLE);assert.equal(r.body,BODY);
  assert.equal(r.sender_type,'ADMIN');assert.equal(r.message_type,'COIN_REWARD');assert.equal(r.reward_type,'COIN');assert.equal(r.reward_amount,AMOUNT);
  if(unclaimed){assert.equal(r.claimed_at,null);assert.equal(r.hidden_at,null);assert.equal(Number(r.is_read),0);}
  if(r.claimed_at){
   assert.ok(r.claim_id,'Claim receipt missing');assert.equal(r.claim_message_id,r.message_id);assert.equal(r.claim_user_id,r.user_id);
   assert.equal(r.claim_type,'COIN');assert.equal(r.claim_amount,AMOUNT);assert.equal(BigInt(r.balance_after)-BigInt(r.balance_before),BigInt(AMOUNT));
  }else assert.equal(r.claim_id,null);
 }
 assert.deepEqual(rows.map(r=>r.message_id),receipt.messageIds);assert.deepEqual(rows.map(r=>r.reward_id),receipt.rewardIds);
 if(receipt.auditId){
  const audits=await q(c,'SELECT id::text,admin_id::text,after_data FROM admin_logs WHERE action_type=$1 AND target_id=$2',[ACTION,OPERATION_KEY]);
  assert.equal(audits.length,1);assert.equal(audits[0].id,receipt.auditId);assert.equal(audits[0].admin_id,'1');
  const {auditId,...audited}=receipt;assert.deepEqual(parsed(audits[0].after_data),audited);
 }
 return {messages:30,rewards:30,totalCoin:TOTAL,claimed:rows.filter(r=>r.claimed_at).length,missing:0,duplicates:0,rows};
}

// One-time, explicitly authorized inbox delivery. Wallets are credited only by
// the existing atomic message-claim API when each recipient collects the gift.
export async function sendHeroesGift(c,{expectedRecipientHash,dryRun=false}={}){
 assert.equal(expectedRecipientHash,RECIPIENT_HASH,'Reviewed recipients required');
 await c.query('BEGIN ISOLATION LEVEL REPEATABLE READ');
 try{
  await c.query("SET LOCAL lock_timeout='5s'");await c.query("SET LOCAL statement_timeout='20s'");
  const reserved=await q(c,'INSERT INTO app_meta(key,value,updated_at) VALUES($1,$2,CURRENT_TIMESTAMP) ON CONFLICT(key) DO NOTHING RETURNING key',[OPERATION_KEY,JSON.stringify({status:'PENDING'})]);
  if(!reserved.length){
   const saved=(await q(c,'SELECT value FROM app_meta WHERE key=$1',[OPERATION_KEY]))[0],receipt=parsed(saved.value);
   const verification=await verifyHeroesGift(c,receipt);await c.query('ROLLBACK');return {receipt,verification,replayed:true,dryRun};
  }
  const plan=await inspectHeroesGift(c,{lock:true});assert.equal(plan.existing.length,0,'Matching gift already exists');
  const [owner]=await q(c,"SELECT id FROM users WHERE id=1 AND role='OWNER' AND status='ACTIVE'");assert.ok(owner,'Active operator required');
  const messages=await q(c,`INSERT INTO user_messages(user_id,sender_type,title,body,message_type,campaign_key)
   SELECT id,'ADMIN',$2,$3,'COIN_REWARD',$4 FROM unnest($1::bigint[]) AS id ORDER BY id RETURNING id::text,user_id::text`,[ids,TITLE,BODY,CAMPAIGN_KEY]);
  assert.equal(messages.length,30,'Partial message insert');messages.sort((a,b)=>Number(a.user_id)-Number(b.user_id));
  const rewards=await q(c,`INSERT INTO user_message_rewards(message_id,user_id,reward_type,reward_amount)
   SELECT id,user_id,'COIN',$2::bigint FROM user_messages WHERE campaign_key=$1 ORDER BY user_id RETURNING id::text,user_id::text`,[CAMPAIGN_KEY,AMOUNT]);
  assert.equal(rewards.length,30,'Partial reward insert');rewards.sort((a,b)=>Number(a.user_id)-Number(b.user_id));
  const receipt={status:'COMPLETED',operationKey:OPERATION_KEY,campaignKey:CAMPAIGN_KEY,recipientHash:RECIPIENT_HASH,recipients:TARGETS,
   count:30,rewardType:'COIN',rewardAmount:AMOUNT,totalAmount:TOTAL,title:TITLE,body:BODY,delivery:'MESSAGE',actor:'SYSTEM_OPS',
   sourceCutoff:PLAN.sourceCutoff,sourceFileSha256:PLAN.sourceFileSha256,authorization:PLAN.authorization,
   messageIds:messages.map(r=>r.id),rewardIds:rewards.map(r=>r.id),completedAt:new Date().toISOString()};
  const audit=await q(c,`INSERT INTO admin_logs(admin_id,action_type,target_type,target_id,before_data,after_data)
   VALUES($1,$2,'USER_MESSAGE',$3,$4,$5) RETURNING id::text`,[owner.id,ACTION,OPERATION_KEY,JSON.stringify({existingMessages:0}),JSON.stringify(receipt)]);
  assert.equal(audit.length,1,'Audit missing');receipt.auditId=audit[0].id;
  assert.equal((await q(c,'UPDATE app_meta SET value=$2,updated_at=CURRENT_TIMESTAMP WHERE key=$1 RETURNING key',[OPERATION_KEY,JSON.stringify(receipt)])).length,1,'Receipt missing');
  const verification=await verifyHeroesGift(c,receipt,{unclaimed:true});
  await c.query(dryRun?'ROLLBACK':'COMMIT');return {receipt,verification,dryRun,replayed:false};
 }catch(error){await c.query('ROLLBACK').catch(()=>{});throw error;}
}
