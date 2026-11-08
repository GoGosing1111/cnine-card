import assert from 'node:assert/strict';
import test from 'node:test';
import {jointFixture} from './helpers/joint-db.mjs';
import {operatingTowerFixture} from './helpers/tower-live-route.mjs';
import {ensureTowerWeek, towerWeek, towerFloorRewardRef, towerWeeklyTickDue, runTowerWeeklySchedule} from '../functions/_tower_weekly.js';
import {TOWER_ABYSS_PROTOCOL, towerAbyssFinish} from '../functions/_tower_abyss.js';

const monday = Date.parse('2026-11-09T00:00:00+09:00');
const week = 7 * 86400000;
const call = (tower, route, body) => tower.handle('tower/' + route, new Request('https://game.example/api/tower/' + route, {
  method:body ? 'POST' : 'GET', headers:{authorization:'Bearer local-account-7', 'content-type':'application/json'},
  ...(body ? {body:JSON.stringify(body)} : {})
}));
const ticket = (requestId, floorNo, weekKey) => ({requestId, floorNo, weekKey, protocol:TOWER_ABYSS_PROTOCOL});
const count = async statement => Number((await statement.first()).n);

test('Korean Monday boundary, year rollover and catch-up ticks use server time', async () => {
  assert.equal(towerWeek(monday-1).weekKey,'');
  assert.equal(towerWeek(monday-1).resetsAt,'2026-11-08T15:00:00.000Z');
  assert.equal(towerWeek(monday).weekKey,'2026-11-09');
  assert.equal(towerWeek(monday+week-1).weekKey,'2026-11-09');
  assert.equal(towerWeek(monday+week).weekKey,'2026-11-16');
  assert.equal(towerWeek(Date.parse('2027-01-01T00:00:00+09:00')).weekKey,'2026-12-28');
  assert.equal(towerWeek(Date.parse('2027-01-04T00:00:00+09:00')).weekKey,'2027-01-04');
  for(const offset of [-1,5*60000,61*60000])assert.equal(towerWeeklyTickDue(monday+offset),false);
  for(const offset of [0,4*60000,60*60000,2*week])assert.equal(towerWeeklyTickDue(monday+offset),true);
  await runTowerWeeklySchedule({},monday-1,()=>assert.fail('opened before first reset'));
});

for (const postgres of [false,true]) {
  test((postgres?'PostgreSQL':'SQLite')+' actually resets offline accounts, cancels pending fights and grants each new weekly clear once', async t => {
    const f=await jointFixture(t,{postgres}),tower=await operatingTowerFixture(f,{maxFloor:3});
    const before=await f.coin();
    await f.p('INSERT INTO tower_user_progress(season_id,user_id,current_floor,highest_floor,highest_reached_at) VALUES(1,8,4,3,?)','2026-11-08 10:00:00').run();
    await f.p('INSERT INTO tower_user_progress(season_id,user_id,current_floor,highest_floor) VALUES(99,8,12,11)').run();
    f.setClock(monday-300000);
    const old=ticket('tower-before-first-reset',1,''), first=await (await call(tower,'start',old)).json();
    f.setClock(first.settlement.notBefore);
    assert.equal((await (await call(tower,'finish',old)).json()).reward,1000000);
    const pending=ticket('tower-sunday-pending',2,'');
    f.setClock(monday-1);
    assert.equal((await call(tower,'start',pending)).status,200);
    assert.equal((await (await call(tower,'status')).json()).progress.currentFloor,2);
    assert.equal(await count(f.p("SELECT COUNT(*) AS n FROM app_meta WHERE key='tower_weekly_reset_v1'")),0);

    f.setClock(monday);
    let closed=0;
    await runTowerWeeklySchedule({},monday,async()=>({db:f.DB,close:async()=>{closed++;}}));
    assert.equal(closed,1);
    const offline=await f.p('SELECT * FROM tower_user_progress WHERE season_id=1 AND user_id=8').first();
    assert.deepEqual([Number(offline.current_floor),Number(offline.highest_floor),offline.highest_reached_at],[1,0,null]);
    assert.equal(Number((await f.p('SELECT current_floor FROM tower_user_progress WHERE season_id=99 AND user_id=8').first()).current_floor),12);
    const reset=await (await call(tower,'status')).json();
    assert.deepEqual([reset.progress.currentFloor,reset.progress.rank,reset.weekly.weekKey,reset.maxFloor,reset.ranking.length],[1,0,'2026-11-09',3,0]);
    assert.equal((await (await call(tower,'pending')).json()).pending,null);
    assert.equal((await call(tower,'finish',pending)).status,409);
    assert.equal((await call(tower,'start',ticket('tower-stale-browser-floor1',1,''))).status,409);
    assert.equal((await (await call(tower,'finish',old)).json()).reward,1000000);
    assert.equal(await f.coin(),before+1000000);

    const fresh=ticket('tower-monday-fresh-floor1',1,'2026-11-09');
    const start=await (await call(tower,'start',fresh)).json();
    f.setClock(start.settlement.notBefore);
    assert.equal((await call(tower,'finish',fresh)).status,200);
    assert.equal((await call(tower,'finish',fresh)).status,200);
    assert.equal(await f.coin(),before+2000000);
    assert.equal(await count(f.p("SELECT COUNT(*) AS n FROM account_rank_receipts_v1 WHERE user_id=7 AND source='TOWER' AND event_id IN ('1:1','1:2026-11-09:1')")),2);
    assert.equal(await count(f.p("SELECT COUNT(*) AS n FROM tower_clear_history WHERE user_id=7 AND floor_no=1 AND result='WIN'")),2);
    assert.equal((await (await call(tower,'status')).json()).progress.currentFloor,2);
    const freshDb={prepare:f.DB.prepare.bind(f.DB),batch:f.DB.batch.bind(f.DB),dialect:f.DB.dialect};
    await ensureTowerWeek({DB:freshDb},monday+3600000);
    assert.equal((await (await call(tower,'status')).json()).progress.currentFloor,2);

    // Miss a whole scheduled week. The first ordinary request reconciles it.
    f.setClock(monday+2*week+1234);
    const caughtUp=await (await call(tower,'status')).json();
    assert.deepEqual([caughtUp.progress.currentFloor,caughtUp.weekly.weekKey],[1,'2026-11-23']);
    await ensureTowerWeek({DB:{...freshDb}},monday+week);
    assert.equal((await f.p("SELECT value FROM app_meta WHERE key='tower_weekly_reset_v1'").first()).value,'2026-11-23');
    assert.equal(await f.coin(),before+2000000);
  });
}

