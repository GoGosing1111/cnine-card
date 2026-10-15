import test from 'node:test';
import assert from 'node:assert/strict';
import {PGlite} from '@electric-sql/pglite';
import {grant,verify,TARGETS,PLAN_HASH,OPERATION_KEY,ITEM} from '../scripts/ops/worm-named-gifts-two-20261016.mjs';

async function fixture(){
 const db=new PGlite();await db.exec(`
  CREATE TABLE users(id BIGINT PRIMARY KEY,nickname TEXT,status TEXT,role TEXT,coin BIGINT DEFAULT 999,card_shards BIGINT DEFAULT 123,magic_crystals BIGINT DEFAULT 456);
  INSERT INTO users(id,nickname,status,role) VALUES(1,'owner','ACTIVE','OWNER'),(99999,'unrelated','ACTIVE','USER');
  CREATE TABLE inventory_items(code TEXT PRIMARY KEY,name TEXT,is_active INT);
  CREATE TABLE cnine_user_inventory(user_id BIGINT,item_code TEXT,quantity BIGINT,unseen_quantity BIGINT,created_at TEXT,updated_at TEXT,PRIMARY KEY(user_id,item_code));
  CREATE TABLE inventory_logs(id BIGSERIAL PRIMARY KEY,user_id BIGINT,item_code TEXT,change_amount BIGINT,balance_after BIGINT,reason TEXT,reference_type TEXT,reference_id TEXT,admin_id BIGINT,created_at TEXT);
  CREATE TABLE admin_logs(id BIGSERIAL PRIMARY KEY,admin_id BIGINT,action_type TEXT,target_type TEXT,target_id TEXT,before_data TEXT,after_data TEXT,created_at TEXT);
  CREATE TABLE app_meta(key TEXT PRIMARY KEY,value TEXT,updated_at TEXT);
 `);
 await db.query("INSERT INTO users(id,nickname,status,role) SELECT id,nickname,'ACTIVE','USER' FROM unnest($1::bigint[],$2::text[]) t(id,nickname)",[TARGETS.map(r=>r.userId),TARGETS.map(r=>r.nickname)]);
 await db.query('INSERT INTO inventory_items VALUES($1,$2,1)',[ITEM,'지렁이대회 사은품']);
 await db.query("INSERT INTO cnine_user_inventory(user_id,item_code,quantity,unseen_quantity) SELECT id,'RECRUITMENT_GIFT_BOX',7,2 FROM users");
 await db.query('INSERT INTO cnine_user_inventory(user_id,item_code,quantity,unseen_quantity) VALUES($1,$2,3,1)',[TARGETS[0].userId,ITEM]);
 await db.query("INSERT INTO inventory_logs(user_id,item_code,change_amount,balance_after,reference_id) VALUES($1,$2,3,3,'previous-event')",[TARGETS[0].userId,ITEM]);
 return {db,apply:(options={})=>grant(db,{expectedPlanHash:PLAN_HASH,lockDeadline:Date.now()+120000,commit:true,...options})};
}
async function snapshot(db){const out={};for(const t of ['users','cnine_user_inventory','inventory_logs','admin_logs','app_meta'])out[t]=(await db.query('SELECT * FROM '+t+' ORDER BY 1,2')).rows;return out;}

test('21 exact accounts get two additional boxes each, retaining old stock, prior credits and other balances',async()=>{
 const f=await fixture();try{
  assert.equal(TARGETS.find(t=>t.inputNickname==='베배킹').userId,'289');
  assert.notEqual(TARGETS.find(t=>t.nickname==='딤럼프').userId,TARGETS.find(t=>t.nickname==='진짜디임').userId);
  const before=await snapshot(f.db),r=await f.apply(),after=await snapshot(f.db);
  assert.equal(r.committed,true);assert.equal(r.verification.totalBoxes,42);assert.equal(r.verification.recipients,21);
  assert.deepEqual(after.users,before.users);
  assert.deepEqual(after.cnine_user_inventory.filter(x=>x.item_code!==ITEM),before.cnine_user_inventory.filter(x=>x.item_code!==ITEM));
  assert.deepEqual(after.inventory_logs.filter(x=>x.reference_id==='previous-event'),before.inventory_logs);
  for(const target of TARGETS){const row=after.cnine_user_inventory.find(x=>String(x.user_id)===target.userId&&x.item_code===ITEM);const existing=target.userId===TARGETS[0].userId;assert.equal(Number(row.quantity),existing?5:2);assert.equal(Number(row.unseen_quantity),existing?3:2);}
  assert.equal(after.admin_logs.length,1);assert.equal(after.app_meta[0].key,OPERATION_KEY);
 }finally{await f.db.close();}
});

test('dry run and late inventory/ledger/audit/receipt failures roll back the entire grant',async()=>{
 const f=await fixture();try{
  const before=await snapshot(f.db),dry=await f.apply({commit:false});assert.equal(dry.committed,false);assert.deepEqual(await snapshot(f.db),before);
  for(const prefix of ['INSERT INTO cnine_user_inventory','INSERT INTO inventory_logs','INSERT INTO admin_logs','INSERT INTO app_meta']){
   const broken={async query(sql,args){if(sql.startsWith(prefix))throw Error('Injected failure');return f.db.query(sql,args);}};
   await assert.rejects(grant(broken,{expectedPlanHash:PLAN_HASH,lockDeadline:Date.now()+120000,commit:true}),/Injected failure/);
   assert.deepEqual(await snapshot(f.db),before);
  }
 }finally{await f.db.close();}
});

test('identity/account/item changes, orphan grant logs and missing locks prevent writes',async()=>{
 for(const sql of [
  `UPDATE users SET nickname='changed' WHERE id=${TARGETS[0].userId}`,
  `UPDATE users SET status='BANNED' WHERE id=${TARGETS[0].userId}`,
  `UPDATE inventory_items SET is_active=0 WHERE code='${ITEM}'`,
  `INSERT INTO inventory_logs(user_id,item_code,change_amount,reference_id) VALUES(${TARGETS[0].userId},'${ITEM}',2,'${OPERATION_KEY}')`
 ]){const f=await fixture();try{await f.db.exec(sql);const before=await snapshot(f.db);await assert.rejects(f.apply());assert.deepEqual(await snapshot(f.db),before);}finally{await f.db.close();}}
 const f=await fixture();try{const before=await snapshot(f.db);await assert.rejects(f.apply({expectedPlanHash:'wrong'}),/plan changed/);await assert.rejects(f.apply({lockDeadline:Date.now()}),/locks required/);assert.deepEqual(await snapshot(f.db),before);}finally{await f.db.close();}
});

test('lost commit response and opening gifts do not cause another grant on retry',async()=>{
 const f=await fixture();try{
  const uncertain={async query(sql,args){const result=await f.db.query(sql,args);if(sql==='COMMIT')throw Error('Lost commit response');return result;}};
  await assert.rejects(grant(uncertain,{expectedPlanHash:PLAN_HASH,lockDeadline:Date.now()+120000,commit:true}),/Lost commit response/);
  await f.db.query('UPDATE cnine_user_inventory SET quantity=0,unseen_quantity=0 WHERE item_code=$1',[ITEM]);
  const before=await snapshot(f.db),replay=await f.apply();assert.equal(replay.replayed,true);assert.equal((await verify(f.db)).recipients,21);assert.deepEqual(await snapshot(f.db),before);
 }finally{await f.db.close();}
});
