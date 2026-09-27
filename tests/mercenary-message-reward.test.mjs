import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
import {webcrypto} from 'node:crypto';
import {PGlite} from '@electric-sql/pglite';
import {DatabaseSync} from 'node:sqlite';
import {__postgresCompatTest} from '../functions/_postgres_d1_compat.js';
import {MERCENARY_ACCOUNTING_SCHEMA} from '../functions/_mercenary_draw_accounting.js';
import {claimOmegaMercenaryMessageReward} from '../functions/_mercenary_message_reward.js';
import {claimMessageRewardBatch} from '../functions/_message_reward_batch.js';
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
  ...MERCENARY_ACCOUNTING_SCHEMA
 ];
 let DB,fail='';
 if(postgres){
  const pg=new PGlite();t.after(()=>pg.close());await pg.exec("CREATE FUNCTION sqlite_now() RETURNS text LANGUAGE SQL STABLE AS $$SELECT to_char(timezone('UTC',CURRENT_TIMESTAMP),'YYYY-MM-DD HH24:MI:SS')$$;");await pg.exec(sql.join(';'));
  DB=new __postgresCompatTest.PostgresD1Database({async query(input){const text=typeof input==='string'?input:input.text,values=typeof input==='string'?[]:input.values||[];if(fail&&text.includes(fail))throw Error('INJECTED');const r=await pg.query(text,values);return {...r,rowCount:r.affectedRows??r.rows.length};}});
 }else{
  const db=new DatabaseSync(':memory:');t.after(()=>db.close());db.exec(sql.join(';'));
  const execute=s=>{if(fail&&s.sql.includes(fail))throw Error('INJECTED');const result=db.prepare(s.sql).run(...s.values);return {meta:{changes:Number(result.changes)}};};
  const prepare=(sql,values=[])=>({sql,values,bind(...v){return prepare(sql,v);},async first(){return db.prepare(sql).get(...values)||null;},async all(){return {results:db.prepare(sql).all(...values)};},async run(){return execute(this);}});
  DB={prepare,async batch(list){db.exec('BEGIN');try{const results=list.map(execute);db.exec('COMMIT');return results;}catch(e){db.exec('ROLLBACK');throw e;}}};
 }
 const p=(sql,...v)=>DB.prepare(sql).bind(...v),env={DB};
 const context=vm.createContext({crypto:webcrypto,ensureVerifiedRewardMessageV1276:async()=>{},messageRewardClaimToken:()=>webcrypto.randomUUID(),claimOmegaMercenaryMessageReward});
 vm.runInContext(specs+'\n'+common+'\nthis.claim=claimMessageRewardDirectV1222;this.spec=verifiedMessageRewardSpec;this.coupon=couponRewardSpec;',context);
 const reward=async(id=1,type='MERCENARY_OMEGA_X',amount=1)=>{await p("INSERT INTO user_messages(id,user_id,title) VALUES(?,1,'충신선물')",id).run();await p('INSERT INTO user_message_rewards(id,message_id,user_id,reward_type,reward_amount) VALUES(?,?,1,?,?)',id,id,type,amount).run();return p('SELECT * FROM user_message_rewards WHERE id=?',id).first();};
 return {DB,p,env,context,reward,fail:v=>{fail=v;},claim:r=>context.claim(env,{id:1},r,Number(r.message_id)),copies:async()=>Number((await p("SELECT total_copies FROM user_mercenary_cards_v1 WHERE user_id=1 AND mercenary_code='V-021'").first())?.total_copies||0)};
}
for(const postgres of [false,true]){
 const dialect=postgres?'PostgreSQL':'SQLite';
 test(`${dialect}: only the message owner receives one permanent Omega, with durable replay protection`,async t=>{
  const f=await fixture(t,postgres),r=await f.reward();assert.equal(await f.copies(),0);
  await assert.rejects(()=>f.context.claim(f.env,{id:2},r,1),/보상/);
  const first=await f.claim({...r,reward_amount:999});assert.equal(first.credited,true);assert.equal(first.balanceBefore,0);assert.equal(first.balanceAfter,1);
  assert.equal((await f.claim(r)).duplicate,true);assert.equal(await f.copies(),1);assert.equal(f.context.coupon('MERCENARY_OMEGA_X'),null);
  assert.equal((await f.p('SELECT * FROM mercenary_card_acquisitions_v1').all()).results.length,1);
  assert.equal((await f.p('SELECT * FROM mercenary_card_atomic_guard_v1').all()).results.length,0);
  assert.equal(Number((await f.p('SELECT coin FROM users WHERE id=1').first()).coin),9000000000);
  assert.ok((await f.p('SELECT hidden_at FROM user_messages WHERE id=1').first()).hidden_at);
 });
 test(`${dialect}: simultaneous claims and later copies use the existing duplicate accounting`,async t=>{
  const f=await fixture(t,postgres),a=await f.reward(),b=await f.reward(2);
  const results=await Promise.all([f.claim(a),f.claim(a),f.claim(b)]);assert.equal(results.filter(r=>r.credited).length,2);assert.equal(await f.copies(),2);
  const row=await f.p('SELECT * FROM user_mercenary_cards_v1 WHERE user_id=1').first();assert.equal(Number(row.duplicate_count),1);
  const receipts=(await f.p('SELECT * FROM user_message_reward_claim_receipts_v1222 ORDER BY balance_after').all()).results;
  assert.deepEqual(receipts.map(r=>[Number(r.balance_before),Number(r.balance_after)]),[[0,1],[1,2]]);
 });
 test(`${dialect}: acquisition, receipt and message failures all roll back and permit retry`,async t=>{
  const f=await fixture(t,postgres),r=await f.reward();
  for(const point of ['INSERT INTO user_mercenary_cards_v1','INSERT INTO mercenary_card_acquisitions_v1','UPDATE user_message_reward_claim_receipts','UPDATE user_messages']){
   f.fail(point);await assert.rejects(()=>f.claim(r),/INJECTED/);f.fail('');assert.equal(await f.copies(),0);
   for(const table of ['mercenary_card_acquisitions_v1','user_message_reward_claim_receipts_v1222','mercenary_card_atomic_guard_v1'])assert.equal((await f.p('SELECT * FROM '+table).all()).results.length,0);
   assert.equal((await f.p('SELECT claimed_at FROM user_message_rewards WHERE id=1').first()).claimed_at,null);assert.equal((await f.p('SELECT hidden_at FROM user_messages WHERE id=1').first()).hidden_at,null);
  }
  assert.equal((await f.claim(r)).balanceAfter,1);
 });
 test(`${dialect}: invalid amounts, claimed or mismatched records never grant`,async t=>{
  const f=await fixture(t,postgres);
  for(const amount of [0,2,-1]){const r=await f.reward(amount+3,'MERCENARY_OMEGA_X',amount);await assert.rejects(()=>f.claim(r),/보상/)}
  const r=await f.reward();await f.p("UPDATE user_message_rewards SET claimed_at='old' WHERE id=1").run();await assert.rejects(()=>f.claim(r),/기존 수령/);
  await f.p('UPDATE user_message_rewards SET claimed_at=NULL WHERE id=1').run();await f.p('UPDATE user_messages SET user_id=2 WHERE id=1').run();await assert.rejects(()=>f.claim(r),/보상/);
  assert.equal(await f.copies(),0);
 });
 test(`${dialect}: uncertain commit and mixed claim-all do not duplicate the card`,async t=>{
  const f=await fixture(t,postgres),a=await f.reward(),batch=f.DB.batch.bind(f.DB);let drop=true;
  f.DB.batch=async s=>{const result=await batch(s);if(drop){drop=false;throw Error('LOST_ACK')}return result};
  await assert.rejects(()=>f.claim(a),/LOST_ACK/);assert.equal((await f.claim(a)).duplicate,true);
  await f.reward(2);await f.reward(3,'COIN',100);
  const deps={specFor:f.context.spec,claim:f.context.claim,canRecover:async()=>false};
  const result=await claimMessageRewardBatch(f.env,{id:1},[1,2,3],deps);assert.equal(result.filter(r=>r.ok).length,2);assert.equal(result.filter(r=>r.alreadyClaimed).length,1);
  assert.equal((await claimMessageRewardBatch(f.env,{id:2},[1,2,3],deps)).filter(r=>r.error).length,3);
  assert.equal(await f.copies(),2);assert.equal(Number((await f.p('SELECT coin FROM users WHERE id=1').first()).coin),9000000100);
 });
 test(`${dialect}: orphaned or conflicting acquisition IDs fail closed`,async t=>{
  const f=await fixture(t,postgres),r=await f.reward();
  await f.p("INSERT INTO mercenary_card_acquisitions_v1 VALUES('message:mercenary:1',2,'V-021',0,1,0,'2026-09-27')").run();
  await assert.rejects(()=>f.claim(r));assert.equal(await f.copies(),0);assert.equal((await f.p('SELECT * FROM user_message_reward_claim_receipts_v1222').all()).results.length,0);
 });
}
test('older inboxes render server reward metadata and include Omega in claim-all',async()=>{
 const server=vm.createContext({});vm.runInContext(specs+';this.present=presentMessageReward;',server);
 const message=server.present({id:7,title:'충신선물',body:'충신선물',message_type:'ITEM_REWARD',reward_type:'MERCENARY_OMEGA_X',reward_amount:1});
 assert.equal(message.reward_supported,true);assert.equal(message.reward_label,'오메가-X SSS');
 const box={innerHTML:'',querySelectorAll:()=>[]},all={},ctx=vm.createContext({document:{getElementById:id=>id==='messageList'?box:all},apiRequest:async()=>({messages:[message],unread:1}),updateMessageNewBadges:()=>{},escapeHtml:v=>String(v??'')});
 const start=app.indexOf('const MESSAGE_REWARD_META='),end=app.indexOf('// V1799: 2차 인증',start);vm.runInContext(app.slice(start,end)+';delete MESSAGE_REWARD_META.MERCENARY_OMEGA_X;this.load=loadMessages;this.queue=claimableMessageRewards;',ctx);
 await ctx.load();assert.equal(all.disabled,false);assert.equal(ctx.queue([message]).length,1);assert.match(box.innerHTML,/오메가-X SSS/);assert.match(box.innerHTML,/data-claim-message="7"[^>]*>보상 받기/);
});
