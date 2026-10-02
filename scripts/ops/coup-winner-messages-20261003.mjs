import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';

export const ROUND={id:'6a9e2006-6396-4037-b694-15cf5a37143b',status:'FINISHED',winner:'CHIEF',chief_user_id:'4977',chief_name:'하이희야♡',starts_at:'1790950361691',finished_at:'1790957901642'};
export const OPERATION_KEY='ops:coup:'+ROUND.id+':winner-message:20261003:v1';
export const RECIPIENT_HASH='c1a412e853b2636eb6b104cb464609b87da6b88f2b0f44463fc0759f655de59a';
export const COUNT=85;
export const TITLE='쿠데타 승리 보상';
export const BODY='2026년 10월 3일 종료된 쿠데타의 족장팀 승리 보상입니다.\n코인 2,000억 · 미스틱 에너지 1,000개 · 마스터의 별 100만 개를 보상별 메시지로 지급합니다.\n각 메시지의 보상 수령 버튼을 눌러주세요.';
export const GIFTS=[
 {rewardType:'COIN',rewardAmount:'200000000000',messageType:'COIN_REWARD',campaignKey:'coup-winner-'+ROUND.id+'-20261003-v1-coin'},
 {rewardType:'STARLIGHT_ARMOR_CORE',rewardAmount:'1000',messageType:'ITEM_REWARD',campaignKey:'coup-winner-'+ROUND.id+'-20261003-v1-mystic'},
 {rewardType:'MASTER_STAR',rewardAmount:'1000000',messageType:'ITEM_REWARD',campaignKey:'coup-winner-'+ROUND.id+'-20261003-v1-star'}
];
const query=async(client,sql,values=[])=>(await client.query(sql,values)).rows;
const fingerprint=rows=>createHash('sha256').update(JSON.stringify(rows.map(r=>[r.userId,r.side,r.joinedAt]))).digest('hex');
const giftTotals=()=>GIFTS.map(g=>({...g,totalAmount:String(BigInt(g.rewardAmount)*BigInt(COUNT))}));

async function audience(client){
 const [round]=await query(client,'SELECT id,status,winner,chief_user_id::text AS chief_user_id,chief_name,starts_at::text AS starts_at,finished_at::text AS finished_at FROM coup_rounds_v2115 WHERE id=$1',[ROUND.id]);
 assert.deepEqual(round,ROUND,'Finished coup or winner changed');
 const recipients=await query(client,`SELECT c.user_id::text AS "userId",u.nickname,u.status,c.side,c.joined_at::text AS "joinedAt",c.attacks::text AS attacks
  FROM coup_participants_v2115 c LEFT JOIN users u ON u.id=c.user_id WHERE c.round_id=$1 AND c.side=$2 ORDER BY c.user_id`,[ROUND.id,ROUND.winner]);
 assert.equal(recipients.length,COUNT,'Winning team roster count changed');
 assert.equal(new Set(recipients.map(r=>r.userId)).size,COUNT,'Duplicate winner');
 assert.ok(recipients.every(r=>r.nickname&&r.status==='ACTIVE'&&r.side===ROUND.winner),'Unexpected winner account');
 const recipientHash=fingerprint(recipients);assert.equal(recipientHash,RECIPIENT_HASH,'Winning team roster changed');
 return {round,recipients,recipientHash};
}

