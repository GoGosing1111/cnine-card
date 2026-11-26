import assert from 'node:assert/strict';
import {COOP_SETTINGS_KEY} from '../../shared/cooperative-rewards-v1.mjs';
import {eclipseCombat, validateCoopCombat} from '../../shared/cooperative-settings-v1.mjs';
import {LEGION_REGIONS_KEY, RUIN_DIFFICULTY} from '../../shared/legion-regions-v1.mjs';
import {validateRegionPolicy} from '../../functions/_legion_regions.js';
import {inspectPolicies} from './challenger-pve-tiers-20261126.mjs';

export const OPERATION = 'ops:challenger-pve-soften:20261126:v1';

function tunePower(row, field, original, target) {
  assert.ok(row[field] === original || row[field] === target, 'Unexpected live combat value for ' + (row.key || row.id) + '.' + field);
  row[field] = target;
}

export function retunedPolicies(rows) {
  const read = key => JSON.parse(rows.find(row => row.key === key).value);
  const coop = read(COOP_SETTINGS_KEY), region = read(LEGION_REGIONS_KEY);
  validateCoopCombat(coop.combat);
  validateRegionPolicy(region);
  const monsters = coop.combat.difficulties.find(row => row.id === 'ECLIPSE')?.monsters;
  const ruin = region.difficulties.find(row => row.id === 'ruin');
  assert.ok(monsters && ruin, 'The three challenger tiers must be released first');
  const launchPowers = [365_000_000_000, 365_000_000_000, 365_000_000_000, 2_900_000_000_000, 5_160_000_000_000];
  const target = eclipseCombat();
  for (const [index, monster] of monsters.entries()) {
    assert.equal(monster.key, target.monsters[index].key);
    tunePower(monster, 'power', launchPowers[index], target.monsters[index].power);
  }
  tunePower(ruin, 'power', 1_120_000_000_000, RUIN_DIFFICULTY.power);
  tunePower(ruin, 'bossPower', 680_000_000_000_000, RUIN_DIFFICULTY.bossPower);
  coop.revision++;
  region.revision++;
  validateCoopCombat(coop.combat);
  validateRegionPolicy(region);
  return {coop, region};
}

export async function applyChallengerTuning(db, {expectedHash, sourceCommit, dryRun = true}) {
  assert.match(expectedHash, /^[a-f0-9]{64}$/);
  assert.match(sourceCommit, /^[a-f0-9]{40}$/);
  const readReceipt = async () => (await db.query('SELECT value FROM app_meta WHERE key=$1', [OPERATION])).rows[0];
  const prior = await readReceipt();
  if (prior) return {replayed: true, receipt: JSON.parse(prior.value)};
  await db.query('BEGIN');
  try {
    await db.query("SET LOCAL lock_timeout='5s'");
    await db.query('SELECT pg_advisory_xact_lock(hashtext($1))', [OPERATION]);
    const concurrent = await readReceipt();
    if (concurrent) {
      await db.query('ROLLBACK');
      return {replayed: true, receipt: JSON.parse(concurrent.value)};
    }
    const source = await inspectPolicies(db, true);
    assert.equal(source.hash, expectedHash, 'CMS settings changed since rehearsal');
    const {coop, region} = retunedPolicies(source.rows);
    const completedAt = new Date().toISOString();
    coop.updatedAt = completedAt;
    for (const [key, doc] of [[COOP_SETTINGS_KEY, coop], [LEGION_REGIONS_KEY, region]]) {
      const old = source.rows.find(row => row.key === key);
      const updated = await db.query('UPDATE app_meta SET value=$1,updated_at=$2 WHERE key=$3 AND value=$4', [JSON.stringify(doc), completedAt, key, old.value]);
      assert.equal(updated.rowCount, 1);
    }
    const {rows: [owner]} = await db.query("SELECT id FROM users WHERE role='OWNER' AND status='ACTIVE' ORDER BY id LIMIT 1");
    assert.ok(owner);
    const receipt = {sourceCommit, completedAt, beforeHash: source.hash, coopRevision: coop.revision, regionRevision: region.revision};
    const {rows: [log]} = await db.query(
      'INSERT INTO admin_logs(admin_id,action_type,target_type,target_id,before_data,after_data) VALUES($1,$2,$3,$4,$5,$6) RETURNING id',
      [owner.id, 'OPS_CHALLENGER_PVE_SOFTEN', 'APP_META', OPERATION, JSON.stringify(source.rows.filter(row => row.key === COOP_SETTINGS_KEY || row.key === LEGION_REGIONS_KEY)), JSON.stringify(receipt)]
    );
    receipt.adminLogId = String(log.id);
    await db.query('INSERT INTO app_meta(key,value,updated_at) VALUES($1,$2,$3)', [OPERATION, JSON.stringify(receipt), completedAt]);
    await db.query(dryRun ? 'ROLLBACK' : 'COMMIT');
    return {replayed: false, dryRun, receipt};
  } catch (error) {
    await db.query('ROLLBACK');
    throw error;
  }
}
