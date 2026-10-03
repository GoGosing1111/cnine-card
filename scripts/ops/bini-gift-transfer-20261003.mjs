import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';

export const KEY='ops:pingdu-thanks-gift-transfer:4595-to-5504:20261003:v1';
export const CODE='PINGDU_THANKS_GIFT_BOX';
export const SOURCE=4595,DESTINATION=5504;
const CAMPAIGN='heeya-room-thanks-gift-20261003-v1';
const MESSAGE=182636,REWARD=179198,CLAIM_LOG=54206182;
const q=async(client,sql,args=[])=>(await client.query(sql,args)).rows;
const parse=value=>typeof value==='string'?JSON.parse(value):value;
const count=value=>{const n=Number(value);assert.ok(Number.isSafeInteger(n)&&n>=0,'Invalid item quantity');return n;};

export async function inspect(client){
 const users=await q(client,'SELECT id::text id,nickname,status FROM users WHERE id=ANY($1::bigint[]) ORDER BY users.id',[[SOURCE,DESTINATION]]);
 const stock=await q(client,'SELECT user_id::text user_id,quantity::text quantity,unseen_quantity::text unseen_quantity FROM cnine_user_inventory WHERE user_id=ANY($1::bigint[]) AND item_code=$2 ORDER BY user_id',[[SOURCE,DESTINATION],CODE]);
 const [saved]=await q(client,'SELECT value FROM app_meta WHERE key=$1',[KEY]);
 return {users,stock,receipt:saved?parse(saved.value):null};
}

function checkReceipt(receipt){
 assert.equal(receipt.operationKey,KEY);assert.equal(receipt.status,'COMPLETED');
 assert.equal(receipt.sourceUserId,SOURCE);assert.equal(receipt.destinationUserId,DESTINATION);
 assert.equal(receipt.itemCode,CODE);assert.equal(receipt.quantity,1);
}

