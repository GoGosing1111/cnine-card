import test from 'node:test';
import assert from 'node:assert/strict';
import {weeklyFixture,day} from './helpers/ranked-duo-weekly.mjs';
import {DUO_RANDOM_MODE,shuffleDuo} from '../shared/ranked-duo-random-v4.mjs';
import {DUO_WEEKLY_POLICY_KEY,copyRankedDuoPolicy} from '../shared/ranked-duo-weekly-v3.mjs';
import {duoEnergy,validateDuoConfig} from '../shared/ranked-duo-v1.mjs';
import {readDuoHonors} from '../functions/_ranked_duo_honors.js';

const fixture=(t,options={})=>weeklyFixture(t,{...options,matchmaking:DUO_RANDOM_MODE});
const match=f=>f.call('ranked-duo/match',{user:2,method:'POST'});
const fight=(f,ticket,id='random-duo-fight-0001')=>f.call('ranked-duo/fight',{user:2,method:'POST',body:{requestId:id,matchToken:ticket.token}});
const roster=t=>[...t.team.members,...t.opponent.members].map(m=>m.userId);
const stats=f=>f.p('SELECT * FROM ranked_duo_players_v4 ORDER BY user_id').all().then(r=>r.results);

test('new weekly policies use random matchmaking; unversioned season configurations remain legacy',async t=>{
 const f=await fixture(t);assert.equal(copyRankedDuoPolicy(f.settings,new Date(f.clock()).toISOString()).matchmaking,DUO_RANDOM_MODE);
 const legacy={...f.config};delete legacy.matchmaking;assert.equal(validateDuoConfig(legacy).matchmaking,'FIXED');
 assert.deepEqual(shuffleDuo([1,2,3,4],()=>0),[2,3,4,1]);
});

for(const postgres of [false,true,'pipeline'])test(`${postgres||'SQLite'} random four-player fight changes only the initiator and replays exactly once`,async t=>{
 const f=await fixture(t,{postgres});await f.active();
 const status=(await f.call('ranked-duo/status',{user:2})).data;
 assert.equal(status.team,null);assert.equal(status.waiting,false);assert.equal(status.player.score,1000);
 assert.equal(Number((await f.p('SELECT COUNT(*) n FROM ranked_duo_teams_v1').first()).n),0);
 assert.equal((await f.call('ranked-duo/ranking',{user:2})).data.ranking.length,0);
 const first=await match(f);assert.equal(first.status,200,JSON.stringify(first));assert.equal(new Set(roster(first.data)).size,4);
 assert.deepEqual((await match(f)).data,first.data,'retry must retain the same four-player ticket');
 const before=await stats(f),others=roster(first.data).filter(id=>id!==2);
 for(const id of others)await f.p('UPDATE ranked_duo_entries_v1 SET energy=0,energy_day=? WHERE user_id=?',duoEnergy(null,status.season,f.clock()).day,id).run();
 const result=await fight(f,first.data);assert.equal(result.status,200,JSON.stringify(result));assert.equal(result.data.status,'COMPLETED');
 assert.equal(result.data.battleV2.teams.A.cards.length,10);assert.equal(result.data.battleV2.teams.B.cards.length,10);
 assert.equal(result.data.scoreScope,'INITIATOR');assert.equal(result.data.initiatorId,2);assert.equal(result.data.opponentScoreAfter,null);
 const after=await stats(f);
 for(const id of others){assert.deepEqual(after.find(p=>Number(p.user_id)===id),before.find(p=>Number(p.user_id)===id));assert.equal((await f.call('ranked-duo/status',{user:id})).data.energy.current,0);assert.equal(Number((await f.p('SELECT coin FROM users WHERE id=?',id).first()).coin),0);}
 assert.equal((await f.call('ranked-duo/status',{user:2})).data.energy.current,9);
 assert.deepEqual((await fight(f,first.data)).data,result.data);assert.deepEqual(await stats(f),after);
 assert.deepEqual((await f.call('ranked-duo/ranking',{user:2})).data.ranking.map(p=>p.userId),[2]);
 const id=result.data.matchId;
 for(const uid of roster(first.data)){assert.equal((await f.call('ranked-duo/replay?id='+id,{user:uid})).status,200);const h=(await f.call('ranked-duo/history',{user:uid})).data.history;assert.equal(h[0].id,id);assert.equal(h[0].scoreApplied,uid===2);}
 assert.equal((await f.call('ranked-duo/replay?id='+id,{user:6})).status,403);
 assert.equal((await f.call('ranked-duo/replay',{user:6,method:'POST',body:{matchId:id}})).status,403);
 const next=await match(f);assert.equal(next.status,200);assert.notEqual(next.data.token,first.data.token);assert.equal(new Set(roster(next.data)).size,4);
 assert.ok((await f.p('SELECT team_id FROM ranked_duo_entries_v1').all()).results.every(r=>r.team_id===null));
});

