import test from 'node:test';
import assert from 'node:assert/strict';
import {PGlite} from '@electric-sql/pglite';
import {TARGETS,RECIPIENT_HASH,AMOUNT,CAMPAIGN_KEY,sendMissionGift} from '../scripts/ops/mangsuni-pubg-mission-coins-20261013.mjs';
const options={expectedRecipientHash:RECIPIENT_HASH};
async function fixture(){
 const db=new PGlite();
 await db.exec(`CREATE TABLE users(id BIGINT PRIMARY KEY,nickname TEXT,role TEXT,status TEXT,coin BIGINT DEFAULT 123);
 INSERT INTO users(id,nickname,role,status) VALUES(1,'운영자','OWNER','ACTIVE'),(9999,'비대상','USER','ACTIVE');
 CREATE TABLE app_meta(key TEXT PRIMARY KEY,value TEXT,updated_at TEXT);
 CREATE TABLE user_messages(id BIGSERIAL PRIMARY KEY,user_id BIGINT,sender_type TEXT,title TEXT,body TEXT,message_type TEXT,campaign_key TEXT,is_read INT DEFAULT 0,hidden_at TEXT,UNIQUE(user_id,campaign_key));
 CREATE TABLE user_message_rewards(id BIGSERIAL PRIMARY KEY,message_id BIGINT UNIQUE,user_id BIGINT,reward_type TEXT,reward_amount BIGINT,claimed_at TEXT);
 CREATE TABLE user_message_reward_claim_receipts_v1222(reward_id BIGINT PRIMARY KEY,reward_amount BIGINT,balance_before BIGINT,balance_after BIGINT);
 CREATE TABLE admin_logs(id BIGSERIAL PRIMARY KEY,admin_id BIGINT,action_type TEXT,target_type TEXT,target_id TEXT,before_data TEXT,after_data TEXT);`);
 for(const t of TARGETS)await db.query("INSERT INTO users(id,nickname,role,status) VALUES($1,$2,'USER','ACTIVE')",[t.id,t.nickname]);
 const client={query:(sql,args=[])=>db.query(sql,args)};
 const snapshot=async()=>{const out={};for(const table of ['users','app_meta','user_messages','user_message_rewards','admin_logs'])out[table]=(await db.query('SELECT * FROM '+table+' ORDER BY 1')).rows;return out;};
 return {db,client,snapshot};
}
test('ten exact accounts receive one trillion each via inbox; dry run and retries never change wallets or resend',async()=>{
 const f=await fixture();try{
  const before=await f.snapshot();assert.equal((await sendMissionGift(f.client,{...options,dryRun:true})).dryRun,true);assert.deepEqual(await f.snapshot(),before);
  const result=await sendMissionGift(f.client,options),after=await f.snapshot();assert.equal(result.verification.messages,10);assert.equal(result.verification.totalCoin,'10000000000000');
  assert.deepEqual(after.users,before.users);assert.equal(after.admin_logs.length,1);assert.equal(after.app_meta.length,1);
  assert.ok(after.user_message_rewards.every(r=>String(r.reward_amount)===AMOUNT&&r.claimed_at===null));
  assert.equal(after.user_messages.filter(m=>String(m.user_id)==='9999').length,0);
  assert.equal((await sendMissionGift(f.client,options)).replayed,true);assert.deepEqual(await f.snapshot(),after);
 }finally{await f.db.close();}
});
test('reward, audit or completion failures roll back the entire delivery',async()=>{
 const f=await fixture();try{
  const before=await f.snapshot();
  for(const prefix of ['INSERT INTO user_message_rewards','INSERT INTO admin_logs','UPDATE app_meta']){
   const broken={query:(sql,args)=>sql.startsWith(prefix)?Promise.reject(Error('Injected write failure')):f.client.query(sql,args)};
   await assert.rejects(sendMissionGift(broken,options),/Injected/);assert.deepEqual(await f.snapshot(),before);
  }
  const partial={query:(sql,args)=>sql.startsWith('INSERT INTO user_message_rewards')?Promise.resolve({rows:[]}):f.client.query(sql,args)};
  await assert.rejects(sendMissionGift(partial,options),/Partial reward/);assert.deepEqual(await f.snapshot(),before);
 }finally{await f.db.close();}
});
test('wrong plan, renamed or ambiguous accounts and prior messages are rejected without partial writes',async()=>{
 const f=await fixture();try{
  await assert.rejects(sendMissionGift(f.client,{expectedRecipientHash:'wrong'}),/Reviewed/);
  await f.db.query("UPDATE users SET nickname='다른계정' WHERE id=4628");let before=await f.snapshot();
  await assert.rejects(sendMissionGift(f.client,options),/identity/);assert.deepEqual(await f.snapshot(),before);
  await f.db.query("UPDATE users SET nickname='망순이ෆ' WHERE id=4628");await f.db.query("UPDATE users SET nickname='망순이ෆ' WHERE id=9999");before=await f.snapshot();
  await assert.rejects(sendMissionGift(f.client,options),/ambiguous/);assert.deepEqual(await f.snapshot(),before);
  await f.db.query("UPDATE users SET nickname='비대상' WHERE id=9999");
  await f.db.query("INSERT INTO user_messages(user_id,campaign_key) VALUES(25,$1)",[CAMPAIGN_KEY]);before=await f.snapshot();
  await assert.rejects(sendMissionGift(f.client,options),/already exists/);assert.deepEqual(await f.snapshot(),before);
 }finally{await f.db.close();}
});
test('lost commit response recovers the same receipt after a recipient claims the message',async()=>{
 const f=await fixture();try{
  const lost={async query(sql,args){const result=await f.client.query(sql,args);if(sql==='COMMIT')throw Error('response lost');return result;}};
  await assert.rejects(sendMissionGift(lost,options),/response lost/);
  const reward=(await f.db.query('SELECT id FROM user_message_rewards ORDER BY id LIMIT 1')).rows[0];
  await f.db.query("UPDATE user_message_rewards SET claimed_at='claimed' WHERE id=$1",[reward.id]);
  await f.db.query('INSERT INTO user_message_reward_claim_receipts_v1222(reward_id,reward_amount,balance_before,balance_after) VALUES($1,$2,123,1000000000123)',[reward.id,AMOUNT]);
  const before=await f.snapshot(),replay=await sendMissionGift(f.client,options);
  assert.equal(replay.replayed,true);assert.equal(replay.verification.claimed,1);assert.deepEqual(await f.snapshot(),before);
 }finally{await f.db.close();}
});
