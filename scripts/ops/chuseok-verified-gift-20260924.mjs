import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';

export const CAMPAIGN_KEY='chuseok-verified-1000eok-20260924-v1';
export const OPERATION_KEY='ops:chuseok-verified-1000eok:20260924:v1';
export const AMOUNT=100_000_000_000;
export const TITLE='추석 명절 기념 선물';
const recipientSql=`SELECT u.id::text AS id,UPPER(TRIM(COALESCE(u.role,'USER'))) AS role
 FROM users u WHERE UPPER(TRIM(COALESCE(u.status,'ACTIVE')))='ACTIVE'
 AND EXISTS(SELECT 1 FROM user_second_verifications s WHERE s.user_id=u.id) ORDER BY u.id`;
const digest=rows=>createHash('sha256').update(JSON.stringify(rows)).digest('hex');

export async function inspectChuseokGift(client){
 const recipients=(await client.query(recipientSql)).rows;
 const existing=(await client.query(`SELECT m.campaign_key,COUNT(*)::int AS messages,
 MIN(r.reward_amount)::text AS minimum,MAX(r.reward_amount)::text AS maximum
 FROM user_messages m LEFT JOIN user_message_rewards r ON r.message_id=m.id
 WHERE m.campaign_key=$1 OR (m.title=$2 AND m.body=$2 AND r.reward_type='COIN' AND r.reward_amount=$3)
 GROUP BY m.campaign_key`,[CAMPAIGN_KEY,TITLE,AMOUNT])).rows;
 const saved=(await client.query('SELECT value FROM app_meta WHERE key=$1',[OPERATION_KEY])).rows[0];
 return {campaignKey:CAMPAIGN_KEY,title:TITLE,body:TITLE,rewardType:'COIN',rewardAmount:AMOUNT,
  count:recipients.length,recipientHash:digest(recipients),roles:recipients.reduce((out,row)=>(out[row.role]=(out[row.role]||0)+1,out),{}),
  totalAmount:(BigInt(recipients.length)*BigInt(AMOUNT)).toString(),recipients,existing,receipt:saved?JSON.parse(saved.value):null};
}

export async function verifyChuseokGift(client,receipt){
 assert.equal(receipt.status,'COMPLETED');assert.equal(receipt.campaignKey,CAMPAIGN_KEY);
 assert.equal(receipt.rewardAmount,AMOUNT);assert.equal(receipt.title,TITLE);assert.equal(receipt.body,TITLE);
 const rows=(await client.query(`SELECT m.id::text AS message_id,m.user_id::text AS user_id,m.title,m.body,m.sender_type,m.message_type,
 r.id::text AS reward_id,r.user_id::text AS reward_user_id,r.reward_type,r.reward_amount::text AS reward_amount,r.claimed_at
 FROM user_messages m LEFT JOIN user_message_rewards r ON r.message_id=m.id WHERE m.campaign_key=$1 ORDER BY m.user_id`,[CAMPAIGN_KEY])).rows;
 assert.equal(rows.length,receipt.count,'Message/reward count does not match frozen recipients');
 assert.deepEqual(rows.map(row=>row.user_id),receipt.recipients.map(row=>row.id),'Recipient mismatch or duplicate message');
 for(const row of rows){
  assert.ok(row.reward_id);assert.equal(row.user_id,row.reward_user_id);assert.equal(row.title,TITLE);assert.equal(row.body,TITLE);
  assert.equal(row.sender_type,'ADMIN');assert.equal(row.message_type,'COIN_REWARD');assert.equal(row.reward_type,'COIN');assert.equal(row.reward_amount,String(AMOUNT));
 }
 return {messages:rows.length,rewards:rows.length,claimed:rows.filter(row=>row.claimed_at).length,duplicates:rows.length-new Set(rows.map(row=>row.user_id)).size};
}

// Owner-authorized one-time exception. Never imported by runtime or migrations.
// Does not change CMS limits, wallet balances, verification state or future eligibility.
export async function sendChuseokGift(client,{expectedRecipientHash,dryRun=false}={}){
 assert.match(String(expectedRecipientHash||''),/^[a-f0-9]{64}$/,'Reviewed recipient hash is required');
 await client.query('BEGIN ISOLATION LEVEL REPEATABLE READ');
 try{
  await client.query("SET LOCAL lock_timeout='5s'");await client.query("SET LOCAL statement_timeout='20s'");
  const reserved=await client.query(`INSERT INTO app_meta(key,value,updated_at) VALUES($1,$2,CURRENT_TIMESTAMP)
   ON CONFLICT(key) DO NOTHING RETURNING key`,[OPERATION_KEY,JSON.stringify({status:'PENDING',campaignKey:CAMPAIGN_KEY})]);
  if(!reserved.rows.length){
   const prior=(await client.query('SELECT value FROM app_meta WHERE key=$1',[OPERATION_KEY])).rows[0];
   const receipt=JSON.parse(prior.value),verification=await verifyChuseokGift(client,receipt);
   await client.query('ROLLBACK');return {...receipt,verification,replayed:true};
  }
  const plan=await inspectChuseokGift(client);
  assert.equal(plan.recipientHash,expectedRecipientHash,'Recipients changed; inspect current recipients before sending');
  assert.ok(plan.count>0,'No verified active recipients');assert.equal(plan.existing.length,0,'Matching gift already exists; do not send another campaign');
  const owner=(await client.query("SELECT id FROM users WHERE UPPER(TRIM(role))='OWNER' AND UPPER(TRIM(status))='ACTIVE' ORDER BY id LIMIT 1")).rows[0];
  assert.ok(owner,'Active owner required for audit attribution');
  const messages=await client.query(`INSERT INTO user_messages(user_id,sender_type,title,body,message_type,campaign_key)
   SELECT id,'ADMIN',$2,$2,'COIN_REWARD',$3 FROM unnest($1::bigint[]) AS id RETURNING id`,[plan.recipients.map(row=>row.id),TITLE,CAMPAIGN_KEY]);
  assert.equal(messages.rows.length,plan.count);
  const rewards=await client.query(`INSERT INTO user_message_rewards(message_id,user_id,reward_type,reward_amount)
   SELECT id,user_id,'COIN',$2::bigint FROM user_messages WHERE campaign_key=$1 RETURNING id`,[CAMPAIGN_KEY,AMOUNT]);
  assert.equal(rewards.rows.length,plan.count);
  const {existing,receipt:unused,...details}=plan;
  const receipt={...details,status:'COMPLETED',delivery:'MESSAGE',actor:'SYSTEM_OPS',
   authorization:'Owner explicitly requested 1000억 COIN for all secondary-verified users and reconfirmed sending above the CMS limit.',
   completedAt:new Date().toISOString()};
  const verification=await verifyChuseokGift(client,receipt);
  const audit=await client.query(`INSERT INTO admin_logs(admin_id,action_type,target_type,target_id,before_data,after_data)
   VALUES($1,'VERIFIED_REWARD_MESSAGE_SEND','USER_MESSAGE',$2,$3,$4) RETURNING id`,[owner.id,CAMPAIGN_KEY,
   JSON.stringify({existingCampaignMessages:0,oneTimeException:true}),JSON.stringify(receipt)]);
  receipt.auditId=String(audit.rows[0].id);
  await client.query('UPDATE app_meta SET value=$2,updated_at=CURRENT_TIMESTAMP WHERE key=$1',[OPERATION_KEY,JSON.stringify(receipt)]);
  await client.query(dryRun?'ROLLBACK':'COMMIT');
  return {...receipt,verification,dryRun,replayed:false};
 }catch(error){await client.query('ROLLBACK').catch(()=>{});throw error}
}