test('odd participants and late entries are usable immediately; active cancellation cannot reset points',async t=>{
 const f=await fixture(t);await f.active();
 for(const user of [6,7]){const joined=await f.call('ranked-duo/join',{user,method:'POST'});assert.equal(joined.status,200,JSON.stringify(joined));assert.equal(joined.data.waiting,false);assert.equal(joined.data.team,null);}
 const late=await f.call('ranked-duo/match',{user:6,method:'POST'});assert.equal(late.status,200);assert.equal(new Set(roster(late.data)).size,4);
 assert.equal((await f.call('ranked-duo/join',{user:6,method:'DELETE'})).data.code,'DUO_SEASON_STARTED');
});

test('recruitment cancellation is atomic, and fewer than four participants never consume energy',async t=>{
 const f=await fixture(t);await f.tick();
 for(const user of [2,3,4])assert.equal((await f.call('ranked-duo/join',{user,method:'POST'})).status,200);
 await f.call('ranked-duo/join',{user:4,method:'DELETE'});assert.equal((await stats(f)).length,2);
 f.advance(day);await f.tick();await f.tick();assert.equal((await f.season()).status,'ACTIVE');
 assert.equal((await match(f)).data.code,'DUO_NO_OPPONENT');assert.equal((await f.call('ranked-duo/status',{user:2})).data.energy.current,10);
});

for(const postgres of [false,'pipeline'])test(`${postgres||'SQLite'} a failed personal settlement is recovered with one debit and one reward`,async t=>{
 const f=await fixture(t,{postgres});await f.active();const ticket=(await match(f)).data;
 for(const m of ticket.team.members)await f.p('UPDATE user_cards SET breakthrough_level=200 WHERE user_id=?',m.userId).run();
 f.fail('INSERT INTO coin_logs');assert.equal((await fight(f,ticket)).status,500);f.fail('');
 assert.equal((await f.call('ranked-duo/status',{user:2})).data.energy.current,9);
 assert.equal((await stats(f)).reduce((sum,r)=>sum+Number(r.wins)+Number(r.losses),0),0);
 assert.equal(Number((await f.p('SELECT SUM(coin) n FROM users').first()).n),0);
 f.advance(31000);const recovered=await fight(f,ticket);assert.equal(recovered.data.status,'COMPLETED',JSON.stringify(recovered));assert.equal(recovered.data.result,'WIN');
 assert.equal(recovered.data.rewardCoin,250000);assert.deepEqual((await fight(f,ticket)).data,recovered.data);
 assert.equal(Number((await f.p('SELECT SUM(coin) n FROM users').first()).n),250000);
 assert.equal((await stats(f)).reduce((sum,r)=>sum+Number(r.wins)+Number(r.losses),0),1);
});

test('simultaneous tickets and duplicate fight requests retain one roster and receipt',async t=>{
 const f=await fixture(t,{postgres:true});await f.active();
 const tickets=await Promise.all([match(f),match(f),match(f)]);for(const r of tickets){assert.equal(r.status,200,JSON.stringify(r));assert.deepEqual(r.data,tickets[0].data);}
 const results=await Promise.all(Array.from({length:3},()=>fight(f,tickets[0].data)));
 for(const r of results)assert.equal(r.status,200,JSON.stringify(r));
 assert.equal(Number((await f.p('SELECT COUNT(*) n FROM ranked_duo_matches_v1').first()).n),1);
 assert.equal(Number((await f.p('SELECT COUNT(*) n FROM ranked_duo_match_members_v4').first()).n),4);
 assert.equal((await f.call('ranked-duo/status',{user:2})).data.energy.current,9);
});

