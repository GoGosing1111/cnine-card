import test from 'node:test';
import assert from 'node:assert/strict';
import {PGlite} from '@electric-sql/pglite';
import {TARGETS,inspectLoyaltyGift,sendLoyaltyGift,verifyLoyaltyGift} from '../scripts/ops/loyalty-omega-message-20260927.mjs';
async function fixture(t){
 const db=new PGlite();t.after(()=>db.close());await db.exec(`
 CREATE TABLE users(id BIGINT PRIMARY KEY,nickname TEXT,role TEXT,status TEXT,coin BIGINT DEFAULT 123);
 INSERT INTO users(id,nickname,role,status) VALUES(1,'운영자','OWNER','ACTIVE'),(999,'대상아님','USER','ACTIVE');
 CREATE TABLE mercenary_cms_documents_v1(doc_key TEXT PRIMARY KEY,revision INTEGER,payload_json TEXT);
 CREATE TABLE user_second_verifications(user_id BIGINT,provider TEXT,provider_user_id TEXT);
 INSERT INTO user_second_verifications VALUES(1255,'PLAYDK','561a0ff8');
 CREATE TABLE user_mercenary_cards_v1(user_id BIGINT,mercenary_code TEXT,total_copies INTEGER);
 INSERT INTO user_mercenary_cards_v1 VALUES(5,'V-021',2);
 CREATE TABLE app_meta(key TEXT PRIMARY KEY,value TEXT,updated_at TEXT);
 CREATE TABLE user_messages(id BIGSERIAL PRIMARY KEY,user_id BIGINT NOT NULL,sender_type TEXT,title TEXT,body TEXT,message_type TEXT,campaign_key TEXT,is_read INTEGER DEFAULT 0,hidden_at TEXT,UNIQUE(user_id,campaign_key));
 CREATE TABLE user_message_rewards(id BIGSERIAL PRIMARY KEY,message_id BIGINT UNIQUE,user_id BIGINT,reward_type TEXT,reward_amount BIGINT,claimed_at TEXT);
 CREATE TABLE admin_logs(id BIGSERIAL PRIMARY KEY,admin_id BIGINT,action_type TEXT,target_type TEXT,target_id TEXT,before_data TEXT,after_data TEXT);`);
 for(const r of TARGETS)await db.query("INSERT INTO users(id,nickname,role,status) VALUES($1,$2,'USER','ACTIVE')",[r.id,r.nickname]);
 await db.query("INSERT INTO mercenary_cms_documents_v1 VALUES('config',59,$1)",[JSON.stringify({mercenaries:[{code:'V-021',name:'오메가-X',rank:'SSS'}]})]);
 return {db,client:{query:(sql,args=[])=>db.query(sql,args)}};
}
async function snapshot(db){const state={};for(const table of ['users','user_mercenary_cards_v1','user_messages','user_message_rewards','app_meta','admin_logs'])state[table]=(await db.query('SELECT * FROM '+table+' ORDER BY 1')).rows;return state}
test('five exact accounts receive one claimable Omega each; retry cannot resend and delivery grants no card',async t=>{
 const {db,client}=await fixture(t),before=await snapshot(db),plan=await inspectLoyaltyGift(client,TARGETS);
 const result=await sendLoyaltyGift(client,TARGETS,{expectedRecipientHash:plan.recipientHash}),after=await snapshot(db);
 assert.equal(result.verification.messages,5);assert.deepEqual(after.users,before.users);assert.deepEqual(after.user_mercenary_cards_v1,before.user_mercenary_cards_v1);
 assert.deepEqual(after.user_messages.map(m=>String(m.user_id)),TARGETS.map(t=>t.id));
 for(const m of after.user_messages){assert.equal(m.title,'충신선물');assert.equal(m.body,'충신선물')}
 for(const r of after.user_message_rewards){assert.equal(r.reward_type,'MERCENARY_OMEGA_X');assert.equal(Number(r.reward_amount),1);assert.equal(r.claimed_at,null)}
 assert.equal((await sendLoyaltyGift(client,TARGETS,{expectedRecipientHash:plan.recipientHash})).replayed,true);assert.deepEqual(await snapshot(db),after);
 assert.equal((await verifyLoyaltyGift(client,result)).missing,0);
});
test('dry run and a partial reward, audit or receipt failure leave everything unchanged',async t=>{
 const {db,client}=await fixture(t),before=await snapshot(db),plan=await inspectLoyaltyGift(client,TARGETS);
 assert.equal((await sendLoyaltyGift(client,TARGETS,{expectedRecipientHash:plan.recipientHash,dryRun:true})).dryRun,true);assert.deepEqual(await snapshot(db),before);
 for(const point of ['INSERT INTO user_message_rewards','INSERT INTO admin_logs','UPDATE app_meta']){
  const broken={query:(sql,args)=>sql.startsWith(point)?Promise.resolve({rows:[]}):client.query(sql,args)};
  await assert.rejects(()=>sendLoyaltyGift(broken,TARGETS,{expectedRecipientHash:plan.recipientHash}),/Partial|Missing/);assert.deepEqual(await snapshot(db),before);
 }
});
test('changed or extra recipients, changed PLAY DK link, and non-SSS CMS all fail closed',async t=>{
 const {db,client}=await fixture(t),before=await snapshot(db),plan=await inspectLoyaltyGift(client,TARGETS);
 for(const targets of [TARGETS.slice(0,3),[...TARGETS,TARGETS[0]],[...TARGETS.slice(0,3),{id:'999',nickname:'대상아님'}]])await assert.rejects(()=>sendLoyaltyGift(client,targets,{expectedRecipientHash:plan.recipientHash}),/authorized/);
 assert.deepEqual(await snapshot(db),before);
 await db.exec("UPDATE users SET nickname='변경됨' WHERE id=5");await assert.rejects(()=>sendLoyaltyGift(client,TARGETS,{expectedRecipientHash:plan.recipientHash}),/nickname changed/);
 await db.exec("UPDATE users SET nickname='싸이타마' WHERE id=5;UPDATE user_second_verifications SET user_id=999");await assert.rejects(()=>sendLoyaltyGift(client,TARGETS,{expectedRecipientHash:plan.recipientHash}),/PLAY DK/);
 await db.exec("UPDATE user_second_verifications SET user_id=1255");await db.query("UPDATE mercenary_cms_documents_v1 SET payload_json=$1",[JSON.stringify({mercenaries:[{code:'V-021',name:'오메가-X',rank:'SS'}]})]);await assert.rejects(()=>sendLoyaltyGift(client,TARGETS,{expectedRecipientHash:plan.recipientHash}),/SSS/);
 assert.equal((await db.query('SELECT * FROM user_messages')).rows.length,0);
});
test('lost commit response recovers the existing five messages and their audit',async t=>{
 const {db,client}=await fixture(t),plan=await inspectLoyaltyGift(client,TARGETS);
 const uncertain={async query(sql,args){const r=await client.query(sql,args);if(sql==='COMMIT')throw Error('LOST_ACK');return r}};
 await assert.rejects(()=>sendLoyaltyGift(uncertain,TARGETS,{expectedRecipientHash:plan.recipientHash}),/LOST_ACK/);
 const before=await snapshot(db);assert.equal((await sendLoyaltyGift(client,TARGETS,{expectedRecipientHash:plan.recipientHash})).replayed,true);assert.deepEqual(await snapshot(db),before);
});
