import test from 'node:test';
import assert from 'node:assert/strict';
import {PGlite} from '@electric-sql/pglite';
import {inspectTournamentGift,sendTournamentGift,verifyTournamentGift,GIFTS,TITLE,OPERATION_KEY} from '../scripts/ops/tournament-celebration-gift-20260926.mjs';

async function fixture({failAudit=false,failStar=false}={}){
 const db=new PGlite();
 await db.exec(`CREATE TABLE users(id BIGINT PRIMARY KEY,role TEXT,status TEXT,coin BIGINT DEFAULT 123);
 INSERT INTO users(id,role,status) VALUES(1,'OWNER','ACTIVE'),(2,'ADMIN','ACTIVE'),(3,'USER','ACTIVE'),(4,'USER','BANNED'),(5,'USER','ACTIVE');
 CREATE TABLE user_second_verifications(user_id BIGINT PRIMARY KEY);
 INSERT INTO user_second_verifications VALUES(1),(2),(3),(4);
 CREATE TABLE cnine_user_inventory(user_id BIGINT,item_code TEXT,quantity BIGINT);INSERT INTO cnine_user_inventory VALUES(3,'MASTER_STAR',777);
 CREATE TABLE app_meta(key TEXT PRIMARY KEY,value TEXT,updated_at TEXT);
 CREATE TABLE user_messages(id BIGSERIAL PRIMARY KEY,user_id BIGINT NOT NULL,sender_type TEXT,title TEXT,body TEXT,message_type TEXT,campaign_key TEXT,is_read INTEGER DEFAULT 0,hidden_at TEXT,UNIQUE(user_id,campaign_key));
 CREATE TABLE user_message_rewards(id BIGSERIAL PRIMARY KEY,message_id BIGINT UNIQUE,user_id BIGINT,reward_type TEXT ${failStar?"CHECK(reward_type<>'MASTER_STAR')":''},reward_amount BIGINT,claimed_at TEXT);
 CREATE TABLE admin_logs(id BIGSERIAL PRIMARY KEY,admin_id BIGINT,action_type TEXT ${failAudit?"CHECK(action_type='DENIED')":''},target_type TEXT,target_id TEXT,before_data TEXT,after_data TEXT);`);
 return {db,client:{query:(sql,args=[])=>db.query(sql,args)}};
}
async function snapshot(db){
 const result={};for(const name of ['users','cnine_user_inventory','user_messages','user_message_rewards','app_meta','admin_logs'])result[name]=(await db.query(`SELECT * FROM ${name} ORDER BY 1`)).rows;return result;
}

test('all active verified roles receive both exact gifts, frozen replay never resends or changes balances',async()=>{
 const {db,client}=await fixture();try{
  const before=await snapshot(db),plan=await inspectTournamentGift(client);
  assert.equal(plan.count,3);assert.deepEqual(plan.roles,{OWNER:1,ADMIN:1,USER:1});
  assert.deepEqual(plan.gifts.map(g=>[g.rewardType,g.rewardAmount,g.totalAmount]),[['COIN',150_000_000_000,'450000000000'],['MASTER_STAR',1_500_000,'4500000']]);
  const receipt=await sendTournamentGift(client,{expectedRecipientHash:plan.recipientHash});
  assert.equal(receipt.title,'대회 성황리 기념');assert.equal(receipt.verification.messages,6);
  const after=await snapshot(db);assert.deepEqual(after.users,before.users);assert.deepEqual(after.cnine_user_inventory,before.cnine_user_inventory);
  assert.equal(after.admin_logs.length,1);assert.ok(after.user_messages.every(row=>row.title===TITLE&&row.body===TITLE));
  assert.equal((await verifyTournamentGift(client,receipt)).duplicates,0);
  await db.exec("INSERT INTO user_second_verifications VALUES(5);UPDATE user_message_rewards SET claimed_at='claimed' WHERE user_id=3");
  const replayBefore=await snapshot(db),replay=await sendTournamentGift(client,{expectedRecipientHash:plan.recipientHash});
  assert.equal(replay.replayed,true);assert.deepEqual(replay.verification.campaigns.map(c=>c.claimed),[1,1]);
  assert.deepEqual(await snapshot(db),replayBefore);
 }finally{await db.close();}
});