async function storage(client){
 const required=[['users','coin'],['user_message_rewards','reward_amount'],['user_message_reward_claim_receipts_v1222','reward_amount'],
  ['user_message_reward_claim_receipts_v1222','balance_before'],['user_message_reward_claim_receipts_v1222','balance_after'],
  ['coin_logs','change_amount'],['coin_logs','balance_after'],['cnine_user_inventory','quantity'],['cnine_user_inventory','unseen_quantity'],
  ['inventory_logs','change_amount'],['inventory_logs','balance_after']];
 const columns=await query(client,`SELECT table_name,column_name,data_type FROM information_schema.columns WHERE table_schema=current_schema() AND table_name=ANY($1::text[])`,[[...new Set(required.map(([table])=>table))]]);
 const types=required.map(([table,column])=>({table,column,type:columns.find(c=>c.table_name===table&&c.column_name===column)?.data_type||'MISSING'}));
 assert.ok(types.every(c=>c.type==='bigint'),'Reward storage must be BIGINT');
 const indexes=await query(client,"SELECT tablename,indexname,indexdef FROM pg_indexes WHERE schemaname=current_schema() AND tablename=ANY($1::text[])",[['user_messages','user_message_rewards','user_message_reward_claim_receipts_v1222']]);
 for(const [table,columnsToCheck] of [['user_messages','(user_id, campaign_key)'],['user_message_rewards','(message_id)'],['user_message_reward_claim_receipts_v1222','(reward_id)'],['user_message_reward_claim_receipts_v1222','(message_id)']]){
  assert.ok(indexes.some(i=>i.tablename===table&&i.indexdef.startsWith('CREATE UNIQUE INDEX')&&i.indexdef.includes(columnsToCheck)),'Required message uniqueness missing: '+table+columnsToCheck);
 }
 const items=await query(client,'SELECT code,name,is_active FROM inventory_items WHERE code=ANY($1::text[]) ORDER BY code',[['MASTER_STAR','STARLIGHT_ARMOR_CORE']]);
 assert.deepEqual(items.map(r=>r.code),['MASTER_STAR','STARLIGHT_ARMOR_CORE']);assert.ok(items.every(r=>Number(r.is_active)===1),'Reward catalog item inactive');
 assert.equal(items[0].name,'마스터의 별');assert.equal(items[1].name,'미스틱 에너지');
 return {types,items};
}

export async function inspect(client){
 const snapshot=await audience(client);
 const existing=await query(client,`SELECT m.campaign_key,m.title,r.reward_type,r.reward_amount::text AS reward_amount,COUNT(*)::int AS messages
  FROM user_messages m LEFT JOIN user_message_rewards r ON r.message_id=m.id
  WHERE m.campaign_key=ANY($1::text[]) OR (m.user_id=ANY($2::bigint[]) AND m.created_at>=$3 AND (m.title LIKE '%쿠데타%' OR m.body LIKE '%쿠데타%'))
  GROUP BY m.campaign_key,m.title,r.reward_type,r.reward_amount ORDER BY m.campaign_key`,[GIFTS.map(g=>g.campaignKey),snapshot.recipients.map(r=>r.userId),'2026-10-02 16:18:21']);
 const [saved]=await query(client,'SELECT value FROM app_meta WHERE key=$1',[OPERATION_KEY]);
 return {...snapshot,operationKey:OPERATION_KEY,title:TITLE,body:BODY,count:COUNT,gifts:giftTotals(),existing,storage:await storage(client),receipt:saved?JSON.parse(saved.value):null};
}

