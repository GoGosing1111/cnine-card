import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import reviewed from './mangsuni-rescue-20261008.targets.json' with {type:'json'};

export const OPERATION_KEY='ops:mangsuni-rescue:20261008:v1';
export const TITLE='망순방 구조대 이벤트';
export const BODY="망순방 구조대 이벤트 보상입니다.\n코인 1조와 마스터의 별 1,000만 개를 보상별 메시지로 지급합니다.\n각 메시지의 보상 수령 버튼을 눌러주세요.";
export const TARGETS=reviewed.targets;
export const RECIPIENT_HASH='886ee9c46b9ad0f3cdcfa8e732c0885906e345f9be200648b4f132bcecca8532';
export const GIFTS=[
 {campaignKey:'mangsuni-rescue-coin-20261008-v1',rewardType:'COIN',rewardAmount:1_000_000_000_000,messageType:'COIN_REWARD'},
 {campaignKey:'mangsuni-rescue-star-20261008-v1',rewardType:'MASTER_STAR',rewardAmount:10_000_000,messageType:'ITEM_REWARD'}
];
const COUNT=58;
const digest=rows=>createHash('sha256').update(JSON.stringify(rows)).digest('hex');
const recipients=TARGETS.map(({id,nickname,inputNickname})=>({id:String(id),nickname,inputNickname})).sort((a,b)=>Number(a.id)-Number(b.id));
assert.equal(recipients.length,COUNT);assert.equal(new Set(recipients.map(r=>r.id)).size,COUNT);
assert.deepEqual(TARGETS.map(r=>r.inputNickname),reviewed.sourceNames);
assert.equal(digest(recipients),RECIPIENT_HASH);assert.equal(reviewed.recipientHash,RECIPIENT_HASH);
const gifts=()=>GIFTS.map(g=>({...g,totalAmount:String(BigInt(COUNT)*BigInt(g.rewardAmount))}));

export async function inspectMangsuniRescue(client){
 const users=(await client.query('SELECT id::text id,nickname,status FROM users WHERE id=ANY($1::bigint[]) ORDER BY users.id',[recipients.map(r=>r.id)])).rows;
 assert.equal(users.length,COUNT,'Missing target account');
 for(const target of recipients){const user=users.find(u=>u.id===target.id);assert.equal(user?.nickname,target.nickname,'Nickname changed');assert.equal(user.status,'ACTIVE','Inactive target');}
 const names=(await client.query('SELECT nickname,COUNT(*)::int count FROM users WHERE nickname=ANY($1::text[]) GROUP BY nickname',[recipients.map(r=>r.nickname)])).rows;
 assert.equal(names.length,COUNT);assert.ok(names.every(r=>r.count===1),'Ambiguous nickname');
 const existing=(await client.query('SELECT campaign_key,COUNT(*)::int messages FROM user_messages WHERE campaign_key=ANY($1::text[]) OR title=$2 GROUP BY campaign_key',[GIFTS.map(g=>g.campaignKey),TITLE])).rows;
 const saved=(await client.query('SELECT value FROM app_meta WHERE key=$1',[OPERATION_KEY])).rows[0];
 const item=(await client.query("SELECT code,name,is_active FROM inventory_items WHERE code='MASTER_STAR'")).rows[0];
 return {operationKey:OPERATION_KEY,title:TITLE,body:BODY,count:COUNT,recipientHash:RECIPIENT_HASH,recipients,gifts:gifts(),item,existing,receipt:saved?JSON.parse(saved.value):null};
}