test('dry run and changed target snapshot leave all messages, rewards, balances and audits unchanged',async()=>{
 const {db,client}=await fixture();try{
  const before=await snapshot(db),plan=await inspectTournamentGift(client);
  assert.equal((await sendTournamentGift(client,{expectedRecipientHash:plan.recipientHash,dryRun:true})).dryRun,true);
  assert.deepEqual(await snapshot(db),before);
  await db.exec('INSERT INTO user_second_verifications VALUES(5)');
  await assert.rejects(()=>sendTournamentGift(client,{expectedRecipientHash:plan.recipientHash}),/Recipients changed/);
  assert.deepEqual(await snapshot(db),before);
 }finally{await db.close();}
});

for(const failure of ['failAudit','failStar'])test(`${failure}: both campaigns roll back, then retry sends each once`,async()=>{
 const {db,client}=await fixture({[failure]:true});try{
  const before=await snapshot(db),plan=await inspectTournamentGift(client);
  await assert.rejects(()=>sendTournamentGift(client,{expectedRecipientHash:plan.recipientHash}),/check constraint/);
  assert.deepEqual(await snapshot(db),before);
  await db.exec(failure==='failAudit'?'ALTER TABLE admin_logs DROP CONSTRAINT admin_logs_action_type_check':'ALTER TABLE user_message_rewards DROP CONSTRAINT user_message_rewards_reward_type_check');
  assert.equal((await sendTournamentGift(client,{expectedRecipientHash:plan.recipientHash})).verification.messages,6);
  assert.equal((await sendTournamentGift(client,{expectedRecipientHash:plan.recipientHash})).replayed,true);
 }finally{await db.close();}
});

test('missing completion receipt or partial reward insertion rolls back both gifts',async()=>{
 const {db,client}=await fixture();try{
  const before=await snapshot(db),plan=await inspectTournamentGift(client);
  for(const prefix of ['UPDATE app_meta','INSERT INTO user_message_rewards']){
   const broken={query:(sql,args)=>sql.startsWith(prefix)?Promise.resolve({rows:[]}):client.query(sql,args)};
   await assert.rejects(()=>sendTournamentGift(broken,{expectedRecipientHash:plan.recipientHash}),/Completed receipt missing|Partial reward insert/);
   assert.deepEqual(await snapshot(db),before);
  }
 }finally{await db.close();}
});

test('lost commit response replays the same operation without another message, reward or audit',async()=>{
 const {db,client}=await fixture();try{
  const plan=await inspectTournamentGift(client);
  const uncertain={async query(sql,args){const result=await client.query(sql,args);if(sql==='COMMIT')throw Error('response lost');return result;}};
  await assert.rejects(()=>sendTournamentGift(uncertain,{expectedRecipientHash:plan.recipientHash}),/response lost/);
  const committed=await snapshot(db),replay=await sendTournamentGift(client,{expectedRecipientHash:plan.recipientHash});
  assert.equal(replay.replayed,true);assert.equal(replay.operationKey,OPERATION_KEY);assert.equal(replay.verification.messages,6);
  assert.deepEqual(await snapshot(db),committed);
 }finally{await db.close();}
});

test('either gift sent with another key prevents issuing a duplicate bundle',async()=>{
 const {db,client}=await fixture();try{
  await db.query("INSERT INTO user_messages(user_id,sender_type,title,body,message_type,campaign_key) VALUES(3,'ADMIN',$1,$1,'ITEM_REWARD','other-key')",[TITLE]);
  await db.query("INSERT INTO user_message_rewards(message_id,user_id,reward_type,reward_amount) VALUES(1,3,'MASTER_STAR',$1)",[GIFTS[1].rewardAmount]);
  const before=await snapshot(db),plan=await inspectTournamentGift(client);
  await assert.rejects(()=>sendTournamentGift(client,{expectedRecipientHash:plan.recipientHash}),/Matching gift exists/);
  assert.deepEqual(await snapshot(db),before);
 }finally{await db.close();}
});
