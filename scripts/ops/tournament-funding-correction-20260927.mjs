import assert from 'node:assert/strict';
import {CAMPAIGN_KEY,ITEM_CODE,TITLE} from './tournament-funding-gift-20260927.mjs';

export const OPERATION_KEY='ops:tournament-funding-gift:20260927:correct4694to4774-add4693-4621-v1';
export const SOURCE={id:'4694',nickname:'북부대공',messageId:'163866'};
export const RECIPIENTS=[
 {id:'4621',nickname:'리이렐',soop:'리이렐',total:100},
 {id:'4693',nickname:'시소둥이',soop:'시소둥이',total:100},
 {id:'4774',nickname:'딤럼프',soop:'생스머신디임',total:2180}
];
const REVOKE_SOURCE='ADMIN_UNCLAIMED_REWARD_REVOKE';
const REVOKE_TOKEN=OPERATION_KEY+':revoke';
const parse=v=>typeof v==='string'?JSON.parse(v):v;
const queryMessages=(db,ids)=>db.query(`SELECT m.id::text AS message_id,m.user_id::text AS user_id,m.title,m.body,m.sender_type,m.message_type,m.campaign_key,m.hidden_at,
 r.id::text AS reward_id,r.user_id::text AS reward_user_id,r.reward_type,r.reward_amount::text AS reward_amount,r.claimed_at
 FROM user_messages m JOIN user_message_rewards r ON r.message_id=m.id
 WHERE m.user_id=ANY($1::bigint[]) AND (m.campaign_key=$2 OR (m.title=$3 AND r.reward_type=$4)) ORDER BY m.user_id,m.id`,[ids,CAMPAIGN_KEY,TITLE,ITEM_CODE]);
