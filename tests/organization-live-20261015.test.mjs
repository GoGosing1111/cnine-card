import test from 'node:test';
import assert from 'node:assert/strict';
import {organizationFixture} from './helpers/organization-fixture.mjs';
import {reconcileOrganizationRecruitment,organizationLiveOperation} from '../functions/_organization.js';
import {ORGANIZATION_RECRUITMENT_MS} from '../shared/organization-system-v1.mjs';

async function live(f,{enroll=0,autoAssign=true}={}){
 const created=await f.post('admin/organization/create',{scope:'LIVE',name:'조직 첫 모집'});assert.equal(created.status,200);
 const id=created.data.roundId,opened=await f.post('admin/organization/phase',{roundId:id,revision:0,phase:'SURVEY',autoAssign});assert.equal(opened.status,200);
 for(let user=2;user<enroll+2;user++){const sent=await f.post('organization/survey',{roundId:id,revision:0,preferredOrganizationId:user%15+1},{user});assert.equal(sent.status,200);}
 return id;
}
const tick=f=>reconcileOrganizationRecruitment(f.env,f.deps,{now:f.clock()});
test('LIVE recruitment lasts exactly 24 hours, rejects late updates and retains accepted receipts',async t=>{
 const f=await organizationFixture(t),id=await live(f),start=f.clock();
 let state=(await f.call('organization/overview',{user:2})).data;
 assert.equal(Number(state.round.opened_at),start);assert.equal(Number(state.round.closes_at)-start,ORGANIZATION_RECRUITMENT_MS);assert.equal(state.admissionEnabled,true);
 const request={requestId:'late-safe-survey-0001',roundId:id,revision:0,preferredOrganizationId:2};
 f.advance(ORGANIZATION_RECRUITMENT_MS-1);assert.equal((await f.post('organization/survey',request,{user:2})).status,200);
 f.advance(1);assert.equal((await f.post('organization/survey',{roundId:id,revision:0,preferredOrganizationId:3},{user:3})).data.code,'ORG_SURVEY_CLOSED');
 assert.equal((await f.post('organization/withdraw',{roundId:id,revision:1},{user:2})).data.code,'ORG_SURVEY_CLOSED');
 assert.equal((await f.post('organization/survey',request,{user:2})).status,200);
 state=(await f.call('organization/overview',{user:2})).data;assert.equal(state.round.phase,'CLOSED');assert.equal(state.survey.submitted,true);assert.equal(state.admissionEnabled,true);
 const outsider=(await f.call('organization/overview',{user:3})).data;assert.equal(outsider.admissionEnabled,false);assert.equal(outsider.survey,null);assert.equal(outsider.participants,undefined);
 assert.equal((await f.pg.query('SELECT COUNT(*)::int n FROM organization_surveys_v1')).rows[0].n,1);
});
test('private scheduler closes and fairly assigns 150 applicants atomically without a browser, and replays safely',async t=>{
 const f=await organizationFixture(t,{people:150}),id=await live(f,{enroll:150});
 assert.equal((await tick(f)).waiting,true);f.advance(ORGANIZATION_RECRUITMENT_MS);
 const outputs=await Promise.all([tick(f),tick(f)]);assert.equal(outputs.filter(r=>r.status==='ASSIGNED').length,1);
 const state=(await f.call('admin/organization')).data;assert.equal(state.round.phase,'ASSIGNED');assert.equal(state.round.assignment_status,'COMPLETED');assert.equal(state.participants.length,150);
 assert.equal(state.organizations.length,15);assert.ok(state.organizations.every(o=>o.memberCount===10));
 const rows=(await f.pg.query('SELECT user_id FROM organization_members_v1 WHERE round_id=$1',[id])).rows;assert.equal(rows.length,150);assert.equal(new Set(rows.map(r=>r.user_id)).size,150);
 assert.equal((await tick(f)).status,'IDLE');assert.equal((await f.pg.query('SELECT COUNT(*)::int n FROM clan_members')).rows[0].n,1);
 const user=(await f.call('organization/overview',{user:2})).data;assert.equal(user.roster.length,10);assert.equal(user.proposal,null);assert.equal(user.participants,undefined);assert.equal(user.round.assignment_token,undefined);
});
test('overflow preserves every application and stops without arbitrary removal or clan migration',async t=>{
 const f=await organizationFixture(t,{people:151}),id=await live(f,{enroll:151});f.advance(ORGANIZATION_RECRUITMENT_MS);
 const result=await tick(f);assert.equal(result.status,'BLOCKED');assert.equal(result.participants,151);
 const state=(await f.call('admin/organization')).data;assert.equal(state.round.phase,'CLOSED');assert.match(state.round.assignment_error,/150명/);assert.equal(state.participantCount,151);assert.equal(state.participants.length,151);
 assert.equal((await f.pg.query('SELECT COUNT(*)::int n FROM organization_members_v1')).rows[0].n,0);
 assert.equal((await f.pg.query('SELECT COUNT(*)::int n FROM organization_surveys_v1 WHERE round_id=$1 AND active=1',[id])).rows[0].n,151);
});
test('manual mode closes on time but does not assign, and explicit reopening starts a fresh 24-hour window',async t=>{
 const f=await organizationFixture(t),id=await live(f,{enroll:2,autoAssign:false});f.advance(ORGANIZATION_RECRUITMENT_MS);
 assert.equal((await tick(f)).status,'MANUAL');const state=(await f.call('admin/organization')).data;assert.equal(state.round.phase,'CLOSED');assert.equal(state.membership,null);
 const body={requestId:'reopen-safe-request-0001',roundId:id,revision:state.round.revision,phase:'SURVEY',autoAssign:true};
 const opened=await f.post('admin/organization/phase',body);assert.equal(opened.status,200);assert.equal(Number(opened.data.round.closes_at),f.clock()+ORGANIZATION_RECRUITMENT_MS);
 f.advance(1000);assert.deepEqual((await f.post('admin/organization/phase',body)).data,opened.data);
});
test('assignment transaction failure is visible, rolls back all membership and can recover on the next tick',async t=>{
 const f=await organizationFixture(t),id=await live(f,{enroll:15});f.advance(ORGANIZATION_RECRUITMENT_MS);f.fail('INSERT INTO organization_progress_v1');
 await assert.rejects(tick(f),/INJECTED/);f.fail('');
 const before=(await f.call('admin/organization')).data;assert.equal(before.round.assignment_status,'RETRY');assert.equal((await f.pg.query('SELECT COUNT(*)::int n FROM organization_members_v1')).rows[0].n,0);
 assert.equal((await tick(f)).status,'ASSIGNED');assert.equal((await f.pg.query('SELECT COUNT(*)::int n FROM organization_members_v1 WHERE round_id=$1',[id])).rows[0].n,15);
});
test('content status uses the exact recruitment deadline and never exposes answers or applicants',async t=>{
 const f=await organizationFixture(t);await live(f,{enroll:2});
 const status=await organizationLiveOperation(f.env,f.clock());assert.equal(status.kind,'ORGANIZATION');assert.equal(status.phase,'FORMATION');assert.equal(Date.parse(status.deadlineAt),f.clock()+ORGANIZATION_RECRUITMENT_MS);assert.doesNotMatch(JSON.stringify(status),/검수 참가자|preferred|answers|power/);
 f.advance(ORGANIZATION_RECRUITMENT_MS);assert.equal((await organizationLiveOperation(f.env,f.clock())).phase,'PREPARING');
});

