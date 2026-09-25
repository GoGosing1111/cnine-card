import test from 'node:test';
import assert from 'node:assert/strict';
import {PGlite} from '@electric-sql/pglite';
import {inspectVerifiedCoinRepair,grantVerifiedCoinRepair,verifyVerifiedCoinRepair,OPERATION_KEY,COIN_PER_USER,ITEM_CODE} from '../scripts/ops/verified-coin-repair-grant-20260925.mjs';

async function fixture(){
 const db=new PGlite();
 await db.exec(`CREATE TABLE users(id BIGINT PRIMARY KEY,nickname TEXT,role TEXT,status TEXT,coin BIGINT DEFAULT 9000000000,card_shards BIGINT DEFAULT 123,magic_crystals BIGINT DEFAULT 456);
 INSERT INTO users(id,nickname,role,status) VALUES(1,'관리자','OWNER','ACTIVE'),(2,'운영자','ADMIN','ACTIVE'),(3,'인증유저','USER','ACTIVE'),(4,'정지유저','USER','BANNED'),(5,'미인증','USER','ACTIVE'),(6,'미인증오너','OWNER','ACTIVE');
 CREATE TABLE user_second_verifications(user_id BIGINT PRIMARY KEY,provider TEXT);INSERT INTO user_second_verifications VALUES(1,'PLAYDK'),(2,'PLAYDK'),(3,'WAGO'),(4,'PLAYDK');
 CREATE TABLE inventory_items(code TEXT PRIMARY KEY,name TEXT,is_active BIGINT);INSERT INTO inventory_items VALUES('PINGDU_REPAIR_COUPON','핑두 리페어 쿠폰',1);
 CREATE TABLE cnine_user_inventory(user_id BIGINT,item_code TEXT,quantity BIGINT,unseen_quantity BIGINT,created_at TEXT,updated_at TEXT,extra TEXT DEFAULT 'preserve',PRIMARY KEY(user_id,item_code));
 INSERT INTO cnine_user_inventory(user_id,item_code,quantity,unseen_quantity,created_at,updated_at) VALUES(3,'PINGDU_REPAIR_COUPON',4,2,'old','old'),(3,'MASTER_STAR',100,0,'old','old'),(4,'PINGDU_REPAIR_COUPON',3,0,'old','old');
 CREATE TABLE coin_logs(id BIGSERIAL PRIMARY KEY,user_id BIGINT,change_amount BIGINT,balance_after BIGINT,reason TEXT,admin_id BIGINT,created_at TEXT);
 CREATE TABLE inventory_logs(id BIGSERIAL PRIMARY KEY,user_id BIGINT,item_code TEXT,change_amount BIGINT,balance_after BIGINT,reason TEXT,reference_type TEXT,reference_id TEXT,admin_id BIGINT,created_at TEXT);
 CREATE TABLE admin_logs(id BIGSERIAL PRIMARY KEY,admin_id BIGINT,action_type TEXT,target_type TEXT,target_id TEXT,before_data TEXT,after_data TEXT,created_at TEXT);
 CREATE TABLE app_meta(key TEXT PRIMARY KEY,value TEXT,updated_at TEXT);
 CREATE TABLE user_messages(id BIGINT PRIMARY KEY,user_id BIGINT,title TEXT);INSERT INTO user_messages VALUES(99,3,'기존 메시지');`);
 const client={query:(sql,args=[])=>db.query(sql,args)};
 const plan=await inspectVerifiedCoinRepair(client);
 return {db,client,plan,grant:(options={})=>grantVerifiedCoinRepair(client,{expectedRecipientHash:plan.recipientHash,commit:true,...options})};
}
async function snapshot(db){
 const data={};for(const table of ['users','user_second_verifications','inventory_items','cnine_user_inventory','coin_logs','inventory_logs','admin_logs','app_meta','user_messages'])data[table]=(await db.query(`SELECT * FROM ${table} ORDER BY 1,2`)).rows;return data;
}

test('all active verified roles receive exact 500억 plus one repair, preserving unrelated balances and inventory; replay excludes later verifications',async()=>{
 const f=await fixture();try{
  const before=await snapshot(f.db),receipt=await f.grant(),after=await snapshot(f.db);
  assert.equal(receipt.recipientCount,3);assert.deepEqual(receipt.roles,{OWNER:1,ADMIN:1,USER:1});assert.equal(receipt.totalCoin,'150000000000');assert.equal(receipt.totalItems,'3');
  for(const user of after.users){const old=before.users.find(r=>r.id===user.id);assert.equal(BigInt(user.coin),BigInt(old.coin)+(Number(user.id)<=3?BigInt(COIN_PER_USER):0n));assert.deepEqual({...user,coin:old.coin},old);}
  const held=after.cnine_user_inventory.find(r=>Number(r.user_id)===3&&r.item_code===ITEM_CODE);assert.equal(Number(held.quantity),5);assert.equal(Number(held.unseen_quantity),3);assert.equal(held.created_at,'old');assert.equal(held.extra,'preserve');
  const untouched=r=>Number(r.user_id)>3||r.item_code!==ITEM_CODE;
  assert.deepEqual(after.cnine_user_inventory.filter(untouched),before.cnine_user_inventory.filter(untouched));
  for(const table of ['user_second_verifications','inventory_items','user_messages'])assert.deepEqual(after[table],before[table]);
  assert.equal(after.coin_logs.length,3);assert.equal(after.inventory_logs.length,3);assert.equal(after.admin_logs.length,1);assert.equal(after.app_meta[0].key,OPERATION_KEY);
  assert.equal((await verifyVerifiedCoinRepair(f.client)).duplicates,0);
  await f.db.exec("INSERT INTO user_second_verifications VALUES(5,'PLAYDK')");const later=await snapshot(f.db);
  assert.equal((await f.grant()).replayed,true);assert.deepEqual(await snapshot(f.db),later);
 }finally{await f.db.close()}
});

