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
