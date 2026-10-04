import assert from 'node:assert/strict';
export const OPERATION_KEY='ops:diim-craft-materials:20261004:emperor20-blueprint1-stars15000000:v1';
export const TARGET=Object.freeze({id:4773,nickname:'진짜디임'});
export const GIFTS=Object.freeze([
  {code:'EMPEROR_ENERGY',name:'엠퍼러 에너지',amount:20},
  {code:'EASTERN_ARMS_WEAPON_BLUEPRINT',name:'동방무기상 무기설계도',amount:1},
  {code:'MASTER_STAR',name:'마스터의 별',amount:15000000},
]);
const codes=GIFTS.map(x=>x.code),reason='사용자 지시: 진짜디임 엠퍼러 에너지 20개·동방무기 설계도 1개·마스터의 별 1500만 개 지급';
const q=async(client,sql,args=[])=>(await client.query(sql,args)).rows;
const balances=r=>({quantity:String(r?.quantity??0),unseenQuantity:String(r?.unseen_quantity??0)});
export async function inspectDiimCraftMaterials(client){
  const users=await q(client,"SELECT id,nickname,status FROM users WHERE REPLACE(TRIM(nickname),' ','')=$1 OR id=$2 ORDER BY id",[TARGET.nickname,TARGET.id]);
  const items=await q(client,'SELECT code,name,is_active FROM inventory_items WHERE code=ANY($1::text[]) ORDER BY code',[codes]);
  const inventory=await q(client,'SELECT item_code,quantity,unseen_quantity FROM cnine_user_inventory WHERE user_id=$1 AND item_code=ANY($2::text[]) ORDER BY item_code',[TARGET.id,codes]);
  const [saved]=await q(client,'SELECT value FROM app_meta WHERE key=$1',[OPERATION_KEY]);
  const logs=await q(client,'SELECT id,user_id,item_code,change_amount,balance_after,reference_type FROM inventory_logs WHERE reference_id=$1 ORDER BY item_code',[OPERATION_KEY]);
  return {users,items,inventory,logs,receipt:saved?JSON.parse(saved.value):null};
}
export async function verifyDiimCraftMaterials(client,receipt){
  assert.equal(receipt.operationKey,OPERATION_KEY);assert.equal(receipt.status,'COMPLETED');assert.deepEqual(receipt.user,TARGET);assert.equal(receipt.allocations.length,3);
  const snapshot=await inspectDiimCraftMaterials(client);assert.equal(snapshot.logs.length,3);
  for(const gift of GIFTS){
    const allocation=receipt.allocations.find(x=>x.code===gift.code),log=snapshot.logs.find(x=>x.item_code===gift.code);assert.ok(allocation&&log);
    assert.equal(allocation.amount,gift.amount);assert.equal(allocation.name,gift.name);
    for(const key of ['quantity','unseenQuantity'])assert.equal(BigInt(allocation.after[key])-BigInt(allocation.before[key]),BigInt(gift.amount));
    assert.equal(Number(log.user_id),TARGET.id);assert.equal(Number(log.change_amount),gift.amount);assert.equal(String(log.id),allocation.logId);assert.equal(String(log.balance_after),allocation.after.quantity);assert.equal(log.reference_type,'SYSTEM_GRANT');
  }
  const [audit]=await q(client,'SELECT action_type,target_id,after_data FROM admin_logs WHERE id=$1',[receipt.auditId]);
  assert.equal(audit?.action_type,'OPS_CRAFT_MATERIALS_GRANT');assert.equal(audit.target_id,OPERATION_KEY);assert.deepEqual(JSON.parse(audit.after_data).allocations,receipt.allocations);
  return {verified:true,grantLogs:3,inventory:snapshot.inventory,verifiedAt:new Date().toISOString()};
}
// Caller acquires the existing live USER_LOCK for account 4773. Not a runtime seed.
export async function grantDiimCraftMaterials(client,{dryRun=false}={}){
  await client.query('BEGIN');
  try{
    await client.query("SET LOCAL lock_timeout='3s'");await client.query("SET LOCAL statement_timeout='15s'");
    const users=await q(client,"SELECT id,nickname,status FROM users WHERE REPLACE(TRIM(nickname),' ','')=$1 ORDER BY id FOR UPDATE",[TARGET.nickname]);
    assert.equal(users.length,1,'Exactly one matching account required');assert.equal(Number(users[0].id),TARGET.id);assert.equal(users[0].nickname,TARGET.nickname);assert.equal(users[0].status,'ACTIVE');
    const [saved]=await q(client,'SELECT value FROM app_meta WHERE key=$1',[OPERATION_KEY]);
    if(saved){const receipt=JSON.parse(saved.value),verification=await verifyDiimCraftMaterials(client,receipt);await client.query('ROLLBACK');return {replayed:true,receipt,verification};}
    const [owner]=await q(client,"SELECT id FROM users WHERE role='OWNER' AND status='ACTIVE' ORDER BY id LIMIT 1");assert.ok(owner);
    const items=await q(client,'SELECT code,name,is_active FROM inventory_items WHERE code=ANY($1::text[]) ORDER BY code FOR SHARE',[codes]);assert.equal(items.length,3);
    for(const gift of GIFTS){const item=items.find(x=>x.code===gift.code);assert.equal(item?.name,gift.name);assert.equal(Number(item?.is_active),1);}
    assert.equal((await q(client,'SELECT id FROM inventory_logs WHERE reference_id=$1',[OPERATION_KEY])).length,0,'Grant logs without receipt');
    const [walletBefore]=await q(client,'SELECT coin,card_shards,magic_crystals FROM users WHERE id=$1',[TARGET.id]);
    const allocations=[],now=new Date().toISOString();
    for(const gift of GIFTS){
      const [owned]=await q(client,'SELECT quantity,unseen_quantity FROM cnine_user_inventory WHERE user_id=$1 AND item_code=$2 FOR UPDATE',[TARGET.id,gift.code]),before=balances(owned);
      for(const value of Object.values(before))assert.ok(BigInt(value)>=0n&&BigInt(value)<=BigInt(Number.MAX_SAFE_INTEGER)-BigInt(gift.amount));
      const changed=await q(client,`INSERT INTO cnine_user_inventory(user_id,item_code,quantity,unseen_quantity,created_at,updated_at)
        VALUES($1,$2,$3,$3,$4,$4) ON CONFLICT(user_id,item_code) DO UPDATE SET quantity=cnine_user_inventory.quantity+excluded.quantity,
        unseen_quantity=cnine_user_inventory.unseen_quantity+excluded.unseen_quantity,updated_at=excluded.updated_at RETURNING quantity,unseen_quantity`,[TARGET.id,gift.code,gift.amount,now]);
      assert.equal(changed.length,1);const after=balances(changed[0]);for(const key of Object.keys(before))assert.equal(BigInt(after[key]),BigInt(before[key])+BigInt(gift.amount));
      const logs=await q(client,`INSERT INTO inventory_logs(user_id,item_code,change_amount,balance_after,reason,reference_type,reference_id,admin_id,created_at)
        VALUES($1,$2,$3,$4,$5,'SYSTEM_GRANT',$6,$7,$8) RETURNING id`,[TARGET.id,gift.code,gift.amount,after.quantity,reason,OPERATION_KEY,owner.id,now]);assert.equal(logs.length,1);
      allocations.push({...gift,before,after,logId:String(logs[0].id)});
    }
    assert.deepEqual((await q(client,'SELECT coin,card_shards,magic_crystals FROM users WHERE id=$1',[TARGET.id]))[0],walletBefore);
    const receipt={status:'COMPLETED',operationKey:OPERATION_KEY,user:TARGET,allocations,completedAt:now};
    const audits=await q(client,`INSERT INTO admin_logs(admin_id,action_type,target_type,target_id,before_data,after_data,created_at)
      VALUES($1,'OPS_CRAFT_MATERIALS_GRANT','USER_INVENTORY',$2,$3,$4,$5) RETURNING id`,[owner.id,OPERATION_KEY,JSON.stringify(allocations.map(x=>({code:x.code,...x.before}))),JSON.stringify({...receipt,reason}),now]);assert.equal(audits.length,1);receipt.auditId=String(audits[0].id);
    assert.equal((await q(client,'INSERT INTO app_meta(key,value,updated_at) VALUES($1,$2,$3) RETURNING key',[OPERATION_KEY,JSON.stringify(receipt),now])).length,1);
    const verification=await verifyDiimCraftMaterials(client,receipt);await client.query(dryRun?'ROLLBACK':'COMMIT');return {dryRun,replayed:false,receipt,verification};
  }catch(error){await client.query('ROLLBACK').catch(()=>{});throw error;}
}
