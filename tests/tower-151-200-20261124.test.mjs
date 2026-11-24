import assert from 'node:assert/strict';
import {createHash, randomBytes} from 'node:crypto';
import test from 'node:test';
import proposal from '../docs/qa/tower-200-20261124/floor-plan.json' with {type:'json'};
import {fixture, PAIRS, plan as priorExtension, reviewSnapshot} from './helpers/tower-expansion-20261102.mjs';
import {jointFixture} from './helpers/joint-db.mjs';
import {collectionFixture} from './helpers/collection-bonuses-fixture.mjs';
import {operatingTowerFixture} from './helpers/tower-live-route.mjs';
import {TOWER_ABYSS_PROTOCOL, TOWER_MAX_CLEAR_COIN, towerAbyssStart} from '../functions/_tower_abyss.js';
import {buildTowerV3Battle, TOWER_V3_DRAFT} from '../functions/_tower_v3.js';
import {ensureTowerWeek} from '../functions/_tower_weekly.js';
import {PET_CMS_KEY} from '../shared/pet-cms-v1.mjs';
import {towerMonsterArt} from '../shared/tower-monsters-20261022.mjs';
import {UNIQUE_MERCENARY_EQUIPMENT} from '../shared/mercenary-unique-equipment-v1.mjs';
import {buildMercenaryEquipmentRuntime} from '../functions/_mercenary_equipment_v2.js';

function uniqueWeapon(tier) {
  const g = UNIQUE_MERCENARY_EQUIPMENT.find(g => g.tier === tier && g.slot === 'WEAPON');
  return buildMercenaryEquipmentRuntime([{instance_id:42, equipment_id:42, code:g.code, name:g.name, slot:g.slot,
    rarity:g.rarity, total_power:g.totalPower, pve_power:g.pvePower, pvp_power:g.pvpPower}], 7, 'PVE', 1);
}

test('the 50 new CMS rows follow the established floor rewards and increasingly strong guardians', () => {
  const {floors} = proposal;
  assert.equal(proposal.previousMaxFloor, priorExtension.maxFloor);
  assert.equal(proposal.maxFloor, 200);
  assert.equal(floors.length, 50);
  let previousPower = priorExtension.floors.at(-1).power;
  let ordinaryCoin = priorExtension.floors.at(-2).coin;
  let guardianCoin = priorExtension.floors.at(-1).coin;
  const priorCoins = new Map(priorExtension.floors.map(r => [r.floor, r.coin]));
  for (const [index, row] of floors.entries()) {
    assert.equal(row.floor, 151 + index);
    assert.equal(row.boss, Number(row.floor % 10 === 0));
    assert(Number.isSafeInteger(row.power) && row.power > previousPower);
    assert(Number.isSafeInteger(row.coin) && row.coin > (row.boss ? guardianCoin : ordinaryCoin));
    assert.equal(BigInt(row.coin) * 10n, BigInt(priorCoins.get(row.floor - 10)) * 13n);
    priorCoins.set(row.floor, row.coin);
    assert(fixture.monsters.some(m => Number(m.id) === row.monsterId && Number(m.is_active) && Number(m.tower_enabled)));
    assert(towerMonsterArt(row.monsterId)?.battleSprite);
    previousPower = row.power;
    if (row.boss) guardianCoin = row.coin;
    else ordinaryCoin = row.coin;
  }
  for (const row of floors.slice(0, 9)) {
    const earlierCurve = Math.round(9e9 * (15 / 9) ** ((row.floor - 150) / 10) / 100) * 100;
    assert.equal(row.power, earlierCurve);
  }
  assert(floors[9].power >= 4 * floors[8].power);
  assert.deepEqual(floors.filter(row => row.boss).map(row => row.power), [60e9, 90e9, 250e9, 550e9, 1300e9]);
  assert.deepEqual(floors.filter(row => row.boss).map(row => row.coin),
    [11_424_400_000_000, 14_851_720_000_000, 19_307_236_000_000, 25_099_406_800_000, 32_629_228_840_000]);
  assert.equal(floors.reduce((total, row) => total + row.coin, 0), proposal.totalNewBaseCoin);
  assert.equal(proposal.totalNewBaseCoin, 118932764775968);
});

test('the expanded combat limit is confined to floors 151 through 200', () => {
  const snapshot = reviewSnapshot();
  snapshot.mercenaries[1].equipment = uniqueWeapon(3);
  const config = {...TOWER_V3_DRAFT, maxTier:201, powerGrowth:1.001};
  const run = (tier, power) => buildTowerV3Battle({snapshot, tier, seed:1, config, operatingFloor:{id:69, power}});
  for (const [tier, power] of [[150, 1e10 + 1], [159, 1e11 + 1], [179, 3e11 + 1], [201, 1e10 + 1], [200, 1.3e12 + 1], [151, 0], [200, NaN]]) {
    assert.throws(() => run(tier, power), {code:'TOWER_V3_CONFIG'});
  }
  assert.equal(run(150, 1e10).tier, 150);
  assert.equal(run(159, 1e11).tier, 159);
  assert.equal(run(200, 1.3e12).continuousEncounter.total, 28);
});

