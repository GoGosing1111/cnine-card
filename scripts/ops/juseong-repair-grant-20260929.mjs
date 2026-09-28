import assert from 'node:assert/strict';

export const OPERATION_KEY='ops:juseong-repair-coupon:20260929:three:v1';
export const TARGET=Object.freeze({id:5393,nickname:'주성'});
export const ITEM_CODE='PINGDU_REPAIR_COUPON',ITEM_NAME='핑두 리페어 쿠폰',AMOUNT=3;
const REASON='사용자 지시: 주성 계정에 리페어권 3장 지급';
const walletSql='SELECT id,nickname,status,coin,card_shards,magic_crystals FROM users WHERE id=$1';
const balances=row=>({quantity:String(row?.quantity??0),unseenQuantity:String(row?.unseen_quantity??0)});

export async function inspectJuseongRepair(q){
 const users=await q("SELECT id,nickname,status,role FROM users WHERE REPLACE(TRIM(nickname),' ','')=$1 ORDER BY id",[TARGET.nickname]);
 const [inventory]=await q('SELECT quantity,unseen_quantity,updated_at FROM cnine_user_inventory WHERE user_id=$1 AND item_code=$2',[TARGET.id,ITEM_CODE]);
 const [item]=await q('SELECT code,name,is_active FROM inventory_items WHERE code=$1',[ITEM_CODE]);
 const [saved]=await q('SELECT value FROM app_meta WHERE key=$1',[OPERATION_KEY]);
 const logs=await q('SELECT id,user_id,item_code,change_amount,balance_after,reason,reference_type FROM inventory_logs WHERE reference_id=$1',[OPERATION_KEY]);
 return {users,inventory:inventory||null,item,receipt:saved?JSON.parse(saved.value):null,logs};
}

export async function verifyJuseongRepair(q,receipt){
 assert.equal(receipt.status,'COMPLETED');assert.equal(receipt.operationKey,OPERATION_KEY);
 assert.deepEqual(receipt.user,TARGET);assert.equal(receipt.itemCode,ITEM_CODE);assert.equal(receipt.itemName,ITEM_NAME);assert.equal(receipt.amount,AMOUNT);
 for(const key of ['quantity','unseenQuantity'])assert.equal(BigInt(receipt.after[key])-BigInt(receipt.before[key]),BigInt(AMOUNT));
 const logs=await q('SELECT id,user_id,item_code,change_amount,balance_after,reason,reference_type FROM inventory_logs WHERE reference_id=$1',[OPERATION_KEY]);
 assert.equal(logs.length,1,'Expected exactly one grant ledger');const log=logs[0];
 assert.equal(String(log.id),receipt.inventoryLogId);assert.equal(Number(log.user_id),TARGET.id);assert.equal(log.item_code,ITEM_CODE);
 assert.equal(Number(log.change_amount),AMOUNT);assert.equal(String(log.balance_after),receipt.after.quantity);assert.equal(log.reason,REASON);assert.equal(log.reference_type,'SYSTEM_GRANT');
 const [audit]=await q('SELECT action_type,target_type,target_id,after_data FROM admin_logs WHERE id=$1',[receipt.adminLogId]);
 assert.equal(audit?.action_type,'OPS_REPAIR_COUPON_GRANT');assert.equal(audit.target_type,'USER_INVENTORY');assert.equal(audit.target_id,`${TARGET.id}:${ITEM_CODE}`);
 const recorded=JSON.parse(audit.after_data);assert.equal(recorded.operationKey,OPERATION_KEY);assert.deepEqual(recorded.before,receipt.before);assert.deepEqual(recorded.after,receipt.after);
 const [inventory]=await q('SELECT quantity,unseen_quantity FROM cnine_user_inventory WHERE user_id=$1 AND item_code=$2',[TARGET.id,ITEM_CODE]);
 return {granted:AMOUNT,grantLogs:logs.length,inventory:balances(inventory),verifiedAt:new Date().toISOString()};
}

