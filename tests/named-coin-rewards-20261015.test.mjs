import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
import {webcrypto} from 'node:crypto';
import {PGlite} from '@electric-sql/pglite';
import {__postgresCompatTest} from '../functions/_postgres_d1_compat.js';
import {TARGETS,PLAN_HASH,CAMPAIGN_KEY,sendNamedCoinRewards,verifyNamedCoinRewards} from '../scripts/ops/named-coin-rewards-20261015.mjs';
const options={expectedPlanHash:PLAN_HASH,commit:true};
async function fixture(t){
 const db=new PGlite();t.after(()=>db.close());
 await db.exec(`CREATE TABLE users(id BIGINT PRIMARY KEY,nickname TEXT,role TEXT,status TEXT,coin BIGINT DEFAULT 123,card_shards BIGINT DEFAULT 456);
 INSERT INTO users(id,nickname,role,status) VALUES(1,'운영자','OWNER','ACTIVE'),(567,'망순이','USER','ACTIVE'),(5140,'공백','USER','ACTIVE');
 CREATE TABLE user_second_verifications(user_id BIGINT PRIMARY KEY,provider TEXT,provider_name TEXT,provider_user_id TEXT UNIQUE);
 CREATE TABLE app_meta(key TEXT PRIMARY KEY,value TEXT,updated_at TEXT);
 CREATE TABLE user_messages(id BIGSERIAL PRIMARY KEY,user_id BIGINT,sender_type TEXT,title TEXT,body TEXT,message_type TEXT,campaign_key TEXT,is_read INT DEFAULT 0,read_at TEXT,hidden_at TEXT,UNIQUE(user_id,campaign_key));
 CREATE TABLE user_message_rewards(id BIGSERIAL PRIMARY KEY,message_id BIGINT UNIQUE,user_id BIGINT,reward_type TEXT,reward_amount BIGINT,claimed_at TEXT);
 CREATE TABLE user_message_reward_claim_receipts_v1222(reward_id BIGINT PRIMARY KEY,message_id BIGINT UNIQUE,user_id BIGINT,reward_type TEXT,reward_amount BIGINT,claim_token TEXT UNIQUE,balance_before BIGINT,balance_after BIGINT,source TEXT,credited_at TEXT);
 CREATE TABLE coin_logs(id BIGSERIAL PRIMARY KEY,user_id BIGINT,change_amount BIGINT,balance_after BIGINT,reason TEXT);
 CREATE TABLE admin_logs(id BIGSERIAL PRIMARY KEY,admin_id BIGINT,action_type TEXT,target_type TEXT,target_id TEXT,before_data TEXT,after_data TEXT);
 CREATE FUNCTION sqlite_now() RETURNS text LANGUAGE SQL STABLE AS $$SELECT to_char(timezone('UTC',CURRENT_TIMESTAMP),'YYYY-MM-DD HH24:MI:SS')$$;`);
 for(const r of TARGETS){await db.query("INSERT INTO users(id,nickname,role,status) VALUES($1,$2,$3,'ACTIVE')",[r.userId,r.nickname,r.role]);await db.query('INSERT INTO user_second_verifications VALUES($1,$2,$3,$4)',[r.userId,r.provider,r.providerName,r.providerId]);}
 const client={query:(s,v=[])=>db.query(s,v)},snapshot=async()=>{const out={};for(const table of ['users','user_messages','user_message_rewards','user_message_reward_claim_receipts_v1222','coin_logs','app_meta','admin_logs'])out[table]=(await db.query('SELECT * FROM '+table+' ORDER BY 1')).rows;return out;};
 return {db,client,snapshot};
}
test('15 exact recipients get one trillion and eight get three trillion, with one message each and no immediate credit',async t=>{
 const f=await fixture(t),before=await f.snapshot();assert.equal((await sendNamedCoinRewards(f.client,{...options,commit:false})).committed,false);assert.deepEqual(await f.snapshot(),before);
 const sent=await sendNamedCoinRewards(f.client,options),after=await f.snapshot();assert.equal(sent.verification.totalCoin,'39000000000000');assert.equal(sent.verification.messages,23);
 assert.deepEqual(after.users,before.users);assert.deepEqual(after.coin_logs,[]);
 assert.equal(after.user_message_rewards.filter(r=>String(r.reward_amount)==='1000000000000').length,15);assert.equal(after.user_message_rewards.filter(r=>String(r.reward_amount)==='3000000000000').length,8);
 assert.equal(after.user_messages.filter(r=>['1','567','5140'].includes(String(r.user_id))).length,0);
 assert.equal((await sendNamedCoinRewards(f.client,options)).replayed,true);assert.deepEqual(await f.snapshot(),after);
});
test('changed account/verification, wrong plan, duplicate campaign, and partial writes cannot issue partial rewards',async t=>{
 const f=await fixture(t),target=TARGETS[0];await assert.rejects(sendNamedCoinRewards(f.client,{...options,expectedPlanHash:'wrong'}),/Reviewed/);
 await f.db.query("UPDATE user_second_verifications SET provider_user_id='wrong' WHERE user_id=$1",[target.userId]);let before=await f.snapshot();await assert.rejects(sendNamedCoinRewards(f.client,options),/identity changed/);assert.deepEqual(await f.snapshot(),before);
 await f.db.query('UPDATE user_second_verifications SET provider_user_id=$2 WHERE user_id=$1',[target.userId,target.providerId]);
 await f.db.query('UPDATE users SET coin=$2 WHERE id=$1',[target.userId,String(Number.MAX_SAFE_INTEGER)]);before=await f.snapshot();await assert.rejects(sendNamedCoinRewards(f.client,options),/supported range/);assert.deepEqual(await f.snapshot(),before);
 await f.db.query('UPDATE users SET coin=123 WHERE id=$1',[target.userId]);before=await f.snapshot();
 for(const prefix of ['INSERT INTO user_messages','INSERT INTO user_message_rewards','INSERT INTO admin_logs','UPDATE app_meta']){const failing={query:(s,v)=>s.startsWith(prefix)?Promise.resolve({rows:[]}):f.client.query(s,v)};await assert.rejects(sendNamedCoinRewards(failing,options),/Partial|missing/);assert.deepEqual(await f.snapshot(),before);}
 await f.db.query('INSERT INTO user_messages(user_id,campaign_key) VALUES($1,$2)',[target.userId,CAMPAIGN_KEY]);before=await f.snapshot();await assert.rejects(sendNamedCoinRewards(f.client,options),/already exists/);assert.deepEqual(await f.snapshot(),before);
});
test('actual claim credits both amount tiers exactly once; failed ledger and lost send response remain safe',async t=>{
 const f=await fixture(t),lost={async query(s,v){const r=await f.client.query(s,v);if(s==='COMMIT')throw Error('response lost');return r;}};
 await assert.rejects(sendNamedCoinRewards(lost,options),/response lost/);const sent=await sendNamedCoinRewards(f.client,options);assert.equal(sent.replayed,true);
 const api=readFileSync(new URL('../functions/api/[[path]].js',import.meta.url),'utf8');
 const specs=api.slice(api.indexOf('const VERIFIED_MESSAGE_REWARD_TYPES='),api.indexOf('const COUPON_REWARD_MAX='));
 const claimSource=api.slice(api.indexOf('async function claimMessageRewardDirectV1222('),api.indexOf('async function canSafelyRecoverFailedMessageRewardV1222('));
 let fail=false;const pg={async query(input){const sql=typeof input==='string'?input:input.text,args=typeof input==='string'?[]:input.values||[];if(fail&&sql.includes('INSERT INTO coin_logs'))throw Error('injected ledger failure');const r=await f.db.query(sql,args);return {...r,rowCount:r.affectedRows??r.rows.length};}};
 const env={DB:new __postgresCompatTest.PostgresD1Database(pg)},ctx=vm.createContext({crypto:webcrypto,ensureVerifiedRewardMessageV1276:async()=>{},messageRewardClaimToken:()=>webcrypto.randomUUID()});vm.runInContext(specs+'\n'+claimSource+'\nthis.claim=claimMessageRewardDirectV1222;',ctx);
 for(const units of [1,3]){
  const target=TARGETS.find(r=>r.units===units),reward=(await f.db.query('SELECT * FROM user_message_rewards WHERE user_id=$1',[target.userId])).rows[0];
  const claim=()=>ctx.claim(env,{id:Number(target.userId)},reward,Number(reward.message_id));
  await assert.rejects(ctx.claim(env,{id:567},reward,Number(reward.message_id)),/보상/);
  const before=await f.snapshot();fail=true;await assert.rejects(claim,/injected ledger/);assert.deepEqual(await f.snapshot(),before);fail=false;
  assert.equal(String((await claim()).balanceAfter),(123n+BigInt(target.amount)).toString());assert.equal((await claim()).duplicate,true);
 }
 assert.equal((await verifyNamedCoinRewards(f.client,sent.receipt)).claimed,2);const before=await f.snapshot();assert.equal((await sendNamedCoinRewards(f.client,options)).replayed,true);assert.deepEqual(await f.snapshot(),before);
 assert.equal((await f.db.query('SELECT * FROM coin_logs')).rows.length,2);
});
