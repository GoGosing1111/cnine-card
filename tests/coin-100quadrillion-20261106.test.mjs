import test from 'node:test';
import assert from 'node:assert/strict';
import {PGlite} from '@electric-sql/pglite';
import {__postgresCompatTest} from '../functions/_postgres_d1_compat.js';
import {prepareUnifiedDropGrant} from '../functions/_drop_pool.js';
import {jointGuard,jointGuardEnd} from '../functions/_joint_atomic.js';
import {coinInteger,coinValue,addCoins,coinCreditLimit,MAX_COIN_SQL} from '../shared/coin-integer-v1.mjs';
import {superstarFixture} from './helpers/superstar-pack-bulk-fixture.mjs';
import {superstarBulkRequestId,validateSuperstarBulkReceipt} from '../shared/superstar-pack-bulk-v1.mjs';
import {readFileSync} from 'node:fs';

test('exact wallet arithmetic preserves every coin through 10경 and database boundaries',()=>{
  for(const value of ['9007199254740991','9007199254740992','99999999999999999','100000000000000000','100000000000000001']) {
    assert.equal(BigInt(addCoins(value,1)),BigInt(value)+1n);
    assert.equal(BigInt(addCoins(value,-1)),BigInt(value)-1n);
    assert.doesNotThrow(()=>JSON.stringify({coin:coinValue(value)}));
  }
  for(const value of [100000000000000000,NaN,Infinity,-1,'1e17','1.5',null,undefined,true,MAX_COIN_SQL+'0']) assert.throws(()=>coinInteger(value));
  assert.throws(()=>addCoins(MAX_COIN_SQL,1));assert.throws(()=>addCoins(0,-1));
  assert.equal(coinCreditLimit(1),'9223372036854775806');
});

