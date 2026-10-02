import test from 'node:test';
import assert from 'node:assert/strict';
import {PGlite} from '@electric-sql/pglite';
import {TARGETS,RECIPIENT_HASH,OPERATION_KEY,CAMPAIGN_KEY,ITEM_CODE,TITLE,bodyFor,inspectSupplement,sendSupplement,verifySupplement} from '../scripts/ops/pingdu-thanks-supplement-20261002.mjs';
const originalCampaign='pingdu-thanks-ppanghun-20261002-v1';
async function fixture(){
 const db=new PGlite();await db.exec(`
  CREATE TABLE users(id BIGINT PRIMARY KEY,nickname TEXT,role TEXT,status TEXT,coin BIGINT DEFAULT 123);
  INSERT INTO users(id,nickname,role,status) VALUES(1,'운영자','OWNER','ACTIVE');
  CREATE TABLE user_second_verifications(user_id BIGINT PRIMARY KEY,provider TEXT,provider_user_id TEXT);
  CREATE TABLE inventory_items(code TEXT PRIMARY KEY,name TEXT,is_active INTEGER);
  CREATE TABLE cnine_user_inventory(user_id BIGINT,item_code TEXT,quantity BIGINT);
  CREATE TABLE inventory_logs(user_id BIGINT,item_code TEXT,change_amount BIGINT,reference_id TEXT);
  CREATE TABLE app_meta(key TEXT PRIMARY KEY,value TEXT,updated_at TEXT);
  CREATE TABLE user_messages(id BIGSERIAL PRIMARY KEY,user_id BIGINT NOT NULL,sender_type TEXT,title TEXT,body TEXT,message_type TEXT,campaign_key TEXT,is_read INTEGER DEFAULT 0,hidden_at TEXT,UNIQUE(user_id,campaign_key));
  CREATE TABLE user_message_rewards(id BIGSERIAL PRIMARY KEY,message_id BIGINT UNIQUE,user_id BIGINT,reward_type TEXT,reward_amount BIGINT,claimed_at TEXT);
  CREATE TABLE admin_logs(id BIGSERIAL PRIMARY KEY,admin_id BIGINT,action_type TEXT,target_type TEXT,target_id TEXT,before_data TEXT,after_data TEXT);
 `);
 await db.query('INSERT INTO inventory_items VALUES($1,$2,1)',[ITEM_CODE,TITLE]);
 for(const row of TARGETS){
  await db.query("INSERT INTO users(id,nickname,role,status) VALUES($1,$2,'USER','ACTIVE')",[row.id,row.nickname]);
  await db.query("INSERT INTO user_second_verifications VALUES($1,'PLAYDK',$2)",[row.id,row.playdkId]);
  await db.query('INSERT INTO cnine_user_inventory VALUES($1,$2,0)',[row.id,ITEM_CODE]);
  for(const message of row.priorMessages){
   await db.query("INSERT INTO user_messages(id,user_id,sender_type,title,body,message_type,campaign_key,is_read,hidden_at) VALUES($1,$2,'ADMIN',$3,'기존 지급','ITEM_REWARD',$4,1,'hidden')",[message.id,row.id,TITLE,originalCampaign]);
   await db.query("INSERT INTO user_message_rewards(message_id,user_id,reward_type,reward_amount,claimed_at) VALUES($1,$2,$3,$4,'claimed')",[message.id,row.id,ITEM_CODE,message.amount]);
   await db.query('INSERT INTO inventory_logs VALUES($1,$2,$3,$4)',[row.id,ITEM_CODE,message.amount,message.id]);
  }
 }
 await db.query("SELECT setval(pg_get_serial_sequence('user_messages','id'),200000)");
 return {db,client:{query:(sql,args=[])=>db.query(sql,args)}};
}
async function snapshot(db){const result={};for(const name of ['users','user_second_verifications','inventory_items','cnine_user_inventory','inventory_logs','user_messages','user_message_rewards','app_meta','admin_logs'])result[name]=(await db.query(`SELECT * FROM ${name} ORDER BY 1`)).rows;return result;}

test('explicit additional quantities pay all seven, including the already paid Oraenman, exactly once',async()=>{
 const {db,client}=await fixture();try{
  const before=await snapshot(db),plan=await inspectSupplement(client);assert.equal(plan.boxes,9);assert.equal(plan.priorBoxes,8);
  const sent=await sendSupplement(client,TARGETS,{expectedRecipientHash:RECIPIENT_HASH});const result=await verifySupplement(client,sent.receipt,{unclaimed:true});
  assert.equal(result.messages,7);assert.equal(result.boxes,9);assert.equal(result.missing,0);assert.equal(result.duplicates,0);
  assert.equal(result.rows.find(row=>row.user_id==='1255').reward_amount,'3');assert.equal(result.rows.find(row=>row.user_id==='4609').reward_amount,'1');
  for(const row of result.rows){assert.equal(row.body,bodyFor(TARGETS.find(target=>target.id===row.user_id).quantity));}
  const after=await snapshot(db);for(const name of ['users','cnine_user_inventory','inventory_logs','inventory_items'])assert.deepEqual(after[name],before[name]);
  assert.deepEqual(after.user_messages.filter(row=>row.campaign_key===originalCampaign),before.user_messages);
  await db.query("UPDATE user_message_rewards SET claimed_at='claimed' WHERE user_id=236 AND message_id IN(SELECT id FROM user_messages WHERE campaign_key=$1)",[CAMPAIGN_KEY]);
  const replayBefore=await snapshot(db),replay=await sendSupplement(client,TARGETS,{expectedRecipientHash:RECIPIENT_HASH});assert.equal(replay.replayed,true);assert.equal(replay.verification.claimed,1);assert.deepEqual(await snapshot(db),replayBefore);
 }finally{await db.close();}
});

