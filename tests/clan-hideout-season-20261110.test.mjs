import test from 'node:test';
import assert from 'node:assert/strict';
import {clanResumeFixture} from './helpers/clan-resume-fixture.mjs';
import {citadelFixture} from './helpers/legion-citadel-fixture.mjs';
import {citadelEnemies} from '../functions/_legion_citadel_battle.js';
import {calamityPartyDrops} from '../functions/_legion_citadel_calamity.js';
import {DOCKYARD} from '../functions/_legion_citadel_tiers.js';
import {factionDayPermitted,nextFactionDay,CLAN_WED_SAT_SUN_SCHEDULE} from '../shared/clan-resumption-v1.mjs';
import {applyResume,inspectResume} from '../scripts/ops/clan-resume-20261025.mjs';
import {__clanTest} from '../functions/_clan.js';
import {startChampions} from '../functions/_clan_champions.js';
import {clanHideout} from '../functions/_clan_hideout_access.js';
import {createCoopRoom} from '../functions/_cooperative_room.js';
import {CLAN_GARDEN,coopDirectory} from '../shared/cooperative-room-list-v1.mjs';
import {coopRosterSummary} from '../shared/cooperative-roster-v3.mjs';
import {reconcileOrganizationRecruitment,organizationLiveOperation} from '../functions/_organization.js';
import {clanPlayoffTimes} from '../shared/clan-resumption-v1.mjs';
import {advanceChampions} from '../functions/_clan_champions.js';
import {reconcileElderSeason} from '../functions/_organization_elder_season.js';
import {runOrganizationSchedule} from '../workers/clan-draft/src/organization-schedule.js';

test('calendar cron runs the clan lifecycle without the draft alarm and reuses only a current matching heartbeat',async t=>{
 const f=await clanResumeFixture(t),now=f.clock(),id='season5-calendar',deadline=new Date(now+100000).toISOString();
 let phase='OPEN',advanced=0;
 const expected={phase:'ELDER_RECRUITMENT',seasonId:7,nextCheckAt:deadline};
 const tick=()=>runOrganizationSchedule({},{
  now:()=>now,openDatabase:async()=>({db:f.env.DB,close:async()=>{}}),
  reconcile:async()=>({recruitment:{calendarWindowId:id,seasonId:7,status:phase,nextCheckAt:deadline}}),
  competition:async()=>{advanced++;return expected;}
 });
 const store=async data=>f.pg.query("INSERT INTO app_meta(key,value) VALUES('clan_draft_scheduler_v1',$1) ON CONFLICT(key) DO UPDATE SET value=excluded.value",[JSON.stringify(data)]);
 const stamp={version:'20261012-clan-retirement',checkedAt:new Date(now).toISOString(),...expected};
 await store({...stamp,version:'20260915-alarm-1h-30s',phase:'NONE'});
 assert.equal((await tick()).seasonClock.source,'ORGANIZATION_CRON');assert.equal(advanced,1);
 await store(stamp);assert.equal((await tick()).seasonClock.source,'DURABLE_ALARM');assert.equal(advanced,1);
 await store({...stamp,nextCheckAt:null});assert.equal((await tick()).seasonClock.source,'ORGANIZATION_CRON');
 phase='COMPETITION';expected.phase='ACTIVE';await store(stamp);assert.equal((await tick()).seasonClock.phase,'ACTIVE');
 expected.phase='CHAMPIONS';await store({...stamp,phase:'ACTIVE',checkedAt:new Date(now-61000).toISOString()});
 assert.equal((await tick()).seasonClock.phase,'CHAMPIONS');
 phase='FINISHED';expected.phase='COMPLETE';assert.equal((await tick()).seasonClock.phase,'COMPLETE');
 const row=(await f.pg.query("SELECT value::jsonb state FROM app_meta WHERE key='organization_scheduler_v1'")).rows[0];
 assert.equal(row.state.seasonClock.windowId,id);assert.equal(row.state.seasonClock.source,'ORGANIZATION_CRON');
});

