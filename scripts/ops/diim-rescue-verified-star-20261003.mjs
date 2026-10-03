import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';

export const OPERATION_KEY='ops:diim-rescue:verified-star:20261003:v1';
export const CAMPAIGN_KEY='diim-rescue-verified-star-20261003-v1';
export const ITEM_CODE='MASTER_STAR',ITEM_NAME='마스터의 별',AMOUNT=3_000_000;
export const TITLE='디임방 구조대 기념';
export const BODY='디임방 구조대 기념';
const digest=rows=>createHash('sha256').update(JSON.stringify(rows)).digest('hex');
const recipientSql=`SELECT u.id::text AS id,UPPER(TRIM(COALESCE(u.role,'USER'))) AS role
 FROM users u WHERE UPPER(TRIM(COALESCE(u.status,'ACTIVE')))='ACTIVE'
 AND EXISTS(SELECT 1 FROM user_second_verifications s WHERE s.user_id=u.id) ORDER BY u.id LIMIT 5001`;

export async function inspectDiimRescueGift(client){
 const recipients=(await client.query(recipientSql)).rows;
 assert.ok(recipients.length<=5000,'Recipient limit exceeded');
 const items=(await client.query('SELECT code,name,is_active FROM inventory_items WHERE code=$1',[ITEM_CODE])).rows;
 const existing=(await client.query(`SELECT m.campaign_key,COUNT(*)::int AS messages
  FROM user_messages m LEFT JOIN user_message_rewards r ON r.message_id=m.id
  WHERE m.campaign_key=$1 OR (m.title=$2 AND r.reward_type=$3 AND r.reward_amount=$4)
  GROUP BY m.campaign_key`,[CAMPAIGN_KEY,TITLE,ITEM_CODE,AMOUNT])).rows;
 const saved=(await client.query('SELECT value FROM app_meta WHERE key=$1',[OPERATION_KEY])).rows[0];
 return {operationKey:OPERATION_KEY,campaignKey:CAMPAIGN_KEY,title:TITLE,body:BODY,rewardType:ITEM_CODE,rewardAmount:AMOUNT,
  count:recipients.length,totalAmount:recipients.length*AMOUNT,recipientHash:digest(recipients),recipients,
  roles:recipients.reduce((out,row)=>(out[row.role]=(out[row.role]||0)+1,out),{}),items,existing,receipt:saved?JSON.parse(saved.value):null};
}

export async function verifyDiimRescueGift(client,receipt,{unclaimed=false}={}){
 assert.equal(receipt.status,'COMPLETED');assert.equal(receipt.operationKey,OPERATION_KEY);assert.equal(receipt.campaignKey,CAMPAIGN_KEY);
 assert.equal(receipt.title,TITLE);assert.equal(receipt.body,BODY);assert.equal(receipt.rewardType,ITEM_CODE);assert.equal(receipt.rewardAmount,AMOUNT);
 assert.equal(receipt.count,receipt.recipients.length);assert.equal(receipt.totalAmount,receipt.count*AMOUNT);
 assert.equal(receipt.recipientHash,digest(receipt.recipients));
 const rows=(await client.query(`SELECT m.id::text AS message_id,m.user_id::text AS user_id,m.title,m.body,
  m.sender_type,m.message_type,m.is_read,m.hidden_at,r.id::text AS reward_id,r.user_id::text AS reward_user_id,
  r.reward_type,r.reward_amount::text AS reward_amount,r.claimed_at
  FROM user_messages m LEFT JOIN user_message_rewards r ON r.message_id=m.id
  WHERE m.campaign_key=$1 ORDER BY m.user_id`,[CAMPAIGN_KEY])).rows;
 assert.equal(rows.length,receipt.count,'Message/reward count differs from frozen recipients');
 assert.deepEqual(rows.map(row=>row.user_id),receipt.recipients.map(row=>row.id),'Missing or duplicate recipient');
 for(const row of rows){
  assert.ok(row.reward_id,'Missing reward');assert.equal(row.user_id,row.reward_user_id);assert.equal(row.title,TITLE);assert.equal(row.body,BODY);
  assert.equal(row.sender_type,'ADMIN');assert.equal(row.message_type,'ITEM_REWARD');
  assert.equal(row.reward_type,ITEM_CODE);assert.equal(row.reward_amount,String(AMOUNT));
  if(unclaimed){assert.equal(row.claimed_at,null);assert.equal(row.hidden_at,null);assert.equal(Number(row.is_read),0);}
 }
 if(receipt.auditId){
  const audit=(await client.query(`SELECT after_data FROM admin_logs WHERE id=$1 AND action_type='VERIFIED_REWARD_MESSAGE_SEND'
   AND target_id=$2`,[receipt.auditId,OPERATION_KEY])).rows;
  assert.equal(audit.length,1,'Missing campaign audit');
  const {auditId,verification,dryRun,replayed,...audited}=receipt;assert.deepEqual(JSON.parse(audit[0].after_data),audited,'Audit receipt mismatch');
 }
 return {messages:rows.length,rewards:rows.length,totalAmount:rows.length*AMOUNT,claimed:rows.filter(row=>row.claimed_at).length,missing:0,duplicates:0};
}

