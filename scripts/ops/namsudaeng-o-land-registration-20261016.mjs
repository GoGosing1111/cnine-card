import assert from 'node:assert/strict';
import {landAccess} from '../../functions/_soopket_land.js';

export const OPERATION_KEY='ops:namsudaeng-o-reverse-land-registration:20261016:v1';
export const TARGET=Object.freeze({id:5950,nickname:'남수댕ㅗ'});
const userSql='SELECT id,nickname,status,role,banned_until,coin,card_shards,magic_crystals FROM users WHERE id=$1';
const rosterSql='SELECT * FROM soopketland_accounts ORDER BY user_id,slot';
const adapter=q=>({prepare(sql){return {bind(...args){return {async first(){let n=0;return (await q(sql.replace(/\?/g,()=>'$'+(++n)),args))[0]||null;}};}};}});
async function preservedState(q){
 return {
  user:(await q(userSql,[TARGET.id]))[0],
  inventory:await q('SELECT * FROM cnine_user_inventory WHERE user_id=$1 ORDER BY item_code',[TARGET.id]),
  gift:await q('SELECT * FROM new_user_gift_receipts_v1 WHERE user_id=$1',[TARGET.id]),
  history:await q('SELECT (SELECT COUNT(*) FROM soopketland_ticket_lots WHERE user_id=$1) AS lots,(SELECT COUNT(*) FROM soopketland_rolls WHERE user_id=$1) AS rolls,(SELECT COUNT(*) FROM soopketland_coupons WHERE issuer_id=$1) AS coupons',[TARGET.id])
 };
}
export async function verifyNamsudaengOLand(q){
 const [saved]=await q('SELECT value FROM app_meta WHERE key=$1',[OPERATION_KEY]);assert.ok(saved,'Registration receipt missing');
 const receipt=JSON.parse(saved.value);
 for(const [key,value]of Object.entries({operationKey:OPERATION_KEY,status:'COMPLETED',userId:TARGET.id,nickname:TARGET.nickname,registered:true}))assert.equal(receipt[key],value,'Invalid receipt '+key);
 const bindings=await q('SELECT * FROM soopketland_accounts WHERE user_id=$1 OR slot=$2',[TARGET.id,TARGET.nickname]);assert.equal(bindings.length,1);assert.equal(Number(bindings[0].user_id),TARGET.id);assert.equal(bindings[0].slot,TARGET.nickname);
 const [user]=await q(userSql,[TARGET.id]);assert.equal(user?.nickname,TARGET.nickname);assert.equal(user.status,'ACTIVE');assert.equal(user.role,'USER');
 const access=await landAccess(adapter(q),user);assert.deepEqual(access,{allowed:true,isOwner:false});
 const [audit]=await q('SELECT action_type,target_id,after_data FROM admin_logs WHERE id=$1',[receipt.auditId]);assert.equal(audit?.action_type,'OPS_SOOPKETLAND_STREAMER_REGISTER');assert.equal(audit.target_id,String(TARGET.id));assert.equal(JSON.parse(audit.after_data).operationKey,OPERATION_KEY);
 return {...receipt,access};
}

// Explicit one-time registration only. Never imported by game routes/deployment.
// Default is a transaction that verifies the registration and rolls it back.
export async function registerNamsudaengOLand(client,{commit=false}={}){
 const q=async(sql,args=[])=>(await client.query(sql,args)).rows;
 await client.query('BEGIN');
 try{
  await q("SET LOCAL lock_timeout='3s'");await q("SET LOCAL statement_timeout='15s'");
  const [identity]=await q("SELECT current_database() AS name,pg_is_in_recovery() AS replica,to_char(CURRENT_TIMESTAMP AT TIME ZONE 'Asia/Seoul','YYYY-MM-DD') AS kst");assert.equal(identity.name,'cnine');assert.equal(identity.replica,false);assert.equal(identity.kst,'2026-10-16','One-time operation date expired');
  await q('SELECT pg_advisory_xact_lock(hashtextextended($1,0))',[OPERATION_KEY]);
  const [user]=await q(userSql+' FOR UPDATE',[TARGET.id]);assert.equal(user?.nickname,TARGET.nickname);assert.equal(user.status,'ACTIVE');assert.equal(user.role,'USER');assert.equal(user.banned_until,null);
  assert.equal((await q('SELECT id FROM users WHERE nickname=$1',[TARGET.nickname])).length,1,'Ambiguous nickname');
  await q('LOCK TABLE soopketland_accounts IN SHARE ROW EXCLUSIVE MODE');
  if((await q('SELECT value FROM app_meta WHERE key=$1',[OPERATION_KEY])).length){const receipt=await verifyNamsudaengOLand(q);await client.query('ROLLBACK');return {...receipt,committed:false,replayed:true};}
  const accounts=await q(rosterSql);assert.equal(accounts.some(a=>Number(a.user_id)===TARGET.id||a.slot===TARGET.nickname),false,'Target already registered without this receipt');
  const before=await preservedState(q);
  const [owner]=await q("SELECT id FROM users WHERE id=1 AND role='OWNER' AND status='ACTIVE'");assert.ok(owner,'Audit OWNER missing');
  const [added]=await q('INSERT INTO soopketland_accounts(slot,user_id,bound_at) VALUES($1,$2,$3) RETURNING *',[TARGET.nickname,TARGET.id,new Date().toISOString()]);assert.equal(Number(added.user_id),TARGET.id);assert.equal(added.slot,TARGET.nickname);
  const accountsAfter=await q(rosterSql);assert.deepEqual(accountsAfter.filter(a=>Number(a.user_id)!==TARGET.id),accounts,'Other streamer registrations changed');
  assert.deepEqual(await preservedState(q),before,'Unrequested account, inventory or history change');
  const access=await landAccess(adapter(q),user);assert.deepEqual(access,{allowed:true,isOwner:false});
  const receipt={operationKey:OPERATION_KEY,status:'COMPLETED',userId:TARGET.id,nickname:TARGET.nickname,registered:true,registeredAt:added.bound_at,accountsBefore:accounts.length,accountsAfter:accountsAfter.length,otherStreamersPreserved:true,accountAndInventoryPreserved:true,historyPreserved:true,ticketsGranted:0,completedAt:new Date().toISOString()};
  const [audit]=await q("INSERT INTO admin_logs(admin_id,action_type,target_type,target_id,before_data,after_data) VALUES($1,'OPS_SOOPKETLAND_STREAMER_REGISTER','USER',$2,$3,$4) RETURNING id",[owner.id,String(TARGET.id),JSON.stringify({operationKey:OPERATION_KEY,registered:false}),JSON.stringify({...receipt,reason:'사용자 지시: 리버스랜드 스트리머 남수댕ㅗ 등록. 후속 확인: 남수댕ㅗ 그대로 등록'})]);assert.ok(audit,'Audit missing');receipt.auditId=String(audit.id);
  await q('INSERT INTO app_meta(key,value,updated_at) VALUES($1,$2,$3)',[OPERATION_KEY,JSON.stringify(receipt),receipt.completedAt]);
  const verified=await verifyNamsudaengOLand(q);await client.query(commit?'COMMIT':'ROLLBACK');return {...verified,committed:commit,replayed:false};
 }catch(error){await client.query('ROLLBACK').catch(()=>{});throw error;}
}
