import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import {webcrypto} from 'node:crypto';
import {pathToFileURL} from 'node:url';
import {PGlite} from '@electric-sql/pglite';
import {OP, KST_DATE, hash, tierFor, selectRecipients, makePlan, validatePlan, send, artifacts, receipt, verify} from './delivery.mjs';

const ROOT = 'C:/Users/User/Downloads/cnine-avatar-bongsoon-20260919/site';
const {__postgresCompatTest} = await import(pathToFileURL(ROOT + '/functions/_postgres_d1_compat.js').href);
const runtime = fs.readFileSync(ROOT + '/functions/api/[[path]].js', 'utf8');
const specs = runtime.slice(runtime.indexOf('const VERIFIED_MESSAGE_REWARD_TYPES='), runtime.indexOf('const COUPON_REWARD_MAX='));
const claimSource = runtime.slice(runtime.indexOf('async function claimMessageRewardDirectV1222('), runtime.indexOf('async function canSafelyRecoverFailedMessageRewardV1222('));
assert.ok(specs && claimSource);
const account = (id, days, overrides = {}) => ({userId: String(id), status: 'ACTIVE', role: 'USER', provider: 'PLAYDK',
  provider_user_id: 'qa-' + id, coin: '100', attendanceDays: days, distinctDays: days, ...overrides});
const inputs = [account(1,49), account(2,50), account(3,99), account(4,100), account(5,101),
  account(6,100,{status:'BANNED'}), account(7,100,{provider:null,provider_user_id:null}),
  account(8,100,{provider:'WAGO',role:'ADMIN'}), account(9,50,{coin:'9108034310345289',role:'OWNER'})];
const plan = makePlan({accounts: inputs, summary: {clock: {cutoff: '2026-10-27 07:03:37+00'}}});

test('49/50/99/100/101 boundaries, verified roles/providers, highest tier and invalid duplicates', () => {
  assert.equal(tierFor(49), null); assert.equal(tierFor(50).amount, '20000000000000');
  assert.equal(tierFor(99).amount, '20000000000000'); assert.equal(tierFor(100).amount, '40000000000000');
  assert.equal(tierFor(101).amount, '40000000000000');
  assert.deepEqual(plan.recipients.map(r=>r.userId), ['2','3','4','5','8','9']);
  assert.deepEqual(plan.totals, {recipients:6,messages:6,tier50:3,tier100:3,totalCoin:'180000000000000'});
  validatePlan(plan, hash(plan));
  assert.throws(()=>selectRecipients([account(1,50),account(1,50)]),/Duplicate recipients/);
  assert.throws(()=>selectRecipients([account(1,50,{distinctDays:49})]),/Duplicate attendance/);
  assert.throws(()=>validatePlan({...plan,highestTierOnly:false},hash({...plan,highestTierOnly:false})));
  assert.throws(()=>validatePlan({...plan,cutoff:'changed'},hash(plan)),/Reviewed plan/);
});

async function fixture(t) {
  const pg = new PGlite(); t.after(()=>pg.close());
  await pg.exec(`CREATE FUNCTION sqlite_now() RETURNS text LANGUAGE SQL STABLE AS $$SELECT '2026-10-27 07:04:00'::text$$;
    CREATE TABLE users(id bigint PRIMARY KEY,nickname text,role text,status text,coin bigint,card_shards bigint DEFAULT 0);
    CREATE TABLE user_second_verifications(user_id bigint PRIMARY KEY,provider text,provider_user_id text);
    CREATE TABLE attendance_logs(user_id bigint,attendance_date text,claimed_at text,PRIMARY KEY(user_id,attendance_date));
    CREATE TABLE user_messages(id bigserial PRIMARY KEY,user_id bigint,sender_type text,title text,body text,message_type text,campaign_key text,
      is_read bigint DEFAULT 0,read_at text,hidden_at text,created_at text DEFAULT sqlite_now(),UNIQUE(user_id,campaign_key));
    CREATE TABLE user_message_rewards(id bigserial PRIMARY KEY,message_id bigint UNIQUE,user_id bigint,reward_type text,reward_amount bigint,claimed_at text);
    CREATE TABLE user_message_reward_claim_receipts_v1222(reward_id bigint PRIMARY KEY,message_id bigint UNIQUE,user_id bigint,
      reward_type text,reward_amount bigint,claim_token text UNIQUE,balance_before bigint,balance_after bigint,source text,credited_at text);
    CREATE TABLE coin_logs(id bigserial PRIMARY KEY,user_id bigint,change_amount bigint,balance_after bigint,reason text,created_at text DEFAULT sqlite_now());
    CREATE TABLE admin_logs(id bigserial PRIMARY KEY,admin_id bigint,action_type text,target_type text,target_id text,before_data text,after_data text);
    CREATE TABLE app_meta(key text PRIMARY KEY,value text,updated_at text);
    INSERT INTO app_meta VALUES('attendance_settings_v1','preserve','original');`);
  for (const a of inputs) {
    await pg.query('INSERT INTO users(id,nickname,role,status,coin) VALUES($1,$2,$3,$4,$5)',[a.userId,'qa-'+a.userId,a.role,a.status,a.coin]);
    if(a.provider)await pg.query('INSERT INTO user_second_verifications VALUES($1,$2,$3)',[a.userId,a.provider,a.provider_user_id]);
    await pg.query(`INSERT INTO attendance_logs SELECT $1,('2026-07-01'::date+n)::text,'2026-10-27 06:00:00' FROM generate_series(0,$2::int-1) n`,[a.userId,a.attendanceDays]);
  }
  const c = {query: async (sql,args=[]) => {
    if(sql.startsWith('SELECT pg_advisory_xact_lock'))return {rows:[{locked:true}]};
    if(sql.startsWith('SELECT to_char(CURRENT_TIMESTAMP'))return {rows:[{day:KST_DATE}]};
    return pg.query(sql,args);
  }};
  return {pg,c};
}

