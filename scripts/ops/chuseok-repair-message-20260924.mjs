import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';

export const CAMPAIGN_KEY='chuseok-all-repair-message-20260924-v1';
export const OPERATION_KEY='ops:chuseok-all-repair-message:20260924:v1';
export const ITEM_CODE='PINGDU_REPAIR_COUPON';
export const AMOUNT=1;
export const TITLE='추석 명절 기념';
export const BODY='추석 명절 기념 선물로 핑두 리페어 쿠폰 1개를 드립니다.\n아래 보상 수령 버튼을 눌러 받아 주세요.\n즐거운 한가위 보내세요!';
const recipientSql=`SELECT u.id::text AS id,UPPER(TRIM(COALESCE(u.role,'USER'))) AS role
 FROM users u WHERE UPPER(TRIM(COALESCE(u.status,'ACTIVE')))='ACTIVE' ORDER BY u.id`;
const digest=rows=>createHash('sha256').update(JSON.stringify(rows)).digest('hex');

export async function inspectRepairMessage(client){
 const q=async(sql,args=[])=>(await client.query(sql,args)).rows;
 const recipients=await q(recipientSql);
 const item=(await q('SELECT code,name,is_active FROM inventory_items WHERE code=$1',[ITEM_CODE]))[0];
 const existing=await q(`SELECT m.campaign_key,COUNT(*)::int AS messages
  FROM user_messages m LEFT JOIN user_message_rewards r ON r.message_id=m.id
  WHERE m.campaign_key=$1 OR (m.title=$2 AND r.reward_type=$3 AND r.reward_amount=$4)
  GROUP BY m.campaign_key`,[CAMPAIGN_KEY,TITLE,ITEM_CODE,AMOUNT]);
 const [saved]=await q('SELECT value FROM app_meta WHERE key=$1',[OPERATION_KEY]);
 return {campaignKey:CAMPAIGN_KEY,title:TITLE,body:BODY,rewardType:ITEM_CODE,rewardAmount:AMOUNT,item,
  count:recipients.length,recipientHash:digest(recipients),roles:recipients.reduce((out,row)=>(out[row.role]=(out[row.role]||0)+1,out),{}),
  totalAmount:recipients.length,recipients,existing,receipt:saved?JSON.parse(saved.value):null};
}

export async function verifyRepairMessage(client,receipt,{unclaimed=false}={}){
 assert.equal(receipt.status,'COMPLETED');assert.equal(receipt.campaignKey,CAMPAIGN_KEY);
 assert.equal(receipt.rewardType,ITEM_CODE);assert.equal(receipt.rewardAmount,AMOUNT);assert.equal(receipt.title,TITLE);assert.equal(receipt.body,BODY);
 assert.equal(receipt.recipientHash,digest(receipt.recipients));
 const rows=(await client.query(`SELECT m.id::text AS message_id,m.user_id::text AS user_id,m.title,m.body,m.sender_type,m.message_type,m.is_read,m.hidden_at,
  r.id::text AS reward_id,r.user_id::text AS reward_user_id,r.reward_type,r.reward_amount::text AS reward_amount,r.claimed_at
  FROM user_messages m LEFT JOIN user_message_rewards r ON r.message_id=m.id WHERE m.campaign_key=$1 ORDER BY m.user_id`,[CAMPAIGN_KEY])).rows;
 assert.equal(rows.length,receipt.count,'Message count differs from frozen recipients');
 assert.deepEqual(rows.map(row=>row.user_id),receipt.recipients.map(row=>row.id),'Recipient mismatch or duplicate message');
 for(const row of rows){
  assert.ok(row.reward_id,'Message reward missing');assert.equal(row.user_id,row.reward_user_id);assert.equal(row.title,TITLE);assert.equal(row.body,BODY);
  assert.equal(row.sender_type,'ADMIN');assert.equal(row.message_type,'ITEM_REWARD');assert.equal(row.reward_type,ITEM_CODE);assert.equal(row.reward_amount,String(AMOUNT));
  if(unclaimed){assert.equal(row.claimed_at,null);assert.equal(row.hidden_at,null);assert.equal(Number(row.is_read),0);}
 }
 return {messages:rows.length,rewards:rows.length,claimed:rows.filter(row=>row.claimed_at).length,duplicates:rows.length-new Set(rows.map(row=>row.user_id)).size};
}

