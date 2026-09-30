import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import plan from './funding-gift-rooms-20260930.targets.json' with {type:'json'};

export const OPERATION_KEY='ops:funding-gift-six-rooms:20260930:v1';
export const ITEM_CODE='FUNDING_GIFT_BOX';
export const TARGETS=Object.freeze(plan.targets.map(({userId,nickname,rooms})=>Object.freeze({userId,nickname,rooms})));
export const PLAN_HASH=createHash('sha256').update(JSON.stringify({campaign:plan.campaign,itemCode:ITEM_CODE,targets:TARGETS})).digest('hex');
const REASON='펀딩 사은품: 참여 스트리머 방마다 상자 1개(방별 최대 1개, 전체 최대 8개)';
const query=async(client,sql,values=[])=>(await client.query(sql,values)).rows;
const ids=TARGETS.map(row=>row.userId);
const amounts=TARGETS.map(row=>row.rooms);

assert.equal(plan.campaign,'funding-gift-six-streamer-rooms-20260930');
assert.equal(plan.itemCode,ITEM_CODE);
assert.equal(plan.sourceCount,81);
assert.equal(plan.heldCount,4);
assert.equal(TARGETS.length,77);
assert.equal(new Set(ids).size,77);
assert.equal(TARGETS.reduce((total,row)=>total+row.rooms,0),218);
assert.deepEqual(Object.fromEntries([1,2,3,4,5,6].map(n=>[n,TARGETS.filter(row=>row.rooms===n).length])),
  {'1':24,'2':16,'3':9,'4':13,'5':7,'6':8});
for(const row of TARGETS){
 assert.ok(Number.isSafeInteger(row.userId)&&row.userId>0);
 assert.ok(typeof row.nickname==='string'&&row.nickname.trim()===row.nickname&&row.nickname.length>0);
 assert.ok(Number.isInteger(row.rooms)&&row.rooms>=1&&row.rooms<=8);
}

function validateUsers(users){
 assert.equal(users.length,TARGETS.length,'Reviewed accounts changed');
 const byId=new Map(users.map(row=>[Number(row.id),row]));
 for(const target of TARGETS){
  const account=byId.get(target.userId);
  assert.ok(account,`Missing account ${target.userId}`);
  assert.equal(account.nickname,target.nickname,`Nickname changed for ${target.userId}`);
  assert.equal(account.status,'ACTIVE',`Account inactive: ${target.userId}`);
 }
}

export async function inspectFundingGiftRooms(client,{lockUsers=false}={}){
 const users=await query(client,`SELECT id::int,nickname,status,role FROM users
  WHERE id=ANY($1::bigint[]) ORDER BY id ${lockUsers?'FOR UPDATE':''}`,[ids]);
 validateUsers(users);
 const [item]=await query(client,`SELECT code,name,is_active,description FROM inventory_items
  WHERE code=$1 ${lockUsers?'FOR SHARE':''}`,[ITEM_CODE]);
 assert.equal(item?.name,'펀딩 사은품','Funding gift catalog changed');
 assert.equal(Number(item.is_active),1,'Funding gift item is disabled');
 assert.ok(item.description.includes('3,000억')&&item.description.includes('5,000,000'),
  'Funding gift contents differ from the approved box');
 const [holdings]=await query(client,`SELECT COUNT(*)::int AS accounts,COALESCE(SUM(quantity),0)::text AS total
  FROM cnine_user_inventory WHERE item_code=$1`,[ITEM_CODE]);
 const [ledger]=await query(client,`SELECT COUNT(*)::int AS count FROM inventory_logs
  WHERE item_code=$1 AND user_id=ANY($2::bigint[])`,[ITEM_CODE,ids]);
 const [messages]=await query(client,`SELECT COUNT(*)::int AS count FROM user_message_rewards
  WHERE reward_type=$1 AND user_id=ANY($2::bigint[])`,[ITEM_CODE,ids]);
 const [operations]=await query(client,`SELECT COUNT(*)::int AS count FROM joint_operations_v1
  WHERE kind IN('FUNDING_GIFT_GRANT','FUNDING_GIFT_OPEN') AND user_id=ANY($1::bigint[])`,[ids]);
 const [saved]=await query(client,'SELECT value FROM app_meta WHERE key=$1',[OPERATION_KEY]);
 return {operationKey:OPERATION_KEY,planHash:PLAN_HASH,itemCode:ITEM_CODE,accounts:users.length,
  boxes:218,held:plan.heldCount,roles:users.reduce((out,row)=>(out[row.role]=(out[row.role]||0)+1,out),{}),
  catalog:{name:item.name,active:Number(item.is_active)},baseline:{holdings,ledger:ledger.count,
   messageRewards:messages.count,jointOperations:operations.count},receipt:saved?JSON.parse(saved.value):null};
}

