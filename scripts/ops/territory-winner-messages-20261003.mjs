import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';


export const OPERATION_KEY='ops:territory:64:winner-message:20261003:v1';
export const TITLE='영토전 승리 보상';
export const ROUND={"id":"64","status":"FINISHED","battle_name":"독일차","winner_side":"B","settled_at":"2026-10-03 14:51:20","clan_season_id":"6"};
export const RECIPIENT_HASH='a958f33ae5cb95063ba6cc0f8f4198ef474f3c1cebc32c562e51f250e2bb2c5f';
export const BODY='영토전 64회차 독일차 B팀 승리 보상입니다.\n코인 3,000억 · 마스터의 별 300만 개 · 미스틱 에너지 1,000개를 보상별 메시지로 지급합니다.\n각 메시지의 보상 수령 버튼을 눌러주세요.';
export const GIFTS=[
 {rewardType:'COIN',rewardAmount:'300000000000',messageType:'COIN_REWARD',campaignKey:'territory-winner-64-20261003-v1-coin'},
 {rewardType:'MASTER_STAR',rewardAmount:'3000000',messageType:'ITEM_REWARD',campaignKey:'territory-winner-64-20261003-v1-star'},
 {rewardType:'STARLIGHT_ARMOR_CORE',rewardAmount:'1000',messageType:'ITEM_REWARD',campaignKey:'territory-winner-64-20261003-v1-mystic'}
];
const COUNT=84,query=async(client,sql,values=[])=>(await client.query(sql,values)).rows;
const fingerprint=rows=>createHash('sha256').update(JSON.stringify(rows.map(r=>[r.userId,r.side,r.clanId]))).digest('hex');

