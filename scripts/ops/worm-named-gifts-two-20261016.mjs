import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import PLAN from './worm-named-gifts-two-20261016.targets.json' with {type:'json'};

export const OPERATION_KEY=PLAN.operationKey,ITEM=PLAN.itemCode,TARGETS=PLAN.targets;
export const PLAN_HASH=createHash('sha256').update(JSON.stringify(PLAN)).digest('hex');
const REASON='명단 지정 지렁이대회 사은품 2개씩 추가 지급 — 2026-10-16';
const ACTION='OPS_WORM_NAMED_GIFT';
const ids=TARGETS.map(t=>t.userId),total=TARGETS.reduce((n,t)=>n+t.boxes,0);
assert.equal(TARGETS.length,21);assert.equal(new Set(ids).size,21);assert.equal(total,42);
for(const t of TARGETS)assert.equal(t.boxes,2);
const q=async(db,sql,args=[])=>(await db.query(sql,args)).rows;
const balance=r=>({quantity:String(r?.quantity??0),unseenQuantity:String(r?.unseen_quantity??0)});

export async function inspect(db){
 const users=await q(db,'SELECT id::text id,nickname,status FROM users WHERE id=ANY($1::bigint[]) ORDER BY id::bigint',[ids]);
 const items=await q(db,'SELECT code,name,is_active FROM inventory_items WHERE code=$1',[ITEM]);
 const inventory=await q(db,'SELECT user_id::text user_id,quantity::text quantity,unseen_quantity::text unseen_quantity FROM cnine_user_inventory WHERE item_code=$1 AND user_id=ANY($2::bigint[]) ORDER BY user_id::bigint',[ITEM,ids]);
 const logs=await q(db,'SELECT id::text id,user_id::text user_id,change_amount::text change_amount FROM inventory_logs WHERE reference_id=$1 AND item_code=$2 AND user_id=ANY($3::bigint[]) ORDER BY id',[OPERATION_KEY,ITEM,ids]);
 const [saved]=await q(db,'SELECT value FROM app_meta WHERE key=$1',[OPERATION_KEY]);
 return {checkedAt:new Date().toISOString(),users,items,inventory,logs,receipt:saved?JSON.parse(saved.value):null};
}

export async function verify(db,receipt){
 if(!receipt){const [saved]=await q(db,'SELECT value FROM app_meta WHERE key=$1',[OPERATION_KEY]);assert(saved,'Missing grant receipt');receipt=JSON.parse(saved.value);}
 assert.equal(receipt.status,'COMPLETED');assert.equal(receipt.operationKey,OPERATION_KEY);assert.equal(receipt.planHash,PLAN_HASH);
 assert.equal(receipt.itemCode,ITEM);assert.equal(receipt.delivery,'DIRECT_INVENTORY');assert.equal(receipt.recipientCount,21);assert.equal(receipt.totalBoxes,42);
 assert.deepEqual(receipt.allocations.map(({userId,nickname,boxes})=>({userId,nickname,boxes})),TARGETS.map(({userId,nickname,boxes})=>({userId,nickname,boxes})));
 const logs=await q(db,'SELECT id::text id,user_id::text user_id,item_code,change_amount::text change_amount,balance_after::text balance_after,admin_id::text admin_id,reason,reference_type FROM inventory_logs WHERE reference_id=$1 AND item_code=$2 AND user_id=ANY($3::bigint[]) ORDER BY user_id',[OPERATION_KEY,ITEM,ids]);
 assert.equal(logs.length,21);assert.equal(new Set(logs.map(r=>r.user_id)).size,21);
 for(const row of receipt.allocations){
  const log=logs.find(l=>l.id===row.logId);assert(log,'Missing inventory ledger');assert.equal(log.user_id,row.userId);assert.equal(log.item_code,ITEM);
  assert.equal(log.change_amount,'2');assert.equal(log.balance_after,row.after.quantity);assert.equal(log.admin_id,receipt.adminId);assert.equal(log.reason,REASON);assert.equal(log.reference_type,'SYSTEM_GRANT');
  for(const key of ['quantity','unseenQuantity'])assert.equal(BigInt(row.after[key])-BigInt(row.before[key]),2n);
 }
 const [audit]=await q(db,'SELECT action_type,target_id,after_data FROM admin_logs WHERE id=$1',[receipt.auditId]);
 assert.equal(audit?.action_type,ACTION);assert.equal(audit.target_id,OPERATION_KEY);
 const {auditId,...audited}=receipt;assert.deepEqual(JSON.parse(audit.after_data),audited);
 return {status:'VERIFIED',recipients:21,totalBoxes:42,boxesPerAccount:2,ledgerRows:logs.length,missing:0,duplicates:0,auditId:receipt.auditId,completedAt:receipt.completedAt};
}

