import assert from 'node:assert/strict';
export const OPERATION_KEY='ops:yeobongsang-room-sponsor:20261018:two:v1';
export const TARGET=Object.freeze({id:5598,nickname:'여봉상'});
export const UNITS=2,COIN='4000000000000',ITEM='SUIT_CORE_6',ITEM_NAME='슈트 코어 6',AMOUNT=20;
const ACTION='OPS_ROOM_SPONSOR_REWARDS',REASON='방 후원 2회분: 4조 코인·슈트 코어 6 20개 / '+OPERATION_KEY;
const q=async(db,sql,args=[])=>(await db.query(sql,args)).rows;
const one=rows=>{assert.equal(rows.length,1,'Expected one exact row');return rows[0];};
const balances=(user,owned)=>({coin:String(user.coin),quantity:String(owned?.quantity??0),unseenQuantity:String(owned?.unseen_quantity??0)});
export async function inspect(db){
 const users=await q(db,'SELECT id::text id,nickname,status,coin::text coin FROM users WHERE id=$1',[TARGET.id]);
 const items=await q(db,'SELECT code,name,is_active FROM inventory_items WHERE code=$1',[ITEM]);
 const inventory=await q(db,'SELECT quantity::text quantity,unseen_quantity::text unseen_quantity FROM cnine_user_inventory WHERE user_id=$1 AND item_code=$2',[TARGET.id,ITEM]);
 const logs=await q(db,'SELECT id::text id,user_id::text user_id,item_code,change_amount::text change_amount,balance_after::text balance_after,reference_type,reference_id,reason FROM inventory_logs WHERE user_id=$1 AND reference_id=$2 ORDER BY id',[TARGET.id,OPERATION_KEY]);
 const coinLogs=await q(db,'SELECT id::text id,user_id::text user_id,change_amount::text change_amount,balance_after::text balance_after,reason FROM coin_logs WHERE user_id=$1 AND reason=$2 ORDER BY id',[TARGET.id,REASON]);
 const [saved]=await q(db,'SELECT value FROM app_meta WHERE key=$1',[OPERATION_KEY]);
 return {users,items,inventory,logs,coinLogs,receipt:saved?JSON.parse(saved.value):null};
}
export async function verify(db,receipt){
 const snapshot=await inspect(db);receipt??=snapshot.receipt;assert(receipt,'Missing receipt');
 assert.equal(receipt.operationKey,OPERATION_KEY);assert.equal(receipt.status,'COMPLETED');assert.deepEqual(receipt.user,TARGET);
 assert.equal(receipt.units,UNITS);assert.equal(receipt.coinGranted,COIN);assert.equal(receipt.itemCode,ITEM);assert.equal(receipt.itemName,ITEM_NAME);assert.equal(receipt.coresGranted,AMOUNT);
 assert.equal(BigInt(receipt.after.coin)-BigInt(receipt.before.coin),BigInt(COIN));
 for(const key of ['quantity','unseenQuantity'])assert.equal(BigInt(receipt.after[key])-BigInt(receipt.before[key]),BigInt(AMOUNT));
 const coin=one(snapshot.coinLogs),core=one(snapshot.logs);
 assert.equal(coin.id,receipt.coinLogId);assert.equal(coin.user_id,String(TARGET.id));assert.equal(coin.change_amount,COIN);assert.equal(coin.balance_after,receipt.after.coin);assert.equal(coin.reason,REASON);
 assert.equal(core.id,receipt.coreLogId);assert.equal(core.user_id,String(TARGET.id));assert.equal(core.item_code,ITEM);assert.equal(core.change_amount,String(AMOUNT));assert.equal(core.balance_after,receipt.after.quantity);
 assert.equal(core.reference_type,ACTION);assert.equal(core.reference_id,OPERATION_KEY);assert.equal(core.reason,REASON);
 const audit=one(await q(db,'SELECT action_type,target_id,after_data FROM admin_logs WHERE id=$1',[receipt.auditId]));
 assert.equal(audit.action_type,ACTION);assert.equal(audit.target_id,OPERATION_KEY);const {auditId,...audited}=receipt;assert.deepEqual(JSON.parse(audit.after_data),audited);
 return {verified:true,coinLogs:1,inventoryLogs:1,coinGranted:COIN,coresGranted:AMOUNT,verifiedAt:new Date().toISOString()};
}
// Only an explicit operations call under the account's live USER_LOCK and DB lease.
// This is independent of the already completed 38-account sponsor operation.
export async function grant(db,{dryRun=true,lockDeadline}={}){
 assert(Number.isSafeInteger(lockDeadline)&&lockDeadline>Date.now()+10000,'Live account lock required');
 await db.query('BEGIN');
 try{
  await db.query("SET LOCAL lock_timeout='3s'");await db.query("SET LOCAL statement_timeout='15s'");
  const user=one(await q(db,'SELECT id,nickname,status,coin,card_shards,magic_crystals FROM users WHERE id=$1 FOR UPDATE',[TARGET.id]));
  const [saved]=await q(db,'SELECT value FROM app_meta WHERE key=$1',[OPERATION_KEY]);
  if(saved){const receipt=JSON.parse(saved.value),verification=await verify(db,receipt);await db.query('ROLLBACK');return {receipt,verification,replayed:true,dryRun};}
  assert.equal(user.nickname,TARGET.nickname,'Account nickname changed');assert.equal(user.status,'ACTIVE');
  const owner=one(await q(db,"SELECT id FROM users WHERE id=1 AND role='OWNER' AND status='ACTIVE'"));
  const item=one(await q(db,'SELECT name,is_active FROM inventory_items WHERE code=$1 FOR SHARE',[ITEM]));assert.equal(item.name,ITEM_NAME);assert.equal(Number(item.is_active),1);
  assert.equal((await q(db,'SELECT id FROM inventory_logs WHERE user_id=$1 AND reference_id=$2',[TARGET.id,OPERATION_KEY])).length,0,'Inventory ledger without receipt');
  assert.equal((await q(db,'SELECT id FROM coin_logs WHERE user_id=$1 AND reason=$2',[TARGET.id,REASON])).length,0,'Coin ledger without receipt');
  const [owned]=await q(db,'SELECT quantity,unseen_quantity FROM cnine_user_inventory WHERE user_id=$1 AND item_code=$2 FOR UPDATE',[TARGET.id,ITEM]),before=balances(user,owned);
  for(const [key,value]of Object.entries(before)){const delta=key==='coin'?BigInt(COIN):BigInt(AMOUNT);assert(BigInt(value)>=0n&&BigInt(value)+delta<=BigInt(Number.MAX_SAFE_INTEGER),'Balance overflow');}
  const now=new Date().toISOString(),wallet=one(await q(db,'UPDATE users SET coin=coin+$2 WHERE id=$1 RETURNING coin,card_shards,magic_crystals',[TARGET.id,COIN]));
  assert.equal(wallet.card_shards,user.card_shards);assert.equal(wallet.magic_crystals,user.magic_crystals);
  const inventory=one(await q(db,`INSERT INTO cnine_user_inventory(user_id,item_code,quantity,unseen_quantity,created_at,updated_at)
   VALUES($1,$2,$3,$3,$4,$4) ON CONFLICT(user_id,item_code) DO UPDATE SET quantity=cnine_user_inventory.quantity+excluded.quantity,
   unseen_quantity=cnine_user_inventory.unseen_quantity+excluded.unseen_quantity,updated_at=excluded.updated_at RETURNING quantity,unseen_quantity`,[TARGET.id,ITEM,AMOUNT,now]));
  const after=balances(wallet,inventory);
  const coinLog=one(await q(db,'INSERT INTO coin_logs(user_id,change_amount,balance_after,reason,admin_id,created_at) VALUES($1,$2,$3,$4,$5,$6) RETURNING id::text id',[TARGET.id,COIN,after.coin,REASON,owner.id,now]));
  const coreLog=one(await q(db,`INSERT INTO inventory_logs(user_id,item_code,change_amount,balance_after,reason,reference_type,reference_id,admin_id,created_at)
   VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9) RETURNING id::text id`,[TARGET.id,ITEM,AMOUNT,after.quantity,REASON,ACTION,OPERATION_KEY,owner.id,now]));
  const receipt={status:'COMPLETED',operationKey:OPERATION_KEY,user:TARGET,units:UNITS,coinGranted:COIN,itemCode:ITEM,itemName:ITEM_NAME,coresGranted:AMOUNT,delivery:'DIRECT',before,after,coinLogId:coinLog.id,coreLogId:coreLog.id,adminId:String(owner.id),completedAt:now};
  const audit=one(await q(db,`INSERT INTO admin_logs(admin_id,action_type,target_type,target_id,before_data,after_data,created_at)
   VALUES($1,$2,'USER',$3,$4,$5,$6) RETURNING id::text id`,[owner.id,ACTION,OPERATION_KEY,JSON.stringify(before),JSON.stringify(receipt),now]));receipt.auditId=audit.id;
  one(await q(db,'INSERT INTO app_meta(key,value,updated_at) VALUES($1,$2,$3) RETURNING key',[OPERATION_KEY,JSON.stringify(receipt),now]));
  const verification=await verify(db,receipt);assert(lockDeadline>Date.now()+2000,'Account lock lease expiring');
  await db.query(dryRun?'ROLLBACK':'COMMIT');return {receipt,verification,replayed:false,dryRun};
 }catch(error){await db.query('ROLLBACK').catch(()=>{});throw error;}
}
