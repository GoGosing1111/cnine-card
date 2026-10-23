import test from 'node:test';import assert from 'node:assert/strict';
import {organizationFixture} from './helpers/organization-fixture.mjs';
import {installOrganizationFactionSchema} from '../functions/_organization_faction.js';
import {newOrganizationFactionState} from '../functions/_organization_faction_model.js';
const ok=r=>assert.equal(r.status,200,JSON.stringify(r));
async function fixture(t){
 const f=await organizationFixture(t,{people:50});const roundId=await f.prepare({survey:false});await installOrganizationFactionSchema(f.env.DB);
 f.advance(Date.parse('2026-10-24T05:00:00Z')-f.clock());
 await f.pg.exec('CREATE TABLE app_meta(key TEXT PRIMARY KEY,value TEXT,updated_at TEXT)');
 await f.pg.query("UPDATE organization_rounds_v1 SET phase='ASSIGNED',assigned_at=$2 WHERE id=$1",[roundId,f.clock()-1000]);
 for(const [user,org,slot] of [[2,1,1],[3,1,2],[4,2,1]])await f.pg.query('INSERT INTO organization_members_v1 VALUES($1,$2,$3,$4,1000,$5)',[roundId,user,org,slot,f.clock()]);
 for(let id=1;id<=6;id++)await f.pg.query('INSERT INTO organization_progress_v1(round_id,organization_id) VALUES($1,$2)',[roundId,id]);
 const state=newOrganizationFactionState(f.clock());state.elders={1:[2,3],2:[4]};
 await f.pg.query('INSERT INTO organization_faction_state_v1(round_id,state_json) VALUES($1,$2)',[roundId,JSON.stringify(state)]);
 const apply=(user,extra={})=>f.post('organization/join/apply',{roundId,revision:0,organizationId:1,message:'함께하겠습니다.',...extra},{user});
 const review=(user,target,extra={})=>f.post('organization/join/review',{roundId,userId:target,revision:1,decision:'APPROVED',...extra},{user});
 const overview=user=>f.call('organization/overview?roundId='+roundId,{user});
 return {...f,roundId,apply,review,overview};
}
test('nonmembers apply; only the same organization elders review; approval atomically joins and replays',async t=>{
 const f=await fixture(t);ok(await f.apply(5));
 assert.equal((await f.overview(5)).data.join.application.status,'PENDING');
 assert.equal((await f.overview(2)).data.join.applications.length,1);
 assert.equal((await f.overview(4)).data.join.applications.length,0);
 assert.equal((await f.review(4,5)).status,403);assert.equal((await f.review(1,5)).status,403);assert.equal((await f.review(6,5)).status,403);
 const requestId=crypto.randomUUID();ok(await f.review(3,5,{requestId}));ok(await f.review(3,5,{requestId}));
 assert.equal((await f.review(3,5,{requestId,decision:'REJECTED'})).data.code,'ORG_REQUEST_CONFLICT');
 const view=(await f.overview(5)).data;assert.equal(view.membership.organizationId,1);assert.equal(view.membership.slot,3);assert.equal(view.join.canApply,false);
 assert.equal((await f.apply(5,{revision:2})).data.code,'ORG_MEMBER');
});
test('pending requests cannot move silently; cancellation/rejection can resubmit and stale review is rejected',async t=>{
 const f=await fixture(t);ok(await f.apply(5));
 assert.equal((await f.apply(5,{revision:1,organizationId:2})).data.code,'ORG_PENDING');
 ok(await f.post('organization/join/cancel',{roundId:f.roundId,revision:1},{user:5}));
 assert.equal((await f.review(2,5)).data.code,'ORG_STALE');
 ok(await f.apply(5,{revision:2,organizationId:2,message:'<script>bad</script>'}));
 ok(await f.review(4,5,{revision:3,decision:'REJECTED'}));
 ok(await f.apply(5,{revision:4,organizationId:1}));
 assert.equal((await f.overview(2)).data.join.applications[0].revision,5);
});
test('parallel elder approvals cannot exceed 25 members; last slot belongs to one applicant',async t=>{
 const f=await fixture(t);
 for(let i=3;i<=24;i++)await f.pg.query('INSERT INTO organization_members_v1 VALUES($1,$2,1,$3,1000,$4)',[f.roundId,i+10,i,f.clock()]);
 ok(await f.apply(5));ok(await f.apply(6));
 const results=await Promise.all([f.review(2,5),f.review(3,6)]);
 assert.deepEqual(results.map(r=>r.status).sort(),[200,409]);
 assert.equal((await f.pg.query('SELECT count(*)::int n FROM organization_members_v1 WHERE round_id=$1 AND organization_id=1',[f.roundId])).rows[0].n,25);
 assert.equal((await f.apply(7)).data.code,'ORG_FULL');
});
test('receipt failure rolls back membership/application/round revision, then exact retry succeeds',async t=>{
 const f=await fixture(t);ok(await f.apply(5));
 const before=(await f.pg.query('SELECT revision FROM organization_rounds_v1 WHERE id=$1',[f.roundId])).rows[0].revision,requestId=crypto.randomUUID();
 f.fail('INSERT INTO organization_receipts_v1');assert.equal((await f.review(2,5,{requestId})).status,503);f.fail('');
 assert.equal((await f.overview(5)).data.membership,null);assert.equal((await f.overview(5)).data.join.application.status,'PENDING');
 assert.equal((await f.pg.query('SELECT revision FROM organization_rounds_v1 WHERE id=$1',[f.roundId])).rows[0].revision,before);
 ok(await f.review(2,5,{requestId}));assert.equal((await f.overview(5)).data.membership.organizationId,1);
});
test('banned applicants, removed elders, malformed fields and off-scope users are rejected',async t=>{
 const f=await fixture(t);ok(await f.apply(5));await f.pg.query("UPDATE users SET banned_until='2099-01-01T00:00:00Z' WHERE id=5");
 assert.equal((await f.review(2,5)).data.code,'ORG_ACCOUNT');
 await f.pg.query("UPDATE organization_faction_state_v1 SET state_json=jsonb_set(state_json::jsonb,'{elders,1}','[3]')::text");
 assert.equal((await f.review(2,5,{decision:'REJECTED'})).status,403);
 assert.equal((await f.apply(6,{message:'x'.repeat(301)})).status,400);
 assert.equal((await f.apply(6,{organizationId:7})).status,400);
 const p=(await f.call('admin/organization')).data.policy;ok(await f.post('admin/organization/policy',{policy:{...p,testUserIds:[2,3,4,5]}}));
 assert.equal((await f.apply(6)).status,403);
});
