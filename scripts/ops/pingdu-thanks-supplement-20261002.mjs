import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import reviewed from './pingdu-thanks-supplement-20261002.targets.json' with {type:'json'};
import {TITLE,ITEM_CODE,CAMPAIGN_KEY as ORIGINAL_CAMPAIGN} from './pingdu-thanks-ppanghun-20261002.mjs';
export {TITLE,ITEM_CODE};
export const CAMPAIGN_KEY='pingdu-thanks-ppanghun-supplement-20261002-v1';
export const OPERATION_KEY='ops:pingdu-thanks-ppanghun:supplement:20261002:v1';
export const TARGETS=Object.freeze(reviewed.targets.map(row=>Object.freeze({...row,priorMessages:Object.freeze(row.priorMessages.map(message=>Object.freeze({...message})))})));
export const RECIPIENT_HASH=createHash('sha256').update(JSON.stringify(TARGETS)).digest('hex');
export const bodyFor=quantity=>`빵훈 방 참여에 감사드립니다.\n핑두의 감사 선물 ${quantity}개를 추가 지급합니다.\n메시지 보상을 수령한 뒤 인벤토리에서 상자를 개봉해 주세요.`;
const parse=value=>typeof value==='string'?JSON.parse(value):value;
const q=async(client,sql,args=[])=>(await client.query(sql,args)).rows;
const ids=()=>TARGETS.map(row=>row.id);
function normalize(targets){
 assert.deepEqual(targets,TARGETS,'Only the seven explicitly authorized recipients and quantities are allowed');
 assert.equal(TARGETS.length,7);assert.equal(new Set(ids()).size,7);
 assert.equal(TARGETS.reduce((sum,row)=>sum+row.quantity,0),9);
 for(const row of TARGETS){assert.match(row.id,/^[1-9]\d*$/);assert.ok([1,3].includes(row.quantity));}
 return TARGETS;
}
export async function inspectSupplement(client,targets=TARGETS){
 normalize(targets);
 const users=await q(client,'SELECT id::text AS id,nickname,status FROM users WHERE id=ANY($1::bigint[]) ORDER BY id',[ids()]);
 const links=await q(client,"SELECT user_id::text AS user_id,provider_user_id FROM user_second_verifications WHERE provider='PLAYDK' AND user_id=ANY($1::bigint[]) ORDER BY user_id",[ids()]);
 assert.equal(users.length,7);assert.equal(links.length,7);
 for(const row of TARGETS){const user=users.find(user=>user.id===row.id),link=links.find(link=>link.user_id===row.id);assert.equal(user?.nickname,row.nickname,'Recipient nickname changed');assert.equal(user.status,'ACTIVE','Account inactive');assert.equal(link?.provider_user_id,row.playdkId,'Account identity changed');}
 const [item]=await q(client,'SELECT code,name,is_active FROM inventory_items WHERE code=$1',[ITEM_CODE]);assert.equal(item?.name,TITLE);assert.equal(Number(item.is_active),1);
 const prior=await q(client,`SELECT m.id::text AS id,m.user_id::text AS user_id,m.campaign_key,r.reward_amount::text AS amount FROM user_messages m JOIN user_message_rewards r ON r.message_id=m.id
  WHERE m.user_id=ANY($1::bigint[]) AND r.reward_type=$2 AND m.campaign_key IS DISTINCT FROM $3 ORDER BY m.user_id,m.id`,[ids(),ITEM_CODE,CAMPAIGN_KEY]);
 for(const row of TARGETS){assert.deepEqual(prior.filter(message=>message.user_id===row.id).map(message=>({id:message.id,amount:Number(message.amount),campaign:message.campaign_key})),row.priorMessages.map(message=>({...message,campaign:ORIGINAL_CAMPAIGN})),'Prior gift deliveries changed');}
 const grants=await q(client,'SELECT user_id::text AS user_id,change_amount::text AS amount,reference_id FROM inventory_logs WHERE user_id=ANY($1::bigint[]) AND item_code=$2 AND change_amount>0 ORDER BY user_id',[ids(),ITEM_CODE]);
 for(const grant of grants){const row=TARGETS.find(row=>row.id===grant.user_id);assert.ok(row.priorMessages.some(message=>message.id===String(grant.reference_id)&&message.amount===Number(grant.amount)),'Unexpected direct gift grant');}
 const existing=await q(client,'SELECT id::text AS id,user_id::text AS user_id FROM user_messages WHERE campaign_key=$1 ORDER BY user_id',[CAMPAIGN_KEY]);
 const [saved]=await q(client,'SELECT value FROM app_meta WHERE key=$1',[OPERATION_KEY]);
 return {operationKey:OPERATION_KEY,campaignKey:CAMPAIGN_KEY,recipientHash:RECIPIENT_HASH,count:7,boxes:9,priorBoxes:prior.reduce((sum,message)=>sum+Number(message.amount),0),prior,existing,receipt:saved?parse(saved.value):null};
}
export async function verifySupplement(client,receipt,{unclaimed=false}={}){
 assert.equal(receipt.status,'COMPLETED');assert.equal(receipt.operationKey,OPERATION_KEY);assert.equal(receipt.campaignKey,CAMPAIGN_KEY);
 assert.equal(receipt.recipientHash,RECIPIENT_HASH);assert.deepEqual(receipt.recipients,TARGETS);assert.equal(receipt.count,7);assert.equal(receipt.boxes,9);
 const rows=await q(client,`SELECT m.id::text AS message_id,m.user_id::text AS user_id,m.title,m.body,m.sender_type,m.message_type,m.is_read,m.hidden_at,
  r.id::text AS reward_id,r.user_id::text AS reward_user_id,r.reward_type,r.reward_amount::text AS reward_amount,r.claimed_at
  FROM user_messages m LEFT JOIN user_message_rewards r ON r.message_id=m.id WHERE m.campaign_key=$1 ORDER BY m.user_id,m.id`,[CAMPAIGN_KEY]);
 assert.equal(rows.length,7,'Partial or extra messages');assert.deepEqual(rows.map(row=>row.user_id),ids(),'Missing or duplicate recipient');
 for(const row of rows){const target=TARGETS.find(target=>target.id===row.user_id);assert.ok(row.reward_id);assert.equal(row.reward_user_id,row.user_id);assert.equal(row.reward_type,ITEM_CODE);assert.equal(row.reward_amount,String(target.quantity));assert.equal(row.title,TITLE);assert.equal(row.body,bodyFor(target.quantity));assert.equal(row.sender_type,'ADMIN');assert.equal(row.message_type,'ITEM_REWARD');if(unclaimed){assert.equal(row.claimed_at,null);assert.equal(row.hidden_at,null);assert.equal(Number(row.is_read),0);}}
 if(receipt.auditId){const [audit]=await q(client,"SELECT after_data FROM admin_logs WHERE id=$1 AND action_type='PINGDU_THANKS_SUPPLEMENT_SEND' AND target_id=$2",[receipt.auditId,OPERATION_KEY]);assert.ok(audit,'Missing audit');const {auditId,...audited}=receipt;assert.deepEqual(parse(audit.after_data),audited,'Audit receipt mismatch');}
 return {messages:7,rewards:7,boxes:9,duplicates:0,missing:0,claimed:rows.filter(row=>row.claimed_at).length,rows};
}
export async function sendSupplement(client,targets=TARGETS,{expectedRecipientHash,dryRun=false}={}){
 normalize(targets);assert.equal(expectedRecipientHash,RECIPIENT_HASH,'Reviewed recipient hash required');
 await client.query('BEGIN ISOLATION LEVEL REPEATABLE READ');
 try{
  await client.query("SET LOCAL lock_timeout='5s'");await client.query("SET LOCAL statement_timeout='20s'");
  const reserved=await q(client,'INSERT INTO app_meta(key,value,updated_at) VALUES($1,$2,CURRENT_TIMESTAMP) ON CONFLICT(key) DO NOTHING RETURNING key',[OPERATION_KEY,JSON.stringify({status:'PENDING'})]);
  if(!reserved.length){const [saved]=await q(client,'SELECT value FROM app_meta WHERE key=$1',[OPERATION_KEY]);const receipt=parse(saved.value),verification=await verifySupplement(client,receipt);await client.query('ROLLBACK');return {receipt,verification,replayed:true};}
  const plan=await inspectSupplement(client,targets);assert.equal(plan.existing.length,0,'Supplement already sent without a receipt');
  const [owner]=await q(client,"SELECT id FROM users WHERE role='OWNER' AND status='ACTIVE' ORDER BY id LIMIT 1");assert.ok(owner);
  const messages=await q(client,`INSERT INTO user_messages(user_id,sender_type,title,body,message_type,campaign_key)
   SELECT id,'ADMIN',$3,body,'ITEM_REWARD',$4 FROM unnest($1::bigint[],$2::text[]) AS t(id,body) ORDER BY id RETURNING id`,[ids(),TARGETS.map(row=>bodyFor(row.quantity)),TITLE,CAMPAIGN_KEY]);assert.equal(messages.length,7,'Partial message insert');
  const rewards=await q(client,`INSERT INTO user_message_rewards(message_id,user_id,reward_type,reward_amount)
   SELECT m.id,m.user_id,$2,t.amount FROM user_messages m JOIN unnest($3::bigint[],$4::bigint[]) AS t(id,amount) ON t.id=m.user_id WHERE m.campaign_key=$1 ORDER BY m.user_id RETURNING id`,[CAMPAIGN_KEY,ITEM_CODE,ids(),TARGETS.map(row=>row.quantity)]);assert.equal(rewards.length,7,'Partial reward insert');
  const receipt={status:'COMPLETED',operationKey:OPERATION_KEY,campaignKey:CAMPAIGN_KEY,recipientHash:RECIPIENT_HASH,count:7,boxes:9,title:TITLE,itemCode:ITEM_CODE,delivery:'MESSAGE',authorization:reviewed.authorization,recipients:TARGETS,priorBoxes:plan.priorBoxes,completedAt:new Date().toISOString()};
  await verifySupplement(client,receipt,{unclaimed:true});
  const [audit]=await q(client,"INSERT INTO admin_logs(admin_id,action_type,target_type,target_id,before_data,after_data) VALUES($1,'PINGDU_THANKS_SUPPLEMENT_SEND','USER_MESSAGE',$2,$3,$4) RETURNING id",[owner.id,OPERATION_KEY,JSON.stringify({prior:plan.prior,additionalBoxes:9}),JSON.stringify(receipt)]);assert.ok(audit,'Missing audit');receipt.auditId=String(audit.id);
  const updated=await q(client,'UPDATE app_meta SET value=$2,updated_at=CURRENT_TIMESTAMP WHERE key=$1 RETURNING key',[OPERATION_KEY,JSON.stringify(receipt)]);assert.equal(updated.length,1,'Missing completed receipt');
  await client.query(dryRun?'ROLLBACK':'COMMIT');return {receipt,dryRun,replayed:false};
 }catch(error){await client.query('ROLLBACK').catch(()=>{});throw error;}
}