test('invalidated offline decks and banned accounts reject a ticket without charging',async t=>{
 const f=await fixture(t);await f.active();const ticket=(await match(f)).data,partner=ticket.team.members[1].userId;
 await f.p("UPDATE users SET status='BANNED' WHERE id=?",partner).run();
 const result=await fight(f,ticket);assert.equal(result.data.code,'DUO_TICKET');assert.equal((await f.call('ranked-duo/status',{user:2})).data.energy.current,10);
 assert.equal(Number((await f.p('SELECT COUNT(*) n FROM ranked_duo_matches_v1').first()).n),0);
});

test('inventory and season fences roll back ticket, energy, membership and receipt together',async t=>{
 const f=await fixture(t);await f.active();const ticket=(await match(f)).data,batch=f.DB.batch.bind(f.DB);let injected=false;
 f.DB.batch=async list=>{if(!injected&&list.some(s=>s.source.includes('INSERT INTO ranked_duo_matches_v1'))){injected=true;await f.p('UPDATE user_cards SET breakthrough_level=13 WHERE user_id=2').run();}return batch(list);};
 assert.equal((await fight(f,ticket)).data.code,'DUO_CONFLICT');assert.equal((await f.call('ranked-duo/status',{user:2})).data.energy.current,10);
 assert.equal((await f.p('SELECT used_at FROM ranked_duo_tickets_v4 WHERE token=?',ticket.token).first()).used_at,null);
 assert.equal(Number((await f.p('SELECT COUNT(*) n FROM ranked_duo_match_members_v4').first()).n),0);
 await f.call('admin/ranked-duo/close',{method:'POST'});assert.equal((await fight(f,ticket)).data.code,'DUO_NOT_ACTIVE');
});

for(const postgres of [false,'pipeline'])test(`${postgres||'SQLite'} season settlement ranks and rewards only completed personal starts; OFF stays OFF`,async t=>{
 const f=await fixture(t,{postgres});await f.active();const ticket=(await match(f)).data;assert.equal((await fight(f,ticket)).status,200);
 await f.p('UPDATE app_meta SET value=? WHERE key=?',JSON.stringify({...f.policy,enabled:false}),DUO_WEEKLY_POLICY_KEY).run();
 f.advance(7*day);assert.equal((await f.tick()).snapshotFrozen,true);await f.tick();await f.tick();assert.equal((await f.season()).status,'CLOSED');
 assert.equal(Number((await f.p('SELECT COUNT(*) n FROM ranked_duo_rewards_v3').first()).n),1);assert.equal(Number((await f.p('SELECT COUNT(*) n FROM ranked_duo_final_v4').first()).n),1);
 assert.equal((await readDuoHonors(f.env,2)).count,1);for(const uid of roster(ticket).filter(id=>id!==2))assert.equal((await readDuoHonors(f.env,uid)).count,0);
 assert.equal((await f.tick()).phase,'WAITING_DUO_POLICY');assert.equal((await match(f)).data.code,'DUO_NOT_ACTIVE');
 assert.deepEqual((await f.call('ranked-duo/ranking',{user:2})).data.ranking.map(r=>r.userId),[2]);
 assert.equal((await f.call('ranked-duo/replay?id='+(await f.p('SELECT id FROM ranked_duo_matches_v1').first()).id,{user:2})).data.status,'COMPLETED');
});

