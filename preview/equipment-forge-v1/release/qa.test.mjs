import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { PGlite } from '@electric-sql/pglite';
import { __postgresCompatTest } from '../../../functions/_postgres_d1_compat.js';
import { readForgePreparationInventory } from '../../../functions/_equipment_forge_preparation.js';
import { validateRates, assessLaunch } from './policy.mjs';
import { createCommand, visualReceipt, ForgeCommandSession } from './server-receipt.mjs';
import { checkPreparation } from './check.mjs';
import { EQUIPMENT_POWER_STANDARD } from '../../../shared/equipment-mercenary-power-v1.mjs';

const draft = () => JSON.parse(readFileSync(new URL('./launch-draft.json', import.meta.url)));
const command = (kind = 'enhance', extra = {}) => createCommand({ kind, instanceId: '101', quoteId: 'server-quote-1',
  policyRevision: 'policy-qa-1', expectedInstanceVersion: 7, ...(kind === 'enhance' ? { useProtection: false } : { recordId: 'lost-101' }), ...extra }, () => 'request-qa-1');
const item = { instanceId: '101', equipmentId: '6', name: '검수 장비', image: '/assets/qa-weapon.png', grade: 'MYTHIC', level: 7, status: 'owned' };
function receipt(cmd = command(), outcome = 'success', protectionApplied = false) {
  return { schemaVersion: 1, authority: 'SERVER', status: 'COMPLETED', accountId: '20', requestId: cmd.requestId,
    kind: cmd.kind, policyRevision: cmd.policyRevision, outcome, protectionApplied,
    before: { ...item, status: cmd.kind === 'restore' ? 'destroyed' : 'owned' },
    after: { ...item, level: outcome === 'success' ? 8 : 7, status: outcome === 'destroy' && !protectionApplied ? 'destroyed' : 'owned' },
    recordId: outcome === 'destroy' && !protectionApplied || cmd.kind === 'restore' ? 'lost-101' : null };
}

test('final approved presentation stays byte-identical and the release draft cannot activate production', () => {
  const result = checkPreparation();
  assert.deepEqual(result.errors, []); assert.equal(result.preparationReady, true);
  assert.equal(result.visualApproved, true); assert.ok(result.verifiedFiles >= 20);
  assert.equal(result.launchReady, false); assert.equal(result.liveEnabled, false);
  assert.equal(result.mutationRuntimeImplemented, false);
  for (const field of ['stages', 'costs', 'restorationLevel']) assert.equal(draft().policy[field], null);
  assert.deepEqual(draft().policy.powerScaling, EQUIPMENT_POWER_STANDARD);
  assert.equal(draft().policyApproved, false); assert.equal(draft().activationRequested, false);
});

test('release rates enforce exactly three outcomes, integer basis points, the 10% floor and 100% total', () => {
  assert.deepEqual(validateRates({ success: 10, maintain: 44.45, destroy: 45.55 }), { success: 10, maintain: 44.45, destroy: 45.55 });
  for (const rates of [
    { success: 9.99, maintain: 40, destroy: 50.01 }, { success: 10, maintain: 40, destroy: 49 },
    { success: 10, maintain: 40, destroy: 50, protected: 0 }, { success: '10', maintain: 40, destroy: 50 },
    { success: 10.001, maintain: 39.999, destroy: 50 }, { success: NaN, maintain: 40, destroy: 50 },
  ]) assert.throws(() => validateRates(rates));
});

test('UI approval cannot silently approve economics or enable an incomplete launch', () => {
  const value = draft(); value.liveEnabled = true;
  const result = assessLaunch(value);
  assert.equal(result.ready, false); assert.ok(result.errors.some(error => error.includes('운영 활성화')));
  assert.ok(result.pending.includes('실제 운영 활성화 지시'));
  value.liveEnabled = false; value.policy.stages = [{ fromLevel: 1, rates: { success: 100, maintain: 0, destroy: 0 } }];
  assert.ok(assessLaunch(value).errors.some(error => error.includes('단계')));
});

