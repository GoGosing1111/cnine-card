import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import roster from './saengbyuwang-recipients-20260930.json' with {type:'json'};

export const OPERATION_KEY='ops:saengbyuwang-rewards:20260930:v1';
export const TITLE='생뷰왕 보상';
export const GIFTS=[
 {rewardType:'COIN',rewardAmount:'2000000000000',messageType:'COIN_REWARD',campaignKey:'saengbyuwang-20260930-v1-coin'},
 {rewardType:'MASTER_STAR',rewardAmount:'15000000',messageType:'ITEM_REWARD',campaignKey:'saengbyuwang-20260930-v1-star'},
 {rewardType:'STARLIGHT_ARMOR_CORE',rewardAmount:'1000',messageType:'ITEM_REWARD',campaignKey:'saengbyuwang-20260930-v1-mystic'}
];
const COUNT=50,query=async(client,sql,values=[])=>(await client.query(sql,values)).rows;
const fingerprint=rows=>createHash('sha256').update(JSON.stringify(rows.map(r=>[r.no,r.sourceKey,r.userId]))).digest('hex');
assert.equal(roster.length,COUNT);assert.equal(new Set(roster.map(r=>r.userId)).size,COUNT);
assert.equal(new Set(roster.map(r=>r.sourceKey)).size,COUNT);
for(const [index,row] of roster.entries()){
 assert.equal(row.no,index+1);assert.match(row.sourceKey,/^[a-f0-9]{8}$/);assert.match(row.userId,/^[1-9][0-9]*$/);
}

async function audience(client){
 const linked=await query(client,`SELECT v.user_id::text AS "userId",LOWER(v.provider_user_id) AS "sourceKey",u.nickname,u.status
  FROM user_second_verifications v JOIN users u ON u.id=v.user_id
  WHERE v.provider='PLAYDK' AND LOWER(v.provider_user_id)=ANY($1::text[])`,[roster.map(r=>r.sourceKey)]);
 assert.equal(linked.length,COUNT,'Verified roster count changed');
 const recipients=roster.map(expected=>{
  const candidates=linked.filter(r=>r.sourceKey===expected.sourceKey);
  assert.equal(candidates.length,1,'Ambiguous verification ID');
  assert.equal(candidates[0].userId,expected.userId,'Verified account changed');
  return {...expected,nickname:candidates[0].nickname,status:candidates[0].status};
 });
 return {recipients,recipientHash:fingerprint(recipients)};
}

async function storage(client){
 const required=[['users','coin'],['user_message_rewards','reward_amount'],['user_message_reward_claim_receipts_v1222','reward_amount'],
  ['user_message_reward_claim_receipts_v1222','balance_before'],['user_message_reward_claim_receipts_v1222','balance_after'],
  ['coin_logs','change_amount'],['coin_logs','balance_after'],['cnine_user_inventory','quantity'],['cnine_user_inventory','unseen_quantity'],
  ['inventory_logs','change_amount'],['inventory_logs','balance_after']];
 const columns=await query(client,`SELECT table_name,column_name,data_type FROM information_schema.columns
  WHERE table_schema=current_schema() AND table_name=ANY($1::text[])`,[[...new Set(required.map(([table])=>table))]]);
 const types=required.map(([table,column])=>({table,column,type:columns.find(c=>c.table_name===table&&c.column_name===column)?.data_type||'MISSING'}));
 const items=await query(client,'SELECT code,name,is_active FROM inventory_items WHERE code=ANY($1::text[]) ORDER BY code',[['MASTER_STAR','STARLIGHT_ARMOR_CORE']]);
 assert.deepEqual(items.map(r=>r.code),['MASTER_STAR','STARLIGHT_ARMOR_CORE']);
 assert.ok(items.every(r=>Number(r.is_active)===1),'Reward catalog item inactive');
 assert.equal(items[0].name,'마스터의 별');assert.equal(items[1].name,'미스틱 에너지');
 assert.ok(types.every(c=>c.type==='bigint'),'Reward storage must be BIGINT');
 return {types,items};
}

export async function inspectSaengbyuwangRewards(client){
 const snapshot=await audience(client);
 const existing=await query(client,`SELECT m.campaign_key,COUNT(*)::int AS messages FROM user_messages m
  WHERE m.campaign_key=ANY($1::text[]) OR (m.user_id=ANY($2::bigint[]) AND m.title=$3)
  GROUP BY m.campaign_key`,[GIFTS.map(g=>g.campaignKey),roster.map(r=>r.userId),TITLE]);
 const [saved]=await query(client,'SELECT value FROM app_meta WHERE key=$1',[OPERATION_KEY]);
 return {...snapshot,operationKey:OPERATION_KEY,title:TITLE,body:TITLE,count:COUNT,
  gifts:GIFTS.map(g=>({...g,totalAmount:String(BigInt(g.rewardAmount)*BigInt(COUNT))})),
  existing,storage:await storage(client),receipt:saved?JSON.parse(saved.value):null};
}

