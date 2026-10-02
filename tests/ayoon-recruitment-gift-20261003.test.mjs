import test from 'node:test';
import assert from 'node:assert/strict';
import {PGlite} from '@electric-sql/pglite';
import {TARGETS,HELD,DUPLICATES,PLAN_HASH,OPERATION_KEY,CAMPAIGN_KEY,ITEM_CODE,TITLE,inspect,send,verify} from '../scripts/ops/ayoon-recruitment-gift-20261003.mjs';

async function fixture(){
 const db=new PGlite();await db.exec(`
  CREATE TABLE users(id BIGINT PRIMARY KEY,nickname TEXT,role TEXT,status TEXT,coin BIGINT DEFAULT 123);
  INSERT INTO users(id,nickname,role,status) VALUES(1,'운영자','OWNER','ACTIVE');
  CREATE TABLE user_second_verifications(user_id BIGINT PRIMARY KEY,provider TEXT,provider_user_id TEXT);
  CREATE TABLE inventory_items(code TEXT PRIMARY KEY,name TEXT,is_active INTEGER);
  CREATE TABLE cnine_user_inventory(user_id BIGINT,item_code TEXT,quantity BIGINT);
  CREATE TABLE inventory_logs(user_id BIGINT,item_code TEXT,change_amount BIGINT,reference_id TEXT);
  CREATE TABLE app_meta(key TEXT PRIMARY KEY,value TEXT,updated_at TEXT);
  CREATE TABLE user_messages(id BIGSERIAL PRIMARY KEY,user_id BIGINT NOT NULL,sender_type TEXT,title TEXT,body TEXT,message_type TEXT,campaign_key TEXT,is_read INTEGER DEFAULT 0,hidden_at TEXT);
  CREATE UNIQUE INDEX idx_user_messages_campaign_user_v1276 ON user_messages(user_id,campaign_key) WHERE campaign_key IS NOT NULL AND trim(campaign_key)<>'';
  CREATE TABLE user_message_rewards(id BIGSERIAL PRIMARY KEY,message_id BIGINT UNIQUE,user_id BIGINT,reward_type TEXT,reward_amount BIGINT,claimed_at TEXT);
  CREATE TABLE admin_logs(id BIGSERIAL PRIMARY KEY,admin_id BIGINT,action_type TEXT,target_type TEXT,target_id TEXT,before_data TEXT,after_data TEXT);
 `);
 await db.query('INSERT INTO inventory_items VALUES($1,$2,1)',[ITEM_CODE,'영입전 사은품']);
 for(const row of TARGETS){
  await db.query("INSERT INTO users(id,nickname,role,status) VALUES($1,$2,$3,'ACTIVE')",[row.id,row.nickname,row.role]);
  await db.query("INSERT INTO user_second_verifications VALUES($1,'PLAYDK',$2)",[row.id,row.playdkId]);
  await db.query('INSERT INTO cnine_user_inventory VALUES($1,$2,5)',[row.id,ITEM_CODE]);
  await db.query('INSERT INTO inventory_logs VALUES($1,$2,5,$3)',[row.id,ITEM_CODE,'older-unrelated-room']);
  await db.query("INSERT INTO user_messages(user_id,sender_type,title,body,message_type,campaign_key,is_read,hidden_at) VALUES($1,'ADMIN','과거 행사','과거 행사','ITEM_REWARD','older-unrelated-room',1,'hidden')",[row.id]);
  await db.query("INSERT INTO app_meta(key,value) VALUES($1,'old global marker')",['ops:recruitment-gift-once:user:'+row.id+':v1']);
 }
 return {db,client:{query:(sql,args=[])=>db.query(sql,args)}};
}
async function snapshot(db){const result={};for(const table of ['users','user_second_verifications','inventory_items','cnine_user_inventory','inventory_logs','user_messages','user_message_rewards','app_meta','admin_logs'])result[table]=(await db.query(`SELECT * FROM ${table} ORDER BY 1`)).rows;return result;}