test('matchmaking work stays bounded and random trials can choose all available partners',async t=>{
 const f=await fixture(t);await f.active();for(const user of [6,7])await f.call('ranked-duo/join',{user,method:'POST'});
 const partners=new Set();for(let i=0;i<40;i++){f.resetQueries();const r=await match(f);assert.equal(r.status,200);partners.add(r.data.team.members[1].userId);
  const scans=f.queries().filter(q=>q.includes('SELECT user_id,draw_key'));assert.equal(scans.length,2);assert.ok(scans.every(q=>q.includes('LIMIT ?')));assert.ok(!f.queries().some(q=>/ORDER BY RANDOM|ORDER BY RAND\(/i.test(q)));
  await f.p('UPDATE ranked_duo_tickets_v4 SET used_at=?',new Date(f.clock()).toISOString()).run();
 }assert.ok(partners.size>=3,'partners must not be a season-fixed pair');
});
test('pending receipts settle after closure with the original roster and immutable combat snapshot',async t=>{
 const f=await fixture(t);await f.active();const ticket=(await match(f)).data;
 f.fail('UPDATE ranked_duo_players_v4 SET score');await fight(f,ticket);f.fail('');
 const receipt=await f.p('SELECT * FROM ranked_duo_matches_v1').first(),input=JSON.parse(receipt.input_json);
 await f.p('UPDATE user_cards SET breakthrough_level=200 WHERE user_id<>2').run();
 await f.call('admin/ranked-duo/close',{method:'POST'});f.advance(31000);
 await f.tick();const replay=await f.call('ranked-duo/replay?id='+receipt.id,{user:2});assert.equal(replay.data.status,'COMPLETED');
 assert.deepEqual([...replay.data.attackerNames,...replay.data.defenderNames],[...input.battle.attackerSquads,...input.battle.defenderSquads].map(s=>s.ownerName));
 assert.equal((await f.p('SELECT input_json FROM ranked_duo_matches_v1').first()).input_json,receipt.input_json);
 assert.equal((await stats(f)).reduce((sum,r)=>sum+Number(r.wins)+Number(r.losses),0),1);
});

test('unsupported random combat receipts refund once without changing anyone\'s points',async t=>{
 const f=await fixture(t);await f.active();const ticket=(await match(f)).data;
 f.fail('UPDATE ranked_duo_players_v4 SET score');await fight(f,ticket);f.fail('');
 const row=await f.p('SELECT id,input_json FROM ranked_duo_matches_v1').first(),input=JSON.parse(row.input_json);input.version='unsupported';
 await f.p('UPDATE ranked_duo_matches_v1 SET input_json=? WHERE id=?',JSON.stringify(input),row.id).run();f.advance(31000);
 assert.equal((await fight(f,ticket)).data.code,'DUO_CANCELLED');assert.equal((await fight(f,ticket)).data.code,'DUO_CANCELLED');
 assert.equal((await f.call('ranked-duo/status',{user:2})).data.energy.current,10);assert.equal((await stats(f)).reduce((sum,r)=>sum+Number(r.wins)+Number(r.losses),0),0);
});

test('banning a participant between profile loading and admission rolls back all four memberships',async t=>{
 const f=await fixture(t);await f.active();const ticket=(await match(f)).data,batch=f.DB.batch.bind(f.DB);let changed=false;
 f.DB.batch=async list=>{if(!changed&&list.some(s=>s.source.includes('INSERT INTO ranked_duo_matches_v1'))){changed=true;await f.p("UPDATE users SET status='BANNED' WHERE id=?",ticket.opponent.members[0].userId).run();}return batch(list);};
 assert.equal((await fight(f,ticket)).data.code,'DUO_CONFLICT');
 assert.equal((await f.call('ranked-duo/status',{user:2})).data.energy.current,10);assert.equal(Number((await f.p('SELECT COUNT(*) n FROM ranked_duo_matches_v1').first()).n),0);
 assert.equal(Number((await f.p('SELECT COUNT(*) n FROM ranked_duo_match_members_v4').first()).n),0);
});

test('two initiators sharing a roster accumulate independent personal results',async t=>{
 const f=await fixture(t,{postgres:'pipeline'});await f.active();
 const tickets=await Promise.all([2,3].map(user=>f.call('ranked-duo/match',{user,method:'POST'})));
 const results=await Promise.all([2,3].map((user,i)=>f.call('ranked-duo/fight',{user,method:'POST',body:{requestId:'random-independent-'+user,matchToken:tickets[i].data.token}})));
 for(const result of results)assert.equal(result.data.status,'COMPLETED',JSON.stringify(result));
 for(const row of await stats(f))assert.equal(Number(row.wins)+Number(row.losses),[2,3].includes(Number(row.user_id))?1:0);
});

test('a random season with no personal starts has no final rewards or trophies',async t=>{
 const f=await fixture(t);await f.active();f.advance(7*day);await f.tick();await f.tick();
 assert.equal((await f.season()).status,'CLOSED');assert.equal(Number((await f.p('SELECT COUNT(*) n FROM ranked_duo_rewards_v3').first()).n),0);assert.equal((await readDuoHonors(f.env,2)).count,0);
});
