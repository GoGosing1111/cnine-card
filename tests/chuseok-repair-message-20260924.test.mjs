import test from 'node:test';
import assert from 'node:assert/strict';
import {PGlite} from '@electric-sql/pglite';
import {inspectRepairMessage,sendRepairMessage,verifyRepairMessage,CAMPAIGN_KEY,OPERATION_KEY,ITEM_CODE,TITLE,BODY} from '../scripts/ops/chuseok-repair-message-20260924.mjs';

async function fixture(){
 const db=new PGlite();
 await db.exec(`CREATE TABLE users(id BIGINT PRIMARY KEY,role TEXT,status TEXT,coin BIGINT DEFAULT 1234567890123);
 INSERT INTO users(id,role,status) VALUES(1,'OWNER','ACTIVE'),(2,'ADMIN','ACTIVE'),(3,'USER','ACTIVE'),(4,'USER','BANNED'),(5,'USER','ACTIVE'),(6,'OWNER','ACTIVE');
 CREATE TABLE user_second_verifications(user_id BIGINT PRIMARY KEY);INSERT INTO user_second_verifications VALUES(1),(2),(3),(4);
 CREATE TABLE inventory_items(code TEXT PRIMARY KEY,name TEXT,is_active BIGINT);INSERT INTO inventory_items VALUES('PINGDU_REPAIR_COUPON','핑두 리페어 쿠폰',1);
 CREATE TABLE cnine_user_inventory(user_id BIGINT,item_code TEXT,quantity BIGINT,unseen_quantity BIGINT,PRIMARY KEY(user_id,item_code));
 INSERT INTO cnine_user_inventory VALUES(3,'PINGDU_REPAIR_COUPON',4,2),(3,'MASTER_STAR',100,0);
 CREATE TABLE app_meta(key TEXT PRIMARY KEY,value TEXT,updated_at TEXT);
 CREATE TABLE user_messages(id BIGSERIAL PRIMARY KEY,user_id BIGINT NOT NULL,sender_type TEXT,title TEXT,body TEXT,message_type TEXT,campaign_key TEXT,is_read BIGINT DEFAULT 0,hidden_at TEXT,UNIQUE(user_id,campaign_key));
 CREATE TABLE user_message_rewards(id BIGSERIAL PRIMARY KEY,message_id BIGINT UNIQUE,user_id BIGINT,reward_type TEXT,reward_amount BIGINT,claimed_at TEXT);
 CREATE TABLE admin_logs(id BIGSERIAL PRIMARY KEY,admin_id BIGINT,action_type TEXT,target_type TEXT,target_id TEXT,before_data TEXT,after_data TEXT);`);
 return {db,client:{query:(sql,args=[])=>db.query(sql,args)}};
}
async function snapshot(db){const result={};for(const table of ['users','user_second_verifications','inventory_items','cnine_user_inventory','user_messages','user_message_rewards','app_meta','admin_logs'])result[table]=(await db.query(`SELECT * FROM ${table} ORDER BY 1${table==='user_second_verifications'?'':',2'}`)).rows;return result;}

test('all active roles, including unverified accounts beyond a 200-user page, receive one repair message without direct inventory credit',async()=>{
 const {db,client}=await fixture();try{
  await db.exec("INSERT INTO users(id,role,status) SELECT id,'USER','ACTIVE' FROM generate_series(100,300) AS id");
  const before=await snapshot(db),plan=await inspectRepairMessage(client);assert.equal(plan.count,206);assert.deepEqual(plan.roles,{OWNER:2,ADMIN:1,USER:203});
  const receipt=await sendRepairMessage(client,{expectedRecipientHash:plan.recipientHash}),after=await snapshot(db);
  assert.equal(receipt.totalAmount,206);assert.deepEqual(receipt.verification,{messages:206,rewards:206,claimed:0,duplicates:0});
  assert.deepEqual(after.user_messages.map(row=>String(row.user_id)),plan.recipients.map(row=>row.id));
  assert.ok(after.user_messages.every(row=>row.title===TITLE&&row.body===BODY&&row.message_type==='ITEM_REWARD'&&row.campaign_key===CAMPAIGN_KEY));
  assert.ok(after.user_message_rewards.every(row=>row.reward_type===ITEM_CODE&&Number(row.reward_amount)===1&&row.claimed_at===null));
  for(const table of ['users','user_second_verifications','inventory_items','cnine_user_inventory'])assert.deepEqual(after[table],before[table]);
  await db.exec("INSERT INTO users(id,role,status) VALUES(400,'USER','ACTIVE');UPDATE user_message_rewards SET claimed_at='claimed' WHERE user_id=3");
  const beforeRetry=await snapshot(db),retry=await sendRepairMessage(client,{expectedRecipientHash:plan.recipientHash});
  assert.equal(retry.replayed,true);assert.equal(retry.verification.claimed,1);assert.equal(retry.count,206);assert.deepEqual(await snapshot(db),beforeRetry);
  assert.equal((await verifyRepairMessage(client,receipt)).messages,206);
 }finally{await db.close();}
});

