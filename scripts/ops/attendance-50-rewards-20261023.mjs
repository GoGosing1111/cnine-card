import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
const raw=readFileSync(new URL('./attendance-50-rewards-20261023.json',import.meta.url),'utf8').replace(/\r\n/g,'\n');
export const PLAN=JSON.parse(raw);
export const HASH='e405a46175d5cd669d3573a0b75472478959541cb0b104bce7a38f418bd3ad08';
assert.equal(createHash('sha256').update(raw).digest('hex'),HASH,'Frozen plan changed');
export const KEY=PLAN.operationKey;
export const CAMPAIGN=KEY+':shards';
const q=async(c,sql,args=[])=>(await c.query(sql,args)).rows;
const sorted=a=>[...a].sort();
function validate(){
  assert.equal(KEY,'ops:attendance-50-reward:20261023:v1');assert.equal(PLAN.minimumAttendanceDays,50);assert.equal(PLAN.amount,3);
  assert.equal(PLAN.title,'누적출석 50일 보상');assert.equal(PLAN.item.code,'MERCENARY_SSS_CARD_SHARD');
  assert.equal(PLAN.item.name,'SSS 용병 카드 조각');assert.equal(PLAN.delivery,'MESSAGE');
  assert.equal(PLAN.recipients.length,208);assert.equal(new Set(PLAN.recipients.map(x=>x.userId)).size,208);
  assert(PLAN.recipients.every(x=>x.status==='ACTIVE'&&x.attendanceDays>=50&&x.attendanceDays===x.distinctDays));
  assert.deepEqual(PLAN.totals,{recipients:208,messages:208,totalShards:'624'});
}
validate();
export async function verify(c,receipt,{unclaimed=false}={}){
  validate();assert.equal(receipt.operationKey,KEY);assert.equal(receipt.planHash,HASH);assert.equal(receipt.status,'COMPLETED');
  assert.equal(receipt.delivery,PLAN.delivery);assert.equal(receipt.cutoff,PLAN.cutoff);
  assert.deepEqual(receipt.totals,PLAN.totals);assert.deepEqual(receipt.recipientIds,PLAN.recipients.map(x=>x.userId));
  const rows=await q(c,`SELECT m.id::text mid,m.user_id::text uid,m.sender_type,m.title,m.body,m.message_type,m.is_read,m.hidden_at,
    r.id::text rid,r.user_id::text ruid,r.reward_type,r.reward_amount::text amount,r.claimed_at,
    cr.reward_id::text claim_id,cr.message_id::text claim_mid,cr.user_id::text claim_uid,cr.reward_type claim_type,
    cr.reward_amount::text claim_amount,cr.balance_before::text,cr.balance_after::text
    FROM user_messages m LEFT JOIN user_message_rewards r ON r.message_id=m.id
    LEFT JOIN user_message_reward_claim_receipts_v1222 cr ON cr.reward_id=r.id WHERE m.campaign_key=$1`,[CAMPAIGN]);
  assert.equal(rows.length,208);assert.deepEqual(sorted(rows.map(x=>x.uid)),sorted(receipt.recipientIds));
  assert.equal(new Set(rows.map(x=>x.mid)).size,208);assert.equal(new Set(rows.map(x=>x.rid)).size,208);
  assert.deepEqual(sorted(rows.map(x=>x.mid)),sorted(receipt.messageIds));assert.deepEqual(sorted(rows.map(x=>x.rid)),sorted(receipt.rewardIds));
  let claimed=0;
  for(const r of rows){
    assert.equal(r.ruid,r.uid);assert.equal(r.sender_type,'ADMIN');assert.equal(r.message_type,'ITEM_REWARD');
    assert.equal(r.title,PLAN.title);assert.equal(r.body,PLAN.body);assert.equal(r.reward_type,PLAN.item.code);assert.equal(r.amount,'3');
    if(unclaimed){assert.equal(r.claimed_at,null);assert.equal(r.hidden_at,null);assert.equal(Number(r.is_read),0);}
    if(r.claimed_at){assert.equal(r.claim_id,r.rid);assert.equal(r.claim_mid,r.mid);assert.equal(r.claim_uid,r.uid);assert.equal(r.claim_type,PLAN.item.code);assert.equal(r.claim_amount,'3');assert.equal(BigInt(r.balance_after)-BigInt(r.balance_before),3n);claimed++;}
    else assert.equal(r.claim_id,null);
  }
  if(receipt.auditId){
    const [audit]=await q(c,'SELECT action_type,target_id,after_data FROM admin_logs WHERE id=$1',[receipt.auditId]);
    assert.equal(audit?.action_type,'ATTENDANCE_50_REWARD_MESSAGES');assert.equal(audit.target_id,KEY);
    const {auditId,...expected}=receipt;assert.deepEqual(JSON.parse(audit.after_data),expected);
  }
  return {...PLAN.totals,rewards:208,claimed,pending:208-claimed,missing:0,duplicates:0};
}
// Caller supplies BEGIN/COMMIT/ROLLBACK. Only message attachments are delivered.
export async function send(c,approvedHash){
  assert.equal(approvedHash,HASH,'Frozen plan hash required');validate();
  await c.query('SELECT pg_advisory_xact_lock(hashtextextended($1,0))',[KEY]);
  const [saved]=await q(c,'SELECT value FROM app_meta WHERE key=$1 FOR UPDATE',[KEY]);
  if(saved){const receipt=JSON.parse(saved.value);return {receipt,replayed:true,verification:await verify(c,receipt)};}
  const [clock]=await q(c,"SELECT to_char(CURRENT_TIMESTAMP AT TIME ZONE 'Asia/Seoul','YYYY-MM-DD') kst");
  assert.equal(clock.kst,PLAN.kstDate,'One-time payout date changed');
  const current=await q(c,`SELECT u.id::text "userId",u.status,COUNT(*)::int "attendanceDays",COUNT(DISTINCT a.attendance_date)::int "distinctDays"
    FROM attendance_logs a JOIN users u ON u.id=a.user_id
    WHERE a.claimed_at::timestamptz<=$1::timestamptz AND a.attendance_date<=$2
    GROUP BY u.id HAVING COUNT(*)>=50 ORDER BY u.id`,[PLAN.cutoff,PLAN.kstDate]);
  assert.deepEqual(current,PLAN.recipients.map(({userId,status,attendanceDays,distinctDays})=>({userId,status,attendanceDays,distinctDays})),'Attendance snapshot changed');
  const accounts=await q(c,'SELECT id::text,status FROM users WHERE id=ANY($1::bigint[]) ORDER BY id FOR SHARE',[PLAN.recipients.map(x=>x.userId)]);
  assert.equal(accounts.length,208);assert(accounts.every(x=>x.status==='ACTIVE'));
  const [item]=await q(c,'SELECT code,name,category,rarity,image_url,is_active FROM inventory_items WHERE code=$1 FOR SHARE',[PLAN.item.code]);
  assert.deepEqual(item,PLAN.item);
  const [existing]=await q(c,`SELECT COUNT(*)::int n FROM user_messages m WHERE m.campaign_key LIKE 'ops:attendance-50-reward:%'
    OR m.title=$1 OR ((m.title LIKE '%출석%' OR m.body LIKE '%누적출석%' OR m.body LIKE '%누적 출석%') AND (m.title LIKE '%50%' OR m.body LIKE '%50일%'))`,[PLAN.title]);
  assert.equal(existing.n,0,'Existing 50-day attendance delivery requires reconciliation');
  const [owner]=await q(c,"SELECT id FROM users WHERE role='OWNER' AND status='ACTIVE' ORDER BY id LIMIT 1");assert(owner);
  const ids=PLAN.recipients.map(x=>x.userId);
  const messages=await q(c,`INSERT INTO user_messages(user_id,sender_type,title,body,message_type,campaign_key)
    SELECT uid,'ADMIN',$2,$3,'ITEM_REWARD',$4 FROM unnest($1::bigint[]) uid ORDER BY uid RETURNING id::text`,[ids,PLAN.title,PLAN.body,CAMPAIGN]);
  assert.equal(messages.length,208);
  const rewards=await q(c,`INSERT INTO user_message_rewards(message_id,user_id,reward_type,reward_amount)
    SELECT id,user_id,$2,3 FROM user_messages WHERE campaign_key=$1 ORDER BY user_id RETURNING id::text`,[CAMPAIGN,PLAN.item.code]);
  assert.equal(rewards.length,208);
  const receipt={operationKey:KEY,planHash:HASH,status:'COMPLETED',totals:PLAN.totals,cutoff:PLAN.cutoff,
    recipientIds:ids,messageIds:messages.map(x=>x.id),rewardIds:rewards.map(x=>x.id),delivery:'MESSAGE',
    authorization:PLAN.authorization,noImmediateInventoryCredit:true,completedAt:new Date().toISOString()};
  const verification=await verify(c,receipt,{unclaimed:true});
  const [audit]=await q(c,`INSERT INTO admin_logs(admin_id,action_type,target_type,target_id,before_data,after_data)
    VALUES($1,'ATTENDANCE_50_REWARD_MESSAGES','USER_MESSAGE',$2,$3,$4) RETURNING id::text`,[owner.id,KEY,JSON.stringify({messages:0,oneTime:true,minimumAttendanceDays:50}),JSON.stringify(receipt)]);
  assert(audit?.id);receipt.auditId=audit.id;
  await c.query('INSERT INTO app_meta(key,value,updated_at) VALUES($1,$2,CURRENT_TIMESTAMP)',[KEY,JSON.stringify(receipt)]);
  return {receipt,replayed:false,verification};
}
