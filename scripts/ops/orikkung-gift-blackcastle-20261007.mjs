import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
const reviewed={authorization:'블랙케슬 한명 더 추가 지급해 — 이전 오리꿍 사은품과 동일한 보상 3종',sourceNames:['블랙케슬'],targets:[{id:'2420',nickname:'블랙캐슬',inputNickname:'블랙케슬'}]};
export const TARGETS=reviewed.targets;

export const OPERATION_KEY='ops:orikkung-gift-blackcastle:20261007:v1';
export const TITLE='오리꿍 사은품';
export const GIFTS=[
 {campaignKey:'orikkung-gift-blackcastle-coin-20261007-v1',rewardType:'COIN',rewardAmount:500_000_000_000,messageType:'COIN_REWARD'},
 {campaignKey:'orikkung-gift-blackcastle-star-20261007-v1',rewardType:'MASTER_STAR',rewardAmount:5_000_000,messageType:'ITEM_REWARD'},
 {campaignKey:'orikkung-gift-blackcastle-energy-20261007-v1',rewardType:'EMPEROR_ENERGY',rewardAmount:5,messageType:'ITEM_REWARD'}
];
const digest=rows=>createHash('sha256').update(JSON.stringify(rows)).digest('hex');
const recipients=TARGETS.map(({id,nickname,inputNickname})=>({id:String(id),nickname,inputNickname})).sort((a,b)=>Number(a.id)-Number(b.id));
assert.equal(recipients.length,1);assert.equal(new Set(recipients.map(r=>r.id)).size,1);
assert.deepEqual(TARGETS.map(r=>r.inputNickname),reviewed.sourceNames);

export async function inspectOrikkungBlackcastleGift(client){
 const users=(await client.query('SELECT id::text id,nickname,status FROM users WHERE id=ANY($1::bigint[]) ORDER BY users.id',[recipients.map(r=>r.id)])).rows;
 assert.equal(users.length,1,'Missing target account');
 for(const target of recipients){const user=users.find(u=>u.id===target.id);assert.equal(user?.nickname,target.nickname,'Nickname changed');assert.equal(user.status,'ACTIVE','Inactive target');}
 const names=(await client.query('SELECT nickname,COUNT(*)::int count FROM users WHERE nickname=ANY($1::text[]) GROUP BY nickname',[recipients.map(r=>r.nickname)])).rows;
 assert.equal(names.length,1);assert.ok(names.every(r=>r.count===1),'Ambiguous nickname');
 const existing=(await client.query(`SELECT campaign_key,COUNT(*)::int AS messages FROM user_messages
  WHERE user_id=$3 AND (campaign_key=ANY($1::text[]) OR title=$2) GROUP BY campaign_key`,[GIFTS.map(g=>g.campaignKey),TITLE,recipients[0].id])).rows;
 const saved=(await client.query('SELECT value FROM app_meta WHERE key=$1',[OPERATION_KEY])).rows[0];
 const items=(await client.query('SELECT code,name,is_active FROM inventory_items WHERE code=ANY($1::text[]) ORDER BY code',[['MASTER_STAR','EMPEROR_ENERGY']])).rows;
 return {operationKey:OPERATION_KEY,title:TITLE,body:TITLE,count:recipients.length,recipientHash:digest(recipients),recipients,
  items,
  gifts:GIFTS.map(gift=>({...gift,totalAmount:(BigInt(recipients.length)*BigInt(gift.rewardAmount)).toString()})),
  existing,receipt:saved?JSON.parse(saved.value):null};
}