export async function verifySaengbyuwangRewards(client,receipt,{unclaimed=false}={}){
 assert.equal(receipt.status,'COMPLETED');assert.equal(receipt.operationKey,OPERATION_KEY);
 assert.equal(receipt.title,TITLE);assert.equal(receipt.body,TITLE);assert.equal(receipt.delivery,'MESSAGE');
 assert.equal(receipt.noImmediateWalletCredit,true);assert.equal(receipt.count,COUNT);
 assert.equal(receipt.recipientHash,fingerprint(roster));assert.equal(receipt.recipientHash,fingerprint(receipt.recipients));
 assert.deepEqual(receipt.gifts,GIFTS.map(g=>({...g,totalAmount:String(BigInt(g.rewardAmount)*BigInt(COUNT))})));
 const rows=await query(client,`SELECT m.id::text AS message_id,m.user_id::text AS user_id,m.title,m.body,m.sender_type,m.message_type,m.campaign_key,m.is_read,m.hidden_at,
  r.id::text AS reward_id,r.user_id::text AS reward_user_id,r.reward_type,r.reward_amount::text AS reward_amount,r.claimed_at,
  c.reward_id::text AS claim_id,c.message_id::text AS claim_message_id,c.user_id::text AS claim_user_id,c.reward_type AS claim_type,c.reward_amount::text AS claim_amount,
  c.balance_before::text AS balance_before,c.balance_after::text AS balance_after
  FROM user_messages m LEFT JOIN user_message_rewards r ON r.message_id=m.id
  LEFT JOIN user_message_reward_claim_receipts_v1222 c ON c.reward_id=r.id
  WHERE m.campaign_key=ANY($1::text[]) ORDER BY m.user_id,m.campaign_key`,[GIFTS.map(g=>g.campaignKey)]);
 assert.equal(rows.length,COUNT*GIFTS.length,'Partial message delivery');
 const recipients=new Set(roster.map(r=>r.userId)),seen=new Set(),campaigns=[];
 for(const gift of GIFTS){
  const members=rows.filter(row=>row.campaign_key===gift.campaignKey);
  assert.equal(members.length,COUNT);let claimed=0;
  for(const row of members){
   assert.ok(recipients.has(row.user_id),'Unexpected recipient');const key=gift.rewardType+':'+row.user_id;
   assert.ok(!seen.has(key),'Duplicate reward');seen.add(key);assert.ok(row.reward_id);
   assert.equal(row.reward_user_id,row.user_id);assert.equal(row.reward_type,gift.rewardType);assert.equal(row.reward_amount,gift.rewardAmount);
   assert.equal(row.title,TITLE);assert.equal(row.body,TITLE);assert.equal(row.sender_type,'ADMIN');assert.equal(row.message_type,gift.messageType);
   assert.ok(receipt.messageIds.includes(row.message_id));assert.ok(receipt.rewardIds.includes(row.reward_id));
   if(unclaimed){assert.equal(row.claimed_at,null);assert.equal(row.claim_id,null);assert.equal(row.hidden_at,null);assert.equal(Number(row.is_read),0);}
   if(row.claimed_at){
    assert.ok(row.claim_id);assert.equal(row.claim_message_id,row.message_id);assert.equal(row.claim_user_id,row.user_id);
    assert.equal(row.claim_type,gift.rewardType);assert.equal(row.claim_amount,gift.rewardAmount);
    assert.equal(BigInt(row.balance_after)-BigInt(row.balance_before),BigInt(gift.rewardAmount));claimed++;
   }else assert.equal(row.claim_id,null,'Claim receipt exists before claim');
  }
  campaigns.push({rewardType:gift.rewardType,recipients:members.length,rewardAmount:gift.rewardAmount,totalAmount:String(BigInt(gift.rewardAmount)*BigInt(COUNT)),claimed,pending:COUNT-claimed});
 }
 if(receipt.auditId){
  const [audit]=await query(client,'SELECT action_type,target_id,after_data FROM admin_logs WHERE id=$1',[receipt.auditId]);
  assert.equal(audit?.action_type,'SAENGBYUWANG_REWARD_MESSAGE_SEND');assert.equal(audit.target_id,OPERATION_KEY);
  const {auditId,...audited}=receipt;assert.deepEqual(JSON.parse(audit.after_data),audited);
 }
 return {recipients:COUNT,messages:rows.length,rewards:rows.length,missing:0,duplicates:0,campaigns};
}

