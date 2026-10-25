import test from 'node:test';
import assert from 'node:assert/strict';
import {clanResumeFixture} from './helpers/clan-resume-fixture.mjs';
import {inspectResume,applyResume,planRegularWars} from '../scripts/ops/clan-resume-20261025.mjs';
import {createResumedFactionDay,CLAN_RESUMPTION_VERSION} from '../shared/clan-resumption-v1.mjs';
import {tickOrganizationFaction} from '../functions/_organization_faction.js';
import {reconcileClanDraft} from '../functions/_clan.js';
import {startChampions} from '../functions/_clan_champions.js';
const at=s=>Date.parse(s+'+09:00');
const now=at('2026-10-25T16:00:00');
const release={version:CLAN_RESUMPTION_VERSION,enabled:true,effectiveAt:now,seasonId:7,roundId:'qa'};
test('Tue Wed Thu Sat 21–22 generates seven full round robins; daily random is exactly one future three-hour slot',()=>{
 const wars=planRegularWars({},now);assert.equal(wars.length,28);assert.equal(new Set(wars.map(w=>[w.clanAId,w.clanBId].sort().join(':'))).size,28);
 for(const w of wars){const d=new Date(Date.parse(w.startsAt)+9*3600000);assert([2,3,4,6].includes(d.getUTCDay()));assert.equal(d.getUTCHours(),21);assert.equal(Date.parse(w.endsAt)-Date.parse(w.startsAt),3600000);}
 assert.equal(wars[0].startsAt,'2026-10-27T12:00:00.000Z');
 for(const day of ['2026-10-25','2026-10-26','2026-12-31','2027-01-01'])for(const random of [()=>0,n=>n-1,n=>Math.floor(n/2)]){
  const slots=createResumedFactionDay(day,release,random);assert.equal(slots.length,1);assert(slots[0].startsAt>=now+300000);assert.equal(slots[0].endsAt-slots[0].startsAt,10800000);assert(slots[0].endsAt<=at(day+'T00:00:00')+86400000);
 }
 assert.deepEqual(createResumedFactionDay('2026-10-24',release),[]);
});
test('audited resume + exact DC withdrawal is atomic, leaves all history and account data, and replays read-only',async t=>{
 const f=await clanResumeFixture(t),before=await inspectResume(f.pg),options={now:f.clock(),expectedReviewHash:before.reviewHash,random:()=>0};
 const dry=await applyResume(f.pg,options);assert(dry.verified&&dry.protectedUnchanged);assert.deepEqual(await inspectResume(f.pg),before);
 for(const match of ['DELETE FROM organization_members_v1','INSERT INTO clan_wars','UPDATE organization_faction_state_v1','INSERT INTO admin_logs','INSERT INTO app_meta']){
  await assert.rejects(applyResume({query:(sql,args)=>{if(sql.includes(match))throw Error('INJECTED');return f.pg.query(sql,args);}},{...options,dryRun:false}),/INJECTED/);assert.deepEqual(await inspectResume(f.pg),before);
 }
 const result=await applyResume(f.pg,{...options,dryRun:false});assert.deepEqual(result.clans.map(c=>c.count),[17,16,16,16,16,16,16,15]);
 const replay=await applyResume({query:(sql,args)=>{assert.match(sql,/^SELECT\b/);return f.pg.query(sql,args);}});assert(replay.replayed);
 assert.equal((await f.pg.query('SELECT count(*)::int n FROM clan_seasons')).rows[0].n,2);
 assert.equal((await f.pg.query('SELECT count(*)::int n FROM user_messages')).rows[0].n,0);
});
test('4+ holdings adds exactly one regular-season point; 3 adds zero; failure/retry/weekly cutoff never doubles points or rewards',async t=>{
 const f=await clanResumeFixture(t),review=await inspectResume(f.pg);const applied=await applyResume(f.pg,{now:f.clock(),expectedReviewHash:review.reviewHash,dryRun:false,random:()=>0});
 const slot=applied.receipt.schedule[0];f.advance(slot.startsAt-f.clock());
 const view=await f.call('organization/faction/overview');assert.equal(view.status,200,JSON.stringify(view));assert(view.data.sessions.active);assert.equal(view.data.sessions.rules.dailyCount,1);
 const [row]=(await f.pg.query('SELECT state_json FROM organization_faction_state_v1')).rows,s=JSON.parse(row.state_json);s.districts.forEach((d,i)=>d.owner=i<4?1:i<7?2:i<15?3:0);s.session.participants=[2];s.session.participantClans={2:1};await f.pg.query('UPDATE organization_faction_state_v1 SET state_json=$1',[JSON.stringify(s)]);
 f.advance(slot.endsAt-f.clock());f.fail('INSERT INTO user_message_rewards');assert.equal((await f.call('organization/faction/overview')).status,503);
 assert((await f.pg.query('SELECT score FROM clan_season_teams')).rows.every(t=>Number(t.score)===0));
 f.fail('');const settled=await f.call('organization/faction/overview');assert.equal(settled.status,200,JSON.stringify(settled));
 const scores=()=>f.pg.query('SELECT clan_id,score FROM clan_season_teams ORDER BY clan_id');assert.deepEqual((await scores()).rows.map(t=>Number(t.score)),[1,0,1,0,0,0,0,0]);
 assert.equal(settled.data.competition.scoringMode,'REGULAR_SEASON');assert.equal(settled.data.sessions.rules.requiredTerritories,4);
 const messages=(await f.pg.query('SELECT * FROM user_message_rewards')).rows;assert.equal(messages.length,4);
 await tickOrganizationFaction(f.env,f.deps);await f.call('organization/faction/overview');assert.deepEqual((await f.pg.query('SELECT * FROM user_message_rewards')).rows,messages);
 f.advance(at('2026-10-26T00:00:00')-f.clock());await tickOrganizationFaction(f.env,f.deps);assert.deepEqual((await scores()).rows.map(t=>Number(t.score)),[1,0,1,0,0,0,0,0]);
 const ranked=await f.call('organization/faction/rankings');assert.equal(ranked.data.competition.standings[0].points,1);
});
test('real regular overview uses current 128-person roster and next round, while draft, old faction and Champions shortcuts remain blocked',async t=>{
 const f=await clanResumeFixture(t);t.mock.method(Date,'now',f.clock);
 const review=await inspectResume(f.pg),r=await applyResume(f.pg,{now:f.clock(),expectedReviewHash:review.reviewHash,dryRun:false,random:()=>0});
 const view=await f.call('clan/overview',{regular:true});assert.equal(view.status,200,JSON.stringify(view));
 assert.equal(view.data.teams.reduce((n,t)=>n+t.memberCount,0),128);assert.equal(view.data.rules.maxMembers,25);assert.equal(view.data.war.status,'SCHEDULED');assert.equal(view.data.war.endsAt,'2026-10-27T13:00:00.000Z');
 assert.deepEqual(view.data.rules.openDays,[2,3,4,6]);assert.equal(view.data.restoration.scheduleLocked,false);
 const departed=await f.call('clan/overview',{regular:true,user:73});assert.equal(departed.data.membership,null);
 for(const path of ['clan/register','clan/draft/pick','clan/faction/attack','admin/clan-war/reset-draft','admin/clan-war/champions-rewards'])assert.equal((await f.call(path,{regular:true,user:1,body:{}})).status,409,path);
 const schedule=await reconcileClanDraft(f.env);assert.equal(schedule.nextCheckAt,'2026-10-27T12:00:00.000Z');
 const early=await f.call('clan/war/field',{regular:true,body:{warId:view.data.war.id,requestId:crypto.randomUUID(),kind:'assault'}});assert.equal(early.status,409,JSON.stringify(early));
 f.advance(at('2026-10-27T21:00:00')-f.clock());await reconcileClanDraft(f.env);
 const active=await f.call('clan/war/field',{regular:true,body:{warId:view.data.war.id,requestId:crypto.randomUUID(),kind:'assault'}});assert.equal(active.status,200,JSON.stringify(active));assert.equal(active.data.points,3);
 await f.pg.query("UPDATE clan_seasons SET phase='SETTLEMENT' WHERE id=$1",[r.receipt.seasonId]);
 await startChampions(f.env,{id:r.receipt.seasonId},{championsEnabled:true},[{clan_id:1},{clan_id:2},{clan_id:3}],f.clock());
 assert.equal((await f.pg.query('SELECT count(*)::int n FROM clan_championships')).rows[0].n,0);
 assert.equal((await f.pg.query('SELECT count(*)::int n FROM clan_seasons')).rows[0].n,2);
});
test('existing elder-approved admission mirrors the same clan into the resumed regular season',async t=>{
 const f=await clanResumeFixture(t);t.mock.method(Date,'now',f.clock);const review=await inspectResume(f.pg),r=await applyResume(f.pg,{now:f.clock(),expectedReviewHash:review.reviewHash,dryRun:false,random:()=>0});
 const apply=await f.organizationCall('organization/join/apply',{user:132,method:'POST',body:{requestId:crypto.randomUUID(),roundId:f.roundId,revision:0,organizationId:1,message:'기존 심사 가입'}});assert.equal(apply.status,200,JSON.stringify(apply));
 const approve=await f.organizationCall('organization/join/review',{user:2,method:'POST',body:{requestId:crypto.randomUUID(),roundId:f.roundId,userId:132,revision:1,decision:'APPROVED'}});assert.equal(approve.status,200,JSON.stringify({approve,errors:f.errors.map(e=>({message:e.message,query:e.query}))}));
 const m=(await f.pg.query('SELECT clan_id FROM clan_members WHERE season_id=$1 AND user_id=132',[r.receipt.seasonId])).rows;assert.equal(Number(m[0].clan_id),1);
});