export async function verifyMangsuniRescue(client,receipt,{unclaimed=false}={}){
 assert.equal(receipt.status,'COMPLETED');assert.equal(receipt.operationKey,OPERATION_KEY);
 assert.equal(receipt.title,TITLE);assert.equal(receipt.body,BODY);assert.equal(receipt.count,COUNT);
 assert.equal(receipt.delivery,'MESSAGE');assert.equal(receipt.noImmediateWalletCredit,true);
 assert.deepEqual(receipt.recipients,recipients);assert.equal(receipt.recipientHash,RECIPIENT_HASH);
 assert.deepEqual(receipt.gifts,gifts());
 const rows=(await client.query(`SELECT m.id::text message_id,m.user_id::text user_id,m.campaign_key,m.title,m.body,
 m.sender_type,m.message_type,m.is_read,m.hidden_at,r.id::text reward_id,r.user_id::text reward_user_id,
 r.reward_type,r.reward_amount::text reward_amount,r.claimed_at
 FROM user_messages m LEFT JOIN user_message_rewards r ON r.message_id=m.id
 WHERE m.campaign_key=ANY($1::text[]) ORDER BY m.user_id,m.campaign_key`,[GIFTS.map(g=>g.campaignKey)])).rows;
 assert.equal(rows.length,COUNT*GIFTS.length,'Message/reward count differs from frozen recipients');
 assert.equal(new Set(receipt.messageIds).size,COUNT*GIFTS.length);
 assert.equal(new Set(receipt.rewardIds).size,COUNT*GIFTS.length);
 const campaigns=[];
 for(const gift of GIFTS){
  const members=rows.filter(row=>row.campaign_key===gift.campaignKey);
  assert.deepEqual(members.map(row=>row.user_id),recipients.map(row=>row.id),'Missing or duplicate recipient');
  for(const row of members){
   assert.ok(row.reward_id);assert.equal(row.user_id,row.reward_user_id);
   assert.equal(row.title,TITLE);assert.equal(row.body,BODY);assert.equal(row.sender_type,'ADMIN');
   assert.equal(row.message_type,gift.messageType);assert.equal(row.reward_type,gift.rewardType);assert.equal(row.reward_amount,String(gift.rewardAmount));
   assert.ok(receipt.messageIds.includes(row.message_id));assert.ok(receipt.rewardIds.includes(row.reward_id));
   if(unclaimed){assert.equal(row.claimed_at,null);assert.equal(row.hidden_at,null);assert.equal(Number(row.is_read),0);}
  }
  campaigns.push({campaignKey:gift.campaignKey,rewardType:gift.rewardType,recipients:members.length,rewardAmount:String(gift.rewardAmount),totalAmount:String(BigInt(COUNT)*BigInt(gift.rewardAmount)),claimed:members.filter(row=>row.claimed_at).length,duplicates:members.length-new Set(members.map(row=>row.user_id)).size});
 }
 if(receipt.auditId){
  const audit=(await client.query("SELECT after_data FROM admin_logs WHERE id=$1 AND action_type='MANGSUNI_RESCUE_MESSAGE_SEND' AND target_id=$2",[receipt.auditId,OPERATION_KEY])).rows;
  assert.equal(audit.length,1,'Missing campaign audit');
  const {auditId,...audited}=receipt;assert.deepEqual(JSON.parse(audit[0].after_data),audited,'Audit receipt mismatch');
 }
 return {recipients:COUNT,messages:rows.length,rewards:rows.length,missing:0,duplicates:0,campaigns};
}

