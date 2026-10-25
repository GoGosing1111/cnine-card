import test from 'node:test';
import assert from 'node:assert/strict';
import {ORGANIZATIONS,ORGANIZATION_LIMITS,allocateOrganizations} from '../shared/organization-system-v1.mjs';
import {allocateAdditionalOrganizations} from '../shared/organization-additional-v1.mjs';
import {ORGANIZATION_INTERVIEW,reviewOrganizationAnswers} from '../shared/organization-interview-v1.mjs';
import {CLAN_RESTORATION} from '../shared/clan-restoration-v1.mjs';
import {organizationFixture} from './helpers/organization-fixture.mjs';
import {installOrganizationFactionSchema} from '../functions/_organization_faction.js';
import {newOrganizationFactionState} from '../functions/_organization_faction_model.js';
import {OP,inspectEight,expandEight,verifyEight} from '../scripts/ops/organization-eight-20261025.mjs';
const players=n=>Array.from({length:n},(_,i)=>({userId:i+2,power:1000+(i*173)%8500,preferredOrganizationId:i%8+1}));

test('eight identities support 129 and 200 balanced seats, retain six-score inputs, and reject 201',()=>{
 assert.deepEqual(ORGANIZATIONS.map(o=>o.name),['DK','삼성','T1','한화','LG','롯데','FM','DC']);assert.equal(ORGANIZATION_LIMITS.participants,200);
 for(const n of [129,200]){const plan=allocateOrganizations(players(n));assert.equal(plan.organizations.length,8);assert.equal(plan.stats.participants,n);assert(plan.stats.maxMembers-plan.stats.minMembers<=1);assert(plan.stats.maxMembers<=25);assert.equal(new Set(plan.organizations.flatMap(o=>o.members.map(m=>m.userId))).size,n);}
 const legacy=players(8).map(p=>({...p,organizationFit:[0,1,2,3,4,5]}));assert(allocateOrganizations(legacy).organizations.flatMap(o=>o.members).every(m=>m.organizationFit.length===8));
 assert.throws(()=>allocateOrganizations(players(201)),/200석/);
 const interview=reviewOrganizationAnswers(Object.fromEntries(ORGANIZATION_INTERVIEW.map(q=>[q.id,q.options[0].id])));assert.equal(interview.recommendations.length,8);
 const existing=players(192).map((p,i)=>({...p,organizationId:i%8+1,slot:Math.floor(i/8)+1})),added=players(8).map(p=>({...p,userId:p.userId+192}));
 const result=allocateAdditionalOrganizations(added,existing);assert(result.organizations.every(o=>o.memberCount===25));for(const old of existing){const o=result.organizations.find(o=>o.id===old.organizationId),m=o.members.find(m=>m.userId===old.userId);assert.equal(m.slot,old.slot);assert.equal(m.power,old.power);}
 assert.throws(()=>allocateAdditionalOrganizations([...added,{userId:999,power:1000,preferredOrganizationId:8}],existing),/200석/);
});

export async function eightFixture(t){
 const f=await organizationFixture(t,{people:132}),roundId=await f.prepare({survey:false});await installOrganizationFactionSchema(f.env.DB);
 f.advance(Date.parse('2026-10-25T06:00:00Z')-f.clock());
 await f.pg.exec('CREATE TABLE app_meta(key TEXT PRIMARY KEY,value TEXT,updated_at TEXT);CREATE TABLE admin_logs(id BIGSERIAL PRIMARY KEY,admin_id BIGINT,action_type TEXT,target_type TEXT,target_id TEXT,before_data TEXT,after_data TEXT)');
 await f.pg.query("UPDATE organization_rounds_v1 SET scope='LIVE',phase='ASSIGNED',assigned_at=$2 WHERE id=$1",[roundId,f.clock()-1000]);
 for(const [i,p] of players(129).entries())await f.pg.query('INSERT INTO organization_members_v1 VALUES($1,$2,$3,$4,$5,$6)',[roundId,p.userId,i%6+1,Math.floor(i/6)+1,p.power,f.clock()-10000]);
 for(let id=1;id<=8;id++){await f.pg.query('INSERT INTO organization_progress_v1 VALUES($1,$2,$3,$4)',[roundId,id,id*10,id<=6?3:1]);await f.pg.query('INSERT INTO organization_faction_treasury_v1 VALUES($1,$2,$3,$4)',[roundId,id,id<=6?id*1000:0,id<=6?id*2000:0]);}
 const state=newOrganizationFactionState(f.clock());state.session={key:'past-session',status:'SETTLED'};state.sessionHistory=[{key:'past-session',status:'SETTLED'}];state.battles=[{id:'past-battle',status:'COMPLETE'}];state.districts.forEach((d,i)=>{d.owner=i%6+1;d.defense='defense1';});
 await f.pg.query('INSERT INTO organization_faction_state_v1(round_id,state_json) VALUES($1,$2)',[roundId,JSON.stringify(state)]);
 await f.pg.query('INSERT INTO app_meta VALUES($1,$2,$3)',['organization-join:'+roundId+':133',JSON.stringify({userId:133,organizationId:1,status:'PENDING',revision:1,message:'기존 신청',updatedAt:f.clock()}),new Date(f.clock()).toISOString()]);
 return {...f,roundId,options:{roundId,now:f.clock()}};
}