test('box, draw and shop acquisition cannot pass the protection release check', () => {
  for (const kind of ['BOX', 'GACHA', 'SHOP', 'BLACK_MIRACLE_PACK']) {
    const value = draft(); value.policy.protectionSources = [{ kind, contentId: 'qa', quantity: 1, ratePercent: .01 }];
    assert.ok(assessLaunch(value).errors.length > 0);
  }
  const value = draft(); value.fixedRules.boxAcquisition = true;
  assert.ok(assessLaunch(value).errors.length > 0);
});

test('commands carry individual identity and server quote versions, never client probabilities or prices', () => {
  const cmd = command(); assert.equal(cmd.instanceId, '101'); assert.ok(Object.isFrozen(cmd));
  for (const field of ['roll', 'success', 'cost', 'level', 'accountId', 'quantity']) assert.throws(() => command('enhance', { [field]: 1 }));
  for (const instanceId of [0, 101, '-1', '1 OR 1=1']) assert.throws(() => command('enhance', { instanceId }));
  assert.throws(() => command('restore', { recordId: '' }));
});

test('server outcomes select the five approved effects without a client lottery', () => {
  for (const outcome of ['success', 'maintain', 'destroy']) assert.equal(visualReceipt(receipt(command(), outcome), command(), '20').visual, outcome);
  const shield = command('enhance', { useProtection: true });
  assert.equal(visualReceipt(receipt(shield, 'destroy', true), shield, '20').visual, 'protected');
  const restore = command('restore'), restored = receipt(restore, 'restore'); restored.after.level = 0;
  assert.equal(visualReceipt(restored, restore, '20').after.level, 0);
  assert.equal(visualReceipt(restored, restore, '20').visual, 'restore');
});

test('foreign, incomplete, inconsistent and unsafe receipts never start an effect', () => {
  for (const mutate of [
    r => { r.accountId = '21'; }, r => { r.requestId = 'different'; }, r => { r.policyRevision = 'other'; },
    r => { r.authority = 'PREVIEW'; }, r => { r.status = 'PENDING'; }, r => { r.after.instanceId = '102'; },
    r => { r.after.level = 10; }, r => { r.after.status = 'destroyed'; }, r => { r.protectionApplied = true; },
    r => { r.before.image = 'javascript:alert(1)'; }, r => { r.before.image = '/assets/../private.png'; },
  ]) { const value = receipt(); mutate(value); assert.throws(() => visualReceipt(value, command(), '20')); }
  const lost = receipt(command(), 'destroy'); lost.recordId = null;
  assert.throws(() => visualReceipt(lost, command(), '20'));
});

test('double clicks share one in-flight request and isolate caller mutations', async () => {
  let calls = 0, finish; const cmd = command();
  const session = new ForgeCommandSession({ accountId: '20', request: async input => {
    calls++; input.body.instanceId = '999'; await new Promise(resolve => { finish = resolve; }); return receipt(cmd);
  } });
  const a = session.send(cmd), b = session.send(cmd); assert.equal(a, b);
  await Promise.resolve(); assert.equal(calls, 1);
  const pending = session.pending; pending.instanceId = '999'; assert.equal(session.pending.instanceId, '101');
  finish(); const done = await a; assert.equal(done.visual.before.id, '101'); assert.equal(session.pending, null);
});

test('lost responses retain the same key, block new rolls and recover by receipt lookup', async () => {
  const requests = [], cmd = command();
  const session = new ForgeCommandSession({ accountId: '20', request: async input => {
    requests.push(input); if (input.method === 'POST') throw new Error('response lost'); return receipt(cmd);
  } });
  await assert.rejects(session.send(cmd), /response lost/);
  assert.equal(session.pending.requestId, cmd.requestId);
  assert.throws(() => session.send({ ...cmd, requestId: 'new-roll' }), /이전 요청/);
  const result = await session.recover(); assert.equal(result.committed, true); assert.equal(session.pending, null);
  assert.equal(requests.length, 2); assert.equal(requests[1].method, 'GET'); assert.ok(!requests[1].body);
});

