import test from 'node:test';
import assert from 'node:assert/strict';
import {allocateOrganizations,defaultOrganizationPolicy,validateOrganizationPolicy,organizationHideout,ORGANIZATION_RELEASE_ENABLED} from '../shared/organization-system-v1.mjs';
import {organizationFixture} from './helpers/organization-fixture.mjs';
import {ORGANIZATION_INTERVIEW,reviewOrganizationAnswers} from '../shared/organization-interview-v1.mjs';

test('OWNER may join TEST under the same fifteen-organization capacity and balance rules',async t=>{
 const f=await organizationFixture(t,{people:15}),id=await f.prepare({enroll:15});
 await f.pg.query('INSERT INTO qa_ratings VALUES(1,12000,1)');
 assert.equal((await f.post('organization/survey',{roundId:id,revision:0,preferredOrganizationId:8},{user:1})).status,200);
 await f.close(id);await f.rate(id);
 const proposal=await f.post('admin/organization/propose',{roundId:id});
 assert.equal(proposal.status,200);assert.equal(proposal.data.proposal.stats.participants,16);
 assert.equal((await f.post('admin/organization/apply',{roundId:id,proposalId:proposal.data.proposal.id})).status,200);
 assert.ok((await f.call('organization/overview',{user:1})).data.membership);
});


test('seven admission questions require valid complete answers and produce traceable recommendations',()=>{
  const answers=Object.fromEntries(ORGANIZATION_INTERVIEW.map(q=>[q.id,q.options[0].id]));
  const baseline=reviewOrganizationAnswers(answers);
  assert.equal(baseline.recommendations.length,15);
  assert.equal(new Set(baseline.recommendations.map(o=>o.id)).size,15);
  assert.ok(baseline.organizationFit.every(n=>Number.isInteger(n)&&n>=0&&n<=100));
  assert.deepEqual(baseline.answers,answers);
  for(const q of ORGANIZATION_INTERVIEW){
    assert.equal(q.options.length,4);
    const missing={...answers};delete missing[q.id];
    assert.throws(()=>reviewOrganizationAnswers(missing),/7개 질문/);
    assert.throws(()=>reviewOrganizationAnswers({...answers,[q.id]:'forged'}),/답변/);
    assert.notDeepEqual(reviewOrganizationAnswers({...answers,[q.id]:q.options[1].id}).organizationFit,baseline.organizationFit,'Every question affects the recommendation');
  }
  for(const org of baseline.recommendations)for(const reason of org.reasons){
    const question=ORGANIZATION_INTERVIEW.find(q=>q.chapter===reason.chapter);
    assert.equal(reason.answer,question.options.find(o=>o.id===answers[question.id]).label);
  }
  assert.throws(()=>reviewOrganizationAnswers({...answers,power:90000}),/7개 질문/);
});

test('interview affinity breaks equal balance and wish ties without overriding capacity or wishes',()=>{
  const input=players(15).map((p,i)=>({...p,power:1000,preferredOrganizationId:1,organizationFit:Array.from({length:15},(_,j)=>i===j?100:0)}));
  const result=allocateOrganizations(input);
  assert.equal(result.stats.minMembers,1);assert.equal(result.stats.maxMembers,1);assert.equal(result.stats.powerSpreadPercent,0);
  assert.equal(result.stats.preferenceMatched,1);assert.equal(result.stats.affinityMean,100);
  const wishes=players(15).map((p,i)=>({...p,power:1000,organizationFit:Array.from({length:15},(_,j)=>(i+1)%15===j?100:0)}));
  assert.equal(allocateOrganizations(wishes).stats.preferenceMatched,15);
  assert.throws(()=>allocateOrganizations([{...input[0],organizationFit:[100]}]),/성향/);
});

