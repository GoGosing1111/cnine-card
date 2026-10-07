import test from 'node:test';
import assert from 'node:assert/strict';
import {PGlite} from '@electric-sql/pglite';
import {inspectOrikkungGift as inspect,sendOrikkungGift as send,verifyOrikkungGift as verify,TITLE,TARGETS,GIFTS} from '../scripts/ops/orikkung-gift-20261007.mjs';

async function fixture(t){
 const db=new PGlite();t.after(()=>db.close());
 await db.exec(`CREATE TABLE users(id BIGINT PRIMARY KEY,nickname TEXT,role TEXT DEFAULT 'USER',status TEXT DEFAULT 'ACTIVE',coin BIGINT DEFAULT 123);
 INSERT INTO users(id,nickname,role) VALUES(1,'운영자','OWNER'),(999999,'명단외','USER');
 CREATE TABLE inventory_items(code TEXT PRIMARY KEY,name TEXT,is_active INTEGER);
 INSERT INTO inventory_items VALUES('MASTER_STAR','마스터의 별',1),('EMPEROR_ENERGY','엠퍼러 에너지',1);
 CREATE TABLE cnine_user_inventory(user_id BIGINT,item_code TEXT,quantity BIGINT);
 INSERT INTO cnine_user_inventory VALUES(4817,'MASTER_STAR',777),(4757,'EMPEROR_ENERGY',9);
 CREATE TABLE app_meta(key TEXT PRIMARY KEY,value TEXT,updated_at TEXT);
 CREATE TABLE user_messages(id BIGSERIAL PRIMARY KEY,user_id BIGINT NOT NULL,sender_type TEXT,title TEXT,body TEXT,message_type TEXT,campaign_key TEXT,is_read INTEGER DEFAULT 0,hidden_at TEXT,UNIQUE(user_id,campaign_key));
 CREATE TABLE user_message_rewards(id BIGSERIAL PRIMARY KEY,message_id BIGINT UNIQUE,user_id BIGINT,reward_type TEXT,reward_amount BIGINT,claimed_at TEXT);
 CREATE TABLE admin_logs(id BIGSERIAL PRIMARY KEY,admin_id BIGINT,action_type TEXT,target_type TEXT,target_id TEXT,before_data TEXT,after_data TEXT);`);
 for(const row of TARGETS)await db.query('INSERT INTO users(id,nickname) VALUES($1,$2)',[row.id,row.nickname]);
 return {db,client:{query:(sql,args=[])=>db.query(sql,args)}};
}
async function snapshot(db){
 const result={};for(const name of ['users','cnine_user_inventory','user_messages','user_message_rewards','app_meta','admin_logs'])result[name]=(await db.query(`SELECT * FROM ${name} ORDER BY 1`)).rows;return result;
}

test('52 named accounts get three claimable gifts each, including distinct 음주 accounts and verified 레가파 alias',async t=>{
 const {db,client}=await fixture(t),before=await snapshot(db),plan=await inspect(client);
 assert.equal(plan.count,52);assert.equal(TARGETS.find(t=>t.inputNickname==='레기파').id,'4408');
 assert.deepEqual(TARGETS.filter(t=>['음주','음주플레이어'].includes(t.inputNickname)).map(t=>t.id),['4817','4757']);
 assert.deepEqual(plan.gifts.map(g=>[g.rewardType,g.rewardAmount,g.totalAmount]),[['COIN',500_000_000_000,'26000000000000'],['MASTER_STAR',5_000_000,'260000000'],['EMPEROR_ENERGY',5,'260']]);
 const receipt=await send(client,{expectedRecipientHash:plan.recipientHash}),after=await snapshot(db);
 assert.equal(receipt.verification.messages,156);assert.equal(receipt.verification.duplicates,0);
 assert.deepEqual(after.users,before.users);assert.deepEqual(after.cnine_user_inventory,before.cnine_user_inventory);
 assert.equal(after.admin_logs.length,1);assert.ok(after.user_messages.every(r=>r.title===TITLE&&r.body===TITLE));
 assert.ok(after.user_messages.every(r=>!['1','999999'].includes(r.user_id)));
 await db.exec("UPDATE user_message_rewards SET claimed_at='claimed' WHERE user_id=4817");
 const replayBefore=await snapshot(db),replay=await send(client,{expectedRecipientHash:plan.recipientHash});
 assert.equal(replay.replayed,true);assert.deepEqual(replay.verification.campaigns.map(c=>c.claimed),[1,1,1]);
 assert.deepEqual(await snapshot(db),replayBefore);assert.equal((await verify(client,receipt)).missing,0);
});