export async function verifyOrikkungBlackcastleGift(client,receipt,{unclaimed=false}={}){
 assert.equal(receipt.status,'COMPLETED');assert.equal(receipt.operationKey,OPERATION_KEY);
 assert.equal(receipt.title,TITLE);assert.equal(receipt.body,TITLE);
 assert.equal(receipt.count,1);assert.deepEqual(receipt.recipients,recipients);assert.equal(receipt.recipientHash,digest(recipients));
 assert.equal(receipt.gifts.length,GIFTS.length);
 const rows=(await client.query(`SELECT m.id::text AS message_id,m.user_id::text AS user_id,m.campaign_key,m.title,m.body,
 m.sender_type,m.message_type,m.is_read,m.hidden_at,r.id::text AS reward_id,r.user_id::text AS reward_user_id,
 r.reward_type,r.reward_amount::text AS reward_amount,r.claimed_at
 FROM user_messages m LEFT JOIN user_message_rewards r ON r.message_id=m.id
 WHERE m.campaign_key=ANY($1::text[]) ORDER BY m.user_id`,[GIFTS.map(g=>g.campaignKey)])).rows;
 assert.equal(rows.length,receipt.count*GIFTS.length,'Message/reward count differs from frozen recipients');
 const campaigns=[];
 for(const gift of GIFTS){
  const saved=receipt.gifts.find(item=>item.campaignKey===gift.campaignKey);
  assert.deepEqual(saved,{...gift,totalAmount:(BigInt(receipt.count)*BigInt(gift.rewardAmount)).toString()});
  const members=rows.filter(row=>row.campaign_key===gift.campaignKey);
  assert.deepEqual(members.map(row=>row.user_id),receipt.recipients.map(row=>row.id),'Missing or duplicate recipient');
  for(const row of members){
   assert.ok(row.reward_id);assert.equal(row.user_id,row.reward_user_id);assert.equal(row.title,TITLE);assert.equal(row.body,TITLE);
   assert.equal(row.sender_type,'ADMIN');assert.equal(row.message_type,gift.messageType);
   assert.equal(row.reward_type,gift.rewardType);assert.equal(row.reward_amount,String(gift.rewardAmount));
   if(unclaimed){assert.equal(row.claimed_at,null);assert.equal(row.hidden_at,null);assert.equal(Number(row.is_read),0);}
  }
  campaigns.push({campaignKey:gift.campaignKey,recipients:members.length,rewards:members.length,
   claimed:members.filter(row=>row.claimed_at).length,duplicates:members.length-new Set(members.map(row=>row.user_id)).size});
 }
 if(receipt.auditId){
  const audit=(await client.query(`SELECT after_data FROM admin_logs WHERE id=$1 AND action_type='ORIKKUNG_GIFT_MESSAGE_SEND'
   AND target_id=$2`,[receipt.auditId,OPERATION_KEY])).rows;
  assert.equal(audit.length,1,'Missing campaign audit');
  const {auditId,verification,dryRun,replayed,...audited}=receipt;assert.deepEqual(JSON.parse(audit[0].after_data),audited,'Audit receipt mismatch');
 }
 return {messages:rows.length,rewards:rows.length,missing:0,duplicates:0,campaigns};
}

