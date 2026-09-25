import test from 'node:test';
import assert from 'node:assert/strict';
import {duoFixture} from './helpers/ranked-duo-db.mjs';
import {pairDuoParticipants,strongestDuoCards,DUO_DEFAULTS,duoEnergy,duoDay} from '../shared/ranked-duo-v1.mjs';
import {loadDuoProfiles} from '../functions/_ranked_duo_profiles.js';
test('balanced strong+weak pairs are deterministic and respect an odd waiting participant',()=>{
 const entries=[100,90,60,10,5].map((power,i)=>({userId:i+1,power})),result=pairDuoParticipants(entries);
 assert.deepEqual(result.teams.map(t=>t.members.map(m=>m.userId)),[[1,4],[2,3]]);assert.equal(result.waiting[0].userId,5);
 assert.deepEqual(pairDuoParticipants(entries.reverse()),result);
 const cards=Array.from({length:8},(_,i)=>({id:String(i),rarity:i<4?'SUPERSTAR':'FUR',power:100-i}));assert.equal(strongestDuoCards(cards).length,3);
});
for(const postgres of [false,true,'pipeline'])test(`${postgres==='pipeline'?'Postgres pipeline':postgres?'Postgres':'SQLite'} recruitment, four-deck battle and exact-once personal energy`,async t=>{
 const f=await duoFixture(t,{postgres});assert.equal((await f.call('ranked-duo/status',{user:2})).data.season,null);await f.ready();
 const before=await f.call('ranked-duo/status',{user:2});assert.equal(before.data.energy.current,10);assert.equal(before.data.team.members.length,2);
 const match=await f.call('ranked-duo/match',{user:2,method:'POST'});assert.equal(match.status,200,JSON.stringify(match));
 f.resetQueries();const body={requestId:'duo-request-000001',matchToken:match.data.token},fight=await f.call('ranked-duo/fight',{user:2,method:'POST',body});
 assert.equal(fight.status,200,JSON.stringify(fight));assert.equal(fight.data.status,'COMPLETED');assert.equal(fight.data.battleV2.teams.A.cards.length,10);assert.equal(fight.data.battleV2.teams.B.cards.length,10);
 assert.ok(!f.queries().some(q=>q.includes('FROM user_cards uc JOIN')),'warm battle cannot reload all owned cards');
 const repeated=await f.call('ranked-duo/fight',{user:2,method:'POST',body});assert.deepEqual(repeated.data,fight.data);
 assert.equal((await f.call('ranked-duo/status',{user:2})).data.energy.current,9);
 for(const user of [3,4,5])assert.equal((await f.call('ranked-duo/status',{user})).data.energy.current,10);
 assert.equal(Number((await f.p('SELECT COUNT(*) AS n FROM ranked_duo_matches_v1').first()).n),1);
 assert.equal((await f.call(`ranked-duo/replay?id=${fight.data.matchId}`,{user:6})).status,403);
 const unauth=await f.call('ranked-duo/replay',{user:6,method:'POST',body:{matchId:fight.data.matchId}});assert.equal(unauth.status,403);
});
test('latest offline teammate upgrades invalidate only that account, not every inventory',async t=>{
 const f=await duoFixture(t);await f.ready();const status=await f.call('ranked-duo/status',{user:2}),partner=status.data.team.members.find(m=>m.userId!==2).userId;
 const ticket=await f.call('ranked-duo/match',{user:2,method:'POST'}),before=await loadDuoProfiles(f.env,[partner],f.config,f.deps,{now:f.clock()});
 await f.p('UPDATE user_cards SET breakthrough_level=13 WHERE user_id=?',partner).run();
 const result=await f.call('ranked-duo/fight',{user:2,method:'POST',body:{requestId:'duo-latest-000001',matchToken:ticket.data.token}});
 assert.equal(result.status,200,JSON.stringify(result));const cards=result.data.battleV2.teams.A.cards.filter(c=>c.ownerId===partner);assert.ok(cards.every(c=>c.breakthroughLevel===13));assert.ok(cards.reduce((s,c)=>s+c.power,0)>before[0].attack.cards.reduce((s,c)=>s+c.power,0));
});
test('failed settlement keeps one durable paid match and retries without losing team points',async t=>{
 const f=await duoFixture(t);await f.ready();const ticket=await f.call('ranked-duo/match',{user:2,method:'POST'}),body={requestId:'duo-failure-000001',matchToken:ticket.data.token};
 f.fail('UPDATE ranked_duo_teams_v1 SET score');assert.equal((await f.call('ranked-duo/fight',{user:2,method:'POST',body})).status,500);f.fail('');
 assert.equal((await f.call('ranked-duo/status',{user:2})).data.energy.current,9);f.advance(31000);
 const retry=await f.call('ranked-duo/fight',{user:2,method:'POST',body});assert.equal(retry.status,200,JSON.stringify(retry));assert.equal(retry.data.status,'COMPLETED');assert.equal((await f.call('ranked-duo/status',{user:2})).data.energy.current,9);
 const teams=(await f.p('SELECT wins,losses FROM ranked_duo_teams_v1').all()).results;assert.equal(teams.reduce((s,t)=>s+Number(t.wins),0),1);assert.equal(teams.reduce((s,t)=>s+Number(t.losses),0),1);
});
test('unconfigured energy never grants free fights, recruitment respects 24 hours, and owner operations are protected',async t=>{
 const f=await duoFixture(t);assert.equal(duoEnergy(null,DUO_DEFAULTS,f.clock()).current,0);
 assert.equal((await f.call('admin/ranked-duo/create',{method:'POST',body:{config:f.config}})).status,200);
 await f.call('admin/ranked-duo/recruit',{method:'POST'});
 assert.equal((await f.call('admin/ranked-duo/pair',{method:'POST'})).status,409);
 assert.equal((await f.call('admin/ranked-duo/start',{user:2,method:'POST'})).status,403);
});
test('teammates can attack concurrently and shared team scores accumulate twice',async t=>{
 const f=await duoFixture(t,{postgres:true});await f.ready();const team=(await f.call('ranked-duo/status',{user:2})).data.team,partner=team.members.find(m=>m.userId!==2).userId;
 const [a,b]=await Promise.all([2,partner].map(user=>f.call('ranked-duo/match',{user,method:'POST'})));
 const results=await Promise.all([2,partner].map((user,i)=>f.call('ranked-duo/fight',{user,method:'POST',body:{requestId:'duo-concurrent-'+user+'-0001',matchToken:[a,b][i].data.token}})));
 for(const r of results)assert.equal(r.data.status,'COMPLETED',JSON.stringify(r));
 const rows=(await f.p('SELECT score,wins,losses FROM ranked_duo_teams_v1').all()).results;
 assert.equal(rows.reduce((s,r)=>s+Number(r.wins),0),2);assert.equal(rows.reduce((s,r)=>s+Number(r.losses),0),2);
 for(const user of [2,partner])assert.equal((await f.call('ranked-duo/status',{user})).data.energy.current,9);
});
test('concurrent duplicate request ids consume one energy and return the same result',async t=>{
 const f=await duoFixture(t,{postgres:true});await f.ready();const match=await f.call('ranked-duo/match',{user:2,method:'POST'}),body={requestId:'duplicate-duo-request-001',matchToken:match.data.token};
 const result=await Promise.all(Array.from({length:4},()=>f.call('ranked-duo/fight',{user:2,method:'POST',body})));
 assert.ok(result.every(r=>r.status===200));assert.equal(Number((await f.p('SELECT COUNT(*) n FROM ranked_duo_matches_v1').first()).n),1);
 assert.equal((await f.call('ranked-duo/status',{user:2})).data.energy.current,9);
 const replay=await f.call('ranked-duo/fight',{user:2,method:'POST',body});assert.equal(replay.data.status,'COMPLETED');for(const r of result.filter(r=>r.data.status==='COMPLETED'))assert.deepEqual(r.data,replay.data);
});
test('an empty partner energy balance never blocks or pays for the initiator',async t=>{
 const f=await duoFixture(t);await f.ready();const team=(await f.call('ranked-duo/status',{user:2})).data.team,partner=team.members.find(m=>m.userId!==2).userId;
 await f.p('UPDATE ranked_duo_entries_v1 SET energy=0,energy_day=? WHERE user_id=?',duoEnergy(null,f.config,f.clock()).day,partner).run();
 const match=await f.call('ranked-duo/match',{user:2,method:'POST'});assert.equal(match.status,200);
 const result=await f.call('ranked-duo/fight',{user:2,method:'POST',body:{requestId:'partner-zero-energy-001',matchToken:match.data.token}});assert.equal(result.status,200);assert.equal((await f.call('ranked-duo/status',{user:partner})).data.energy.current,0);
});
test('the inventory-version fence rolls back energy, ticket and receipt together',async t=>{
 const f=await duoFixture(t);await f.ready();const match=await f.call('ranked-duo/match',{user:2,method:'POST'}),batch=f.DB.batch.bind(f.DB);let injected=false;
 f.DB.batch=async list=>{if(!injected&&list.some(s=>s.source.includes('INSERT INTO ranked_duo_matches_v1'))){injected=true;await f.p('UPDATE user_cards SET breakthrough_level=13 WHERE user_id=2').run();}return batch(list);};
 const result=await f.call('ranked-duo/fight',{user:2,method:'POST',body:{requestId:'inventory-fence-00001',matchToken:match.data.token}});
 assert.equal(result.data.code,'DUO_CONFLICT');assert.equal((await f.call('ranked-duo/status',{user:2})).data.energy.current,10);
 assert.equal(Number((await f.p('SELECT COUNT(*) n FROM ranked_duo_matches_v1').first()).n),0);
 assert.equal((await f.p('SELECT used_at FROM ranked_duo_tickets_v1 WHERE token=?',match.data.token).first()).used_at,null);
});
test('an unrecoverable saved engine version refunds energy exactly once',async t=>{
 const f=await duoFixture(t);await f.ready();const match=await f.call('ranked-duo/match',{user:2,method:'POST'}),body={requestId:'refund-version-00001',matchToken:match.data.token};
 f.fail('UPDATE ranked_duo_teams_v1 SET score');await f.call('ranked-duo/fight',{user:2,method:'POST',body});f.fail('');
 const row=await f.p('SELECT id,input_json FROM ranked_duo_matches_v1').first(),input=JSON.parse(row.input_json);input.version='old-unsupported';
 await f.p('UPDATE ranked_duo_matches_v1 SET input_json=? WHERE id=?',JSON.stringify(input),row.id).run();f.advance(31000);
 assert.equal((await f.call('ranked-duo/fight',{user:2,method:'POST',body})).data.code,'DUO_CANCELLED');
 assert.equal((await f.call('ranked-duo/status',{user:2})).data.energy.current,10);
 await f.call('ranked-duo/fight',{user:2,method:'POST',body});assert.equal((await f.call('ranked-duo/status',{user:2})).data.energy.current,10);
 assert.equal((await f.p('SELECT status FROM ranked_duo_matches_v1').first()).status,'CANCELLED');
});
test('profile rebuild leases stop simultaneous inventory scans and always release owned leases',async t=>{
 const f=await duoFixture(t);await f.ready();await f.p('UPDATE user_cards SET breakthrough_level=13 WHERE user_id=2').run();
 await f.p('INSERT INTO ranked_duo_profile_leases_v1 VALUES(?,?,?)',2,'another-worker',new Date(f.clock()+30000).toISOString()).run();f.resetQueries();
 await assert.rejects(loadDuoProfiles(f.env,[2,3],f.config,f.deps,{now:f.clock()}),{code:'DUO_PROFILE_BUILDING'});assert.ok(!f.queries().some(q=>q.includes('FROM user_cards uc JOIN')));
 f.advance(31000);await loadDuoProfiles(f.env,[2],f.config,f.deps,{now:f.clock()});assert.equal(Number((await f.p('SELECT COUNT(*) n FROM ranked_duo_profile_leases_v1').first()).n),0);
});
test('KST daily grants are personal, capped and never multiply by missed days',()=>{
 const now=Date.parse('2026-09-25T15:00:00Z'),config={energy:{maximum:10,dailyGrant:4,cost:1}};
 assert.equal(duoEnergy({energy:7,energy_day:'2026-09-25'},config,now).current,10);
 assert.equal(duoEnergy({energy:1,energy_day:'2026-09-26'},config,now).current,1);
 assert.equal(duoEnergy({energy:0,energy_day:'2026-09-01'},config,now).current,4);
});
test('extra recruitment preserves published pairs and can resume after invalid deck repair',async t=>{
 const f=await duoFixture(t);await f.ready();await f.p("UPDATE ranked_duo_seasons_v1 SET status='READY'").run();const before=(await f.p('SELECT id,user_a,user_b FROM ranked_duo_teams_v1 ORDER BY id').all()).results;
 assert.equal((await f.call('admin/ranked-duo/recruit',{method:'POST',body:{hours:1}})).status,200);
 for(const user of [6,7])assert.equal((await f.call('ranked-duo/join',{user,method:'POST'})).status,200);
 f.advance(3600000);await f.call('admin/ranked-duo/pair',{method:'POST'});
 await f.p("UPDATE pvp_decks SET card_ids='[]' WHERE user_id=7").run();assert.equal((await f.call('admin/ranked-duo/pair-step',{method:'POST'})).data.code,'DUO_PAIR_DECK');
 assert.equal((await f.call('admin/ranked-duo/recruit',{method:'POST',body:{hours:1}})).status,200);
 await f.p('UPDATE pvp_decks SET card_ids=? WHERE user_id=7',JSON.stringify([0,1,2,3,4].map(i=>'C-'+i))).run();f.advance(3600000);await f.call('admin/ranked-duo/pair',{method:'POST'});
 for(let i=0;i<5;i++){const r=await f.call('admin/ranked-duo/pair-step',{method:'POST'});assert.equal(r.status,200);if(r.data.done)break;}
 const after=(await f.p('SELECT id,user_a,user_b FROM ranked_duo_teams_v1 ORDER BY id').all()).results;assert.equal(after.length,3);for(const team of before)assert.deepEqual(after.find(a=>a.id===team.id),team);
});
test('global policy revisions rebuild cached data and recent history uses two bounded indexes',async t=>{
 const f=await duoFixture(t);await f.ready();const a=(await loadDuoProfiles(f.env,[2],f.config,f.deps,{now:f.clock()}))[0];
 await f.p('INSERT INTO app_meta(key,value) VALUES(?,?)','zenith_master_star_breakthrough_v1802','{}').run();const b=(await loadDuoProfiles(f.env,[2],f.config,f.deps,{now:f.clock()}))[0];assert.equal(b.sourceVersion,a.sourceVersion);assert.equal(b.policyRevision,a.policyRevision+1);
 f.resetQueries();await f.call('ranked-duo/history',{user:2});const reads=f.queries().filter(q=>q.includes('FROM ranked_duo_matches_v1'));assert.equal(reads.length,2);assert.ok(reads.every(q=>q.includes('LIMIT ?')&&!q.includes(' OR ')));
});