// Caller holds the live USER_LOCK and owns BEGIN / COMMIT / ROLLBACK.
// Explicit one-time grant, never imported by game runtime or migrations.
export async function grantJuseongRepair(q){
 const users=await q("SELECT id,nickname,status FROM users WHERE REPLACE(TRIM(nickname),' ','')=$1 ORDER BY id FOR UPDATE",[TARGET.nickname]);
 assert.equal(users.length,1,'Exactly one matching account required');assert.equal(Number(users[0].id),TARGET.id,'Reviewed account changed');
 assert.equal(users[0].nickname,TARGET.nickname);assert.equal(users[0].status,'ACTIVE');
 const [saved]=await q('SELECT value FROM app_meta WHERE key=$1',[OPERATION_KEY]);
 if(saved){const receipt=JSON.parse(saved.value);return {...receipt,verification:await verifyJuseongRepair(q,receipt),replayed:true};}
 const [date]=await q("SELECT to_char(CURRENT_TIMESTAMP AT TIME ZONE 'Asia/Seoul','YYYY-MM-DD') AS kst");assert.equal(date.kst,'2026-09-29');
 const [item]=await q('SELECT name,is_active FROM inventory_items WHERE code=$1 FOR SHARE',[ITEM_CODE]);
 assert.equal(item?.name,ITEM_NAME);assert.equal(Number(item.is_active),1);
 const [owner]=await q("SELECT id FROM users WHERE UPPER(role)='OWNER' AND UPPER(status)='ACTIVE' ORDER BY id LIMIT 1");assert.ok(owner);
 assert.equal((await q('SELECT id FROM inventory_logs WHERE reference_id=$1',[OPERATION_KEY])).length,0,'Grant ledger exists without receipt');
 const [owned]=await q('SELECT quantity,unseen_quantity FROM cnine_user_inventory WHERE user_id=$1 AND item_code=$2 FOR UPDATE',[TARGET.id,ITEM_CODE]);
 const before=balances(owned),walletBefore=(await q(walletSql,[TARGET.id]))[0];
 for(const value of Object.values(before))assert.ok(BigInt(value)>=0n&&BigInt(value)<=BigInt(Number.MAX_SAFE_INTEGER)-BigInt(AMOUNT),'Invalid inventory balance');
 const now=new Date().toISOString();
 const changed=await q(`INSERT INTO cnine_user_inventory(user_id,item_code,quantity,unseen_quantity,created_at,updated_at)
  VALUES($1,$2,$3,$3,$4,$4) ON CONFLICT(user_id,item_code) DO UPDATE
  SET quantity=cnine_user_inventory.quantity+excluded.quantity,unseen_quantity=cnine_user_inventory.unseen_quantity+excluded.unseen_quantity,updated_at=excluded.updated_at
  RETURNING quantity,unseen_quantity`,[TARGET.id,ITEM_CODE,AMOUNT,now]);
 assert.equal(changed.length,1);const after=balances(changed[0]);
 for(const key of Object.keys(before))assert.equal(BigInt(after[key]),BigInt(before[key])+BigInt(AMOUNT));
 const ledger=await q(`INSERT INTO inventory_logs(user_id,item_code,change_amount,balance_after,reason,reference_type,reference_id,admin_id,created_at)
  VALUES($1,$2,$3,$4,$5,'SYSTEM_GRANT',$6,$7,$8) RETURNING id`,[TARGET.id,ITEM_CODE,AMOUNT,after.quantity,REASON,OPERATION_KEY,owner.id,now]);
 assert.equal(ledger.length,1);assert.deepEqual((await q(walletSql,[TARGET.id]))[0],walletBefore,'Other account balances changed');
 const receipt={status:'COMPLETED',operationKey:OPERATION_KEY,actor:'SYSTEM_OPS',user:TARGET,itemCode:ITEM_CODE,itemName:ITEM_NAME,amount:AMOUNT,
  before,after,inventoryLogId:String(ledger[0].id),completedAt:now};
 const audit=await q(`INSERT INTO admin_logs(admin_id,action_type,target_type,target_id,before_data,after_data,created_at)
  VALUES($1,'OPS_REPAIR_COUPON_GRANT','USER_INVENTORY',$2,$3,$4,$5) RETURNING id`,
  [owner.id,`${TARGET.id}:${ITEM_CODE}`,JSON.stringify({operationKey:OPERATION_KEY,...before}),JSON.stringify({...receipt,reason:REASON}),now]);
 assert.equal(audit.length,1);receipt.adminLogId=String(audit[0].id);
 assert.equal((await q('INSERT INTO app_meta(key,value,updated_at) VALUES($1,$2,$3) RETURNING key',[OPERATION_KEY,JSON.stringify(receipt),now])).length,1);
 return {...receipt,verification:await verifyJuseongRepair(q,receipt),replayed:false};
}
