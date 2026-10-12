import test from 'node:test';
import assert from 'node:assert/strict';
import {PGlite} from '@electric-sql/pglite';
import {MAX_RANK_TICKS} from '../functions/_account_rank.js';
import {OPERATION_KEY,setPinkMarshal,verifyPinkMarshal} from '../scripts/ops/pink-marshal-20261013.mjs';

async function fixture(t){
 const db=new PGlite();t.after(()=>db.close());
 await db.exec(`CREATE TABLE users(id BIGINT PRIMARY KEY,nickname TEXT,status TEXT,role TEXT,coin BIGINT,card_shards BIGINT,magic_crystals BIGINT);
 INSERT INTO users VALUES(1,'핑크빛유두','ACTIVE','OWNER',100,200,300),(2,'다른계정','ACTIVE','USER',400,500,600);
 CREATE TABLE account_rank_progress_v1(user_id BIGINT PRIMARY KEY,total_ticks BIGINT CHECK(total_ticks>=0 AND total_ticks<=${MAX_RANK_TICKS}),updated_at TEXT);
 INSERT INTO account_rank_progress_v1 VALUES(1,83726400,'before'),(2,12345,'other');
 CREATE TABLE account_rank_receipts_v1(user_id BIGINT,source TEXT,event_id TEXT,ticks BIGINT CHECK(ticks>0),token TEXT UNIQUE,PRIMARY KEY(user_id,source,event_id));
 INSERT INTO account_rank_receipts_v1 VALUES(1,'HUNT','old-hunt',4800,'old-token');
 CREATE TABLE app_meta(key TEXT PRIMARY KEY,value TEXT,updated_at TEXT);
 CREATE TABLE admin_logs(id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,admin_id BIGINT,action_type TEXT,target_type TEXT,target_id TEXT,before_data TEXT,after_data TEXT);`);
 const client={query(sql,args=[]){
  if(sql.startsWith('SELECT current_database()'))return Promise.resolve({rows:[{db:'cnine',recovery:false,at:new Date('2026-10-12T21:12:00Z')}]});
  return db.query(sql,args);
 }};
 const snapshot=async()=>{
  const value={};for(const table of ['users','account_rank_progress_v1','account_rank_receipts_v1','app_meta','admin_logs'])value[table]=(await db.query(`SELECT * FROM ${table} ORDER BY 1`)).rows;
  return value;
 };
 return {db,client,snapshot};
}

test('target alone reaches Marshal; dry-run rolls back and completed retry never overwrites later changes',async t=>{
 const f=await fixture(t),before=await f.snapshot();
 const dry=await setPinkMarshal(f.client);assert.equal(dry.committed,false);assert.deepEqual(await f.snapshot(),before);
 const done=await setPinkMarshal(f.client,{commit:true});assert.equal(done.after.rank.code,'MARSHAL');assert.equal(done.after.rank.level,250);
 assert.equal(done.deltaTicks,MAX_RANK_TICKS-83726400);
 const after=await f.snapshot();assert.deepEqual(after.users,before.users);assert.deepEqual(after.account_rank_progress_v1[1],before.account_rank_progress_v1[1]);
 assert.ok(after.account_rank_receipts_v1.some(r=>r.token==='old-token'));assert.equal(after.account_rank_receipts_v1.length,2);
 assert.equal(after.admin_logs.length,1);assert.equal(after.app_meta.length,1);
 assert.equal((await verifyPinkMarshal(f.client)).status,'VERIFIED');
 assert.equal((await setPinkMarshal(f.client,{commit:true})).replayed,true);assert.deepEqual(await f.snapshot(),after);
 await f.db.query('UPDATE account_rank_progress_v1 SET total_ticks=100 WHERE user_id=1');
 assert.equal((await setPinkMarshal(f.client,{commit:true})).replayed,true);
 assert.equal(Number((await f.db.query('SELECT total_ticks FROM account_rank_progress_v1 WHERE user_id=1')).rows[0].total_ticks),100);
});

test('audit or receipt failure rolls back experience, ledger, and all operation writes',async t=>{
 const f=await fixture(t),before=await f.snapshot();
 for(const table of ['admin_logs','app_meta']){
  await f.db.exec(`ALTER TABLE ${table} ADD CONSTRAINT qa_reject CHECK(false)`);
  await assert.rejects(()=>setPinkMarshal(f.client,{commit:true}),/qa_reject/);
  assert.deepEqual(await f.snapshot(),before);
  await f.db.exec(`ALTER TABLE ${table} DROP CONSTRAINT qa_reject`);
 }
});

test('wrong identity, inactive/non-owner account, missing progress, and preexisting ledger block writes; maxed account is a no-op',async t=>{
 const f=await fixture(t);
 for(const change of ["UPDATE users SET id=3 WHERE id=1","UPDATE users SET status='BANNED' WHERE id=1","UPDATE users SET role='ADMIN' WHERE id=1",'DELETE FROM account_rank_progress_v1 WHERE user_id=1']){
  const before=await f.snapshot();
  await f.db.exec(change);
  const changed=await f.snapshot();await assert.rejects(()=>setPinkMarshal(f.client,{commit:true}));assert.deepEqual(await f.snapshot(),changed);
  await f.db.exec('DELETE FROM users; DELETE FROM account_rank_progress_v1');
  for(const u of before.users)await f.db.query('INSERT INTO users VALUES($1,$2,$3,$4,$5,$6,$7)',Object.values(u));
  for(const p of before.account_rank_progress_v1)await f.db.query('INSERT INTO account_rank_progress_v1 VALUES($1,$2,$3)',Object.values(p));
 }
 await f.db.query("INSERT INTO account_rank_receipts_v1 VALUES(1,'OPS_RANK_SET',$1,100,'partial-token')",[OPERATION_KEY]);
 const partial=await f.snapshot();await assert.rejects(()=>setPinkMarshal(f.client,{commit:true}),/without operation receipt/);assert.deepEqual(await f.snapshot(),partial);
 await f.db.query("DELETE FROM account_rank_receipts_v1 WHERE token='partial-token'");
 await f.db.query('UPDATE account_rank_progress_v1 SET total_ticks=$1 WHERE user_id=1',[MAX_RANK_TICKS]);
 const maxed=await f.snapshot();assert.equal((await setPinkMarshal(f.client,{commit:true})).status,'ALREADY_MARSHAL');assert.deepEqual(await f.snapshot(),maxed);
});
