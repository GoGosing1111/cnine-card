import test from 'node:test';
import assert from 'node:assert/strict';
import {PGlite} from '@electric-sql/pglite';
import {defaultCoopSettings, eclipseCombat} from '../shared/cooperative-settings-v1.mjs';
import {COOP_SETTINGS_KEY, defaultCoopRewards} from '../shared/cooperative-rewards-v1.mjs';
import {COOP_ALL_DIFFICULTIES} from '../shared/cooperative-battleground-v1.mjs';
import {rollCoopRoster} from '../shared/cooperative-roster-v3.mjs';
import {LEGION_REGIONS_KEY, legionRegionDefaults, RUIN_DIFFICULTY} from '../shared/legion-regions-v1.mjs';
import {cooperativeEnemies} from '../functions/_cooperative_enemies.js';
import {createCoopRoom} from '../functions/_cooperative_room.js';
import {citadelEnemies} from '../functions/_legion_citadel_battle.js';
import {tierById} from '../functions/_legion_citadel_tiers.js';
import {createHuntSession, restoreHuntSession} from '../preview/sustained-hunt-v2/session.mjs';
import {legionBalanceSnapshot, profiles} from '../scripts/measure-legion-regions-20261008.mjs';
import {transcendCombat} from '../scripts/ops/coop-transcend-20261102.mjs';
import {inspectPolicies} from '../scripts/ops/challenger-pve-tiers-20261126.mjs';
import {OPERATION, retunedPolicies, applyChallengerTuning} from '../scripts/ops/challenger-pve-soften-20261126.mjs';

const launch = [365e9, 365e9, 365e9, 2900e9, 5160e9];
function launchRows() {
  const coop = {...defaultCoopSettings(), rewards: defaultCoopRewards(), mode: 'ON', revision: 15, encounterVersion: 3};
  coop.combat = transcendCombat(coop.combat);
  const eclipse = eclipseCombat();
  eclipse.monsters.forEach((m, i) => { m.power = launch[i]; });
  coop.combat.difficulties.push(eclipse);
  const region = {...legionRegionDefaults(), mode: 'ON', revision: 12};
  region.difficulties.push({...region.difficulties.at(-1), id: 'ruin', power: 1120e9, bossPower: 680e12, loot: {...RUIN_DIFFICULTY.loot}});
  return [[COOP_SETTINGS_KEY, coop], [LEGION_REGIONS_KEY, region]].map(([key, doc]) => ({key, value: JSON.stringify(doc)}));
}
test('the CMS update only changes the seven approved combat budgets and revisions', () => {
  const rows = launchRows(), beforeCoop = JSON.parse(rows[0].value), beforeRegion = JSON.parse(rows[1].value);
  const oldRoom = createCoopRoom({id: '0000000012', clientId: 'b'.repeat(20), user: {id: 1, nickname: '검수'}, seed: 17, now: 1000, difficulty: 'ECLIPSE', combat: beforeCoop.combat});
  const {coop, region} = retunedPolicies(rows);
  const target = [91.25e9, 91.25e9, 91.25e9, 2610e9, 4644e9];
  beforeCoop.combat.difficulties.at(-1).monsters.forEach((m, i) => { m.power = target[i]; });
  beforeCoop.revision++;
  Object.assign(beforeRegion.difficulties.at(-1), {power: 168e9, bossPower: 612e12});
  beforeRegion.revision++;
  assert.deepEqual(coop, beforeCoop);
  assert.deepEqual(region, beforeRegion);
  assert.deepEqual(oldRoom.combat.difficulties.at(-1).monsters.map(m => m.power), launch);
  const freshRows = [[COOP_SETTINGS_KEY, coop], [LEGION_REGIONS_KEY, region]].map(([key, doc]) => ({key, value: JSON.stringify(doc)}));
  assert.deepEqual(retunedPolicies(freshRows).region.difficulties, region.difficulties);
  const drifted = JSON.parse(rows[0].value);
  drifted.combat.difficulties.at(-1).monsters[1].power++;
  assert.throws(() => retunedPolicies([{...rows[0], value: JSON.stringify(drifted)}, rows[1]]), /Unexpected live combat value/);
});

