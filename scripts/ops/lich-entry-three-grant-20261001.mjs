import assert from 'node:assert/strict';

export const OPERATION_KEY='ops:lich-entry-three:20261001:v1';
export const ITEM_CODE='LICH_KING_ENTRY_TICKET',ITEM_NAME='리치왕 정벌 입장권',AMOUNT=10;
export const TARGETS=Object.freeze([{id:88,nickname:'0수표'},{id:1195,nickname:'씨나인택갓'},{id:1768,nickname:'핫시'}]);
const reason='사용자 지시: 0수표, 핫시, 씨나인택갓 리치왕 공대 입장권 10개씩 지급';
const q=async(client,sql,args=[])=>(await client.query(sql,args)).rows;
const balance=row=>({quantity:String(row?.quantity??0),unseenQuantity:String(row?.unseen_quantity??0)});

export async function inspectLichEntryGrant(client){
 const users=await q(client,'SELECT id,nickname,status FROM users WHERE id=ANY($1::bigint[]) OR nickname=ANY($2::text[]) ORDER BY id',[TARGETS.map(x=>x.id),['0수표','핫시','핫시:D','씨나인택갓','hhhhhaa']]);
 const items=await q(client,'SELECT code,name,is_active FROM inventory_items WHERE code=$1',[ITEM_CODE]);
 const inventory=await q(client,'SELECT user_id,quantity,unseen_quantity FROM cnine_user_inventory WHERE user_id=ANY($1::bigint[]) AND item_code=$2 ORDER BY user_id',[TARGETS.map(x=>x.id),ITEM_CODE]);
 const saved=await q(client,'SELECT value FROM app_meta WHERE key=$1',[OPERATION_KEY]);
 const logs=await q(client,'SELECT id,user_id,item_code,change_amount,balance_after,reference_type,reference_id FROM inventory_logs WHERE user_id=ANY($1::bigint[]) AND item_code=$2 AND reference_id=$3 ORDER BY user_id',[TARGETS.map(x=>x.id),ITEM_CODE,OPERATION_KEY]);
 return {checkedAt:new Date().toISOString(),users,items,inventory,receipt:saved.length?JSON.parse(saved[0].value):null,logs};
}

export async function verifyLichEntryGrant(client,receipt){
 assert.equal(receipt.operationKey,OPERATION_KEY);assert.equal(receipt.status,'COMPLETED');assert.equal(receipt.itemCode,ITEM_CODE);assert.equal(receipt.amountEach,AMOUNT);assert.equal(receipt.allocations.length,TARGETS.length);
 const logs=await q(client,'SELECT id,user_id,item_code,change_amount,balance_after,reference_type FROM inventory_logs WHERE user_id=ANY($1::bigint[]) AND item_code=$2 AND reference_id=$3 ORDER BY user_id',[TARGETS.map(x=>x.id),ITEM_CODE,OPERATION_KEY]);
 assert.equal(logs.length,3);
 for(const target of TARGETS){
  const row=receipt.allocations.find(x=>x.userId===target.id),log=logs.find(x=>Number(x.user_id)===target.id);assert.ok(row&&log);assert.equal(row.nickname,target.nickname);
  for(const key of ['quantity','unseenQuantity'])assert.equal(BigInt(row.after[key])-BigInt(row.before[key]),10n);
  assert.equal(log.item_code,ITEM_CODE);assert.equal(Number(log.change_amount),10);assert.equal(log.reference_type,'SYSTEM_GRANT');assert.equal(String(log.id),row.logId);assert.equal(String(log.balance_after),row.after.quantity);
 }
 const [audit]=await q(client,'SELECT action_type,target_id,after_data FROM admin_logs WHERE id=$1',[receipt.auditId]);
 assert.equal(audit?.action_type,'OPS_LICH_ENTRY_GRANT');assert.equal(audit.target_id,OPERATION_KEY);assert.deepEqual(JSON.parse(audit.after_data).allocations,receipt.allocations);
 return {accounts:3,totalGranted:30,grantLogs:3,verifiedAt:new Date().toISOString()};
}