test('dry-run rolls back every message, and identity/status/item changes stop the full campaign',async t=>{
 const {db,client}=await fixture(t),plan=await inspect(client),before=await snapshot(db);
 assert.equal((await send(client,{expectedRecipientHash:plan.recipientHash,dryRun:true})).dryRun,true);
 assert.deepEqual(await snapshot(db),before);
 for(const [change,restore,error] of [
  ["UPDATE users SET nickname='다른닉' WHERE id=4408","UPDATE users SET nickname='레가파' WHERE id=4408",/Nickname changed/],
  ["UPDATE users SET status='BANNED' WHERE id=4817","UPDATE users SET status='ACTIVE' WHERE id=4817",/Inactive target/],
  ["UPDATE inventory_items SET is_active=0 WHERE code='EMPEROR_ENERGY'","UPDATE inventory_items SET is_active=1 WHERE code='EMPEROR_ENERGY'",/Active EMPEROR_ENERGY required/]
 ]){await db.exec(change);const changed=await snapshot(db);await assert.rejects(()=>send(client,{expectedRecipientHash:plan.recipientHash}),error);assert.deepEqual(await snapshot(db),changed);await db.exec(restore);}
});

for(const failure of ['EMPEROR_ENERGY','AUDIT'])test(`${failure} failure rolls back all three gifts; retry sends exactly one campaign`,async t=>{
 const {db,client}=await fixture(t),plan=await inspect(client);
 const table=failure==='AUDIT'?'admin_logs':'user_message_rewards';
 await db.exec(`ALTER TABLE ${table} ADD CONSTRAINT injected CHECK(${failure==='AUDIT'?"action_type='DENIED'":"reward_type<>'EMPEROR_ENERGY'"})`);
 const before=await snapshot(db);await assert.rejects(()=>send(client,{expectedRecipientHash:plan.recipientHash}),/check constraint/);
 assert.deepEqual(await snapshot(db),before);await db.exec(`ALTER TABLE ${table} DROP CONSTRAINT injected`);
 assert.equal((await send(client,{expectedRecipientHash:plan.recipientHash})).verification.messages,156);
 assert.equal((await send(client,{expectedRecipientHash:plan.recipientHash})).replayed,true);
});

test('lost COMMIT response returns the stored receipt without another grant',async t=>{
 const {db,client}=await fixture(t),plan=await inspect(client);
 const uncertain={async query(sql,args){const result=await client.query(sql,args);if(sql==='COMMIT')throw Error('response lost');return result;}};
 await assert.rejects(()=>send(uncertain,{expectedRecipientHash:plan.recipientHash}),/response lost/);
 const before=await snapshot(db),replay=await send(client,{expectedRecipientHash:plan.recipientHash});
 assert.equal(replay.replayed,true);assert.equal(replay.verification.messages,156);assert.deepEqual(await snapshot(db),before);
});

test('same event title under another campaign key prevents duplicate distribution',async t=>{
 const {db,client}=await fixture(t),plan=await inspect(client);
 await db.query("INSERT INTO user_messages(user_id,title,campaign_key) VALUES(4817,$1,'old-key')",[TITLE]);
 const before=await snapshot(db);await assert.rejects(()=>send(client,{expectedRecipientHash:plan.recipientHash}),/Matching gift exists/);
 assert.deepEqual(await snapshot(db),before);assert.equal(GIFTS.length,3);
});
