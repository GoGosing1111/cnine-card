import assert from 'node:assert/strict';

export const OPERATION_KEY='ops:kim-ayoon-repair-coupon:20260926:v1';
export const TARGET=Object.freeze({id:5209,nickname:'김아윤'});
export const ITEM_CODE='PINGDU_REPAIR_COUPON';
export const ITEM_NAME='핑두 리페어 쿠폰';
const REASON='사용자 지시: 김아윤 리페어권 2장 지급';
const walletSql='SELECT id,nickname,status,coin,card_shards,magic_crystals FROM users WHERE id=$1';
const balances=row=>({quantity:String(row?.quantity??0),unseenQuantity:String(row?.unseen_quantity??0)});

// Explicit one-time operation; never imported by game routes or initialization.
export async function grantKimAyoonRepairCoupon(client,{dryRun=false}={}){
 const q=async(sql,args=[])=>(await client.query(sql,args)).rows;
 await client.query('BEGIN');
 try{
  await client.query("SET LOCAL lock_timeout='3s'");
  await client.query("SET LOCAL statement_timeout='15s'");
  // Serializes retries for this account before reading the completion marker.
  const users=await q("SELECT id,nickname,status FROM users WHERE REPLACE(TRIM(nickname),' ','')=$1 ORDER BY id FOR UPDATE",[TARGET.nickname]);
  assert.equal(users.length,1,'Exactly one matching account required');
  assert.equal(Number(users[0].id),TARGET.id,'Reviewed account changed');
  assert.equal(users[0].nickname,TARGET.nickname,'Reviewed nickname changed');
  assert.equal(users[0].status,'ACTIVE','Target account must be active');
  const [saved]=await q('SELECT value FROM app_meta WHERE key=$1',[OPERATION_KEY]);
  if(saved){
   const receipt=JSON.parse(saved.value);
   assert.equal(receipt.status,'COMPLETED');assert.equal(receipt.operationKey,OPERATION_KEY);
   assert.equal(receipt.user.id,TARGET.id);assert.equal(receipt.itemCode,ITEM_CODE);assert.equal(receipt.amount,2);
   await client.query('COMMIT');return {...receipt,replayed:true};
  }
  const [item]=await q('SELECT name,is_active FROM inventory_items WHERE code=$1 FOR SHARE',[ITEM_CODE]);
  assert.equal(item?.name,ITEM_NAME,'Reviewed catalog changed');assert.equal(Number(item.is_active),1,'Item must be active');
  const [owner]=await q("SELECT id FROM users WHERE UPPER(role)='OWNER' AND UPPER(status)='ACTIVE' ORDER BY id LIMIT 1");
  assert.ok(owner,'Active owner required for audit attribution');
  assert.equal((await q('SELECT id FROM inventory_logs WHERE user_id=$1 AND item_code=$2 AND reference_id=$3',[TARGET.id,ITEM_CODE,OPERATION_KEY])).length,0,'Grant ledger exists without receipt');
  const [owned]=await q('SELECT quantity,unseen_quantity FROM cnine_user_inventory WHERE user_id=$1 AND item_code=$2 FOR UPDATE',[TARGET.id,ITEM_CODE]);
  const before=balances(owned),walletBefore=(await q(walletSql,[TARGET.id]))[0];
  for(const value of Object.values(before))assert.ok(BigInt(value)>=0n&&BigInt(value)<=BigInt(Number.MAX_SAFE_INTEGER)-2n,'Invalid inventory balance');
  const now=new Date().toISOString();
  const inventory=await q(`INSERT INTO cnine_user_inventory(user_id,item_code,quantity,unseen_quantity,created_at,updated_at)
   VALUES($1,$2,2,2,$3,$3)
   ON CONFLICT(user_id,item_code) DO UPDATE SET quantity=cnine_user_inventory.quantity+2,
    unseen_quantity=cnine_user_inventory.unseen_quantity+2,updated_at=excluded.updated_at
   RETURNING quantity,unseen_quantity`,[TARGET.id,ITEM_CODE,now]);
  assert.equal(inventory.length,1,'Inventory grant missing');
  const after=balances(inventory[0]);
  for(const key of Object.keys(before))assert.equal(BigInt(after[key]),BigInt(before[key])+2n,'Incorrect inventory delta');
  const ledger=await q(`INSERT INTO inventory_logs(user_id,item_code,change_amount,balance_after,reason,reference_type,reference_id,admin_id,created_at)
   VALUES($1,$2,2,$3,$4,'SYSTEM_GRANT',$5,$6,$7) RETURNING id`,[TARGET.id,ITEM_CODE,after.quantity,REASON,OPERATION_KEY,owner.id,now]);
  assert.equal(ledger.length,1,'Grant ledger missing');
  assert.deepEqual((await q(walletSql,[TARGET.id]))[0],walletBefore,'Account balances changed');
  const receipt={status:'COMPLETED',operationKey:OPERATION_KEY,actor:'SYSTEM_OPS',user:TARGET,itemCode:ITEM_CODE,itemName:ITEM_NAME,amount:2,
   before,after,inventoryLogId:String(ledger[0].id),completedAt:now};
  const audit=await q(`INSERT INTO admin_logs(admin_id,action_type,target_type,target_id,before_data,after_data,created_at)
   VALUES($1,'OPS_REPAIR_COUPON_GRANT','USER_INVENTORY',$2,$3,$4,$5) RETURNING id`,
   [owner.id,`${TARGET.id}:${ITEM_CODE}`,JSON.stringify({operationKey:OPERATION_KEY,...before}),JSON.stringify({...receipt,reason:REASON}),now]);
  assert.equal(audit.length,1,'Grant audit missing');receipt.adminLogId=String(audit[0].id);
  assert.equal((await q('INSERT INTO app_meta(key,value,updated_at) VALUES($1,$2,$3) RETURNING key',[OPERATION_KEY,JSON.stringify(receipt),now])).length,1,'Completion receipt missing');
  await client.query(dryRun?'ROLLBACK':'COMMIT');return {...receipt,dryRun,replayed:false};
 }catch(error){await client.query('ROLLBACK').catch(()=>{});throw error;}
}
