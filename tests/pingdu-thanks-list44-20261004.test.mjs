import test from 'node:test';
import assert from 'node:assert/strict';
import {PGlite} from '@electric-sql/pglite';
import {TARGETS,CAMPAIGN_KEY,ITEM_CODE,TITLE,inspectList44Gift,sendList44Gift,verifyList44Gift} from '../scripts/ops/pingdu-thanks-list44-20261004.mjs';
async function fixture(){
 const db=new PGlite();await db.exec(`
 CREATE TABLE users(id BIGINT PRIMARY KEY,nickname TEXT,role TEXT,status TEXT,coin BIGINT DEFAULT 321);
 INSERT INTO users VALUES(1,'운영자','OWNER','ACTIVE',321);
 CREATE TABLE inventory_items(code TEXT PRIMARY KEY,name TEXT,is_active INTEGER);
 CREATE TABLE cnine_user_inventory(user_id BIGINT,item_code TEXT,quantity BIGINT);
 CREATE TABLE inventory_logs(user_id BIGINT,item_code TEXT,change_amount BIGINT);
 CREATE TABLE app_meta(key TEXT PRIMARY KEY,value TEXT,updated_at TEXT);
 CREATE TABLE user_messages(id BIGSERIAL PRIMARY KEY,user_id BIGINT NOT NULL,sender_type TEXT,title TEXT,body TEXT,message_type TEXT,campaign_key TEXT,is_read INTEGER DEFAULT 0,hidden_at TEXT,UNIQUE(user_id,campaign_key));
 CREATE TABLE user_message_rewards(id BIGSERIAL PRIMARY KEY,message_id BIGINT UNIQUE,user_id BIGINT,reward_type TEXT,reward_amount BIGINT,claimed_at TEXT);
 CREATE TABLE admin_logs(id BIGSERIAL PRIMARY KEY,admin_id BIGINT,action_type TEXT,target_type TEXT,target_id TEXT,before_data TEXT,after_data TEXT);
 `);
 await db.query('INSERT INTO inventory_items VALUES($1,$2,1)',[ITEM_CODE,'핑두의 감사 선물']);
 for(const row of TARGETS){
  await db.query("INSERT INTO users(id,nickname,role,status) VALUES($1,$2,'USER','ACTIVE')",[row.id,row.nickname]);
  await db.query('INSERT INTO cnine_user_inventory VALUES($1,$2,7)',[row.id,ITEM_CODE]);
 }
 // A prior campaign remains untouched and does not exclude this new reward.
 const old=(await db.query("INSERT INTO user_messages(user_id,sender_type,title,body,message_type,campaign_key) VALUES($1,'ADMIN',$2,$2,'ITEM_REWARD','prior-campaign') RETURNING id",[TARGETS[0].id,TITLE])).rows[0];
 await db.query("INSERT INTO user_message_rewards(message_id,user_id,reward_type,reward_amount,claimed_at) VALUES($1,$2,$3,1,'previously-claimed')",[old.id,TARGETS[0].id,ITEM_CODE]);
 const client={query:(sql,args=[])=>db.query(sql,args)};
 return {db,client};
}
async function snapshot(db){const out={};for(const name of ['users','inventory_items','cnine_user_inventory','inventory_logs','app_meta','user_messages','user_message_rewards','admin_logs'])out[name]=(await db.query('SELECT * FROM '+name+' ORDER BY 1')).rows;return out;}

test('authorized accounts receive one message reward each; prior gifts and balances remain unchanged; replay after claim is idempotent',async()=>{
 const {db,client}=await fixture();try{
  const before=await snapshot(db),plan=await inspectList44Gift(client);
  const sent=await sendList44Gift(client,TARGETS,{expectedRecipientHash:plan.recipientHash});
  const checked=await verifyList44Gift(client,sent.receipt,{unclaimed:true});
  assert.equal(checked.messages,TARGETS.length);assert.equal(checked.boxes,TARGETS.length);assert.equal(checked.missing,0);assert.equal(checked.duplicates,0);
  const after=await snapshot(db);
  for(const name of ['users','inventory_items','cnine_user_inventory','inventory_logs'])assert.deepEqual(after[name],before[name]);
  assert.deepEqual(after.user_messages.filter(row=>row.campaign_key==='prior-campaign'),before.user_messages);
  assert.deepEqual(after.user_message_rewards.filter(row=>row.claimed_at==='previously-claimed'),before.user_message_rewards);
  await db.query("UPDATE user_message_rewards SET claimed_at='claimed' WHERE message_id=$1",[checked.rows[0].message_id]);
  const replayBefore=await snapshot(db),replay=await sendList44Gift(client,TARGETS,{expectedRecipientHash:plan.recipientHash});
  assert.equal(replay.replayed,true);assert.equal(replay.verification.claimed,1);assert.deepEqual(await snapshot(db),replayBefore);
 }finally{await db.close();}
});

