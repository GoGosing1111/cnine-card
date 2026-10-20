import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createHash,webcrypto} from 'node:crypto';
import vm from 'node:vm';
import {PGlite} from '@electric-sql/pglite';
import {__postgresCompatTest} from '../functions/_postgres_d1_compat.js';
import {PLAN,PLAN_HASH as LIVE_HASH,identityHash} from '../scripts/ops/fortress-rewards-20261020.mjs';
const hash=v=>createHash('sha256').update(JSON.stringify(v)).digest('hex');
assert.equal(hash(PLAN),LIVE_HASH);
// Keep real authentication identifiers out of the fixture. Only the fixed plan
// and its expected hash are substituted; the transaction and claim code are real.
const identities=new Map(PLAN.recipients.map(t=>[t.userId,{provider:'PLAYDK',provider_name:t.nickname,provider_user_id:'fixture-'+t.userId}]));
const fixturePlan={...PLAN,recipients:PLAN.recipients.map(t=>({...t,identityHash:identityHash(identities.get(t.userId))}))};
let source=readFileSync(new URL('../scripts/ops/fortress-rewards-20261020.mjs',import.meta.url),'utf8');
const declaration="export const PLAN=JSON.parse(readFileSync(new URL('./fortress-rewards-20261020-plan.json',import.meta.url),'utf8'));";
assert(source.includes(declaration));
source=source.replace(declaration,'export const PLAN='+JSON.stringify(fixturePlan)+';').replace("export const PLAN_HASH='"+LIVE_HASH+"';","export const PLAN_HASH='"+hash(fixturePlan)+"';");
const {TARGETS,PLAN_HASH,CAMPAIGN_KEY,sendRewards,verifyRewards}=await import('data:text/javascript;base64,'+Buffer.from(source).toString('base64'));
const options={expectedPlanHash:PLAN_HASH,commit:true};
async function fixture(t){
 const db=new PGlite();t.after(()=>db.close());
 await db.exec(`CREATE TABLE users(id BIGINT PRIMARY KEY,nickname TEXT,role TEXT,status TEXT,coin BIGINT DEFAULT 123,card_shards BIGINT DEFAULT 456);
 INSERT INTO users(id,nickname,role,status) VALUES(1,'운영자','OWNER','ACTIVE'),(999001,'철줌마효진','USER','ACTIVE'),(999002,'명단외','USER','ACTIVE');
 CREATE TABLE user_second_verifications(user_id BIGINT PRIMARY KEY,provider TEXT,provider_name TEXT,provider_user_id TEXT UNIQUE);
 CREATE TABLE app_meta(key TEXT PRIMARY KEY,value TEXT,updated_at TEXT);
 CREATE TABLE user_messages(id BIGSERIAL PRIMARY KEY,user_id BIGINT,sender_type TEXT,title TEXT,body TEXT,message_type TEXT,campaign_key TEXT,is_read INT DEFAULT 0,read_at TEXT,hidden_at TEXT,created_at TEXT DEFAULT '2026-10-20T14:00:00Z',UNIQUE(user_id,campaign_key));
 CREATE TABLE user_message_rewards(id BIGSERIAL PRIMARY KEY,message_id BIGINT UNIQUE,user_id BIGINT,reward_type TEXT,reward_amount BIGINT,claimed_at TEXT);
 CREATE TABLE user_message_reward_claim_receipts_v1222(reward_id BIGINT PRIMARY KEY,message_id BIGINT UNIQUE,user_id BIGINT,reward_type TEXT,reward_amount BIGINT,claim_token TEXT UNIQUE,balance_before BIGINT,balance_after BIGINT,source TEXT,credited_at TEXT);
 CREATE TABLE coin_logs(id BIGSERIAL PRIMARY KEY,user_id BIGINT,change_amount BIGINT,balance_after BIGINT,reason TEXT);
 CREATE TABLE admin_logs(id BIGSERIAL PRIMARY KEY,admin_id BIGINT,action_type TEXT,target_type TEXT,target_id TEXT,before_data TEXT,after_data TEXT);
 CREATE FUNCTION sqlite_now() RETURNS text LANGUAGE SQL STABLE AS $$SELECT to_char(timezone('UTC',CURRENT_TIMESTAMP),'YYYY-MM-DD HH24:MI:SS')$$;`);
 for(const t of TARGETS){
  const v=identities.get(t.userId);await db.query("INSERT INTO users(id,nickname,role,status) VALUES($1,$2,$3,'ACTIVE')",[t.userId,t.nickname,t.role]);
  await db.query('INSERT INTO user_second_verifications VALUES($1,$2,$3,$4)',[t.userId,v.provider,v.provider_name,v.provider_user_id]);
 }
 const client={query:(sql,args=[])=>db.query(sql,args)},snapshot=async()=>{const out={};for(const table of ['users','user_messages','user_message_rewards','user_message_reward_claim_receipts_v1222','coin_logs','app_meta','admin_logs'])out[table]=(await db.query('SELECT * FROM '+table+' ORDER BY 1')).rows;return out;};
 return {db,client,snapshot};
}
test('49 participant, three winner and three runner-up messages total 59.7 trillion; held user is excluded and replay does not resend',async t=>{
 const f=await fixture(t),before=await f.snapshot();
 assert.equal((await sendRewards(f.client,{...options,commit:false})).committed,false);assert.deepEqual(await f.snapshot(),before);
 const sent=await sendRewards(f.client,options),after=await f.snapshot();assert.equal(sent.verification.totalCoin,'59700000000000');assert.equal(sent.verification.messages,55);
 assert.deepEqual(after.users,before.users);assert.deepEqual(after.coin_logs,[]);
 for(const [amount,count]of [['300000000000',49],['10000000000000',3],['5000000000000',3]])assert.equal(after.user_message_rewards.filter(r=>String(r.reward_amount)===amount).length,count);
 assert(after.user_messages.every(m=>m.title==='포트리스 보상'));
 assert.equal(after.user_messages.filter(m=>['1','999001','999002'].includes(String(m.user_id))).length,0);
 assert.equal((await sendRewards(f.client,options)).replayed,true);assert.deepEqual(await f.snapshot(),after);
});
test('identity/plan mismatch, unsupported balance, duplicate delivery and partial writes roll back the entire batch',async t=>{
 const f=await fixture(t),target=TARGETS[0];
 await assert.rejects(sendRewards(f.client,{...options,expectedPlanHash:'wrong'}),/Reviewed/);
 await f.db.query("UPDATE user_second_verifications SET provider_user_id='wrong' WHERE user_id=$1",[target.userId]);
 let before=await f.snapshot();await assert.rejects(sendRewards(f.client,options),/identity changed/);assert.deepEqual(await f.snapshot(),before);
 await f.db.query('UPDATE user_second_verifications SET provider_user_id=$2 WHERE user_id=$1',[target.userId,identities.get(target.userId).provider_user_id]);
 await f.db.query('UPDATE users SET coin=$2 WHERE id=$1',[target.userId,String(Number.MAX_SAFE_INTEGER)]);before=await f.snapshot();
 await assert.rejects(sendRewards(f.client,options),/supported range/);assert.deepEqual(await f.snapshot(),before);
 await f.db.query('UPDATE users SET coin=123 WHERE id=$1',[target.userId]);before=await f.snapshot();
 for(const prefix of ['INSERT INTO user_messages','INSERT INTO user_message_rewards','INSERT INTO admin_logs','UPDATE app_meta']){
  const failing={query:(sql,args)=>sql.startsWith(prefix)?Promise.resolve({rows:[]}):f.client.query(sql,args)};
  await assert.rejects(sendRewards(failing,options),/Partial|missing/);assert.deepEqual(await f.snapshot(),before);
 }
 await f.db.query('INSERT INTO user_messages(user_id,campaign_key) VALUES($1,$2)',[target.userId,CAMPAIGN_KEY]);before=await f.snapshot();
 await assert.rejects(sendRewards(f.client,options),/already exists/);assert.deepEqual(await f.snapshot(),before);
});
test('actual claim credits all three amounts once, rolls back a failed ledger and recovers a lost send response',async t=>{
 const f=await fixture(t),lost={async query(sql,args){const result=await f.client.query(sql,args);if(sql==='COMMIT')throw Error('response lost');return result;}};
 await assert.rejects(sendRewards(lost,options),/response lost/);const sent=await sendRewards(f.client,options);assert.equal(sent.replayed,true);
 const api=readFileSync(new URL('../functions/api/[[path]].js',import.meta.url),'utf8');
 const specs=api.slice(api.indexOf('const VERIFIED_MESSAGE_REWARD_TYPES='),api.indexOf('const COUPON_REWARD_MAX='));
 const claimSource=api.slice(api.indexOf('async function claimMessageRewardDirectV1222('),api.indexOf('async function canSafelyRecoverFailedMessageRewardV1222('));
 let fail=false;const pg={async query(input){const sql=typeof input==='string'?input:input.text,args=typeof input==='string'?[]:input.values||[];if(fail&&sql.includes('INSERT INTO coin_logs'))throw Error('injected ledger failure');const r=await f.db.query(sql,args);return {...r,rowCount:r.affectedRows??r.rows.length};}};
 const env={DB:new __postgresCompatTest.PostgresD1Database(pg)},ctx=vm.createContext({crypto:webcrypto,ensureVerifiedRewardMessageV1276:async()=>{},messageRewardClaimToken:()=>webcrypto.randomUUID()});
 vm.runInContext(specs+'\n'+claimSource+'\nthis.claim=claimMessageRewardDirectV1222;',ctx);
 for(const tier of ['PARTICIPANT','WINNER','RUNNER_UP']){
  const target=TARGETS.find(t=>t.tier===tier),reward=(await f.db.query('SELECT * FROM user_message_rewards WHERE user_id=$1',[target.userId])).rows[0];
  const claim=()=>ctx.claim(env,{id:Number(target.userId)},reward,Number(reward.message_id));
  await assert.rejects(ctx.claim(env,{id:999002},reward,Number(reward.message_id)),/보상/);
  const before=await f.snapshot();fail=true;await assert.rejects(claim,/injected ledger/);assert.deepEqual(await f.snapshot(),before);fail=false;
  assert.equal(String((await claim()).balanceAfter),(123n+BigInt(target.amount)).toString());assert.equal((await claim()).duplicate,true);
 }
 assert.equal((await verifyRewards(f.client,sent.receipt)).claimed,3);
 const before=await f.snapshot();assert.equal((await sendRewards(f.client,options)).replayed,true);assert.deepEqual(await f.snapshot(),before);
 assert.equal((await f.db.query('SELECT * FROM coin_logs')).rows.length,3);
});
