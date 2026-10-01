import assert from 'node:assert/strict';
export const KEY='ops:hakbeol-hatsi-blackcastle-extra-gift:20261002:v1',ITEM='RECRUITMENT_GIFT_BOX';
export const TARGETS=[{userId:1768,nickname:'핫시',amount:1},{userId:2420,nickname:'블랙캐슬',amount:2},{userId:4627,nickname:'학벌',amount:1}];
const q=async(client,sql,args=[])=>(await client.query(sql,args)).rows;
// Explicit additional grant: past gifts and campaign exclusion markers do not
// affect eligibility. The caller holds USER_LOCK for these three accounts.
export async function apply(client,{dryRun=false}={}){
 await client.query('BEGIN');
 try{
  await client.query("SET LOCAL lock_timeout='3s'");await client.query("SET LOCAL statement_timeout='10s'");
  await q(client,'SELECT pg_advisory_xact_lock(hashtextextended($1,0))',[KEY]);
  const [saved]=await q(client,'SELECT value FROM app_meta WHERE key=$1',[KEY]);
  if(saved){const receipt=JSON.parse(saved.value);assert.equal(receipt.operationKey,KEY);assert.equal(receipt.status,'COMPLETED');await client.query('ROLLBACK');return {receipt,replayed:true,dryRun};}
  const users=await q(client,'SELECT id,nickname,status FROM users WHERE id=ANY($1::bigint[]) ORDER BY id FOR UPDATE',[TARGETS.map(row=>row.userId)]);
  assert.equal(users.length,3);for(const target of TARGETS){const user=users.find(row=>Number(row.id)===target.userId);assert.equal(user.nickname,target.nickname);assert.equal(user.status,'ACTIVE');}
  const [item]=await q(client,'SELECT name,is_active FROM inventory_items WHERE code=$1 FOR SHARE',[ITEM]);assert.equal(item?.name,'영입전 사은품');assert.equal(Number(item.is_active),1);
  const [owner]=await q(client,"SELECT id FROM users WHERE id=1 AND role='OWNER' AND status='ACTIVE'");assert.ok(owner);
  const before=await q(client,'SELECT user_id,quantity,unseen_quantity FROM cnine_user_inventory WHERE user_id=ANY($1::bigint[]) AND item_code=$2 ORDER BY user_id FOR UPDATE',[TARGETS.map(row=>row.userId),ITEM]);
  const now=new Date().toISOString(),allocations=[];
  for(const target of TARGETS){
   const previous=before.find(row=>Number(row.user_id)===target.userId)||{quantity:'0',unseen_quantity:'0'};
   const [after]=await q(client,`INSERT INTO cnine_user_inventory(user_id,item_code,quantity,unseen_quantity,created_at,updated_at) VALUES($1,$2,$3,$3,$4,$4)
    ON CONFLICT(user_id,item_code) DO UPDATE SET quantity=cnine_user_inventory.quantity+excluded.quantity,unseen_quantity=cnine_user_inventory.unseen_quantity+excluded.unseen_quantity,updated_at=excluded.updated_at RETURNING quantity,unseen_quantity`,[target.userId,ITEM,target.amount,now]);
   assert.equal(BigInt(after.quantity)-BigInt(previous.quantity),BigInt(target.amount));assert.equal(BigInt(after.unseen_quantity)-BigInt(previous.unseen_quantity),BigInt(target.amount));
   const [log]=await q(client,`INSERT INTO inventory_logs(user_id,item_code,change_amount,balance_after,reason,reference_type,reference_id,admin_id,created_at)
    VALUES($1,$2,$3,$4,$5,'SYSTEM_GRANT',$6,$7,$8) RETURNING id`,[target.userId,ITEM,target.amount,after.quantity,'사용자 명시 지시: 영입전 사은품 '+target.amount+'개 추가 지급',KEY,owner.id,now]);assert.ok(log);
   allocations.push({...target,before:{quantity:String(previous.quantity),unseenQuantity:String(previous.unseen_quantity)},after:{quantity:String(after.quantity),unseenQuantity:String(after.unseen_quantity)},logId:String(log.id)});
  }
  const receipt={status:'COMPLETED',operationKey:KEY,itemCode:ITEM,totalBoxes:4,allocations,completedAt:now,authorization:['학벌 2개중에 1개 받았대 1개 추가지급해','핫시도 1개 추가 지급해 대조하지말고','블랙캐슬 2개 지급해'],supersedesExclusionForCampaigns:{1768:['bongsoon-recruitment-20261002'],2420:['diim-recruitment-20261001','bongsoon-recruitment-20261002'],4627:['bongsoon-recruitment-20261002']}};
  const [audit]=await q(client,`INSERT INTO admin_logs(admin_id,action_type,target_type,target_id,before_data,after_data,created_at)
   VALUES($1,'OPS_EXPLICIT_RECRUITMENT_GIFT_EXTRA','USER_INVENTORY',$2,$3,$4,$5) RETURNING id`,[owner.id,KEY,JSON.stringify({userIds:TARGETS.map(row=>row.userId),before}),JSON.stringify(receipt),now]);assert.ok(audit);receipt.auditId=String(audit.id);
  assert.equal((await q(client,'INSERT INTO app_meta(key,value,updated_at) VALUES($1,$2,$3) RETURNING key',[KEY,JSON.stringify(receipt),now])).length,1);
  await client.query(dryRun?'ROLLBACK':'COMMIT');return {receipt,replayed:false,dryRun};
 }catch(error){await client.query('ROLLBACK').catch(()=>{});throw error;}
}
export async function verify(client){
 const [saved]=await q(client,'SELECT value FROM app_meta WHERE key=$1',[KEY]);assert.ok(saved);const receipt=JSON.parse(saved.value);assert.equal(receipt.status,'COMPLETED');assert.equal(receipt.operationKey,KEY);
 const logs=await q(client,'SELECT id,user_id,change_amount,balance_after FROM inventory_logs WHERE user_id=ANY($1::bigint[]) AND item_code=$2 AND reference_id=$3',[TARGETS.map(row=>row.userId),ITEM,KEY]);assert.equal(logs.length,3);
 for(const allocation of receipt.allocations){const log=logs.find(row=>String(row.id)===allocation.logId);assert.ok(log);assert.equal(Number(log.user_id),allocation.userId);assert.equal(Number(log.change_amount),allocation.amount);assert.equal(String(log.balance_after),allocation.after.quantity);}
 const [audit]=await q(client,'SELECT after_data FROM admin_logs WHERE id=$1',[receipt.auditId]);const {auditId,...audited}=receipt;assert.deepEqual(JSON.parse(audit.after_data),audited);
 const inventory=await q(client,'SELECT user_id,quantity,unseen_quantity FROM cnine_user_inventory WHERE user_id=ANY($1::bigint[]) AND item_code=$2 ORDER BY user_id',[TARGETS.map(row=>row.userId),ITEM]);
 return {verified:true,receipt,inventory,checkedAt:new Date().toISOString()};
}
