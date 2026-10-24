import test from 'node:test';
import assert from 'node:assert/strict';
import {PGlite} from '@electric-sql/pglite';
import {OP,PLAN,HASH,grant,state,artifacts} from '../scripts/ops/chanho-legion-recovery-20261024.mjs';
test('exact screenshot recovery rolls back failures and dry runs; replay writes nothing',async()=>{
 const db=new PGlite(),deadline=Date.now()+120000;
 try{
  await db.exec(`CREATE TABLE app_meta(key text PRIMARY KEY,value text,updated_at text);
   CREATE TABLE users(id bigint PRIMARY KEY,nickname text,status text,role text,coin bigint DEFAULT 0,card_shards bigint DEFAULT 0,magic_crystals bigint DEFAULT 0);
   CREATE TABLE user_mutation_locks_v1520(user_id bigint PRIMARY KEY,token text,lease_until_ms bigint);
   CREATE TABLE inventory_items(code text PRIMARY KEY,name text,is_active integer);
   CREATE TABLE cnine_user_inventory(user_id bigint,item_code text,quantity bigint,unseen_quantity bigint,created_at text,updated_at text,PRIMARY KEY(user_id,item_code));
   CREATE TABLE inventory_logs(id SERIAL PRIMARY KEY,user_id bigint,item_code text,change_amount bigint,balance_after bigint,reason text,reference_type text,reference_id text,admin_id bigint,created_at text);
   CREATE TABLE coin_logs(user_id bigint,change_amount bigint,reason text,created_at text);
   CREATE TABLE admin_logs(id SERIAL PRIMARY KEY,admin_id bigint,action_type text,target_type text,target_id text,before_data text,after_data text);
   INSERT INTO users VALUES(1,'OWNER','ACTIVE','OWNER',0,0,0),(4597,'찬호','ACTIVE','USER',2651362984,0,0);
   INSERT INTO app_meta VALUES('legion_hunt_owner_session_v1:4597','{"state":{"id":"later-run"},"energy":{"current":0}}','2026-10-24');`);
  await db.query('INSERT INTO user_mutation_locks_v1520 VALUES($1,$2,$3)',[PLAN.userId,'test',deadline]);
  await db.query('INSERT INTO coin_logs VALUES($1,$2,$3,$4)',[PLAN.userId,PLAN.paidCoins,'군단토벌 몬스터 처치 ['+PLAN.sessionId+':1368]','2026-10-24']);
  for(const item of PLAN.items)await db.query('INSERT INTO inventory_items VALUES($1,$1,1)',[item.code]);
  const before=await state(db),options={leaseToken:'test',lockDeadline:deadline};
  await db.exec('BEGIN');const dry=await grant(db,HASH,options);assert.equal(dry.receipt.grants.length,5);await db.exec('ROLLBACK');assert.deepEqual(await state(db),before);assert.deepEqual(await artifacts(db),[]);
  await db.exec('BEGIN');await assert.rejects(grant({query:(sql,args)=>{if(sql.startsWith('INSERT INTO inventory_logs')&&args[1]==='MASTER_STAR')throw Error('INJECTED');return db.query(sql,args);}},HASH,options),/INJECTED/);await db.exec('ROLLBACK');assert.deepEqual(await state(db),before);assert.deepEqual(await artifacts(db),[]);
  await db.exec('BEGIN');const applied=await grant(db,HASH,options);await db.exec('COMMIT');
  const replay=await grant({query:(sql,args)=>{assert(!/^\s*(INSERT|UPDATE|DELETE|WITH)\b/i.test(sql));return db.query(sql,args);}},HASH);assert.deepEqual(replay.receipt,applied.receipt);assert.equal(replay.replayed,true);
  assert.equal((await artifacts(db)).length,5);assert.equal((await db.query('SELECT COUNT(*) n FROM admin_logs WHERE target_id=$1',[OP])).rows[0].n,1);
 }finally{await db.close();}
});
