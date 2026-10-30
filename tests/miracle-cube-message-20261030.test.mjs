import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {webcrypto} from 'node:crypto';
import vm from 'node:vm';
import {PGlite} from '@electric-sql/pglite';
import {__postgresCompatTest} from '../functions/_postgres_d1_compat.js';

const source=readFileSync(new URL('../functions/api/[[path]].js',import.meta.url),'utf8');
const extract=(text,start,end)=>{const a=text.indexOf(start),b=text.indexOf(end,a+1);assert(a>=0&&b>a);return text.slice(a,b);};
const specs=extract(source,'const VERIFIED_MESSAGE_REWARD_TYPES=','const COUPON_REWARD_MAX=');
const claim=extract(source,'async function claimMessageRewardDirectV1222(','async function canSafelyRecoverFailedMessageRewardV1222(');
const client=readFileSync(new URL('../js/app.js',import.meta.url),'utf8');
const clientMeta=extract(client,'function messageRewardMeta(','function claimableMessageRewards(');
const CASES=[['SSS_MIRACLE_CUBE',5,'SSS 미라클큐브'],['MIRACLE_CUBE',300,'미라클 큐브'],['COIN',200000000000000,'코인']];

async function fixture(t,type,amount,initial=7){
  const pg=new PGlite();t.after(()=>pg.close());
  await pg.exec(`
    CREATE FUNCTION sqlite_now() RETURNS text LANGUAGE SQL STABLE AS $$SELECT to_char(timezone('UTC',CURRENT_TIMESTAMP),'YYYY-MM-DD HH24:MI:SS')$$;
    CREATE TABLE users(id bigint PRIMARY KEY,coin bigint,card_shards bigint DEFAULT 0);
    CREATE TABLE user_messages(id bigint PRIMARY KEY,user_id bigint,title text,is_read integer DEFAULT 0,read_at text,hidden_at text);
    CREATE TABLE user_message_rewards(id bigint PRIMARY KEY,message_id bigint UNIQUE,user_id bigint,reward_type text,reward_amount bigint,claimed_at text);
    CREATE TABLE user_message_reward_claim_receipts_v1222(reward_id bigint PRIMARY KEY,message_id bigint UNIQUE,user_id bigint,reward_type text,reward_amount bigint,claim_token text UNIQUE,balance_before bigint,balance_after bigint,source text,credited_at text);
    CREATE TABLE cnine_user_inventory(user_id bigint,item_code text,quantity bigint,unseen_quantity bigint,created_at text,updated_at text,PRIMARY KEY(user_id,item_code));
    CREATE TABLE inventory_logs(user_id bigint,item_code text,change_amount bigint,balance_after bigint,reason text,reference_type text,reference_id text);
    CREATE TABLE coin_logs(user_id bigint,change_amount bigint,balance_after bigint,reason text);
    CREATE TABLE wago_extension_reward_receipts(message_id bigint,user_id bigint,balance_after bigint);
    INSERT INTO users VALUES(1,11566678650956779,4321);
    INSERT INTO user_messages(id,user_id,title) VALUES(1,1,'씨나인 생방송 시청시간 500시간 달성 보상');
    INSERT INTO cnine_user_inventory VALUES(1,'MASTER_STAR',53,2,NULL,NULL);
  `);
  if(type!=='COIN'&&initial!==null)await pg.query('INSERT INTO cnine_user_inventory VALUES(1,$1,$2,1,NULL,NULL)',[type,initial]);
  await pg.query('INSERT INTO user_message_rewards VALUES(1,1,1,$1,$2,NULL)',[type,String(amount)]);
  let fail=false;const catalogCalls=[];
  const adapter={async query(input){
    const text=typeof input==='string'?input:input.text,values=typeof input==='string'?[]:input.values||[];
    if(fail&&text.includes(type==='COIN'?'INSERT INTO coin_logs':'INSERT INTO inventory_logs'))return pg.query('SELECT 1/0');
    const result=await pg.query(text,values);return {...result,rowCount:result.affectedRows??result.rows.length};
  }};
  const env={DB:new __postgresCompatTest.PostgresD1Database(adapter)};
  const context=vm.createContext({ensureVerifiedRewardMessageV1276:async()=>{},ensureSssCubeCatalog:async()=>catalogCalls.push('SSS_MIRACLE_CUBE'),ensureMiracleCubeCatalog:async()=>catalogCalls.push('MIRACLE_CUBE'),messageRewardClaimToken:()=>webcrypto.randomUUID(),MESSAGE_REWARD_META:{}});
  vm.runInContext(`${specs}\n${claim}\n${clientMeta}\nthis.claim=claimMessageRewardDirectV1222;this.present=presentMessageReward;this.clientMeta=messageRewardMeta;`,context);
  const reward=(await pg.query('SELECT * FROM user_message_rewards WHERE id=1')).rows[0];
  const snapshot=async()=>({users:(await pg.query('SELECT id::text,coin::text,card_shards::text FROM users')).rows,items:(await pg.query('SELECT item_code,quantity::text,unseen_quantity::text FROM cnine_user_inventory ORDER BY item_code')).rows});
  return {pg,type,amount,initial,catalogCalls,before:await snapshot(),snapshot,present:()=>context.present(reward),meta:()=>context.clientMeta(context.present(reward)),claim:()=>context.claim(env,{id:1},reward,1),fail:value=>{fail=value;}};
}

