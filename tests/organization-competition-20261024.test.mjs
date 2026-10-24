import test from 'node:test';
import assert from 'node:assert/strict';
import {organizationFactionFixture as fixture} from './helpers/organization-faction-fixture.mjs';
import {tickOrganizationFaction} from '../functions/_organization_faction.js';
import {validateOrganizationFactionPolicy,defaultOrganizationFactionPolicy} from '../shared/organization-faction-v1.mjs';
import {organizationWeekStart,organizationPointRanking,ORGANIZATION_WEEK_MS as WEEK} from '../shared/organization-competition-v1.mjs';
const at=s=>Date.parse(s+'+09:00');
const start=at('2026-10-24T20:00:00'),end=at('2026-10-24T22:00:00'),monday=at('2026-10-26T00:00:00');
async function open(t,options={}){const f=await fixture(t,{live:true,...options});f.advance(start-f.clock());assert.equal((await f.overview()).status,200);return f;}
async function captured(f,n=8){await f.mutateState(s=>{s.districts.forEach((d,i)=>d.owner=i<n?1:0);s.session.participants=[2,3];s.session.participantClans={2:1,3:1};});}
async function rewardRows(f){return (await f.pg.query("SELECT user_id,reward_amount FROM user_message_rewards WHERE reward_type='PIG_COIN' ORDER BY user_id")).rows.map(r=>({id:Number(r.user_id),amount:Number(r.reward_amount)}));}
async function save(f,change){const p=(await f.admin()).data.policy;return f.call('admin/organization/faction/policy',{user:1,body:{requestId:crypto.randomUUID(),policy:{...p,...change}}});}
async function counts(f){return (await f.pg.query('SELECT session_key,snapshot_json FROM organization_faction_settlements_v1 ORDER BY session_key')).rows;}

test('weekly cutoff is Monday 00:00 KST across UTC, month and year boundaries; ties share ranks',()=>{
 assert.equal(organizationWeekStart(monday-1),at('2026-10-19T00:00:00'));
 assert.equal(organizationWeekStart(monday),monday);
 assert.equal(organizationWeekStart(at('2027-01-01T12:00:00')),at('2026-12-28T00:00:00'));
 assert.deepEqual(organizationPointRanking([{id:1},{id:2},{id:3}],{1:8,2:8,3:4},{1:10,2:2}).map(r=>r.rank),[1,1,3]);
});

test('default 8 territories / 200 pig coins / four weeks; reject malformed and unclaimable policy values',()=>{
 const p=defaultOrganizationFactionPolicy();assert.deepEqual(p.pigCoinReward,{enabled:true,requiredTerritories:8,amount:200});assert.equal(p.competition.seasonWeeks,4);
 for(const patch of [{pigCoinReward:null},{pigCoinReward:{...p.pigCoinReward,enabled:1}},{pigCoinReward:{...p.pigCoinReward,amount:0}},{pigCoinReward:{...p.pigCoinReward,amount:100001}},{pigCoinReward:{...p.pigCoinReward,amount:1.5}},{pigCoinReward:{...p.pigCoinReward,requiredTerritories:26}},{competition:{seasonWeeks:0}},{competition:{seasonWeeks:2.5}},{competition:null}])assert.throws(()=>validateOrganizationFactionPolicy({...p,...patch}),/피그코인|시즌/);
});

test('7 territories never pay pig coins; at 8, only active same-clan session participants receive 200 once',async t=>{
 const f=await open(t);await captured(f,7);f.advance(end-f.clock());await f.overview();assert.deepEqual(await rewardRows(f),[]);
 f.advance(start+86400000-f.clock());await f.overview();await captured(f,8);
 await f.mutateState(s=>{s.session.participants=[2,3,4,7];s.session.participantClans={2:1,3:2,4:1,7:2};});
 await f.pg.query("UPDATE users SET status='SUSPENDED' WHERE id=4");
 f.advance(end+86400000-f.clock());const v=await f.overview();assert.equal(v.status,200);
 assert.deepEqual(await rewardRows(f),[{id:2,amount:200}]);assert.equal(v.data.sessions.history[0].myPigCoins,200);
 await Promise.all([tickOrganizationFaction(f.env,f.deps),f.overview(),f.overview()]);assert.deepEqual(await rewardRows(f),[{id:2,amount:200}]);
});

