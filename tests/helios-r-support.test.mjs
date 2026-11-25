import test from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { createPveBattleV2, createPvpBattleV2 } from '../functions/_battle_v2_preview.js';
import { readHeliosROwners, attachHeliosRSupport } from '../functions/_helios_r_support.js';
import { HELIOS_R_SUPPORT, hasHeliosRSupport } from '../shared/helios-r-support-v1.mjs';
import { VEHICLE_SUPPORTS } from '../shared/mercenary-vehicle-support-v1.mjs';
import { createCooperativeBattle } from '../functions/_cooperative_battle.js';
import { fixture, coopSquads } from './helpers/cooperative-fixture.mjs';
import { mercenaryFixture } from './helpers/mercenary-db.mjs';
import { releasedMercenaryFormation, saveMercenaryLoadout } from '../functions/_mercenary_account.js';
import { isProductionFile } from '../scripts/prepare-production-assets.mjs';
import base from '../preview/equipment-sets-v3-20261019/fixture-pve.json' with {type: 'json'};

const merc = fixture.mercenaries.find(row => row.code === 'V-004');
const heukwol = fixture.mercenaries.find(row => row.code === 'V-048');
const mark = (row, id = 1) => attachHeliosRSupport(new Map([[id, row]]), new Set([id])).get(id);
const cards = base.cards.map(card => ({...card, power: 400000, base_power: 400000}));
const pvp = (a, b, seed = 773) => createPvpBattleV2({attackerCards: cards, defenderCards: cards,
  attackerMercenary: a, defenderMercenary: b, seed});
const pve = (a, seed = 773) => createPveBattleV2({cards, mercenary: a, seed,
  monster: {...base.monster, battle_power: 170000, pve_hp_percent: 12000}});
const firstHit = battle => battle.result.timeline.find(e =>
  e.actorId === 'A:MERCENARY:' + merc.code && e.type === 'TURN' && !e.dodge);
const dealt = e => e.damage + e.absorbed;

test('all five current stat tiers deliver progressively larger uncapped hits against the same monster', () => {
  const control = firstHit(pve(merc));
  let previous = dealt(control);
  for (const spec of VEHICLE_SUPPORTS) {
    const hit = firstHit(pve({...merc,vehicleSupport:{vehicle:spec.vehicle,version:spec.version,ownerId:1}}));
    assert.equal(hit.targetId,control.targetId);
    assert.equal(hit.seq,control.seq);
    assert.ok(dealt(hit)>previous);
    assert.ok(Math.abs(dealt(hit)-dealt(control)*(100+spec.attackPercent)/100)<2);
    previous=dealt(hit);
  }
});

test('only an owned, active, equipped Helios-R grants the snapshot, for single and dual rosters', async () => {
  const db = new DatabaseSync(':memory:');
  try {
    db.exec(`CREATE TABLE user_garage_loadout(user_id INTEGER,garage_id INTEGER);
      CREATE TABLE user_garage_vehicles(user_id INTEGER,garage_id INTEGER);
      CREATE TABLE character_garage_items(id INTEGER,code TEXT,is_active INTEGER);
      INSERT INTO character_garage_items VALUES(37,'HELIOS_R',1),(38,'OTHER',1),(39,'HELIOS_R',0);
      INSERT INTO user_garage_vehicles VALUES(1,37),(2,37),(2,38),(4,39),(5,37),(6,37);
      INSERT INTO user_garage_loadout VALUES(1,37),(2,38),(3,37),(4,39),(6,37);`);
    const env = {HELIOS_R_BATTLE_SUPPORT: '1', DB: {prepare: sql => ({bind: (...args) => ({
      all: () => ({results: db.prepare(sql).all(...args)})
    })})}};
    const rosters = new Map([[1, [merc, heukwol]], [2, merc], [3, heukwol], [4, merc], [5, merc], [6, heukwol]]);
    const owners = await readHeliosROwners(env, rosters);
    assert.deepEqual([...owners].sort(), [1, 6]);
    const result = attachHeliosRSupport(rosters, owners);
    assert.deepEqual(result.get(1).map(m => m.vehicleSupport.ownerId), [1, 1]);
    assert.equal(result.get(6).vehicleSupport.ownerId, 6);
    assert.equal(result.get(2), merc);
    assert.equal(merc.vehicleSupport, undefined);
    assert.deepEqual(await readHeliosROwners({}, rosters), new Set());
    db.exec('DELETE FROM user_garage_loadout WHERE user_id=1');
    assert.equal((await readHeliosROwners(env, rosters)).has(1), false);
    assert.equal(result.get(1)[0].vehicleSupport.vehicle, 'HELIOS_R');
  } finally { db.close(); }
});

for (const [mode, simulate] of [['PvE', a => pve(a)], ['PvP', a => pvp(a, heukwol)]]) {
  test(mode + ' preserves the recorded v1 12% basic hit when a queued match is replayed', () => {
    const legacy = {...merc,vehicleSupport:{vehicle:'HELIOS_R',version:1,ownerId:1}};
    const off = simulate(merc), on = simulate(legacy);
    const first = firstHit(off), boosted = firstHit(on);
    assert.equal(first.targetId, boosted.targetId);
    assert.ok(Math.abs(dealt(boosted) - dealt(first) * 1.12) < 2);
    assert.equal(boosted.vehicleSupportHit, 'HELIOS_R');
    const tagged = on.result.timeline.filter(e => e.vehicleSupportHit);
    assert.ok(tagged.length > 1);
    assert.ok(tagged.every(e => e.type === 'TURN' && !e.dodge && dealt(e) > 0 && e.actorId === boosted.actorId));
    assert.deepEqual(simulate(legacy).result.timeline, on.result.timeline);
    assert.equal(off.result.timeline.some(e => e.vehicleSupportHit), false);
  });
}