test('the 160F jump reaches all 28 enemies and carries onto ordinary floors above the gate', () => {
  const snapshot = reviewSnapshot({codes:PAIRS[1], power:1000000});
  const config = {...TOWER_V3_DRAFT, maxTier:201, powerGrowth:1.001, rulesVersion:TOWER_ABYSS_PROTOCOL};
  for (const tier of [159, 160, 161, 170, 179, 201]) {
    const row = proposal.floors.find(f => f.floor === tier);
    const operatingFloor = row ? {id:row.monsterId, power:row.power} : {id:19, power:1e10};
    const battle = buildTowerV3Battle({snapshot, tier, seed:1, config, operatingFloor});
    const upper = tier >= 160 && tier <= 200;
    assert.equal(battle.rulesVersion, upper ? TOWER_ABYSS_PROTOCOL + '_UPPER_2' : TOWER_ABYSS_PROTOCOL);
    assert.equal(battle.battleV2.encounter.forcedMonsterEvery, upper ? 2 : 6);
    for (const enemy of battle.continuousEncounter.instances) {
      assert.equal(enemy.pveBuffs.difficultyHpPercent, upper ? 600 : 100);
      assert.equal(enemy.pveBuffs.difficultyShieldPercent, upper ? 150 + 2 * (tier - 160) : 0);
      assert.equal(enemy.pveBuffs.difficultyAttackPercent, upper ? 150 : 100);
      assert.equal(enemy.pveBuffs.difficultySpeedPercent, upper ? 300 : 100);
      assert.equal(enemy.attackCount, upper ? 4 : 1);
    }
    if (tier === 159 || tier === 160) assert.equal(battle.success, tier === 159);
  }
  const prototype = buildTowerV3Battle({snapshot, tier:160, seed:1, config});
  assert.equal(prototype.rulesVersion, config.rulesVersion);
  assert.equal(prototype.continuousEncounter.instances[0].attackCount, 1);
});

async function route(tower, name, body) {
  const response = await tower.handle('tower/' + name, new Request('https://game.example/api/tower/' + name, {
    method:body ? 'POST' : 'GET', headers:{authorization:'Bearer local-account-7', 'content-type':'application/json'},
    body:body && JSON.stringify(body)
  }));
  return {status:response.status, data:await response.json()};
}

test('unique floor opponents use fixed tier stats and recognize genuine single-slot and dual-slot loadouts', () => {
  const snapshot = reviewSnapshot();
  const config = {...TOWER_V3_DRAFT, maxTier:200, powerGrowth:1.001};
  const fight = (floor, party) => {
    const row = proposal.floors.find(r => r.floor === floor);
    return buildTowerV3Battle({tier:floor, seed:7, config, snapshot:party, operatingFloor:{id:row.monsterId, power:row.power}});
  };
  for (const [floor, health, attack, shield, speed] of [[180,950,260,245,390],[190,1000,375,270,425],[200,1200,550,300,480]]) {
    const mercenary = {...snapshot.mercenaries[0], equipment:uniqueWeapon(3)};
    const {mercenaries, ...legacy} = snapshot;
    const battle = fight(floor, {...legacy, mercenary});
    assert.equal(battle.rulesVersion, config.rulesVersion + '_UNIQUE_1');
    assert.equal(battle.battleV2.encounter.forcedMonsterEvery, 2);
    for (const enemy of battle.continuousEncounter.instances) {
      const stats = enemy.pveBuffs;
      assert.deepEqual([stats.difficultyHpPercent, stats.difficultyAttackPercent, stats.difficultyShieldPercent,
        stats.difficultySpeedPercent, enemy.attackCount], [health,attack,shield,speed,5]);
    }
  }
  const weapon = uniqueWeapon(3);
  for (const equipment of [{...weapon, mode:'PVP'}, {...weapon, items:[{...weapon.items[0], slot:'SHOES'}]},
    {...weapon, items:[{...weapon.items[0], code:'HUNT_COAST_UNIQUE'}]},
    {...weapon, items:[{...weapon.items[0], code:'MERC_UQ_13_FAKE'}]}, {...weapon, items:[]}]) {
    const party = {...snapshot, mercenaries:snapshot.mercenaries.map(m => ({...m, equipment}))};
    assert.throws(() => fight(180, party), {code:'TOWER_UNIQUE_REQUIRED'});
  }
});

function equipRouteTestParty(f) {
  f.setPower(900e9);
  const baseDeck = f.deps.raidDeckPower;
  const {mercenaries} = reviewSnapshot();
  const equip = tier => { mercenaries[1].equipment = tier ? uniqueWeapon(tier) : null; };
  equip(3);
  f.deps.raidDeckPower = async (...args) => ({...await baseDeck(...args), mercenaries});
  return equip;
}

