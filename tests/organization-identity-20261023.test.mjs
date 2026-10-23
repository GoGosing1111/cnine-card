import test from 'node:test';
import assert from 'node:assert/strict';
import {organizationFixture} from './helpers/organization-fixture.mjs';
const legacyNames=['도끼파','쌍칼파','독사파','불곰파','백상어파','까마귀파'];
const currentNames=['DK','삼성','T1','한화','LG','롯데'];
const ok=response=>assert.equal(response.status,200,JSON.stringify(response));

async function legacyProposal(t){
 const f=await organizationFixture(t,{people:12});
 await f.pg.query('UPDATE users SET nickname=$1 WHERE id=2',['조직의 친구']);
 const roundId=await f.prepare({enroll:12});
 await f.pg.query('UPDATE organization_rounds_v1 SET name=$1 WHERE id=$2',['조직 정식 모집 2026',roundId]);
 ok(await f.close(roundId));ok(await f.rate(roundId));
 const requestId=crypto.randomUUID(),response=await f.post('admin/organization/propose',{roundId,requestId});ok(response);
 const proposalId=response.data.proposal.id;
 const [stored]=(await f.pg.query('SELECT result_json FROM organization_proposals_v1 WHERE id=$1',[proposalId])).rows;
 const result=JSON.parse(stored.result_json);
 // Model a proposal and receipt persisted before the identity change, not a new client payload.
 for(const org of result.organizations)org.name=legacyNames[org.id-1];
 const snapshot=JSON.stringify(result);
 await f.pg.query('UPDATE organization_proposals_v1 SET result_json=$1 WHERE id=$2',[snapshot,proposalId]);
 const receipt=JSON.stringify({...response.data,proposal:{...response.data.proposal,...result}});
 await f.pg.query('UPDATE organization_receipts_v1 SET response_json=$1 WHERE actor_id=1 AND request_id=$2',[receipt,requestId]);
 return {...f,roundId,requestId,proposalId,result,snapshot,receipt};
}

test('pre-rename proposal and replay display current names while original snapshot approves unchanged',async t=>{
 const f=await legacyProposal(t),view=await f.call('admin/organization?roundId='+f.roundId);ok(view);
 assert.equal(view.data.round.name,'클랜 정식 모집 2026');
 assert.deepEqual(view.data.proposal.organizations.map(o=>o.name),currentNames);
 assert.equal(view.data.proposal.organizations.flatMap(o=>o.members).find(m=>m.userId===2).nickname,'조직의 친구');
 const replay=await f.post('admin/organization/propose',{roundId:f.roundId,requestId:f.requestId});ok(replay);
 assert.deepEqual(replay.data.proposal.organizations.map(o=>o.name),currentNames);
 assert.equal((await f.pg.query('SELECT response_json FROM organization_receipts_v1 WHERE actor_id=1 AND request_id=$1',[f.requestId])).rows[0].response_json,f.receipt);
 const approved=await f.post('admin/organization/apply',{roundId:f.roundId,proposalId:f.proposalId});ok(approved);assert.equal(approved.data.assigned,12);
 const actual=(await f.pg.query('SELECT user_id,organization_id,slot,seed_power FROM organization_members_v1 WHERE round_id=$1 ORDER BY user_id',[f.roundId])).rows.map(m=>[Number(m.user_id),Number(m.organization_id),Number(m.slot),Number(m.seed_power)]);
 const expected=f.result.organizations.flatMap(o=>o.members.map(m=>[m.userId,o.id,m.slot,m.power])).sort((a,b)=>a[0]-b[0]);
 assert.deepEqual(actual,expected);
 const [preserved]=(await f.pg.query('SELECT result_json,applied_at FROM organization_proposals_v1 WHERE id=$1',[f.proposalId])).rows;
 assert.equal(preserved.result_json,f.snapshot);assert.notEqual(preserved.applied_at,null);
 assert.equal((await f.pg.query('SELECT name FROM organization_rounds_v1 WHERE id=$1',[f.roundId])).rows[0].name,'조직 정식 모집 2026');
 assert.equal((await f.pg.query('SELECT nickname FROM users WHERE id=2')).rows[0].nickname,'조직의 친구');
});

for(const [label,tamper] of [
 ['power',result=>{result.organizations[0].members[0].power++;result.organizations[0].power++;}],
 ['member assignment',result=>{const a=result.organizations[0].members[0],b=result.organizations[1].members[0];[a.userId,b.userId]=[b.userId,a.userId];}]
])test('legacy-name compatibility still rejects modified '+label+' without committing membership',async t=>{
 const f=await legacyProposal(t),modified=structuredClone(f.result);tamper(modified);
 await f.pg.query('UPDATE organization_proposals_v1 SET result_json=$1 WHERE id=$2',[JSON.stringify(modified),f.proposalId]);
 const requestId=crypto.randomUUID(),response=await f.post('admin/organization/apply',{roundId:f.roundId,proposalId:f.proposalId,requestId});
 assert.equal(response.status,503);assert.equal(response.data.code,'ORG_PROPOSAL_INVALID');
 assert.equal((await f.pg.query('SELECT count(*)::int AS n FROM organization_members_v1 WHERE round_id=$1',[f.roundId])).rows[0].n,0);
 assert.equal((await f.pg.query('SELECT applied_at FROM organization_proposals_v1 WHERE id=$1',[f.proposalId])).rows[0].applied_at,null);
 assert.equal((await f.pg.query('SELECT count(*)::int AS n FROM organization_receipts_v1 WHERE actor_id=1 AND request_id=$1',[requestId])).rows[0].n,0);
});