test('server saves complete admission answers, rejects client scores, and preserves revisions after withdrawal',async t=>{
  const f=await organizationFixture(t),id=await f.prepare();
  const answers=Object.fromEntries(ORGANIZATION_INTERVIEW.map(q=>[q.id,q.options[2].id]));
  const base={roundId:id,revision:0,preferredOrganizationId:6};
  assert.equal((await f.post('organization/survey',{...base,answers:{}},{user:2})).data.code,'ORG_INTERVIEW');
  assert.equal((await f.post('organization/survey',{...base,answers,organizationFit:Array(15).fill(100)},{user:2})).status,400);
  assert.equal((await f.post('organization/survey',{...base,answers},{user:2})).status,200);
  let current=(await f.call('organization/overview',{user:2})).data;
  assert.deepEqual(current.survey.answers,answers);assert.equal(current.survey.submitted,true);
  assert.equal((await f.call('organization/overview',{user:3})).data.survey,null);
  assert.equal((await f.post('organization/withdraw',{roundId:id,revision:1},{user:2})).status,200);
  assert.equal((await f.post('organization/survey',{...base,revision:0,answers},{user:2})).data.code,'ORG_STALE');
  assert.equal((await f.post('organization/survey',{...base,revision:2,answers},{user:2})).status,200);
  current=(await f.call('organization/overview',{user:2})).data;
  assert.equal(current.survey.revision,3);assert.equal(current.participantCount,1);
  const race=await Promise.all([4,5].map(preferredOrganizationId=>f.post('organization/survey',{...base,revision:3,preferredOrganizationId,answers},{user:2})));
  assert.deepEqual(race.map(r=>r.status).sort(),[200,409]);
});