// These account-row locks also serialize with the live gift-opening joint transaction.
// Keep the claimed source message and previous gift grants/openings as immutable history.
export async function apply(client,{dryRun=false}={}){
 const token=randomUUID();
 await client.query('BEGIN');
 try{
  await client.query("SET LOCAL lock_timeout='3s'");
  await client.query("SET LOCAL statement_timeout='15s'");
  for(const userId of [SOURCE,DESTINATION]){
   const now=Date.now();
   const lease=await q(client,`INSERT INTO user_mutation_locks_v1520(user_id,token,action_path,lease_until_ms,updated_at)
    VALUES($1,$2,$3,$4,CURRENT_TIMESTAMP) ON CONFLICT(user_id) DO UPDATE
    SET token=excluded.token,action_path=excluded.action_path,lease_until_ms=excluded.lease_until_ms,updated_at=excluded.updated_at
    WHERE user_mutation_locks_v1520.lease_until_ms<=$5 RETURNING user_id`,[userId,token,KEY,now+60000,now]);
   assert.equal(lease.length,1,'Account operation in progress');
  }
  await q(client,'SELECT id FROM users WHERE id=ANY($1::bigint[]) ORDER BY id FOR UPDATE',[[SOURCE,DESTINATION]]);
  const before=await inspect(client);
  assert.deepEqual(before.users.map(u=>({id:u.id,nickname:u.nickname,status:u.status})),[
   {id:String(SOURCE),nickname:'비니',status:'ACTIVE'},
   {id:String(DESTINATION),nickname:'비_니',status:'ACTIVE'}
  ],'Reviewed account identity changed');
  const unlock=async()=>assert.equal((await q(client,'DELETE FROM user_mutation_locks_v1520 WHERE user_id=ANY($1::bigint[]) AND token=$2 RETURNING user_id',[[SOURCE,DESTINATION],token])).length,2);
  if(before.receipt){
   checkReceipt(before.receipt);await unlock();await client.query(dryRun?'ROLLBACK':'COMMIT');
   return {...before.receipt,replayed:true,dryRun};
  }
  const [owner]=await q(client,"SELECT id FROM users WHERE id=1 AND role='OWNER' AND status='ACTIVE'");
  assert.ok(owner,'Missing authorized operator');
  const [item]=await q(client,'SELECT name,is_active FROM inventory_items WHERE code=$1',[CODE]);
  assert.equal(item?.name,'핑두의 감사 선물');assert.equal(Number(item.is_active),1);
  const [gift]=await q(client,`SELECT m.user_id::text user_id,m.title,m.campaign_key,r.user_id::text reward_user_id,
   r.reward_type,r.reward_amount::text reward_amount,r.claimed_at FROM user_messages m
   JOIN user_message_rewards r ON r.message_id=m.id WHERE m.id=$1 AND r.id=$2 FOR UPDATE OF m,r`,[MESSAGE,REWARD]);
  assert.equal(gift?.user_id,String(SOURCE));assert.equal(gift.reward_user_id,String(SOURCE));
  assert.equal(gift.title,'희야방 사은품');assert.equal(gift.campaign_key,CAMPAIGN);
  assert.equal(gift.reward_type,CODE);assert.equal(gift.reward_amount,'1');assert.ok(gift.claimed_at,'Source gift not claimed');
  const [claim]=await q(client,`SELECT id::text id,change_amount::text change_amount,balance_after::text balance_after,
   reason,reference_type,reference_id FROM inventory_logs WHERE user_id=$1 AND item_code=$2 ORDER BY id DESC LIMIT 1`,[SOURCE,CODE]);
  assert.equal(claim?.id,String(CLAIM_LOG),'Reviewed unopened gift changed');
  assert.equal(claim.change_amount,'1');assert.equal(claim.balance_after,'1');
  assert.equal(claim.reason,'MESSAGE_REWARD');assert.equal(claim.reference_type,'USER_MESSAGE');assert.equal(claim.reference_id,String(MESSAGE));
  const pending=await q(client,`SELECT request_id FROM joint_operations_v1 WHERE user_id=ANY($1::bigint[])
   AND kind IN ('PINGDU_THANKS_GIFT_OPEN','PINGDU_THANKS_GIFT_GRANT') AND status='PENDING' LIMIT 1`,[[SOURCE,DESTINATION]]);
  assert.equal(pending.length,0,'Gift operation in progress');
  const stock=await q(client,'SELECT user_id::text user_id,quantity::text quantity,unseen_quantity::text unseen_quantity FROM cnine_user_inventory WHERE user_id=ANY($1::bigint[]) AND item_code=$2 ORDER BY user_id FOR UPDATE',[[SOURCE,DESTINATION],CODE]);
  const source=stock.find(x=>x.user_id===String(SOURCE)),destination=stock.find(x=>x.user_id===String(DESTINATION));
  assert.equal(count(source?.quantity),1,'Reviewed source gift no longer available');
  const destinationBefore=count(destination?.quantity??0),destinationUnseen=count(destination?.unseen_quantity??0);
  assert.ok(destinationBefore<Number.MAX_SAFE_INTEGER&&destinationUnseen<Number.MAX_SAFE_INTEGER,'Destination inventory overflow');
  const debited=await q(client,`UPDATE cnine_user_inventory SET quantity=quantity-1,
   unseen_quantity=LEAST(unseen_quantity,quantity-1),updated_at=CURRENT_TIMESTAMP
   WHERE user_id=$1 AND item_code=$2 AND quantity=1 RETURNING quantity::text quantity`,[SOURCE,CODE]);
  assert.equal(debited.length,1);assert.equal(debited[0].quantity,'0');
  const credited=await q(client,`INSERT INTO cnine_user_inventory(user_id,item_code,quantity,unseen_quantity,created_at,updated_at)
   VALUES($1,$2,1,1,CURRENT_TIMESTAMP,CURRENT_TIMESTAMP) ON CONFLICT(user_id,item_code) DO UPDATE
   SET quantity=cnine_user_inventory.quantity+1,unseen_quantity=cnine_user_inventory.unseen_quantity+1,updated_at=CURRENT_TIMESTAMP
   RETURNING quantity::text quantity,unseen_quantity::text unseen_quantity`,[DESTINATION,CODE]);
  assert.equal(credited.length,1);assert.equal(count(credited[0].quantity),destinationBefore+1);
  assert.equal(count(credited[0].unseen_quantity),destinationUnseen+1);
  const inventoryLogIds=[];
  for(const [userId,change,balance,reason] of [
   [SOURCE,-1,0,'핑두 감사선물 오지급 회수: 비니 → 비_니'],
   [DESTINATION,1,destinationBefore+1,'핑두 감사선물 지급 대상 정정: 비니 → 비_니']
  ]){
   const [log]=await q(client,`INSERT INTO inventory_logs(user_id,item_code,change_amount,balance_after,reason,reference_type,reference_id,admin_id,created_at)
    VALUES($1,$2,$3,$4,$5,'SYSTEM_TRANSFER',$6,$7,CURRENT_TIMESTAMP) RETURNING id::text id`,[userId,CODE,change,balance,reason,KEY,owner.id]);
   assert.ok(log);inventoryLogIds.push(log.id);
  }
  const receipt={status:'COMPLETED',operationKey:KEY,actor:'SYSTEM_OPS',sourceUserId:SOURCE,sourceNickname:'비니',destinationUserId:DESTINATION,destinationNickname:'비_니',itemCode:CODE,quantity:1,
   sourceMessageId:MESSAGE,sourceRewardId:REWARD,sourceClaimLogId:CLAIM_LOG,sourceCampaign:CAMPAIGN,
   sourceBefore:1,sourceAfter:0,destinationBefore,destinationAfter:destinationBefore+1,inventoryLogIds,completedAt:new Date().toISOString()};
  const [audit]=await q(client,`INSERT INTO admin_logs(admin_id,action_type,target_type,target_id,before_data,after_data,created_at)
   VALUES($1,'PINGDU_THANKS_GIFT_TRANSFER','USER_INVENTORY',$2,$3,$4,CURRENT_TIMESTAMP) RETURNING id::text id`,[
   owner.id,`${SOURCE}->${DESTINATION}`,JSON.stringify({operationKey:KEY,stock,sourceGift:gift}),
   JSON.stringify({...receipt,authorization:'비니 계정 핑두 감사선물 회수하고 비_니로 지급해'})]);
  assert.ok(audit);receipt.adminLogId=audit.id;
  assert.equal((await q(client,'INSERT INTO app_meta(key,value,updated_at) VALUES($1,$2,CURRENT_TIMESTAMP) RETURNING key',[KEY,JSON.stringify(receipt)])).length,1);
  await unlock();await client.query(dryRun?'ROLLBACK':'COMMIT');
  return {...receipt,replayed:false,dryRun};
 }catch(error){await client.query('ROLLBACK').catch(()=>{});throw error;}
}

