import test from 'node:test';
import assert from 'node:assert/strict';
import {clanResumeFixture} from './helpers/clan-resume-fixture.mjs';
import {inspectResume,applyResume} from '../scripts/ops/clan-resume-20261025.mjs';
import {planReshuffle,hash} from '../scripts/ops/clan-reshuffle-plan-20261025.mjs';
import {inspectReshuffle,applyReshuffle,validatePlan} from '../scripts/ops/clan-reshuffle-20261025.mjs';

async function fixture(t){
 const f=await clanResumeFixture(t);
 const old=(await f.pg.query('SELECT user_id FROM organization_members_v1 WHERE organization_id=6 AND slot=1')).rows[0].user_id;
 await f.pg.query("INSERT INTO users VALUES(5426,'나무늘봉순','USER','ACTIVE',NULL)");
 await f.pg.query('UPDATE organization_members_v1 SET user_id=5426 WHERE user_id=$1',[old]);
 const s=JSON.parse((await f.pg.query('SELECT state_json FROM organization_faction_state_v1')).rows[0].state_json);s.elders[6]=s.elders[6].map(id=>id===Number(old)?5426:id);s.commanders[6]=5426;
 await f.pg.query('UPDATE organization_faction_state_v1 SET state_json=$1',[JSON.stringify(s)]);
 const first=await inspectResume(f.pg),resumed=await applyResume(f.pg,{dryRun:false,expectedReviewHash:first.reviewHash,now:f.clock(),random:()=>0});
 await f.pg.exec('CREATE TABLE ranked_duo_policy_version_v1(id BIGINT PRIMARY KEY,revision BIGINT);INSERT INTO ranked_duo_policy_version_v1 VALUES(1,7)');
 const members=(await f.pg.query('SELECT m.*,u.nickname FROM organization_members_v1 m JOIN users u ON u.id=m.user_id ORDER BY m.user_id')).rows;
 const regularHistory=(await f.pg.query('SELECT * FROM clan_members ORDER BY user_id')).rows;
 const history={members,regularHistory,receipts:[]},ratings={evaluatedAt:new Date(f.clock()).toISOString(),basis:'ISOLATED_RUNTIME_FIXTURE',ratings:members.map(m=>({userId:Number(m.user_id),power:700+parseInt(hash(String(m.user_id)).slice(0,6),16)%21000,sourceVersion:1,policyRevision:7,advancedForgeRevision:0}))};
 const plan=planReshuffle(history,ratings,{attempts:3});
 await f.pg.query('INSERT INTO clan_weekly_availability VALUES($1,1,2,$2,$3,$4)',[resumed.receipt.seasonId,'2026-10-26','[2,3,4,6]',f.clock()]);
 const war=(await f.pg.query('SELECT id FROM clan_wars WHERE season_id=$1 ORDER BY id LIMIT 1',[resumed.receipt.seasonId])).rows[0];
 await f.pg.query("INSERT INTO clan_war_readiness VALUES($1,2,1,'READY',$2)",[war.id,f.clock()]);
 await f.pg.query('INSERT INTO clan_war_field_state VALUES($1,$2,$3)',[war.id,JSON.stringify({oldTeamPlan:[2]}),f.clock()]);
 return {...f,history,ratings,plan,seasonId:resumed.receipt.seasonId};
}
test('history avoidance, fixed Lotte member, all other moves and top-power quotas are simultaneous constraints',async t=>{
 const f=await fixture(t),p=f.plan;validatePlan(p);assert.equal(p.stats.moved,127);assert.equal(p.stats.unvisitedMoves,127);assert.equal(p.assignments.find(a=>a.userId===5426).clanId,6);
 assert(p.stats.after.every(c=>c.count===16&&c.top8===1&&c.top16===2&&c.top32===4));
 const copy=structuredClone(p);copy.assignments[0].clanId=copy.assignments[0].currentClan;const {planHash,...body}=copy;copy.planHash=hash(body);assert.throws(()=>validatePlan(copy));
});
test('reshuffle atomically mirrors current season, preserves schedules/history/availability, and replays SELECT-only',async t=>{
 const f=await fixture(t);t.mock.method(Date,'now',f.clock);const before=await inspectReshuffle(f.pg),options={plan:f.plan,now:f.clock()};
 const dry=await applyReshuffle(f.pg,options);assert(dry.verified&&dry.protectedUnchanged);assert.deepEqual(await inspectReshuffle(f.pg),before);
 for(const stop of ['UPDATE clan_members','DELETE FROM clan_executives','UPDATE organization_faction_state_v1','INSERT INTO app_meta']){
  await assert.rejects(applyReshuffle({query:(sql,args)=>{if(sql.includes(stop))throw Error('INJECTED');return f.pg.query(sql,args);}},{...options,dryRun:false}),/INJECTED/);assert.deepEqual(await inspectReshuffle(f.pg),before);
 }
 const live=await applyReshuffle(f.pg,{...options,dryRun:false});assert(live.verified);assert.equal(Object.values(live.receipt.elders).flat().length,24);
 const user=2,want=f.plan.assignments.find(p=>p.userId===user).clanId,view=await f.call('clan/overview',{regular:true,user});assert.equal(view.status,200,JSON.stringify(view));assert.equal(view.data.membership.clanId,want);
 const org=await f.organizationCall('organization/overview',{user});assert.equal(org.status,200);assert.equal(org.data.membership.organizationId,want);
 const replay=await applyReshuffle({query:(sql,args)=>{assert.match(sql,/^SELECT\b/);return f.pg.query(sql,args);}});assert(replay.replayed);
 assert.equal((await f.pg.query('SELECT count(*)::int n FROM user_messages')).rows[0].n,0);
});
test('changed membership, power policy, active faction or started regular war abort without any writes',async t=>{
 const f=await fixture(t),options={plan:f.plan,now:f.clock(),dryRun:false};
 const initial=await inspectReshuffle(f.pg);
 await f.pg.query('UPDATE ranked_duo_policy_version_v1 SET revision=8');let before=await inspectReshuffle(f.pg);await assert.rejects(applyReshuffle(f.pg,options),/policy changed/);assert.deepEqual(await inspectReshuffle(f.pg),before);await f.pg.query('UPDATE ranked_duo_policy_version_v1 SET revision=7');
 const state=JSON.parse(initial.before.state.state_json);state.session={status:'ACTIVE'};await f.pg.query('UPDATE organization_faction_state_v1 SET state_json=$1',[JSON.stringify(state)]);before=await inspectReshuffle(f.pg);await assert.rejects(applyReshuffle(f.pg,options),/Faction war/);assert.deepEqual(await inspectReshuffle(f.pg),before);await f.pg.query('UPDATE organization_faction_state_v1 SET state_json=$1',[initial.before.state.state_json]);
 await f.pg.query('UPDATE organization_members_v1 SET seed_power=seed_power+1 WHERE user_id=2');before=await inspectReshuffle(f.pg);await assert.rejects(applyReshuffle(f.pg,options),/Membership changed/);assert.deepEqual(await inspectReshuffle(f.pg),before);await f.pg.query('UPDATE organization_members_v1 SET seed_power=seed_power-1 WHERE user_id=2');
 await f.pg.query("UPDATE clan_wars SET status='ACTIVE' WHERE id=(SELECT min(id) FROM clan_wars)");before=await inspectReshuffle(f.pg);await assert.rejects(applyReshuffle(f.pg,options),/Regular war/);assert.deepEqual(await inspectReshuffle(f.pg),before);
});
