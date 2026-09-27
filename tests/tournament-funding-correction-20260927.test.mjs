import test from 'node:test';
import assert from 'node:assert/strict';
import {PGlite} from '@electric-sql/pglite';
import {applyCorrection,verifyCorrection,OPERATION_KEY} from '../scripts/ops/tournament-funding-correction-20260927.mjs';
import {CAMPAIGN_KEY,TITLE} from '../scripts/ops/tournament-funding-gift-20260927.mjs';
async function fixture(){
 const db=new PGlite();
 await db.exec(`CREATE TABLE users(id BIGINT PRIMARY KEY,nickname TEXT,role TEXT,status TEXT,coin BIGINT DEFAULT 123);
 INSERT INTO users(id,nickname,role,status) VALUES(1,'운영자','OWNER','ACTIVE'),(4694,'북부대공','USER','ACTIVE'),(4693,'시소둥이','USER','ACTIVE'),(4774,'딤럼프','USER','ACTIVE'),(4621,'리이렐','USER','ACTIVE');
 CREATE TABLE inventory_items(code TEXT PRIMARY KEY,name TEXT,is_active INT);INSERT INTO inventory_items VALUES('TOURNAMENT_GIFT_BOX','대회 사은품',1);
 CREATE TABLE cnine_user_inventory(user_id BIGINT,item_code TEXT,quantity BIGINT,PRIMARY KEY(user_id,item_code));INSERT INTO cnine_user_inventory VALUES(4694,'TOURNAMENT_GIFT_BOX',7),(4774,'TOURNAMENT_GIFT_BOX',3);
 CREATE TABLE user_messages(id BIGSERIAL PRIMARY KEY,user_id BIGINT,sender_type TEXT,title TEXT,body TEXT,message_type TEXT,campaign_key TEXT,hidden_at TEXT,is_read INT DEFAULT 0,read_at TEXT,UNIQUE(user_id,campaign_key));
 CREATE TABLE user_message_rewards(id BIGSERIAL PRIMARY KEY,message_id BIGINT UNIQUE,user_id BIGINT,reward_type TEXT,reward_amount BIGINT,claimed_at TEXT);
 CREATE TABLE user_message_reward_claim_receipts_v1222(reward_id BIGINT PRIMARY KEY,message_id BIGINT UNIQUE,user_id BIGINT,reward_type TEXT,reward_amount BIGINT,claim_token TEXT UNIQUE,balance_before BIGINT,balance_after BIGINT,source TEXT);
 CREATE TABLE app_meta(key TEXT PRIMARY KEY,value TEXT,updated_at TEXT);
 CREATE TABLE admin_logs(id BIGSERIAL PRIMARY KEY,admin_id BIGINT,action_type TEXT,target_type TEXT,target_id TEXT,before_data TEXT,after_data TEXT);`);
 await db.query("INSERT INTO user_messages(id,user_id,sender_type,title,body,message_type,campaign_key) VALUES(163866,4694,'ADMIN',$1,$1,'ITEM_REWARD',$2)",[TITLE,CAMPAIGN_KEY]);
 await db.exec("INSERT INTO user_message_rewards(message_id,user_id,reward_type,reward_amount) VALUES(163866,4694,'TOURNAMENT_GIFT_BOX',1)");
 return db;
}
async function snapshot(db){const out={};for(const name of ['users','cnine_user_inventory','user_messages','user_message_rewards','user_message_reward_claim_receipts_v1222','app_meta','admin_logs'])out[name]=(await db.query(`SELECT * FROM ${name} ORDER BY 1`)).rows;return out;}
test('revokes only unclaimed source and sends three gifts atomically; replay does not resend',async()=>{
 const db=await fixture();try{const before=await snapshot(db),result=await applyCorrection(db),after=await snapshot(db);assert.equal(result.verification.revoked,1);assert.equal(result.verification.delivered,3);assert.deepEqual(after.users,before.users);assert.deepEqual(after.cnine_user_inventory,before.cnine_user_inventory);
 const voided=after.user_message_reward_claim_receipts_v1222[0];assert.equal(String(voided.reward_amount),'0');assert.equal(voided.source,'ADMIN_UNCLAIMED_REWARD_REVOKE');
 // A stale original claim loses the unique receipt and cannot acquire a credit token.
 const stale=await db.query("INSERT INTO user_message_reward_claim_receipts_v1222(reward_id,message_id,user_id,claim_token) VALUES($1,163866,4694,'stale') ON CONFLICT(reward_id) DO NOTHING RETURNING reward_id",[voided.reward_id]);assert.equal(stale.rows.length,0);
 await db.exec("UPDATE user_message_rewards SET claimed_at='claimed' WHERE user_id=4774");const replayBefore=await snapshot(db);assert.equal((await applyCorrection(db)).replayed,true);assert.deepEqual(await snapshot(db),replayBefore);assert.equal((await verifyCorrection(db,result.receipt)).claimed,1);
 }finally{await db.close()}
});
test('dry-run leaves no source revocation, new gift, receipt or audit',async()=>{const db=await fixture();try{const before=await snapshot(db);assert.equal((await applyCorrection(db,{dryRun:true})).dryRun,true);assert.deepEqual(await snapshot(db),before)}finally{await db.close()}});
test('claimed or reserved source, changed identity and duplicate target abort without writes',async()=>{
 for(const sql of ["UPDATE user_message_rewards SET claimed_at='claimed' WHERE user_id=4694","INSERT INTO user_message_reward_claim_receipts_v1222(reward_id,message_id,user_id,claim_token) VALUES(1,163866,4694,'claim')","UPDATE users SET nickname='다른계정' WHERE id=4774",`INSERT INTO user_messages(user_id,sender_type,title,body,message_type,campaign_key) VALUES(4774,'ADMIN','${TITLE}','${TITLE}','ITEM_REWARD','${CAMPAIGN_KEY}');INSERT INTO user_message_rewards(message_id,user_id,reward_type,reward_amount) SELECT id,4774,'TOURNAMENT_GIFT_BOX',1 FROM user_messages WHERE user_id=4774`]){
  const db=await fixture();try{await db.exec(sql);const before=await snapshot(db);await assert.rejects(()=>applyCorrection(db));assert.deepEqual(await snapshot(db),before)}finally{await db.close()}
 }
});
test('claim reservation race and partial writes roll back the complete correction',async()=>{
 for(const prefix of ['INSERT INTO user_message_reward_claim_receipts_v1222','UPDATE user_messages','INSERT INTO user_message_rewards','INSERT INTO admin_logs','UPDATE app_meta']){
  const db=await fixture();try{const before=await snapshot(db),wrapped={query:(sql,args)=>sql.startsWith(prefix)?Promise.resolve({rows:[]}):db.query(sql,args)};await assert.rejects(()=>applyCorrection(wrapped));assert.deepEqual(await snapshot(db),before)}finally{await db.close()}
 }
});
test('lost COMMIT response replays persisted correction without issuing another gift',async()=>{
 const db=await fixture();try{const wrapped={async query(sql,args){const result=await db.query(sql,args);if(sql==='COMMIT')throw Error('response lost');return result}};await assert.rejects(()=>applyCorrection(wrapped),/response lost/);const before=await snapshot(db);assert.equal((await applyCorrection(db)).replayed,true);assert.deepEqual(await snapshot(db),before);assert.equal(before.app_meta[0].key,OPERATION_KEY)}finally{await db.close()}
});