test('malformed and cross-account recovery does not erase an unresolved operation', async () => {
  let response = { authority: 'SERVER', accountId: '21', requestId: 'request-qa-1', status: 'NOT_COMMITTED' };
  const session = new ForgeCommandSession({ accountId: '20', request: async () => response });
  await assert.rejects(session.send(command())); assert.ok(session.pending);
  response = { ...response, accountId: '20' };
  assert.equal((await session.recover()).committed, false); assert.equal(session.pending, null);
});

test('PostgreSQL inventory pages keep duplicates separate, isolate owners and preserve loadouts and balances', async () => {
  const pg = new PGlite(), queries = [];
  try {
    await pg.exec(`
      CREATE TABLE users(id BIGINT PRIMARY KEY,coin BIGINT);
      CREATE TABLE character_equipment_items(id BIGINT PRIMARY KEY,code TEXT,name TEXT,slot TEXT,subtype TEXT,rarity TEXT,image_url TEXT,total_power BIGINT,pve_power BIGINT,pvp_power BIGINT,is_active INTEGER,is_public INTEGER);
      CREATE TABLE user_equipment_instances(id BIGINT PRIMARY KEY,user_id BIGINT,equipment_id BIGINT,acquired_at TEXT);
      CREATE TABLE user_equipment_loadout(user_id BIGINT,slot TEXT,instance_id BIGINT UNIQUE);
      INSERT INTO users VALUES(20,5000000000),(21,1000);
      INSERT INTO character_equipment_items VALUES(6,'QA_WEAPON','장비','WEAPON','RIFLE','MYTHIC','assets/qa-weapon.png',100,90,10,1,1),(7,'HIDDEN','비공개','WEAPON','RIFLE','MYTHIC','assets/hidden.png',100,90,10,1,0),(8,'INACTIVE','비활성','TOP','TOP','RARE','assets/inactive.png',20,18,2,0,1);
      INSERT INTO user_equipment_instances VALUES(101,20,6,'2026-09-12'),(102,20,6,'2026-09-12'),(103,20,6,'2026-09-12'),(104,21,6,'2026-09-12'),(105,20,7,'2026-09-12'),(106,20,8,'2026-09-12');
      INSERT INTO user_equipment_loadout VALUES(20,'WEAPON',102),(21,'WEAPON',104);
    `);
    const db = new __postgresCompatTest.PostgresD1Database({ async query(input) {
      const sql = typeof input === 'string' ? input : input.text, values = typeof input === 'string' ? [] : input.values || [];
      queries.push(sql); const result = await pg.query(sql, values); return { ...result, rowCount: result.affectedRows ?? result.rows.length };
    } });
    const first = await readForgePreparationInventory(db, '20', { limit: 2 });
    assert.deepEqual(first.items.map(row => row.instanceId), ['103', '102']); assert.equal(first.nextCursor, '102');
    assert.equal(first.items[1].equipped, true); assert.equal(first.items[0].equipped, false);
    assert.equal(first.items[0].enhancement, null); assert.equal(first.canEnhance, false);
    const second = await readForgePreparationInventory(db, 20, { beforeId: first.nextCursor, limit: 2 });
    assert.deepEqual(second.items.map(row => row.instanceId), ['101']); assert.equal(second.nextCursor, null);
    assert.deepEqual((await readForgePreparationInventory(db, '21')).items.map(row => row.instanceId), ['104']);
    await assert.rejects(readForgePreparationInventory(db, '20 OR 1=1'));
    await assert.rejects(readForgePreparationInventory(db, 20, { limit: 0 }));
    assert.ok(queries.every(sql => /^SELECT\b/i.test(sql.trim())));
    assert.equal(Number((await pg.query('SELECT COUNT(*) n FROM user_equipment_instances')).rows[0].n), 6);
    assert.equal(Number((await pg.query('SELECT COUNT(*) n FROM user_equipment_loadout')).rows[0].n), 2);
    assert.equal(Number((await pg.query('SELECT coin FROM users WHERE id=20')).rows[0].coin), 5000000000);
  } finally { await pg.close(); }
});
