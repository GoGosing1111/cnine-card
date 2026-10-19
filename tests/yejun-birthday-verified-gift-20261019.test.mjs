import test from 'node:test';
import assert from 'node:assert/strict';
import {PGlite} from '@electric-sql/pglite';
import {inspectBirthdayGift,grantBirthdayGift,verifyBirthdayGift,OPERATION_KEY,COIN_PER_USER,TITLE} from '../scripts/ops/yejun-birthday-verified-gift-20261019.mjs';

async function fixture(){
 const db=new PGlite();await db.exec(`
  CREATE TABLE users(id BIGINT PRIMARY KEY,nickname TEXT,status TEXT,role TEXT,coin BIGINT DEFAULT 999,card_shards BIGINT DEFAULT 123,magic_crystals BIGINT DEFAULT 456);
  INSERT INTO users(id,nickname,status,role) VALUES(1,'owner','ACTIVE','OWNER'),(2,'admin','ACTIVE','ADMIN'),(303,'[C9]족쪽이','ACTIVE','USER'),(4,'banned','BANNED','USER'),(5,'unverified','ACTIVE','USER'),(6,'unverified owner','ACTIVE','OWNER');
  CREATE TABLE user_second_verifications(user_id BIGINT PRIMARY KEY,provider TEXT);INSERT INTO user_second_verifications VALUES(1,'PLAYDK'),(2,'PLAYDK'),(303,'WAGO'),(4,'PLAYDK');
  CREATE TABLE coin_logs(id BIGSERIAL PRIMARY KEY,user_id BIGINT,change_amount BIGINT,balance_after BIGINT,reason TEXT,admin_id BIGINT,created_at TEXT);
  CREATE TABLE admin_logs(id BIGSERIAL PRIMARY KEY,admin_id BIGINT,action_type TEXT,target_type TEXT,target_id TEXT,before_data TEXT,after_data TEXT,created_at TEXT);
  CREATE TABLE app_meta(key TEXT PRIMARY KEY,value TEXT,updated_at TEXT);
  CREATE TABLE user_messages(id BIGINT PRIMARY KEY,user_id BIGINT,title TEXT);INSERT INTO user_messages VALUES(99,303,'existing');
 `);const plan=await inspectBirthdayGift(db);return {db,plan,grant:(options={})=>grantBirthdayGift(db,{expectedRecipientHash:plan.recipientHash,commit:true,...options})};
}
async function snapshot(db){const out={};for(const table of ['users','user_second_verifications','coin_logs','admin_logs','app_meta','user_messages'])out[table]=(await db.query('SELECT * FROM '+table+' ORDER BY 1')).rows;return out;}

test('all active verified roles/providers receive exactly 2천억, with one ledger each and no other balance or message changes',async()=>{
 const f=await fixture();try{
  const before=await snapshot(f.db),r=await f.grant(),after=await snapshot(f.db);assert.equal(r.committed,true);assert.equal(r.receipt.recipientCount,3);assert.equal(r.receipt.totalCoin,'600000000000');
  assert.deepEqual(r.receipt.roles,{OWNER:1,ADMIN:1,USER:1});
  for(const user of after.users){const old=before.users.find(o=>o.id===user.id);assert.equal(BigInt(user.coin)-BigInt(old.coin),[1,2,303].includes(Number(user.id))?BigInt(COIN_PER_USER):0n);assert.deepEqual({...user,coin:old.coin},old);}
  for(const table of ['user_second_verifications','user_messages'])assert.deepEqual(after[table],before[table]);
  assert.equal(after.coin_logs.length,3);assert.ok(after.coin_logs.every(row=>row.reason===TITLE));assert.equal(after.admin_logs.length,1);assert.equal(after.app_meta[0].key,OPERATION_KEY);
  assert.equal((await verifyBirthdayGift(f.db)).duplicates,0);
  await f.db.exec("INSERT INTO user_second_verifications VALUES(5,'PLAYDK');UPDATE users SET coin=coin-5 WHERE id=303;DELETE FROM user_second_verifications WHERE user_id=303");
  const later=await snapshot(f.db);assert.equal((await f.grant()).replayed,true);assert.deepEqual(await snapshot(f.db),later);
 }finally{await f.db.close();}
});

test('default dry-run rolls back balances, coin ledger, audit and receipt',async()=>{
 const f=await fixture();try{const before=await snapshot(f.db),r=await grantBirthdayGift(f.db,{expectedRecipientHash:f.plan.recipientHash});assert.equal(r.committed,false);assert.equal(r.verification.recipientCount,3);assert.deepEqual(await snapshot(f.db),before);}finally{await f.db.close();}
});

test('partial credit, ledger, audit, and receipt failures roll back the entire grant',async()=>{
 for(const fault of [
  "CREATE FUNCTION skip_credit() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN IF NEW.id=303 THEN RETURN NULL; END IF; RETURN NEW; END; $$; CREATE TRIGGER skip_one BEFORE UPDATE ON users FOR EACH ROW EXECUTE FUNCTION skip_credit();",
  'ALTER TABLE coin_logs ADD CONSTRAINT reject_grant CHECK(change_amount<0)',
  'ALTER TABLE admin_logs ADD CONSTRAINT reject_grant CHECK(admin_id<0)',
  "ALTER TABLE app_meta ADD CONSTRAINT reject_grant CHECK(key='reject')"
 ]){const f=await fixture();try{await f.db.exec(fault);const before=await snapshot(f.db);await assert.rejects(f.grant());assert.deepEqual(await snapshot(f.db),before);}finally{await f.db.close();}}
});

test('changed recipients, unsafe balances, and alternate prior delivery stop before issuing funds',async()=>{
 for(const change of ["INSERT INTO user_second_verifications VALUES(5,'PLAYDK')","UPDATE users SET status='BANNED' WHERE id=303",'UPDATE users SET coin=9007199254740991 WHERE id=303',`INSERT INTO user_messages VALUES(100,303,'${TITLE}')`,`INSERT INTO coin_logs(user_id,change_amount,reason) VALUES(303,200000000000,'${TITLE}')`]){
  const f=await fixture();try{await f.db.exec(change);const before=await snapshot(f.db);await assert.rejects(f.grant());assert.deepEqual(await snapshot(f.db),before);}finally{await f.db.close();}
 }
});

test('lost commit response and retries use the durable receipt without crediting twice',async()=>{
 const f=await fixture();try{
  const client={async query(sql,args=[]){const result=await f.db.query(sql,args);if(sql==='COMMIT')throw Error('lost commit response');return result;}};
  await assert.rejects(grantBirthdayGift(client,{expectedRecipientHash:f.plan.recipientHash,commit:true}),/lost commit response/);
  const before=await snapshot(f.db);assert.equal((await f.grant()).replayed,true);assert.deepEqual(await snapshot(f.db),before);
 }finally{await f.db.close();}
});

test('recipient enumeration exceeds CMS pages without missing or duplicating accounts',async()=>{
 const f=await fixture();try{
  await f.db.exec("INSERT INTO users(id,nickname,status,role) SELECT n,'bulk '||n,'ACTIVE','USER' FROM generate_series(1000,1599) n;INSERT INTO user_second_verifications SELECT n,'PLAYDK' FROM generate_series(1000,1599) n");
  const plan=await inspectBirthdayGift(f.db),r=await f.grant({expectedRecipientHash:plan.recipientHash});assert.equal(r.receipt.recipientCount,603);assert.equal(r.receipt.totalCoin,'120600000000000');assert.equal(r.verification.coinLogs,603);assert.equal(r.verification.duplicates,0);
 }finally{await f.db.close();}
});