test('partial message/reward inserts, audit failure and skipped completion receipt roll back the whole send',async()=>{
 for(const fault of [
  "CREATE FUNCTION skip_recipient() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN IF NEW.user_id=3 THEN RETURN NULL; END IF; RETURN NEW; END; $$; CREATE TRIGGER skip_one BEFORE INSERT ON user_messages FOR EACH ROW EXECUTE FUNCTION skip_recipient();",
  "CREATE FUNCTION skip_recipient() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN IF NEW.user_id=3 THEN RETURN NULL; END IF; RETURN NEW; END; $$; CREATE TRIGGER skip_one BEFORE INSERT ON user_message_rewards FOR EACH ROW EXECUTE FUNCTION skip_recipient();",
  "ALTER TABLE admin_logs ADD CONSTRAINT forced_failure CHECK(action_type='DENIED')",
  "CREATE FUNCTION skip_receipt() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RETURN NULL; END; $$; CREATE TRIGGER skip_completion BEFORE UPDATE ON app_meta FOR EACH ROW EXECUTE FUNCTION skip_receipt();"
 ]){const {db,client}=await fixture();try{await db.exec(fault);const plan=await inspectRepairMessage(client),before=await snapshot(db);await assert.rejects(sendRepairMessage(client,{expectedRecipientHash:plan.recipientHash}));assert.deepEqual(await snapshot(db),before);}finally{await db.close();}}
});

test('changed recipients, inactive coupon or another matching campaign blocks delivery',async()=>{
 for(const change of ["INSERT INTO users(id,role,status) VALUES(7,'USER','ACTIVE')","UPDATE inventory_items SET is_active=0","INSERT INTO user_messages(user_id,title,campaign_key) VALUES(3,'추석 명절 기념','different-key');INSERT INTO user_message_rewards(message_id,user_id,reward_type,reward_amount) VALUES(1,3,'PINGDU_REPAIR_COUPON',1)"]){const {db,client}=await fixture();try{const plan=await inspectRepairMessage(client);await db.exec(change);const before=await snapshot(db);await assert.rejects(sendRepairMessage(client,{expectedRecipientHash:plan.recipientHash}));assert.deepEqual(await snapshot(db),before);}finally{await db.close();}}
});

test('a lost commit response recovers the completed campaign without another message or reward',async()=>{
 const {db,client}=await fixture();try{
  const plan=await inspectRepairMessage(client);let fail=true;
  const dropped={async query(sql,args=[]){const result=await client.query(sql,args);if(sql==='COMMIT'&&fail){fail=false;throw Error('commit response lost');}return result;}};
  await assert.rejects(sendRepairMessage(dropped,{expectedRecipientHash:plan.recipientHash}),/commit response lost/);
  const after=await snapshot(db);assert.equal(after.app_meta[0].key,OPERATION_KEY);assert.equal(after.user_messages.length,5);
  assert.equal((await sendRepairMessage(client,{expectedRecipientHash:plan.recipientHash})).replayed,true);assert.deepEqual(await snapshot(db),after);
 }finally{await db.close();}
});