export async function inspectCorrection(db){
 const ids=[SOURCE.id,...RECIPIENTS.map(r=>r.id)];
 const users=(await db.query('SELECT id::text AS id,nickname,role,status FROM users WHERE id=ANY($1::bigint[]) ORDER BY id',[ids])).rows;
 for(const r of [SOURCE,...RECIPIENTS]){const u=users.find(u=>u.id===r.id);assert.equal(u?.nickname,r.nickname,'Account changed');assert.equal(u.role,'USER');assert.equal(u.status,'ACTIVE')}
 const messages=(await queryMessages(db,ids)).rows;
 const source=messages.find(m=>m.message_id===SOURCE.messageId&&m.user_id===SOURCE.id);
 assert.ok(source,'Original gift missing');assert.equal(source.reward_user_id,SOURCE.id);assert.equal(source.reward_type,ITEM_CODE);assert.equal(source.reward_amount,'1');assert.equal(source.title,TITLE);assert.equal(source.body,TITLE);assert.equal(source.campaign_key,CAMPAIGN_KEY);
 const [claim]=(await db.query('SELECT reward_id::text AS reward_id,user_id::text AS user_id,reward_amount::text AS reward_amount,claim_token,source FROM user_message_reward_claim_receipts_v1222 WHERE reward_id=$1',[source.reward_id])).rows;
 const [item]=(await db.query('SELECT name,is_active FROM inventory_items WHERE code=$1',[ITEM_CODE])).rows;
 assert.equal(item?.name,'대회 사은품');assert.equal(Number(item.is_active),1);
 const [saved]=(await db.query('SELECT value FROM app_meta WHERE key=$1',[OPERATION_KEY])).rows;
 return {operationKey:OPERATION_KEY,source,claim:claim||null,targets:RECIPIENTS,existing:messages.filter(m=>m.user_id!==SOURCE.id),receipt:saved?parse(saved.value):null};
}
export async function verifyCorrection(db,receipt){
 assert.equal(receipt.status,'COMPLETED');assert.equal(receipt.operationKey,OPERATION_KEY);assert.deepEqual(receipt.recipients,RECIPIENTS);
 const rows=(await queryMessages(db,[SOURCE.id,...RECIPIENTS.map(r=>r.id)])).rows;
 const source=rows.filter(r=>r.user_id===SOURCE.id);assert.equal(source.length,1);assert.equal(source[0].message_id,SOURCE.messageId);assert.equal(source[0].reward_id,receipt.revokedRewardId);assert.ok(source[0].hidden_at);assert.ok(source[0].claimed_at);
 const [voidClaim]=(await db.query('SELECT user_id::text AS user_id,reward_amount::text AS reward_amount,claim_token,source FROM user_message_reward_claim_receipts_v1222 WHERE reward_id=$1',[receipt.revokedRewardId])).rows;
 assert.equal(voidClaim?.user_id,SOURCE.id);assert.equal(voidClaim.reward_amount,'0');assert.equal(voidClaim.claim_token,REVOKE_TOKEN);assert.equal(voidClaim.source,REVOKE_SOURCE);
 const delivered=rows.filter(r=>r.user_id!==SOURCE.id);assert.equal(delivered.length,RECIPIENTS.length);assert.deepEqual(delivered.map(r=>r.user_id),RECIPIENTS.map(r=>r.id));
 for(const r of delivered){assert.equal(r.reward_user_id,r.user_id);assert.equal(r.title,TITLE);assert.equal(r.body,TITLE);assert.equal(r.sender_type,'ADMIN');assert.equal(r.message_type,'ITEM_REWARD');assert.equal(r.campaign_key,CAMPAIGN_KEY);assert.equal(r.reward_type,ITEM_CODE);assert.equal(r.reward_amount,'1')}
 const [audit]=(await db.query("SELECT after_data FROM admin_logs WHERE id=$1 AND action_type='TOURNAMENT_FUNDING_GIFT_CORRECT' AND target_id=$2",[receipt.auditId,OPERATION_KEY])).rows;
 const {auditId,...audited}=receipt;assert.deepEqual(parse(audit?.after_data),audited,'Missing correction audit');
 return {revoked:1,delivered:RECIPIENTS.length,missing:0,duplicates:0,claimed:delivered.filter(r=>r.claimed_at).length,messages:delivered};
}
export async function applyCorrection(db,{dryRun=false}={}){
 await db.query('BEGIN ISOLATION LEVEL REPEATABLE READ');
 try{
  await db.query("SET LOCAL lock_timeout='5s'");await db.query("SET LOCAL statement_timeout='20s'");
  const reserved=await db.query('INSERT INTO app_meta(key,value,updated_at) VALUES($1,$2,CURRENT_TIMESTAMP) ON CONFLICT(key) DO NOTHING RETURNING key',[OPERATION_KEY,JSON.stringify({status:'PENDING'})]);
  if(!reserved.rows.length){const [saved]=(await db.query('SELECT value FROM app_meta WHERE key=$1',[OPERATION_KEY])).rows;const receipt=parse(saved.value),verification=await verifyCorrection(db,receipt);await db.query('ROLLBACK');return {receipt,verification,replayed:true,dryRun};}
  const plan=await inspectCorrection(db);assert.equal(plan.claim,null,'Source gift already claimed');assert.ok(!plan.source.claimed_at,'Source gift already claimed');assert.equal(plan.existing.length,0,'Target gift already exists');
  const [owner]=(await db.query("SELECT id FROM users WHERE id=1 AND role='OWNER' AND status='ACTIVE'")).rows;assert.ok(owner,'Active operator required');
  // Reserve the same unique reward receipt used by live claims. A competing
  // claim either wins first (abort), or cannot mint a token and credit inventory.
  const revoked=await db.query(`INSERT INTO user_message_reward_claim_receipts_v1222(reward_id,message_id,user_id,reward_type,reward_amount,claim_token,balance_before,balance_after,source)
   SELECT r.id,r.message_id,r.user_id,r.reward_type,0,$3,COALESCE(i.quantity,0),COALESCE(i.quantity,0),$4
   FROM user_message_rewards r LEFT JOIN cnine_user_inventory i ON i.user_id=r.user_id AND i.item_code=r.reward_type
   WHERE r.id=$1 AND r.user_id=$2 AND (r.claimed_at IS NULL OR r.claimed_at='')
   ON CONFLICT(reward_id) DO NOTHING RETURNING reward_id`,[plan.source.reward_id,SOURCE.id,REVOKE_TOKEN,REVOKE_SOURCE]);
  assert.equal(revoked.rows.length,1,'Source claim raced with revocation');
  const closed=await db.query("UPDATE user_message_rewards SET claimed_at=CURRENT_TIMESTAMP WHERE id=$1 AND user_id=$2 AND (claimed_at IS NULL OR claimed_at='') RETURNING id",[plan.source.reward_id,SOURCE.id]);assert.equal(closed.rows.length,1,'Source reward was not revoked');
  const hidden=await db.query('UPDATE user_messages SET hidden_at=CURRENT_TIMESTAMP,is_read=1,read_at=CURRENT_TIMESTAMP WHERE id=$1 AND user_id=$2 RETURNING id',[SOURCE.messageId,SOURCE.id]);assert.equal(hidden.rows.length,1,'Source message was not hidden');
  const ids=RECIPIENTS.map(r=>r.id);
  const sent=await db.query(`INSERT INTO user_messages(user_id,sender_type,title,body,message_type,campaign_key) SELECT id,'ADMIN',$2,$2,'ITEM_REWARD',$3 FROM unnest($1::bigint[]) AS id ORDER BY id RETURNING id`,[ids,TITLE,CAMPAIGN_KEY]);assert.equal(sent.rows.length,RECIPIENTS.length,'Partial message insert');
  const rewards=await db.query('INSERT INTO user_message_rewards(message_id,user_id,reward_type,reward_amount) SELECT id,user_id,$2,1 FROM user_messages WHERE campaign_key=$1 AND user_id=ANY($3::bigint[]) RETURNING id',[CAMPAIGN_KEY,ITEM_CODE,ids]);assert.equal(rewards.rows.length,RECIPIENTS.length,'Partial reward insert');
  const receipt={status:'COMPLETED',operationKey:OPERATION_KEY,campaignKey:CAMPAIGN_KEY,title:TITLE,itemCode:ITEM_CODE,quantity:1,revokedUser:SOURCE,revokedRewardId:plan.source.reward_id,recipients:RECIPIENTS,authorization:'그냥 지급하고 북부대공 회수해; 시소둥이 / 시소둥이; 게임 넥네임 리이렐 숲닉네임 리이렐',completedAt:new Date().toISOString()};
  const audit=await db.query("INSERT INTO admin_logs(admin_id,action_type,target_type,target_id,before_data,after_data) VALUES($1,'TOURNAMENT_FUNDING_GIFT_CORRECT','USER_MESSAGE',$2,$3,$4) RETURNING id",[owner.id,OPERATION_KEY,JSON.stringify({source:plan.source,sourceClaim:null,targetMessages:0}),JSON.stringify(receipt)]);assert.equal(audit.rows.length,1);receipt.auditId=String(audit.rows[0].id);
  const updated=await db.query('UPDATE app_meta SET value=$2,updated_at=CURRENT_TIMESTAMP WHERE key=$1 RETURNING key',[OPERATION_KEY,JSON.stringify(receipt)]);assert.equal(updated.rows.length,1,'Missing correction receipt');
  const verification=await verifyCorrection(db,receipt);await db.query(dryRun?'ROLLBACK':'COMMIT');return {receipt,verification,replayed:false,dryRun};
 }catch(error){await db.query('ROLLBACK').catch(()=>{});throw error}
}