test('empty, partial and oversubscribed elder pools draw active applicants once without club preferences',async t=>{
 const f=await clanResumeFixture(t),q=async(sql,args=[])=>(await f.pg.query(sql,args)).rows;
 const now=f.clock(),key='organization:elder-season:'+f.roundId;
 const window={id:'pool',closesAt:now,calendar:{elderClosesAt:now,startsAt:now+86400000},selections:{},revision:1};
 await q("UPDATE users SET status='SUSPENDED' WHERE id=2");
 for(const size of [0,12,35]){
  const ids=Array.from({length:size},(_,i)=>i+2);
  const applications=Object.fromEntries(ids.map(id=>[id,{nickname:'신청자 '+id,organizationId:8,power:1000+id}]));
  await q('INSERT INTO app_meta(key,value) VALUES($1,$2) ON CONFLICT(key) DO UPDATE SET value=excluded.value',[key,JSON.stringify({...window,applications})]);
  assert.equal((await reconcileElderSeason(q,{id:f.roundId},now)).changed,true);
  const read=async()=>(await q('SELECT value::jsonb w FROM app_meta WHERE key=$1',[key]))[0].w;
  const drawn=await read(),groups=Object.values(drawn.selections),winning=groups.flat().map(x=>x.id);
  const eligible=ids.filter(id=>id!==2);
  assert.equal(drawn.drawEligibleCount,eligible.length);
  assert.equal(winning.length,Math.min(24,eligible.length));assert.equal(new Set(winning).size,winning.length);
  assert.ok(winning.every(id=>eligible.includes(id)));
  assert.ok(Math.max(...groups.map(g=>g.length))-Math.min(...groups.map(g=>g.length))<=1);
  assert.ok(groups.every(g=>g.length<=3));
  assert.equal((await reconcileElderSeason(q,{id:f.roundId},now+1)).changed,false);
  assert.deepEqual((await read()).selections,drawn.selections);
 }
});

