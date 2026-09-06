import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
import {webcrypto} from 'node:crypto';
import {PGlite} from '@electric-sql/pglite';
import {__postgresCompatTest} from '../functions/_postgres_d1_compat.js';

const read=path=>readFileSync(new URL(`../${path}`,import.meta.url),'utf8');
const source=read('functions/api/[[path]].js');
const specs=source.slice(source.indexOf('const VERIFIED_MESSAGE_REWARD_TYPES='),source.indexOf('const COUPON_REWARD_MAX='));
const route=source.slice(source.indexOf("    if((path==='admin/verified-reward-message-send'"),source.indexOf("    if(path==='admin/verified-coupon-send'"));
const claim=source.slice(source.indexOf('async function claimMessageRewardDirectV1222('),source.indexOf('async function canSafelyRecoverFailedMessageRewardV1222('));
const gift={requestId:'qa-joeun-recruitment-v2050',rewardType:'COIN',rewardAmount:5000000000,
  title:'조은 영입전 기념 보상',body:'조은 영입전 기념 보상',includeOwner:true,includeAdmin:true};

async function fixture(t){
  const pg=new PGlite();t.after(()=>pg.close());
  await pg.exec(`
    CREATE FUNCTION sqlite_now() RETURNS text LANGUAGE SQL STABLE AS $$SELECT to_char(timezone('UTC',CURRENT_TIMESTAMP),'YYYY-MM-DD HH24:MI:SS')$$;
    CREATE TABLE users(id bigint PRIMARY KEY,nickname text,role text,status text,coin bigint,card_shards bigint DEFAULT 0);
    INSERT INTO users(id,nickname,role,status,coin) VALUES
      (1,'Verified user','USER','ACTIVE',9000000000),(2,'Verified admin','ADMIN','ACTIVE',1),
      (3,'Verified owner','OWNER','ACTIVE',2),(4,'Not verified','USER','ACTIVE',3),
      (5,'Banned verified','USER','BANNED',4),(6,'Legacy only','USER','ACTIVE',5),(7,'Unverified owner','OWNER','ACTIVE',6);
    CREATE TABLE user_second_verifications(user_id bigint PRIMARY KEY,provider text);
    INSERT INTO user_second_verifications VALUES(1,'PLAYDK'),(2,'PLAYDK'),(3,'PLAYDK'),(5,'PLAYDK');
    CREATE TABLE user_messages(id bigserial PRIMARY KEY,user_id bigint,sender_type text,title text,body text,message_type text,
      campaign_key text,is_read integer DEFAULT 0,read_at text,hidden_at text);
    CREATE UNIQUE INDEX message_campaign_user ON user_messages(user_id,campaign_key);
    CREATE TABLE user_message_rewards(id bigserial PRIMARY KEY,message_id bigint UNIQUE,user_id bigint,reward_type text,reward_amount bigint,claimed_at text);
    CREATE TABLE user_message_reward_claim_receipts_v1222(reward_id bigint PRIMARY KEY,message_id bigint UNIQUE,user_id bigint,
      reward_type text,reward_amount bigint,claim_token text UNIQUE,balance_before bigint,balance_after bigint,source text,credited_at text);
    CREATE TABLE coin_logs(user_id bigint,change_amount bigint,balance_after bigint,reason text);
  `);
  let fail=false;
  const client={async query(input){
    const text=typeof input==='string'?input:input.text,values=typeof input==='string'?[]:input.values||[];
    if(fail&&text.includes('INSERT INTO user_message_rewards'))throw new Error('injected reward failure');
    const r=await pg.query(text,values);return {...r,rowCount:r.affectedRows??r.rows.length};
  }};
  const env={DB:new __postgresCompatTest.PostgresD1Database(client)},logs=[];
  const context=vm.createContext({crypto:webcrypto,
    ensureVerifiedRewardMessageV1276:async()=>{},ensureSecondVerificationFoundation:async()=>{},
    requirePermission:async request=>request.allowed===false?null:{id:99,role:'OWNER'},readBody:async request=>request.body,
    json:(body,status=200)=>({body,status}),writeAdminLog:async(...args)=>logs.push(args),messageRewardClaimToken:()=>webcrypto.randomUUID()});
  vm.runInContext(`${specs}\n${claim}\nthis.send=async function(request,env,path){${route}};this.claim=claimMessageRewardDirectV1222;`,context);
  return {pg,env,logs,fail(value){fail=value;},
    send:(body=gift,options={})=>context.send({method:'POST',body,allowed:options.allowed},env,options.path||'admin/verified-reward-message-send'),
    claim:reward=>context.claim(env,{id:1},reward,Number(reward.message_id))};
}