test('last-energy pending match is discoverable and recoverable from a fresh device',async t=>{
 const f=await duoFixture(t);await f.ready();await f.p('UPDATE ranked_duo_entries_v1 SET energy=1,energy_day=? WHERE user_id=2',duoDay(f.clock())).run();
 const ticket=await f.call('ranked-duo/match',{user:2,method:'POST'});f.fail('UPDATE ranked_duo_teams_v1 SET score=');
 assert.equal((await f.call('ranked-duo/fight',{user:2,method:'POST',body:{requestId:'duo-last-energy-recovery',matchToken:ticket.data.token}})).status,500);f.fail('');
 const status=await f.call('ranked-duo/status',{user:2});assert.equal(status.data.energy.current,0);assert.ok(status.data.pendingMatchId);
 assert.equal((await f.call('ranked-duo/match',{user:2,method:'POST'})).data.pendingMatchId,status.data.pendingMatchId);
 f.advance(31000);const result=await f.call('ranked-duo/replay',{user:2,method:'POST',body:{matchId:status.data.pendingMatchId}});assert.equal(result.data.status,'COMPLETED');assert.equal((await f.call('ranked-duo/status',{user:2})).data.energy.current,0);
});

for(const postgres of [false,'pipeline'])test('lobby never recounts participants; atomic membership counter survives duplicates and rollback '+postgres,async t=>{
 const f=await duoFixture(t,{postgres});await f.call('admin/ranked-duo/create',{method:'POST',body:{config:f.config}});await f.call('admin/ranked-duo/recruit',{method:'POST'});
 const [a,b]=await Promise.all([2,3].map(user=>f.call('ranked-duo/join',{user,method:'POST'})));assert.equal(a.status,200);assert.equal(b.status,200);
 assert.equal((await f.call('ranked-duo/join',{user:2,method:'POST'})).status,200);
 f.resetQueries();let status=await f.call('ranked-duo/status',{user:2});assert.equal(status.data.participants,2);assert.ok(!f.queries().some(q=>/COUNT\(|SUM\(/i.test(q)));
 for(const user of [2,2])assert.equal((await f.call('ranked-duo/join',{user,method:'DELETE'})).status,200);
 assert.equal((await f.call('ranked-duo/status',{user:3})).data.participants,1);
 f.fail('INSERT INTO ranked_duo_entries_v1');assert.equal((await f.call('ranked-duo/join',{user:4,method:'POST'})).status,500);f.fail('');
 assert.equal((await f.call('ranked-duo/status',{user:3})).data.participants,1);
 assert.equal(Number((await f.p('SELECT COUNT(*) AS n FROM ranked_duo_entries_v1').first()).n),1);
});

test('Postgres no-op catalog writes do not invalidate every participant profile',async t=>{
 const f=await duoFixture(t,{postgres:'pipeline'});await f.ready();
 const revision=async()=>Number((await f.p('SELECT revision FROM ranked_duo_policy_version_v1 WHERE id=1').first()).revision),before=await revision();
 await f.p("UPDATE cards SET base_power=base_power+1 WHERE id='not-a-card'").run();
 await f.p("INSERT INTO cards(id) VALUES('C-0') ON CONFLICT(id) DO NOTHING").run();assert.equal(await revision(),before);
 await f.p("UPDATE cards SET base_power=base_power+1 WHERE id IN('C-0','C-1')").run();assert.equal(await revision(),before+1);
});