test('operating entry checks equipped PVE gear at all three boundaries and preserves an accepted encounter on reconnect', async t => {
  const f = await jointFixture(t, {postgres:true});
  const equip = equipRouteTestParty(f);
  const tower = await operatingTowerFixture(f, {floorNo:179, maxFloor:200});
  for (const [floor, required] of [[179, 0], [180, 1], [189, 1], [190, 2], [199, 2], [200, 3]]) {
    await tower.setFloor(floor);
    equip(Math.max(0, required - 1));
    const status = (await route(tower, 'status')).data;
    assert.equal(status.floor.requiredUniqueTier ?? 0, required);
    const ticket = {requestId:'tower-check-unique-' + floor, protocol:TOWER_ABYSS_PROTOCOL, floorNo:floor};
    const before = await f.coin();
    if (required) {
      const denied = await route(tower, 'start', {...ticket, requiredUniqueTier:3, equipment:uniqueWeapon(3)});
      assert.deepEqual([denied.status, denied.data.code], [409, 'TOWER_UNIQUE_REQUIRED']);
      assert.match(denied.data.error, new RegExp(required + '단계'));
      assert.equal((await route(tower, 'pending')).data.pending, null);
      assert.equal((await route(tower, 'status')).data.progress.highestFloor, floor - 1);
      assert.equal(await f.coin(), before);
    }
    equip(required);
    const first = await route(tower, 'start', ticket);
    assert.equal(first.status, 200, first.data.error);
    equip(0);
    assert.equal((await route(tower, 'start', ticket)).data.requestId, ticket.requestId);
    f.setClock(first.data.settlement.notBefore);
    const settled = await route(tower, 'finish', ticket);
    assert.deepEqual([settled.status, settled.data.result, settled.data.nextFloor], [200, 'WIN', floor + 1]);
    assert.equal(await f.coin() - before, settled.data.reward);
  }
});

test('a completed 150F account ascends all 50 additional floors through normal start and finish', async t => {
  const f = await jointFixture(t, {postgres:true});
  equipRouteTestParty(f);
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
    if (row.floor === 180) {
      const pastFloor = await route(tower, 'start', {...ticket, requestId:'tower-already-cleared-180'});
      assert.deepEqual([pastFloor.status, pastFloor.data.code], [409, 'TOWER_FLOOR_CHANGED']);
    }
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
  equipRouteTestParty(f);
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

test('long upper-floor timelines retain every event on reconnect and settle once, with bounded record sizes', async t => {
  const f = await jointFixture(t);
  const tower = await operatingTowerFixture(f, {floorNo:159, maxFloor:200});
  const coin = proposal.floors.find(row => row.floor === 160).coin;
  const start = (floorNo, requestId, timeline) => towerAbyssStart(f.env, f.user,
    {floorNo, requestId, protocol:TOWER_ABYSS_PROTOCOL}, async () => ({
      seasonId:1, rewardCoin:coin, magic:{enabled:false, amount:0}, response:{
        floorNo, result:'WIN', playerPower:1e9, monsterPower:60e9, elapsedCombatMs:8000, battleV2:{result:{timeline}}
      }
    }), {now:f.deps.now});
  const event = {type:'SKILL_CHIP_HIT', actorId:'A:SUIT', hits:Array.from({length:12}, (_, i) => ({
    targetId:'B:ENCOUNTER:' + i, damage:2000000 + i, targetHpAfter:100000000 - i, absorbed:700000
  }))};
  const timeline = Array(Math.ceil(4100000 / Buffer.byteLength(JSON.stringify(event)))).fill(event);
  const digest = events => createHash('sha256').update(JSON.stringify(events)).digest('hex');
  await assert.rejects(start(159, 'tower-long-record-159', timeline), {code:'TOWER_RECORD_SIZE'});
  await tower.setFloor(160);
  await assert.rejects(start(160, 'tower-raw-record-limit', [{type:'TURN', label:'x'.repeat(16000001)}]), {code:'TOWER_RECORD_SIZE'});
  await assert.rejects(start(160, 'tower-packed-record-limit', [{type:'TURN', label:randomBytes(3100000).toString('base64')}]), {code:'TOWER_RECORD_SIZE'});
  assert.equal((await route(tower, 'pending')).data.pending, null);

  const requestId = 'tower-long-record-160';
  const before = await f.coin();
  const first = await start(160, requestId, timeline);
  const resumed = (await route(tower, 'pending')).data.pending;
  assert.equal(digest(resumed.battleV2.result.timeline), digest(timeline));
  f.setClock(first.settlement.notBefore);
  for (let i = 0; i < 2; i++) {
    const {status, data} = await route(tower, 'finish', {requestId});
    assert.equal(status, 200);
    assert.equal(data.reward, coin);
    assert.equal(digest(data.battleV2.result.timeline), digest(timeline));
  }
  assert.equal(await f.coin() - before, coin);
});
