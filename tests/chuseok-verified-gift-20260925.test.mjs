import test from 'node:test';
import assert from 'node:assert/strict';
import {PGlite} from '@electric-sql/pglite';
import {inspectChuseokGift,sendChuseokGift,verifyChuseokGift,AMOUNT,TITLE} from '../scripts/ops/chuseok-verified-gift-20260925.mjs';

async function fixture({failAudit=false,failReward=false}={}){
 const db=new PGlite();
 await db.exec(`CREATE TABLE users(id BIGINT PRIMARY KEY,role TEXT,status TEXT,coin BIGINT DEFAULT 123);
 INSERT INTO users(id,role,status) VALUES(1,'OWNER','ACTIVE'),(2,'ADMIN','ACTIVE'),(3,'USER','ACTIVE'),(4,'USER','BANNED'),(5,'USER','ACTIVE');
 CREATE TABLE user_second_verifications(user_id BIGINT PRIMARY KEY);
 INSERT INTO user_second_verifications VALUES(1),(2),(3),(4);
 CREATE TABLE app_meta(key TEXT PRIMARY KEY,value TEXT,updated_at TEXT);
 CREATE TABLE user_messages(id BIGSERIAL PRIMARY KEY,user_id BIGINT NOT NULL,sender_type TEXT,title TEXT,body TEXT,message_type TEXT,campaign_key TEXT,is_read INTEGER DEFAULT 0,hidden_at TEXT,UNIQUE(user_id,campaign_key));
 CREATE TABLE user_message_rewards(id BIGSERIAL PRIMARY KEY,message_id BIGINT UNIQUE,user_id BIGINT,reward_type TEXT,reward_amount BIGINT ${failReward?'CHECK(reward_amount<100)':''},claimed_at TEXT);
 CREATE TABLE admin_logs(id BIGSERIAL PRIMARY KEY,admin_id BIGINT,action_type TEXT ${failAudit?"CHECK(action_type='DENIED')":''},target_type TEXT,target_id TEXT,before_data TEXT,after_data TEXT);`);
 return {db,client:{query:(sql,args=[])=>db.query(sql,args)}};
}
async function snapshot(db){
 const result={};for(const name of ['users','user_messages','user_message_rewards','app_meta','admin_logs'])result[name]=(await db.query(`SELECT * FROM ${name} ORDER BY 1`)).rows;return result;
}

test('all active verified roles get one 1500억 message; replay excludes later verifications and preserves wallets',async()=>{
 const {db,client}=await fixture();try{
  const before=await snapshot(db),plan=await inspectChuseokGift(client);
  assert.equal(plan.count,3);assert.deepEqual(plan.roles,{OWNER:1,ADMIN:1,USER:1});assert.equal(plan.rewardAmount,150_000_000_000);assert.equal(plan.title,'추석 떡값');
  const receipt=await sendChuseokGift(client,{expectedRecipientHash:plan.recipientHash});
  assert.equal(receipt.totalAmount,'450000000000');assert.equal(receipt.verification.duplicates,0);
  const after=await snapshot(db);assert.deepEqual(after.users,before.users);assert.equal(after.admin_logs.length,1);
  assert.ok(after.user_messages.every(row=>row.title===TITLE&&row.body===TITLE));
  assert.deepEqual(after.user_message_rewards.map(row=>Number(row.reward_amount)),[AMOUNT,AMOUNT,AMOUNT]);
  await db.exec("INSERT INTO user_second_verifications VALUES(5);UPDATE user_message_rewards SET claimed_at='claimed' WHERE user_id=3");
  const replayBefore=await snapshot(db),replay=await sendChuseokGift(client,{expectedRecipientHash:plan.recipientHash});
  assert.equal(replay.replayed,true);assert.equal(replay.verification.claimed,1);assert.deepEqual(await snapshot(db),replayBefore);
  assert.equal((await verifyChuseokGift(client,receipt)).messages,3);
 }finally{await db.close();}
});

test('dry run and changed recipients leave messages, rewards, wallets and audits unchanged',async()=>{
 const {db,client}=await fixture();try{
  const before=await snapshot(db),plan=await inspectChuseokGift(client);
  assert.equal((await sendChuseokGift(client,{expectedRecipientHash:plan.recipientHash,dryRun:true})).dryRun,true);
  assert.deepEqual(await snapshot(db),before);
  await assert.rejects(()=>sendChuseokGift(client,{expectedRecipientHash:'a'.repeat(64)}),/Recipients changed/);
  assert.deepEqual(await snapshot(db),before);
 }finally{await db.close();}
});

for(const failure of ['failAudit','failReward'])test(`${failure}: entire send rolls back and retry grants exactly once`,async()=>{
 const {db,client}=await fixture({[failure]:true});try{
  const before=await snapshot(db),plan=await inspectChuseokGift(client);
  await assert.rejects(()=>sendChuseokGift(client,{expectedRecipientHash:plan.recipientHash}),/check constraint/);
  assert.deepEqual(await snapshot(db),before);
  await db.exec(failure==='failAudit'?'ALTER TABLE admin_logs DROP CONSTRAINT admin_logs_action_type_check':'ALTER TABLE user_message_rewards DROP CONSTRAINT user_message_rewards_reward_amount_check');
  assert.equal((await sendChuseokGift(client,{expectedRecipientHash:plan.recipientHash})).count,3);
  assert.equal((await sendChuseokGift(client,{expectedRecipientHash:plan.recipientHash})).replayed,true);
 }finally{await db.close();}
});

test('missing completed receipt rolls back the whole send',async()=>{
 const {db,client}=await fixture();try{
  const before=await snapshot(db),plan=await inspectChuseokGift(client);
  const broken={query:(sql,args)=>sql.startsWith('UPDATE app_meta')?Promise.resolve({rows:[]}):client.query(sql,args)};
  await assert.rejects(()=>sendChuseokGift(broken,{expectedRecipientHash:plan.recipientHash}),/Completed receipt missing/);
  assert.deepEqual(await snapshot(db),before);
 }finally{await db.close();}
});

test('lost commit response can retry without another message, reward or audit',async()=>{
 const {db,client}=await fixture();try{
  const plan=await inspectChuseokGift(client);
  const uncertain={async query(sql,args){const result=await client.query(sql,args);if(sql==='COMMIT')throw Error('response lost');return result;}};
  await assert.rejects(()=>sendChuseokGift(uncertain,{expectedRecipientHash:plan.recipientHash}),/response lost/);
  const committed=await snapshot(db);
  const replay=await sendChuseokGift(client,{expectedRecipientHash:plan.recipientHash});
  assert.equal(replay.replayed,true);assert.equal(replay.count,3);assert.deepEqual(await snapshot(db),committed);
 }finally{await db.close();}
});

test('matching gift from another campaign blocks duplicate delivery',async()=>{
 const {db,client}=await fixture();try{
  await db.query("INSERT INTO user_messages(user_id,sender_type,title,body,message_type,campaign_key) VALUES(3,'ADMIN',$1,$1,'COIN_REWARD','other-key')",[TITLE]);
  await db.query("INSERT INTO user_message_rewards(message_id,user_id,reward_type,reward_amount) VALUES(1,3,'COIN',$1)",[AMOUNT]);
  const before=await snapshot(db),plan=await inspectChuseokGift(client);
  await assert.rejects(()=>sendChuseokGift(client,{expectedRecipientHash:plan.recipientHash}),/Matching gift already exists/);
  assert.deepEqual(await snapshot(db),before);
 }finally{await db.close();}
});