async function dropFixture(t,coin) {
  const pg=new PGlite();t.after(()=>pg.close());
  await pg.exec(`CREATE TABLE users(id BIGINT PRIMARY KEY,coin BIGINT,card_shards BIGINT DEFAULT 0,magic_crystals BIGINT DEFAULT 0);
    CREATE TABLE coin_logs(user_id BIGINT,change_amount BIGINT,balance_after BIGINT,reason TEXT);
    CREATE TABLE joint_atomic_guards_v1(token TEXT PRIMARY KEY,verified INTEGER NOT NULL CHECK(verified=1));`);
  await pg.query('INSERT INTO users(id,coin) VALUES(1,$1)',[coin]);
  let fail=false;
  const DB=new __postgresCompatTest.PostgresD1Database({async query(q){
    if(fail&&(q.text||q).includes('INSERT INTO coin_logs'))throw Error('INJECTED_LEDGER_FAILURE');
    const r=await pg.query(q.text||q,q.values||[]);return {...r,rowCount:r.affectedRows??r.rows.length};
  }});
  return {pg,env:{DB},fail:value=>fail=value,exact:async()=>String((await pg.query('SELECT coin::text coin FROM users')).rows[0].coin)};
}
for(const initial of ['9007199254740991','99999999999999999','100000000000000000','100000000000000001'])test('PVE unified grant and atomic proof retain exact balance '+initial,async t=>{
  const f=await dropFixture(t,initial),amount=7;
  const plan={userId:1,requestId:'exact-pve',sourceType:'PVE',sourceId:'81',rewards:[{rewardType:'COIN',quantity:amount}]};
  const grant=await prepareUnifiedDropGrant(f.env,plan,{writePoolLedger:false});
  await f.env.DB.batch([...grant.statements,...grant.proofs.flatMap((proof,i)=>[jointGuard(f.env.DB,'proof'+i,proof.sql,proof.values),jointGuardEnd(f.env.DB,'proof'+i)])]);
  const expected=(BigInt(initial)+BigInt(amount)).toString();
  assert.equal(await f.exact(),expected);
  assert.equal(String((await f.pg.query('SELECT balance_after::text balance FROM coin_logs')).rows[0].balance),expected);
});
test('PVE ledger failure rolls back large wallet credit',async t=>{
  const f=await dropFixture(t,'100000000000000001');
  const grant=await prepareUnifiedDropGrant(f.env,{userId:1,requestId:'rollback',sourceType:'PVE',sourceId:'81',rewards:[{rewardType:'COIN',quantity:7}]},{writePoolLedger:false});
  f.fail(true);await assert.rejects(f.env.DB.batch(grant.statements),/INJECTED/);
  assert.equal(await f.exact(),'100000000000000001');
  assert.equal((await f.pg.query('SELECT * FROM coin_logs')).rows.length,0);
});
test('PVE proof does not round upward and reject a valid ten-coin reward',async t=>{
  const f=await dropFixture(t,'100000000000000001');
  const grant=await prepareUnifiedDropGrant(f.env,{userId:1,requestId:'pve-rounded-proof',sourceType:'PVE',sourceId:'81',rewards:[{rewardType:'COIN',quantity:10}]},{writePoolLedger:false});
  await f.env.DB.batch([...grant.statements,jointGuard(f.env.DB,'proof',grant.proofs[0].sql,grant.proofs[0].values),jointGuardEnd(f.env.DB,'proof')]);
  assert.equal(await f.exact(),'100000000000000011');
});
test('world raid settlement compares exact BIGINT balance and commits its saved receipt',async t=>{
  const f=await dropFixture(t,'100000000000000001');
  await f.pg.exec(`CREATE FUNCTION sqlite_now() RETURNS TEXT LANGUAGE SQL STABLE AS $$ SELECT CURRENT_TIMESTAMP::text $$;
    CREATE TABLE raid_participants(id BIGINT,reward_claimed INTEGER,updated_at TEXT);INSERT INTO raid_participants VALUES(9,0,NULL);
    CREATE TABLE raid_user_reward_v1293(instance_id BIGINT,user_id BIGINT,status TEXT,updated_at TEXT);INSERT INTO raid_user_reward_v1293 VALUES(2,1,'PENDING',NULL);
    CREATE TABLE raid_reward_receipts(instance_id BIGINT,user_id BIGINT,status TEXT,response_json TEXT,error_message TEXT,updated_at TEXT);INSERT INTO raid_reward_receipts VALUES(2,1,'PENDING',NULL,NULL,NULL);
    CREATE TABLE shard_logs(user_id BIGINT,change_amount BIGINT,balance_after BIGINT,reason TEXT);`);
  const source=readFileSync(new URL('../functions/api/[[path]].js',import.meta.url),'utf8'),start=source.indexOf('const inventoryGrant=await raidInventoryGrantStatementsV1293'),end=source.indexOf('response.user=await profile',start);
  assert(start>0&&end>start);
  const AsyncFunction=Object.getPrototypeOf(async function(){}).constructor;
  const settle=new AsyncFunction('env','addCoins','coinInteger',`const user={id:1},row={id:9,instance_id:2},fixedRewardCoin=10,fixedRewardShards=0,fixedRewardMagicCrystals=0,rewardDisplay={inventoryRewards:[],entries:[],rareDrops:[]},rewardCfg={participationMagicCrystals:0},rankMagicCrystals=0,finalRank=1,finalDamage=10;const raidInventoryGrantStatementsV1293=async()=>({balances:[],statements:[]});${source.slice(start,end)};return response;`);
  const result=await settle(f.env,addCoins,coinInteger);
  assert.equal(String(result.balanceAfter),'100000000000000011');assert.equal(await f.exact(),'100000000000000011');
  const saved=(await f.pg.query('SELECT status,response_json FROM raid_reward_receipts')).rows[0];
  assert.equal(saved.status,'COMPLETED');assert.equal(JSON.parse(saved.response_json).balanceAfter,'100000000000000011');
});
test('superstar bulk at 10경 plus one coin debits exactly once with valid browser receipt',async t=>{
  const f=await superstarFixture(t,{coin:'100000000000000001',price:3,successRate:0,types:1}),rid=superstarBulkRequestId();
  const result=await f.call(1000,rid);assert.equal(result.status,200,JSON.stringify(result.body));
  validateSuperstarBulkReceipt(result.body,{requestId:rid,userId:1,count:1000});
  assert.equal(String((await f.pg.query('SELECT coin::text coin FROM users WHERE id=1')).rows[0].coin),'99999999999997001');
  assert.equal((await f.call(1000,rid)).status,200);
  assert.equal((await f.pg.query('SELECT * FROM coin_logs')).rows.length,1);
});

for(const name of ['cnine-streamer-box','funding-gift','recruitment-gift','pingdu-thanks-gift','reversecall-streamer-gift','worm-contest-gift','sig-hunter-box'])test(name+' opens once at 10경 and preserves the last coin',async t=>{
 const module=await import('./helpers/'+name+'-fixture.mjs'),factory=Object.entries(module).find(([key])=>key.endsWith('Fixture'))[1],f=await factory(t);
 await f.stock(1);await f.pg.exec('UPDATE users SET coin=100000000000000001 WHERE id=1');
 const rid=crypto.randomUUID(),result=await f.open(rid);
 const expected=(100000000000000001n+BigInt(result.rewards.coin)).toString();
 assert.equal((await f.pg.query('SELECT coin::text coin FROM users WHERE id=1')).rows[0].coin,expected);
 assert.equal((await f.pg.query('SELECT balance_after::text coin FROM coin_logs WHERE user_id=1')).rows[0].coin,expected);
 await f.open(rid);assert.equal((await f.pg.query('SELECT * FROM coin_logs')).rows.length,1);
});
