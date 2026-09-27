import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
export const CAMPAIGN_KEY='ayoon-pinball-gift-20260928-v1';
export const OPERATION_PREFIX='ops:ayoon-pinball-gift:20260928:v1';
export const TITLE='아윤방 핀볼 이벤트';
export const ITEM_CODE='TOURNAMENT_GIFT_BOX';
const digest=rows=>createHash('sha256').update(JSON.stringify(rows)).digest('hex');
const parse=value=>typeof value==='string'?JSON.parse(value):value;
export function normalizeTargets(targets){
 assert.ok(Array.isArray(targets)&&targets.length>0&&targets.length<=63,'Bounded confirmed recipients required');
 const rows=targets.map(({id,nickname,soop})=>({id:String(id),nickname,soop})).sort((a,b)=>Number(a.id)-Number(b.id));
 assert.equal(new Set(rows.map(r=>r.id)).size,rows.length,'Duplicate recipient');assert.equal(new Set(rows.map(r=>r.soop)).size,rows.length,'Duplicate donor');
 for(const r of rows){assert.match(r.id,/^[1-9]\d*$/);assert.ok(typeof r.nickname==='string'&&r.nickname.length>0);assert.ok(typeof r.soop==='string'&&r.soop.length>0)}
 return rows;
}
export async function inspectPinballGift(client,targets){
 const recipients=normalizeTargets(targets),recipientHash=digest(recipients),operationKey=`${OPERATION_PREFIX}:${recipientHash.slice(0,24)}`;
 const ids=recipients.map(r=>r.id);
 const users=(await client.query('SELECT id::text AS id,nickname,status,role FROM users WHERE id=ANY($1::bigint[]) ORDER BY users.id',[ids])).rows;
 assert.equal(users.length,recipients.length,'Missing account');
 for(const r of recipients){const u=users.find(u=>u.id===r.id);assert.equal(u?.nickname,r.nickname,'Recipient nickname changed');assert.equal(u.status,'ACTIVE');assert.equal(u.role,'USER')}
 const [item]=(await client.query('SELECT code,name,is_active FROM inventory_items WHERE code=$1',[ITEM_CODE])).rows;
 assert.equal(item?.name,'대회 사은품');assert.equal(Number(item.is_active),1,'Gift item is disabled');
 const existing=(await client.query(`SELECT m.id::text AS id,m.user_id::text AS user_id,m.campaign_key,r.reward_type,r.reward_amount::text AS reward_amount
  FROM user_messages m LEFT JOIN user_message_rewards r ON r.message_id=m.id WHERE m.user_id=ANY($1::bigint[])
  AND (m.campaign_key=$2 OR (m.title=$3 AND r.reward_type=$4)) ORDER BY m.user_id,m.id LIMIT 165`,[ids,CAMPAIGN_KEY,TITLE,ITEM_CODE])).rows;
 const [saved]=(await client.query('SELECT value FROM app_meta WHERE key=$1',[operationKey])).rows;
 return {operationKey,campaignKey:CAMPAIGN_KEY,title:TITLE,body:TITLE,itemCode:ITEM_CODE,quantity:1,count:recipients.length,recipientHash,recipients,item,existing,receipt:saved?parse(saved.value):null};
}
export async function verifyPinballGift(client,receipt,{unclaimed=false}={}){
 assert.equal(receipt.status,'COMPLETED');assert.equal(receipt.campaignKey,CAMPAIGN_KEY);assert.equal(receipt.title,TITLE);assert.equal(receipt.body,TITLE);
 assert.equal(receipt.itemCode,ITEM_CODE);assert.equal(receipt.quantity,1);assert.equal(receipt.count,receipt.recipients.length);
 assert.deepEqual(normalizeTargets(receipt.recipients),receipt.recipients);assert.equal(receipt.recipientHash,digest(receipt.recipients));
 assert.equal(receipt.operationKey,`${OPERATION_PREFIX}:${receipt.recipientHash.slice(0,24)}`);
 const rows=(await client.query(`SELECT m.id::text AS message_id,m.user_id::text AS user_id,m.title,m.body,m.sender_type,m.message_type,m.is_read,m.hidden_at,
  r.id::text AS reward_id,r.user_id::text AS reward_user_id,r.reward_type,r.reward_amount::text AS reward_amount,r.claimed_at
  FROM user_messages m LEFT JOIN user_message_rewards r ON r.message_id=m.id
  WHERE m.campaign_key=$1 AND m.user_id=ANY($2::bigint[]) ORDER BY m.user_id,m.id`,[CAMPAIGN_KEY,receipt.recipients.map(r=>r.id)])).rows;
 assert.equal(rows.length,receipt.count,'Message/reward count mismatch');assert.deepEqual(rows.map(r=>r.user_id),receipt.recipients.map(r=>r.id));
 for(const r of rows){assert.ok(r.reward_id);assert.equal(r.reward_user_id,r.user_id);assert.equal(r.title,TITLE);assert.equal(r.body,TITLE);assert.equal(r.sender_type,'ADMIN');assert.equal(r.message_type,'ITEM_REWARD');assert.equal(r.reward_type,ITEM_CODE);assert.equal(r.reward_amount,'1');if(unclaimed){assert.equal(r.claimed_at,null);assert.equal(r.hidden_at,null);assert.equal(Number(r.is_read),0)}}
 if(receipt.auditId){
  const [audit]=(await client.query("SELECT after_data FROM admin_logs WHERE id=$1 AND action_type='AYOON_PINBALL_MESSAGE_SEND' AND target_id=$2",[receipt.auditId,receipt.operationKey])).rows;
  assert.ok(audit,'Missing audit');const {auditId,verification,dryRun,replayed,...audited}=receipt;assert.deepEqual(parse(audit.after_data),audited);
 }
 return {messages:rows.length,rewards:rows.length,duplicates:0,missing:0,claimed:rows.filter(r=>r.claimed_at).length,rows};
}
// An additional event: prior funding gifts do not exclude recipients.
// Explicitly authorized targeted campaign, outside the game runtime. No wallet,
// inventory or user account updates; recipients claim the attached box themselves.
export async function sendPinballGift(client,targets,{expectedRecipientHash,dryRun=false}={}){
 const recipients=normalizeTargets(targets),hash=digest(recipients),operationKey=`${OPERATION_PREFIX}:${hash.slice(0,24)}`;
 assert.equal(expectedRecipientHash,hash,'Reviewed recipient hash required');
 await client.query('BEGIN ISOLATION LEVEL REPEATABLE READ');
 try{
  await client.query("SET LOCAL lock_timeout='5s'");await client.query("SET LOCAL statement_timeout='20s'");
  const reserved=await client.query('INSERT INTO app_meta(key,value,updated_at) VALUES($1,$2,CURRENT_TIMESTAMP) ON CONFLICT(key) DO NOTHING RETURNING key',[operationKey,JSON.stringify({status:'PENDING'})]);
  if(!reserved.rows.length){
   const [saved]=(await client.query('SELECT value FROM app_meta WHERE key=$1',[operationKey])).rows;const receipt=parse(saved.value);
   const verification=await verifyPinballGift(client,receipt);await client.query('ROLLBACK');return {...receipt,verification,replayed:true};
  }
  const plan=await inspectPinballGift(client,recipients);assert.equal(plan.recipientHash,expectedRecipientHash);assert.equal(plan.existing.length,0,'This pinball event already sent to a recipient');
  const [owner]=(await client.query("SELECT id FROM users WHERE id=1 AND role='OWNER' AND status='ACTIVE'")).rows;assert.ok(owner,'Active operator required');
  const inserted=await client.query(`INSERT INTO user_messages(user_id,sender_type,title,body,message_type,campaign_key)
   SELECT id,'ADMIN',$2,$2,'ITEM_REWARD',$3 FROM unnest($1::bigint[]) AS id ORDER BY id RETURNING id`,[recipients.map(r=>r.id),TITLE,CAMPAIGN_KEY]);
  assert.equal(inserted.rows.length,plan.count,'Partial message insert');
  const rewards=await client.query(`INSERT INTO user_message_rewards(message_id,user_id,reward_type,reward_amount)
   SELECT id,user_id,$2,1 FROM user_messages WHERE campaign_key=$1 AND user_id=ANY($3::bigint[]) ORDER BY user_id RETURNING id`,[CAMPAIGN_KEY,ITEM_CODE,recipients.map(r=>r.id)]);
  assert.equal(rewards.rows.length,plan.count,'Partial reward insert');
  const {item,existing,receipt:unused,...details}=plan;
  const receipt={...details,status:'COMPLETED',delivery:'MESSAGE',actor:'SYSTEM_OPS',authorization:'명단 대조 후 아윤방 핀볼 이벤트 메시지로 계정당 1개 추가 지급. 횟수 무관. 오늘 지급내역 있어도 지급하라고 총2회야',completedAt:new Date().toISOString()};
  const verification=await verifyPinballGift(client,receipt,{unclaimed:true});
  const audit=await client.query("INSERT INTO admin_logs(admin_id,action_type,target_type,target_id,before_data,after_data) VALUES($1,'AYOON_PINBALL_MESSAGE_SEND','USER_MESSAGE',$2,$3,$4) RETURNING id",[owner.id,operationKey,JSON.stringify({existingMessages:0}),JSON.stringify(receipt)]);
  assert.equal(audit.rows.length,1,'Missing audit');receipt.auditId=String(audit.rows[0].id);
  const updated=await client.query('UPDATE app_meta SET value=$2,updated_at=CURRENT_TIMESTAMP WHERE key=$1 RETURNING key',[operationKey,JSON.stringify(receipt)]);assert.equal(updated.rows.length,1,'Missing completed receipt');
  await client.query(dryRun?'ROLLBACK':'COMMIT');return {...receipt,verification,dryRun,replayed:false};
 }catch(error){await client.query('ROLLBACK').catch(()=>{});throw error}
}