// Explicitly authorized one-time message grant. Caller owns the transaction.
// Uses verified account IDs; never falls back to matching a display nickname.
export async function sendSaengbyuwangRewards(client,expectedRecipientHash){
 assert.match(String(expectedRecipientHash||''),/^[a-f0-9]{64}$/,'Inspected recipient hash required');
 await client.query('SELECT pg_advisory_xact_lock(hashtextextended($1,0))',[OPERATION_KEY]);
 const [saved]=await query(client,'SELECT value FROM app_meta WHERE key=$1 FOR UPDATE',[OPERATION_KEY]);
 if(saved){
  const receipt=JSON.parse(saved.value);assert.equal(receipt.recipientHash,expectedRecipientHash);
  return {receipt,verification:await verifySaengbyuwangRewards(client,receipt),replayed:true};
 }
 const [date]=await query(client,"SELECT to_char(CURRENT_TIMESTAMP AT TIME ZONE 'Asia/Seoul','YYYY-MM-DD') AS kst");
 assert.equal(date.kst,'2026-09-30','One-time operation date expired');
 await client.query('SELECT user_id FROM user_second_verifications WHERE user_id=ANY($1::bigint[]) ORDER BY user_id FOR SHARE',[roster.map(r=>r.userId)]);
 const plan=await inspectSaengbyuwangRewards(client);
 assert.equal(plan.recipientHash,expectedRecipientHash,'Verified roster changed; inspect again');
 assert.equal(plan.existing.length,0,'Matching messages already exist; reconcile before sending');
 const [owner]=await query(client,"SELECT id FROM users WHERE UPPER(TRIM(role))='OWNER' AND UPPER(TRIM(status))='ACTIVE' ORDER BY id LIMIT 1");
 assert.ok(owner,'Owner audit account missing');
 const messageIds=[],rewardIds=[];
 for(const gift of GIFTS){
  const messages=await query(client,`INSERT INTO user_messages(user_id,sender_type,title,body,message_type,campaign_key)
   SELECT user_id,'ADMIN',$2,$2,$3,$4 FROM unnest($1::bigint[]) AS user_id ORDER BY user_id RETURNING id::text`,
   [plan.recipients.map(r=>r.userId),TITLE,gift.messageType,gift.campaignKey]);
  assert.equal(messages.length,COUNT,'Partial message insert');messageIds.push(...messages.map(r=>r.id));
  const rewards=await query(client,`INSERT INTO user_message_rewards(message_id,user_id,reward_type,reward_amount)
   SELECT id,user_id,$2,$3::bigint FROM user_messages WHERE campaign_key=$1 ORDER BY user_id RETURNING id::text`,
   [gift.campaignKey,gift.rewardType,gift.rewardAmount]);
  assert.equal(rewards.length,COUNT,'Partial reward insert');rewardIds.push(...rewards.map(r=>r.id));
 }
 const {existing,storage:checkedStorage,receipt:unused,...details}=plan;
 const receipt={...details,status:'COMPLETED',delivery:'MESSAGE',noImmediateWalletCredit:true,messageIds,rewardIds,
  actor:'SYSTEM_OPS',authorization:'직전 인증 ID로 대조한 명단 50명 각각 코인 2조, 마스터의 별 1500만개, 미스틱에너지 1000개. 메세지로 지급해 생뷰왕 보상',
  completedAt:new Date().toISOString()};
 const verification=await verifySaengbyuwangRewards(client,receipt,{unclaimed:true});
 const audit=await query(client,`INSERT INTO admin_logs(admin_id,action_type,target_type,target_id,before_data,after_data)
  VALUES($1,'SAENGBYUWANG_REWARD_MESSAGE_SEND','USER_MESSAGE',$2,$3,$4) RETURNING id::text`,
  [owner.id,OPERATION_KEY,JSON.stringify({existingMessages:0,oneTimeException:true,storage:checkedStorage}),JSON.stringify(receipt)]);
 assert.equal(audit.length,1);receipt.auditId=audit[0].id;
 const stored=await query(client,'INSERT INTO app_meta(key,value,updated_at) VALUES($1,$2,CURRENT_TIMESTAMP) RETURNING key',[OPERATION_KEY,JSON.stringify(receipt)]);
 assert.equal(stored.length,1,'Completed receipt missing');
 return {receipt,verification,replayed:false};
}
