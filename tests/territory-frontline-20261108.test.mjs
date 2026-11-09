import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import {territoryNetworkFixture} from './helpers/territory-network-fixture.mjs';
import {accountRankAward} from '../functions/_account_rank.js';
import {seedDraftActivity,draftTestDeps} from './helpers/territory-draft-fixture.mjs';
import {schedulePolicy,scheduledSlot,scheduledRoundKey} from '../functions/_territory_schedule.js';
import {frontActivity,activeVictoryBuff,readVictoryBuff,territoryVictoryCoin,victoryBuffKey} from '../functions/_territory_frontline.js';
import {finishTerritoryClanRound} from '../functions/_territory_clan_warfare.js';
import {__territoryClanTest as T,tickTerritorySchedule} from '../functions/_territory_war.js';
import {withCollectionBonusScope,readCollectionBonuses,collectionRewardCoin} from '../functions/_collection_bonuses.js';

test('the active map and field squad distinguish actual access, occupation and incomplete archived squads',()=>{
  const ctx=vm.createContext({});
  for(const script of ['territory-network-v6','territory-formation-20261013']){
    vm.runInContext(fs.readFileSync(new URL('../js/'+script+'.js',import.meta.url),'utf8'),ctx);
  }
  const hud=ctx.CNineTerritoryNetwork, state={round:{status:'ACTIVE'},mine:{side:'A'}};
  assert.equal(hud.accessFor(state,{owner:'A',canEnter:true}).kind,'defend');
  assert.equal(hud.accessFor(state,{owner:'B',canEnter:true}).kind,'advance');
  assert.equal(hud.accessFor(state,{owner:'B',canEnter:false}).kind,'wait');
  assert.equal(hud.accessFor({...state,truce:{active:true}},{canEnter:true}).label,'휴전');
  const labels={esc:String,sideName:String};
  assert.match(hud.occupationHtml({...state,network:{counts:{A:0,neutral:0,B:9}}},labels),/flex:0.+flex:0.+flex:9/);
  assert.match(hud.occupationHtml({...state,counts:{A:8,B:12}},labels),/flex:8.+flex:0.+flex:12/);
  const mine={side:'A',deck_snapshot:'["a","b","c","d","e"]',loadout_bonus_json:'null',formation_breakdown_json:'null'};
  const squad=ctx.CNineTerritoryFormation.squad;
  assert.match(squad({...state,mine}),/5\/5장/);
  assert.match(squad({...state,mine}),/상세 정보/);
  mine.loadout_bonus_json=JSON.stringify({territoryCards:Array.from({length:5},(_,i)=>({name:'카드 '+i,image:'/card-'+i+'.webp',rarity:'SS'}))});
  const populated=squad({...state,mine});
  assert.equal(populated.match(/<img /g).length,5);assert.doesNotMatch(populated,/상세 정보/);
});

const week=7*86400000;
const iso=ms=>new Date(ms).toISOString(),sqlTime=ms=>iso(ms).slice(0,19).replace('T',' ');
test('KST scheduling honors both lead times and opens a given slot only before battle',()=>{
  const battle=Date.parse('2026-11-12T20:00:00+09:00');
  const cfg={recruitmentHours:3,preparationMinutes:15,autoOpen:schedulePolicy({kind:'WEEKLY',battleAt:'2026-11-12T20:00+09:00'})};
  assert.equal(cfg.autoOpen.battleAt,'2026-11-12T11:00:00.000Z');
  const opening=battle-30*60000;
  assert.equal(scheduledSlot(cfg,opening-1),null);
  assert.equal(scheduledSlot(cfg,opening).formationAt,iso(battle-5*60000));
  assert.equal(scheduledSlot(cfg,battle-1).battleAt,iso(battle));
  assert.equal(scheduledSlot(cfg,battle),null);
  assert.equal(scheduledSlot(cfg,opening+week).battleAt,iso(battle+week));
  assert.equal(scheduledSlot({...cfg,autoOpen:{...cfg.autoOpen,kind:'ONCE'}},opening+week),null);
  assert.equal(scheduledSlot({...cfg,autoOpen:schedulePolicy()},opening),null);
  assert.throws(()=>schedulePolicy({kind:'ONCE',battleAt:'2026-02-30T12:00+09:00'}));
  assert.throws(()=>schedulePolicy({kind:'WEEKLY',battleAt:'2026-11-12T20:00'}));
});