export async function verify(client,receipt,{unclaimed=false}={}){
 assert.equal(receipt.status,'COMPLETED');assert.equal(receipt.operationKey,OPERATION_KEY);assert.deepEqual(receipt.round,ROUND);
 assert.equal(receipt.title,TITLE);assert.equal(receipt.body,BODY);assert.equal(receipt.delivery,'MESSAGE');assert.equal(receipt.noImmediateWalletCredit,true);
 assert.equal(receipt.count,COUNT);assert.equal(receipt.recipientHash,RECIPIENT_HASH);assert.equal(receipt.recipientHash,fingerprint(receipt.recipients));assert.deepEqual(receipt.gifts,giftTotals());
 const rows=await query(client,`SELECT m.id::text AS message_id,m.user_id::text AS user_id,m.title,m.body,m.sender_type,m.message_type,m.campaign_key,m.is_read,m.hidden_at,
  r.id::text AS reward_id,r.user_id::text AS reward_user_id,r.reward_type,r.reward_amount::text AS reward_amount,r.claimed_at,
  c.reward_id::text AS claim_id,c.message_id::text AS claim_message_id,c.user_id::text AS claim_user_id,c.reward_type AS claim_type,c.reward_amount::text AS claim_amount,
  c.balance_before::text AS balance_before,c.balance_after::text AS balance_after
  FROM user_messages m LEFT JOIN user_message_rewards r ON r.message_id=m.id
  LEFT JOIN user_message_reward_claim_receipts_v1222 c ON c.reward_id=r.id WHERE m.campaign_key=ANY($1::text[]) ORDER BY m.user_id,m.campaign_key`,[GIFTS.map(g=>g.campaignKey)]);
 assert.equal(rows.length,COUNT*GIFTS.length,'Partial message delivery');
 assert.equal(receipt.messageIds.length,rows.length);assert.equal(new Set(receipt.messageIds).size,rows.length);
 assert.equal(receipt.rewardIds.length,rows.length);assert.equal(new Set(receipt.rewardIds).size,rows.length);
 const recipients=new Set(receipt.recipients.map(r=>r.userId)),seen=new Set(),campaigns=[];assert.equal(recipients.size,COUNT);
 for(const gift of GIFTS){
  const members=rows.filter(row=>row.campaign_key===gift.campaignKey);assert.equal(members.length,COUNT);let claimed=0;
  for(const row of members){
   assert.ok(recipients.has(row.user_id),'Unexpected recipient');const key=gift.rewardType+':'+row.user_id;assert.ok(!seen.has(key),'Duplicate reward');seen.add(key);
   assert.ok(row.reward_id);assert.equal(row.reward_user_id,row.user_id);assert.equal(row.reward_type,gift.rewardType);assert.equal(row.reward_amount,gift.rewardAmount);
   assert.equal(row.title,TITLE);assert.equal(row.body,BODY);assert.equal(row.sender_type,'ADMIN');assert.equal(row.message_type,gift.messageType);
   assert.ok(receipt.messageIds.includes(row.message_id));assert.ok(receipt.rewardIds.includes(row.reward_id));
   if(unclaimed){assert.equal(row.claimed_at,null);assert.equal(row.claim_id,null);assert.equal(row.hidden_at,null);assert.equal(Number(row.is_read),0);}
   if(row.claimed_at){
    assert.ok(row.claim_id);assert.equal(row.claim_message_id,row.message_id);assert.equal(row.claim_user_id,row.user_id);assert.equal(row.claim_type,gift.rewardType);assert.equal(row.claim_amount,gift.rewardAmount);
    assert.equal(BigInt(row.balance_after)-BigInt(row.balance_before),BigInt(gift.rewardAmount));claimed++;
   }else assert.equal(row.claim_id,null,'Claim receipt exists before claim');
  }
  campaigns.push({rewardType:gift.rewardType,recipients:members.length,rewardAmount:gift.rewardAmount,totalAmount:String(BigInt(gift.rewardAmount)*BigInt(COUNT)),claimed,pending:COUNT-claimed});
 }
 if(receipt.auditId){
  const [audit]=await query(client,'SELECT action_type,target_id,after_data FROM admin_logs WHERE id=$1',[receipt.auditId]);
  assert.equal(audit?.action_type,'COUP_WINNER_MESSAGE_SEND');assert.equal(audit.target_id,OPERATION_KEY);
  const {auditId,...audited}=receipt;assert.deepEqual(JSON.parse(audit.after_data),audited);
 }
 return {recipients:COUNT,messages:rows.length,rewards:rows.length,missing:0,duplicates:0,campaigns};
}

