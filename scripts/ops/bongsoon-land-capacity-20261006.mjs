import assert from 'node:assert/strict';

export const OPERATION_KEY='ops:bongsoon-land-capacity:5426:20261006:v1';
export const TARGET={id:5426,nickname:'나무늘봉순'};
export const COUPON_REQUESTS=Object.freeze([
 'ac8aef83-033e-446d-9f2c-b2364ac1be14',
 '3c20180f-fb15-482e-96d6-dc7800fab8f4'
]);
const ITEM='SOOPKETLAND_TICKET',CAPACITY=200;

// Explicit account maintenance, never called by a deployment or game request.
// Preserve grant plans as historical receipts. Only unspent lot capacity and
// the two explicitly identified coupons/roll display receipts are corrected.
export async function updateBongsoonLandCapacity(client,{commit=false}={}){
 const rows=async(sql,args=[])=>(await client.query(sql,args)).rows;
 await client.query('BEGIN');
 try{
  await client.query("SET LOCAL lock_timeout='3s'");
  await client.query("SET LOCAL statement_timeout='10s'");
  await client.query('SELECT pg_advisory_xact_lock(hashtextextended($1,0))',[OPERATION_KEY]);
  const [prior]=await rows('SELECT value FROM app_meta WHERE key=$1',[OPERATION_KEY]);
  if(prior){const receipt=JSON.parse(prior.value);assert.equal(receipt.status,'COMPLETED');assert.equal(receipt.userId,TARGET.id);await client.query('ROLLBACK');return {replayed:true,committed:false,receipt};}
  // Same user-first ordering as land grant/spin. Redemptions lock each coupon.
  const [user]=await rows('SELECT id,nickname,status FROM users WHERE id=$1 FOR UPDATE',[TARGET.id]);
  assert.equal(user?.nickname,TARGET.nickname);assert.equal(user.status,'ACTIVE');
  const [binding]=await rows('SELECT slot,user_id FROM soopketland_accounts WHERE user_id=$1 FOR UPDATE',[TARGET.id]);
  assert.equal(binding?.slot,TARGET.nickname);
  const [owner]=await rows("SELECT id FROM users WHERE id=1 AND role='OWNER' AND status='ACTIVE'");assert.ok(owner);
  const lots=await rows('SELECT * FROM soopketland_ticket_lots WHERE user_id=$1 ORDER BY created_at,id FOR UPDATE',[TARGET.id]);
  const [inventory]=await rows('SELECT * FROM cnine_user_inventory WHERE user_id=$1 AND item_code=$2 FOR UPDATE',[TARGET.id,ITEM]);
  const remaining=lots.reduce((n,l)=>n+Number(l.remaining),0);
  assert.ok(inventory&&remaining>0);assert.equal(Number(inventory.quantity),remaining,'Inventory and unused issued lots must agree');
  const coupons=await rows('SELECT * FROM soopketland_coupons WHERE issuer_id=$1 AND request_id=ANY($2::text[]) ORDER BY request_id FOR UPDATE',[TARGET.id,COUPON_REQUESTS]);
  assert.equal(coupons.length,2,'Both specifically requested issued coupons are required');
  const rolls=await rows('SELECT * FROM soopketland_rolls WHERE user_id=$1 AND request_id=ANY($2::text[]) ORDER BY request_id FOR UPDATE',[TARGET.id,COUPON_REQUESTS]);
  assert.equal(rolls.length,2);
  for(const coupon of coupons){
   assert.ok([1,CAPACITY].includes(Number(coupon.max_uses)),'Coupon policy changed since inspection');
   assert.ok(Number(coupon.used_count)<=CAPACITY);
   const roll=rolls.find(r=>r.request_id===coupon.request_id);assert.ok(roll);
   const response=JSON.parse(roll.response_json);assert.equal(response.code,coupon.code);assert.equal(response.couponUses,Number(coupon.max_uses));
  }
  const before={user,binding,inventory,lots,coupons,rolls},at=new Date().toISOString();
  const changedLots=await rows('UPDATE soopketland_ticket_lots SET coupon_uses=$2 WHERE user_id=$1 AND remaining>0 AND coupon_uses<>$2 RETURNING id,remaining',[TARGET.id,CAPACITY]);
  await rows('UPDATE soopketland_coupons SET max_uses=$3 WHERE issuer_id=$1 AND request_id=ANY($2::text[]) RETURNING code',[TARGET.id,COUPON_REQUESTS,CAPACITY]);
  for(const roll of rolls){const response={...JSON.parse(roll.response_json),couponUses:CAPACITY};await rows('UPDATE soopketland_rolls SET response_json=$3 WHERE user_id=$1 AND request_id=$2 RETURNING request_id',[TARGET.id,roll.request_id,JSON.stringify(response)]);}
  const afterLots=await rows('SELECT * FROM soopketland_ticket_lots WHERE user_id=$1 ORDER BY created_at,id',[TARGET.id]);
  assert.deepEqual(afterLots,lots.map(l=>Number(l.remaining)>0?{...l,coupon_uses:CAPACITY}:l));
  const [afterInventory]=await rows('SELECT * FROM cnine_user_inventory WHERE user_id=$1 AND item_code=$2',[TARGET.id,ITEM]);assert.deepEqual(afterInventory,inventory);
  const afterCoupons=await rows('SELECT * FROM soopketland_coupons WHERE issuer_id=$1 AND request_id=ANY($2::text[]) ORDER BY request_id',[TARGET.id,COUPON_REQUESTS]);
  assert.deepEqual(afterCoupons,coupons.map(c=>({...c,max_uses:CAPACITY})));
  const afterRolls=await rows('SELECT * FROM soopketland_rolls WHERE user_id=$1 AND request_id=ANY($2::text[]) ORDER BY request_id',[TARGET.id,COUPON_REQUESTS]);
  for(const roll of rolls){const after=afterRolls.find(r=>r.request_id===roll.request_id);assert.deepEqual({...after,response_json:null},{...roll,response_json:null});assert.deepEqual(JSON.parse(after.response_json),{...JSON.parse(roll.response_json),couponUses:CAPACITY});}
  const receipt={status:'COMPLETED',operationKey:OPERATION_KEY,userId:TARGET.id,nickname:TARGET.nickname,couponUses:CAPACITY,heldTickets:remaining,convertedTickets:changedLots.reduce((n,l)=>n+Number(l.remaining),0),changedLotCount:changedLots.length,
   coupons:afterCoupons.map(c=>({requestId:c.request_id,codeTail:c.code.slice(-8),reward:JSON.parse(c.reward_json),maxUses:Number(c.max_uses),usedCount:Number(c.used_count),remainingUses:CAPACITY-Number(c.used_count)})),quantityAndRedemptionsPreserved:true,archiveKey:OPERATION_KEY+':before',completedAt:at};
  await rows('INSERT INTO app_meta(key,value,updated_at) VALUES($1,$2,$3)',[receipt.archiveKey,JSON.stringify(before),at]);
  const [audit]=await rows("INSERT INTO admin_logs(admin_id,action_type,target_type,target_id,before_data,after_data) VALUES($1,'OPS_LAND_COUPON_CAPACITY','USER',$2,$3,$4) RETURNING id",[owner.id,String(TARGET.id),JSON.stringify({archiveKey:receipt.archiveKey}),JSON.stringify(receipt)]);assert.ok(audit);
  receipt.adminLogId=String(audit.id);
  await rows('INSERT INTO app_meta(key,value,updated_at) VALUES($1,$2,$3)',[OPERATION_KEY,JSON.stringify(receipt),at]);
  await client.query(commit?'COMMIT':'ROLLBACK');return {replayed:false,committed:commit,receipt};
 }catch(e){await client.query('ROLLBACK').catch(()=>{});throw e;}
}