test('default dry run verifies every recipient then rolls back both grants and all ledgers',async()=>{
 const f=await fixture();try{
  const before=await snapshot(f.db),r=await grantVerifiedCoinRepair(f.client,{expectedRecipientHash:f.plan.recipientHash});
  assert.equal(r.committed,false);assert.equal(r.recipientCount,3);assert.deepEqual(await snapshot(f.db),before);
 }finally{await f.db.close()}
});

test('partial coin or repair writes, either ledger, audit and final receipt failure roll the complete grant back',async()=>{
 for(const fault of [
  "CREATE FUNCTION skip_credit() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN IF NEW.id=3 THEN RETURN NULL; END IF; RETURN NEW; END; $$; CREATE TRIGGER skip_one BEFORE UPDATE ON users FOR EACH ROW EXECUTE FUNCTION skip_credit();",
  "CREATE FUNCTION skip_item() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN IF NEW.user_id=1 THEN RETURN NULL; END IF; RETURN NEW; END; $$; CREATE TRIGGER skip_one BEFORE INSERT ON cnine_user_inventory FOR EACH ROW EXECUTE FUNCTION skip_item();",
  'ALTER TABLE coin_logs ADD CONSTRAINT reject_grant CHECK(change_amount<0)',
  'ALTER TABLE inventory_logs ADD CONSTRAINT reject_grant CHECK(change_amount<0)',
  'ALTER TABLE admin_logs ADD CONSTRAINT reject_grant CHECK(admin_id<0)',
  "ALTER TABLE app_meta ADD CONSTRAINT reject_grant CHECK(key='reject')"
 ]){
  const f=await fixture();try{
   await f.db.exec(fault);const before=await snapshot(f.db);await assert.rejects(f.grant());assert.deepEqual(await snapshot(f.db),before);
   if(fault.startsWith('ALTER TABLE admin_logs')){await f.db.exec('ALTER TABLE admin_logs DROP CONSTRAINT reject_grant');assert.equal((await f.grant()).recipientCount,3);}
  }finally{await f.db.close()}
 }
});

test('changed recipients, inactive catalog or unsafe integer balances stop before any partial grant',async()=>{
 for(const change of ["INSERT INTO user_second_verifications VALUES(5,'PLAYDK')","UPDATE users SET status='BANNED' WHERE id=3","UPDATE inventory_items SET is_active=0",'UPDATE users SET coin=9007199254740991 WHERE id=3']){
  const f=await fixture();try{await f.db.exec(change);const before=await snapshot(f.db);await assert.rejects(f.grant());assert.deepEqual(await snapshot(f.db),before);}finally{await f.db.close()}
 }
});

test('lost commit response is recovered from persisted ledgers, even after users spend or unlink verification',async()=>{
 const f=await fixture();try{
  const dropped={async query(sql,args=[]){const r=await f.client.query(sql,args);if(sql==='COMMIT')throw Error('lost commit response');return r;}};
  await assert.rejects(grantVerifiedCoinRepair(dropped,{expectedRecipientHash:f.plan.recipientHash,commit:true}),/lost commit response/);
  await f.db.exec('UPDATE users SET coin=coin-1000 WHERE id=3;UPDATE cnine_user_inventory SET quantity=quantity-1 WHERE user_id=3;DELETE FROM user_second_verifications WHERE user_id=3');
  const after=await snapshot(f.db);assert.equal((await f.grant()).replayed,true);assert.deepEqual(await snapshot(f.db),after);
  assert.equal((await verifyVerifiedCoinRepair(f.client)).recipientCount,3);
 }finally{await f.db.close()}
});

test('bulk grant includes all recipients beyond the CMS list page and checks every exact ledger',async()=>{
 const f=await fixture();try{
  await f.db.exec("INSERT INTO users(id,nickname,role,status) SELECT n,'추가 '||n,'USER','ACTIVE' FROM generate_series(100,304) n;INSERT INTO user_second_verifications SELECT n,'PLAYDK' FROM generate_series(100,304) n");
  const plan=await inspectVerifiedCoinRepair(f.client),r=await f.grant({expectedRecipientHash:plan.recipientHash});
  assert.equal(r.recipientCount,208);assert.equal(r.totalCoin,'10400000000000');assert.equal(r.totalItems,'208');
  const verified=await verifyVerifiedCoinRepair(f.client);assert.equal(verified.coinLogs,208);assert.equal(verified.itemLogs,208);assert.equal(verified.duplicates,0);
 }finally{await f.db.close()}
});