export async function verifyFundingGiftRooms(client,receipt){
 assert.equal(receipt.status,'COMPLETED');
 assert.equal(receipt.operationKey,OPERATION_KEY);
 assert.equal(receipt.planHash,PLAN_HASH);
 assert.equal(receipt.itemCode,ITEM_CODE);
 assert.equal(receipt.accounts,77);
 assert.equal(receipt.boxes,218);
 assert.equal(receipt.allocations.length,77);
 const rows=await query(client,`SELECT id::text,user_id::int AS "userId",item_code,
  change_amount::int AS rooms,balance_after::text AS "balanceAfter",reason,reference_type,reference_id
  FROM inventory_logs WHERE reference_id=$1 AND item_code=$2 ORDER BY user_id,id`,[OPERATION_KEY,ITEM_CODE]);
 assert.equal(rows.length,77,'Missing or duplicate funding gift ledgers');
 const byUser=new Map(rows.map(row=>[row.userId,row]));
 assert.equal(byUser.size,77,'Duplicate recipient ledger');
 for(const allocation of receipt.allocations){
  const target=TARGETS.find(row=>row.userId===allocation.userId);
  assert.ok(target,'Unexpected receipt recipient');
  assert.equal(allocation.nickname,target.nickname);
  assert.equal(allocation.rooms,target.rooms);
  const row=byUser.get(target.userId);
  assert.ok(row,'Missing recipient ledger');
  assert.equal(row.id,allocation.logId);
  assert.equal(row.rooms,target.rooms);
  assert.equal(row.balanceAfter,allocation.after);
  assert.equal(row.reason,REASON);
  assert.equal(row.reference_type,'SYSTEM_GRANT');
  assert.equal(row.reference_id,OPERATION_KEY);
 }
 const [audit]=await query(client,`SELECT action_type,target_id,after_data FROM admin_logs WHERE id=$1`,[receipt.auditId]);
 assert.equal(audit?.action_type,'FUNDING_GIFT_ROOM_GRANT');
 assert.equal(audit.target_id,OPERATION_KEY);
 assert.equal(JSON.parse(audit.after_data).planHash,PLAN_HASH);
 return {accounts:77,boxes:218,ledgers:rows.length,duplicates:0,held:4,avatarGrants:0};
}