test('pig threshold is independent of existing rewards; settings freeze when a session opens',async t=>{
 const f=await open(t);await captured(f);
 assert.equal((await save(f,{pigCoinReward:{enabled:true,requiredTerritories:6,amount:350}})).status,200);
 f.advance(end-f.clock());await f.overview();assert.deepEqual(await rewardRows(f),[{id:2,amount:200},{id:3,amount:200}]);
 f.advance(start+86400000-f.clock());await f.overview();await captured(f,6);
 f.advance(end+86400000-f.clock());await f.overview();
 assert.equal((await rewardRows(f)).filter(r=>r.amount===350).length,2);
 const recent=(await f.overview()).data.sessions.history[0];assert.equal(recent.myReward,0);assert.equal(recent.myPigCoins,350);
});

test('OFF pig reward does not erase existing standard rewards and old clients preserve configured fields',async t=>{
 const f=await open(t);assert.equal((await save(f,{pigCoinReward:{enabled:false,requiredTerritories:9,amount:400}})).status,200);
 const policy=(await f.admin()).data.policy;delete policy.pigCoinReward;delete policy.competition;
 const old=await f.call('admin/organization/faction/policy',{user:1,body:{requestId:crypto.randomUUID(),policy}});assert.equal(old.status,200);assert.deepEqual(old.data.policy.pigCoinReward,{enabled:false,requiredTerritories:9,amount:400});
 f.advance(start+86400000-f.clock());await f.overview();await captured(f,9);f.advance(end+86400000-f.clock());await f.overview();
 assert.deepEqual(await rewardRows(f),[]);assert.equal(Number((await f.pg.query("SELECT COUNT(*) n FROM user_message_rewards WHERE reward_type='COIN'")).rows[0].n),2);
});

test('legacy in-flight reward snapshot is not backfilled with a new pig reward',async t=>{
 const f=await open(t);await captured(f);await f.mutateState(s=>delete s.session.rewardRules.pigCoinReward);f.advance(end-f.clock());await f.overview();assert.deepEqual(await rewardRows(f),[]);
});

test('reward insert failure rolls back the entire settlement and retries with exactly one pig reward',async t=>{
 const f=await open(t);await captured(f);f.advance(end-f.clock());f.fail('INSERT INTO user_message_rewards');
 assert.equal((await f.overview()).status,503);f.fail('');assert.deepEqual(await rewardRows(f),[]);
 assert.equal((await counts(f)).filter(r=>r.session_key.includes('fixed')).length,0);
 assert.equal((await f.overview()).status,200);assert.deepEqual(await rewardRows(f),[{id:2,amount:200},{id:3,amount:200}]);
});

test('weekly scoring takes one ownership snapshot, includes 1..7 territories, and never pays a second round reward',async t=>{
 const f=await open(t);await captured(f,8);f.advance(end-f.clock());await f.overview();
 await f.mutateState(s=>{s.districts.forEach((d,i)=>d.owner=i<6?1:i<12?2:0);});
 f.advance(monday-1-f.clock());let v=(await f.overview()).data;assert.equal(v.competition.standings.find(r=>r.organizationId===1).points,0);assert.equal(v.competition.standings[0].pendingPoints,6);
 f.advance(1);await Promise.all([tickOrganizationFaction(f.env,f.deps),f.overview(),f.overview()]);
 v=(await f.overview()).data;assert.equal(v.competition.season.weeksSettled,1);assert.deepEqual(v.competition.standings.slice(0,3).map(r=>[r.rank,r.points]),[[1,6],[1,6],[3,0]]);
 assert.equal((await counts(f)).filter(r=>r.session_key.startsWith('competition:v1:week:')).length,1);
 assert.equal((await rewardRows(f)).length,2,'weekly point settlement cannot repeat the session payout');
 await f.mutateState(s=>s.districts.forEach(d=>d.owner=2));await f.overview();
 const history=(await f.overview()).data.competition.weeklyHistory[0];assert.equal(history.rows.find(r=>r.organizationId===1).points,6);
});

