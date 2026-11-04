import test from 'node:test';
import assert from 'node:assert/strict';
import {clanResumeFixture} from './helpers/clan-resume-fixture.mjs';
import {inspectResume,applyResume} from '../scripts/ops/clan-resume-20261025.mjs';
import {OP,inspectEvening,planEvening,applyEvening} from '../scripts/ops/faction-once-evening-20261105.mjs';
import {CLAN_RESUMPTION_VERSION,EVENING_FACTION_RULES,createResumedFactionDay,resumedFactionRules} from '../shared/clan-resumption-v1.mjs';
import {ORGANIZATION_SESSION_RULES} from '../shared/organization-faction-v1.mjs';
import {newOrganizationFactionState,advanceOrganizationFaction} from '../functions/_organization_faction_model.js';
import {tickOrganizationFaction,organizationFactionLiveOperation} from '../functions/_organization_faction.js';
import {factionSessionStrip,factionRewardView} from '../js/clan-faction-sessions-v1.mjs';
const at=s=>Date.parse(s+'+09:00'),now=at('2026-11-05T00:30:00');
const release={version:CLAN_RESUMPTION_VERSION,enabled:true,effectiveAt:at('2026-10-25T16:00:00'),seasonId:7,roundId:'qa',factionSchedule:{version:EVENING_FACTION_RULES.version,effectiveAt:now,operationKey:OP}};
test('one two-hour slot fits 16:00–23:59 at every random boundary, preserving the historic schedule',()=>{
 for(const day of ['2026-11-05','2026-11-06','2026-12-31','2027-01-01'])for(const random of [()=>0,n=>n-1,n=>Math.floor(n/2)]){
  const slots=createResumedFactionDay(day,release,random);assert.equal(slots.length,1);const s=slots[0];assert.equal(s.endsAt-s.startsAt,7200000);assert(s.startsAt>=at(day+'T16:00:00'));assert(s.endsAt<=at(day+'T23:59:00'));assert.equal(s.hardEndsAt,at(day+'T23:59:00'));
 }
 const first=createResumedFactionDay('2026-11-05',release,()=>0)[0],last=createResumedFactionDay('2026-11-05',release,n=>n-1)[0];
 assert.equal(first.startsAt,at('2026-11-05T16:00:00'));assert.equal(last.startsAt,at('2026-11-05T21:59:00'));assert.equal(last.endsAt,at('2026-11-05T23:59:00'));
 assert.throws(()=>createResumedFactionDay('2026-11-05',release,n=>n),/INVALID_FACTION_RANDOM/);
 const old={...release};delete old.factionSchedule;assert.equal(createResumedFactionDay('2026-11-05',old,()=>0)[0].endsAt-createResumedFactionDay('2026-11-05',old,()=>0)[0].startsAt,10800000);
 const rules=resumedFactionRules(ORGANIZATION_SESSION_RULES,release,now);assert.equal(rules.coinPerRecipient,5e12);assert.equal(rules.masterStarsPerRecipient,5e7);assert.equal(rules.mysticEnergyPerRecipient,300);assert.equal(rules.requiredTerritories,4);
});
export async function eveningFixture(t){
 const f=await clanResumeFixture(t),review=await inspectResume(f.pg);await applyResume(f.pg,{now:f.clock(),expectedReviewHash:review.reviewHash,dryRun:false,random:()=>0});
 f.advance(now-f.clock());
 const oldRelease=JSON.parse((await f.pg.query("SELECT value FROM app_meta WHERE key='clan_resumption_v1'")).rows[0].value);
 const days=['2026-11-05','2026-11-06'];for(const day of days)await f.pg.query('INSERT INTO organization_faction_days_v1 VALUES($1,$2,$3) ON CONFLICT(round_id,day_key) DO UPDATE SET schedule_json=excluded.schedule_json',[f.roundId,day,JSON.stringify(createResumedFactionDay(day,oldRelease,n=>Math.floor(n/2)))]);
 const [row]=(await f.pg.query('SELECT state_json FROM organization_faction_state_v1')).rows,state=JSON.parse(row.state_json);state.sessionDay='2026-11-05';state.sessionPlan=createResumedFactionDay('2026-11-05',oldRelease,n=>Math.floor(n/2)).map(s=>({...s,status:'SCHEDULED'}));await f.pg.query('UPDATE organization_faction_state_v1 SET state_json=$1',[JSON.stringify(state)]);
 const db={query:(sql,args)=>sql==='SELECT EXTRACT(EPOCH FROM CURRENT_TIMESTAMP)*1000 AS now'?Promise.resolve({rows:[{now:f.clock()}]}):f.pg.query(sql,args)};
 return {...f,db};
}
test('pending schedule migration is atomic and repeatable; actual settlement grants 5T/50M once and retains 4-holding points',async t=>{
 const f=await eveningFixture(t),before=await inspectEvening(f.db),plan=planEvening(before,{now:f.clock(),random:()=>0});
 const dry=await applyEvening(f.db,plan);assert(!dry.committed);assert.deepEqual(await inspectEvening(f.db),before);
 for(const pattern of ['UPDATE organization_faction_state_v1','INSERT INTO admin_logs','INSERT INTO app_meta']){
  await assert.rejects(applyEvening({query:(sql,args)=>{if(sql.includes(pattern))throw Error('INJECTED');return f.db.query(sql,args);}},plan,{commit:true}),/INJECTED/);assert.deepEqual(await inspectEvening(f.db),before);
 }
 const applied=await applyEvening(f.db,plan,{commit:true});assert(applied.verification.verified);assert.equal(applied.verification.oldHistoryPreserved,true);
 assert((await applyEvening({query:(sql,args)=>{assert.match(sql,/^SELECT\b/);return f.db.query(sql,args);}},null)).replayed);
 const slot=JSON.parse(plan.days[0].schedule_json)[0];f.advance(slot.startsAt-f.clock());
 const view=await f.call('organization/faction/overview');assert.equal(view.status,200,JSON.stringify(view));assert(view.data.sessions.active);assert.equal(view.data.sessions.rules.durationMs,7200000);assert.equal(view.data.sessions.rules.masterStarsPerRecipient,50000000);
 const [row]=(await f.pg.query('SELECT state_json FROM organization_faction_state_v1')).rows,state=JSON.parse(row.state_json);state.districts.forEach((d,i)=>d.owner=i<4?1:i<7?2:0);state.session.participants=[2];state.session.participantClans={2:1};await f.pg.query('UPDATE organization_faction_state_v1 SET state_json=$1',[JSON.stringify(state)]);
 f.advance(slot.endsAt-f.clock());f.fail('INSERT INTO user_message_rewards');assert.equal((await f.call('organization/faction/overview')).status,503);assert.equal((await f.pg.query('SELECT * FROM user_message_rewards')).rows.length,0);assert((await f.pg.query('SELECT score FROM clan_season_teams')).rows.every(r=>Number(r.score)===0));
 f.fail('');const settled=await f.call('organization/faction/overview');assert.equal(settled.status,200,JSON.stringify(settled));
 const amounts=(await f.pg.query('SELECT reward_type,reward_amount FROM user_message_rewards ORDER BY reward_type')).rows;assert.deepEqual(Object.fromEntries(amounts.map(r=>[r.reward_type,Number(r.reward_amount)])),{COIN:5e12,MASTER_STAR:5e7,PIG_COIN:200,STARLIGHT_ARMOR_CORE:300});
 assert.equal(Number((await f.pg.query('SELECT score FROM clan_season_teams WHERE clan_id=1')).rows[0].score),1);assert.equal(Number((await f.pg.query('SELECT score FROM clan_season_teams WHERE clan_id=2')).rows[0].score),0);
 await tickOrganizationFaction(f.env,f.deps);await f.call('organization/faction/overview');assert.deepEqual((await f.pg.query('SELECT reward_type,reward_amount FROM user_message_rewards ORDER BY reward_type')).rows,amounts);
});
test('territory pauses cannot extend the new session past 23:59 or reopen it at midnight',()=>{
 const state=newOrganizationFactionState(now);state.resumption=release;const day='2026-11-05',schedule=createResumedFactionDay(day,release,n=>n-1),slot=schedule[0],policy={fundsPerRegion:1,pigCoinReward:{enabled:true,requiredTerritories:4,amount:200}},roster=[{userId:2,clanId:1,status:'ACTIVE'}];
 const advance=(clock,wars=[],slots=schedule)=>advanceOrganizationFaction(state,{schedule:slots,wars,roster,now:clock,assignedAt:release.effectiveAt,policy});
 assert(advance(slot.startsAt).view.active);state.districts.slice(0,4).forEach(d=>d.owner=1);state.session.participants=[2];state.session.participantClans={2:1};
 const wars=[{id:1,status:'ACTIVE',starts_at:'2026-11-05T23:00:00+09:00',ends_at:'2026-11-06T01:00:00+09:00'}];
 assert.equal(advance(at('2026-11-05T23:10:00'),wars).view.current.status,'PAUSED');
 const ended=advance(slot.hardEndsAt,wars);assert.equal(ended.settlements.length,1);assert.equal(ended.settlements[0].endsAt,slot.hardEndsAt);assert.equal(ended.settlements[0].recipients[0].amount,5e12);assert(!ended.view.active);
 assert.equal(advance(slot.hardEndsAt+1,wars).settlements.length,0);
 const next=advance(at('2026-11-06T00:01:00'),wars,createResumedFactionDay('2026-11-06',release,()=>0));assert.equal(next.settlements.length,0);assert.equal(next.view.schedule.length,1);assert.equal(state.sessionQueue.length,0);assert(!next.view.active);
});
test('schedule and reward text show two hours, 5조 and exactly 50,000,000 stars',()=>{
 const rules=resumedFactionRules(ORGANIZATION_SESSION_RULES,release,now),data={holdings:4,mine:{clanId:1},tax:{balance:0},sessions:{enabled:true,active:false,schedule:[],history:[],rules,recipientPolicy:'PARTICIPANTS',mapPolicy:'KEEP',scheduleLabel:'매일 랜덤 1회 · 16:00~23:59 · 회차당 2시간'}};
 const text=factionSessionStrip(data)+factionRewardView(data);assert.match(text,/16:00~23:59/);assert.match(text,/2시간/);assert.match(text,/5조/);assert.match(text,/50,000,000/);assert.doesNotMatch(text,/3시간|50,300,000|6,000억/);
});
test('paused evening ticker remains visible until the 23:59 hard deadline',async()=>{
 const session={key:'2026-11-05:resumed-1',status:'PAUSED',startsAt:at('2026-11-05T16:00:00'),endsAt:at('2026-11-05T18:00:00'),hardEndsAt:at('2026-11-05T23:59:00')};
 const env={DB:{prepare:()=>({first:async()=>({id:'qa',policy_json:'{"mode":"ON"}',state_json:JSON.stringify({resumption:release,session})})})}};
 const view=await organizationFactionLiveOperation(env,at('2026-11-05T20:00:00'));assert.equal(view.phase,'PAUSED');assert.equal(view.deadlineAt,new Date(session.hardEndsAt).toISOString());
 assert.equal(await organizationFactionLiveOperation(env,session.hardEndsAt),null);
});