test('both PvP owners can equip independently, misses and skill packets carry no hit flash', () => {
  const both = pvp(mark(merc), mark(heukwol, 2));
  const hits = both.result.timeline.filter(e => e.vehicleSupportHit);
  assert.deepEqual(new Set(hits.map(e => e.actorId)), new Set(['A:MERCENARY:V-004', 'B:MERCENARY:V-048']));
  assert.ok(hits.every(e => e.type === 'TURN' && !e.dodge && dealt(e) > 0));
  const defense = pvp(merc, mark(heukwol, 2)).result.timeline.filter(e => e.vehicleSupportHit);
  assert.ok(defense.length && defense.every(e => e.actorId.startsWith('B:')));
  const turns = Array.from({length: 20}, (_, i) => pvp(mark(merc), heukwol, i + 1).result.timeline).flat();
  const misses = turns.filter(e => e.actorId === 'A:MERCENARY:V-004' && e.type === 'TURN' && e.dodge);
  assert.ok(misses.length && misses.every(e => !e.vehicleSupportHit));
});

test('a shared side keeps each owner’s vehicle bound to their own actor', () => {
  const squads = coopSquads();
  squads[0].mercenary = mark(squads[0].mercenary, squads[0].ownerId);
  const {battleV2} = createCooperativeBattle({squads, seed: 42}).payload;
  const tags = battleV2.result.timeline.filter(e => e.vehicleSupportHit);
  const [own] = battleV2.teams.A.mercenaries.filter(hasHeliosRSupport);
  assert.equal(own.ownerId, squads[0].ownerId);
  assert.ok(tags.length && tags.every(e => e.actorId === own.id));
});

test('ordinary actors and incompatible replay snapshots are inert', () => {
  const vehicleSupport = mark(merc).vehicleSupport;
  for (const patch of [{isMercenary:false}, {ownerId:2}, {vehicleSupport:{...vehicleSupport, version:99}},
    {vehicleSupport:{...vehicleSupport, vehicle:'HELIOS'}}, {vehicleSupport:{...vehicleSupport, ownerId:0}}]) {
    assert.equal(hasHeliosRSupport({isMercenary:true, vehicleSupport, ...patch}), false);
  }
  assert.deepEqual(pve({...merc, vehicleSupport:{...vehicleSupport, version:0}}).result.timeline, pve(merc).result.timeline);
  assert.equal(HELIOS_R_SUPPORT.attackPercent, 10);
});

for (const postgres of [false, true]) {
  test((postgres ? 'PostgreSQL' : 'SQLite') + ' loads the car through the saved PvE and PvP formations', async t => {
    const f = await mercenaryFixture(t, {postgres});
    const garageSchema = `CREATE TABLE IF NOT EXISTS character_garage_items(id INTEGER PRIMARY KEY,code TEXT,is_active INTEGER);
      CREATE TABLE IF NOT EXISTS user_garage_vehicles(user_id INTEGER,garage_id INTEGER);
      CREATE TABLE IF NOT EXISTS user_garage_loadout(user_id INTEGER,garage_id INTEGER);`;
    if (postgres) await f.pg.exec(garageSchema);
    else f.DB.sql.exec(garageSchema);
    for (const sql of [
      "INSERT INTO character_garage_items(id,code,is_active) VALUES(37,'HELIOS_R',1)",
      'INSERT INTO user_garage_vehicles(user_id,garage_id) VALUES(7,37)',
      'INSERT INTO user_garage_loadout(user_id,garage_id) VALUES(7,37)',
      "INSERT INTO user_mercenary_cards_v1(user_id,mercenary_code,total_copies,duplicate_count,first_obtained_at,last_obtained_at) VALUES(7,'V-001',1,0,CURRENT_TIMESTAMP,CURRENT_TIMESTAMP)"
    ]) await f.p(sql).run();
    for (const mode of ['PVE','PVP']) {
      await saveMercenaryLoadout(f.env, f.user, {mode,mercenaryCodes:['V-001'],revision:0,requestId:crypto.randomUUID()});
      const read = () => releasedMercenaryFormation(f.env, f.user, mode);
      f.env.HELIOS_R_BATTLE_SUPPORT = '1';
      assert.deepEqual((await read()).mercenaries[0].vehicleSupport, mark(merc,7).vehicleSupport);
      delete f.env.HELIOS_R_BATTLE_SUPPORT;
      assert.equal((await read()).mercenaries[0].vehicleSupport, undefined);
    }
  });
}

test('the asset pack contains both runtime textures and keeps source art and review footage local', () => {
  const dir = 'assets/effects/helios-r-v1/';
  for (const name of ['vehicle.webp','turbine.webp']) assert.ok(isProductionFile(dir + name));
  for (const path of [dir + 'manifest.json', dir + 'originals/turbine.png', 'preview/helios-r-support-v1/index.html',
    'docs/qa/helios-r-20261125/pve.mp4']) assert.equal(isProductionFile(path), false);
});
