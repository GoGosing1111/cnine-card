import assert from 'node:assert/strict';
export const OPERATION_KEY='ops:namsudaeng-o-suit-core5:20261016:20:v1';
export const TARGET=Object.freeze({id:5950,nickname:'남수댕ㅗ'});
export const ITEM='SUIT_CORE_5',ITEM_NAME='슈트 코어 5',AMOUNT=20;
const REASON='사용자 지시: 남수댕ㅗ 계정에 슈트코어5 20개 지급';
const ACTION='OPS_CRAFT_MATERIALS_GRANT';
const q=async(db,sql,args=[])=>(await db.query(sql,args)).rows;
const balance=row=>({quantity:String(row?.quantity??0),unseenQuantity:String(row?.unseen_quantity??0)});
export async function inspect(db){
 const users=await q(db,'SELECT id::text id,nickname,status FROM users WHERE id=$1',[TARGET.id]);
 const items=await q(db,'SELECT code,name,is_active FROM inventory_items WHERE code=$1',[ITEM]);
 const inventory=await q(db,'SELECT quantity::text quantity,unseen_quantity::text unseen_quantity FROM cnine_user_inventory WHERE user_id=$1 AND item_code=$2',[TARGET.id,ITEM]);
 const logs=await q(db,'SELECT id::text id,user_id::text user_id,item_code,change_amount::text change_amount,balance_after::text balance_after,reference_type FROM inventory_logs WHERE user_id=$1 AND item_code=$2 AND reference_id=$3 ORDER BY id',[TARGET.id,ITEM,OPERATION_KEY]);
 const [saved]=await q(db,'SELECT value FROM app_meta WHERE key=$1',[OPERATION_KEY]);
 return {checkedAt:new Date().toISOString(),users,items,inventory,logs,receipt:saved?JSON.parse(saved.value):null};
}
export async function verify(db,receipt){
 const snapshot=await inspect(db);receipt??=snapshot.receipt;assert(receipt,'Missing receipt');
 assert.equal(receipt.operationKey,OPERATION_KEY);assert.equal(receipt.status,'COMPLETED');assert.deepEqual(receipt.user,TARGET);
 assert.equal(receipt.itemCode,ITEM);assert.equal(receipt.quantity,AMOUNT);assert.equal(snapshot.logs.length,1);
 for(const key of ['quantity','unseenQuantity'])assert.equal(BigInt(receipt.after[key])-BigInt(receipt.before[key]),20n);
 const log=snapshot.logs[0];assert.equal(log.id,receipt.logId);assert.equal(log.user_id,String(TARGET.id));assert.equal(log.item_code,ITEM);
 assert.equal(log.change_amount,'20');assert.equal(log.balance_after,receipt.after.quantity);assert.equal(log.reference_type,'SYSTEM_GRANT');
 const [audit]=await q(db,'SELECT action_type,target_id,after_data FROM admin_logs WHERE id=$1',[receipt.auditId]);
 assert.equal(audit?.action_type,ACTION);assert.equal(audit.target_id,OPERATION_KEY);const {auditId,...audited}=receipt;assert.deepEqual(JSON.parse(audit.after_data),audited);
 return {verified:true,grantLogs:1,inventory:snapshot.inventory,verifiedAt:new Date().toISOString()};
}
// Caller holds the live USER_LOCK and PostgreSQL fallback lease for this exact account.
export async function grant(db,{commit=false,lockDeadline}={}){
 assert.ok(Number.isFinite(lockDeadline)&&lockDeadline>Date.now()+10000,'Live account lock required');
 await db.query('BEGIN');
 try{
  await db.query("SET LOCAL lock_timeout='3s'");await db.query("SET LOCAL statement_timeout='15s'");
  const users=await q(db,'SELECT id::text id,nickname,status,coin::text coin,card_shards::text card_shards,magic_crystals::text magic_crystals FROM users WHERE id=$1 FOR UPDATE',[TARGET.id]);
  assert.equal(users.length,1,'Exact account required');assert.equal(users[0].nickname,TARGET.nickname,'Account nickname changed');assert.equal(users[0].status,'ACTIVE');
  const [saved]=await q(db,'SELECT value FROM app_meta WHERE key=$1',[OPERATION_KEY]);
  if(saved){const receipt=JSON.parse(saved.value),verification=await verify(db,receipt);await db.query('ROLLBACK');return {receipt,verification,replayed:true,committed:true};}
  const [owner]=await q(db,"SELECT id::text id FROM users WHERE role='OWNER' AND status='ACTIVE' ORDER BY id LIMIT 1");assert(owner,'Active owner required');
  const [item]=await q(db,'SELECT name,is_active FROM inventory_items WHERE code=$1 FOR SHARE',[ITEM]);assert.equal(item?.name,ITEM_NAME);assert.equal(Number(item.is_active),1);
  assert.equal((await q(db,'SELECT id FROM inventory_logs WHERE user_id=$1 AND item_code=$2 AND reference_id=$3',[TARGET.id,ITEM,OPERATION_KEY])).length,0,'Ledger without receipt');
  const [owned]=await q(db,'SELECT quantity,unseen_quantity FROM cnine_user_inventory WHERE user_id=$1 AND item_code=$2 FOR UPDATE',[TARGET.id,ITEM]),before=balance(owned);
  for(const value of Object.values(before))assert(BigInt(value)>=0n&&BigInt(value)<=BigInt(Number.MAX_SAFE_INTEGER)-20n);
  const now=new Date().toISOString();
  const changed=await q(db,`INSERT INTO cnine_user_inventory(user_id,item_code,quantity,unseen_quantity,created_at,updated_at)
   VALUES($1,$2,$3,$3,$4,$4) ON CONFLICT(user_id,item_code) DO UPDATE SET quantity=cnine_user_inventory.quantity+excluded.quantity,
   unseen_quantity=cnine_user_inventory.unseen_quantity+excluded.unseen_quantity,updated_at=excluded.updated_at RETURNING quantity,unseen_quantity`,[TARGET.id,ITEM,AMOUNT,now]);
  assert.equal(changed.length,1);const after=balance(changed[0]);for(const key of Object.keys(before))assert.equal(BigInt(after[key])-BigInt(before[key]),20n);
  const logs=await q(db,`INSERT INTO inventory_logs(user_id,item_code,change_amount,balance_after,reason,reference_type,reference_id,admin_id,created_at)
   VALUES($1,$2,$3,$4,$5,'SYSTEM_GRANT',$6,$7,$8) RETURNING id::text id`,[TARGET.id,ITEM,AMOUNT,after.quantity,REASON,OPERATION_KEY,owner.id,now]);assert.equal(logs.length,1);
  const receipt={status:'COMPLETED',operationKey:OPERATION_KEY,user:TARGET,itemCode:ITEM,itemName:ITEM_NAME,quantity:AMOUNT,reason:REASON,before,after,logId:logs[0].id,adminId:owner.id,completedAt:now};
  const audits=await q(db,`INSERT INTO admin_logs(admin_id,action_type,target_type,target_id,before_data,after_data,created_at)
   VALUES($1,$2,'USER_INVENTORY',$3,$4,$5,$6) RETURNING id::text id`,[owner.id,ACTION,OPERATION_KEY,JSON.stringify(before),JSON.stringify(receipt),now]);assert.equal(audits.length,1);receipt.auditId=audits[0].id;
  assert.equal((await q(db,'INSERT INTO app_meta(key,value,updated_at) VALUES($1,$2,$3) RETURNING key',[OPERATION_KEY,JSON.stringify(receipt),now])).length,1);
  assert.deepEqual(await q(db,'SELECT id::text id,nickname,status,coin::text coin,card_shards::text card_shards,magic_crystals::text magic_crystals FROM users WHERE id=$1',[TARGET.id]),users);
  const verification=await verify(db,receipt);assert(lockDeadline>Date.now()+2000,'Account lock lease expiring');
  await db.query(commit?'COMMIT':'ROLLBACK');return {receipt,verification,replayed:false,committed:commit};
 }catch(error){await db.query('ROLLBACK').catch(()=>{});throw error;}
}
