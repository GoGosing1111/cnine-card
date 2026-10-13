import test from 'node:test';
import assert from 'node:assert/strict';
import {PGlite} from '@electric-sql/pglite';
import {TARGETS,RECIPIENT_HASH,AMOUNT,TOTAL,CAMPAIGN_KEY,sendHeroesGift} from '../scripts/ops/playdk-board-heroes-20261014.mjs';
const options={expectedRecipientHash:RECIPIENT_HASH};
async function fixture(){
 const db=new PGlite();
 await db.exec(`CREATE TABLE users(id BIGINT PRIMARY KEY,nickname TEXT,role TEXT,status TEXT,coin BIGINT DEFAULT 123);
 INSERT INTO users(id,nickname,role,status) VALUES(1,'운영자','OWNER','ACTIVE'),(9999,'비대상','USER','ACTIVE');
 CREATE TABLE user_second_verifications(user_id BIGINT PRIMARY KEY,provider TEXT,provider_user_id TEXT UNIQUE);
 CREATE TABLE app_meta(key TEXT PRIMARY KEY,value TEXT,updated_at TEXT);
 CREATE TABLE user_messages(id BIGSERIAL PRIMARY KEY,user_id BIGINT,sender_type TEXT,title TEXT,body TEXT,message_type TEXT,campaign_key TEXT,is_read INT DEFAULT 0,hidden_at TEXT,UNIQUE(user_id,campaign_key));
 CREATE TABLE user_message_rewards(id BIGSERIAL PRIMARY KEY,message_id BIGINT UNIQUE,user_id BIGINT,reward_type TEXT,reward_amount BIGINT,claimed_at TEXT);
 CREATE TABLE user_message_reward_claim_receipts_v1222(reward_id BIGINT PRIMARY KEY,message_id BIGINT,user_id BIGINT,reward_type TEXT,reward_amount BIGINT,balance_before BIGINT,balance_after BIGINT);
 CREATE TABLE admin_logs(id BIGSERIAL PRIMARY KEY,admin_id BIGINT,action_type TEXT,target_type TEXT,target_id TEXT,before_data TEXT,after_data TEXT);`);
 for(const t of TARGETS){
  await db.query("INSERT INTO users(id,nickname,role,status) VALUES($1,$2,$3,'ACTIVE')",[t.id,t.nickname,t.role]);
  await db.query("INSERT INTO user_second_verifications VALUES($1,'PLAYDK',$2)",[t.id,t.providerUuid]);
 }
 const client={query:(sql,args=[])=>db.query(sql,args)};
 const snapshot=async()=>{const out={};for(const table of ['users','user_second_verifications','app_meta','user_messages','user_message_rewards','admin_logs'])out[table]=(await db.query('SELECT * FROM '+table+' ORDER BY 1')).rows;return out;};
 return {db,client,snapshot};
}

test('the approved 30 verified accounts receive five trillion each; dry run and replay preserve wallets',async()=>{
 const f=await fixture();try{
  const before=await f.snapshot();assert.equal((await sendHeroesGift(f.client,{...options,dryRun:true})).dryRun,true);assert.deepEqual(await f.snapshot(),before);
  const sent=await sendHeroesGift(f.client,options),after=await f.snapshot();
  assert.equal(sent.verification.messages,30);assert.equal(sent.verification.totalCoin,TOTAL);
  assert.deepEqual(after.users,before.users);assert.deepEqual(after.user_second_verifications,before.user_second_verifications);
  assert.equal(after.admin_logs.length,1);assert.equal(after.app_meta.length,1);
  assert.ok(after.user_message_rewards.every(r=>String(r.reward_amount)===AMOUNT&&r.claimed_at===null));
  assert.equal(after.user_messages.filter(m=>String(m.user_id)==='1'||String(m.user_id)==='9999').length,0);
  assert.equal((await sendHeroesGift(f.client,options)).replayed,true);assert.deepEqual(await f.snapshot(),after);
 }finally{await f.db.close();}
});

test('attachment, audit, receipt and partial insert failures roll back all recipients',async()=>{
 const f=await fixture();try{
  const before=await f.snapshot();
  for(const prefix of ['INSERT INTO user_message_rewards','INSERT INTO admin_logs','UPDATE app_meta']){
   const broken={query:(sql,args)=>sql.startsWith(prefix)?Promise.reject(Error('Injected failure')):f.client.query(sql,args)};
   await assert.rejects(sendHeroesGift(broken,options),/Injected/);assert.deepEqual(await f.snapshot(),before);
  }
  const partial={query:(sql,args)=>sql.startsWith('INSERT INTO user_message_rewards')?Promise.resolve({rows:[]}):f.client.query(sql,args)};
  await assert.rejects(sendHeroesGift(partial,options),/Partial reward/);assert.deepEqual(await f.snapshot(),before);
 }finally{await f.db.close();}
});

test('changed PLAYDK mapping, wrong recipient hash, inactive account and existing gift block the whole delivery',async()=>{
 const f=await fixture();try{
  await assert.rejects(sendHeroesGift(f.client,{expectedRecipientHash:'wrong'}),/Reviewed/);
  const target=TARGETS[0];await f.db.query("UPDATE user_second_verifications SET provider_user_id='wrong-account' WHERE user_id=$1",[target.id]);
  let before=await f.snapshot();await assert.rejects(sendHeroesGift(f.client,options),/identity/);assert.deepEqual(await f.snapshot(),before);
  await f.db.query('UPDATE user_second_verifications SET provider_user_id=$2 WHERE user_id=$1',[target.id,target.providerUuid]);
  await f.db.query("UPDATE users SET status='BANNED' WHERE id=$1",[target.id]);before=await f.snapshot();
  await assert.rejects(sendHeroesGift(f.client,options),/Inactive/);assert.deepEqual(await f.snapshot(),before);
  await f.db.query("UPDATE users SET status='ACTIVE' WHERE id=$1",[target.id]);
  await f.db.query('INSERT INTO user_messages(user_id,campaign_key) VALUES($1,$2)',[target.id,CAMPAIGN_KEY]);before=await f.snapshot();
  await assert.rejects(sendHeroesGift(f.client,options),/already exists/);assert.deepEqual(await f.snapshot(),before);
 }finally{await f.db.close();}
});

test('lost commit response reuses the receipt even after a recipient collects five trillion',async()=>{
 const f=await fixture();try{
  const lost={async query(sql,args){const result=await f.client.query(sql,args);if(sql==='COMMIT')throw Error('response lost');return result;}};
  await assert.rejects(sendHeroesGift(lost,options),/response lost/);
  const r=(await f.db.query('SELECT id,message_id,user_id FROM user_message_rewards ORDER BY id LIMIT 1')).rows[0];
  await f.db.query("UPDATE user_message_rewards SET claimed_at='claimed' WHERE id=$1",[r.id]);
  await f.db.query("INSERT INTO user_message_reward_claim_receipts_v1222 VALUES($1,$2,$3,'COIN',$4,123,5000000000123)",[r.id,r.message_id,r.user_id,AMOUNT]);
  const before=await f.snapshot(),replay=await sendHeroesGift(f.client,options);
  assert.equal(replay.replayed,true);assert.equal(replay.verification.claimed,1);assert.deepEqual(await f.snapshot(),before);
 }finally{await f.db.close();}
});
