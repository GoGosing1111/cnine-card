import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import reviewed from './pingdu-thanks-list39-20261003.targets.json' with {type:'json'};
export const CAMPAIGN_KEY='pingdu-thanks-list39-20261003-v1';
export const OPERATION_PREFIX='ops:pingdu-thanks-list39:20261003:v1';
export const TITLE='핑두의 감사선물';
export const ITEM_CODE='PINGDU_THANKS_GIFT_BOX';
export const TARGETS=reviewed.targets;
const q=async(client,sql,args=[])=>(await client.query(sql,args)).rows;
const digest=value=>createHash('sha256').update(JSON.stringify(value)).digest('hex');
const parse=value=>typeof value==='string'?JSON.parse(value):value;
export function normalizeTargets(targets){
 assert.ok(Array.isArray(targets)&&targets.length===39);
 const rows=targets.map(t=>({id:String(t.id),nickname:t.nickname,inputNickname:t.inputNickname,quantity:1})).sort((a,b)=>Number(a.id)-Number(b.id));
 assert.equal(new Set(rows.map(t=>t.id)).size,rows.length,'Duplicate account');assert.equal(new Set(rows.map(t=>t.inputNickname)).size,rows.length,'Duplicate source');
 for(const row of rows){
  assert.match(row.id,/^[1-9]\d*$/);assert.ok(reviewed.sourceNames.includes(row.inputNickname),'Not in authorized source list');
  const approved=reviewed.targets.find(t=>t.inputNickname===row.inputNickname);
  assert.ok(approved&&String(approved.id)===row.id&&approved.nickname===row.nickname&&approved.quantity===1,'Unreviewed identity');
 }
 return rows;
}
export async function inspectList39Gift(client,targets=TARGETS){
 const recipients=normalizeTargets(targets),ids=recipients.map(t=>t.id),recipientHash=digest(recipients),operationKey=OPERATION_PREFIX+':'+recipientHash.slice(0,24);
 const users=await q(client,'SELECT id::text id,nickname,status FROM users WHERE id=ANY($1::bigint[]) ORDER BY users.id',[ids]);
 assert.equal(users.length,recipients.length);
 for(const row of recipients){const user=users.find(u=>u.id===row.id);assert.equal(user?.nickname,row.nickname,'Nickname changed');assert.equal(user.status,'ACTIVE','Inactive account');}
 const names=await q(client,'SELECT nickname,COUNT(*)::integer count FROM users WHERE nickname=ANY($1::text[]) GROUP BY nickname',[recipients.map(t=>t.nickname)]);
 assert.equal(names.length,recipients.length);assert.ok(names.every(n=>n.count===1),'Ambiguous nickname');
 const [item]=await q(client,'SELECT code,name,is_active FROM inventory_items WHERE code=$1',[ITEM_CODE]);assert.equal(item?.name,'핑두의 감사 선물');assert.equal(Number(item.is_active),1);
 // Previous gifts for other events do not exclude a recipient from this event.
 const existing=await q(client,'SELECT m.id::text message_id,m.user_id::text user_id FROM user_messages m LEFT JOIN user_message_rewards r ON r.message_id=m.id WHERE m.user_id=ANY($1::bigint[]) AND m.campaign_key=$2 ORDER BY m.user_id,m.id',[ids,CAMPAIGN_KEY]);
 const [saved]=await q(client,'SELECT value FROM app_meta WHERE key=$1',[operationKey]);
 return {operationKey,campaignKey:CAMPAIGN_KEY,recipientHash,recipients,count:recipients.length,boxes:recipients.length,title:TITLE,itemCode:ITEM_CODE,existing,receipt:saved?parse(saved.value):null};
}
export async function verifyList39Gift(client,receipt,{unclaimed=false}={}){
 const recipients=normalizeTargets(receipt.recipients),ids=recipients.map(t=>t.id);
 assert.equal(receipt.status,'COMPLETED');assert.equal(receipt.campaignKey,CAMPAIGN_KEY);assert.equal(receipt.title,TITLE);assert.equal(receipt.itemCode,ITEM_CODE);
 assert.equal(receipt.recipientHash,digest(recipients));assert.equal(receipt.operationKey,OPERATION_PREFIX+':'+receipt.recipientHash.slice(0,24));assert.equal(receipt.count,ids.length);assert.equal(receipt.boxes,ids.length);
 const rows=await q(client,'SELECT m.id::text message_id,m.user_id::text user_id,m.title,m.body,m.sender_type,m.message_type,m.is_read,m.hidden_at,r.id::text reward_id,r.user_id::text reward_user_id,r.reward_type,r.reward_amount::text reward_amount,r.claimed_at FROM user_messages m LEFT JOIN user_message_rewards r ON r.message_id=m.id WHERE m.campaign_key=$1 AND m.user_id=ANY($2::bigint[]) ORDER BY m.user_id,m.id',[CAMPAIGN_KEY,ids]);
 assert.equal(rows.length,ids.length);assert.deepEqual(rows.map(r=>r.user_id),ids,'Missing or duplicate recipient');
 for(const row of rows){assert.ok(row.reward_id);assert.equal(row.reward_user_id,row.user_id);assert.equal(row.reward_type,ITEM_CODE);assert.equal(row.reward_amount,'1');assert.equal(row.title,TITLE);assert.equal(row.body,TITLE);assert.equal(row.sender_type,'ADMIN');assert.equal(row.message_type,'ITEM_REWARD');if(unclaimed){assert.equal(row.claimed_at,null);assert.equal(row.hidden_at,null);assert.equal(Number(row.is_read),0);}}
 if(receipt.auditId){const [audit]=await q(client,"SELECT after_data FROM admin_logs WHERE id=$1 AND action_type='PINGDU_THANKS_LIST39_SEND' AND target_id=$2",[receipt.auditId,receipt.operationKey]);assert.ok(audit);const {auditId,...audited}=receipt;assert.deepEqual(parse(audit.after_data),audited);}
 return {messages:rows.length,rewards:rows.length,boxes:rows.length,missing:0,duplicates:0,claimed:rows.filter(r=>r.claimed_at).length,rows};
}
export async function sendList39Gift(client,targets=TARGETS,{expectedRecipientHash,dryRun=false,failAfterMessages=false}={}){
 const recipients=normalizeTargets(targets),hash=digest(recipients),operationKey=OPERATION_PREFIX+':'+hash.slice(0,24);assert.equal(expectedRecipientHash,hash);
 // Account balances change continuously during play. Lock the identified users
 // before validating them; the campaign lock serializes this event's batches.
 await client.query('BEGIN ISOLATION LEVEL READ COMMITTED');
 try{
  await client.query("SET LOCAL lock_timeout='5s'");await client.query("SET LOCAL statement_timeout='20s'");
  await q(client,'SELECT pg_advisory_xact_lock(hashtextextended($1,0))',[CAMPAIGN_KEY]);
  const reserved=await q(client,'INSERT INTO app_meta(key,value,updated_at) VALUES($1,$2,CURRENT_TIMESTAMP) ON CONFLICT(key) DO NOTHING RETURNING key',[operationKey,JSON.stringify({status:'PENDING'})]);
  if(!reserved.length){const [saved]=await q(client,'SELECT value FROM app_meta WHERE key=$1',[operationKey]);const receipt=parse(saved.value),verification=await verifyList39Gift(client,receipt);await client.query('ROLLBACK');return {receipt,verification,replayed:true};}
  await q(client,'SELECT id FROM users WHERE id=ANY($1::bigint[]) ORDER BY id FOR SHARE',[recipients.map(t=>t.id)]);
  const plan=await inspectList39Gift(client,recipients);assert.equal(plan.existing.length,0,'This event was already sent without the matching receipt');
  const [owner]=await q(client,"SELECT id FROM users WHERE id=1 AND role='OWNER' AND status='ACTIVE'");assert.ok(owner);
  const messages=await q(client,"INSERT INTO user_messages(user_id,sender_type,title,body,message_type,campaign_key) SELECT id,'ADMIN',$2,$2,'ITEM_REWARD',$3 FROM unnest($1::bigint[]) AS t(id) ORDER BY id RETURNING id",[recipients.map(t=>t.id),TITLE,CAMPAIGN_KEY]);assert.equal(messages.length,plan.count);
  if(failAfterMessages)throw Error('EXPECTED_PARTIAL_MESSAGE_FAILURE');
  const rewards=await q(client,'INSERT INTO user_message_rewards(message_id,user_id,reward_type,reward_amount) SELECT id,user_id,$2,1 FROM user_messages WHERE id=ANY($1::bigint[]) ORDER BY user_id RETURNING id',[messages.map(m=>m.id),ITEM_CODE]);assert.equal(rewards.length,plan.count);
  const receipt={status:'COMPLETED',operationKey,campaignKey:CAMPAIGN_KEY,recipientHash:hash,count:plan.count,boxes:plan.count,title:TITLE,itemCode:ITEM_CODE,delivery:'MESSAGE',quantityEach:1,authorization:reviewed.authorization,recipients,completedAt:new Date().toISOString()};
  await verifyList39Gift(client,receipt,{unclaimed:true});
  const [audit]=await q(client,"INSERT INTO admin_logs(admin_id,action_type,target_type,target_id,before_data,after_data) VALUES($1,'PINGDU_THANKS_LIST39_SEND','USER_MESSAGE',$2,$3,$4) RETURNING id",[owner.id,operationKey,JSON.stringify({existingMessages:0}),JSON.stringify(receipt)]);assert.ok(audit);receipt.auditId=String(audit.id);
  assert.equal((await q(client,'UPDATE app_meta SET value=$2,updated_at=CURRENT_TIMESTAMP WHERE key=$1 RETURNING key',[operationKey,JSON.stringify(receipt)])).length,1);
  await client.query(dryRun?'ROLLBACK':'COMMIT');return {receipt,dryRun,replayed:false};
 }catch(error){await client.query('ROLLBACK').catch(()=>{});throw error;}
}
