import test from 'node:test';
import assert from 'node:assert/strict';
import {seasonAdmissionFixture} from './helpers/clan-season-admission-fixture.mjs';
import {organizationJoinOverview} from '../functions/_organization_join.js';
import {clanRejoinKey} from '../functions/_organization_rejoin.js';
const ok=r=>assert.equal(r.status,200,JSON.stringify(r));

test('active season level two exposes applicant/elder screens and fills only two vacancies atomically',async t=>{
 const f=await seasonAdmissionFixture(t),view=await f.view(131),elder=await f.view(2);
 assert.equal(view.elderSeason.phase,'COMPETITION');assert.equal(view.join.enabled,true);assert.equal(view.join.canApply,true);
 assert.equal(elder.join.canReview,true);assert.equal(elder.join.enabled,true);
 assert.equal(view.organizations[6].memberCount,8);assert.equal(view.organizations[6].memberLimit,10);
 for(const user of [130,131,132])ok(await f.apply(user));
 assert.equal((await f.view(2)).join.applications.length,3);
 assert.equal((await f.review(4,131)).status,403);assert.equal((await f.review(5,131)).status,403);
 const requestId=crypto.randomUUID();ok(await f.review(2,131,{requestId}));ok(await f.review(2,131,{requestId}));
 const results=await Promise.all([f.review(2,130),f.review(3,132)]);
 assert.deepEqual(results.map(r=>r.status).sort(),[200,409]);
 assert.equal(results.find(r=>r.status===409).data.code,'ORG_FULL');
 assert.equal((await f.q('SELECT count(*)::int n FROM organization_members_v1 WHERE round_id=$1 AND organization_id=7',[f.season.roundId]))[0].n,10);
 assert.equal((await f.q('SELECT count(*)::int n FROM clan_members WHERE season_id=$1 AND clan_id=7',[f.season.seasonId]))[0].n,10);
 assert.equal((await f.apply(129)).data.code,'ORG_FULL');
 assert.equal((await f.view(131)).membership.organizationId,7);
 assert.equal((await f.view(131)).join.canApply,false);
});

test('calendar boundaries and archived source round keep scheduled signup separate from season approvals',async t=>{
 const f=await seasonAdmissionFixture(t),[round]=await f.q('SELECT * FROM organization_rounds_v1 WHERE id=$1',[f.season.roundId]);
 const user={id:131,role:'USER'};
 for(const [when,enabled] of [[f.c.startsAt-1,false],[f.c.startsAt,true],[f.c.endsAt-1,true],[f.c.endsAt,false]]){
  const v=await organizationJoinOverview(f.q,round,user,when,null,f.c);
  assert.equal(v.enabled,enabled,String(when));
 }
 assert.equal((await organizationJoinOverview(f.q,{...round,id:f.c.sourceRoundId},user,f.c.startsAt,null,f.c)).enabled,false);
 ok(await f.apply(131));f.advance(f.c.endsAt-f.clock());
 let loads=0;f.deps.loadOrganizationRatings=async()=>{loads++;throw Error('Closed season must skip ratings');};
 assert.equal((await f.apply(132)).data.code,'ORG_JOIN_CLOSED');
 assert.equal((await f.review(2,131)).data.code,'ORG_JOIN_CLOSED');assert.equal(loads,0);
 assert.equal((await f.view(131)).join.enabled,false);
});

test('season admission preserves rejoin cooldown and rolls back both rosters on receipt failure',async t=>{
 const f=await seasonAdmissionFixture(t),key=clanRejoinKey({scope:'LIVE'},131),availableAt=f.clock()+86400000;
 await f.q('INSERT INTO app_meta(key,value) VALUES($1,$2)',[key,JSON.stringify({leftAt:f.clock(),availableAt})]);
 assert.equal((await f.view(131)).join.canApply,false);assert.equal((await f.apply(131)).data.code,'ORG_REJOIN_WAIT');
 f.advance(availableAt-f.clock());ok(await f.apply(131));
 const before=(await f.view()).round.revision,requestId=crypto.randomUUID();
 f.fail('INSERT INTO organization_receipts_v1');assert.equal((await f.review(2,131,{requestId})).status,503);f.fail('');
 assert.equal((await f.view(131)).membership,null);assert.equal((await f.view(131)).join.application.status,'PENDING');
 assert.equal((await f.q('SELECT user_id FROM clan_members WHERE season_id=$1 AND user_id=131',[f.season.seasonId])).length,0);
 assert.equal((await f.view()).round.revision,before);
 ok(await f.review(2,131,{requestId}));ok(await f.review(2,131,{requestId}));
 assert.equal((await f.q('SELECT user_id FROM clan_members WHERE season_id=$1 AND user_id=131',[f.season.seasonId])).length,1);
});