async function audience(client){
 const [round]=await query(client,'SELECT id::text,status,battle_name,winner_side,settled_at,clan_season_id::text FROM territory_war_v3_rounds WHERE id=$1',[ROUND.id]);
 assert.deepEqual(round,ROUND,'Finished round or winner changed');
 const recipients=await query(client,`SELECT p.user_id::text AS "userId",u.nickname,u.status,p.status AS "participantStatus",p.side,p.clan_id::text AS "clanId",p.attacks,r.result
  FROM territory_war_v3_users p LEFT JOIN users u ON u.id=p.user_id
  LEFT JOIN territory_war_v3_rewards r ON r.round_id=p.round_id AND r.user_id=p.user_id
  WHERE p.round_id=$1 AND p.side=$2 ORDER BY p.user_id`,[ROUND.id,ROUND.winner_side]);
 assert.equal(recipients.length,COUNT,'Winning team roster count changed');
 assert.equal(new Set(recipients.map(r=>r.userId)).size,COUNT,'Duplicate winner');
 assert.ok(recipients.every(r=>r.nickname&&r.status==='ACTIVE'&&r.participantStatus==='ACTIVE'&&['WIN','INELIGIBLE'].includes(r.result)),'Unexpected winner account or result');
 const recipientHash=fingerprint(recipients);assert.equal(recipientHash,RECIPIENT_HASH,'Winning team roster changed');
 return {round,recipients,recipientHash};
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

export async function inspectTerritoryWinnerMessages(client){
 const snapshot=await audience(client);
 const existing=await query(client,`SELECT m.campaign_key,COUNT(*)::int AS messages FROM user_messages m
  WHERE m.campaign_key=ANY($1::text[]) OR (m.user_id=ANY($2::bigint[]) AND m.created_at>=$3 AND m.title LIKE '%영토전%')
  GROUP BY m.campaign_key`,[GIFTS.map(g=>g.campaignKey),snapshot.recipients.map(r=>r.userId),ROUND.settled_at]);
 const [saved]=await query(client,'SELECT value FROM app_meta WHERE key=$1',[OPERATION_KEY]);
 return {...snapshot,operationKey:OPERATION_KEY,title:TITLE,body:BODY,count:COUNT,
  gifts:GIFTS.map(g=>({...g,totalAmount:String(BigInt(g.rewardAmount)*BigInt(COUNT))})),
  existing,storage:await storage(client),receipt:saved?JSON.parse(saved.value):null};
}

export async function verifyTerritoryWinnerMessages(client,receipt,{unclaimed=false}={}){
 assert.equal(receipt.status,'COMPLETED');assert.equal(receipt.operationKey,OPERATION_KEY);
 assert.deepEqual(receipt.round,ROUND);assert.equal(receipt.title,TITLE);assert.equal(receipt.body,BODY);assert.equal(receipt.delivery,'MESSAGE');
 assert.equal(receipt.noImmediateWalletCredit,true);assert.equal(receipt.count,COUNT);
 assert.equal(receipt.recipientHash,RECIPIENT_HASH);assert.equal(receipt.recipientHash,fingerprint(receipt.recipients));
 assert.deepEqual(receipt.gifts,GIFTS.map(g=>({...g,totalAmount:String(BigInt(g.rewardAmount)*BigInt(COUNT))})));
 const rows=await query(client,`SELECT m.id::text AS message_id,m.user_id::text AS user_id,m.title,m.body,m.sender_type,m.message_type,m.campaign_key,m.is_read,m.hidden_at,
  r.id::text AS reward_id,r.user_id::text AS reward_user_id,r.reward_type,r.reward_amount::text AS reward_amount,r.claimed_at,
  c.reward_id::text AS claim_id,c.message_id::text AS claim_message_id,c.user_id::text AS claim_user_id,c.reward_type AS claim_type,c.reward_amount::text AS claim_amount,
  c.balance_before::text AS balance_before,c.balance_after::text AS balance_after
  FROM user_messages m LEFT JOIN user_message_rewards r ON r.message_id=m.id
  LEFT JOIN user_message_reward_claim_receipts_v1222 c ON c.reward_id=r.id
  WHERE m.campaign_key=ANY($1::text[]) ORDER BY m.user_id,m.campaign_key`,[GIFTS.map(g=>g.campaignKey)]);
 assert.equal(rows.length,COUNT*GIFTS.length,'Partial message delivery');
 const recipients=new Set(receipt.recipients.map(r=>r.userId)),seen=new Set(),campaigns=[];
 assert.equal(recipients.size,COUNT);
 for(const gift of GIFTS){
  const members=rows.filter(row=>row.campaign_key===gift.campaignKey);
  assert.equal(members.length,COUNT);let claimed=0;
  for(const row of members){
   assert.ok(recipients.has(row.user_id),'Unexpected recipient');const key=gift.rewardType+':'+row.user_id;
   assert.ok(!seen.has(key),'Duplicate reward');seen.add(key);assert.ok(row.reward_id);
   assert.equal(row.reward_user_id,row.user_id);assert.equal(row.reward_type,gift.rewardType);assert.equal(row.reward_amount,gift.rewardAmount);
   assert.equal(row.title,TITLE);assert.equal(row.body,BODY);assert.equal(row.sender_type,'ADMIN');assert.equal(row.message_type,gift.messageType);
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
  assert.equal(audit?.action_type,'TERRITORY_WINNER_MESSAGE_SEND');assert.equal(audit.target_id,OPERATION_KEY);
  const {auditId,...audited}=receipt;assert.deepEqual(JSON.parse(audit.after_data),audited);
 }
 return {recipients:COUNT,messages:rows.length,rewards:rows.length,missing:0,duplicates:0,campaigns};
}

// Explicitly authorized one-time message grant. Caller owns the transaction.
// Uses the completed round roster, including winners below the base reward attack threshold.
export async function sendTerritoryWinnerMessages(client,expectedRecipientHash){
 assert.match(String(expectedRecipientHash||''),/^[a-f0-9]{64}$/,'Inspected recipient hash required');
 await client.query('SELECT pg_advisory_xact_lock(hashtextextended($1,0))',[OPERATION_KEY]);
 const [saved]=await query(client,'SELECT value FROM app_meta WHERE key=$1 FOR UPDATE',[OPERATION_KEY]);
 if(saved){
  const receipt=JSON.parse(saved.value);assert.equal(receipt.recipientHash,expectedRecipientHash);
  return {receipt,verification:await verifyTerritoryWinnerMessages(client,receipt),replayed:true};
 }
 const [date]=await query(client,"SELECT to_char(CURRENT_TIMESTAMP AT TIME ZONE 'Asia/Seoul','YYYY-MM-DD') AS kst");
 assert.equal(date.kst,'2026-10-03','One-time operation date expired');
 await client.query('SELECT id FROM territory_war_v3_rounds WHERE id=$1 FOR SHARE',[ROUND.id]);
 await client.query('SELECT user_id FROM territory_war_v3_users WHERE round_id=$1 ORDER BY user_id FOR SHARE',[ROUND.id]);
 const plan=await inspectTerritoryWinnerMessages(client);
 assert.equal(plan.recipientHash,expectedRecipientHash,'Winning team roster changed; inspect again');
 assert.equal(plan.existing.length,0,'Matching messages already exist; reconcile before sending');
 const [owner]=await query(client,"SELECT id FROM users WHERE UPPER(TRIM(role))='OWNER' AND UPPER(TRIM(status))='ACTIVE' ORDER BY id LIMIT 1");
 assert.ok(owner,'Owner audit account missing');
 const messageIds=[],rewardIds=[];
 for(const gift of GIFTS){
  const messages=await query(client,`INSERT INTO user_messages(user_id,sender_type,title,body,message_type,campaign_key)
   SELECT user_id,'ADMIN',$2,$3,$4,$5 FROM unnest($1::bigint[]) AS user_id ORDER BY user_id RETURNING id::text`,
   [plan.recipients.map(r=>r.userId),TITLE,BODY,gift.messageType,gift.campaignKey]);
  assert.equal(messages.length,COUNT,'Partial message insert');messageIds.push(...messages.map(r=>r.id));
  const rewards=await query(client,`INSERT INTO user_message_rewards(message_id,user_id,reward_type,reward_amount)
   SELECT id,user_id,$2,$3::bigint FROM user_messages WHERE campaign_key=$1 ORDER BY user_id RETURNING id::text`,
   [gift.campaignKey,gift.rewardType,gift.rewardAmount]);
  assert.equal(rewards.length,COUNT,'Partial reward insert');rewardIds.push(...rewards.map(r=>r.id));
 }
 const {existing,storage:checkedStorage,receipt:unused,...details}=plan;
 const receipt={...details,status:'COMPLETED',delivery:'MESSAGE',noImmediateWalletCredit:true,messageIds,rewardIds,
  actor:'SYSTEM_OPS',authorization:'방금 영토전 종료함 승리팀에 3000억코인 마별 300만개 미스틱에너지 1000개 메세지로 지급해',
  completedAt:new Date().toISOString()};
 const verification=await verifyTerritoryWinnerMessages(client,receipt,{unclaimed:true});
 const audit=await query(client,`INSERT INTO admin_logs(admin_id,action_type,target_type,target_id,before_data,after_data)
  VALUES($1,'TERRITORY_WINNER_MESSAGE_SEND','USER_MESSAGE',$2,$3,$4) RETURNING id::text`,
  [owner.id,OPERATION_KEY,JSON.stringify({existingMessages:0,oneTimeException:true,storage:checkedStorage}),JSON.stringify(receipt)]);
 assert.equal(audit.length,1);receipt.auditId=audit[0].id;
 const stored=await query(client,'INSERT INTO app_meta(key,value,updated_at) VALUES($1,$2,CURRENT_TIMESTAMP) RETURNING key',[OPERATION_KEY,JSON.stringify(receipt)]);
 assert.equal(stored.length,1,'Completed receipt missing');
 return {receipt,verification,replayed:false};
}