test('dry-run and partial message, reward, audit or receipt failures roll back every write',async()=>{
 const {db,client}=await fixture();try{
  const before=await snapshot(db),plan=await inspectList44Gift(client);
  await sendList44Gift(client,TARGETS,{expectedRecipientHash:plan.recipientHash,dryRun:true});assert.deepEqual(await snapshot(db),before);
  await assert.rejects(sendList44Gift(client,TARGETS,{expectedRecipientHash:plan.recipientHash,failAfterMessages:true}),/EXPECTED_PARTIAL_MESSAGE_FAILURE/);assert.deepEqual(await snapshot(db),before);
  for(const prefix of ['INSERT INTO user_messages','INSERT INTO user_message_rewards','INSERT INTO admin_logs','UPDATE app_meta']){
   const faulty={query:(sql,args)=>sql.startsWith(prefix)?Promise.resolve({rows:[]}):client.query(sql,args)};
   await assert.rejects(sendList44Gift(faulty,TARGETS,{expectedRecipientHash:plan.recipientHash}));
   assert.deepEqual(await snapshot(db),before);
  }
 }finally{await db.close();}
});

test('changed identity, duplicate target, quantity and hash mismatch cannot issue a gift',async()=>{
 const {db,client}=await fixture();try{
  const before=await snapshot(db),plan=await inspectList44Gift(client);
  await assert.rejects(sendList44Gift(client,TARGETS,{expectedRecipientHash:'wrong'}));
  await assert.rejects(sendList44Gift(client,[TARGETS[0],TARGETS[0]],{expectedRecipientHash:plan.recipientHash}),/Duplicate account/);
  await assert.rejects(sendList44Gift(client,TARGETS.map((t,i)=>i===0?{...t,quantity:2}:t),{expectedRecipientHash:plan.recipientHash}),/Only one gift/);
  await assert.rejects(sendList44Gift(client,TARGETS.map((t,i)=>i===0?{...t,id:'999999'}:t),{expectedRecipientHash:plan.recipientHash}),/Unreviewed identity/);
  assert.deepEqual(await snapshot(db),before);
  await db.query("UPDATE users SET nickname='renamed' WHERE id=$1",[TARGETS[0].id]);const renamed=await snapshot(db);
  await assert.rejects(sendList44Gift(client,TARGETS,{expectedRecipientHash:plan.recipientHash}),/Nickname changed/);assert.deepEqual(await snapshot(db),renamed);
 }finally{await db.close();}
});

test('lost COMMIT acknowledgement replays the saved result; overlapping batches cannot duplicate rewards',async()=>{
 const {db,client}=await fixture();try{
  const plan=await inspectList44Gift(client);
  const uncertain={async query(sql,args){const result=await client.query(sql,args);if(sql==='COMMIT')throw Error('commit response lost');return result;}};
  await assert.rejects(sendList44Gift(uncertain,TARGETS,{expectedRecipientHash:plan.recipientHash}),/commit response lost/);
  const before=await snapshot(db),replay=await sendList44Gift(client,TARGETS,{expectedRecipientHash:plan.recipientHash});
  assert.equal(replay.replayed,true);assert.deepEqual(await snapshot(db),before);
  const subset=TARGETS.slice(0,1),subplan=await inspectList44Gift(client,subset);
  await assert.rejects(sendList44Gift(client,subset,{expectedRecipientHash:subplan.recipientHash}),/already sent without/);assert.deepEqual(await snapshot(db),before);
 }finally{await db.close();}
});
test('confirmed Bini receives the remaining gift without repaying the previous 43 accounts or Bi_ni',async()=>{
 const {db,client}=await fixture();try{
  const bini=TARGETS.filter(t=>t.id==='4595'),previous=TARGETS.filter(t=>t.id!=='4595');
  assert.equal(bini.length,1);assert.equal(bini[0].nickname,'비니');assert.equal(previous.length,43);
  await db.query("INSERT INTO users(id,nickname,role,status) VALUES(5504,'비_니','USER','ACTIVE')");
  const firstPlan=await inspectList44Gift(client,previous),first=await sendList44Gift(client,previous,{expectedRecipientHash:firstPlan.recipientHash});
  const before=await snapshot(db),plan=await inspectList44Gift(client,bini);
  const dry=await sendList44Gift(client,bini,{expectedRecipientHash:plan.recipientHash,dryRun:true});assert.equal(dry.receipt.count,1);assert.deepEqual(await snapshot(db),before);
  await assert.rejects(sendList44Gift(client,bini,{expectedRecipientHash:plan.recipientHash,failAfterMessages:true}),/EXPECTED_PARTIAL_MESSAGE_FAILURE/);assert.deepEqual(await snapshot(db),before);
  const sent=await sendList44Gift(client,bini,{expectedRecipientHash:plan.recipientHash});
  const oldVerification=await verifyList44Gift(client,first.receipt),lastVerification=await verifyList44Gift(client,sent.receipt);
  assert.equal(oldVerification.messages,43);assert.equal(lastVerification.messages,1);assert.equal(lastVerification.rows[0].user_id,'4595');
  const after=await snapshot(db),campaign=after.user_messages.filter(row=>row.campaign_key===CAMPAIGN_KEY);
  assert.equal(campaign.length,44);assert.equal(new Set(campaign.map(r=>String(r.user_id))).size,44);assert.ok(campaign.every(r=>String(r.user_id)!=='5504'));
  const previousMessageIds=new Set(before.user_messages.map(r=>String(r.id)));
  assert.deepEqual(after.user_messages.filter(r=>previousMessageIds.has(String(r.id))),before.user_messages);
  assert.deepEqual(after.user_message_rewards.filter(r=>previousMessageIds.has(String(r.message_id))),before.user_message_rewards);
  const replay=await sendList44Gift(client,bini,{expectedRecipientHash:plan.recipientHash});assert.equal(replay.replayed,true);assert.deepEqual(await snapshot(db),after);
 }finally{await db.close();}
});