test('audited redistribution rolls back every failure and dry run, preserves balances/history, and replays without writes',async t=>{
 const f=await eightFixture(t),before=await inspectEight(f.pg,{roundId:f.roundId}),options={...f.options,expectedReviewHash:before.reviewHash};
 await assert.rejects(expandEight(f.pg,{...options,expectedReviewHash:'stale'}),/changed after review/);
 const dry=await expandEight(f.pg,options);assert(dry.verified&&dry.protectedUnchanged);assert.deepEqual(await inspectEight(f.pg,{roundId:f.roundId}),before);
 for(const match of ['INSERT INTO organization_members_v1','UPDATE organization_faction_state_v1','INSERT INTO admin_logs','INSERT INTO app_meta']){
  const db={query:(sql,args)=>{if(sql.includes(match))throw Error('INJECTED');return f.pg.query(sql,args);}};
  await assert.rejects(expandEight(db,{...options,dryRun:false}),/INJECTED/);assert.deepEqual(await inspectEight(f.pg,{roundId:f.roundId}),before);assert.equal((await f.pg.query('SELECT count(*)::int n FROM admin_logs')).rows[0].n,0);
 }
 const result=await expandEight(f.pg,{...options,dryRun:false});assert(result.verified&&result.protectedUnchanged);assert.deepEqual(result.clans.map(o=>o.memberCount).sort((a,b)=>a-b),[16,16,16,16,16,16,16,17]);
 const state=JSON.parse((await f.pg.query('SELECT state_json FROM organization_faction_state_v1')).rows[0].state_json);
 assert.equal(Object.keys(state.formations).length,8);assert(Object.values(state.formations).flatMap(f=>Object.values(f)).every(ids=>ids.length===0));assert(Object.values(state.elders).every(ids=>ids.length===3));assert(state.districts.every(d=>d.owner>=1&&d.owner<=6&&!d.defense));
 const after=await inspectEight(f.pg,{roundId:f.roundId});assert.deepEqual(after.before.protectedHashes,before.before.protectedHashes);
 const replay=await expandEight({query:(sql,args)=>{assert.match(sql,/^SELECT\b/);return f.pg.query(sql,args);}},{roundId:f.roundId});assert(replay.replayed);assert.equal((await f.pg.query('SELECT count(*)::int n FROM admin_logs')).rows[0].n,1);
 assert(CLAN_RESTORATION.regularScheduleLocked&&CLAN_RESTORATION.championsScheduleLocked&&CLAN_RESTORATION.factionScheduleLocked);
});

test('FM and DC display in current API and use the existing elder approval, with foreign elders and ninth clan rejected',async t=>{
 const f=await eightFixture(t),read=await inspectEight(f.pg,{roundId:f.roundId});await expandEight(f.pg,{...f.options,expectedReviewHash:read.reviewHash,dryRun:false});
 const view=await f.call('admin/organization?roundId='+f.roundId);assert.equal(view.status,200);assert.equal(view.data.capacity,200);assert.equal(view.data.organizations.length,8);
 const state=JSON.parse((await f.pg.query('SELECT state_json FROM organization_faction_state_v1')).rows[0].state_json);
 for(const [user,id] of [[131,7],[132,8]]){
  const apply=await f.post('organization/join/apply',{roundId:f.roundId,revision:0,organizationId:id,message:'새 동료입니다.'},{user});assert.equal(apply.status,200,JSON.stringify(apply));
  const body={roundId:f.roundId,userId:user,revision:1,decision:'APPROVED'};
  assert.equal((await f.post('organization/join/review',body,{user:state.elders[1][0]})).status,403);
  const reviewed=await f.post('organization/join/review',body,{user:state.elders[id][0]});assert.equal(reviewed.status,200,JSON.stringify(reviewed));
  assert.equal((await f.call('organization/overview',{user})).data.membership.organizationId,id);
 }
 assert.equal((await f.post('organization/join/apply',{roundId:f.roundId,revision:0,organizationId:9,message:''},{user:1})).status,400);
 assert((await verifyEight(f.pg,{roundId:f.roundId})).verified);
});

test('server enrollment and proposal include the 200th applicant and reject an over-capacity snapshot',async t=>{
 const f=await organizationFixture(t,{people:201}),roundId=await f.prepare({enroll:200});await f.close(roundId);
 for(let i=0;i<18;i++){const r=await f.post('admin/organization/ratings',{roundId});assert.equal(r.status,200,JSON.stringify(r));if(r.data.done)break;}
 const proposal=await f.post('admin/organization/propose',{roundId});assert.equal(proposal.status,200,JSON.stringify(proposal));assert.equal(proposal.data.proposal.stats.participants,200);assert(proposal.data.proposal.organizations.every(o=>o.memberCount===25));
 await f.pg.query('INSERT INTO organization_surveys_v1(round_id,user_id,preferred_id,updated_at,answers_json) SELECT round_id,202,8,updated_at,answers_json FROM organization_surveys_v1 WHERE round_id=$1 LIMIT 1',[roundId]);
 const overflow=await f.post('admin/organization/ratings',{roundId});assert.equal(overflow.data.code,'ORG_OVERFLOW');
});
