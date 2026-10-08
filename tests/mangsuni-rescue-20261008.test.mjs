import test from 'node:test';
import assert from 'node:assert/strict';
import {PGlite} from '@electric-sql/pglite';
import {inspectMangsuniRescue as inspect,sendMangsuniRescue as send,verifyMangsuniRescue as verify,TARGETS,GIFTS,TITLE,BODY,RECIPIENT_HASH} from '../scripts/ops/mangsuni-rescue-20261008.mjs';

async function fixture(t){
 const db=new PGlite();t.after(()=>db.close());
 await db.exec(`CREATE TABLE users(id BIGINT PRIMARY KEY,nickname TEXT,role TEXT DEFAULT 'USER',status TEXT DEFAULT 'ACTIVE',coin BIGINT DEFAULT 123);
 INSERT INTO users(id,nickname,role) VALUES(1,'운영자','OWNER'),(999999,'명단외','USER');
 CREATE TABLE inventory_items(code TEXT PRIMARY KEY,name TEXT,is_active INTEGER);
 INSERT INTO inventory_items VALUES('MASTER_STAR','마스터의 별',1);
 CREATE TABLE cnine_user_inventory(user_id BIGINT,item_code TEXT,quantity BIGINT);
 INSERT INTO cnine_user_inventory VALUES(289,'MASTER_STAR',777);
 CREATE TABLE app_meta(key TEXT PRIMARY KEY,value TEXT,updated_at TEXT);
 CREATE TABLE user_messages(id BIGSERIAL PRIMARY KEY,user_id BIGINT NOT NULL,sender_type TEXT,title TEXT,body TEXT,message_type TEXT,campaign_key TEXT,is_read INTEGER DEFAULT 0,hidden_at TEXT,UNIQUE(user_id,campaign_key));
 CREATE TABLE user_message_rewards(id BIGSERIAL PRIMARY KEY,message_id BIGINT UNIQUE,user_id BIGINT,reward_type TEXT,reward_amount BIGINT,claimed_at TEXT);
 CREATE TABLE admin_logs(id BIGSERIAL PRIMARY KEY,admin_id BIGINT,action_type TEXT,target_type TEXT,target_id TEXT,before_data TEXT,after_data TEXT);`);
 for(const row of TARGETS)await db.query('INSERT INTO users(id,nickname) VALUES($1,$2)',[row.id,row.nickname]);
 return {db,client:{query:(sql,args=[])=>db.query(sql,args)}};
}
async function snapshot(db){
 const result={};
 for(const name of ['users','cnine_user_inventory','user_messages','user_message_rewards','app_meta','admin_logs'])result[name]=(await db.query(`SELECT * FROM ${name} ORDER BY 1`)).rows;
 return result;
}
const options={expectedRecipientHash:RECIPIENT_HASH};

test('58 named accounts receive exactly 1 trillion coins and 10 million stars in two claimable messages; balances unchanged',async t=>{
 const {db,client}=await fixture(t),before=await snapshot(db),plan=await inspect(client);
 assert.equal(plan.count,58);assert.equal(TARGETS.find(r=>r.inputNickname==='베배킹').id,'289');assert.equal(TARGETS.find(r=>r.inputNickname==='레기파').id,'4408');
 assert.equal(TARGETS.find(r=>r.inputNickname==='쁴로리').nickname,'쁴로리');
 assert.deepEqual(plan.gifts.map(g=>[g.rewardType,g.rewardAmount,g.totalAmount]),[['COIN',1_000_000_000_000,'58000000000000'],['MASTER_STAR',10_000_000,'580000000']]);
 const sent=await send(client,options),after=await snapshot(db);
 assert.equal(sent.verification.messages,116);assert.equal(sent.verification.duplicates,0);
 assert.deepEqual(after.users,before.users);assert.deepEqual(after.cnine_user_inventory,before.cnine_user_inventory);
 assert.equal(after.admin_logs.length,1);assert.ok(after.user_messages.every(r=>r.title===TITLE&&r.body===BODY));
 assert.ok(after.user_messages.every(r=>!['1','999999'].includes(String(r.user_id))));
 assert.ok(after.user_message_rewards.every(r=>r.claimed_at===null));
 await db.exec("UPDATE user_message_rewards SET claimed_at='claimed' WHERE user_id=289");
 const prior=await snapshot(db),replayed=await send(client,options);
 assert.equal(replayed.replayed,true);assert.deepEqual(replayed.verification.campaigns.map(c=>c.claimed),[1,1]);
 assert.deepEqual(await snapshot(db),prior);assert.equal((await verify(client,sent.receipt)).missing,0);
});

test('dry-run rolls back both gifts and receipt; wrong hash, renamed/inactive user, or inactive item rejects all delivery',async t=>{
 const {db,client}=await fixture(t),before=await snapshot(db);
 assert.equal((await send(client,{...options,dryRun:true})).dryRun,true);assert.deepEqual(await snapshot(db),before);
 await assert.rejects(()=>send(client,{expectedRecipientHash:'wrong'}),/Reviewed recipient hash/);
 for(const [change,restore,error] of [
  ["UPDATE users SET nickname='다른닉' WHERE id=4408","UPDATE users SET nickname='레가파' WHERE id=4408",/Nickname changed/],
  ["UPDATE users SET status='BANNED' WHERE id=289","UPDATE users SET status='ACTIVE' WHERE id=289",/Inactive target/],
  ["UPDATE inventory_items SET is_active=0 WHERE code='MASTER_STAR'","UPDATE inventory_items SET is_active=1 WHERE code='MASTER_STAR'",/Active MASTER_STAR/]
 ]){await db.exec(change);const changed=await snapshot(db);await assert.rejects(()=>send(client,options),error);assert.deepEqual(await snapshot(db),changed);await db.exec(restore);}
});

for(const failure of ['MASTER_STAR','AUDIT'])test(failure+' failure rolls back the full campaign; retry sends once',async t=>{
 const {db,client}=await fixture(t);
 const table=failure==='AUDIT'?'admin_logs':'user_message_rewards';
 await db.exec(`ALTER TABLE ${table} ADD CONSTRAINT injected CHECK(${failure==='AUDIT'?"action_type='DENIED'":"reward_type<>'MASTER_STAR'"})`);
 const before=await snapshot(db);await assert.rejects(()=>send(client,options),/check constraint/);
 assert.deepEqual(await snapshot(db),before);await db.exec(`ALTER TABLE ${table} DROP CONSTRAINT injected`);
 assert.equal((await send(client,options)).verification.messages,116);
 assert.equal((await send(client,options)).replayed,true);
});

test('lost COMMIT response recovers saved receipt without resending',async t=>{
 const {db,client}=await fixture(t);
 const uncertain={async query(sql,args){const result=await client.query(sql,args);if(sql==='COMMIT')throw Error('response lost');return result;}};
 await assert.rejects(()=>send(uncertain,options),/response lost/);
 const before=await snapshot(db),replay=await send(client,options);
 assert.equal(replay.replayed,true);assert.equal(replay.verification.messages,116);assert.deepEqual(await snapshot(db),before);
});

test('same event title under another campaign key prevents duplicate delivery',async t=>{
 const {db,client}=await fixture(t);
 await db.query("INSERT INTO user_messages(user_id,title,campaign_key) VALUES(289,$1,'old-key')",[TITLE]);
 const before=await snapshot(db);await assert.rejects(()=>send(client,options),/Matching event exists/);
 assert.deepEqual(await snapshot(db),before);assert.equal(GIFTS.length,2);
});
