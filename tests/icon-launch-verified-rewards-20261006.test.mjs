import test from 'node:test';
import assert from 'node:assert/strict';
import {PGlite} from '@electric-sql/pglite';
import {inspectIconLaunchRewards as inspect,sendIconLaunchRewards as send,verifyIconLaunchRewards as verify,TITLE} from '../scripts/ops/icon-launch-verified-rewards-20261006.mjs';

async function fixture(){
 const db=new PGlite();
 await db.exec(`CREATE TABLE users(id BIGINT PRIMARY KEY,role TEXT,status TEXT,coin BIGINT DEFAULT 123);
 INSERT INTO users(id,role,status) VALUES(1,'OWNER','ACTIVE'),(2,'ADMIN','ACTIVE'),(3,'USER','ACTIVE'),(4,'USER','BANNED'),(5,'USER','ACTIVE');
 CREATE TABLE user_second_verifications(user_id BIGINT);
 INSERT INTO user_second_verifications VALUES(1),(2),(3),(3),(4);
 CREATE TABLE inventory_items(code TEXT PRIMARY KEY,name TEXT,is_active INTEGER);
 INSERT INTO inventory_items VALUES('MASTER_STAR','마스터의 별',1);
 CREATE TABLE cnine_user_inventory(user_id BIGINT,item_code TEXT,quantity BIGINT);
 INSERT INTO cnine_user_inventory VALUES(3,'MASTER_STAR',777);
 CREATE TABLE app_meta(key TEXT PRIMARY KEY,value TEXT,updated_at TEXT);
 CREATE TABLE user_messages(id BIGSERIAL PRIMARY KEY,user_id BIGINT NOT NULL,sender_type TEXT,title TEXT,body TEXT,message_type TEXT,campaign_key TEXT,is_read INTEGER DEFAULT 0,hidden_at TEXT,UNIQUE(user_id,campaign_key));
 CREATE TABLE user_message_rewards(id BIGSERIAL PRIMARY KEY,message_id BIGINT UNIQUE,user_id BIGINT,reward_type TEXT,reward_amount BIGINT,claimed_at TEXT);
 CREATE TABLE admin_logs(id BIGSERIAL PRIMARY KEY,admin_id BIGINT,action_type TEXT,target_type TEXT,target_id TEXT,before_data TEXT,after_data TEXT);`);
 return {db,client:{query:(sql,args=[])=>db.query(sql,args)}};
}
async function snapshot(db){
 const result={};for(const name of ['users','cnine_user_inventory','user_messages','user_message_rewards','app_meta','admin_logs'])result[name]=(await db.query(`SELECT * FROM ${name} ORDER BY 1`)).rows;return result;
}

test('all active verified roles receive the exact two gifts once; replay freezes recipients and preserves balances',async()=>{
 const {db,client}=await fixture();try{
  const before=await snapshot(db),plan=await inspect(client);
  assert.equal(plan.count,3);assert.deepEqual(plan.roles,{OWNER:1,ADMIN:1,USER:1});
  assert.deepEqual(plan.gifts.map(g=>[g.rewardType,g.rewardAmount,g.totalAmount]),[['COIN',100_000_000_000,'300000000000'],['MASTER_STAR',3_000_000,'9000000']]);
  const receipt=await send(client,{expectedRecipientHash:plan.recipientHash});
  assert.equal(receipt.title,'아이콘 출시 기념 사료');assert.equal(receipt.verification.messages,6);
  const after=await snapshot(db);assert.deepEqual(after.users,before.users);assert.deepEqual(after.cnine_user_inventory,before.cnine_user_inventory);
  assert.equal(after.admin_logs.length,1);assert.ok(after.user_messages.every(row=>row.title===TITLE&&row.body===TITLE));
  assert.equal((await verify(client,receipt)).duplicates,0);
  await db.exec("INSERT INTO user_second_verifications VALUES(5);UPDATE user_message_rewards SET claimed_at='claimed' WHERE user_id=3");
  const replayBefore=await snapshot(db),replay=await send(client,{expectedRecipientHash:plan.recipientHash});
  assert.equal(replay.replayed,true);assert.deepEqual(replay.verification.campaigns.map(c=>c.claimed),[1,1]);
  assert.deepEqual(await snapshot(db),replayBefore);
 }finally{await db.close();}
});

test('dry run, changed recipients and inactive item leave no partial campaign',async()=>{
 const {db,client}=await fixture();try{
  const before=await snapshot(db),plan=await inspect(client);
  assert.equal((await send(client,{expectedRecipientHash:plan.recipientHash,dryRun:true})).dryRun,true);
  assert.deepEqual(await snapshot(db),before);
  await db.exec('INSERT INTO user_second_verifications VALUES(5)');
  await assert.rejects(()=>send(client,{expectedRecipientHash:plan.recipientHash}),/Recipients changed/);
  assert.deepEqual(await snapshot(db),before);
  await db.exec("DELETE FROM user_second_verifications WHERE user_id=5;UPDATE inventory_items SET is_active=0 WHERE code='MASTER_STAR'");
  await assert.rejects(()=>send(client,{expectedRecipientHash:plan.recipientHash}),/Active MASTER_STAR required/);
  assert.deepEqual(await snapshot(db),before);
 }finally{await db.close();}
});

for(const failure of ['MASTER_STAR','AUDIT'])test(`${failure} failure rolls back both gifts; retry succeeds exactly once`,async()=>{
 const {db,client}=await fixture();try{
  await db.exec(failure==='AUDIT'?"ALTER TABLE admin_logs ADD CONSTRAINT injected CHECK(action_type='DENIED')":"ALTER TABLE user_message_rewards ADD CONSTRAINT injected CHECK(reward_type<>'MASTER_STAR')");
  const before=await snapshot(db),plan=await inspect(client);
  await assert.rejects(()=>send(client,{expectedRecipientHash:plan.recipientHash}),/check constraint/);
  assert.deepEqual(await snapshot(db),before);
  await db.exec(`ALTER TABLE ${failure==='AUDIT'?'admin_logs':'user_message_rewards'} DROP CONSTRAINT injected`);
  assert.equal((await send(client,{expectedRecipientHash:plan.recipientHash})).verification.messages,6);
  assert.equal((await send(client,{expectedRecipientHash:plan.recipientHash})).replayed,true);
 }finally{await db.close();}
});

test('lost commit response cannot resend gifts or add another audit',async()=>{
 const {db,client}=await fixture();try{
  const plan=await inspect(client),uncertain={async query(sql,args){const result=await client.query(sql,args);if(sql==='COMMIT')throw Error('response lost');return result;}};
  await assert.rejects(()=>send(uncertain,{expectedRecipientHash:plan.recipientHash}),/response lost/);
  const before=await snapshot(db),replay=await send(client,{expectedRecipientHash:plan.recipientHash});
  assert.equal(replay.replayed,true);assert.equal(replay.verification.messages,6);assert.deepEqual(await snapshot(db),before);
 }finally{await db.close();}
});

test('the same event title under another campaign key blocks duplicate distribution',async()=>{
 const {db,client}=await fixture();try{
  await db.query("INSERT INTO user_messages(user_id,sender_type,title,body,message_type,campaign_key) VALUES(3,'ADMIN',$1,$1,'COIN_REWARD','other-key')",[TITLE]);
  const before=await snapshot(db),plan=await inspect(client);
  await assert.rejects(()=>send(client,{expectedRecipientHash:plan.recipientHash}),/Matching gift exists/);
  assert.deepEqual(await snapshot(db),before);
 }finally{await db.close();}
});
