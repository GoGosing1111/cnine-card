import test from 'node:test';
import assert from 'node:assert/strict';
import {PGlite} from '@electric-sql/pglite';
import {TARGETS,PLAN_HASH,sendTeamEventRewards} from '../scripts/ops/team-event-diim-rewards-20261014.mjs';
import {KEY,SOURCE,DESTINATION,PROFILE_ID,NICKNAME,REVOKE_SOURCE,correctMangsuniRecipient,verifyCorrection} from '../scripts/ops/team-event-mangsuni-correction-20261014.mjs';
const options={expectedProfileId:PROFILE_ID,commit:true};
async function fixture(t){
 const db=new PGlite();t.after(()=>db.close());
 await db.exec(`CREATE TABLE users(id BIGINT PRIMARY KEY,nickname TEXT,role TEXT,status TEXT,coin BIGINT DEFAULT 123);
 INSERT INTO users(id,nickname,role,status) VALUES(1,'운영자','OWNER','ACTIVE'),(${DESTINATION},'${NICKNAME}','USER','ACTIVE');
 CREATE TABLE user_second_verifications(user_id BIGINT PRIMARY KEY,provider TEXT,provider_name TEXT,provider_user_id TEXT UNIQUE);
 CREATE TABLE inventory_items(code TEXT PRIMARY KEY,name TEXT,is_active INTEGER);
 INSERT INTO inventory_items VALUES('MASTER_STAR','마스터의 별',1);
 CREATE TABLE cnine_user_inventory(user_id BIGINT,item_code TEXT,quantity BIGINT);
 CREATE TABLE app_meta(key TEXT PRIMARY KEY,value TEXT,updated_at TEXT);
 CREATE TABLE user_messages(id BIGSERIAL PRIMARY KEY,user_id BIGINT,sender_type TEXT,title TEXT,body TEXT,message_type TEXT,campaign_key TEXT,is_read INT DEFAULT 0,read_at TEXT,hidden_at TEXT,UNIQUE(user_id,campaign_key));
 CREATE TABLE user_message_rewards(id BIGSERIAL PRIMARY KEY,message_id BIGINT UNIQUE,user_id BIGINT,reward_type TEXT,reward_amount BIGINT,claimed_at TEXT);
 CREATE TABLE user_message_reward_claim_receipts_v1222(reward_id BIGINT PRIMARY KEY,message_id BIGINT UNIQUE,user_id BIGINT,reward_type TEXT,reward_amount BIGINT,claim_token TEXT UNIQUE,balance_before BIGINT,balance_after BIGINT,source TEXT,credited_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP);
 CREATE TABLE admin_logs(id BIGSERIAL PRIMARY KEY,admin_id BIGINT,action_type TEXT,target_type TEXT,target_id TEXT,before_data TEXT,after_data TEXT);`);
 for(const r of TARGETS){await db.query("INSERT INTO users(id,nickname,role,status) VALUES($1,$2,$3,'ACTIVE')",[r.userId,r.nickname,r.role]);if(r.provider)await db.query('INSERT INTO user_second_verifications VALUES($1,$2,$3,$4)',[r.userId,r.provider,r.providerName,r.providerId]);}
 await db.query("INSERT INTO user_second_verifications VALUES($1,'PLAYDK',$2,$3)",[DESTINATION,NICKNAME,PROFILE_ID]);
 const client={query:(s,v=[])=>db.query(s,v)},snapshot=async()=>{const out={};for(const table of ['users','cnine_user_inventory','user_messages','user_message_rewards','user_message_reward_claim_receipts_v1222','app_meta','admin_logs'])out[table]=(await db.query('SELECT * FROM '+table+' ORDER BY 1')).rows;return out;};
 const original=await sendTeamEventRewards(client,{expectedPlanHash:PLAN_HASH,commit:true});return {db,client,snapshot,original};
}