test('failed offline reset rolls back and the next request retries it',async t=>{
  const f=await jointFixture(t),tower=await operatingTowerFixture(f,{floorNo:10});
  f.setClock(monday);f.fail('UPDATE joint_operations_v1 SET status=');
  await assert.rejects(ensureTowerWeek(f.env,monday),/INJECTED_FAILURE/);
  assert.equal(Number((await f.p('SELECT current_floor FROM tower_user_progress WHERE user_id=7').first()).current_floor),10);
  assert.equal(await count(f.p("SELECT COUNT(*) AS n FROM app_meta WHERE key='tower_weekly_reset_v1'")),0);
  f.fail('');
  const rows=await Promise.all([call(tower,'status'),call(tower,'pending'),ensureTowerWeek(f.env,monday)]);
  assert.equal((await rows[0].json()).progress.currentFloor,1);
});

test('a first-floor fight crossing midnight cannot credit the same floor in the new week, already settled extras keep their original receipt',async t=>{
  const f=await jointFixture(t),tower=await operatingTowerFixture(f,{maxFloor:3}),before=await f.coin();
  f.setClock(monday-1);
  const stale=ticket('tower-sunday-first-floor',1);
  assert.equal((await call(tower,'start',stale)).status,200);
  f.setClock(monday);
  assert.equal((await call(tower,'finish',stale)).status,409);
  assert.equal(await f.coin(),before);
  const earned=ticket('tower-earned-before-midnight',1);
  const fresh=await (await call(tower,'start',earned)).json();
  f.setClock(fresh.settlement.notBefore);
  const refs=[];
  const deps={magicReward:async plan=>{refs.push(towerFloorRewardRef(plan));throw Error('offline drop');},equipmentReward:async()=>null,blackMiracleReward:async()=>null};
  await assert.rejects(towerAbyssFinish(f.env,f.user,earned,deps,{now:f.deps.now}),/offline drop/);
  f.setClock(monday+week);
  assert.equal((await (await call(tower,'pending')).json()).pending.requestId,earned.requestId);
  deps.magicReward=async plan=>{refs.push(towerFloorRewardRef(plan));return {amount:1};};
  assert.equal((await towerAbyssFinish(f.env,f.user,earned,deps,{now:f.deps.now})).settlement.status,'COMPLETED');
  assert.deepEqual(refs,['1:2026-11-09:1','1:2026-11-09:1']);
  assert.equal(await f.coin(),before+1000000);
  assert.equal((await (await call(tower,'status')).json()).progress.currentFloor,1);
});
