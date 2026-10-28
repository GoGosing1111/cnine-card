import test from 'node:test';
import assert from 'node:assert/strict';
import {weeklyFixture} from './helpers/ranked-duo-weekly.mjs';
import {DUO_RANDOM_MODE} from '../shared/ranked-duo-random-v4.mjs';
import {duoVictoryWrites} from '../functions/_ranked_duo_economy.js';

const initial='11566656593956779',reward=57500000;
const balance=async f=>(await f.pg.query('SELECT coin::text AS coin FROM users WHERE id=2')).rows[0].coin;
const ledger=async f=>(await f.pg.query('SELECT change_amount::text AS amount,balance_after::text AS balance,reason FROM coin_logs WHERE user_id=2')).rows;
async function fixture(t,postgres){
 const f=await weeklyFixture(t,{postgres,matchmaking:DUO_RANDOM_MODE});await f.active();
 const s=await f.season();s.config.rewards.winCoin=reward;
 await f.p('UPDATE ranked_duo_seasons_v1 SET config_json=? WHERE id=?',JSON.stringify(s.config),s.id).run();
 await f.p('UPDATE user_cards SET breakthrough_level=200 WHERE user_id=2').run();
 return f;
}

for(const postgres of [true,'pipeline'])test(`${postgres} an existing large wallet completes a victory and replay never charges or credits twice`,async t=>{
 const f=await fixture(t,postgres);await f.pg.query('UPDATE users SET coin=$1::bigint WHERE id=2',[initial]);
 const before=(await f.call('ranked-duo/status',{user:2})).data;
 const ticket=await f.call('ranked-duo/match',{user:2,method:'POST'});assert.equal(ticket.status,200);
 const body={requestId:'large-wallet-victory-20261028',matchToken:ticket.data.token};
 const result=await f.call('ranked-duo/fight',{user:2,method:'POST',body});
 assert.equal(result.status,200,JSON.stringify(result.data));assert.equal(result.data.status,'COMPLETED');assert.equal(result.data.result,'WIN');
 assert.equal(await balance(f),(BigInt(initial)+BigInt(reward)).toString());
 assert.deepEqual(await ledger(f),[{amount:String(reward),balance:(BigInt(initial)+BigInt(reward)).toString(),reason:'RANKED_DUO_WIN '+result.data.matchId}]);
 assert.deepEqual((await f.call('ranked-duo/replay',{user:2,method:'POST',body:{matchId:result.data.matchId}})).data,result.data);
 assert.deepEqual((await f.call('ranked-duo/fight',{user:2,method:'POST',body})).data,result.data);
 const after=(await f.call('ranked-duo/status',{user:2})).data;
 assert.equal(after.energy.current,before.energy.current-1);assert.equal(after.player.wins,1);assert.equal(after.player.losses,0);assert.equal(after.pendingMatchId,null);
 assert.equal((await ledger(f)).length,1);assert.equal(await balance(f),(BigInt(initial)+BigInt(reward)).toString());
 assert.equal(Number((await f.p('SELECT SUM(coin) n FROM users WHERE id<>2').first()).n),0);
});

test('a previously interrupted paid victory recovers by its existing match ID after a failed ledger transaction',async t=>{
 const f=await fixture(t,'pipeline');await f.pg.query('UPDATE users SET coin=$1::bigint WHERE id=2',[initial]);
 const ticket=(await f.call('ranked-duo/match',{user:2,method:'POST'})).data;
 f.fail('INSERT INTO coin_logs');
 assert.equal((await f.call('ranked-duo/fight',{user:2,method:'POST',body:{requestId:'pending-wallet-victory-20261028',matchToken:ticket.token}})).status,500);
 f.fail('');
 const pending=(await f.call('ranked-duo/status',{user:2})).data;
 assert.ok(pending.pendingMatchId);assert.equal(pending.energy.current,9);assert.equal(pending.player.wins,0);assert.equal(await balance(f),initial);assert.deepEqual(await ledger(f),[]);
 f.advance(31000);
 const result=await f.call('ranked-duo/replay',{user:2,method:'POST',body:{matchId:pending.pendingMatchId}});
 assert.equal(result.status,200);assert.equal(result.data.matchId,pending.pendingMatchId);assert.equal(result.data.result,'WIN');
 assert.equal((await f.call('ranked-duo/status',{user:2})).data.energy.current,9);assert.equal(await balance(f),(BigInt(initial)+BigInt(reward)).toString());
 assert.equal((await ledger(f)).length,1);assert.equal(Number((await f.p('SELECT COUNT(*) n FROM ranked_duo_matches_v1').first()).n),1);
});

test('normal safe cap, negative balances and BIGINT overflow still reject the whole credit',async t=>{
 const f=await fixture(t,'pipeline');
 for(const value of [(BigInt(Number.MAX_SAFE_INTEGER)-BigInt(reward)+1n).toString(),'9223372036854775807','-1']){
  await f.pg.query('UPDATE users SET coin=$1::bigint WHERE id=2',[value]);
  await assert.rejects(f.DB.batch(duoVictoryWrites(f.env,2,reward,'boundary')));
  assert.equal(await balance(f),value);assert.deepEqual(await ledger(f),[]);
 }
 for(const [value,amount] of [[String(Number.MAX_SAFE_INTEGER-reward),reward],['9223372036854775806',1]]){
  await f.pg.query('UPDATE users SET coin=$1::bigint WHERE id=2',[value]);
  await f.DB.batch(duoVictoryWrites(f.env,2,amount,'valid-boundary'));
  assert.equal(await balance(f),(BigInt(value)+BigInt(amount)).toString());
 }
});

test('SQLite retains the safe-integer wallet boundary and zero rewards do not write',async t=>{
 const f=await fixture(t,false);
 assert.deepEqual(duoVictoryWrites(f.env,2,0,'no-reward'),[]);
 await f.p('UPDATE users SET coin=? WHERE id=2',Number.MAX_SAFE_INTEGER-reward+1).run();
 await assert.rejects(f.DB.batch(duoVictoryWrites(f.env,2,reward,'sqlite-boundary')));
 assert.equal(Number((await f.p('SELECT COUNT(*) n FROM coin_logs').first()).n),0);
});