// Caller holds each target's live USER_LOCK and PostgreSQL fallback lease.
// Prior campaign rewards are preserved; this explicitly authorized grant is additional.
export async function grant(db,{expectedPlanHash,commit=false,lockDeadline}={}){
 assert.equal(expectedPlanHash,PLAN_HASH,'Reviewed recipient plan changed');
 assert.ok(Number.isFinite(lockDeadline)&&lockDeadline>Date.now()+10000,'Live account locks required');
 await db.query('BEGIN');
 try{
  await db.query("SET LOCAL lock_timeout='3s'");await db.query("SET LOCAL statement_timeout='15s'");
  await q(db,'SELECT pg_advisory_xact_lock(hashtextextended($1,0))',[OPERATION_KEY]);
  const [saved]=await q(db,'SELECT value FROM app_meta WHERE key=$1',[OPERATION_KEY]);
  if(saved){const receipt=JSON.parse(saved.value),verification=await verify(db,receipt);await db.query('ROLLBACK');return {receipt,verification,replayed:true,committed:true};}
  const walletSql='SELECT id::text id,nickname,status,coin::text coin,card_shards::text card_shards,magic_crystals::text magic_crystals FROM users WHERE id=ANY($1::bigint[]) ORDER BY id::bigint';
  const users=await q(db,walletSql+' FOR UPDATE',[ids]);assert.equal(users.length,21,'Recipient count changed');
  for(const target of TARGETS){const user=users.find(u=>u.id===target.userId);assert.equal(user?.nickname,target.nickname,'Recipient identity changed');assert.equal(user.status,'ACTIVE');}
  const [owner]=await q(db,"SELECT id::text id FROM users WHERE id=1 AND role='OWNER' AND status='ACTIVE'");assert(owner,'Active owner required');
  const [item]=await q(db,'SELECT name,is_active FROM inventory_items WHERE code=$1 FOR SHARE',[ITEM]);assert.equal(item?.name,PLAN.itemName);assert.equal(Number(item.is_active),1);
  assert.equal((await q(db,'SELECT id FROM inventory_logs WHERE reference_id=$1 AND item_code=$2 AND user_id=ANY($3::bigint[])',[OPERATION_KEY,ITEM,ids])).length,0,'Grant logs without receipt');
  const before=await q(db,'SELECT user_id::text user_id,quantity::text quantity,unseen_quantity::text unseen_quantity FROM cnine_user_inventory WHERE item_code=$1 AND user_id=ANY($2::bigint[]) ORDER BY user_id FOR UPDATE',[ITEM,ids]);
  for(const row of before)for(const value of Object.values(balance(row)))assert.ok(BigInt(value)>=0n&&BigInt(value)<=BigInt(Number.MAX_SAFE_INTEGER)-2n,'Unsupported inventory balance');
  const now=new Date().toISOString(),amounts=TARGETS.map(t=>t.boxes);
  const after=await q(db,`INSERT INTO cnine_user_inventory(user_id,item_code,quantity,unseen_quantity,created_at,updated_at)
   SELECT user_id,$3,amount,amount,$4,$4 FROM unnest($1::bigint[],$2::bigint[]) AS t(user_id,amount)
   ON CONFLICT(user_id,item_code) DO UPDATE SET quantity=cnine_user_inventory.quantity+excluded.quantity,
    unseen_quantity=cnine_user_inventory.unseen_quantity+excluded.unseen_quantity,updated_at=excluded.updated_at
   RETURNING user_id::text user_id,quantity::text quantity,unseen_quantity::text unseen_quantity`,[ids,amounts,ITEM,now]);
  assert.equal(after.length,21,'Partial inventory grant');assert.equal(new Set(after.map(r=>r.user_id)).size,21);
  const balances=ids.map(id=>{const a=after.find(r=>r.user_id===id);assert(a);const b=balance(before.find(r=>r.user_id===id));for(const key of ['quantity','unseenQuantity'])assert.equal(BigInt(balance(a)[key])-BigInt(b[key]),2n);return a.quantity;});
  const logs=await q(db,`INSERT INTO inventory_logs(user_id,item_code,change_amount,balance_after,reason,reference_type,reference_id,admin_id,created_at)
   SELECT user_id,$4,amount,balance,$5,'SYSTEM_GRANT',$6,$7,$8 FROM unnest($1::bigint[],$2::bigint[],$3::bigint[]) AS t(user_id,amount,balance)
   RETURNING id::text id,user_id::text user_id`,[ids,amounts,balances,ITEM,REASON,OPERATION_KEY,owner.id,now]);assert.equal(logs.length,21,'Partial grant ledger');
  assert.deepEqual(await q(db,walletSql,[ids]),users,'Unrelated account balances changed');
  const receipt={status:'COMPLETED',operationKey:OPERATION_KEY,planHash:PLAN_HASH,authorization:PLAN.authorization,itemCode:ITEM,itemName:PLAN.itemName,
   delivery:'DIRECT_INVENTORY',recipientCount:21,totalBoxes:42,adminId:owner.id,completedAt:now,
   allocations:TARGETS.map(t=>({...t,before:balance(before.find(r=>r.user_id===t.userId)),after:balance(after.find(r=>r.user_id===t.userId)),logId:logs.find(r=>r.user_id===t.userId).id}))};
  const [audit]=await q(db,"INSERT INTO admin_logs(admin_id,action_type,target_type,target_id,before_data,after_data,created_at) VALUES($1,$2,'USER_INVENTORY',$3,$4,$5,$6) RETURNING id::text id",
   [owner.id,ACTION,OPERATION_KEY,JSON.stringify({priorOperation:null,planHash:PLAN_HASH}),JSON.stringify(receipt),now]);assert(audit);receipt.auditId=audit.id;
  assert.equal((await q(db,'INSERT INTO app_meta(key,value,updated_at) VALUES($1,$2,$3) RETURNING key',[OPERATION_KEY,JSON.stringify(receipt),now])).length,1);
  const verification=await verify(db,receipt);assert.ok(lockDeadline>Date.now()+2000,'Account lock lease expiring');
  await db.query(commit?'COMMIT':'ROLLBACK');return {receipt,verification,committed:commit,replayed:false};
 }catch(error){await db.query('ROLLBACK').catch(()=>{});throw error;}
}
