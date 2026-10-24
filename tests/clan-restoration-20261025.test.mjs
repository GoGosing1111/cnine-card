import test from 'node:test';
import assert from 'node:assert/strict';
import {clanRestorationFixture} from './helpers/clan-restoration-fixture.mjs';
import {CLAN_RESTORATION as release} from '../shared/clan-restoration-v1.mjs';
import {reconcileClanDraft} from '../functions/_clan.js';
import {reconcileFactionSessions} from '../functions/_clan_faction_sessions.js';
import {organizationFactionFixture} from './helpers/organization-faction-fixture.mjs';
import {createOrganizationFactionDay} from '../shared/organization-schedule-v1.mjs';
import {advanceOrganizationFaction} from '../functions/_organization_faction_model.js';
import {advanceOrganizationCompetition,organizationCompetitionView} from '../functions/_organization_competition.js';
import {organizationFactionLiveOperation,tickOrganizationFaction} from '../functions/_organization_faction.js';
const at=s=>Date.parse(s+'+09:00');

test('restored overview and CMS read completed history without reviving retirement, drafts, or pending rewards',async t=>{
 t.mock.method(Date,'now',()=>release.effectiveAt+3600000);
 const f=clanRestorationFixture();t.after(f.close);
 for(const [path,user] of [['clan/overview',2],['clan/overview',1],['admin/clan-war/settings',1]]){
  const r=await f.call(path,{user});assert.equal(r.status,200);assert.equal(r.data.restoration.scheduleLocked,true);
  assert.equal(r.data.champions.status,'COMPLETED');assert.equal(r.data.champions.rewardStatus,'PENDING');
  assert.equal(r.data.champions.matches.length,2);assert.equal(r.data.season.registrationOpen,false);
 }
 assert.equal(f.sql.prepare('SELECT count(*) n FROM clan_seasons').get().n,1);
 assert.equal(f.sql.prepare('SELECT count(*) n FROM clan_members').get().n,1);
 assert.equal(f.sql.prepare('SELECT reward_status FROM clan_championships').get().reward_status,'PENDING');
 const admin=await f.call('admin/clan-war/settings',{user:1});assert.equal(admin.data.settings.scheduleEnabled,false);assert.equal(admin.data.settings.mode,'OFF');
});

test('legacy clients and OWNER shortcuts cannot recruit, fight, award, reassign or reopen schedules',async t=>{
 t.mock.method(Date,'now',()=>release.effectiveAt+1000);const f=clanRestorationFixture();t.after(f.close);
 for(const path of ['clan/register','clan/draft/pick','clan/war/fight','clan/war/availability','clan/war/ready','clan/war/field','clan/faction/attack','clan/admin/mode','clan/admin/test-bootstrap','clan/admin/test-activate','clan/admin/test-settle','admin/clan-war/reset-draft','admin/clan-war/reset-official-season-one','admin/clan-war/settings','admin/clan-war/champions-rewards','admin/clan-war/member-assignment','admin/clan-war/inactivity-cleanup']){
  const r=await f.call(path,{user:1,method:'POST'});assert.equal(r.status,409,path);assert.equal(r.data.code,'CLAN_SCHEDULE_LOCKED');
 }
 assert.equal(f.reads.length,0);
 assert.equal((await f.call('admin/clan-war/settings')).status,403);
 assert.equal((await f.call('clan/overview',{user:0})).status,401);
 for(const path of ['clan/war/ready-alert','clan/faction/alerts'])assert.equal((await f.call(path)).data.enabled,false);
});

test('both legacy schedulers stop before reading ON settings or creating a season',async t=>{
 t.mock.method(Date,'now',()=>release.effectiveAt+1000);
 const env={DB:{prepare(){throw Error('SCHEDULER_DB_ACCESS')}}};
 assert.equal((await reconcileClanDraft(env)).phase,'SCHEDULE_LOCKED');
 assert.equal((await reconcileFactionSessions(env)).mode,'SCHEDULE_LOCKED');
 assert.equal(await organizationFactionLiveOperation(env),null);
});

