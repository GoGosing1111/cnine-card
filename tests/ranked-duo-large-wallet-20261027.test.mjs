import test from 'node:test';
import assert from 'node:assert/strict';
import {weeklyFixture,day} from './helpers/ranked-duo-weekly.mjs';

async function fixture(t,postgres){
 const f=await weeklyFixture(t,{postgres});await f.active();const s=await f.season();
 s.config.challenger={...s.config.challenger,rewardCoin:3009,rewardShards:0};
 await f.p('UPDATE ranked_duo_seasons_v1 SET config_json=? WHERE id=?',JSON.stringify(s.config),s.id).run();
 f.advance(7*day);await f.tick();
 return f;
}
const wallet=async f=>(await f.pg.query('SELECT coin::text AS coin FROM users WHERE id=2')).rows[0].coin;
const count=async f=>Number((await f.p('SELECT COUNT(*) AS n FROM ranked_duo_rewards_v3').first()).n);

for(const postgres of [true,'pipeline'])test(`${postgres} an already-large PostgreSQL wallet receives an odd reward exactly once`,async t=>{
 const f=await fixture(t,postgres),initial='9108034310345288',expected='9108034310348297';
 await f.pg.query('UPDATE users SET coin=$1::bigint WHERE id=2',[initial]);
 await f.tick();assert.equal(await wallet(f),expected);assert.equal(await count(f),4);
 const ledger=(await f.pg.query('SELECT change_amount::text AS amount,balance_after::text AS balance FROM coin_logs WHERE user_id=2')).rows;
 assert.deepEqual(ledger,[{amount:'3009',balance:expected}]);
 await f.tick();assert.equal((await f.season()).status,'CLOSED');await f.tick();
 assert.equal(await wallet(f),expected);assert.equal(await count(f),4);
});

test('normal safe-integer crossing, BIGINT overflow and negative wallets still roll back the whole batch',async t=>{
 const f=await fixture(t,'pipeline');
 for(const value of [String(BigInt(Number.MAX_SAFE_INTEGER)-3008n),'9223372036854772799','-1']){
  await f.pg.query('UPDATE users SET coin=$1::bigint WHERE id=2',[value]);
  await assert.rejects(f.tick());assert.equal(await wallet(f),value);assert.equal(await count(f),0);
  assert.equal(Number((await f.p('SELECT last_rank FROM ranked_duo_settlement_v3').first()).last_rank),0);
  assert.equal(Number((await f.p('SELECT SUM(coin) AS n FROM users WHERE id<>2').first()).n),0);
  assert.equal(Number((await f.p('SELECT COUNT(*) AS n FROM coin_logs').first()).n),0);
 }
});

test('large-wallet ledger failure rolls back exact balances and safely resumes',async t=>{
 const f=await fixture(t,'pipeline'),initial='9108034310345289';
 await f.pg.query('UPDATE users SET coin=$1::bigint WHERE id=2',[initial]);
 f.fail('INSERT INTO coin_logs');await assert.rejects(f.tick(),/INJECTED/);f.fail('');
 assert.equal(await wallet(f),initial);assert.equal(await count(f),0);
 await f.tick();assert.equal(await wallet(f),'9108034310348298');assert.equal(await count(f),4);
});
