import test from 'node:test';
import assert from 'node:assert/strict';
import {organizationFixture} from './helpers/organization-fixture.mjs';
import {duoFixture} from './helpers/ranked-duo-db.mjs';
import {loadDuoProfiles} from '../functions/_ranked_duo_profiles.js';
import {organizationAssignmentAvailability} from '../admin/organization-admin-v1.mjs';

test('organization requests a review window instead of recycling a nearly expired duo profile',async t=>{
 const f=await duoFixture(t);await f.ready();
 const [first]=await loadDuoProfiles(f.env,[2],f.config,f.deps,{now:f.clock()});
 f.advance(260000);f.resetQueries();
 const [cached]=await loadDuoProfiles(f.env,[2],f.config,f.deps,{now:f.clock()});
 assert.equal(cached.expiresAt,first.expiresAt);assert.equal(f.queries().filter(q=>q.includes('FROM user_cards uc JOIN')).length,0);
 const [fresh]=await loadDuoProfiles(f.env,[2],f.config,f.deps,{now:f.clock(),minimumValidityMs:180000});
 assert.ok(Date.parse(fresh.expiresAt)>=f.clock()+299000);assert.equal(fresh.power,first.power);
 assert.equal(fresh.sourceVersion,first.sourceVersion);assert.equal(f.queries().filter(q=>q.includes('FROM user_cards uc JOIN')).length,1);
});

test('review window never extends a real expiring title',async t=>{
 const f=await duoFixture(t);await f.ready();const now=Date.now(),expires=new Date(now+60000).toISOString();
 await f.p('INSERT INTO character_titles VALUES(99,1000,1)').run();
 await f.p('INSERT INTO user_character_titles VALUES(2,99,?)',expires).run();
 const [profile]=await loadDuoProfiles(f.env,[2],f.config,f.deps,{now,minimumValidityMs:180000});
 assert.equal(profile.expiresAt,expires);
});

test('rating completion uses the clock after expensive loading, and resumes only the expired accounts',async t=>{
 const f=await organizationFixture(t,{people:15}),id=await f.prepare({enroll:15});await f.close(id);
 assert.equal((await f.post('admin/organization/ratings',{roundId:id})).data.ratedCount,12);
 f.advance(250000);const loader=f.deps.loadOrganizationRatings,batches=[];
 f.deps.loadOrganizationRatings=async(...args)=>{batches.push(args[1]);f.advance(60000);return loader(...args);};
 const response=await f.post('admin/organization/ratings',{roundId:id});
 assert.equal(response.status,200);assert.equal(response.data.done,false);assert.equal(response.data.ratedCount,3);
 const resumed=await f.post('admin/organization/ratings',{roundId:id});assert.equal(resumed.data.done,true);
 assert.deepEqual(batches[0],[14,15,16]);assert.deepEqual(batches[1],Array.from({length:12},(_,i)=>i+2));
 const proposal=(await f.post('admin/organization/propose',{roundId:id})).data.proposal;
 const body={requestId:'recovered-assignment-001',roundId:id,proposalId:proposal.id};
 const applied=await f.post('admin/organization/apply',body);assert.equal(applied.status,200);assert.equal(applied.data.assigned,15);
 assert.deepEqual((await f.post('admin/organization/apply',body)).data,applied.data);
 assert.equal((await f.pg.query('SELECT COUNT(*)::int n FROM organization_members_v1')).rows[0].n,15);
});

test('CMS explains missing, expired, completed and overflow assignments using server time',()=>{
 const now=Date.now(),state={round:{phase:'CLOSED'},participantCount:115,ratedCount:115,capacity:150,proposal:{expiresAt:now+300000}};
 assert.equal(organizationAssignmentAvailability(state,now).canApply,true);
 assert.match(organizationAssignmentAvailability(state,now+300000).reason,/만료/);
 assert.equal(organizationAssignmentAvailability(state,now+300000).canApply,false);
 assert.match(organizationAssignmentAvailability({...state,ratedCount:95},now).reason,/95\/115명/);
 assert.equal(organizationAssignmentAvailability({...state,proposal:{...state.proposal,invalidated:true}},now).canApply,false);
 assert.match(organizationAssignmentAvailability({...state,proposal:null},now).reason,/배정안을 만들고/);
 assert.match(organizationAssignmentAvailability({...state,participantCount:151},now).reason,/정원을 초과/);
 assert.match(organizationAssignmentAvailability({...state,round:{phase:'ASSIGNED'}},now).reason,/이미 조직 배정/);
});