// Explicit one-time grant; caller owns the transaction. Include the entire
// finished winning roster, because the user specified no attack threshold.
export async function send(client,expectedRecipientHash){
 assert.equal(expectedRecipientHash,RECIPIENT_HASH,'Inspected recipient hash required');
 await client.query('SELECT pg_advisory_xact_lock(hashtextextended($1,0))',[OPERATION_KEY]);
 const [saved]=await query(client,'SELECT value FROM app_meta WHERE key=$1 FOR UPDATE',[OPERATION_KEY]);
 if(saved){const receipt=JSON.parse(saved.value);assert.equal(receipt.recipientHash,expectedRecipientHash);return {receipt,verification:await verify(client,receipt),replayed:true};}
 const [date]=await query(client,"SELECT to_char(CURRENT_TIMESTAMP AT TIME ZONE 'Asia/Seoul','YYYY-MM-DD') AS kst");assert.equal(date.kst,'2026-10-03','One-time operation date expired');
 await client.query('SELECT id FROM coup_rounds_v2115 WHERE id=$1 FOR SHARE',[ROUND.id]);
 await client.query('SELECT user_id FROM coup_participants_v2115 WHERE round_id=$1 ORDER BY user_id FOR SHARE',[ROUND.id]);
 await client.query('SELECT u.id FROM users u JOIN coup_participants_v2115 c ON c.user_id=u.id WHERE c.round_id=$1 AND c.side=$2 ORDER BY u.id FOR SHARE OF u',[ROUND.id,ROUND.winner]);
 const plan=await inspect(client);assert.equal(plan.recipientHash,expectedRecipientHash,'Winning roster changed; inspect again');assert.equal(plan.existing.length,0,'Matching messages already exist; reconcile before sending');
 const [owner]=await query(client,"SELECT id FROM users WHERE UPPER(TRIM(role))='OWNER' AND UPPER(TRIM(status))='ACTIVE' ORDER BY id LIMIT 1");assert.ok(owner,'Owner audit account missing');
 const messageIds=[],rewardIds=[];
 for(const gift of GIFTS){
  const messages=await query(client,`INSERT INTO user_messages(user_id,sender_type,title,body,message_type,campaign_key)
   SELECT user_id,'ADMIN',$2,$3,$4,$5 FROM unnest($1::bigint[]) AS user_id ORDER BY user_id RETURNING id::text`,[plan.recipients.map(r=>r.userId),TITLE,BODY,gift.messageType,gift.campaignKey]);
  assert.equal(messages.length,COUNT,'Partial message insert');messageIds.push(...messages.map(r=>r.id));
  const rewards=await query(client,`INSERT INTO user_message_rewards(message_id,user_id,reward_type,reward_amount)
   SELECT id,user_id,$2,$3::bigint FROM user_messages WHERE campaign_key=$1 ORDER BY user_id RETURNING id::text`,[gift.campaignKey,gift.rewardType,gift.rewardAmount]);
  assert.equal(rewards.length,COUNT,'Partial reward insert');rewardIds.push(...rewards.map(r=>r.id));
 }
 const {existing,storage:checkedStorage,receipt:unused,...details}=plan;
 const receipt={...details,status:'COMPLETED',delivery:'MESSAGE',noImmediateWalletCredit:true,messageIds,rewardIds,actor:'SYSTEM_OPS',
  authorization:'승리팀 : 2000억 + 미스틱에너지 1000개 + 마별 100만개 지급해 메세지로',completedAt:new Date().toISOString()};
 const verification=await verify(client,receipt,{unclaimed:true});
 const audit=await query(client,`INSERT INTO admin_logs(admin_id,action_type,target_type,target_id,before_data,after_data)
  VALUES($1,'COUP_WINNER_MESSAGE_SEND','USER_MESSAGE',$2,$3,$4) RETURNING id::text`,[owner.id,OPERATION_KEY,JSON.stringify({existingMessages:0,oneTimeException:true,storage:checkedStorage}),JSON.stringify(receipt)]);
 assert.equal(audit.length,1,'Missing audit');receipt.auditId=audit[0].id;
 const stored=await query(client,'INSERT INTO app_meta(key,value,updated_at) VALUES($1,$2,CURRENT_TIMESTAMP) RETURNING key',[OPERATION_KEY,JSON.stringify(receipt)]);assert.equal(stored.length,1,'Missing completed receipt');
 return {receipt,verification,replayed:false};
}
