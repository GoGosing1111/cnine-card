import test from 'node:test';
import assert from 'node:assert/strict';
import {PGlite} from '@electric-sql/pglite';
import {TARGETS,PLAN_HASH,GIFTS,sendTeamEventRewards} from '../scripts/ops/team-event-diim-rewards-20261014.mjs';
const options={expectedPlanHash:PLAN_HASH,commit:true};
async function fixture(t){
 const db=new PGlite();t.after(()=>db.close());
 await db.exec(`CREATE TABLE users(id BIGINT PRIMARY KEY,nickname TEXT,role TEXT,status TEXT,coin BIGINT DEFAULT 123);
 INSERT INTO users(id,nickname,role,status) VALUES(1,'운영자','OWNER','ACTIVE'),(9999,'비대상','USER','ACTIVE');
 CREATE TABLE user_second_verifications(user_id BIGINT PRIMARY KEY,provider TEXT,provider_name TEXT,provider_user_id TEXT UNIQUE);
 CREATE TABLE inventory_items(code TEXT PRIMARY KEY,name TEXT,is_active INTEGER);
 INSERT INTO inventory_items VALUES('MASTER_STAR','마스터의 별',1);
 CREATE TABLE cnine_user_inventory(user_id BIGINT,item_code TEXT,quantity BIGINT);
 CREATE TABLE app_meta(key TEXT PRIMARY KEY,value TEXT,updated_at TEXT);
 CREATE TABLE user_messages(id BIGSERIAL PRIMARY KEY,user_id BIGINT,sender_type TEXT,title TEXT,body TEXT,message_type TEXT,campaign_key TEXT,is_read INT DEFAULT 0,hidden_at TEXT,UNIQUE(user_id,campaign_key));
 CREATE TABLE user_message_rewards(id BIGSERIAL PRIMARY KEY,message_id BIGINT UNIQUE,user_id BIGINT,reward_type TEXT,reward_amount BIGINT,claimed_at TEXT);
 CREATE TABLE user_message_reward_claim_receipts_v1222(reward_id BIGINT PRIMARY KEY,message_id BIGINT,user_id BIGINT,reward_type TEXT,reward_amount BIGINT,balance_before BIGINT,balance_after BIGINT);
 CREATE TABLE admin_logs(id BIGSERIAL PRIMARY KEY,admin_id BIGINT,action_type TEXT,target_type TEXT,target_id TEXT,before_data TEXT,after_data TEXT);`);
 for(const r of TARGETS){await db.query("INSERT INTO users(id,nickname,role,status) VALUES($1,$2,$3,'ACTIVE')",[r.userId,r.nickname,r.role]);if(r.provider)await db.query('INSERT INTO user_second_verifications VALUES($1,$2,$3,$4)',[r.userId,r.provider,r.providerName,r.providerId]);}
 const client={query:(s,v=[])=>db.query(s,v)},snapshot=async()=>{const out={};for(const table of ['users','cnine_user_inventory','user_messages','user_message_rewards','app_meta','admin_logs'])out[table]=(await db.query('SELECT * FROM '+table+' ORDER BY 1')).rows;return out;};
 return {db,client,snapshot};
}
test('48 exact accounts, winner plus participation, two attachments each; dry run and replay leave balances unchanged',async t=>{
 const f=await fixture(t),before=await f.snapshot();
 assert.equal((await sendTeamEventRewards(f.client,{...options,commit:false})).committed,false);assert.deepEqual(await f.snapshot(),before);
 const sent=await sendTeamEventRewards(f.client,options),after=await f.snapshot();assert.equal(sent.verification.messages,96);assert.equal(sent.verification.coin,'224000000000000');assert.equal(sent.verification.masterStar,'1360000000');
 assert.deepEqual(after.users,before.users);assert.deepEqual(after.cnine_user_inventory,before.cnine_user_inventory);assert.equal(after.admin_logs.length,1);assert.equal(after.user_messages.filter(r=>['1','9999'].includes(String(r.user_id))).length,0);
 assert.equal((await sendTeamEventRewards(f.client,options)).replayed,true);assert.deepEqual(await f.snapshot(),after);
});
test('failed second gift, missing attachments, audit and receipt each roll back all 48 recipients',async t=>{
 const f=await fixture(t),before=await f.snapshot();
 for(const part of ['second gift','INSERT INTO admin_logs','UPDATE app_meta']){let inserts=0;const broken={query:(s,v)=>part==='second gift'&&s.startsWith('INSERT INTO user_message_rewards')&&++inserts===2||s.startsWith(part)?Promise.reject(Error('Injected failure')):f.client.query(s,v)};await assert.rejects(sendTeamEventRewards(broken,options),/Injected/);assert.deepEqual(await f.snapshot(),before);}
 const partial={query:(s,v)=>s.startsWith('INSERT INTO user_message_rewards')?Promise.resolve({rows:[]}):f.client.query(s,v)};await assert.rejects(sendTeamEventRewards(partial,options),/Partial reward/);assert.deepEqual(await f.snapshot(),before);
});
test('changed linked alias, duplicate delivery and wrong reviewed hash prevent new messages',async t=>{
 const f=await fixture(t);await assert.rejects(sendTeamEventRewards(f.client,{...options,expectedPlanHash:'wrong'}),/Reviewed/);
 const target=TARGETS.find(t=>t.identityBasis==='exact verified PLAYDK name');await f.db.query("UPDATE user_second_verifications SET provider_user_id='wrong-account' WHERE user_id=$1",[target.userId]);let before=await f.snapshot();await assert.rejects(sendTeamEventRewards(f.client,options),/Verified identity/);assert.deepEqual(await f.snapshot(),before);
 await f.db.query('UPDATE user_second_verifications SET provider_user_id=$2 WHERE user_id=$1',[target.userId,target.providerId]);await f.db.query('INSERT INTO user_messages(user_id,campaign_key) VALUES($1,$2)',[target.userId,GIFTS[0].campaign]);before=await f.snapshot();await assert.rejects(sendTeamEventRewards(f.client,options),/already exists/);assert.deepEqual(await f.snapshot(),before);
});
test('lost commit response recovers after both a winning coin gift and a star gift have been claimed',async t=>{
 const f=await fixture(t),lost={async query(s,v){const r=await f.client.query(s,v);if(s==='COMMIT')throw Error('response lost');return r;}};await assert.rejects(sendTeamEventRewards(lost,options),/response lost/);
 const winner=TARGETS.find(t=>t.winner),rows=(await f.db.query('SELECT * FROM user_message_rewards WHERE user_id=$1',[winner.userId])).rows;
 for(const r of rows){await f.db.query("UPDATE user_message_rewards SET claimed_at='claimed' WHERE id=$1",[r.id]);await f.db.query('INSERT INTO user_message_reward_claim_receipts_v1222 VALUES($1,$2,$3,$4,$5,$6,$7)',[r.id,r.message_id,r.user_id,r.reward_type,r.reward_amount,'123',(BigInt(r.reward_amount)+123n).toString()]);}
 const before=await f.snapshot(),replay=await sendTeamEventRewards(f.client,options);assert.equal(replay.replayed,true);assert.equal(replay.verification.claimed,2);assert.deepEqual(await f.snapshot(),before);
});