// Explicit one-time message campaign. Does not change inventory, eligibility rules,
// repair policy, CMS limits or runtime startup. Unverified ACTIVE accounts are included.
export async function sendRepairMessage(client,{expectedRecipientHash}={}){
 assert.match(String(expectedRecipientHash||''),/^[a-f0-9]{64}$/,'Reviewed recipient hash required');
 await client.query('BEGIN ISOLATION LEVEL REPEATABLE READ');
 try{
  await client.query("SET LOCAL lock_timeout='5s'");await client.query("SET LOCAL statement_timeout='20s'");
  const reserved=await client.query(`INSERT INTO app_meta(key,value,updated_at) VALUES($1,$2,CURRENT_TIMESTAMP)
   ON CONFLICT(key) DO NOTHING RETURNING key`,[OPERATION_KEY,JSON.stringify({status:'PENDING',campaignKey:CAMPAIGN_KEY})]);
  if(!reserved.rows.length){
   const prior=(await client.query('SELECT value FROM app_meta WHERE key=$1',[OPERATION_KEY])).rows[0];
   const receipt=JSON.parse(prior.value),verification=await verifyRepairMessage(client,receipt);
   await client.query('ROLLBACK');return {...receipt,verification,replayed:true};
  }
  const plan=await inspectRepairMessage(client);
  assert.equal(plan.recipientHash,expectedRecipientHash,'Recipients changed; inspect current recipients before sending');
  assert.ok(plan.count>0,'No active recipients');assert.equal(plan.existing.length,0,'Matching gift already exists');
  const [item]=(await client.query('SELECT code,name,is_active FROM inventory_items WHERE code=$1 FOR SHARE',[ITEM_CODE])).rows;
  assert.ok(item?.name==='핑두 리페어 쿠폰'&&Number(item.is_active)===1,'Repair coupon catalog changed');
  const [owner]=(await client.query("SELECT id FROM users WHERE UPPER(TRIM(role))='OWNER' AND UPPER(TRIM(status))='ACTIVE' ORDER BY id LIMIT 1")).rows;
  assert.ok(owner,'Active owner required for audit');
  const messages=await client.query(`INSERT INTO user_messages(user_id,sender_type,title,body,message_type,campaign_key)
   SELECT id,'ADMIN',$2,$3,'ITEM_REWARD',$4 FROM unnest($1::bigint[]) AS id ORDER BY id RETURNING id`,[plan.recipients.map(row=>row.id),TITLE,BODY,CAMPAIGN_KEY]);
  assert.equal(messages.rows.length,plan.count,'Partial message insert');
  const rewards=await client.query(`INSERT INTO user_message_rewards(message_id,user_id,reward_type,reward_amount)
   SELECT id,user_id,$2,$3::bigint FROM user_messages WHERE campaign_key=$1 ORDER BY user_id RETURNING id`,[CAMPAIGN_KEY,ITEM_CODE,AMOUNT]);
  assert.equal(rewards.rows.length,plan.count,'Partial reward insert');
  const {existing,receipt:unused,item:catalog,...details}=plan;
  const receipt={...details,status:'COMPLETED',delivery:'MESSAGE',actor:'SYSTEM_OPS',
   authorization:'전체유저 핑두의 리페어권 1개 메세지로 지급 추석 명절 기념',eligibility:'All ACTIVE accounts, all roles, regardless of secondary verification',completedAt:new Date().toISOString()};
  const verification=await verifyRepairMessage(client,receipt,{unclaimed:true});
  const audit=await client.query(`INSERT INTO admin_logs(admin_id,action_type,target_type,target_id,before_data,after_data)
   VALUES($1,'OPS_CHUSEOK_REPAIR_MESSAGE_SEND','USER_MESSAGE',$2,$3,$4) RETURNING id`,[owner.id,CAMPAIGN_KEY,
   JSON.stringify({existingCampaignMessages:0}),JSON.stringify(receipt)]);
  assert.equal(audit.rows.length,1,'Audit insert missing');receipt.auditId=String(audit.rows[0].id);
  const updated=await client.query('UPDATE app_meta SET value=$2,updated_at=CURRENT_TIMESTAMP WHERE key=$1 RETURNING key',[OPERATION_KEY,JSON.stringify(receipt)]);
  assert.equal(updated.rows.length,1,'Completed receipt missing');
  await client.query('COMMIT');return {...receipt,verification,replayed:false};
 }catch(error){await client.query('ROLLBACK').catch(()=>{});throw error;}
}