test('atomic two-tier messages preserve wallets and policy; replay is SELECT-only and survives claims', async t => {
  const {pg,c}=await fixture(t);
  const before=(await pg.query('SELECT id,coin::text FROM users ORDER BY id')).rows;
  await c.query('BEGIN'); const sent=await send(c,plan,hash(plan)); await c.query('COMMIT');
  assert.equal(sent.replayed,false); assert.equal(sent.verification.recipients,6); assert.equal(sent.verification.claimed,0);
  assert.deepEqual((await pg.query('SELECT id,coin::text FROM users ORDER BY id')).rows,before);
  assert.equal((await pg.query("SELECT value FROM app_meta WHERE key='attendance_settings_v1'")).rows[0].value,'preserve');
  const a=await artifacts(c); assert.deepEqual(a,{messages:6,rewards:6,audits:1,receipts:1,matchingMessages:6,matchingDirectCoinLogs:0});
  const readonly={query(sql,args){assert.match(sql,/^SELECT\b/);return c.query(sql,args);}};
  assert.equal((await send(readonly,plan,hash(plan))).replayed,true); assert.deepEqual(await artifacts(c),a);
  assert.equal((await receipt(c)).operationKey,OP);
  assert.equal((await verify(readonly,sent.receipt,plan)).duplicates,0);
});

test('failure after messages, attachments and audit rolls back the entire batch and permits same-key retry', async t => {
  const {pg,c}=await fixture(t);
  const before=await artifacts(c); await c.query('BEGIN');
  await assert.rejects(()=>send({query(sql,args){if(sql.startsWith('INSERT INTO app_meta('))throw Error('FAIL_RECEIPT');return c.query(sql,args);}},plan,hash(plan)),/FAIL_RECEIPT/);
  await c.query('ROLLBACK'); assert.deepEqual(await artifacts(c),before);
  assert.equal((await pg.query('SELECT COUNT(*)::int n FROM coin_logs')).rows[0].n,0);
  await c.query('BEGIN'); assert.equal((await send(c,plan,hash(plan))).replayed,false); await c.query('COMMIT');
});

test('revoked verification or changed threshold prevents delivery of the frozen plan', async t => {
  const {pg,c}=await fixture(t);
  await pg.query("DELETE FROM user_second_verifications WHERE user_id=2");
  await c.query('BEGIN'); await assert.rejects(()=>send(c,plan,hash(plan))); await c.query('ROLLBACK');
  assert.equal((await artifacts(c)).messages,0);
});

test('current runtime claims 20/40 trillion exactly once, including a wallet beyond Number safe range', async t => {
  const {pg,c}=await fixture(t);
  await c.query('BEGIN'); await send(c,plan,hash(plan)); await c.query('COMMIT');
  const client={async query(input){const sql=typeof input==='string'?input:input.text,args=typeof input==='string'?[]:input.values||[];
    const r=await pg.query(sql,args);return {...r,rowCount:r.affectedRows??r.rows.length};}};
  const env={DB:new __postgresCompatTest.PostgresD1Database(client)};
  const context=vm.createContext({crypto:webcrypto,ensureVerifiedRewardMessageV1276:async()=>{},messageRewardClaimToken:()=>webcrypto.randomUUID()});
  vm.runInContext(`${specs}\n${claimSource}\nthis.claim=claimMessageRewardDirectV1222;`,context);
  for(const uid of ['2','4','9']) {
    const reward=(await pg.query('SELECT * FROM user_message_rewards WHERE user_id=$1',[uid])).rows[0];
    const before=BigInt((await pg.query('SELECT coin::text coin FROM users WHERE id=$1',[uid])).rows[0].coin);
    assert.equal((await context.claim(env,{id:Number(uid)},reward,Number(reward.message_id))).credited,true);
    assert.equal((await context.claim(env,{id:Number(uid)},reward,Number(reward.message_id))).duplicate,true);
    const expected=before+BigInt(reward.reward_amount);
    assert.equal((await pg.query('SELECT coin::text coin FROM users WHERE id=$1',[uid])).rows[0].coin,expected.toString());
    const logs=(await pg.query('SELECT change_amount::text amount,balance_after::text balance FROM coin_logs WHERE user_id=$1',[uid])).rows;
    assert.deepEqual(logs,[{amount:String(reward.reward_amount),balance:expected.toString()}]);
    const r=(await pg.query('SELECT reward_amount::text amount,balance_after::text balance FROM user_message_reward_claim_receipts_v1222 WHERE reward_id=$1',[reward.id])).rows[0];
    assert.deepEqual(r,{amount:String(reward.reward_amount),balance:expected.toString()});
  }
  const saved=await receipt(c); assert.equal((await verify(c,saved,plan)).claimed,3);
});
