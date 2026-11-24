import assert from 'node:assert/strict';
import test from 'node:test';
import proposal from '../docs/qa/tower-200-20261124/floor-plan.json' with {type:'json'};
import priorBase from '../docs/qa/tower-boss-rewards-20261022/floor-plan.json' with {type:'json'};
import {fixture, plan as priorExtension, reviewSnapshot} from './helpers/tower-expansion-20261102.mjs';
import {jointFixture} from './helpers/joint-db.mjs';
import {collectionFixture} from './helpers/collection-bonuses-fixture.mjs';
import {operatingTowerFixture} from './helpers/tower-live-route.mjs';
import {TOWER_ABYSS_PROTOCOL, TOWER_MAX_CLEAR_COIN} from '../functions/_tower_abyss.js';
import {buildTowerV3Battle, TOWER_V3_DRAFT} from '../functions/_tower_v3.js';
import {ensureTowerWeek} from '../functions/_tower_weekly.js';
import {PET_CMS_KEY} from '../shared/pet-cms-v1.mjs';
import {towerMonsterArt} from '../shared/tower-monsters-20261022.mjs';

test('the 50 new CMS rows continue the reviewed tower and the proposed weekly budget adds up', () => {
  const {floors, weeklyMilestoneAdditions, repeatProposal} = proposal;
  assert.equal(proposal.previousMaxFloor, priorExtension.maxFloor);
  assert.equal(proposal.maxFloor, 200);
  assert.equal(floors.length, 50);
  let previousPower = priorExtension.floors.at(-1).power;
  let ordinaryCoin = priorExtension.floors.at(-2).coin;
  let guardianCoin = priorExtension.floors.at(-1).coin;
  for (const [index, row] of floors.entries()) {
    assert.equal(row.floor, 151 + index);
    assert.equal(row.boss, Number(row.floor % 10 === 0));
    assert(Number.isSafeInteger(row.power) && row.power > previousPower);
    assert(Number.isSafeInteger(row.coin) && row.coin > (row.boss ? guardianCoin : ordinaryCoin));
    assert(fixture.monsters.some(m => Number(m.id) === row.monsterId && Number(m.is_active) && Number(m.tower_enabled)));
    assert(towerMonsterArt(row.monsterId)?.battleSprite);
    previousPower = row.power;
    if (row.boss) guardianCoin = row.coin;
    else ordinaryCoin = row.coin;
  }
  assert.deepEqual(floors.filter(row => row.boss).map(row => row.power), [15e9, 25e9, 40e9, 65e9, 100e9]);
  assert.equal(floors.reduce((total, row) => total + row.coin, 0), proposal.totalNewBaseCoin);
  assert.equal(proposal.totalNewBaseCoin, 90.8e12);
  assert.equal(priorBase.totalCoin + priorExtension.totalCoin + proposal.totalNewBaseCoin, 131803847600000);
  assert.deepEqual(weeklyMilestoneAdditions.map(row => row.floor), [50, 100, 150, 160, 170, 180, 190, 200]);
  assert.equal(weeklyMilestoneAdditions.reduce((n, row) => n + row.masterStars, 0), 300000000);
  assert.equal(weeklyMilestoneAdditions.reduce((n, row) => n + row.ardenEnergy, 0), 15);
  const repeatCoin = base => Math.min(Math.floor(base * repeatProposal.baseCoinPercent / 100), repeatProposal.coinCapPerWin);
  assert.equal(repeatCoin(priorExtension.floors.at(-1).coin), 439400000000);
  assert.equal(repeatCoin(floors.at(-1).coin) * repeatProposal.rewardedWinsPerAccountPerWeek, 5e12);
  assert.deepEqual(repeatProposal.bonusItemsByRewardedWin.map(r => [r.win, r.quantity]), [[3, 1], [5, 1]]);
});

test('the expanded combat limit is confined to floors 151 through 200', () => {
  const snapshot = reviewSnapshot();
  const config = {...TOWER_V3_DRAFT, maxTier:201, powerGrowth:1.001};
  const run = (tier, power) => buildTowerV3Battle({snapshot, tier, seed:1, config, operatingFloor:{id:69, power}});
  for (const [tier, power] of [[150, 1e10 + 1], [201, 1e10 + 1], [200, 1e11 + 1], [151, 0], [200, NaN]]) {
    assert.throws(() => run(tier, power), {code:'TOWER_V3_CONFIG'});
  }
  assert.equal(run(150, 1e10).tier, 150);
  assert.equal(run(200, 1e11).continuousEncounter.total, 28);
});

async function route(tower, name, body) {
  const response = await tower.handle('tower/' + name, new Request('https://game.example/api/tower/' + name, {
    method:body ? 'POST' : 'GET', headers:{authorization:'Bearer local-account-7', 'content-type':'application/json'},
    body:body && JSON.stringify(body)
  }));
  return {status:response.status, data:await response.json()};
}

