import assert from 'node:assert/strict';
import {LAND_STREAMERS,landAccess} from '../../functions/_soopket_land.js';

export const OPERATION_KEY='ops:chocho-soopketland-removal:20261003:v1';
export const TARGET=Object.freeze({id:5399,nickname:'초초'});
const REGISTRATION_KEY='ops:chocho-streamer-registration:20261003:v1';
const userSql='SELECT id,nickname,status,role,banned_until,coin,card_shards,magic_crystals FROM users WHERE id=$1';
const rosterSql='SELECT * FROM soopketland_accounts ORDER BY user_id,slot';
const belongs=row=>Number(row.user_id)===TARGET.id||row.slot===TARGET.nickname;
const adapter=q=>({prepare(sql){return {bind(...args){return {async first(){let n=0;return (await q(sql.replace(/\?/g,()=>'$'+(++n)),args))[0]||null;}};}};}});
async function preservedState(q){
 return {
  user:(await q(userSql,[TARGET.id]))[0],
  inventory:await q('SELECT * FROM cnine_user_inventory WHERE user_id=$1 ORDER BY item_code',[TARGET.id]),
  gift:await q('SELECT * FROM new_user_gift_receipts_v1 WHERE user_id=$1',[TARGET.id]),
  history:await q('SELECT (SELECT COUNT(*) FROM soopketland_ticket_lots WHERE user_id=$1) AS lots,(SELECT COUNT(*) FROM soopketland_rolls WHERE user_id=$1) AS rolls,(SELECT COUNT(*) FROM soopketland_coupons WHERE issuer_id=$1) AS coupons',[TARGET.id]),
  registration:await q('SELECT key,value FROM app_meta WHERE key=$1',[REGISTRATION_KEY])
 };
}
export async function verifyChochoLandRemoval(q){
 const [saved]=await q('SELECT value FROM app_meta WHERE key=$1',[OPERATION_KEY]);assert.ok(saved,'Removal receipt missing');
 const receipt=JSON.parse(saved.value);
 for(const [key,value] of Object.entries({status:'COMPLETED',operationKey:OPERATION_KEY,userId:TARGET.id,nickname:TARGET.nickname,registered:false,removed:1}))assert.equal(receipt[key],value,'Invalid removal receipt');
 assert.equal((await q('SELECT * FROM soopketland_accounts WHERE user_id=$1 OR slot=$2',[TARGET.id,TARGET.nickname])).length,0,'Target still registered');
 const [user]=await q(userSql,[TARGET.id]);assert.equal(user?.nickname,TARGET.nickname);assert.equal(user.status,'ACTIVE');assert.equal(user.role,'USER');
 const access=await landAccess(adapter(q),user);assert.deepEqual(access,{allowed:false,isOwner:false});
 const [audit]=await q('SELECT action_type,target_id,after_data FROM admin_logs WHERE id=$1',[receipt.auditId]);
 assert.equal(audit?.action_type,'OPS_SOOPKETLAND_STREAMER_REMOVE');assert.equal(audit.target_id,String(TARGET.id));assert.equal(JSON.parse(audit.after_data).operationKey,OPERATION_KEY);
 assert.ok(!LAND_STREAMERS.includes(TARGET.nickname),'Default binding would recreate removed slot');
 return {...receipt,access};
}

// Explicit one-time maintenance only; never imported by game routes or deployment.
export async function removeChochoFromSoopketland(client,{commit=false}={}){
 const q=async(sql,args=[])=>(await client.query(sql,args)).rows;
 await client.query('BEGIN');
 try{
  await q("SET LOCAL lock_timeout='3s'");await q("SET LOCAL statement_timeout='15s'");
  const [db]=await q("SELECT current_database() AS name,pg_is_in_recovery() AS replica,to_char(CURRENT_TIMESTAMP AT TIME ZONE 'Asia/Seoul','YYYY-MM-DD') AS kst");
  assert.equal(db.name,'cnine');assert.equal(db.replica,false);assert.equal(db.kst,'2026-10-03','One-time operation date expired');
  await q('SELECT pg_advisory_xact_lock(hashtextextended($1,0))',[OPERATION_KEY]);
  // Same user-row lock as ticket grants/spins, then stabilize the small roster.
  const [user]=await q(userSql+' FOR UPDATE',[TARGET.id]);
  assert.equal(user?.nickname,TARGET.nickname);assert.equal(user.status,'ACTIVE');assert.equal(user.role,'USER');
  assert.equal((await q('SELECT id FROM users WHERE nickname=$1',[TARGET.nickname])).length,1,'Ambiguous nickname');
  await q('LOCK TABLE soopketland_accounts IN SHARE ROW EXCLUSIVE MODE');
  if((await q('SELECT value FROM app_meta WHERE key=$1',[OPERATION_KEY])).length){
   const receipt=await verifyChochoLandRemoval(q);await client.query('ROLLBACK');return {...receipt,replayed:true,committed:false};
  }
  assert.ok(!LAND_STREAMERS.includes(TARGET.nickname),'Default binding would recreate removed slot');
  assert.equal((await q("SELECT oid FROM pg_constraint WHERE contype='f' AND confrelid='soopketland_accounts'::regclass")).length,0,'Roster deletion could cascade');
  const accounts=await q(rosterSql),target=accounts.filter(belongs);assert.equal(target.length,1,'Exactly one binding required');
  assert.equal(target[0].slot,TARGET.nickname);assert.equal(Number(target[0].user_id),TARGET.id);
  const before=await preservedState(q);
  const [owner]=await q("SELECT id FROM users WHERE id=1 AND role='OWNER' AND status='ACTIVE'");assert.ok(owner,'Audit operator missing');
  const deleted=await q('DELETE FROM soopketland_accounts WHERE user_id=$1 AND slot=$2 RETURNING *',[TARGET.id,TARGET.nickname]);
  assert.deepEqual(deleted,target,'Unexpected deleted binding');
  const accountsAfter=await q(rosterSql);assert.deepEqual(accountsAfter,accounts.filter(row=>!belongs(row)),'Other registrations changed');
  assert.deepEqual(await preservedState(q),before,'Unrequested account or history change');
  const receipt={status:'COMPLETED',operationKey:OPERATION_KEY,userId:TARGET.id,nickname:TARGET.nickname,registered:false,removed:1,removedBinding:target[0],accountsBefore:accounts.length,accountsAfter:accountsAfter.length,otherStreamersPreserved:true,accountAndInventoryPreserved:true,historyPreserved:true,completedAt:new Date().toISOString()};
  const [audit]=await q("INSERT INTO admin_logs(admin_id,action_type,target_type,target_id,before_data,after_data) VALUES($1,'OPS_SOOPKETLAND_STREAMER_REMOVE','USER',$2,$3,$4) RETURNING id",[owner.id,String(TARGET.id),JSON.stringify({operationKey:OPERATION_KEY,binding:target[0]}),JSON.stringify({...receipt,reason:'사용자 지시: 초초 숲켓랜드 명단에서 삭제해라'})]);
  assert.ok(audit,'Audit missing');receipt.auditId=String(audit.id);
  await q('INSERT INTO app_meta(key,value,updated_at) VALUES($1,$2,$3)',[OPERATION_KEY,JSON.stringify(receipt),receipt.completedAt]);
  const verified=await verifyChochoLandRemoval(q);assert.equal(verified.auditId,receipt.auditId);
  await client.query(commit?'COMMIT':'ROLLBACK');return {...verified,committed:commit,replayed:false};
 }catch(error){await client.query('ROLLBACK').catch(()=>{});throw error;}
}
