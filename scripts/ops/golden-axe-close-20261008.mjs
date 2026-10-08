import assert from 'node:assert/strict';
export const CLOSE_KEY='ops:golden-axe-close:20261008:v1';
const AXE_KEY='pingdu_golden_axe_v1';
// Ends participation only. Existing tickets, rewards and receipts are preserved.
export async function closeGoldenAxe(client,{commit=false}={}){
 const q=async(text,values=[])=>(await client.query(text,values)).rows;
 await q('BEGIN');
 try{
  await q("SET LOCAL lock_timeout='5s'");
  await q('SELECT pg_advisory_xact_lock(hashtextextended($1,0))',[CLOSE_KEY]);
  const [prior]=await q('SELECT value FROM app_meta WHERE key=$1',[CLOSE_KEY]);
  if(prior){await q('ROLLBACK');return {...JSON.parse(prior.value),replayed:true};}
  await q('SELECT pg_advisory_xact_lock(hashtextextended($1,0))',[AXE_KEY]);
  const [row]=await q('SELECT value FROM app_meta WHERE key=$1 FOR UPDATE',[AXE_KEY]);assert.ok(row,'Axe settings missing');
  const before=JSON.parse(row.value),now=new Date().toISOString();
  const next={...before,enabled:false,visible:false,closedAt:now,revision:crypto.randomUUID()};
  const [owner]=await q("SELECT id FROM users WHERE role='OWNER' AND status='ACTIVE' ORDER BY id LIMIT 1");assert.ok(owner);
  const coupons=await q("UPDATE coupons SET is_active=0,updated_at=sqlite_now() WHERE reward_type='PINGDU_OLD_AXE' AND is_active<>0 RETURNING id");
  await q('UPDATE app_meta SET value=$2,updated_at=sqlite_now() WHERE key=$1',[AXE_KEY,JSON.stringify(next)]);
  const receipt={operation:CLOSE_KEY,closedAt:now,enabled:false,visible:false,disabledCoupons:coupons.length,inventoryPreserved:true,prizeRedemptionPreserved:true,
   authorization:'도끼이벤트 종료하고 새 이벤트 연출,랜덤보상 만들자',replacement:'철구네 치킨',newEventEnabled:false};
  const [audit]=await q("INSERT INTO admin_logs(admin_id,action_type,target_type,target_id,before_data,after_data) VALUES($1,'EVENT_CLOSE','EVENT',$2,$3,$4) RETURNING id",[owner.id,AXE_KEY,JSON.stringify(before),JSON.stringify(receipt)]);assert.ok(audit);receipt.auditId=String(audit.id);
  await q('INSERT INTO app_meta(key,value,updated_at) VALUES($1,$2,sqlite_now())',[CLOSE_KEY,JSON.stringify(receipt)]);
  const [saved]=await q('SELECT value FROM app_meta WHERE key=$1',[AXE_KEY]);assert.deepEqual(JSON.parse(saved.value),next);
  await q(commit?'COMMIT':'ROLLBACK');return {...receipt,dryRun:!commit};
 }catch(error){await q('ROLLBACK').catch(()=>{});throw error;}
}
