import test from 'node:test';
import assert from 'node:assert/strict';
import {calendarFixture} from './helpers/clan-review-fixture.mjs';
import {clanHideoutCapacity} from '../shared/organization-capacity-v1.mjs';
import {reconcileSignupCapacity,organizationMemberLimit} from '../functions/_organization_capacity.js';

async function membersFixture(t){
 const f=await calendarFixture(t);f.advance(f.c.elderClosesAt-f.clock());await f.tick();
 const set=async(stage,count)=>{
  await f.q('UPDATE organization_progress_v1 SET stage=$2 WHERE round_id=$1',[f.roundId,stage]);
  const [row]=await f.q('SELECT value FROM app_meta WHERE key=$1',[f.windowKey]);const w=JSON.parse(row.value);
  w.selections={1:[{id:2,power:1000}]};w.members=Object.fromEntries(Array.from({length:count-1},(_,i)=>[i+3,{organizationId:1,power:1000,joinedAt:f.clock()+i}]));
  await f.q('UPDATE app_meta SET value=$2 WHERE key=$1',[f.windowKey,JSON.stringify(w)]);
 };
 return {...f,set};
}

test('new season always recruits at reset level one regardless of prior hideout; last seat is atomic and full rejects skip ratings',async t=>{
 const f=await membersFixture(t),load=f.deps.loadOrganizationRatings;let loads=0;
 f.deps.loadOrganizationRatings=async(...args)=>{loads++;return load(...args);};
 for(const [stage,limit] of [[1,8],[2,10],[3,15],[4,25],[5,25]]){
  await f.set(stage,7);assert.equal(clanHideoutCapacity(stage),limit);
  assert.equal(await organizationMemberLimit(f.q,f.roundId,1),limit,'existing season level capacity');
  assert.equal((await f.view(131)).organizations[0].memberLimit,8,'upcoming season level one');
  assert.equal((await f.view(131)).organizations[0].hideout.stage,1);
  const requestId=crypto.randomUUID(),result=await f.send('join',131,{organizationId:1,requestId});
  assert.equal(result.status,200,JSON.stringify(result));const used=loads;
  assert.equal((await f.send('join',131,{organizationId:1,requestId})).status,200);assert.equal(loads,used);
  const full=await f.send('join',132,{organizationId:1});assert.equal(full.data.code,'ORG_FULL');assert.equal(loads,used);
  assert.equal((await f.view()).elderSeason.memberCounts[1],8);
 }
 await f.set(1,7);
 const attempts=await Promise.all([f.send('join',131,{organizationId:1}),f.send('join',132,{organizationId:1})]);
 assert.deepEqual(attempts.map(r=>r.status).sort(),[200,409]);assert.equal((await f.view()).elderSeason.memberCounts[1],8);
});

test('failed receipt restores the last slot; prior upgrades do not expand next season and new season resets hideout/funds atomically',async t=>{
 const f=await membersFixture(t);await f.set(1,7);const requestId=crypto.randomUUID();
 f.fail('INSERT INTO organization_receipts_v1');assert.equal((await f.send('join',131,{organizationId:1,requestId})).status,503);f.fail('');
 assert.equal((await f.view()).elderSeason.memberCounts[1],7);
 assert.equal((await f.send('join',131,{organizationId:1,requestId})).status,200);
 assert.equal((await f.send('join',132,{organizationId:1})).data.code,'ORG_FULL');
 await f.q('UPDATE organization_progress_v1 SET stage=2 WHERE round_id=$1 AND organization_id=1',[f.roundId]);
 assert.equal((await f.send('join',132,{organizationId:1})).data.code,'ORG_FULL');
 await f.q('UPDATE organization_progress_v1 SET points=9999,stage=5 WHERE round_id=$1',[f.roundId]);
 await f.q('INSERT INTO organization_faction_treasury_v1(round_id,organization_id,balance,total_earned) SELECT round_id,organization_id,9999,19999 FROM organization_progress_v1 WHERE round_id=$1 ON CONFLICT(round_id,organization_id) DO UPDATE SET balance=9999,total_earned=19999',[f.roundId]);
 const beforeProgress=await f.q('SELECT * FROM organization_progress_v1 WHERE round_id=$1 ORDER BY organization_id',[f.roundId]);
 const beforeTreasury=await f.q('SELECT * FROM organization_faction_treasury_v1 WHERE round_id=$1 ORDER BY organization_id',[f.roundId]);
 f.advance(f.c.startsAt-f.clock());
 f.fail('INSERT INTO organization_faction_treasury_v1');await assert.rejects(f.tick(),/INJECTED_ORGANIZATION_FAILURE/);f.fail('');
 assert.equal((await f.q("SELECT id FROM organization_rounds_v1 WHERE scope='LIVE'"))[0].id,f.roundId,'failed reset rolls back season transition');
 const started=await f.tick();assert.equal(started.status,'STARTED');
 const progress=await f.q('SELECT * FROM organization_progress_v1 WHERE round_id=$1',[started.roundId]);
 const treasury=await f.q('SELECT * FROM organization_faction_treasury_v1 WHERE round_id=$1',[started.roundId]);
 assert(progress.length&&progress.every(p=>Number(p.stage)===1&&Number(p.points)===0));
 assert(treasury.length&&treasury.every(p=>Number(p.balance)===0&&Number(p.total_earned)===0));
 assert.deepEqual(await f.q('SELECT * FROM organization_progress_v1 WHERE round_id=$1 ORDER BY organization_id',[f.roundId]),beforeProgress);
 assert.deepEqual(await f.q('SELECT * FROM organization_faction_treasury_v1 WHERE round_id=$1 ORDER BY organization_id',[f.roundId]),beforeTreasury);
 await f.q('UPDATE organization_progress_v1 SET stage=2 WHERE round_id=$1 AND organization_id=1',[started.roundId]);
 assert.equal((await f.view(131)).organizations[0].memberLimit,10);
 assert.equal((await f.tick()).changed,false);assert.equal(await organizationMemberLimit(f.q,started.roundId,1),10,'reconcile replay preserves upgrades');
});

test('capacity reconciliation preserves elders and earliest registrations, records overflow once, and allows immediate reapplication',async t=>{
 const f=await membersFixture(t);await f.set(1,10);
 const [row]=await f.q('SELECT value FROM app_meta WHERE key=$1',[f.windowKey]);const w=JSON.parse(row.value),before=structuredClone(w);
 // A lower numeric account ID joined last; insertion/key order must not decide admission.
 w.members[3].joinedAt=f.clock()+1000;
 const progress=[{organization_id:1,stage:1}],result=reconcileSignupCapacity(w,progress,f.clock());
 assert.deepEqual(result.removed.map(m=>m.userId),[11,3]);assert.equal(result.clans[0].after,8);
 assert.deepEqual(w.selections,before.selections);assert.deepEqual(reconcileSignupCapacity(w,progress,f.clock()).removed,[]);
 await f.q('UPDATE app_meta SET value=$2 WHERE key=$1',[f.windowKey,JSON.stringify(w)]);
 const view=(await f.view(3)).elderSeason;assert.ok(view.capacityReapplication);assert.equal(view.rejoin.blocked,false);
 assert.equal((await f.send('join',3,{organizationId:2})).status,200);
 assert.equal((await f.view(3)).elderSeason.capacityReapplication,null);
});