// One-time, explicitly authorized production data operation. Never loaded by game routes.
// All inventory credits, per-account ledgers, campaign audit and completion receipt commit together.
export async function grantFundingGiftRooms(client,{expectedPlanHash,dryRun=false}={}){
 assert.equal(expectedPlanHash,PLAN_HASH,'Reviewed plan hash is required');
 await client.query('BEGIN');
 try{
  await client.query("SET LOCAL lock_timeout='8s'");
  await client.query("SET LOCAL statement_timeout='45s'");
  const reserved=await query(client,`INSERT INTO app_meta(key,value,updated_at)
   VALUES($1,$2,CURRENT_TIMESTAMP) ON CONFLICT(key) DO NOTHING RETURNING key`,
   [OPERATION_KEY,JSON.stringify({status:'PENDING',planHash:PLAN_HASH})]);
  if(!reserved.length){
   const [stored]=await query(client,'SELECT value FROM app_meta WHERE key=$1 FOR UPDATE',[OPERATION_KEY]);
   const receipt=JSON.parse(stored.value);
   const verification=await verifyFundingGiftRooms(client,receipt);
   await client.query('ROLLBACK');
   return {receipt,verification,replayed:true};
  }
  const snapshot=await inspectFundingGiftRooms(client,{lockUsers:true});
  assert.equal(snapshot.planHash,expectedPlanHash);
  assert.equal(snapshot.baseline.holdings.accounts,0,'Funding gift already held; reconcile before granting');
  assert.equal(snapshot.baseline.holdings.total,'0');
  assert.equal(snapshot.baseline.ledger,0,'Funding gift ledger exists; reconcile before granting');
  assert.equal(snapshot.baseline.messageRewards,0,'Funding gift message reward exists');
  assert.equal(snapshot.baseline.jointOperations,0,'Funding gift operation exists');
  const [owner]=await query(client,"SELECT id FROM users WHERE UPPER(TRIM(role))='OWNER' AND UPPER(TRIM(status))='ACTIVE' ORDER BY id LIMIT 1");
  assert.ok(owner,'Active owner required for audit attribution');
  const [walletBefore]=await query(client,`SELECT SUM(coin)::text AS coin FROM users WHERE id=ANY($1::bigint[])`,[ids]);
  const inventory=await query(client,`INSERT INTO cnine_user_inventory
   (user_id,item_code,quantity,unseen_quantity,created_at,updated_at)
   SELECT t.user_id,$3,t.amount,t.amount,CURRENT_TIMESTAMP,CURRENT_TIMESTAMP
   FROM unnest($1::bigint[],$2::bigint[]) AS t(user_id,amount)
   ON CONFLICT(user_id,item_code) DO UPDATE SET
    quantity=cnine_user_inventory.quantity+excluded.quantity,
    unseen_quantity=cnine_user_inventory.unseen_quantity+excluded.unseen_quantity,
    updated_at=CURRENT_TIMESTAMP
   RETURNING user_id::int AS "userId",quantity::text AS quantity,unseen_quantity::text AS unseen`,
   [ids,amounts,ITEM_CODE]);
  assert.equal(inventory.length,77,'Partial inventory grant');
  const byUser=new Map(inventory.map(row=>[row.userId,row]));
  for(const target of TARGETS){
   const row=byUser.get(target.userId);
   assert.ok(row,'Recipient inventory missing');
   assert.equal(row.quantity,String(target.rooms),'Incorrect inventory grant');
   assert.equal(row.unseen,String(target.rooms),'Incorrect unseen grant');
  }
  const logs=await query(client,`INSERT INTO inventory_logs
   (user_id,item_code,change_amount,balance_after,reason,reference_type,reference_id,admin_id,created_at)
   SELECT t.user_id,$3,t.amount,i.quantity,$4,'SYSTEM_GRANT',$5,$6,CURRENT_TIMESTAMP
   FROM unnest($1::bigint[],$2::bigint[]) AS t(user_id,amount)
   JOIN cnine_user_inventory i ON i.user_id=t.user_id AND i.item_code=$3
   ORDER BY t.user_id RETURNING id::text,user_id::int AS "userId"`,
   [ids,amounts,ITEM_CODE,REASON,OPERATION_KEY,owner.id]);
  assert.equal(logs.length,77,'Partial grant ledger');
  const logByUser=new Map(logs.map(row=>[row.userId,row.id]));
  assert.equal(logByUser.size,77,'Duplicate grant ledger');
  const [walletAfter]=await query(client,`SELECT SUM(coin)::text AS coin FROM users WHERE id=ANY($1::bigint[])`,[ids]);
  assert.deepEqual(walletAfter,walletBefore,'Coin wallets changed while granting boxes');
  const receipt={status:'COMPLETED',operationKey:OPERATION_KEY,planHash:PLAN_HASH,
   itemCode:ITEM_CODE,accounts:77,boxes:218,held:4,avatarGrants:0,
   rule:plan.rule,delivery:'DIRECT_INVENTORY',actor:'SYSTEM_OPS',
   allocations:TARGETS.map(target=>({userId:target.userId,nickname:target.nickname,rooms:target.rooms,
    before:'0',after:byUser.get(target.userId).quantity,logId:logByUser.get(target.userId)})),
   completedAt:new Date().toISOString()};
  const audit=await query(client,`INSERT INTO admin_logs
   (admin_id,action_type,target_type,target_id,before_data,after_data,created_at)
   VALUES($1,'FUNDING_GIFT_ROOM_GRANT','USER_INVENTORY',$2,$3,$4,CURRENT_TIMESTAMP)
   RETURNING id::text`,[owner.id,OPERATION_KEY,JSON.stringify(snapshot.baseline),JSON.stringify(receipt)]);
  assert.equal(audit.length,1,'Campaign audit missing');
  receipt.auditId=audit[0].id;
  const stored=await query(client,'UPDATE app_meta SET value=$2,updated_at=CURRENT_TIMESTAMP WHERE key=$1 RETURNING key',
   [OPERATION_KEY,JSON.stringify(receipt)]);
  assert.equal(stored.length,1,'Completion receipt missing');
  const verification=await verifyFundingGiftRooms(client,receipt);
  await client.query(dryRun?'ROLLBACK':'COMMIT');
  return {receipt,verification,dryRun,replayed:false};
 }catch(error){await client.query('ROLLBACK').catch(()=>{});throw error;}
}