// User-authorized, one-time operation. No runtime import and no immediate balance credit.
// Two claimable messages per account preserve the existing one-reward-per-message contract.
// Recipient lock, both gifts, audit and completion receipt commit in one transaction.
export async function sendMangsuniRescue(client,{expectedRecipientHash,dryRun=false}={}){
 assert.equal(expectedRecipientHash,RECIPIENT_HASH,'Reviewed recipient hash is required');
 await client.query('BEGIN ISOLATION LEVEL READ COMMITTED');
 try{
  await client.query("SET LOCAL lock_timeout='5s'");await client.query("SET LOCAL statement_timeout='20s'");
  const reserved=await client.query('INSERT INTO app_meta(key,value,updated_at) VALUES($1,$2,CURRENT_TIMESTAMP) ON CONFLICT(key) DO NOTHING RETURNING key',[OPERATION_KEY,JSON.stringify({status:'PENDING'})]);
  if(!reserved.rows.length){
   const saved=(await client.query('SELECT value FROM app_meta WHERE key=$1',[OPERATION_KEY])).rows[0];
   const receipt=JSON.parse(saved.value),verification=await verifyMangsuniRescue(client,receipt);
   await client.query('ROLLBACK');return {receipt,verification,replayed:true};
  }
  await client.query('SELECT id FROM users WHERE id=ANY($1::bigint[]) ORDER BY id FOR SHARE',[recipients.map(r=>r.id)]);
  const plan=await inspectMangsuniRescue(client);
  assert.equal(plan.recipientHash,expectedRecipientHash);assert.equal(plan.existing.length,0,'Matching event exists; duplicate campaign blocked');
  assert.ok(plan.item?.code==='MASTER_STAR'&&plan.item.name==='마스터의 별'&&Number(plan.item.is_active)===1,'Active MASTER_STAR required');
  const owner=(await client.query("SELECT id FROM users WHERE UPPER(TRIM(role))='OWNER' AND UPPER(TRIM(status))='ACTIVE' ORDER BY id LIMIT 1")).rows[0];
  assert.ok(owner,'Active owner required for audit attribution');
  const messageIds=[],rewardIds=[];
  for(const gift of GIFTS){
   const messages=await client.query(`INSERT INTO user_messages(user_id,sender_type,title,body,message_type,campaign_key)
    SELECT id,'ADMIN',$2,$3,$4,$5 FROM unnest($1::bigint[]) AS id ORDER BY id RETURNING id::text`,
    [recipients.map(r=>r.id),TITLE,BODY,gift.messageType,gift.campaignKey]);
   assert.equal(messages.rows.length,COUNT,'Partial message insert');messageIds.push(...messages.rows.map(r=>r.id));
   const rewards=await client.query(`INSERT INTO user_message_rewards(message_id,user_id,reward_type,reward_amount)
    SELECT id,user_id,$2,$3::bigint FROM user_messages WHERE campaign_key=$1 ORDER BY user_id RETURNING id::text`,
    [gift.campaignKey,gift.rewardType,gift.rewardAmount]);
   assert.equal(rewards.rows.length,COUNT,'Partial reward insert');rewardIds.push(...rewards.rows.map(r=>r.id));
  }
  const receipt={operationKey:OPERATION_KEY,status:'COMPLETED',title:TITLE,body:BODY,count:COUNT,recipientHash:RECIPIENT_HASH,recipients,gifts:gifts(),messageIds,rewardIds,delivery:'MESSAGE',noImmediateWalletCredit:true,actor:'SYSTEM_OPS',authorization:reviewed.authorization,completedAt:new Date().toISOString()};
  const verification=await verifyMangsuniRescue(client,receipt,{unclaimed:true});
  const audit=await client.query(`INSERT INTO admin_logs(admin_id,action_type,target_type,target_id,before_data,after_data)
   VALUES($1,'MANGSUNI_RESCUE_MESSAGE_SEND','USER_MESSAGE',$2,$3,$4) RETURNING id::text`,
   [owner.id,OPERATION_KEY,JSON.stringify({existingCampaignMessages:0,oneTimeException:true}),JSON.stringify(receipt)]);
  assert.equal(audit.rows.length,1,'Audit insert missing');receipt.auditId=audit.rows[0].id;
  const updated=await client.query('UPDATE app_meta SET value=$2,updated_at=CURRENT_TIMESTAMP WHERE key=$1 RETURNING key',[OPERATION_KEY,JSON.stringify(receipt)]);
  assert.equal(updated.rows.length,1,'Completed receipt missing');
  await client.query(dryRun?'ROLLBACK':'COMMIT');
  return {receipt,verification,dryRun,replayed:false};
 }catch(error){await client.query('ROLLBACK').catch(()=>{});throw error;}
}
