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

test('7 territories never pay pig coins; 8 pay only active same-clan participants once before the lock',async t=>{
 for(const territories of [7,8]){
  const f=await open(t);await captured(f,territories);
  await f.mutateState(s=>{s.session.participants=[2,3,4,7];s.session.participantClans={2:1,3:2,4:1,7:2};});
  await f.pg.query("UPDATE users SET status='SUSPENDED' WHERE id=4");
  f.advance(end-f.clock());const v=await f.overview();assert.equal(v.status,200);
  const expected=territories===8?[{id:2,amount:200}]:[];
  assert.deepEqual(await rewardRows(f),expected);
  await Promise.all([tickOrganizationFaction(f.env,f.deps),f.overview(),f.overview()]);
  assert.deepEqual(await rewardRows(f),expected);
 }
});

test('pig threshold is independent of standard rewards; settings freeze at the actual pre-lock session start',async t=>{
 const f=await open(t);await captured(f);
 assert.equal((await save(f,{pigCoinReward:{enabled:true,requiredTerritories:6,amount:350}})).status,200);
 f.advance(end-f.clock());await f.overview();assert.deepEqual(await rewardRows(f),[{id:2,amount:200},{id:3,amount:200}]);
 const changed=await fixture(t,{live:true});changed.advance(start-1-changed.clock());
 assert.equal((await save(changed,{pigCoinReward:{enabled:true,requiredTerritories:6,amount:350}})).status,200);
 changed.advance(1);await changed.overview();await captured(changed,6);changed.advance(end-changed.clock());await changed.overview();
 assert.deepEqual(await rewardRows(changed),[{id:2,amount:350},{id:3,amount:350}]);
 const recent=(await changed.overview()).data.sessions.history[0];assert.equal(recent.myReward,0);assert.equal(recent.myPigCoins,350);
});

test('OFF pig reward preserves standard rewards and old clients preserve configured fields',async t=>{
 const f=await fixture(t,{live:true});f.advance(start-1-f.clock());
 assert.equal((await save(f,{pigCoinReward:{enabled:false,requiredTerritories:9,amount:400}})).status,200);
 const policy=(await f.admin()).data.policy;delete policy.pigCoinReward;delete policy.competition;
 const old=await f.call('admin/organization/faction/policy',{user:1,body:{requestId:crypto.randomUUID(),policy}});
 assert.equal(old.status,200);assert.deepEqual(old.data.policy.pigCoinReward,{enabled:false,requiredTerritories:9,amount:400});
 f.advance(1);await f.overview();await captured(f,9);f.advance(end-f.clock());await f.overview();
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

// The October 25 restoration lock supersedes all future weekly/season cutoffs.
// Exercise the actual public handler and persisted legacy state, without bypassing that lock.
test('restoration lock prevents weekly/season settlement and preserves historical state across multiple cutoffs',async t=>{
 const f=await open(t);await captured(f,8);f.advance(end-f.clock());await f.overview();
 await f.mutateState(s=>{s.competition.weeklyHistory=[{key:'historical-week',rows:[{organizationId:1,points:8}]}];s.competition.seasonHistory=[{key:'historical-season',rows:[{organizationId:1,points:32}]}];});
 const before=(await f.pg.query('SELECT state_json FROM organization_faction_state_v1 WHERE round_id=$1',[f.roundId])).rows[0].state_json;
 const rewards=await rewardRows(f),receipts=await counts(f);
 for(const now of [at('2026-10-25T00:00:00'),monday,monday+3*WEEK,monday+12*WEEK]){
  f.advance(now-f.clock());await tickOrganizationFaction(f.env,f.deps);
  const v=(await f.overview()).data;assert.equal(v.sessions.scheduleLocked,true);assert.equal(v.sessions.active,false);
  assert.equal(v.competition.enabled,false);assert.equal(v.competition.pointsIncluded,false);assert.equal(v.competition.season,null);
  assert.deepEqual(v.competition.weeklyHistory,[{key:'historical-week',rows:[{organizationId:1,points:8}]}]);
  assert.deepEqual(v.competition.seasonHistory,[{key:'historical-season',rows:[{organizationId:1,points:32}]}]);
  assert.deepEqual(await rewardRows(f),rewards);assert.deepEqual(await counts(f),receipts);
  assert.equal((await f.pg.query('SELECT state_json FROM organization_faction_state_v1 WHERE round_id=$1',[f.roundId])).rows[0].state_json,before);
 }
});
test('saved ON or period changes and repeated OWNER manual settlement cannot reopen locked schedules',async t=>{
 const f=await open(t);await captured(f,8);f.advance(monday-f.clock());
 const before=await counts(f);
 for(const mode of ['OFF','ON']){
  assert.equal((await save(f,{mode,competition:{seasonWeeks:2}})).status,200);
  assert.equal((await f.overview()).data.sessions.scheduleLocked,true);
 }
 assert.equal((await f.post('admin/organization/faction/settle',{},2)).status,403);
 const requestId=crypto.randomUUID();assert.equal((await f.post('admin/organization/faction/settle',{requestId},1)).status,200);
 assert.equal((await f.post('admin/organization/faction/settle',{requestId},1)).data.replayed,true);
 assert.deepEqual(await counts(f),before);assert.deepEqual(await rewardRows(f),[]);
});
test('TEST session rewards stay isolated and late LIVE activation stays locked without backfill',async t=>{
 const isolated=await open(t,{live:false});await captured(isolated,8);isolated.advance(end-isolated.clock());await isolated.overview();
 assert.equal(Number((await isolated.pg.query('SELECT COUNT(*) n FROM user_message_rewards')).rows[0].n),0);
 assert.equal((await isolated.pg.query("SELECT COUNT(*)::int n FROM organization_rounds_v1 WHERE scope='LIVE'")).rows[0].n,0);
 const late=await fixture(t,{live:true});late.advance(at('2026-12-01T12:00:00')-late.clock());
 const v=(await late.overview()).data;assert.equal(v.sessions.scheduleLocked,true);assert.equal(v.competition.season,null);
 assert.equal(v.competition.nextWeeklyAt,null);assert.deepEqual(await counts(late),[]);assert.deepEqual(await rewardRows(late),[]);
});