test('four weekly settlements then one final settlement, independent next-season totals, persistent historical ranking',async t=>{
 const f=await open(t);await captured(f,8);const originals=(await f.overview()).data;
 for(let i=0;i<4;i++){
  await f.mutateState(s=>s.districts.forEach((d,j)=>d.owner=j<8+i?1:j<16+i?2:0));
  f.advance(monday+i*WEEK-f.clock());assert.equal((await f.overview()).status,200);
 }
 const v=(await f.overview()).data,c=v.competition,records=(await counts(f)).filter(r=>r.session_key.startsWith('competition:'));
 assert.equal(records.length,5);assert.equal(c.season.number,2);assert.equal(c.season.weeksSettled,0);assert.ok(c.standings.every(r=>r.points===0));
 assert.equal(c.seasonHistory[0].rows[0].points,38);assert.equal(c.seasonHistory[0].rows[0].organizationId,1);assert.equal(c.seasonHistory[0].rows[1].points,32);
 assert.equal(v.districts.filter(d=>d.owner===1).length,11);assert.deepEqual(v.formation,originals.formation);
 await tickOrganizationFaction(f.env,f.deps);assert.equal((await counts(f)).filter(r=>r.session_key.startsWith('competition:')).length,5);
 const archive=await f.call('organization/faction/rankings?roundId='+f.roundId+'&seasonNo=1');assert.equal(archive.status,200);assert.equal(archive.data.archive.rows[0].points,38);
 assert.equal((await f.call('organization/faction/rankings?roundId='+f.roundId+'&seasonNo=999')).status,404);
});

test('final receipt failure rolls back fourth weekly points and season rollover together',async t=>{
 const f=await open(t);await captured(f,8);f.advance(monday+2*WEEK-f.clock());await f.overview();
 const before=(await f.pg.query('SELECT state_json FROM organization_faction_state_v1 WHERE round_id=$1',[f.roundId])).rows[0].state_json;
 const query=f.env.DB.client.query.bind(f.env.DB.client);
 f.env.DB.client.query=async input=>{if(input.values?.[1]==='competition:v1:season:1')throw Error('INJECTED_SEASON_RECEIPT_FAILURE');return query(input);};
 f.advance(WEEK);assert.equal((await f.overview()).status,503);f.env.DB.client.query=query;
 assert.equal((await f.pg.query('SELECT state_json FROM organization_faction_state_v1 WHERE round_id=$1',[f.roundId])).rows[0].state_json,before);
 const after=(await f.overview()).data.competition;assert.equal(after.season.number,2);assert.equal(after.seasonHistory[0].rows[0].points,32);
});

test('period changes apply next season; manual settlement cannot award early or accept a non-OWNER',async t=>{
 const f=await open(t);await captured(f,8);const initial=(await f.overview()).data.competition.season;
 assert.equal((await save(f,{competition:{seasonWeeks:2}})).status,200);
 assert.deepEqual((await f.overview()).data.competition.season,initial);
 assert.equal((await f.post('admin/organization/faction/settle',{},2)).status,403);
 const requestId=crypto.randomUUID(),first=await f.post('admin/organization/faction/settle',{requestId},1);assert.equal(first.status,200);assert.equal(first.data.competition.season.weeksSettled,0);
 assert.equal((await f.post('admin/organization/faction/settle',{requestId},1)).data.replayed,true);
 f.advance(monday+3*WEEK-f.clock());const c=(await f.overview()).data.competition;assert.equal(c.season.weeks,2);assert.equal(c.seasonHistory[0].weeks,4);
});

test('OFF cutoffs receive no points, prior ON cutoff settles before disabling, no retroactive OFF points on re-enable',async t=>{
 const f=await open(t);await captured(f,8);f.advance(monday-f.clock());assert.equal((await save(f,{mode:'OFF'})).status,200);
 assert.equal((await f.overview()).data.competition.standings[0].points,8);
 f.advance(WEEK);assert.equal((await save(f,{mode:'ON'})).status,200);
 const c=(await f.overview()).data.competition;assert.equal(c.standings[0].points,8);assert.equal(c.weeklyHistory[0].status,'SKIPPED');
});

test('TEST points are isolated and no LIVE pig coin or other account reward is created',async t=>{
 const f=await open(t,{live:false});await captured(f,8);f.advance(monday-f.clock());const v=await f.overview();assert.equal(v.status,200);assert.equal(v.data.competition.standings[0].points,8);
 assert.equal(Number((await f.pg.query('SELECT COUNT(*) n FROM user_message_rewards')).rows[0].n),0);assert.equal(v.data.sessions.history[0].myPigCoins,0);
 assert.equal((await f.pg.query("SELECT COUNT(*)::int n FROM organization_rounds_v1 WHERE scope='LIVE'")).rows[0].n,0);
});

test('initial late activation starts in the current week without backfilling past weeks',async t=>{
 const f=await fixture(t,{live:true});f.advance(at('2026-12-01T12:00:00')-f.clock());const c=(await f.overview()).data.competition;
 assert.equal(c.season.weeksSettled,0);assert.equal(c.nextWeeklyAt,at('2026-12-07T00:00:00'));assert.equal(c.weeklyHistory.length,0);
});
