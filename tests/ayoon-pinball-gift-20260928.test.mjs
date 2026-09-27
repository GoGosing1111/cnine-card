import test from 'node:test';
import assert from 'node:assert/strict';
import {PGlite} from '@electric-sql/pglite';
import {inspectPinballGift,sendPinballGift,verifyPinballGift,CAMPAIGN_KEY,ITEM_CODE,TITLE} from '../scripts/ops/ayoon-pinball-gift-20260928.mjs';
const targets=[{id:'2',nickname:'확인하나',soop:'후원하나'},{id:'3',nickname:'확인둘',soop:'후원둘'}];
async function fixture({failAudit=false,failReward=false}={}){
 const db=new PGlite();
 await db.exec(`CREATE TABLE users(id BIGINT PRIMARY KEY,nickname TEXT,role TEXT,status TEXT,coin BIGINT DEFAULT 123);
 INSERT INTO users(id,nickname,role,status) VALUES(1,'운영자','OWNER','ACTIVE'),(2,'확인하나','USER','ACTIVE'),(3,'확인둘','USER','ACTIVE'),(4,'미확인','USER','ACTIVE');
 CREATE TABLE inventory_items(code TEXT PRIMARY KEY,name TEXT,is_active INTEGER);INSERT INTO inventory_items VALUES('TOURNAMENT_GIFT_BOX','대회 사은품',1);
 CREATE TABLE cnine_user_inventory(user_id BIGINT,item_code TEXT,quantity BIGINT);INSERT INTO cnine_user_inventory VALUES(2,'TOURNAMENT_GIFT_BOX',5),(3,'MASTER_STAR',777);
 CREATE TABLE app_meta(key TEXT PRIMARY KEY,value TEXT,updated_at TEXT);
 CREATE TABLE user_messages(id BIGSERIAL PRIMARY KEY,user_id BIGINT NOT NULL,sender_type TEXT,title TEXT,body TEXT,message_type TEXT,campaign_key TEXT,is_read INTEGER DEFAULT 0,hidden_at TEXT,UNIQUE(user_id,campaign_key));
 CREATE TABLE user_message_rewards(id BIGSERIAL PRIMARY KEY,message_id BIGINT UNIQUE,user_id BIGINT ${failReward?'CHECK(user_id<>3)':''},reward_type TEXT,reward_amount BIGINT,claimed_at TEXT);
 CREATE TABLE admin_logs(id BIGSERIAL PRIMARY KEY,admin_id BIGINT,action_type TEXT ${failAudit?"CHECK(action_type='DENIED')":''},target_type TEXT,target_id TEXT,before_data TEXT,after_data TEXT);`);
 return {db,client:{query:(sql,args=[])=>db.query(sql,args)}};
}
async function snapshot(db){const result={};for(const table of ['users','inventory_items','cnine_user_inventory','user_messages','user_message_rewards','app_meta','admin_logs'])result[table]=(await db.query(`SELECT * FROM ${table} ORDER BY 1`)).rows;return result}
test('only confirmed recipients get one attached box with exact text; replay does not resend',async()=>{
 const {db,client}=await fixture();try{
  const before=await snapshot(db),plan=await inspectPinballGift(client,targets),receipt=await sendPinballGift(client,targets,{expectedRecipientHash:plan.recipientHash}),after=await snapshot(db);
  assert.equal(receipt.verification.messages,2);assert.equal(receipt.verification.duplicates,0);
  for(const row of after.user_messages){assert.equal(row.title,TITLE);assert.equal(row.body,TITLE);assert.ok(['2','3'].includes(String(row.user_id)))}
  for(const row of after.user_message_rewards){assert.equal(row.reward_type,ITEM_CODE);assert.equal(Number(row.reward_amount),1);assert.equal(row.claimed_at,null)}
  for(const table of ['users','cnine_user_inventory','inventory_items'])assert.deepEqual(after[table],before[table]);
  await db.exec("UPDATE user_message_rewards SET claimed_at='claimed' WHERE user_id=2");const replayBefore=await snapshot(db);
  const replay=await sendPinballGift(client,targets,{expectedRecipientHash:plan.recipientHash});assert.equal(replay.replayed,true);assert.equal(replay.verification.claimed,1);assert.deepEqual(await snapshot(db),replayBefore);
  assert.equal((await verifyPinballGift(client,receipt)).missing,0);
 }finally{await db.close()}
});
for(const failure of ['failAudit','failReward'])test(`${failure}: messages, rewards and receipt roll back together`,async()=>{
 const {db,client}=await fixture({[failure]:true});try{const before=await snapshot(db),plan=await inspectPinballGift(client,targets);await assert.rejects(()=>sendPinballGift(client,targets,{expectedRecipientHash:plan.recipientHash}),/check constraint/);assert.deepEqual(await snapshot(db),before)}finally{await db.close()}
});
test('dry run, recipient changes and duplicate recipients never mutate data',async()=>{
 const {db,client}=await fixture();try{
  const before=await snapshot(db),plan=await inspectPinballGift(client,targets);
  assert.equal((await sendPinballGift(client,targets,{expectedRecipientHash:plan.recipientHash,dryRun:true})).dryRun,true);assert.deepEqual(await snapshot(db),before);
  await assert.rejects(()=>sendPinballGift(client,[...targets,targets[0]],{expectedRecipientHash:plan.recipientHash}),/Duplicate/);
  await db.exec("UPDATE users SET nickname='다른이름' WHERE id=2");const changed=await snapshot(db);
  await assert.rejects(()=>sendPinballGift(client,targets,{expectedRecipientHash:plan.recipientHash}),/Recipient nickname changed/);assert.deepEqual(await snapshot(db),changed);
 }finally{await db.close()}
});
test('commit response loss recovers without another message or audit',async()=>{
 const {db,client}=await fixture();try{
  const plan=await inspectPinballGift(client,targets),uncertain={async query(sql,args){const result=await client.query(sql,args);if(sql==='COMMIT')throw Error('response lost');return result}};
  await assert.rejects(()=>sendPinballGift(uncertain,targets,{expectedRecipientHash:plan.recipientHash}),/response lost/);
  const before=await snapshot(db);assert.equal((await sendPinballGift(client,targets,{expectedRecipientHash:plan.recipientHash})).replayed,true);assert.deepEqual(await snapshot(db),before);
 }finally{await db.close()}
});
test('the same funding gift under another operation cannot duplicate a recipient',async()=>{
 const {db,client}=await fixture();try{
  const plan=await inspectPinballGift(client,targets);await sendPinballGift(client,targets,{expectedRecipientHash:plan.recipientHash});
  const subset=[targets[0]],next=await inspectPinballGift(client,subset),before=await snapshot(db);
  await assert.rejects(()=>sendPinballGift(client,subset,{expectedRecipientHash:next.recipientHash}),/already sent/);assert.deepEqual(await snapshot(db),before);
  assert.equal((await db.query('SELECT COUNT(*)::int n FROM user_messages WHERE campaign_key=$1',[CAMPAIGN_KEY])).rows[0].n,2);
 }finally{await db.close()}
});
test('partial reward/completion writes are rejected and fully rolled back',async()=>{
 const {db,client}=await fixture();try{
  const before=await snapshot(db),plan=await inspectPinballGift(client,targets);
  for(const prefix of ['INSERT INTO user_message_rewards','UPDATE app_meta']){
   const broken={query:(sql,args)=>sql.startsWith(prefix)?Promise.resolve({rows:[]}):client.query(sql,args)};
   await assert.rejects(()=>sendPinballGift(broken,targets,{expectedRecipientHash:plan.recipientHash}),/Partial reward insert|Missing completed receipt/);assert.deepEqual(await snapshot(db),before);
  }
 }finally{await db.close()}
});

