import test from 'node:test';
import assert from 'node:assert/strict';
import {territoryNetworkFixture} from './helpers/territory-network-fixture.mjs';
import {seedDraftActivity,draftTestDeps} from './helpers/territory-draft-fixture.mjs';
import {activeDraftRoster,deliverDraftOrder,upcomingTerritoryScheduleSql,visibleTerritorySchedule} from '../functions/_territory_draft.js';
import {draftCandidate} from '../js/territory-draft-order.mjs';
import {__territoryClanTest as T} from '../functions/_territory_war.js';
const iso=ms=>new Date(ms).toISOString(),minute=60000,day=86400000;

test('public standby at T-30 and a personal order only after T-5 or during ongoing combat',()=>{
  const battle=Date.parse('2030-10-12T04:00:00Z'),scheduled={kind:'TERRITORY_SCHEDULE',detail:JSON.stringify({mode:'ON',battleName:'시험',autoOpen:{kind:'ONCE',battleAt:iso(battle)}})};
  const read=now=>visibleTerritorySchedule([scheduled],now);
  assert.equal(read(battle-30*minute-1).items.length,0);assert.equal(read(battle-30*minute-1).nextTerritoryChangeAt,iso(battle-30*minute));
  const wait=read(battle-30*minute).items[0];assert.equal(wait.phase,'DRAFT_WAIT');assert.equal(read(battle-30*minute).nextTerritoryChangeAt,iso(battle-5*minute));
  assert.equal(draftCandidate([wait],battle-minute),undefined);
  wait.entityId=14;assert.equal(draftCandidate([wait],battle-5*minute-1),undefined);assert.equal(draftCandidate([wait],battle-5*minute),wait);
  const fight={...wait,phase:'DRAFT_BATTLE',deadlineAt:iso(battle+minute)};assert.equal(draftCandidate([fight],battle),fight);assert.equal(draftCandidate([fight],battle+minute),undefined);
  assert.deepEqual(visibleTerritorySchedule([{...scheduled,deadlineAt:iso(battle)}],battle-minute).items,[]);
});

for(const pg of [false,true])test((pg?'PostgreSQL':'SQLite')+' public feed reads the nested schedule from stored settings before the first round',async t=>{
  const f=await territoryNetworkFixture(t,pg,{participants:0});
  const battle=Date.parse('2030-10-12T04:00:00Z');
  const cfg={...f.cfg,mode:'ON',autoOpen:{kind:'ONCE',battleAt:iso(battle)}};
  const save=value=>f.p("UPDATE app_meta SET value=? WHERE key='territory_war_settings_v3'",JSON.stringify(value)).run();
  const read=async()=>{
    const row=await f.p('WITH territory AS (SELECT 1 WHERE 1=0) '+upcomingTerritoryScheduleSql).first();
    return now=>visibleTerritorySchedule([{...row,deadlineAt:row.deadline_at}],now);
  };
  await save(cfg);
  const visible=await read();
  assert.equal(visible(battle-31*minute).nextTerritoryChangeAt,iso(battle-30*minute));
  assert.equal(visible(battle-30*minute).items[0].phase,'DRAFT_WAIT');
  assert.equal(visible(battle-30*minute).nextTerritoryChangeAt,iso(battle-5*minute));
  assert.equal(await f.p('WITH territory AS (SELECT 1) '+upcomingTerritoryScheduleSql).first(),null);
  for(const off of [{...cfg,mode:'OFF'},{...cfg,autoOpen:{kind:'MANUAL'}}]){
    await save(off);assert.deepEqual((await read())(battle-30*minute),{items:[],nextTerritoryChangeAt:null});
  }
});

for(const pg of [false,true])test((pg?'PostgreSQL':'SQLite')+' draft fixes 150 active accounts once, balances 75/75 and delivers only one visible order per account/round',async t=>{
  const f=await territoryNetworkFixture(t,pg,{participants:155});
  const now=Date.now(),cutoff=now-4*minute,battle=cutoff+5*minute;
  await seedDraftActivity(f,cutoff);
  await f.p("UPDATE users SET status='BANNED' WHERE id=1").run();
  await f.p("UPDATE users SET banned_until=? WHERE id=2",iso(now+day)).run();
  await f.p('UPDATE users SET last_login_at=? WHERE id=3',iso(now-15*day)).run();
  await f.p('INSERT INTO attendance_logs VALUES(?,?,?)',155,iso(cutoff+9*3600000).slice(0,10),iso(cutoff-minute)).run();
  const roster=await activeDraftRoster(f.env,draftTestDeps,cutoff);
  assert.equal(roster.length,150);assert.equal(Number(roster[0].user_id),155);
  assert.ok(roster.every(u=>![1,2,3].includes(Number(u.user_id))));
  await f.p("UPDATE territory_war_v3_rounds SET status='DISABLED' WHERE id=1").run();
  const id=await T.createRound(f.env,f.cfg);
  assert.equal(Number((await f.p('SELECT COUNT(*) n FROM territory_war_v3_users WHERE round_id=?',id).first()).n),0);
  assert.equal((await T.formRound(f.env,{id},f.cfg,draftTestDeps)).status,'WAITING_FRONT');
  await f.p('UPDATE app_meta SET value=? WHERE key=?',iso(battle),'territory_draft_v1:'+id).run();
  await f.p('UPDATE territory_war_v3_rounds SET recruitment_ends_at=? WHERE id=?',iso(cutoff),id).run();
  const formed=await T.formRound(f.env,{id},f.cfg,draftTestDeps);assert.equal(formed.status,'PREPARING');assert.equal(formed.aCount,75);assert.equal(formed.bCount,75);
  assert.ok(Math.abs(formed.aPower-formed.bPower)<.01*(formed.aPower+formed.bPower));
  assert.equal((await T.formRound(f.env,{id},f.cfg,draftTestDeps)).status,'PREPARING');
  let round={...await f.p('SELECT * FROM territory_war_v3_rounds WHERE id=?',id).first(),draft_battle_at:iso(battle)};
  const request=(user,action,delivery,time=now)=>deliverDraftOrder(f.env,user,round,f.cfg,{roundId:id,action,delivery:delivery.repeat(16)},time);
  assert.equal((await request(155,'reserve','a',cutoff-1)).order,null);assert.equal((await request(3,'reserve','a')).order,null);
  const first=await request(155,'reserve','a');assert.equal(first.order.phase,'PREPARING');assert.ok(first.order.teamName);
  assert.equal((await request(155,'reserve','b')).retry,true);
  await request(155,'release','a');assert.ok((await request(155,'reserve','b')).order);
  await request(155,'shown','b');assert.equal((await request(155,'reserve','c',battle+minute)).order,null);
  assert.equal((await request(4,'reserve','a',battle+minute)).order.phase,'ACTIVE');
  round={...round,status:'FINISHED'};assert.equal((await request(5,'reserve','a')).order,null);
});