export async function verify(client){
 const state=await inspect(client),receipt=state.receipt;assert.ok(receipt);checkReceipt(receipt);
 const logs=await q(client,'SELECT id::text id,user_id::text user_id,item_code,change_amount::text change_amount,balance_after::text balance_after FROM inventory_logs WHERE reference_type=$1 AND reference_id=$2 ORDER BY id',['SYSTEM_TRANSFER',KEY]);
 assert.deepEqual(logs,[
  {id:receipt.inventoryLogIds[0],user_id:String(SOURCE),item_code:CODE,change_amount:'-1',balance_after:String(receipt.sourceAfter)},
  {id:receipt.inventoryLogIds[1],user_id:String(DESTINATION),item_code:CODE,change_amount:'1',balance_after:String(receipt.destinationAfter)}
 ]);
 const audits=await q(client,"SELECT id::text id,after_data FROM admin_logs WHERE action_type='PINGDU_THANKS_GIFT_TRANSFER' AND target_id=$1 AND after_data LIKE $2",[`${SOURCE}->${DESTINATION}`,`%${KEY}%`]);
 assert.equal(audits.length,1);assert.equal(audits[0].id,receipt.adminLogId);checkReceipt(parse(audits[0].after_data));
 const [gift]=await q(client,'SELECT user_id::text user_id,claimed_at FROM user_message_rewards WHERE id=$1 AND message_id=$2',[REWARD,MESSAGE]);
 assert.equal(gift?.user_id,String(SOURCE));assert.ok(gift.claimed_at);
 return {verified:true,receipt,currentStock:state.stock};
}