test('rolled Eclipse species have a quarter of their launch HP in wave one and 90% in later waves', () => {
  const source = JSON.parse(launchRows()[0].value).combat.difficulties.at(-1);
  const eclipse = COOP_ALL_DIFFICULTIES.find(d => d.id === 'ECLIPSE');
  for (const seed of [13, 29, 7919, 951773]) {
    const roster = rollCoopRoster(seed);
    const old = cooperativeEnemies(eclipse, source.monsters, undefined, roster);
    const next = cooperativeEnemies(eclipse, eclipseCombat().monsters, undefined, roster);
    const prev = [...old.initial, ...old.pending], curr = [...next.initial, ...next.pending];
    curr.forEach((m, i) => {
      const ratio = i < 3 ? .25 : .90;
      assert.equal(m.id, prev[i].id);
      assert.ok(Math.abs(m.maxHp - prev[i].maxHp * ratio) <= 16);
      assert.ok(Math.abs(m.maxShield - prev[i].maxShield * ratio) <= 16);
    });
  }
  const crucible = tierById('crucible'), throne = tierById('throne');
  assert.equal(crucible.power, 2880 * .80);
  assert.equal(crucible.boss, 22272 * .85);
  assert.equal(throne.power, 48);
  assert.equal(throne.boss, 192);
  const field = citadelEnemies('crucible');
  assert.ok(field.initial.every(m => m.hp === m.maxHp));
  assert.equal(field.sustained.durationMs, 300_000);
  assert.equal(field.sustained.continuousUntilMs, 420_000);
});

test('new Ruin runs give 30 seconds for the boss, old runs keep 25 seconds, and both use the same seven-minute limit', () => {
  const options = {snapshot: legionBalanceSnapshot(profiles.at(-1)), regionId: 'coast', difficulty: 'ruin', seed: 7919};
  for (const at of [390_000, 395_000]) {
    const regionDifficulty = {power: 1000, bossPower: 1000, ...(at === 395_000 ? {huntDurationMs: at, bossLimitMs: 25_000} : {})};
    const run = createHuntSession({...options, regionDifficulty});
    assert.equal(run.payload.battleV2.result.timeline.find(e => e.finalBoss).combatAtMs, at);
    const saved = restoreHuntSession(run.exportState()).exportState();
    assert.equal(saved.policy.huntDurationMs, at);
    assert.equal(saved.policy.bossLimitMs, 420_000 - at);
    assert.equal(saved.timeLimit, 420_000);
  }
  assert.throws(() => createHuntSession({...options, difficulty: 'calamity', regionDifficulty: {power: 1000, bossPower: 1000, huntDurationMs: 390_000}}), /INVALID_SUSTAINED_ENCOUNTER/);
});

test('the live update rejects stale settings, rolls back every write on failure and replays once', async t => {
  const pg = new PGlite();
  t.after(() => pg.close());
  await pg.exec(`CREATE TABLE app_meta(key text PRIMARY KEY,value text,updated_at text);
    CREATE TABLE users(id integer,role text,status text);INSERT INTO users VALUES(1,'OWNER','ACTIVE');
    CREATE TABLE admin_logs(id serial PRIMARY KEY,admin_id integer,action_type text,target_type text,target_id text,before_data text,after_data text);`);
  for (const {key, value} of launchRows()) await pg.query('INSERT INTO app_meta(key,value) VALUES($1,$2)', [key, value]);
  let failReceipt = false;
  const db = {async query(sql, args) {
    if (failReceipt && sql.startsWith('INSERT INTO app_meta')) throw Error('injected receipt failure');
    const r = await pg.query(sql, args);
    return {...r, rowCount: r.affectedRows ?? r.rows.length};
  }};
  const original = await inspectPolicies(db), args = {expectedHash: original.hash, sourceCommit: 'a'.repeat(40)};
  await assert.rejects(applyChallengerTuning(db, {...args, expectedHash: 'b'.repeat(64)}), /CMS settings changed/);
  assert.equal((await applyChallengerTuning(db, args)).dryRun, true);
  failReceipt = true;
  await assert.rejects(applyChallengerTuning(db, {...args, dryRun: false}), /injected receipt failure/);
  assert.equal((await inspectPolicies(db)).hash, original.hash);
  assert.equal((await pg.query('SELECT id FROM admin_logs')).rows.length, 0);
  failReceipt = false;
  const saved = await applyChallengerTuning(db, {...args, dryRun: false});
  const replay = await applyChallengerTuning(db, {...args, dryRun: false});
  assert.equal(replay.replayed, true);
  assert.deepEqual(replay.receipt, saved.receipt);
  assert.equal((await pg.query('SELECT id FROM admin_logs')).rows.length, 1);
  assert.equal((await pg.query('SELECT key FROM app_meta WHERE key=$1', [OPERATION])).rows.length, 1);
});