test('a completed 150F account ascends all 50 additional floors through normal start and finish', async t => {
  const f = await jointFixture(t, {postgres:true});
  f.setPower(150e9);
  const baseDeck = f.deps.raidDeckPower;
  const {mercenaries} = reviewSnapshot();
  f.deps.raidDeckPower = async (...args) => ({...await baseDeck(...args), mercenaries});
  const tower = await operatingTowerFixture(f, {floorNo:151, maxFloor:150});
  f.setClock(Date.parse('2026-11-24T12:00:00+09:00'));
  const week = await ensureTowerWeek(f.env, f.deps.now());
  await tower.setFloor(151);
  assert.equal((await route(tower, 'status')).data.completed, true);
  for (const id of new Set(proposal.floors.map(row => row.monsterId))) {
    const m = fixture.monsters.find(row => Number(row.id) === id);
    await f.p(`INSERT INTO battle_monsters(id,name,image_url,battle_power,is_boss,ultimate_enabled,ultimate_trigger,ultimate_chance,ultimate_tower_damage_percent)
      VALUES(?,?,?,?,?,?,?,?,?) ON CONFLICT(id) DO UPDATE SET name=excluded.name,ultimate_enabled=excluded.ultimate_enabled,
      ultimate_trigger=excluded.ultimate_trigger,ultimate_chance=excluded.ultimate_chance,ultimate_tower_damage_percent=excluded.ultimate_tower_damage_percent`,
      id, m.name, m.image_url, Number(m.battle_power), Number(m.is_boss), m.ultimate_enabled, m.ultimate_trigger,
      m.ultimate_chance, m.ultimate_tower_damage_percent).run();
  }
  for (const row of proposal.floors) {
    await f.p(`INSERT INTO tower_floor_ranges(id,season_id,start_floor,end_floor,reward_coin,monster_id,is_active,power_override,is_boss)
      VALUES(?,1,?,?,?,?,1,?,?)`, 5000 + row.floor, row.floor, row.floor, row.coin, row.monsterId, row.power, row.boss).run();
  }
  const opened = (await route(tower, 'status')).data;
  assert.deepEqual([opened.maxFloor, opened.progress.highestFloor, opened.floor.floorNo], [200, 150, 151]);
  const startingCoin = await f.coin();
  for (const row of proposal.floors) {
    const ticket = {requestId:'tower-200-ascent-' + row.floor, protocol:TOWER_ABYSS_PROTOCOL, weekKey:week.weekKey, floorNo:row.floor};
    const start = await route(tower, 'start', ticket);
    assert.equal(start.status, 200, start.data.error);
    assert.deepEqual([start.data.floorNo, start.data.monsterPower, start.data.result, start.data.reward], [row.floor, row.power, 'WIN', 0]);
    f.setClock(start.data.settlement.notBefore);
    const finish = await route(tower, 'finish', ticket);
    assert.equal(finish.status, 200, finish.data.error);
    assert.deepEqual([finish.data.nextFloor, finish.data.reward, finish.data.completed], [row.floor + 1, row.coin, row.floor === 200]);
    if (row.floor === 200) assert.equal((await route(tower, 'finish', ticket)).data.reward, row.coin);
  }
  assert.equal(await f.coin() - startingCoin, proposal.totalNewBaseCoin);
  assert.equal((await route(tower, 'status')).data.completed, true);
  assert.equal((await route(tower, 'start', {requestId:'tower-beyond-final-201', protocol:TOWER_ABYSS_PROTOCOL, floorNo:201})).data.code, 'TOWER_COMPLETED');
  f.setClock(Date.parse('2026-11-30T00:00:00+09:00'));
  const nextWeek = (await route(tower, 'status')).data;
  assert.deepEqual([nextWeek.progress.currentFloor, nextWeek.progress.highestFloor, nextWeek.maxFloor], [1, 0, 200]);
});

test('a high collection coin bonus fits the existing settlement limit at floor 200', async t => {
  const f = await collectionFixture(t);
  f.setPower(150e9);
  f.pet.rewardBonuses.coinPercent = 500;
  await f.write(PET_CMS_KEY, f.pets);
  const top = proposal.floors.at(-1);
  const tower = await operatingTowerFixture(f, {floorNo:200, maxFloor:200, monsterPower:top.power, rewardCoin:top.coin});
  const ticket = {requestId:'tower-200-large-bonus', protocol:TOWER_ABYSS_PROTOCOL, floorNo:200};
  const start = await route(tower, 'start', ticket);
  assert.equal(start.status, 200, start.data.error);
  assert.equal(start.data.result, 'WIN');
  const before = await f.coin();
  f.setClock(start.data.settlement.notBefore);
  assert.equal((await route(tower, 'finish', ticket)).data.reward, TOWER_MAX_CLEAR_COIN);
  assert.equal(await f.coin() - before, TOWER_MAX_CLEAR_COIN);
});