// Caller holds the three production USER_LOCK leases. Never imported by game routes.
export async function grantLichEntries(client,{dryRun=false}={}){
 await client.query('BEGIN');
 try{
  await client.query("SET LOCAL lock_timeout='2s'");await client.query("SET LOCAL statement_timeout='8s'");
  await client.query('SELECT pg_advisory_xact_lock(hashtextextended($1,0))',[OPERATION_KEY]);
  const users=await q(client,'SELECT id,nickname,status FROM users WHERE id=ANY($1::bigint[]) ORDER BY id FOR UPDATE',[TARGETS.map(x=>x.id)]);
  assert.equal(users.length,3);
  for(const target of TARGETS){const user=users.find(x=>Number(x.id)===target.id);assert.equal(user?.nickname,target.nickname);assert.equal(user?.status,'ACTIVE');}
  const [saved]=await q(client,'SELECT value FROM app_meta WHERE key=$1',[OPERATION_KEY]);
  if(saved){const receipt=JSON.parse(saved.value),verification=await verifyLichEntryGrant(client,receipt);await client.query('ROLLBACK');return {replayed:true,receipt,verification};}
  const [date]=await q(client,"SELECT to_char(CURRENT_TIMESTAMP AT TIME ZONE 'Asia/Seoul','YYYY-MM-DD') AS kst");assert.equal(date.kst,'2026-10-01');
  const [item]=await q(client,'SELECT code,name,is_active FROM inventory_items WHERE code=$1 FOR SHARE',[ITEM_CODE]);assert.equal(item?.name,ITEM_NAME);assert.equal(Number(item?.is_active),1);
  assert.equal((await q(client,'SELECT id FROM inventory_logs WHERE user_id=ANY($1::bigint[]) AND item_code=$2 AND reference_id=$3 LIMIT 1',[TARGETS.map(x=>x.id),ITEM_CODE,OPERATION_KEY])).length,0,'Grant logs exist without receipt');
  const [owner]=await q(client,"SELECT id FROM users WHERE UPPER(role)='OWNER' AND UPPER(status)='ACTIVE' ORDER BY id LIMIT 1");assert.ok(owner);
  const allocations=[],now=new Date().toISOString();
  for(const target of TARGETS){
   const [owned]=await q(client,'SELECT quantity,unseen_quantity FROM cnine_user_inventory WHERE user_id=$1 AND item_code=$2 FOR UPDATE',[target.id,ITEM_CODE]),before=balance(owned);
   for(const value of Object.values(before))assert.ok(BigInt(value)>=0n&&BigInt(value)<=BigInt(Number.MAX_SAFE_INTEGER)-10n,'Invalid inventory balance');
   const [changed]=await q(client,`INSERT INTO cnine_user_inventory(user_id,item_code,quantity,unseen_quantity,created_at,updated_at)
    VALUES($1,$2,$3,$3,$4,$4) ON CONFLICT(user_id,item_code) DO UPDATE SET quantity=cnine_user_inventory.quantity+excluded.quantity,
    unseen_quantity=cnine_user_inventory.unseen_quantity+excluded.unseen_quantity,updated_at=excluded.updated_at RETURNING quantity,unseen_quantity`,[target.id,ITEM_CODE,AMOUNT,now]);
   const after=balance(changed);for(const key of Object.keys(before))assert.equal(BigInt(after[key]),BigInt(before[key])+10n);
   const [log]=await q(client,`INSERT INTO inventory_logs(user_id,item_code,change_amount,balance_after,reason,reference_type,reference_id,admin_id,created_at)
    VALUES($1,$2,$3,$4,$5,'SYSTEM_GRANT',$6,$7,$8) RETURNING id`,[target.id,ITEM_CODE,AMOUNT,after.quantity,reason,OPERATION_KEY,owner.id,now]);
   allocations.push({userId:target.id,nickname:target.nickname,before,after,logId:String(log.id)});
  }
  const receipt={status:'COMPLETED',operationKey:OPERATION_KEY,itemCode:ITEM_CODE,itemName:ITEM_NAME,amountEach:AMOUNT,totalGranted:30,allocations,completedAt:now};
  const [audit]=await q(client,`INSERT INTO admin_logs(admin_id,action_type,target_type,target_id,before_data,after_data,created_at)
   VALUES($1,'OPS_LICH_ENTRY_GRANT','USER_INVENTORY',$2,$3,$4,$5) RETURNING id`,[owner.id,OPERATION_KEY,JSON.stringify(allocations.map(x=>({userId:x.userId,...x.before}))),JSON.stringify({...receipt,reason}),now]);
  receipt.auditId=String(audit.id);await q(client,'INSERT INTO app_meta(key,value,updated_at) VALUES($1,$2,$3) RETURNING key',[OPERATION_KEY,JSON.stringify(receipt),now]);
  const verification=await verifyLichEntryGrant(client,receipt);await client.query(dryRun?'ROLLBACK':'COMMIT');return {dryRun,replayed:false,receipt,verification};
 }catch(error){await client.query('ROLLBACK');throw error;}
}