// One user-authorized campaign, never imported by runtime. Recipients, claimable
// messages, rewards, audit and receipt commit together; inventory is unchanged.
export async function sendDiimRescueGift(client,{expectedRecipientHash,dryRun=false}={}){
 assert.match(String(expectedRecipientHash||''),/^[a-f0-9]{64}$/,'Reviewed recipient hash is required');
 await client.query('BEGIN ISOLATION LEVEL REPEATABLE READ');
 try{
  await client.query("SET LOCAL lock_timeout='5s'");await client.query("SET LOCAL statement_timeout='20s'");
  const reserved=await client.query(`INSERT INTO app_meta(key,value,updated_at) VALUES($1,$2,CURRENT_TIMESTAMP)
   ON CONFLICT(key) DO NOTHING RETURNING key`,[OPERATION_KEY,JSON.stringify({status:'PENDING'})]);
  if(!reserved.rows.length){
   const prior=(await client.query('SELECT value FROM app_meta WHERE key=$1',[OPERATION_KEY])).rows[0];
   const receipt=JSON.parse(prior.value),verification=await verifyDiimRescueGift(client,receipt);
   await client.query('ROLLBACK');return {...receipt,verification,replayed:true};
  }
  const plan=await inspectDiimRescueGift(client);
  assert.equal(plan.recipientHash,expectedRecipientHash,'Recipients changed; inspect again before sending');
  assert.ok(plan.count>0,'No active verified recipients');assert.equal(plan.existing.length,0,'Matching gift exists; duplicate campaign blocked');
  assert.ok(plan.items.some(item=>item.code===ITEM_CODE&&item.name===ITEM_NAME&&Number(item.is_active)===1),'Active Master Star required');
  const owner=(await client.query("SELECT id FROM users WHERE UPPER(TRIM(role))='OWNER' AND UPPER(TRIM(status))='ACTIVE' ORDER BY id LIMIT 1")).rows[0];
  assert.ok(owner,'Active owner required for audit attribution');
  const messages=await client.query(`INSERT INTO user_messages(user_id,sender_type,title,body,message_type,campaign_key)
   SELECT id,'ADMIN',$2,$3,'ITEM_REWARD',$4 FROM unnest($1::bigint[]) AS id ORDER BY id RETURNING id`,
   [plan.recipients.map(row=>row.id),TITLE,BODY,CAMPAIGN_KEY]);
  assert.equal(messages.rows.length,plan.count,'Partial message insert');
  const rewards=await client.query(`INSERT INTO user_message_rewards(message_id,user_id,reward_type,reward_amount)
   SELECT id,user_id,$2,$3::bigint FROM user_messages WHERE campaign_key=$1 ORDER BY user_id RETURNING id`,[CAMPAIGN_KEY,ITEM_CODE,AMOUNT]);
  assert.equal(rewards.rows.length,plan.count,'Partial reward insert');
  const {existing,receipt:unused,...details}=plan;
  const receipt={...details,status:'COMPLETED',delivery:'MESSAGE',actor:'SYSTEM_OPS',
   authorization:'2차인증 유저 전체 마스터의별 300만개 지급해 메세지는 디임방 구조대 기념',
   eligibility:'All ACTIVE secondary-verified accounts, all roles and verification providers',completedAt:new Date().toISOString()};
  const verification=await verifyDiimRescueGift(client,receipt,{unclaimed:true});
  const audit=await client.query(`INSERT INTO admin_logs(admin_id,action_type,target_type,target_id,before_data,after_data)
   VALUES($1,'VERIFIED_REWARD_MESSAGE_SEND','USER_MESSAGE',$2,$3,$4) RETURNING id`,[owner.id,OPERATION_KEY,
   JSON.stringify({existingCampaignMessages:0}),JSON.stringify(receipt)]);
  assert.equal(audit.rows.length,1,'Audit insert missing');receipt.auditId=String(audit.rows[0].id);
  const updated=await client.query('UPDATE app_meta SET value=$2,updated_at=CURRENT_TIMESTAMP WHERE key=$1 RETURNING key',[OPERATION_KEY,JSON.stringify(receipt)]);
  assert.equal(updated.rows.length,1,'Completed receipt missing');
  await client.query(dryRun?'ROLLBACK':'COMMIT');return {...receipt,verification,dryRun,replayed:false};
 }catch(error){await client.query('ROLLBACK').catch(()=>{});throw error;}
}