test('fixed season calendar admits volunteers for 24h, starts with vacant elders and finishes both playoffs inside 50 days',async t=>{
 const f=await clanResumeFixture(t),review=await inspectResume(f.pg),day=86400000;
 await applyResume(f.pg,{now:f.clock(),expectedReviewHash:review.reviewHash,random:()=>0,dryRun:false});
 const q=async(sql,args=[])=> (await f.pg.query(sql,args)).rows;
 const [source]=await q("SELECT value::jsonb AS value FROM app_meta WHERE key='clan_resumption_v1'");
 const previous=source.value,openedAt=Date.parse('2026-11-13T00:56:36.823+09:00');
 f.advance(openedAt-f.clock());
 await q("UPDATE clan_seasons SET phase='COMPLETE' WHERE id=$1",[previous.seasonId]);
 const send=(path,body,user=1)=>f.post(path,{roundId:f.roundId,...body},{user});
 const opened=await send('admin/organization/elder/open',{windowId:null});assert.equal(opened.status,200);
 const windowId=opened.data.windowId,c={seasonNo:5,sourceRoundId:f.roundId,previousSeasonId:previous.seasonId,openedAt,elderClosesAt:openedAt+2*day,startsAt:openedAt+3*day,endsAt:openedAt+53*day,windowId};
 const windowKey='organization:elder-season:'+f.roundId;
 await q("UPDATE app_meta SET value=jsonb_set(value::jsonb,'{calendar}',$2::jsonb)::text WHERE key=$1",[windowKey,JSON.stringify(c)]);
 await q("UPDATE app_meta SET value=jsonb_set(value::jsonb,'{nextSeasonCalendar}',$1::jsonb)::text WHERE key='clan_resumption_v1'",[JSON.stringify(c)]);
 await q("UPDATE organization_faction_state_v1 SET state_json=jsonb_set(state_json::jsonb,'{resumption,nextSeasonCalendar}',$2::jsonb)::text WHERE round_id=$1",[f.roundId,JSON.stringify(c)]);
 const tick=()=>reconcileOrganizationRecruitment(f.env,f.deps,{now:f.clock()});
 const get=async(user=1)=>(await f.organizationCall('admin/organization',{user})).data.elderSeason;
 const select=async(ids)=>(await send('admin/organization/elder/select',{windowId,organizationId:1,userIds:ids,revision:(await get()).revision}));
 const join=(uid,club,requestId=undefined)=>send('organization/elder/join',{windowId,organizationId:club,...(requestId?{requestId}:{})},uid);
 assert.equal((await join(30,1)).data.code,'ORG_MEMBER_PHASE');
 assert.equal((await f.call('organization/faction/overview')).data.sessions.active,false);
 assert.equal((await f.call('organization/faction/overview')).data.sessions.scheduleLocked,true);
 assert.equal((await send('organization/elder/apply',{windowId},2)).status,200);
 assert.equal((await send('organization/elder/apply',{windowId,organizationId:8},3)).status,200);
 await q("UPDATE app_meta SET value=jsonb_set(value::jsonb,'{applications,4}',$2::jsonb)::text WHERE key=$1",[windowKey,JSON.stringify({organizationId:1,nickname:'기존 신청자',appliedAt:openedAt})]);
 assert.equal((await send('organization/elder/apply',{windowId},5)).status,200);
 assert.equal((await send('organization/elder/cancel',{windowId},5)).status,200);
 const player=async user=>(await f.organizationCall('organization/overview',{user})).data.elderSeason;
 assert.equal((await player(3)).applied,true);assert.equal((await player(3)).organizationId,null);
 assert.ok((await get()).applicants.every(a=>!('organizationId' in a)));
 assert.equal((await select([2])).data.code,'ORG_ELDER_DRAW');
 f.advance(2*day-1);assert.equal((await tick()).status,'OPEN');f.advance(1);
 // An unsuccessful first join must still commit the draw so subsequent requests cannot reroll.
 assert.equal((await join(2,2)).data.code,'ORG_MEMBER');
 const drawn=await get(),allocations=Object.values(drawn.selections);
 assert.deepEqual(allocations.flat().sort(),[2,3,4]);assert.equal(allocations.filter(r=>r.length===1).length,3);
 const club=(await player(4)).memberClubId,other=club===1?2:1;
 assert.equal((await tick()).status,'MEMBERS');
 assert.deepEqual((await get()).selections,drawn.selections);
 assert.equal((await organizationLiveOperation(f.env,f.clock())).title,'클랜원 자율 가입');
 assert.equal((await send('organization/elder/apply',{windowId,organizationId:1},5)).data.code,'ORG_ELDER_CLOSED');
 assert.equal((await send('admin/organization/elder/open',{windowId})).data.code,'ORG_ELDER_PHASE');
 assert.equal((await send('admin/organization/elder/start',{windowId,revision:(await get()).revision})).data.code,'ORG_ELDER_PHASE');
 assert.equal((await send('organization/join/apply',{revision:0,organizationId:1,message:''},131)).data.code,'ORG_JOIN_CLOSED');
 assert.equal((await select([2])).data.code,'ORG_ELDER_DRAW');
 assert.equal((await join(2,2)).data.code,'ORG_MEMBER');
 const request='fixed-calendar-last-seat-replay';
 assert.equal((await join(31,club,request)).status,200);
 assert.equal((await join(31,club,request)).status,200);
 for(let uid=32;uid<=54;uid++)assert.equal((await join(uid,club)).status,200);
 assert.equal((await join(55,club)).data.code,'ORG_FULL');assert.equal((await join(55,other)).status,200);
 assert.equal((await get()).memberCounts[club],25);
 await q("UPDATE users SET status='SUSPENDED' WHERE id IN (2,3)");
 f.advance(day-1);assert.equal((await tick()).status,'MEMBERS');f.advance(1);
 assert.equal((await join(55,2)).data.code,'ORG_MEMBER_PHASE');
 const transition=await tick();assert.equal(transition.status,'STARTED');
 assert.equal((await tick()).changed,false);
 const {seasonId,roundId}=transition;
 const [season]=await q('SELECT * FROM clan_seasons WHERE id=$1',[seasonId]);
 assert.equal(Date.parse(season.starts_at),c.startsAt);assert.equal(Date.parse(season.ends_at),c.endsAt);
 assert.equal((await q('SELECT * FROM clan_season_teams WHERE season_id=$1',[seasonId])).length,8);
 assert.equal((await q('SELECT * FROM clan_season_teams WHERE season_id=$1 AND master_user_id IS NULL',[seasonId])).length,7);
 assert.deepEqual((await q('SELECT user_id FROM clan_executives WHERE season_id=$1',[seasonId])).map(x=>Number(x.user_id)),[4]);
 assert.equal((await q("SELECT * FROM clan_members WHERE season_id=$1 AND member_role='MEMBER'",[seasonId])).length,25);
 assert.equal((await q('SELECT * FROM organization_members_v1 WHERE round_id=$1',[roundId])).length,26);
 assert.equal((await q('SELECT * FROM organization_members_v1 WHERE round_id=$1',[f.roundId])).length,128);
 assert.equal((await f.post('organization/join/apply',{roundId,revision:0,organizationId:8,message:''},{user:55})).data.code,'ORG_JOIN_CLOSED');
 const times=clanPlayoffTimes(c);
 const wars=await q('SELECT * FROM clan_wars WHERE season_id=$1',[seasonId]);
 assert.ok(wars.length>=80&&wars.every(w=>Date.parse(w.starts_at)>=c.startsAt&&Date.parse(w.ends_at)<=times.regularEndsAt));
 await q("UPDATE clan_seasons SET phase='SETTLEMENT' WHERE id=$1",[seasonId]);
 const settings={...__clanTest.CLAN_ADMIN_SETTINGS_DEFAULTS,mode:'TEST',warDurationMinutes:60};
 const seeds=[1,2,3].map(clan_id=>({clan_id,name:'클랜 '+clan_id}));
 await startChampions(f.env,season,settings,seeds,times.regularEndsAt);
 const [cup]=await q('SELECT * FROM clan_championships WHERE season_id=$1',[seasonId]);
 assert.equal(Date.parse(cup.semifinal_starts_at),times.semifinal);assert.equal(Date.parse(cup.final_starts_at),times.final);
 assert.ok(times.final+3600000<=c.endsAt);
 await advanceChampions(f.env,{...season,phase:'CHAMPIONS'},settings,times.final);
 await advanceChampions(f.env,{...season,phase:'CHAMPIONS'},settings,times.final+3600000);
 const [during]=await q('SELECT phase,ends_at FROM clan_seasons WHERE id=$1',[seasonId]);assert.equal(during.phase,'CHAMPIONS');assert.equal(Date.parse(during.ends_at),c.endsAt);
 await advanceChampions(f.env,{...season,phase:'CHAMPIONS'},settings,c.endsAt);
 assert.equal((await q('SELECT phase FROM clan_seasons WHERE id=$1',[seasonId]))[0].phase,'COMPLETE');
});