// Prior funding mail stays intact: one extra box for this event, regardless of claims.
test('previous funding recipients receive one additional box; replay preserves both deliveries',async()=>{
 const {db,client}=await fixture();try{
  await db.exec("INSERT INTO user_messages(user_id,sender_type,title,body,message_type,campaign_key) VALUES(2,'ADMIN','대회 펀딩 사은품','대회 펀딩 사은품','ITEM_REWARD','tournament-funding-gift-20260927-v1'); INSERT INTO user_message_rewards(message_id,user_id,reward_type,reward_amount,claimed_at) VALUES(1,2,'TOURNAMENT_GIFT_BOX',1,'already claimed')");
  const previous=(await db.query('SELECT * FROM user_messages WHERE id=1')).rows;
  const plan=await inspectPinballGift(client,targets);assert.equal(plan.existing.length,0);
  await sendPinballGift(client,targets,{expectedRecipientHash:plan.recipientHash});
  assert.deepEqual((await db.query('SELECT * FROM user_messages WHERE id=1')).rows,previous);
  assert.equal((await db.query('SELECT count(*)::int n FROM user_messages WHERE user_id=2')).rows[0].n,2);
  assert.equal((await db.query('SELECT count(*)::int n FROM user_messages WHERE user_id=3')).rows[0].n,1);
  const after=await snapshot(db);const replay=await sendPinballGift(client,targets,{expectedRecipientHash:plan.recipientHash});assert.equal(replay.replayed,true);assert.deepEqual(await snapshot(db),after);
 }finally{await db.close()}
});
