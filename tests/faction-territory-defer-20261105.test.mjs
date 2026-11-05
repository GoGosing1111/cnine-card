import test from 'node:test';
import assert from 'node:assert/strict';
import {newOrganizationFactionState,advanceOrganizationFaction} from '../functions/_organization_faction_model.js';
import {tickOrganizationFaction} from '../functions/_organization_faction.js';
import {CLAN_RESUMPTION_VERSION,EVENING_FACTION_RULES,createResumedFactionDay} from '../shared/clan-resumption-v1.mjs';
import {clanResumeFixture} from './helpers/clan-resume-fixture.mjs';
import {inspectResume,applyResume} from '../scripts/ops/clan-resume-20261025.mjs';
const at=s=>Date.parse(s+'+09:00'),day='2026-11-05',midnight=at(day+'T00:00:00');
const release={version:CLAN_RESUMPTION_VERSION,enabled:true,effectiveAt:at('2026-10-25T16:00:00'),seasonId:7,roundId:'qa',factionSchedule:{version:EVENING_FACTION_RULES.version,effectiveAt:midnight}};
const schedule=createResumedFactionDay(day,release,()=>81),slot=schedule[0];
const war={id:94,status:'ACTIVE',starts_at:'2026-11-05T08:06:26.057Z',ends_at:'2026-11-06T04:06:26.057Z',settled_at:null};
const finished={...war,status:'FINISHED',settled_at:'2026-11-05 11:00:54'};
const policy={mode:'ON',fundsPerRegion:1000000,pigCoinReward:{enabled:true,requiredTerritories:4,amount:200}};
const roster=[{userId:2,clanId:1,status:'ACTIVE'}];
function fixture(status){
 const state=newOrganizationFactionState(midnight);state.resumption=structuredClone(release);state.sessionDay=day;state.scheduleVersion=EVENING_FACTION_RULES.version;
 state.formations[1]={ATTACK_1:[2]};state.districts.slice(0,4).forEach(d=>d.owner=1);
 state.sessionPlan=[{...slot,status:status||'SCHEDULED',...(status==='SKIPPED'?{reason:'TERRITORY_WAR'}:{})}];
 const advance=(now,wars=[finished],slots=schedule)=>advanceOrganizationFaction(state,{schedule:slots,wars,roster,now,assignedAt:release.effectiveAt,policy});
 return {state,advance};
}
test('war overlapping the opening queues the same evening slot and starts a full two hours after settlement',()=>{
 const {state,advance}=fixture(),owners=state.districts.map(d=>d.owner),formations=structuredClone(state.formations);
 let result=advance(slot.startsAt,[war]);assert(!result.view.active);assert.equal(state.sessionPlan[0].status,'QUEUED');assert.equal(state.sessionQueue.length,1);
 advance(slot.endsAt+1,[war]);assert.equal(state.sessionQueue.length,1);assert.equal(state.sessionPlan[0].reason,'TERRITORY_WAR');
 const resumedAt=at(day+'T20:01:00');result=advance(resumedAt);assert(result.view.active);assert.equal(state.session.key,slot.key);assert.equal(state.session.startsAt,resumedAt);assert.equal(state.session.endsAt,resumedAt+7200000);assert.equal(state.sessionQueue.length,0);
 assert.deepEqual(state.districts.map(d=>d.owner),owners);assert.deepEqual(state.formations,formations);assert.equal(state.session.rewardRules.coinPerRecipient,5e12);assert.equal(state.session.rewardRules.masterStarsPerRecipient,5e7);
 advance(resumedAt+60000);assert.equal(state.session.startsAt,resumedAt);assert.equal(state.session.endsAt,resumedAt+7200000);
});
test('late first poll uses actual territory settlement and recovers only a proven unpublished-start skip',()=>{
 for(const status of ['SCHEDULED','SKIPPED']){
  const {state,advance}=fixture(status),now=at(day+'T20:17:00');assert(advance(now).view.active);assert.equal(state.session.key,slot.key);assert.equal(state.session.startsAt,now);assert.equal(state.session.endsAt,now+7200000);
  state.session.participants=[2];state.session.participantClans={2:1};const settled=advance(now+7200000);assert.equal(settled.settlements.length,1);assert.equal(settled.settlements[0].recipients[0].amount,5e12);
  assert.equal(advance(now+7200001).settlements.length,0);assert.equal(state.session.status,'SETTLED');
 }
});
test('recovery requires matching published slot and war evidence, never reopens settled or unrelated skips',()=>{
 for(const mutate of [
  f=>f.state.sessionPlan[0].reason='BEFORE_ASSIGNMENT',
  f=>f.state.sessionPlan[0].startsAt++,
  f=>f.state.sessionHistory=[{...slot,status:'SETTLED',recipients:[]}],
  f=>f.state.session={...slot,status:'CANCELLED',closedAt:slot.endsAt,recipients:[]}
 ]){
  const f=fixture('SKIPPED');mutate(f);assert(!f.advance(at(day+'T20:17:00')).view.active);assert.equal(f.state.sessionQueue.length,0);
 }
 const f=fixture('SKIPPED');assert(!f.advance(at(day+'T20:17:00'),[]).view.active);
});
test('queued and repaired slots retain the 23:59 deadline and never spill into the next day',()=>{
 const f=fixture();f.advance(slot.startsAt,[war]);const late={...finished,settled_at:'2026-11-05 14:30:00'};
 assert(f.advance(at(day+'T23:30:01'),[late]).view.active);assert.equal(f.state.session.endsAt,slot.hardEndsAt);
 assert.equal(f.advance(slot.hardEndsAt,[late]).settlements.length,1);assert(!f.advance(slot.hardEndsAt+1,[late]).view.active);
 const expired=fixture();expired.advance(slot.startsAt,[war]);assert(!expired.advance(slot.hardEndsAt,[war]).view.active);assert.equal(expired.state.sessionQueue.length,0);assert.equal(expired.state.sessionPlan[0].reason,'WINDOW_ENDED');
 const skipped=fixture('SKIPPED');assert(!skipped.advance(slot.hardEndsAt).view.active);
 const next=skipped.advance(at('2026-11-06T00:01:00'),[finished],createResumedFactionDay('2026-11-06',release,()=>0));assert(!next.view.active);assert.equal(skipped.state.sessionQueue.length,0);assert.equal(next.view.schedule[0].dayKey,'2026-11-06');
});
test('live scheduler transaction recovers the skipped slot atomically; retries keep timing and pay once',async t=>{
 const f=await clanResumeFixture(t),review=await inspectResume(f.pg);await applyResume(f.pg,{now:f.clock(),expectedReviewHash:review.reviewHash,dryRun:false,random:()=>0});
 f.advance(at(day+'T20:17:00')-f.clock());
 let row=(await f.pg.query('SELECT * FROM organization_faction_state_v1 WHERE round_id=$1',[f.roundId])).rows[0],state=JSON.parse(row.state_json);
 state.resumption.factionSchedule=release.factionSchedule;state.sessionDay=day;state.scheduleVersion=EVENING_FACTION_RULES.version;state.session=null;state.sessionPlan=[{...slot,status:'SKIPPED',reason:'TERRITORY_WAR'}];state.sessionQueue=[];
 state.districts.slice(0,4).forEach(d=>d.owner=1);const before=JSON.stringify(state);
 await f.pg.query('UPDATE organization_faction_state_v1 SET state_json=$1 WHERE round_id=$2',[before,f.roundId]);
 await f.pg.query('INSERT INTO organization_faction_days_v1 VALUES($1,$2,$3) ON CONFLICT(round_id,day_key) DO UPDATE SET schedule_json=excluded.schedule_json',[f.roundId,day,JSON.stringify(schedule)]);
 await f.pg.query('INSERT INTO territory_war_v3_rounds VALUES($1,$2,$3,$4,$5)',[94,finished.status,finished.starts_at,finished.ends_at,finished.settled_at]);
 f.fail('UPDATE organization_faction_state_v1');await assert.rejects(tickOrganizationFaction(f.env,f.deps),/INJECTED_ORGANIZATION_FAILURE/);f.fail('');
 assert.equal((await f.pg.query('SELECT state_json FROM organization_faction_state_v1 WHERE round_id=$1',[f.roundId])).rows[0].state_json,before);
 assert((await tickOrganizationFaction(f.env,f.deps)).changed);const view=await f.call('organization/faction/overview');assert.equal(view.status,200);assert(view.data.sessions.active);assert.equal(view.data.sessions.current.key,slot.key);
 row=(await f.pg.query('SELECT * FROM organization_faction_state_v1 WHERE round_id=$1',[f.roundId])).rows[0];state=JSON.parse(row.state_json);const openedAt=state.session.startsAt,endsAt=state.session.endsAt;
 assert.equal(endsAt-openedAt,7200000);assert.deepEqual(state.formations,JSON.parse(before).formations);assert.deepEqual(state.districts.map(d=>d.owner),JSON.parse(before).districts.map(d=>d.owner));
 await tickOrganizationFaction(f.env,f.deps);assert.equal((await f.pg.query('SELECT * FROM user_messages')).rows.length,0);
 state.session.participants=[2];state.session.participantClans={2:1};await f.pg.query('UPDATE organization_faction_state_v1 SET state_json=$1 WHERE round_id=$2',[JSON.stringify(state),f.roundId]);f.advance(endsAt-f.clock());
 f.fail('INSERT INTO user_message_rewards');await assert.rejects(tickOrganizationFaction(f.env,f.deps),/INJECTED_ORGANIZATION_FAILURE/);f.fail('');assert.equal((await f.pg.query('SELECT * FROM user_messages')).rows.length,0);
 await tickOrganizationFaction(f.env,f.deps);const rewards=(await f.pg.query('SELECT reward_type,reward_amount FROM user_message_rewards ORDER BY reward_type')).rows;
 assert.deepEqual(Object.fromEntries(rewards.map(r=>[r.reward_type,Number(r.reward_amount)])),{COIN:5e12,MASTER_STAR:5e7,PIG_COIN:200,STARLIGHT_ARMOR_CORE:300});
 await tickOrganizationFaction(f.env,f.deps);assert.deepEqual((await f.pg.query('SELECT reward_type,reward_amount FROM user_message_rewards ORDER BY reward_type')).rows,rewards);
 assert.equal((await f.pg.query('SELECT * FROM organization_faction_settlements_v1 WHERE session_key=$1',[slot.key])).rows.length,1);
});
