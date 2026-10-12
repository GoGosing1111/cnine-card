import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {MAX_RANK_TICKS,publicAccountRank} from '../../functions/_account_rank.js';

export const OPERATION_KEY='ops:pink-marshal:20261013:v1';
export const TARGET=Object.freeze({id:1,nickname:'핑크빛유두'});
const SOURCE='OPS_RANK_SET';
const ACTION='OPS_ACCOUNT_RANK_SET';
const userSql='SELECT id,nickname,status,role,coin,card_shards,magic_crystals FROM users WHERE nickname=$1 ORDER BY id LIMIT 2';
const rankShape=row=>({ticks:Number(row.total_ticks),rank:publicAccountRank(row.total_ticks)});

function checkUser(rows){
 assert.equal(rows.length,1,'Expected exactly one target account');
 const user=rows[0];
 assert.equal(Number(user.id),TARGET.id);assert.equal(user.nickname,TARGET.nickname);
 assert.equal(user.status,'ACTIVE');assert.equal(user.role,'OWNER');
 return user;
}

export async function setPinkMarshal(client,{commit=false}={}){
 const q=async(sql,args=[])=>(await client.query(sql,args)).rows;
 await client.query('BEGIN');
 try{
  await client.query("SET LOCAL lock_timeout='3s'");await client.query("SET LOCAL statement_timeout='10s'");
  const [identity]=await q('SELECT current_database() db,pg_is_in_recovery() recovery,CURRENT_TIMESTAMP at');
  assert.equal(identity.db,'cnine');assert.equal(identity.recovery,false);
  await q('SELECT pg_advisory_xact_lock(hashtext($1))',[OPERATION_KEY]);
  const user=checkUser(await q(userSql+' FOR UPDATE',[TARGET.nickname]));
  const [saved]=await q('SELECT value FROM app_meta WHERE key=$1',[OPERATION_KEY]);
  if(saved){
   const receipt=JSON.parse(saved.value);
   assert.equal(receipt.status,'COMPLETED');assert.equal(receipt.operationKey,OPERATION_KEY);assert.equal(receipt.user.id,TARGET.id);
   await client.query('ROLLBACK');return {...receipt,replayed:true};
  }
  const [progress]=await q('SELECT user_id,total_ticks,updated_at FROM account_rank_progress_v1 WHERE user_id=$1 FOR UPDATE',[TARGET.id]);
  assert.ok(progress,'Expected existing account rank progress');
  const before=rankShape(progress);
  assert.ok(Number.isSafeInteger(before.ticks)&&before.ticks>=0&&before.ticks<=MAX_RANK_TICKS);
  if(before.ticks===MAX_RANK_TICKS){
   await client.query('ROLLBACK');return {status:'ALREADY_MARSHAL',user:TARGET,before,after:before,changed:false,committed:false};
  }
  const existing=await q('SELECT token FROM account_rank_receipts_v1 WHERE user_id=$1 AND source=$2 AND event_id=$3',[TARGET.id,SOURCE,OPERATION_KEY]);
  assert.equal(existing.length,0,'Rank ledger exists without operation receipt');
  const deltaTicks=MAX_RANK_TICKS-before.ticks,token=randomUUID();
  const ledger=await q('INSERT INTO account_rank_receipts_v1(user_id,source,event_id,ticks,token) VALUES($1,$2,$3,$4,$5) RETURNING token',[TARGET.id,SOURCE,OPERATION_KEY,deltaTicks,token]);
  assert.equal(ledger.length,1);
  const updated=await q("UPDATE account_rank_progress_v1 SET total_ticks=$1,updated_at=to_char(CURRENT_TIMESTAMP AT TIME ZONE 'UTC','YYYY-MM-DD HH24:MI:SS') WHERE user_id=$2 AND total_ticks=$3 RETURNING user_id,total_ticks,updated_at",[MAX_RANK_TICKS,TARGET.id,before.ticks]);
  assert.equal(updated.length,1,'Account rank changed concurrently');
  const after=rankShape(updated[0]);assert.equal(after.rank.level,250);assert.equal(after.rank.code,'MARSHAL');
  assert.deepEqual(checkUser(await q(userSql,[TARGET.nickname])),user,'Account identity or balances changed');
  const receipt={operationKey:OPERATION_KEY,status:'COMPLETED',user:TARGET,actor:'SYSTEM_OPS',before,after,deltaTicks,ledger:{source:SOURCE,eventId:OPERATION_KEY,token},balancesPreserved:true,completedAt:new Date(identity.at).toISOString()};
  const [audit]=await q('INSERT INTO admin_logs(admin_id,action_type,target_type,target_id,before_data,after_data) VALUES($1,$2,$3,$4,$5,$6) RETURNING id',[TARGET.id,ACTION,'USER',String(TARGET.id),JSON.stringify({operationKey:OPERATION_KEY,...before}),JSON.stringify({...receipt,reason:'사용자 지시: 핑크빛유두 계급 원수로 변경'})]);
  assert.ok(audit);receipt.adminLogId=String(audit.id);
  await q('INSERT INTO app_meta(key,value,updated_at) VALUES($1,$2,CURRENT_TIMESTAMP) RETURNING key',[OPERATION_KEY,JSON.stringify(receipt)]);
  await client.query(commit?'COMMIT':'ROLLBACK');
  return {...receipt,committed:commit,replayed:false};
 }catch(error){await client.query('ROLLBACK').catch(()=>{});throw error;}
}

export async function verifyPinkMarshal(client){
 const q=async(sql,args=[])=>(await client.query(sql,args)).rows;
 const [identity]=await q('SELECT current_database() db,pg_is_in_recovery() recovery,CURRENT_TIMESTAMP at');
 assert.equal(identity.db,'cnine');assert.equal(identity.recovery,false);
 checkUser(await q(userSql,[TARGET.nickname]));
 const [row]=await q('SELECT total_ticks FROM account_rank_progress_v1 WHERE user_id=$1',[TARGET.id]);
 assert.equal(Number(row?.total_ticks),MAX_RANK_TICKS);
 const [saved]=await q('SELECT value FROM app_meta WHERE key=$1',[OPERATION_KEY]);assert.ok(saved);
 const receipt=JSON.parse(saved.value);assert.equal(receipt.status,'COMPLETED');assert.equal(receipt.operationKey,OPERATION_KEY);assert.equal(receipt.user.id,TARGET.id);
 const [ledger]=await q('SELECT ticks,token FROM account_rank_receipts_v1 WHERE user_id=$1 AND source=$2 AND event_id=$3',[TARGET.id,SOURCE,OPERATION_KEY]);
 assert.equal(Number(ledger?.ticks),receipt.deltaTicks);assert.equal(ledger?.token,receipt.ledger.token);
 const [audit]=await q('SELECT action_type,target_type,target_id FROM admin_logs WHERE id=$1',[receipt.adminLogId]);
 assert.equal(audit?.action_type,ACTION);assert.equal(audit?.target_type,'USER');assert.equal(audit?.target_id,String(TARGET.id));
 return {...receipt,status:'VERIFIED',currentRank:publicAccountRank(row.total_ticks),verifiedAt:new Date(identity.at).toISOString()};
}