test('KST faction days change at release and the weekend skips to Tuesday',()=>{
 for(const [date,allowed] of [['2026-11-09',true],['2026-11-10',true],['2026-11-11',true],['2026-11-12',false],['2026-11-13',true],['2026-11-14',false],['2026-11-15',false],['2026-11-16',false]])assert.equal(factionDayPermitted(date),allowed,date);
 assert.equal(nextFactionDay('2026-11-13'),'2026-11-17');
});

test('private garden has its own directory, three waves, original boss and fixed lower difficulty',()=>{
 const input={id:'ABCDEF1234',user:{id:1,nickname:'방장'},clientId:crypto.randomUUID(),area:CLAN_GARDEN.id,clanId:1,roundId:'live',difficulty:'HARD',seed:20,now:100};
 const room=createCoopRoom(input);assert.notEqual(coopDirectory(room.area,room),coopDirectory('public'));
 assert.deepEqual(room.combat.stages.map(s=>s.name),['정원 외벽','가시 회랑','침식의 심장']);
 assert.equal(coopRosterSummary(room.encounter).boss.name,'가시관 포식자');
 assert.throws(()=>createCoopRoom({...input,difficulty:'EXTREME'}),{code:'COOP_AREA'});
});

test('party dockyard is locked in season four and private to the eligible clan from season five, including final charge',async t=>{
 const f=await citadelFixture({postgres:true,partyMode:'OFF'});t.after(f.close);
 await f.db.execSchema(["CREATE TABLE organization_rounds_v1(id text PRIMARY KEY,scope text,phase text)","CREATE TABLE organization_progress_v1(round_id text,organization_id integer,stage integer)","CREATE TABLE organization_members_v1(round_id text,user_id bigint,organization_id integer)","CREATE TABLE clan_seasons(id bigint PRIMARY KEY,season_no int,phase text,starts_at text)"]);
 await f.exec("INSERT INTO organization_rounds_v1 VALUES('live','LIVE','ASSIGNED')");await f.exec("INSERT INTO organization_progress_v1 VALUES('live',1,4),('live',2,4)");
 await f.exec("INSERT INTO organization_members_v1 VALUES('live',1,1),('live',2,1),('live',3,2)");
 await f.exec("INSERT INTO clan_seasons VALUES(9,4,'ACTIVE','2026-01-01T00:00:00Z')");
 await f.exec('INSERT INTO app_meta(key,value) VALUES(?,?)','clan_resumption_v1',JSON.stringify({roundId:'live',seasonId:9}));
 const create={requestId:'dockyard-owned-clan-request',area:DOCKYARD.id};
 const lobby=async uid=>(await f.action(uid,'lobby')).body;
 assert.equal((await lobby(1)).clanOpen,false);
 assert.equal((await f.action(1,'create',create)).body.code,'CLAN_SEASON_REQUIRED');
 await f.exec("UPDATE clan_seasons SET season_no=5,starts_at='2100-01-01T00:00:00Z'");
 assert.equal((await lobby(1)).clanOpen,false);
 await f.exec("UPDATE clan_seasons SET starts_at='2026-01-01T00:00:00Z'");
 await f.exec('UPDATE organization_progress_v1 SET stage=2 WHERE organization_id=1');
 assert.equal((await f.action(1,'create',create)).body.code,'CLAN_HIDEOUT_REQUIRED');
 await f.exec('UPDATE organization_progress_v1 SET stage=3 WHERE organization_id=1');
 assert.equal((await lobby(1)).clanOpen,true);assert.equal((await lobby(1)).open,false);
 const created=await f.action(1,'create',create);assert.equal(created.status,200,JSON.stringify(created.body));const {id}=created.body.state;
 assert.equal((await lobby(2)).clanRooms[0].id,id);assert.equal((await lobby(3)).clanRooms.length,0);assert.equal((await lobby(1)).rooms.length,0);
 const selfJoin=await f.action(1,'join',{id});
 assert.deepEqual(selfJoin.body.state.members.map(m=>m.id),[1]);
 assert.equal((await f.action(1,'ready',{id,...f.selection(0)})).status,200);
 assert.equal((await f.action(1,'start',{id})).body.code,'CITADEL_READY');
 assert.equal((await f.action(1,'loaded',{id})).body.code,'CITADEL_LOADING');
 assert.equal((await f.action(3,'join',{id})).body.code,'CLAN_ROOM_REQUIRED');
 assert.equal((await f.action(2,'join',{id})).status,200);
 assert.equal((await f.action(2,'ready',{id,...f.selection(1)})).status,200);
 const launched=await f.action(1,'start',{id});assert.equal(launched.status,200,JSON.stringify(launched.body));assert.equal(launched.body.state.status,'LOADING');
 const confirmed=await f.action(1,'loaded',{id});assert.equal(confirmed.body.state.status,'LOADING');
 assert.equal((await f.action(1,'loaded',{id})).body.state.startsAt,null);
 await f.exec('UPDATE organization_members_v1 SET organization_id=2 WHERE user_id=1');
 assert.equal((await f.action(2,'loaded',{id})).body.code,'CLAN_ROOM_REQUIRED');
 assert.equal((await f.db.prepare("SELECT COUNT(*) AS n FROM app_meta WHERE key LIKE 'legion_citadel_v1:next-entry:%'").first()).n,0);
 await f.exec('UPDATE organization_members_v1 SET organization_id=1 WHERE user_id=1');
 const active=(await f.action(2,'loaded',{id})).body.state;assert.equal(active.status,'ACTIVE');
 assert.equal(active.nextEntryAt,active.startsAt+6*60*60*1000);
 assert.equal((await f.action(2,'loaded',{id})).body.state.nextEntryAt,active.nextEntryAt);
 for(const uid of [1,2]){
  const current=await lobby(uid);assert.equal(current.partyRechargeHours,6);assert.equal(current.nextEntryAt,active.nextEntryAt);
 }
 assert.equal((await f.db.prepare("SELECT COUNT(*) AS n FROM app_meta WHERE key LIKE 'legion_citadel_v1:next-entry:%'").first()).n,2);
 const roster=citadelEnemies('gate',DOCKYARD.id);assert.equal(roster.monster.name,'철갑 집행자');
 const roll=calamityPartyDrops([],{stonePercent:10,eliteStonePercent:0,bossStonePercent:0},[],[],{ref:'stone'},n=>n,DOCKYARD.itemMultiplier);
 assert.equal(roll.groups[0][0][0].percent,15);
});