test('new Ayoon campaign pays one box to each of 56 accounts despite past grants and caps repeated source names',async()=>{
 const {db,client}=await fixture();try{
  assert.deepEqual(HELD.map(row=>row.source),['이슈린.','『인연』','족찌미♡']);assert.equal(DUPLICATES[0].id,'4772');
  assert.equal(TARGETS.find(row=>row.id==='4772').sourceRows.length,2);assert.equal(TARGETS.find(row=>row.nickname==='족구선생').quantity,1);
  const before=await snapshot(db),inspected=await inspect(client);assert.equal(inspected.count,56);
  const sent=await send(client,TARGETS,{expectedPlanHash:PLAN_HASH}),checked=await verify(client,sent.receipt,{unclaimed:true});
  assert.equal(checked.boxes,56);assert.equal(checked.missing,0);assert.equal(checked.duplicates,0);assert.ok(checked.rows.every(row=>row.reward_amount==='1'&&row.title===TITLE));
  const after=await snapshot(db);for(const table of ['users','user_second_verifications','inventory_items','cnine_user_inventory','inventory_logs'])assert.deepEqual(after[table],before[table]);
  assert.deepEqual(after.user_messages.filter(row=>row.campaign_key==='older-unrelated-room'),before.user_messages);
  assert.deepEqual(after.app_meta.filter(row=>row.key.startsWith('ops:recruitment-gift-once:')),before.app_meta);
  await assert.rejects(db.query('INSERT INTO user_messages(user_id,campaign_key) VALUES($1,$2)',[TARGETS[0].id,CAMPAIGN_KEY]),/duplicate key/);
 }finally{await db.close();}
});

test('dry-run, quantity over one, duplicate IDs, wrong hash and identity changes cannot send gifts',async()=>{
 const {db,client}=await fixture();try{
  const before=await snapshot(db),dry=await send(client,TARGETS,{expectedPlanHash:PLAN_HASH,dryRun:true});assert.equal(dry.dryRun,true);assert.deepEqual(await snapshot(db),before);
  for(const rows of [TARGETS.slice(1),[...TARGETS,TARGETS[0]],TARGETS.map((row,i)=>i===0?{...row,quantity:2}:row)])await assert.rejects(send(client,rows,{expectedPlanHash:PLAN_HASH}),/reviewed recipients/);
  await assert.rejects(send(client,TARGETS,{expectedPlanHash:'wrong'}),/plan hash/);assert.deepEqual(await snapshot(db),before);
  await db.query('UPDATE user_second_verifications SET provider_user_id=$1 WHERE user_id=$2',['wrong',TARGETS[0].id]);const changed=await snapshot(db);
  await assert.rejects(send(client,TARGETS,{expectedPlanHash:PLAN_HASH}),/identity changed/);assert.deepEqual(await snapshot(db),changed);
 }finally{await db.close();}
});

test('message, attachment, campaign marker, audit and receipt failures roll the entire campaign back',async()=>{
 const {db,client}=await fixture();try{
  const before=await snapshot(db);
  for(const prefix of ['INSERT INTO user_messages','INSERT INTO user_message_rewards','INSERT INTO app_meta(key,value,updated_at) SELECT','INSERT INTO admin_logs','UPDATE app_meta']){
   const broken={query:(sql,args)=>sql.startsWith(prefix)?Promise.resolve({rows:[]}):client.query(sql,args)};
   await assert.rejects(send(broken,TARGETS,{expectedPlanHash:PLAN_HASH}),/Partial message|Partial reward|Partial campaign marker|Missing audit|Missing completed receipt/);
   assert.deepEqual(await snapshot(db),before);
  }
 }finally{await db.close();}
});

test('lost COMMIT response and claimed-message retries return the same campaign without extra boxes',async()=>{
 const {db,client}=await fixture();try{
  const uncertain={async query(sql,args){const result=await client.query(sql,args);if(sql==='COMMIT')throw Error('commit response lost');return result;}};
  await assert.rejects(send(uncertain,TARGETS,{expectedPlanHash:PLAN_HASH}),/commit response lost/);
  await db.query("UPDATE user_message_rewards SET claimed_at='claimed' WHERE user_id=$1",[TARGETS[0].id]);
  const before=await snapshot(db),replay=await send(client,TARGETS,{expectedPlanHash:PLAN_HASH});assert.equal(replay.replayed,true);assert.equal(replay.verification.claimed,1);assert.deepEqual(await snapshot(db),before);
  await db.query('UPDATE app_meta SET value=$2 WHERE key=$1',[OPERATION_KEY,JSON.stringify({status:'PENDING'})]);const broken=await snapshot(db);
  await assert.rejects(send(client,TARGETS,{expectedPlanHash:PLAN_HASH}));assert.deepEqual(await snapshot(db),broken);
 }finally{await db.close();}
});