for(const pg of [false,true]){
 const engine=pg?'PostgreSQL':'SQLite';
 test(engine+' uses only completed recent activity and excludes stale, future and other-round data',async t=>{
  const f=await territoryNetworkFixture(t,pg,{participants:4});
  await f.form();const round=await f.round(),at=Math.floor(Date.now()/1000)*1000;
  const fronts=(await f.p('SELECT id,node_index FROM territory_war_v3_fronts WHERE round_id=1 ORDER BY node_index').all()).results;
  let serial=0;
  const record=(node,ms,status='COMPLETED',roundId=1)=>f.p('INSERT INTO territory_war_v3_actions(request_id,round_id,front_id,user_id,side,status,updated_at) VALUES(?,?,?,?,?,?,?)',
    'heat-'+ ++serial,roundId,fronts[node].id,1,'A',status,sqlTime(ms)).run();
  for(let n=0;n<4;n++)await record(2,at-120000);
  for(let n=0;n<7;n++)await record(4,at);
  await record(2,at-121000);await record(2,at,'PENDING');await record(2,at+1000);await record(2,at,'COMPLETED',99);
  for(let n=0;n<3;n++)await record(7,at);
  assert.deepEqual((await frontActivity(f.env.DB,round,at)).nodes,[{nodeIndex:4,attacks:7},{nodeIndex:2,attacks:4}]);
  assert.deepEqual((await frontActivity(f.env.DB,{...round,status:'FINISHED'},at)).nodes,[]);
 });
 test(engine+' settles personal buffs atomically and renews winning members without doubling or refunding',async t=>{
  const f=await territoryNetworkFixture(t,pg,{participants:6}),db=f.env.DB;await f.form();
  await f.p("UPDATE territory_war_v3_users SET side=CASE WHEN user_id<4 THEN 'A' ELSE 'B' END,status=CASE WHEN user_id=3 THEN 'WAITING' ELSE 'ACTIVE' END").run();
  const round=await f.round();
  await finishTerritoryClanRound(f.env,round,'A');
  const record=async uid=>JSON.parse((await f.p('SELECT value FROM app_meta WHERE key=?',victoryBuffKey(uid)).first())?.value||'null');
  const first=await record(1),scope=withCollectionBonusScope(f.env);
  assert.equal(first.roundId,1);assert.deepEqual(await record(2),first);assert.equal(await record(3),null);assert.equal(await record(4),null);
  assert.deepEqual((await readCollectionBonuses(scope,1)).totals,{accountXpPercent:20,coinPercent:50,dropPercent:0});
  assert.equal(await collectionRewardCoin(scope,1,101,'PVE'),151);assert.equal(await collectionRewardCoin(scope,4,100,'PVE'),100);
  const xp=await accountRankAward(scope,1,'IDLE','victory-xp',{ticks:1000});
  await db.batch(xp.slice(0,3));
  assert.equal(Number((await f.p("SELECT ticks FROM account_rank_receipts_v1 WHERE event_id='victory-xp'").first()).ticks),1200);
  assert.equal(await territoryVictoryCoin(db,1,100),150);assert.equal(await collectionRewardCoin(scope,1,100,'REFUND'),100);
  assert.equal(activeVictoryBuff(first,first.start-1),null);assert.equal(activeVictoryBuff(first,first.start+week-1).roundId,1);assert.equal(activeVictoryBuff(first,first.start+week),null);
  await finishTerritoryClanRound(f.env,round,'A');assert.deepEqual(await record(1),first);
  await f.p("INSERT INTO territory_war_v3_rounds(id,status,warfare_version) VALUES(2,'ACTIVE',6),(3,'ACTIVE',6)").run();
  await f.p("INSERT INTO territory_war_v3_users(round_id,user_id,side,status) VALUES(2,1,'B','ACTIVE'),(3,1,'B','ACTIVE')").run();
  await finishTerritoryClanRound(f.env,{id:2,warfare_version:6},'DRAW');assert.deepEqual(await record(1),first);
  await finishTerritoryClanRound(f.env,{id:3,warfare_version:6},'B');const renewal=await record(1);
  assert.equal(renewal.roundId,3);assert.ok(renewal.start>=first.start);assert.equal((await readVictoryBuff(db,1)).coinPercent,50);
  assert.equal(await territoryVictoryCoin(db,1,100),150);assert.equal((await readCollectionBonuses(f.env,1)).totals.accountXpPercent,20);
  t.mock.method(Date,'now',()=>renewal.start+week);
  assert.equal((await readCollectionBonuses(scope,1)).totals.accountXpPercent,0);assert.equal(await territoryVictoryCoin(db,1,100),100);
 });
 test(engine+' round creation, formation and activation use one saved slot on repeated timer delivery',async t=>{
  const f=await territoryNetworkFixture(t,pg,{participants:4});
  assert.deepEqual(await tickTerritorySchedule(f.env,{}),{scheduled:false});
  const now=Math.floor(Date.now()/60000)*60000,battle=now;
  const cfg={...f.cfg,autoOpen:{kind:'ONCE',battleAt:iso(battle)},recruitmentHours:1,preparationMinutes:5};
  await f.p("UPDATE app_meta SET value=? WHERE key='territory_war_settings_v3'",JSON.stringify(cfg)).run();
  await f.p("UPDATE territory_war_v3_rounds SET status='DISABLED' WHERE id=1").run();
  await f.p("INSERT INTO app_meta(key,value) VALUES('safe_runtime_upgrade_v2120_territory_foundation_fast_gate','1')").run();
  await seedDraftActivity(f,battle-5*60000);
  let clock=battle-31*60000;t.mock.method(Date,'now',()=>clock);
  assert.equal((await tickTerritorySchedule(f.env,{})).status,'DISABLED');
  clock=battle-30*60000;
  const started=await tickTerritorySchedule(f.env,{});assert.equal(Number(started.roundId),2);assert.equal(started.status,'RECRUITING');
  assert.equal((await f.p('SELECT value FROM app_meta WHERE key=?',scheduledRoundKey(2)).first()).value,iso(battle));
  assert.equal(Number((await tickTerritorySchedule(f.env,{})).roundId),2);
  clock=battle-5*60000;const formed=await tickTerritorySchedule(f.env,draftTestDeps);assert.equal(formed.status,'PREPARING');
  clock=battle;assert.equal((await tickTerritorySchedule(f.env,{})).status,'ACTIVE');
  assert.equal(Number((await f.p('SELECT COUNT(*) n FROM territory_war_v3_rounds').first()).n),2);
  await f.p("UPDATE territory_war_v3_rounds SET status='FINISHED' WHERE id=2").run();
  assert.equal((await tickTerritorySchedule(f.env,{})).status,'FINISHED');
 });
}
