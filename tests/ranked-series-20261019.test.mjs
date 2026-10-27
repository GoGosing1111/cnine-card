import {rankedFixture as fixture} from './helpers/ranked-series-fixture.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
import {rankedOwnedMercenaries,rankedSelectedMercenaries} from '../functions/_mercenary_account.js';
import {readRankedRosters,saveRankedRoster,saveRankedSeriesTicket,readRankedSeriesTicket,rankedTicketPreview,rankedOwnershipGuard} from '../functions/_ranked_series.js';
import {commitRankedFight,rankedFightReceipt,readRankedEnergy} from '../functions/_ranked_reform.js';
import {rankedSeriesCodes,simulateRankedSeries,rankedSeriesReceipt} from '../shared/ranked-series-v1.mjs';
import {createPvpBattleV2} from '../functions/_battle_v2_preview.js';
import {operatingMercenaries,tierCards} from './helpers/mercenary-operating-roster-v2144.mjs';

const codes=['V-001','V-002','V-003'];
test('requires three distinct types; copies and malformed inputs cannot qualify',()=>{
 for(const value of [[],codes.slice(0,2),[...codes,'V-004'],['V-001','V-001','V-002'],[null,...codes.slice(1)],'V-001'])assert.throws(()=>rankedSeriesCodes(value));
 assert.deepEqual(rankedSeriesCodes(codes),codes);
});
for(const postgres of [false,true])test(`${postgres?'PostgreSQL':'SQLite'}: ownership, frozen order, privacy, one set settlement and replay`,async t=>{
 const f=await fixture(t,postgres),{env,q}=f;
 assert.equal((await readRankedRosters(env,[1])).get(1).ready,false,'no automatic ranked enrollment');
 await assert.rejects(saveRankedRoster(env,{id:1},{codes:['V-001','V-001','V-001'],revision:0}));
 await assert.rejects(saveRankedRoster(env,{id:1},{codes:['V-001','V-002','V-004'],revision:0}),/보유/);
 await q('UPDATE user_mercenary_cards_v1 SET total_copies=0 WHERE user_id=1 AND mercenary_code=?','V-003').run();
 await q('UPDATE user_mercenary_cards_v1 SET total_copies=99 WHERE user_id=1 AND mercenary_code=?','V-001').run();
 assert.equal((await rankedOwnedMercenaries(env,[1])).get(1).length,2);
 await assert.rejects(saveRankedRoster(env,{id:1},{codes,revision:0}));
 await q('UPDATE user_mercenary_cards_v1 SET total_copies=1 WHERE user_id=1 AND mercenary_code=?','V-003').run();
 await saveRankedRoster(env,{id:1},{codes,revision:0});await saveRankedRoster(env,{id:2},{codes:[...codes].reverse(),revision:0});
 await assert.rejects(saveRankedRoster(env,{id:1},{codes,revision:0}),/다른 창/);
 const ticket=await f.createTicket();assert.deepEqual(ticket.A,codes);assert.deepEqual(ticket.B,[...codes].reverse());
 assert.equal(await f.createTicket('racing-ticket'),null,'failed competing insert cannot overwrite winner payload');
 const preview=await rankedTicketPreview(env,ticket);assert.deepEqual(preview.opponent.map(m=>m.code),codes);assert.equal(preview.opponentOrderHidden,true);assert.ok(!('B' in preview));
 await assert.rejects(saveRankedRoster(env,{id:1},{codes:[...codes].reverse(),revision:1}),/매칭 중/);
 await saveRankedRoster(env,{id:2},{codes,revision:1});assert.deepEqual((await readRankedSeriesTicket(env,'t',1,2)).B,[...codes].reverse());
 assert.equal(await readRankedSeriesTicket(env,'t',2,1),null);
 const selected=await rankedSelectedMercenaries(env,new Map([[1,ticket.A],[2,ticket.B]]));assert.deepEqual(selected.get(2).map(m=>m.code),ticket.B);
 const series=simulateRankedSeries({createBattle:()=>({result:{winner:'A',reason:'ELIMINATION',actions:5}}),options:{},seed:3,attackerMercenaries:selected.get(1),defenderMercenaries:selected.get(2)});
 const user={id:1},energy=await readRankedEnergy(env,user,f.settings.energy),writes=()=>[...rankedOwnershipGuard(env,new Map([[1,ticket.A],[2,ticket.B]])),q('UPDATE pvp_profiles SET season_score=1024,wins=wins+1 WHERE user_id=1'),q('UPDATE users SET coin=coin+50 WHERE id=1'),q('INSERT INTO pvp_match_history VALUES(1,?)','A')];
 const commit=()=>commitRankedFight(env,{user,settings:f.settings,ticket:{token:'t'},requestId:'set-1',energy,beforeScore:1000,writes:writes(),response:{result:'WIN',scoreAfter:1024,rankedSeries:rankedSeriesReceipt(series)}});
 await q('UPDATE user_mercenary_cards_v1 SET total_copies=0 WHERE user_id=2 AND mercenary_code=?',codes[2]).run();
 await assert.rejects(commit());assert.equal((await q('SELECT used_at FROM pvp_ranked_match_tickets_v1671 WHERE token=?','t').first()).used_at,null);assert.equal((await q('SELECT coin FROM users WHERE id=1').first()).coin,100);
 await q('UPDATE user_mercenary_cards_v1 SET total_copies=1 WHERE user_id=2 AND mercenary_code=?',codes[2]).run();
 await commit();await assert.rejects(commit());const receipt=await rankedFightReceipt(env,1,'set-1','t');assert.equal(receipt.replayed,true);assert.deepEqual(receipt.rankedSeries.score,{A:2,B:0});assert.equal(receipt.energy.energy,9);assert.equal(receipt.coinAfter,150);
 assert.equal((await q('SELECT COUNT(*) n FROM pvp_match_history').first()).n,1);assert.equal((await q('SELECT season_score FROM pvp_profiles WHERE user_id=2').first()).season_score,1000);
});
test('2:0, 0:2 and 2:1 stop at two wins; every round gets new cards and mercenaries',()=>{
 const mercenaries=codes.map(code=>({code,name:code})),options={attackerCards:[{hp:100}],defenderCards:[{hp:100}]};
 for(const outcomes of [['A','A'],['B','B'],['A','B','A'],['B','A','B']]){
  let calls=0;const seeds=[];const result=simulateRankedSeries({createBattle:input=>{assert.equal(input.attackerCards[0].hp,100);input.attackerCards[0].hp=0;assert.equal(input.attackerMercenary.code,codes[calls]);seeds.push(input.seed);return {result:{winner:outcomes[calls++],reason:'ELIMINATION',actions:9}};},options,attackerMercenaries:mercenaries,defenderMercenaries:mercenaries,seed:1});
  assert.equal(calls,outcomes.length);assert.equal(new Set(seeds).size,calls);assert.equal(result.score[result.winner],2);assert.equal(options.attackerCards[0].hp,100);
 }
});
test('real PVP engine runs distinct mercenaries with deterministic fresh battles each round',()=>{
 const mercenaries=operatingMercenaries.slice(0,3),options={attackerCards:tierCards(90000),defenderCards:tierCards(90000)};
 const input={createBattle:createPvpBattleV2,options,attackerMercenaries:mercenaries,defenderMercenaries:[...mercenaries].reverse(),seed:19019};
 const result=simulateRankedSeries(input);assert.deepEqual(result,simulateRankedSeries(input));assert.ok([2,3].includes(result.rounds.length));
 for(const round of result.rounds){const direct=createPvpBattleV2({...structuredClone(options),attackerMercenary:mercenaries[round.number-1],defenderMercenary:[...mercenaries].reverse()[round.number-1],seed:(19019+Math.imul(round.number,0x9e3779b9))>>>0});assert.deepEqual(round.battleV2,direct);}
});
