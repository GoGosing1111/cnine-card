import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import source from './pingdu-thanks-ppanghun-20261002.source.json' with {type:'json'};
export const CAMPAIGN_KEY='pingdu-thanks-ppanghun-20261002-v1';
export const OPERATION_PREFIX='ops:pingdu-thanks-ppanghun:20261002:v1';
export const TITLE='핑두의 감사 선물';
export const ITEM_CODE='PINGDU_THANKS_GIFT_BOX';
const digest=rows=>createHash('sha256').update(JSON.stringify(rows)).digest('hex');
const parse=value=>typeof value==='string'?JSON.parse(value):value;
const q=async(client,sql,args=[])=>(await client.query(sql,args)).rows;
export const bodyFor=quantity=>`빵훈 방 참여에 감사드립니다.\n핑두의 감사 선물 ${quantity}개를 지급합니다.\n메시지 보상을 수령한 뒤 인벤토리에서 상자를 개봉해 주세요.`;
export function quantityFor(soop,total){
 assert.ok(Number.isSafeInteger(total)&&total>=100,'At least 100 contributions required');
 return source.userOverride[soop]??Math.min(5,Math.floor(total/100));
}
export function normalizeTargets(targets){
 assert.ok(Array.isArray(targets)&&targets.length>0&&targets.length<=76,'Bounded confirmed recipients required');
 const rows=targets.map(({id,nickname,soop,total,quantity,playdkId})=>({id:String(id),nickname,soop,total,quantity,playdkId})).sort((a,b)=>Number(a.id)-Number(b.id));
 assert.equal(new Set(rows.map(r=>r.id)).size,rows.length,'Duplicate recipient');assert.equal(new Set(rows.map(r=>r.soop)).size,rows.length,'Duplicate source');
 for(const row of rows){
  assert.match(row.id,/^[1-9]\d*$/);assert.ok(typeof row.nickname==='string'&&row.nickname.trim()===row.nickname&&row.nickname.length>0);
  assert.ok(typeof row.playdkId==='string'&&row.playdkId.length>0);
  const original=source.entries.find(([soop])=>soop===row.soop);assert.ok(original,'Recipient source not in authorized list');assert.equal(row.total,original[2],'Contribution changed');
  assert.equal(row.quantity,quantityFor(row.soop,row.total),'Gift quantity differs from authorized rule');assert.ok(Number.isInteger(row.quantity)&&row.quantity>=1&&row.quantity<=5);
 }
 return rows;
}
export async function inspectThanksGift(client,targets){
 const recipients=normalizeTargets(targets),recipientHash=digest(recipients),operationKey=`${OPERATION_PREFIX}:${recipientHash.slice(0,24)}`,ids=recipients.map(r=>r.id);
 const users=await q(client,'SELECT id::text AS id,nickname,status,role FROM users WHERE id=ANY($1::bigint[]) ORDER BY id',[ids]);
 assert.equal(users.length,recipients.length,'Missing account');
 const links=await q(client,"SELECT user_id::text AS user_id,provider_user_id FROM user_second_verifications WHERE provider='PLAYDK' AND user_id=ANY($1::bigint[]) ORDER BY user_id",[ids]);
 for(const row of recipients){
  const user=users.find(u=>u.id===row.id);assert.equal(user?.nickname,row.nickname,'Recipient nickname changed');assert.equal(user.status,'ACTIVE','Account inactive');
  const matches=links.filter(link=>link.user_id===row.id);assert.equal(matches.length,1,'Account link changed');assert.equal(matches[0].provider_user_id,row.playdkId,'Account identity changed');
 }
 const [item]=await q(client,'SELECT code,name,is_active FROM inventory_items WHERE code=$1',[ITEM_CODE]);assert.equal(item?.name,TITLE);assert.equal(Number(item.is_active),1,'Gift item is disabled');
 const existing=await q(client,`SELECT m.id::text AS id,m.user_id::text AS user_id,m.campaign_key,r.reward_amount::text AS reward_amount FROM user_messages m LEFT JOIN user_message_rewards r ON r.message_id=m.id
  WHERE m.user_id=ANY($1::bigint[]) AND (m.campaign_key=$2 OR r.reward_type=$3) ORDER BY m.user_id,m.id LIMIT 153`,[ids,CAMPAIGN_KEY,ITEM_CODE]);
 const existingGrants=await q(client,'SELECT user_id::text AS user_id,change_amount::text AS amount,reference_id FROM inventory_logs WHERE item_code=$1 AND user_id=ANY($2::bigint[]) AND change_amount>0 ORDER BY user_id LIMIT 153',[ITEM_CODE,ids]);
 const [saved]=await q(client,'SELECT value FROM app_meta WHERE key=$1',[operationKey]);
 return {operationKey,campaignKey:CAMPAIGN_KEY,title:TITLE,itemCode:ITEM_CODE,threshold:100,maxPerAccount:5,count:recipients.length,boxes:recipients.reduce((n,r)=>n+r.quantity,0),recipientHash,recipients,item,existing,existingGrants,receipt:saved?parse(saved.value):null};
}
export async function verifyThanksGift(client,receipt,{unclaimed=false}={}){
 assert.equal(receipt.status,'COMPLETED');assert.equal(receipt.campaignKey,CAMPAIGN_KEY);assert.equal(receipt.title,TITLE);assert.equal(receipt.itemCode,ITEM_CODE);
 assert.equal(receipt.maxPerAccount,5);assert.equal(receipt.threshold,100);assert.equal(receipt.count,receipt.recipients.length);
 assert.deepEqual(normalizeTargets(receipt.recipients),receipt.recipients);assert.equal(receipt.recipientHash,digest(receipt.recipients));assert.equal(receipt.operationKey,`${OPERATION_PREFIX}:${receipt.recipientHash.slice(0,24)}`);
 assert.equal(receipt.boxes,receipt.recipients.reduce((n,r)=>n+r.quantity,0));
 const rows=await q(client,`SELECT m.id::text AS message_id,m.user_id::text AS user_id,m.title,m.body,m.sender_type,m.message_type,m.is_read,m.hidden_at,
  r.id::text AS reward_id,r.user_id::text AS reward_user_id,r.reward_type,r.reward_amount::text AS reward_amount,r.claimed_at FROM user_messages m LEFT JOIN user_message_rewards r ON r.message_id=m.id
  WHERE m.campaign_key=$1 AND m.user_id=ANY($2::bigint[]) ORDER BY m.user_id,m.id`,[CAMPAIGN_KEY,receipt.recipients.map(r=>r.id)]);
 assert.equal(rows.length,receipt.count,'Message/reward count mismatch');assert.deepEqual(rows.map(r=>r.user_id),receipt.recipients.map(r=>r.id),'Missing/duplicate recipient');
 for(const row of rows){
  const target=receipt.recipients.find(r=>r.id===row.user_id);assert.ok(row.reward_id);assert.equal(row.reward_user_id,row.user_id);assert.equal(row.title,TITLE);assert.equal(row.body,bodyFor(target.quantity));
  assert.equal(row.sender_type,'ADMIN');assert.equal(row.message_type,'ITEM_REWARD');assert.equal(row.reward_type,ITEM_CODE);assert.equal(row.reward_amount,String(target.quantity));
  if(unclaimed){assert.equal(row.claimed_at,null);assert.equal(row.hidden_at,null);assert.equal(Number(row.is_read),0);}
 }
 if(receipt.auditId){
  const [audit]=await q(client,"SELECT after_data FROM admin_logs WHERE id=$1 AND action_type='PINGDU_THANKS_MESSAGE_SEND' AND target_id=$2",[receipt.auditId,receipt.operationKey]);assert.ok(audit,'Missing audit');
  const {auditId,verification,dryRun,replayed,...audited}=receipt;assert.deepEqual(parse(audit.after_data),audited,'Audit receipt mismatch');
 }
 return {messages:rows.length,rewards:rows.length,boxes:rows.reduce((n,r)=>n+Number(r.reward_amount),0),duplicates:0,missing:0,claimed:rows.filter(r=>r.claimed_at).length,rows};
}
// User-authorized recipient list only. Messages, attachments, audit and receipt
// commit together; opening the gift and claiming it remain user actions.
export async function sendThanksGift(client,targets,{expectedRecipientHash,dryRun=false}={}){
 const recipients=normalizeTargets(targets),hash=digest(recipients),operationKey=`${OPERATION_PREFIX}:${hash.slice(0,24)}`;assert.equal(expectedRecipientHash,hash,'Reviewed recipient hash required');
 await client.query('BEGIN ISOLATION LEVEL REPEATABLE READ');
 try{
  await client.query("SET LOCAL lock_timeout='5s'");await client.query("SET LOCAL statement_timeout='20s'");
  const reserved=await q(client,'INSERT INTO app_meta(key,value,updated_at) VALUES($1,$2,CURRENT_TIMESTAMP) ON CONFLICT(key) DO NOTHING RETURNING key',[operationKey,JSON.stringify({status:'PENDING'})]);
  if(!reserved.length){const [saved]=await q(client,'SELECT value FROM app_meta WHERE key=$1',[operationKey]);const receipt=parse(saved.value),verification=await verifyThanksGift(client,receipt);await client.query('ROLLBACK');return {...receipt,verification,replayed:true};}
  const plan=await inspectThanksGift(client,recipients);assert.equal(plan.recipientHash,hash);assert.equal(plan.existing.length,0,'Thanks gift already sent to a recipient');assert.equal(plan.existingGrants.length,0,'Thanks gift already granted to a recipient');
  const [owner]=await q(client,"SELECT id FROM users WHERE role='OWNER' AND status='ACTIVE' ORDER BY id LIMIT 1");assert.ok(owner,'Active operator required');
  const messages=await q(client,`INSERT INTO user_messages(user_id,sender_type,title,body,message_type,campaign_key)
   SELECT id,'ADMIN',$3,body,'ITEM_REWARD',$4 FROM unnest($1::bigint[],$2::text[]) AS t(id,body) ORDER BY id RETURNING id`,[recipients.map(r=>r.id),recipients.map(r=>bodyFor(r.quantity)),TITLE,CAMPAIGN_KEY]);
  assert.equal(messages.length,plan.count,'Partial message insert');
  const rewards=await q(client,`INSERT INTO user_message_rewards(message_id,user_id,reward_type,reward_amount)
   SELECT m.id,m.user_id,$2,t.amount FROM user_messages m JOIN unnest($3::bigint[],$4::bigint[]) AS t(id,amount) ON t.id=m.user_id WHERE m.campaign_key=$1 ORDER BY m.user_id RETURNING id`,[CAMPAIGN_KEY,ITEM_CODE,recipients.map(r=>r.id),recipients.map(r=>r.quantity)]);
  assert.equal(rewards.length,plan.count,'Partial reward insert');
  const {item,existing,existingGrants,receipt:unused,...details}=plan;
  const receipt={...details,status:'COMPLETED',delivery:'MESSAGE',actor:'SYSTEM_OPS',authorization:'빵훈 방 지급 명단: 100개당 1개, 최대 5개. 연구가태여니 4개. 두 비니는 다른 사람. 블랑코_ 보류.',completedAt:new Date().toISOString()};
  const verification=await verifyThanksGift(client,receipt,{unclaimed:true});
  const audit=await q(client,"INSERT INTO admin_logs(admin_id,action_type,target_type,target_id,before_data,after_data) VALUES($1,'PINGDU_THANKS_MESSAGE_SEND','USER_MESSAGE',$2,$3,$4) RETURNING id",[owner.id,operationKey,JSON.stringify({existingMessages:0,existingGrants:0}),JSON.stringify(receipt)]);
  assert.equal(audit.length,1,'Missing audit');receipt.auditId=String(audit[0].id);
  const updated=await q(client,'UPDATE app_meta SET value=$2,updated_at=CURRENT_TIMESTAMP WHERE key=$1 RETURNING key',[operationKey,JSON.stringify(receipt)]);assert.equal(updated.length,1,'Missing completed receipt');
  await client.query(dryRun?'ROLLBACK':'COMMIT');return {...receipt,verification,dryRun,replayed:false};
 }catch(error){await client.query('ROLLBACK').catch(()=>{});throw error;}
}
