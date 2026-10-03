import assert from 'node:assert/strict';
export const OPERATION_KEY='ops:chocho-streamer-registration:20261003:v1';
export const TARGET=Object.freeze({id:5399,nickname:'초초'});
export async function registerChochoStreamer(client,{commit=false}={}){
 const q=async(sql,args=[])=>(await client.query(sql,args)).rows;
 await client.query('BEGIN');
 try{
  await client.query("SET LOCAL lock_timeout='3s'");
  await client.query("SET LOCAL statement_timeout='10s'");
  await q('SELECT pg_advisory_xact_lock(hashtextextended($1,0))',[OPERATION_KEY]);
  const [user]=await q('SELECT id,nickname,status,role,created_at FROM users WHERE id=$1 FOR UPDATE',[TARGET.id]);
  assert.equal(user?.nickname,TARGET.nickname);assert.equal(user.status,'ACTIVE');
  assert.equal((await q('SELECT id FROM users WHERE nickname=$1',[TARGET.nickname])).length,1);
  const [prior]=await q('SELECT value FROM app_meta WHERE key=$1',[OPERATION_KEY]);
  if(prior){const receipt=JSON.parse(prior.value);assert.equal(receipt.userId,TARGET.id);assert.equal(receipt.status,'COMPLETED');await client.query('ROLLBACK');return {...receipt,replayed:true};}
  const accounts=await q('SELECT * FROM soopketland_accounts ORDER BY user_id');
  assert.equal(accounts.some(a=>a.slot===TARGET.nickname||Number(a.user_id)===TARGET.id),false,'Target already registered');
  const gift=await q('SELECT * FROM new_user_gift_receipts_v1 WHERE user_id=$1',[TARGET.id]);
  const inventory=await q('SELECT * FROM cnine_user_inventory WHERE user_id=$1 ORDER BY item_code',[TARGET.id]);
  const [owner]=await q("SELECT id FROM users WHERE id=1 AND role='OWNER' AND status='ACTIVE'");assert.ok(owner);
  const [added]=await q('INSERT INTO soopketland_accounts(slot,user_id,bound_at) VALUES($1,$2,$3) RETURNING *',[TARGET.nickname,TARGET.id,new Date().toISOString()]);
  assert.equal(Number(added.user_id),TARGET.id);
  assert.deepEqual((await q('SELECT * FROM soopketland_accounts ORDER BY user_id')).filter(a=>Number(a.user_id)!==TARGET.id),accounts,'Other streamer registrations changed');
  assert.deepEqual(await q('SELECT * FROM new_user_gift_receipts_v1 WHERE user_id=$1',[TARGET.id]),gift,'Gift receipt changed');
  assert.deepEqual(await q('SELECT * FROM cnine_user_inventory WHERE user_id=$1 ORDER BY item_code',[TARGET.id]),inventory,'Inventory changed');
  const result={operationKey:OPERATION_KEY,status:'COMPLETED',userId:TARGET.id,nickname:TARGET.nickname,registered:true,registeredAt:added.bound_at,existingGiftStatus:gift[0]?.status||null,existingGiftQuantity:Number(inventory.find(i=>i.item_code==='NEW_USER_GIFT_BOX')?.quantity||0),giftPreserved:true,otherStreamersPreserved:true,completedAt:new Date().toISOString()};
  const [audit]=await q("INSERT INTO admin_logs(admin_id,action_type,target_type,target_id,before_data,after_data) VALUES($1,'OPS_SOOPKETLAND_STREAMER_REGISTER','USER',$2,$3,$4) RETURNING id",[owner.id,String(TARGET.id),JSON.stringify({registered:false}),JSON.stringify({...result,reason:'사용자 지시: 초초를 숲켓랜드 스트리머로 등록'})]);
  result.auditId=String(audit.id);
  await q('INSERT INTO app_meta(key,value,updated_at) VALUES($1,$2,$3)',[OPERATION_KEY,JSON.stringify(result),result.completedAt]);
  await client.query(commit?'COMMIT':'ROLLBACK');return {...result,committed:commit,replayed:false};
 }catch(e){await client.query('ROLLBACK').catch(()=>{});throw e;}
}