// Same reviewed three-reward transaction as orikkung-gift-20261007.mjs.
// Separate addition campaign preserves the completed original 52-account receipt.
// One-time user-authorized message campaign; never imported by game runtime.
// Three claimable messages per account preserve the existing one-reward-per-message contract.
// Frozen recipients, all three gifts, audit and receipt commit atomically; balances are credited only upon claim.
export async function sendOrikkungBlackcastleGift(client,{expectedRecipientHash,dryRun=false}={}){
 assert.match(String(expectedRecipientHash||''),/^[a-f0-9]{64}$/,'Reviewed recipient hash is required');
 assert.equal(expectedRecipientHash,digest(recipients),'Unreviewed recipient hash');
 await client.query('BEGIN ISOLATION LEVEL READ COMMITTED');
 try{
  await client.query("SET LOCAL lock_timeout='5s'");await client.query("SET LOCAL statement_timeout='20s'");
  const reserved=await client.query(`INSERT INTO app_meta(key,value,updated_at) VALUES($1,$2,CURRENT_TIMESTAMP)
   ON CONFLICT(key) DO NOTHING RETURNING key`,[OPERATION_KEY,JSON.stringify({status:'PENDING'})]);
  if(!reserved.rows.length){
   const prior=(await client.query('SELECT value FROM app_meta WHERE key=$1',[OPERATION_KEY])).rows[0];
   const receipt=JSON.parse(prior.value),verification=await verifyOrikkungBlackcastleGift(client,receipt);
   await client.query('ROLLBACK');return {...receipt,verification,replayed:true};
  }
  await client.query('SELECT id FROM users WHERE id=ANY($1::bigint[]) ORDER BY id FOR SHARE',[recipients.map(r=>r.id)]);
  const plan=await inspectOrikkungBlackcastleGift(client);
  assert.equal(plan.recipientHash,expectedRecipientHash,'Recipients changed; inspect again before sending');
  assert.equal(plan.count,1,'Expected the one additional named recipient');assert.equal(plan.existing.length,0,'Matching gift exists; duplicate campaign blocked');
  for(const code of ['MASTER_STAR','EMPEROR_ENERGY'])assert.ok(plan.items.some(item=>item.code===code&&Number(item.is_active)===1),'Active '+code+' required');
  const owner=(await client.query("SELECT id FROM users WHERE UPPER(TRIM(role))='OWNER' AND UPPER(TRIM(status))='ACTIVE' ORDER BY id LIMIT 1")).rows[0];
  assert.ok(owner,'Active owner required for audit attribution');
  for(const gift of GIFTS){
   const messages=await client.query(`INSERT INTO user_messages(user_id,sender_type,title,body,message_type,campaign_key)
    SELECT id,'ADMIN',$2,$2,$3,$4 FROM unnest($1::bigint[]) AS id ORDER BY id RETURNING id`,
    [plan.recipients.map(row=>row.id),TITLE,gift.messageType,gift.campaignKey]);
   assert.equal(messages.rows.length,plan.count,'Partial message insert');
   const rewards=await client.query(`INSERT INTO user_message_rewards(message_id,user_id,reward_type,reward_amount)
    SELECT id,user_id,$2,$3::bigint FROM user_messages WHERE campaign_key=$1 ORDER BY user_id RETURNING id`,
    [gift.campaignKey,gift.rewardType,gift.rewardAmount]);
   assert.equal(rewards.rows.length,plan.count,'Partial reward insert');
  }
  const {existing,receipt:unused,...details}=plan;
  const receipt={...details,status:'COMPLETED',delivery:'MESSAGE',actor:'SYSTEM_OPS',
   authorization:reviewed.authorization,
   eligibility:'Additional ACTIVE 블랙캐슬 account 2420; PLAYDK a2c1e499; previous named gift rosters confirm identity',completedAt:new Date().toISOString()};
  const verification=await verifyOrikkungBlackcastleGift(client,receipt,{unclaimed:true});
  const audit=await client.query(`INSERT INTO admin_logs(admin_id,action_type,target_type,target_id,before_data,after_data)
   VALUES($1,'ORIKKUNG_GIFT_MESSAGE_SEND','USER_MESSAGE',$2,$3,$4) RETURNING id`,[owner.id,OPERATION_KEY,
   JSON.stringify({existingCampaignMessages:0,oneTimeException:true}),JSON.stringify(receipt)]);
  assert.equal(audit.rows.length,1,'Audit insert missing');receipt.auditId=String(audit.rows[0].id);
  const updated=await client.query('UPDATE app_meta SET value=$2,updated_at=CURRENT_TIMESTAMP WHERE key=$1 RETURNING key',[OPERATION_KEY,JSON.stringify(receipt)]);
  assert.equal(updated.rows.length,1,'Completed receipt missing');
  await client.query(dryRun?'ROLLBACK':'COMMIT');
  return {...receipt,verification,dryRun,replayed:false};
 }catch(error){await client.query('ROLLBACK').catch(()=>{});throw error;}
}