const players=n=>Array.from({length:n},(_,i)=>({userId:i+2,power:1000+(i*179)%7000,preferredOrganizationId:i%15+1}));
test('balanced allocation preserves every player, exact totals and a one-person count gap at all capacities',()=>{
  for(const n of [1,14,15,16,29,30,59,140,149,150]){
    const input=players(n),result=allocateOrganizations(input,{seed:'stable'}),members=result.organizations.flatMap(o=>o.members);
    assert.equal(members.length,n);assert.equal(new Set(members.map(m=>m.userId)).size,n);assert.ok(result.stats.maxMembers-result.stats.minMembers<=1);assert.ok(result.stats.maxMembers<=10);
    assert.equal(result.stats.totalPower,input.reduce((sum,p)=>sum+p.power,0));assert.deepEqual(result,allocateOrganizations([...input].reverse(),{seed:'stable'}));
  }
  assert.throws(()=>allocateOrganizations(players(151)),/150석/);
  assert.throws(()=>allocateOrganizations([players(1)[0],players(1)[0]]),/중복/);
});
test('equal power respects all feasible wishes; impossible popularity never breaches capacity',()=>{
  const even=players(150).map(p=>({...p,power:1000}));assert.equal(allocateOrganizations(even).stats.preferenceMatched,150);
  const crowded=allocateOrganizations(even.map(p=>({...p,preferredOrganizationId:1})));assert.equal(crowded.stats.preferenceMatched,10);assert.equal(crowded.stats.powerSpreadPercent,0);
  const extreme=allocateOrganizations(players(150).map((p,i)=>({...p,power:i===0?1e12:1})));assert.ok(extreme.stats.powerSpreadPercent>100);assert.equal(extreme.stats.maxMembers,10);
});
test('economy remains null and configuration alone cannot release or unlock content',()=>{
  const policy=defaultOrganizationPolicy();assert.equal(ORGANIZATION_RELEASE_ENABLED,true);assert.equal(policy.pointsPerRegion,null);assert.deepEqual(policy.hideoutThresholds,[0,null,null,null,null]);assert.equal(organizationHideout(1000000,policy).stage,1);
  assert.throws(()=>validateOrganizationPolicy({...policy,hideoutThresholds:[0,200,null,100,null]}),/증가/);
  assert.equal(organizationHideout(1000000,{...policy,growthMode:'SPEND',hideoutThresholds:[0,100,200,300,400]}).stage,1);
});
test('survey authorization, closed gate, stale writes, idempotency and privacy',async t=>{
  const f=await organizationFixture(t),id=await f.prepare({survey:false});
  assert.equal((await f.call('admin/organization',{user:2})).status,403);
  assert.equal((await f.call('organization/overview',{user:999})).status,401);
  assert.equal((await f.post('admin/organization/create',{scope:'LIVE',name:'실제 모집'})).status,200);
  const request={requestId:'survey-request-0001',roundId:id,revision:0,preferredOrganizationId:3};
  assert.equal((await f.post('organization/survey',request,{user:2})).data.code,'ORG_SURVEY_CLOSED');
  await f.post('admin/organization/phase',{roundId:id,revision:0,phase:'SURVEY'});
  const sent=await f.post('organization/survey',request,{user:2});assert.equal(sent.status,200);assert.deepEqual((await f.post('organization/survey',request,{user:2})).data,sent.data);
  assert.equal((await f.post('organization/survey',{...request,preferredOrganizationId:4},{user:2})).data.code,'ORG_REQUEST_CONFLICT');
  assert.equal((await f.post('organization/survey',{roundId:id,revision:0,preferredOrganizationId:4},{user:2})).data.code,'ORG_STALE');
  assert.equal((await f.post('organization/survey',{roundId:id,revision:1,preferredOrganizationId:4,power:9999999},{user:2})).status,400);
  assert.equal((await f.post('organization/survey',{roundId:id,revision:1,preferredOrganizationId:4},{user:2,headers:{Origin:'https://foreign.example'}})).status,403);
  const read=await f.call('organization/overview?roundId='+id,{user:3});assert.equal(read.data.survey,null);assert.equal(read.data.proposal,null);assert.equal(read.data.policy.testUserIds,undefined);assert.equal(read.headers.get('cache-control'),'no-store');
  assert.equal((await f.pg.query('SELECT COUNT(*)::int n FROM clan_members')).rows[0].n,1);
});
test('allocation proposal and apply are atomic, replayable and start fresh',async t=>{
  const f=await organizationFixture(t,{people:30}),id=await f.prepare({enroll:30});await f.close(id);
  const start=f.queries.length;assert.equal((await f.post('admin/organization/ratings',{roundId:id})).data.ratedCount,12);assert.equal((await f.rate(id)).data.done,true);
  const proposal=await f.post('admin/organization/propose',{roundId:id});assert.equal(proposal.status,200);assert.equal(proposal.data.proposal.stats.participants,30);
  assert.ok(f.queries.slice(start).every(sql=>!sql.includes('clan_')));
  const apply={requestId:'apply-atomic-0001',roundId:id,proposalId:proposal.data.proposal.id};
  f.fail('INSERT INTO organization_progress_v1');assert.equal((await f.post('admin/organization/apply',apply)).status,503);f.fail('');
  assert.equal((await f.pg.query('SELECT COUNT(*)::int n FROM organization_members_v1')).rows[0].n,0);
  const result=await f.post('admin/organization/apply',apply);assert.equal(result.status,200);assert.equal(result.data.assigned,30);assert.deepEqual((await f.post('admin/organization/apply',apply)).data,result.data);
  const progress=(await f.pg.query('SELECT * FROM organization_progress_v1')).rows;assert.equal(progress.length,15);assert.ok(progress.every(p=>Number(p.points)===0&&Number(p.stage)===1));
  assert.equal((await f.call('organization/overview?roundId='+id,{user:2})).data.membership.organizationId>0,true);
  await assert.rejects(f.pg.query('UPDATE organization_members_v1 SET slot=11 WHERE user_id=2'));
  assert.equal((await f.post('admin/organization/phase',{roundId:id,revision:33,phase:'SURVEY'})).status,409);
});
test('changed account power, reopened survey, expiry and removed test access block old proposals',async t=>{
  const f=await organizationFixture(t,{people:16}),id=await f.prepare({enroll:16});await f.close(id);await f.rate(id);
  let proposal=(await f.post('admin/organization/propose',{roundId:id})).data.proposal;
  await f.pg.query('UPDATE qa_ratings SET power=power+100,version=version+1 WHERE user_id=2');
  assert.equal((await f.post('admin/organization/apply',{roundId:id,proposalId:proposal.id})).data.code,'ORG_RATING_CHANGED');
  await f.post('admin/organization/ratings',{roundId:id,restart:true});await f.rate(id);proposal=(await f.post('admin/organization/propose',{roundId:id})).data.proposal;
  const state=(await f.call('admin/organization')).data;await f.post('admin/organization/phase',{roundId:id,revision:state.round.revision,phase:'SURVEY'});await f.close(id);
  assert.equal((await f.post('admin/organization/apply',{roundId:id,proposalId:proposal.id})).data.code,'ORG_RATING_PENDING');
  await f.rate(id);proposal=(await f.post('admin/organization/propose',{roundId:id})).data.proposal;f.advance(300001);
  assert.equal((await f.post('admin/organization/apply',{roundId:id,proposalId:proposal.id})).data.code,'ORG_RATING_PENDING');
  const policy=(await f.call('admin/organization')).data.policy;await f.post('admin/organization/policy',{policy:{...policy,testUserIds:policy.testUserIds.filter(id=>id!==2)}});
  assert.equal((await f.call('organization/overview?roundId='+id,{user:2})).status,403);
});
test('over-capacity surveys are retained without silently excluding or assigning anyone',async t=>{
  const f=await organizationFixture(t,{people:151}),id=await f.prepare({enroll:151});await f.close(id);
  assert.equal((await f.post('admin/organization/ratings',{roundId:id})).data.code,'ORG_OVERFLOW');assert.equal((await f.pg.query('SELECT COUNT(*)::int n FROM organization_surveys_v1')).rows[0].n,151);
});