test('dry run, invalid amounts, changed account identities and changed prior deliveries cannot mutate data',async()=>{
 const {db,client}=await fixture();try{
  const before=await snapshot(db);const dry=await sendSupplement(client,TARGETS,{expectedRecipientHash:RECIPIENT_HASH,dryRun:true});assert.equal(dry.dryRun,true);assert.deepEqual(await snapshot(db),before);
  for(const targets of [TARGETS.slice(1),[...TARGETS,TARGETS[0]],TARGETS.map(row=>row.id==='4609'?{...row,quantity:0}:row)])await assert.rejects(sendSupplement(client,targets,{expectedRecipientHash:RECIPIENT_HASH}),/explicitly authorized/);
  await assert.rejects(sendSupplement(client,TARGETS,{expectedRecipientHash:'wrong'}),/Reviewed recipient hash/);
  await db.query("UPDATE user_second_verifications SET provider_user_id='changed' WHERE user_id=236");const changed=await snapshot(db);await assert.rejects(sendSupplement(client,TARGETS,{expectedRecipientHash:RECIPIENT_HASH}),/identity changed/);assert.deepEqual(await snapshot(db),changed);
  await db.query('UPDATE user_second_verifications SET provider_user_id=$1 WHERE user_id=236',[TARGETS.find(row=>row.id==='236').playdkId]);
  await db.query('UPDATE user_message_rewards SET reward_amount=5 WHERE message_id=178253');const extra=await snapshot(db);await assert.rejects(sendSupplement(client,TARGETS,{expectedRecipientHash:RECIPIENT_HASH}),/Prior gift deliveries changed/);assert.deepEqual(await snapshot(db),extra);
 }finally{await db.close();}
});

test('partial message, reward, audit and receipt writes roll the entire supplement back',async()=>{
 const {db,client}=await fixture();try{
  const before=await snapshot(db);
  for(const prefix of ['INSERT INTO user_messages','INSERT INTO user_message_rewards','INSERT INTO admin_logs','UPDATE app_meta']){
   const broken={query:(sql,args)=>sql.startsWith(prefix)?Promise.resolve({rows:[]}):client.query(sql,args)};
   await assert.rejects(sendSupplement(broken,TARGETS,{expectedRecipientHash:RECIPIENT_HASH}),/Partial message insert|Partial reward insert|Missing audit|Missing completed receipt/);assert.deepEqual(await snapshot(db),before);
  }
 }finally{await db.close();}
});

test('a lost COMMIT acknowledgement returns the same completed supplement on retry',async()=>{
 const {db,client}=await fixture();try{
  const uncertain={async query(sql,args){const result=await client.query(sql,args);if(sql==='COMMIT')throw Error('commit response lost');return result;}};
  await assert.rejects(sendSupplement(uncertain,TARGETS,{expectedRecipientHash:RECIPIENT_HASH}),/commit response lost/);
  const before=await snapshot(db),replay=await sendSupplement(client,TARGETS,{expectedRecipientHash:RECIPIENT_HASH});assert.equal(replay.replayed,true);assert.deepEqual(await snapshot(db),before);
 }finally{await db.close();}
});

test('unknown direct grants and broken completed receipts stop a new or repeated payout',async()=>{
 const {db,client}=await fixture();try{
  await db.query('INSERT INTO inventory_logs VALUES(236,$1,1,$2)',[ITEM_CODE,'unknown-admin-grant']);const before=await snapshot(db);
  await assert.rejects(sendSupplement(client,TARGETS,{expectedRecipientHash:RECIPIENT_HASH}),/Unexpected direct gift grant/);assert.deepEqual(await snapshot(db),before);
  await db.query('DELETE FROM inventory_logs WHERE reference_id=$1',['unknown-admin-grant']);
  await sendSupplement(client,TARGETS,{expectedRecipientHash:RECIPIENT_HASH});await db.query('UPDATE app_meta SET value=$2 WHERE key=$1',[OPERATION_KEY,JSON.stringify({status:'PENDING'})]);const broken=await snapshot(db);
  await assert.rejects(sendSupplement(client,TARGETS,{expectedRecipientHash:RECIPIENT_HASH}));assert.deepEqual(await snapshot(db),broken);
 }finally{await db.close();}
});