async function exactOnce(f,label){
  assert.equal(f.present().reward_supported,true);assert.equal(f.present().reward_label,label);assert.equal(f.meta().label,label);
  assert.equal((await f.claim()).credited,true);assert.equal((await f.claim()).duplicate,true);
  const expected=structuredClone(f.before);
  if(f.type==='COIN')expected.users[0].coin=String(BigInt(expected.users[0].coin)+BigInt(f.amount));
  else{
    let item=expected.items.find(row=>row.item_code===f.type);
    if(!item){item={item_code:f.type,quantity:'0',unseen_quantity:'0'};expected.items.push(item);expected.items.sort((a,b)=>a.item_code.localeCompare(b.item_code));}
    item.quantity=String(BigInt(item.quantity)+BigInt(f.amount));item.unseen_quantity=String(BigInt(item.unseen_quantity)+BigInt(f.amount));
    assert(f.catalogCalls.every(code=>code===f.type));assert.equal(f.catalogCalls.length,2);
  }
  assert.deepEqual(await f.snapshot(),expected,'Only the claimed currency/item changes; cubes remain unopened');
  const balance=f.type==='COIN'?expected.users[0].coin:expected.items.find(row=>row.item_code===f.type).quantity;
  const logs=(await f.pg.query('SELECT change_amount::text,balance_after::text FROM '+(f.type==='COIN'?'coin_logs':'inventory_logs'))).rows;
  assert.deepEqual(logs,[{change_amount:String(f.amount),balance_after:balance}]);
  const receipts=(await f.pg.query('SELECT reward_type,reward_amount::text,balance_after::text FROM user_message_reward_claim_receipts_v1222')).rows;
  assert.deepEqual(receipts,[{reward_type:f.type,reward_amount:String(f.amount),balance_after:balance}]);
  assert((await f.pg.query('SELECT claimed_at FROM user_message_rewards')).rows[0].claimed_at);
  assert((await f.pg.query('SELECT hidden_at FROM user_messages')).rows[0].hidden_at);
}

for(const [type,amount,label] of CASES){
  test(type+' exact reward claims once and preserves other assets',async t=>exactOnce(await fixture(t,type,amount),label));
  test(type+' failed ledger rolls back the claim and allows a safe retry',async t=>{
    const f=await fixture(t,type,amount);f.fail(true);await assert.rejects(f.claim(),/division by zero/);
    assert.deepEqual(await f.snapshot(),f.before);
    for(const table of ['coin_logs','inventory_logs','user_message_reward_claim_receipts_v1222'])assert.equal((await f.pg.query('SELECT * FROM '+table)).rows.length,0);
    assert.equal((await f.pg.query('SELECT claimed_at FROM user_message_rewards')).rows[0].claimed_at,null);
    assert.equal((await f.pg.query('SELECT hidden_at FROM user_messages')).rows[0].hidden_at,null);
    f.catalogCalls.length=0;f.fail(false);await exactOnce(f,label);
  });
}
for(const [type,amount,label] of CASES.filter(([type])=>type!=='COIN'))test(type+' creates previously absent unopened inventory',async t=>exactOnce(await fixture(t,type,amount,null),label));
