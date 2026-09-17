import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
import {PGlite} from '@electric-sql/pglite';
import {webcrypto} from 'node:crypto';
import {DatabaseSync} from 'node:sqlite';
import {__postgresCompatTest} from '../functions/_postgres_d1_compat.js';
import {claimPigCoinMessageReward} from '../functions/_pig_coin_message_reward.js';
import {claimMessageRewardBatch} from '../functions/_message_reward_batch.js';
import {LOOT_SHOP_SCHEMA} from '../functions/_loot_shop.js';
const read=p=>readFileSync(new URL('../'+p,import.meta.url),'utf8'),api=read('functions/api/[[path]].js'),app=read('js/app.js');
const specs=api.slice(api.indexOf('const VERIFIED_MESSAGE_REWARD_TYPES='),api.indexOf('let verifiedRewardMessageV1276ReadyPromise='));
const common=api.slice(api.indexOf('async function claimMessageRewardDirectV1222('),api.indexOf('async function canSafelyRecoverFailedMessageRewardV1222('));
async function fixture(t,postgres){
 const sql=[
  'CREATE TABLE users(id BIGINT PRIMARY KEY,coin BIGINT,card_shards BIGINT)',
  'INSERT INTO users VALUES(1,9000000000,150),(2,500,200)',
  'CREATE TABLE user_messages(id BIGINT PRIMARY KEY,user_id BIGINT,title TEXT,is_read INTEGER DEFAULT 0,read_at TEXT,hidden_at TEXT)',
  'CREATE TABLE user_message_rewards(id BIGINT PRIMARY KEY,message_id BIGINT UNIQUE,user_id BIGINT,reward_type TEXT,reward_amount BIGINT,claimed_at TEXT)',
  'CREATE TABLE user_message_reward_claim_receipts_v1222(reward_id BIGINT PRIMARY KEY,message_id BIGINT UNIQUE,user_id BIGINT,reward_type TEXT,reward_amount BIGINT,claim_token TEXT UNIQUE,balance_before BIGINT,balance_after BIGINT,source TEXT,credited_at TEXT)',
  'CREATE TABLE coin_logs(user_id BIGINT,change_amount BIGINT,balance_after BIGINT,reason TEXT)',
  'CREATE TABLE cnine_user_inventory(user_id BIGINT,item_code TEXT,quantity BIGINT)',
  ...LOOT_SHOP_SCHEMA.slice(0,2)
 ];
 let DB,fail='',pg,sqlite;
 if(postgres){
  pg=new PGlite();t.after(()=>pg.close());
  await pg.exec("CREATE FUNCTION sqlite_now() RETURNS text LANGUAGE SQL STABLE AS $$SELECT to_char(timezone('UTC',CURRENT_TIMESTAMP),'YYYY-MM-DD HH24:MI:SS')$$;");await pg.exec(sql.join(';'));
  DB=new __postgresCompatTest.PostgresD1Database({async query(input){const text=typeof input==='string'?input:input.text,values=typeof input==='string'?[]:input.values||[];if(fail&&text.includes(fail))throw Error('INJECTED');const r=await pg.query(text,values);return {...r,rowCount:r.affectedRows??r.rows.length};}});
 }else{
  sqlite=new DatabaseSync(':memory:');t.after(()=>sqlite.close());sqlite.exec(sql.join(';'));
  const execute=s=>{if(fail&&s.sql.includes(fail))throw Error('INJECTED');const result=sqlite.prepare(s.sql).run(...s.values);return {meta:{changes:Number(result.changes)}};};
  const prepare=(sql,values=[])=>({sql,values,bind(...v){return prepare(sql,v);},async first(){return sqlite.prepare(sql).get(...values)||null;},async all(){return {results:sqlite.prepare(sql).all(...values)};},async run(){return execute(this);}});
  DB={prepare,async batch(list){sqlite.exec('BEGIN');try{const r=list.map(execute);sqlite.exec('COMMIT');return r;}catch(e){sqlite.exec('ROLLBACK');throw e;}}};
 }
 const p=(sql,...v)=>DB.prepare(sql).bind(...v),env={DB};
 const context=vm.createContext({crypto:webcrypto,ensureVerifiedRewardMessageV1276:async()=>{},messageRewardClaimToken:()=>webcrypto.randomUUID(),claimPigCoinMessageReward});
 vm.runInContext(specs+'\n'+common+'\nthis.claim=claimMessageRewardDirectV1222;this.spec=verifiedMessageRewardSpec;this.coupon=couponRewardSpec;',context);
 const reward=async(id=1,type='PIG_COIN',amount=50)=>{await p('INSERT INTO user_messages(id,user_id,title) VALUES(?,1,?)',id,'세력전 점령 보상').run();await p('INSERT INTO user_message_rewards(id,message_id,user_id,reward_type,reward_amount) VALUES(?,?,1,?,?)',id,id,type,amount).run();return p('SELECT * FROM user_message_rewards WHERE id=?',id).first();};
 return {DB,p,env,context,reward,fail:v=>{fail=v;},claim:r=>context.claim(env,{id:1},r,Number(r.message_id)),balance:async()=>Number((await p('SELECT balance FROM pig_coin_wallets_v1 WHERE user_id=1').first())?.balance||0)};
}
for(const postgres of [false,true]){
 const dialect=postgres?'PostgreSQL':'SQLite';
 test(`${dialect}: real message claim credits only Pig Coin and an owned receipt exactly once`,async t=>{
  const f=await fixture(t,postgres),r=await f.reward();
  await assert.rejects(()=>f.context.claim(f.env,{id:2},r,1),/보상/);
  const first=await f.claim(r);assert.equal(first.credited,true);assert.equal(first.balanceBefore,0);assert.equal(first.balanceAfter,50);
  assert.equal((await f.claim(r)).duplicate,true);assert.equal(await f.balance(),50);
  const ledger=(await f.p('SELECT * FROM pig_coin_ledger_v1').all()).results;assert.equal(ledger.length,1);assert.equal(Number(ledger[0].amount),50);assert.equal(ledger[0].source,'MESSAGE_REWARD');
  assert.equal(Number((await f.p('SELECT coin FROM users WHERE id=1').first()).coin),9000000000);
  assert.equal((await f.p('SELECT * FROM coin_logs').all()).results.length,0);assert.equal((await f.p('SELECT * FROM cnine_user_inventory').all()).results.length,0);
  assert.ok((await f.p('SELECT hidden_at FROM user_messages WHERE id=1').first()).hidden_at);
  assert.equal(f.context.coupon('PIG_COIN'),null);
 });
 test(`${dialect}: ledger, wallet or message failures roll back fully and permit retry`,async t=>{
  const f=await fixture(t,postgres),r=await f.reward();
  for(const point of ['INSERT INTO pig_coin_ledger_v1','UPDATE pig_coin_wallets_v1','UPDATE user_messages']){
   f.fail(point);await assert.rejects(()=>f.claim(r),/INJECTED/);f.fail('');
   for(const table of ['pig_coin_wallets_v1','pig_coin_ledger_v1','user_message_reward_claim_receipts_v1222'])assert.equal((await f.p('SELECT * FROM '+table).all()).results.length,0);
   assert.equal((await f.p('SELECT claimed_at FROM user_message_rewards WHERE id=1').first()).claimed_at,null);
   assert.equal((await f.p('SELECT hidden_at FROM user_messages WHERE id=1').first()).hidden_at,null);
  }
  assert.equal((await f.claim(r)).balanceAfter,50);
 });
 test(`${dialect}: concurrent duplicate and different message claims keep exact wallet deltas`,async t=>{
  const f=await fixture(t,postgres),a=await f.reward(),b=await f.reward(2);
  const result=await Promise.all([f.claim(a),f.claim(a),f.claim(b)]);assert.equal(result.filter(r=>r.credited).length,2);assert.equal(await f.balance(),100);
  const receipts=(await f.p('SELECT * FROM user_message_reward_claim_receipts_v1222 ORDER BY balance_after').all()).results;
  assert.deepEqual(receipts.map(r=>[Number(r.balance_before),Number(r.balance_after)]),[[0,50],[50,100]]);
 });
 test(`${dialect}: mixed bulk rewards support Pig Coin and keep ordinary coin accounting`,async t=>{
  const f=await fixture(t,postgres);await f.reward();await f.reward(2,'COIN',100);
  const deps={specFor:f.context.spec,claim:f.context.claim,canRecover:async()=>false};
  assert.equal((await claimMessageRewardBatch(f.env,{id:2},[1,2],deps)).filter(r=>r.error).length,2);
  assert.equal((await claimMessageRewardBatch(f.env,{id:1},[1,2],deps)).filter(r=>r.ok).length,2);
  assert.equal((await claimMessageRewardBatch(f.env,{id:1},[1,2],deps)).filter(r=>r.alreadyClaimed).length,2);
  assert.equal(await f.balance(),50);assert.equal(Number((await f.p('SELECT coin FROM users WHERE id=1').first()).coin),9000000100);
 });
 test(`${dialect}: uncertain commit can be retried and wallet overflow never consumes message`,async t=>{
  const f=await fixture(t,postgres),r=await f.reward(),batch=f.DB.batch.bind(f.DB);let drop=true;
  f.DB.batch=async s=>{const result=await batch(s);if(drop){drop=false;throw Error('LOST_ACK');}return result;};
  await assert.rejects(()=>f.claim(r),/LOST_ACK/);assert.equal((await f.claim(r)).duplicate,true);assert.equal(await f.balance(),50);
  const b=await f.reward(2);await f.p('UPDATE pig_coin_wallets_v1 SET balance=1000000000000 WHERE user_id=1').run();
  await assert.rejects(()=>f.claim(b));assert.equal((await f.p('SELECT claimed_at FROM user_message_rewards WHERE id=2').first()).claimed_at,null);
  assert.equal((await f.p('SELECT * FROM user_message_reward_claim_receipts_v1222 WHERE reward_id=2').all()).results.length,0);
 });
}
test('Pig Coin appears in claim-all and invalidates the real loot-shop balances',async()=>{
 const alerts=[],cache=[],messages=[{id:1,reward_type:'PIG_COIN',reward_amount:50}];
 const ctx=vm.createContext({document:{querySelectorAll:()=>[]},apiRequest:async()=>({results:[{ok:true,rewardType:'PIG_COIN',rewardAmount:50}],user:{}}),apiUserToLocal:v=>v,saveUser:()=>{},clearApiCache:k=>cache.push(k),alert:v=>alerts.push(v),renderShell:()=>{}});
 vm.runInContext(app.slice(app.indexOf('const MESSAGE_REWARD_META='),app.indexOf('async function loadMessages()'))+'\nthis.claim=claimAllMessageRewards;this.queue=claimableMessageRewards;',ctx);
 assert.equal(ctx.queue(messages).length,1);await ctx.claim(messages,{});assert.match(alerts[0],/피그코인 50개/);
 assert.ok(cache.includes('loot-shop/balance'));assert.ok(cache.includes('loot-shop/state'));
 assert.match(app.slice(app.indexOf('async function loadMessages'),app.indexOf('async function loadMessages')+8000),/clearApiCache\('loot-shop\/balance'\)/);
 assert.match(read('index.html'),/pigMessage=2130/);
});
