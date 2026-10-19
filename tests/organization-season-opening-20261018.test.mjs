import test from 'node:test';
import assert from 'node:assert/strict';
import {allocateAdditionalOrganizations} from '../shared/organization-additional-v1.mjs';
import {ORGANIZATION_SESSION_RULES} from '../shared/organization-faction-v1.mjs';
import {FACTION_SESSION_RULES,factionSessionRewards} from '../shared/clan-faction-sessions-v1.mjs';
import {organizationFixture} from './helpers/organization-fixture.mjs';
import {runOrganizationAllocation} from '../functions/_organization.js';
import {organizationAssignmentAvailability} from '../admin/organization-admin-v1.mjs';

test('115 preserved members plus 14 additions fill 21–22 slots across six organizations, preserving a fixed assignment',()=>{
 const counts=[20,19,19,19,19,19];let id=1;
 const existing=counts.flatMap((n,i)=>Array.from({length:n},(_,j)=>({userId:id++,organizationId:i+1,slot:j+1,power:2300+(j%3)*100,nickname:'기존 '+id,preferredOrganizationId:i+1})));
 const before=structuredClone(existing),applicants=Array.from({length:14},(_,i)=>({userId:5426+i,power:1500+i*111,nickname:i?'추가 '+i:'나무늘봉순',preferredOrganizationId:3})),fixedAssignments=[{userId:5426,organizationId:3}];
 const result=allocateAdditionalOrganizations(applicants,existing,{fixedAssignments});
 assert.deepEqual(existing,before);assert.equal(result.stats.participants,129);assert.equal(result.stats.minMembers,21);assert.equal(result.stats.maxMembers,22);
 assert.equal(result.organizations.filter(o=>o.memberCount===22).length,3);assert.equal(result.organizations[2].members.find(m=>m.userId===5426).fixed,true);
 for(const p of existing){const found=result.organizations[p.organizationId-1].members.find(m=>m.userId===p.userId);for(const [key,value] of Object.entries(p))assert.equal(found[key],value);}
 assert.equal(new Set(result.organizations.flatMap(o=>o.members.map(m=>m.userId))).size,129);
 assert.deepEqual(allocateAdditionalOrganizations([...applicants].reverse(),[...existing].reverse(),{fixedAssignments}),result);
 assert.throws(()=>allocateAdditionalOrganizations(applicants,existing,{fixedAssignments:[{userId:1,organizationId:3}]}),{code:'ORG_PLACEMENT'});
});

test('closed additional recruitment can rate, preview and atomically apply only new members; retries preserve all existing rows',async t=>{
 const f=await organizationFixture(t,{people:17}),roundId=await f.prepare({enroll:15});await f.close(roundId);await f.rate(roundId);
 let proposed=await f.post('admin/organization/propose',{roundId});assert.equal(proposed.status,200);const targetId=proposed.data.proposal.organizations.find(o=>o.memberCount===2).id;
 assert.equal((await f.post('admin/organization/apply',{roundId,proposalId:proposed.data.proposal.id})).status,200);
 await f.pg.query('UPDATE organization_progress_v1 SET stage=3,points=123 WHERE organization_id=$1',[targetId]);
 const before=(await f.pg.query('SELECT * FROM organization_members_v1 ORDER BY user_id')).rows,progress=(await f.pg.query('SELECT * FROM organization_progress_v1 ORDER BY organization_id')).rows;
 let state=(await f.call('admin/organization')).data;const assignedAt=state.round.assigned_at;
 assert.equal((await f.post('admin/organization/additional-recruitment',{roundId,revision:state.round.revision,action:'open'})).status,200);
 for(const user of [17,18])assert.equal((await f.post('organization/survey',{roundId,revision:0,preferredOrganizationId:3},{user})).status,200);
 state=(await f.call('admin/organization')).data;assert.equal(state.proposal,null);assert.equal(state.ratedCount,0);
 assert.equal((await f.post('admin/organization/ratings',{roundId})).data.code,'ORG_PHASE');
 assert.equal((await f.post('admin/organization/additional-recruitment',{roundId,revision:state.round.revision,action:'close'})).status,200);
 await assert.rejects(runOrganizationAllocation(f.env,{ownerId:2,action:'ratings',roundId,requestId:crypto.randomUUID()},f.deps),{code:'ORG_PERMISSION'});
 const rating=await runOrganizationAllocation(f.env,{ownerId:1,action:'ratings',roundId,requestId:crypto.randomUUID()},f.deps);assert.equal(rating.total,2);assert.equal(rating.done,true);
 proposed=await f.post('admin/organization/propose',{roundId,fixedAssignments:[{userId:17,organizationId:targetId}]});assert.equal(proposed.status,200,JSON.stringify(proposed));
 state=(await f.call('admin/organization')).data;assert.equal(organizationAssignmentAvailability(state,f.clock()).canApply,true);
 const request={requestId:crypto.randomUUID(),roundId,proposalId:proposed.data.proposal.id};f.fail('INSERT INTO organization_receipts_v1');
 assert.equal((await f.post('admin/organization/apply',request)).status,503);f.fail('');
 assert.deepEqual((await f.pg.query('SELECT * FROM organization_members_v1 ORDER BY user_id')).rows,before);
 const applied=await f.post('admin/organization/apply',request);assert.equal(applied.status,200,JSON.stringify(applied));assert.equal(applied.data.assigned,2);
 assert.deepEqual((await f.post('admin/organization/apply',request)).data,applied.data);
 const after=(await f.pg.query('SELECT * FROM organization_members_v1 ORDER BY user_id')).rows;
 assert.equal(after.length,17);assert.deepEqual(after.filter(m=>Number(m.user_id)<17),before);assert.equal(after.find(m=>Number(m.user_id)===17).organization_id,targetId);
 assert.deepEqual((await f.pg.query('SELECT * FROM organization_progress_v1 ORDER BY organization_id')).rows,progress);
 state=(await f.call('admin/organization')).data;assert.equal(state.round.assigned_at,assignedAt);assert.equal(state.round.assignment_status,'COMPLETED');assert.equal(state.pendingApplicantCount,0);assert.equal(organizationAssignmentAvailability(state,f.clock()).canApply,false);
});

test('organization requires nine territories and pays 300 billion once per participating member; old clan amounts stay unchanged',()=>{
 const roster=[{userId:1,clanId:1},{userId:2,clanId:1},{userId:3,clanId:2}],participants=[1,3],participantClans={1:1,3:2},policy={recipients:'PARTICIPANTS',rewardRules:ORGANIZATION_SESSION_RULES};
 for(const count of [6,8,9,10]){
  const districts=Array.from({length:count},()=>({owner:1})),result=factionSessionRewards(districts,roster,participants,policy,participantClans);
  assert.equal(result.recipients.length,count>=9?1:0);
  if(count>=9)assert.deepEqual(result.recipients[0],{userId:1,clanId:1,territories:count,amount:300000000000,masterStars:300000,mysticEnergy:300});
 }
 assert.equal(FACTION_SESSION_RULES.requiredTerritories,4);assert.equal(factionSessionRewards(Array.from({length:4},()=>({owner:1})),roster,participants,{recipients:'PARTICIPANTS'},participantClans).recipients[0].amount,30000000000);
});