test('5 billion preview is read-only; bulk sending reaches only verified active recipients, including explicitly selected operators',async t=>{
  const f=await fixture(t);
  const p=await f.send({...gift,preview:true});assert.equal(p.status,200);
  assert.equal(p.body.eligible,3);assert.equal(p.body.totalAmount,15000000000);
  assert.deepEqual(Array.from(p.body.recipients,r=>Number(r.user_id)),[1,2,3]);
  assert.equal((await f.pg.query('SELECT * FROM user_messages')).rows.length,0);
  const r=await f.send();assert.equal(r.status,200,JSON.stringify(r));
  assert.equal(r.body.sent,3);assert.equal(r.body.rewardCount,3);assert.equal(r.body.rewardAmount,5000000000);
  assert.equal(r.body.sentUsers,1);assert.equal(r.body.sentAdmins,1);assert.equal(r.body.sentOwners,1);
  const rewards=(await f.pg.query('SELECT * FROM user_message_rewards ORDER BY user_id')).rows;
  assert.deepEqual(rewards.map(r=>Number(r.user_id)),[1,2,3]);assert.ok(rewards.every(r=>Number(r.reward_amount)===5000000000&&!r.claimed_at));
  assert.equal(Number((await f.pg.query('SELECT coin FROM users WHERE id=1')).rows[0].coin),9000000000);
  assert.equal(f.logs.length,1);assert.equal(f.logs[0][6].body,gift.body);
});

test('same campaign retry keeps the original recipients and rejects changed amount or message without another grant',async t=>{
  const f=await fixture(t);await f.send();
  await f.pg.exec("INSERT INTO user_second_verifications VALUES(4,'PLAYDK')");
  const replay=await f.send();assert.equal(replay.body.replayed,true);assert.equal(replay.body.sent,3);assert.equal(f.logs.length,1);
  for(const change of [{rewardAmount:4000000000},{body:'Changed body'},{title:'Changed title'}]){
    const invalid=await f.send({...gift,...change});assert.equal(invalid.status,409);assert.equal(invalid.body.code,'VERIFIED_REWARD_MESSAGE_MISMATCH');
  }
  assert.equal((await f.pg.query('SELECT * FROM user_messages')).rows.length,3);
  assert.equal((await f.pg.query('SELECT * FROM user_message_rewards')).rows.length,3);
});

test('5 billion PostgreSQL message claim increases a 9 billion balance to 14 billion exactly once',async t=>{
  const f=await fixture(t);await f.send();
  const reward=(await f.pg.query('SELECT * FROM user_message_rewards WHERE user_id=1')).rows[0];
  const first=await f.claim(reward);assert.equal(first.credited,true);assert.equal(first.balanceAfter,14000000000);
  assert.equal((await f.claim(reward)).duplicate,true);
  assert.equal(Number((await f.pg.query('SELECT coin FROM users WHERE id=1')).rows[0].coin),14000000000);
  assert.equal((await f.pg.query('SELECT * FROM coin_logs')).rows.length,1);
  assert.equal(Number((await f.pg.query('SELECT reward_amount FROM user_message_reward_claim_receipts_v1222')).rows[0].reward_amount),5000000000);
});

test('failed reward insert rolls back all messages, then the same request can safely retry',async t=>{
  const f=await fixture(t);f.fail(true);await assert.rejects(f.send(),/injected reward failure/);
  assert.equal((await f.pg.query('SELECT * FROM user_messages')).rows.length,0);
  assert.equal((await f.pg.query('SELECT * FROM user_message_rewards')).rows.length,0);
  f.fail(false);assert.equal((await f.send()).body.sent,3);
});

test('invalid values and unauthorized callers cannot send; operator defaults and coin alias remain compatible',async t=>{
  const f=await fixture(t);
  for(const rewardAmount of [0,-1,1.5,5000000001,NaN,Infinity,Number.MAX_SAFE_INTEGER])assert.equal((await f.send({...gift,rewardAmount})).status,400);
  assert.equal((await f.send(gift,{allowed:false})).status,403);
  const standard=await f.send({...gift,includeOwner:false,includeAdmin:undefined});
  assert.equal(standard.body.sent,2);assert.equal(standard.body.sentAdmins,1);assert.equal(standard.body.sentOwners,0);
  const alias=await f.send({requestId:'qa-coin-alias-v2050',rewardCoin:'5,000,000,000',includeAdmin:false}, {path:'admin/verified-coin-message-send'});
  assert.equal(alias.status,200);assert.equal(alias.body.sent,1);assert.equal(alias.body.rewardCoin,5000000000);
});

test('preview and send cover more than the CMS user-list page limit',async t=>{
  const f=await fixture(t);
  await f.pg.exec(`INSERT INTO users(id,nickname,role,status,coin) SELECT n,'Bulk '||n,'USER','ACTIVE',10 FROM generate_series(100,304) n;
    INSERT INTO user_second_verifications SELECT n,'PLAYDK' FROM generate_series(100,304) n;`);
  const p=await f.send({...gift,preview:true});assert.equal(p.body.eligible,208);
  const r=await f.send();assert.equal(r.body.sent,208);assert.equal(r.body.rewardCount,208);assert.equal(r.body.totalAmount,1040000000000);
});

test('CMS and API expose the same 50-eok coin limit with a fresh admin script cache',()=>{
  assert.match(specs,/COIN:\{[^\n]+max:5000000000/);
  assert.match(read('admin/admin-v1276.js'),/COIN:\{label:'코인',defaultAmount:1000,max:5000000000\}/);
  assert.match(read('admin/index.html'),/id="verifiedRewardAmount"[^>]+max="5000000000"/);
  assert.match(read('admin/index.html'),/admin-v1276\.js\?v=2050-verified-coin-50eok/);
  assert.match(read('package.json'),/verified-message-coin-v2050\.test\.mjs/);
});