test('exact PLAY DK correction revokes old receipts without credit, reissues both amounts, and replays both operations safely',async t=>{
 const f=await fixture(t),before=await f.snapshot();
 assert.equal((await correctMangsuniRecipient(f.client,{...options,commit:false})).committed,false);assert.deepEqual(await f.snapshot(),before);
 const result=await correctMangsuniRecipient(f.client,options),after=await f.snapshot();
 assert.equal(result.verification.recipients,48);assert.equal(result.verification.messages,96);assert.equal(result.verification.historicalMessages,98);
 assert.deepEqual(after.users,before.users);assert.deepEqual(after.cnine_user_inventory,before.cnine_user_inventory);
 assert.equal(after.user_messages.filter(m=>String(m.user_id)===SOURCE&&!m.hidden_at).length,0);
 assert.deepEqual(after.user_message_rewards.filter(r=>String(r.user_id)===DESTINATION).map(r=>String(r.reward_amount)),['3000000000000','20000000']);
 assert.ok(after.user_message_reward_claim_receipts_v1222.every(c=>c.source===REVOKE_SOURCE&&String(c.balance_before)==='0'&&String(c.balance_after)==='0'));
 assert.equal((await correctMangsuniRecipient(f.client,options)).replayed,true);
 assert.equal((await sendTeamEventRewards(f.client,{expectedPlanHash:PLAN_HASH,commit:true})).replayed,true);assert.deepEqual(await f.snapshot(),after);
 // Exercise the production claim INSERT SELECT: stale old-account requests cannot acquire a credit token.
 for(const r of result.receipt.revoked){const stale=await f.db.query(`INSERT INTO user_message_reward_claim_receipts_v1222(reward_id,message_id,user_id,reward_type,reward_amount,claim_token,balance_before,balance_after,source)
  SELECT id,message_id,user_id,reward_type,reward_amount,'stale-'||id,0,0,'MESSAGE_CLAIM' FROM user_message_rewards WHERE id=$1 AND user_id=$2 AND claimed_at IS NULL ON CONFLICT DO NOTHING RETURNING reward_id`,[r.rewardId,SOURCE]);assert.equal(stale.rows.length,0);}
 for(const d of result.receipt.deliveries){await f.db.query(`INSERT INTO user_message_reward_claim_receipts_v1222(reward_id,message_id,user_id,reward_type,reward_amount,claim_token,balance_before,balance_after,source)
  SELECT id,message_id,user_id,reward_type,reward_amount,'valid-'||id,123,123+reward_amount,'MESSAGE_CLAIM' FROM user_message_rewards WHERE id=$1`,[d.rewardId]);await f.db.query("UPDATE user_message_rewards SET claimed_at='claimed' WHERE id=$1",[d.rewardId]);}
 assert.equal((await verifyCorrection(f.client,result.receipt)).claimed,2);
 assert.equal((await correctMangsuniRecipient(f.client,options)).replayed,true);
});

test('wrong identity, claimed source, race at receipt reservation, and partial/audit failures leave the whole correction rolled back',async t=>{
 const f=await fixture(t);await assert.rejects(correctMangsuniRecipient(f.client,{...options,expectedProfileId:'wrong'}),/Exact/);
 await f.db.query("UPDATE user_second_verifications SET provider_user_id='wrong' WHERE user_id=$1",[DESTINATION]);let before=await f.snapshot();await assert.rejects(correctMangsuniRecipient(f.client,options),/identity changed/);assert.deepEqual(await f.snapshot(),before);
 await f.db.query('UPDATE user_second_verifications SET provider_user_id=$2 WHERE user_id=$1',[DESTINATION,PROFILE_ID]);before=await f.snapshot();
 for(const pattern of ['UPDATE user_messages','INSERT INTO user_message_rewards','INSERT INTO admin_logs','UPDATE app_meta']){const failing={query:(s,v)=>s.startsWith(pattern)?Promise.reject(Error('Injected failure')):f.client.query(s,v)};await assert.rejects(correctMangsuniRecipient(failing,options),/Injected/);assert.deepEqual(await f.snapshot(),before);}
 const racing={async query(s,v){if(s.startsWith('INSERT INTO user_message_reward_claim_receipts_v1222')){const r=await f.client.query(s,v);return {rows:r.rows.slice(0,1)};}return f.client.query(s,v);}};
 await assert.rejects(correctMangsuniRecipient(racing,options),/claimed concurrently/);assert.deepEqual(await f.snapshot(),before);
 const source=f.original.receipt.deliveries.find(d=>d.userId===SOURCE);
 await f.db.query(`INSERT INTO user_message_reward_claim_receipts_v1222(reward_id,message_id,user_id,reward_type,reward_amount,claim_token,balance_before,balance_after,source)
 SELECT id,message_id,user_id,reward_type,reward_amount,'already',123,123+reward_amount,'MESSAGE_CLAIM' FROM user_message_rewards WHERE id=$1`,[source.rewardId]);await f.db.query("UPDATE user_message_rewards SET claimed_at='claimed' WHERE id=$1",[source.rewardId]);before=await f.snapshot();
 await assert.rejects(correctMangsuniRecipient(f.client,options),/already claimed/);assert.deepEqual(await f.snapshot(),before);
});

test('lost commit response is recovered from the correction receipt without a second issue',async t=>{
 const f=await fixture(t),lost={async query(s,v){const r=await f.client.query(s,v);if(s==='COMMIT')throw Error('response lost');return r;}};
 await assert.rejects(correctMangsuniRecipient(lost,options),/response lost/);const before=await f.snapshot();
 const replay=await correctMangsuniRecipient(f.client,options);assert.equal(replay.replayed,true);assert.equal(replay.receipt.operationKey,KEY);assert.deepEqual(await f.snapshot(),before);
});