test('deadline is checked after request body parsing and row locks, not when request headers arrived',async t=>{
 const f=await organizationFixture(t),id=await live(f);f.advance(ORGANIZATION_RECRUITMENT_MS-1);
 const {handleOrganization}=await import('../functions/_organization.js'),{ORGANIZATION_INTERVIEW}=await import('../shared/organization-interview-v1.mjs');
 const body={requestId:'slow-body-deadline-0001',roundId:id,revision:0,preferredOrganizationId:1,answers:Object.fromEntries(ORGANIZATION_INTERVIEW.map(q=>[q.id,q.options[0].id]))};
 const request=new Request('http://127.0.0.1:4287/api/organization/survey',{method:'POST',headers:{'x-qa-user':'2','Content-Type':'application/json',Origin:'http://127.0.0.1:4287'},body:JSON.stringify(body)}),read=request.body.getReader.bind(request.body);
 request.body.getReader=()=>{f.advance(2);return read();};
 const response=await handleOrganization({path:'organization/survey',request,env:f.env,deps:f.deps});assert.equal(response.status,409);assert.equal((await response.json()).code,'ORG_SURVEY_CLOSED');
 assert.equal((await f.pg.query('SELECT COUNT(*)::int n FROM organization_surveys_v1')).rows[0].n,0);
});
test('a changed power snapshot is invalidated so the next minute rebuilds it without waiting for TTL',async t=>{
 const f=await organizationFixture(t),id=await live(f,{enroll:15});f.advance(ORGANIZATION_RECRUITMENT_MS);
 const validator=f.deps.validateOrganizationRatingsLocked,loader=f.deps.loadOrganizationRatings;let calls=0,changed=false;
 f.deps.loadOrganizationRatings=async(...args)=>{calls++;return loader(...args);};
 f.deps.validateOrganizationRatingsLocked=async(q,ratings,options)=>{if(!changed){changed=true;await q('UPDATE qa_ratings SET version=version+1 WHERE user_id=2');return false;}return validator(q,ratings,options);};
 assert.equal((await tick(f)).code,'ORG_RATING_CHANGED');const first=calls;
 assert.equal((await f.pg.query('SELECT COUNT(*)::int n FROM organization_ratings_v1 WHERE round_id=$1',[id])).rows[0].n,0);
 f.advance(60000);assert.equal((await tick(f)).status,'ASSIGNED');assert.ok(calls>first);
});