test('restored random rule produces exactly two nonoverlapping three-hour slots every KST day',()=>{
 for(const day of ['2026-10-25','2026-10-26','2026-10-31','2026-11-01','2026-12-31','2027-01-01'])for(const random of [()=>0,n=>n-1,n=>Math.floor(n/2)]){
  const slots=createOrganizationFactionDay(day,random);assert.equal(slots.length,2);
  assert.ok(slots[0].endsAt<=slots[1].startsAt);
  for(const s of slots){assert.equal(s.endsAt-s.startsAt,10800000);assert.ok(s.startsAt>=at(day+'T00:00:00'));assert.ok(s.endsAt<=at(day+'T00:00:00')+86400000);assert.equal(s.scheduleVersion,release.version);}
 }
});

test('current, queued and future fixed/random sessions freeze without map, roster or reward mutation',async t=>{
 const f=await organizationFactionFixture(t,{live:true,funds:100});
 await f.mutateState(s=>{s.districts[0].owner=1;s.sessionQueue=[{key:'old-queued'}];s.competition={season:{points:{1:7}},weeklyHistory:[],seasonHistory:[]};});
 const before=(await f.pg.query('SELECT state_json FROM organization_faction_state_v1')).rows[0].state_json;
 const days=(await f.pg.query('SELECT * FROM organization_faction_days_v1')).rows;
 f.advance(at('2026-10-25T12:00:00')-f.clock());
 const overview=await f.overview();assert.equal(overview.status,200);assert.equal(overview.data.sessions.scheduleLocked,true);assert.equal(overview.data.sessions.active,false);
 assert.deepEqual(overview.data.sessions.schedule,[]);assert.equal(overview.data.sessions.rules.dailyCount,2);assert.equal(overview.data.sessions.rules.durationMs,10800000);
 assert.equal(overview.data.competition.pointsIncluded,false);assert.equal(overview.data.competition.nextWeeklyAt,null);
 const ranking=await f.call('organization/faction/rankings?roundId='+f.roundId);assert.equal(ranking.status,200);assert.equal(ranking.data.competition.pointsIncluded,false);
 for(const path of ['organization/faction/launch','organization/faction/enter','organization/faction/strike'])assert.equal((await f.post(path,{squad:'attack1',districtId:'11680'})).status,409,path);
 for(const date of ['2026-10-26T00:00:00','2026-11-16T00:00:00','2027-01-01T00:00:00']){
  f.advance(at(date)-f.clock());await tickOrganizationFaction(f.env,f.deps);await f.overview();
 }
 assert.equal((await f.pg.query('SELECT state_json FROM organization_faction_state_v1')).rows[0].state_json,before);
 assert.deepEqual((await f.pg.query('SELECT * FROM organization_faction_days_v1')).rows,days);
 assert.equal((await f.pg.query('SELECT count(*)::int n FROM user_message_rewards')).rows[0].n,0);
 assert.equal((await f.pg.query('SELECT count(*)::int n FROM organization_faction_settlements_v1')).rows[0].n,0);
 const s=JSON.parse(before),saved=JSON.stringify(s);assert.deepEqual(advanceOrganizationCompetition(s,{now:f.clock(),enabled:true,policy:{}}),[]);assert.equal(JSON.stringify(s),saved);
 assert.equal(organizationCompetitionView(s,{},true,f.clock()).pointsPerTerritory,0);
 assert.equal(advanceOrganizationFaction(s,{now:f.clock(),policy:{},schedule:[]}).view.scheduleLocked,true);assert.equal(JSON.stringify(s),saved);
});

test('stale CMS ON and manual settlement cannot bypass the faction schedule/points lock',async t=>{
 const f=await organizationFactionFixture(t,{live:true});f.advance(at('2026-10-26T00:00:00')-f.clock());
 const p=(await f.admin()).data.policy;
 assert.equal((await f.call('admin/organization/faction/policy',{user:1,body:{requestId:crypto.randomUUID(),policy:{...p,mode:'ON'}}})).status,200);
 const settled=await f.post('admin/organization/faction/settle',{},1);assert.equal(settled.status,200);assert.equal(settled.data.competition.pointsIncluded,false);
 assert.equal((await f.overview()).data.sessions.scheduleLocked,true);assert.equal((await f.pg.query('SELECT count(*)::int n FROM organization_faction_settlements_v1')).rows[0].n,0);
});