test('48-hour election, consent-only 50-day season, archived history, repeated start and elder-reviewed join',async t=>{
 const f=await clanResumeFixture(t),review=await inspectResume(f.pg);
 await applyResume(f.pg,{now:f.clock(),expectedReviewHash:review.reviewHash,random:()=>0,dryRun:false});
 const q=async(sql,args=[])=> (await f.pg.query(sql,args)).rows;
 const [meta]=await q("SELECT value FROM app_meta WHERE key='clan_resumption_v1'");
 const release={...JSON.parse(meta.value),regularSchedule:CLAN_WED_SAT_SUN_SCHEDULE};
 await q("UPDATE app_meta SET value=$1 WHERE key='clan_resumption_v1'",[JSON.stringify(release)]);
 f.advance(Date.parse('2026-11-10T19:00:00+09:00')-f.clock());
 const send=(path,body,user=1)=>f.post(path,{roundId:f.roundId,...body},{user});
 assert.equal((await send('admin/organization/elder/open',{windowId:null},2)).status,403);
 assert.equal((await send('admin/organization/additional-recruitment',{action:'open',revision:0})).data.code,'ORG_MASS_CLOSED');
 const opened=await send('admin/organization/elder/open',{windowId:null});assert.equal(opened.status,200);
 const windowId=opened.data.windowId;assert.equal(opened.data.closesAt-f.clock(),48*3600000);
 assert.equal((await send('organization/elder/apply',{windowId,organizationId:1},30)).status,200);
 assert.equal((await send('organization/elder/cancel',{windowId},30)).status,200);
 for(let i=0;i<24;i++)assert.equal((await send('organization/elder/apply',{windowId,organizationId:1+Math.floor(i/3)},i+2)).status,200);
 assert.equal((await send('organization/elder/apply',{windowId,organizationId:2},2)).status,409);
 const view=async()=> (await f.organizationCall('admin/organization',{user:1})).data.elderSeason;
 let e=await view();assert.equal(e.applicants.length,24);
 assert.equal((await send('admin/organization/elder/select',{windowId,revision:e.revision,organizationId:1,userIds:[2,3,4]})).status,409);
 f.advance(48*3600000);assert.equal((await send('organization/elder/apply',{windowId,organizationId:1},26)).status,409);
 for(let i=0;i<8;i++){
  const select=await send('admin/organization/elder/select',{windowId,revision:e.revision,organizationId:i+1,userIds:[2+i*3,3+i*3,4+i*3]});
  assert.equal(select.status,200,JSON.stringify(select.data));e.revision=select.data.revision;
 }
 const start={windowId,revision:e.revision,requestId:'season-open-replay-key'};
 assert.equal((await send('admin/organization/elder/start',start)).data.code,'ORG_SEASON_ACTIVE');
 const end='2026-11-11T13:00:00.000Z',settings={...__clanTest.CLAN_ADMIN_SETTINGS_DEFAULTS,mode:'TEST',openDays:[3,6,0]},seeds=[1,2,3].map(clan_id=>({clan_id,name:'클랜 '+clan_id}));
 await q("UPDATE clan_seasons SET phase='SETTLEMENT',ends_at=$2 WHERE id=$1",[release.seasonId,end]);
 await startChampions(f.env,{id:release.seasonId,phase:'SETTLEMENT',ends_at:end},settings,seeds,Date.parse(end)+1800000);
 const [cup]=await q('SELECT * FROM clan_championships WHERE season_id=$1',[release.seasonId]);
 assert.equal(cup.semifinal_starts_at,'2026-11-12T12:00:00.000Z');
 await q("UPDATE clan_seasons SET phase='COMPLETE' WHERE id=$1",[release.seasonId]);
 await q("UPDATE organization_progress_v1 SET stage=4 WHERE round_id=$1 AND organization_id=1",[f.roundId]);
 const result=await send('admin/organization/elder/start',start);assert.equal(result.status,200,JSON.stringify([result.data,f.errors.map(e=>e.message)]));
 assert.deepEqual((await send('admin/organization/elder/start',start)).data,result.data);
 const {roundId,seasonId}=result.data;
 const [season]=await q('SELECT * FROM clan_seasons WHERE id=$1',[seasonId]);assert.equal(Date.parse(season.ends_at)-Date.parse(season.starts_at),50*86400000);
 const [count]=await q('SELECT count(*)::int n FROM clan_members WHERE season_id=$1',[seasonId]);assert.equal(count.n,24);
 assert.equal((await q('SELECT organization_id FROM organization_members_v1 WHERE round_id=$1',[f.roundId])).length,128);
 const wars=await q('SELECT starts_at,ends_at FROM clan_wars WHERE season_id=$1',[seasonId]);assert(wars.length>=80);
 assert(wars.every(w=>[3,6,0].includes(new Date(Date.parse(w.starts_at)+32400000).getUTCDay())&&Date.parse(w.ends_at)<=Date.parse(season.ends_at)));
 assert.equal((await clanHideout(f.env,2)).clanId,1);assert.equal((await clanHideout(f.env,2)).stage,4);assert.equal((await clanHideout(f.env,30)).stage,0);
 const app=await send('organization/join/apply',{roundId,revision:0,organizationId:1,message:'참가합니다'},30);assert.equal(app.status,200);
 assert.equal((await send('organization/join/review',{roundId,revision:1,userId:30,decision:'APPROVED'},5)).status,403);
 assert.equal((await send('organization/join/review',{roundId,revision:1,userId:30,decision:'APPROVED'},2)).status,200);
 assert.equal((await q('SELECT clan_id FROM clan_members WHERE season_id=$1 AND user_id=30',[seasonId]))[0].clan_id,1);
});
