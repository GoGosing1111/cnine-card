import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { ForgeSimulation, DEFAULT_RATES, PREVIEW_POLICY, validateRates, rollOutcome, displayedRates, canAcquireProtection, costAt } from './source/model.mjs';
import { SUCCESS_ATLAS, successFrameAt } from './source/success-v2.mjs';
const request = (id, roll = 0) => ({ itemId: 'demo-gold-ar', requestId: id, roll });
const snapshot = model => JSON.stringify({ items: model.items, wallet: model.wallet, records: model.records, history: model.history });

test('all 15 review stages have exactly three outcomes totaling 100%, with success >= 10%', () => {
  assert.equal(DEFAULT_RATES.length, 15);
  DEFAULT_RATES.forEach(row => { assert.deepEqual(Object.keys(row), ['success', 'maintain', 'destroy']); assert.deepEqual(validateRates(row), row); });
  assert.equal(PREVIEW_POLICY.liveEnabled, false);
});
test('rejects success under 10%, invalid totals, nonfinite values and excess precision', () => {
  for (const row of [ { success: 9.99, maintain: 80, destroy: 10.01 }, { success: 10, maintain: 50, destroy: 39 }, { success: NaN, maintain: 50, destroy: 50 }, { success: 50, maintain: -1, destroy: 51 }, { success: 100.1, maintain: 0, destroy: 0 }, { success: '10', maintain: 50, destroy: 40 }, { success: 10.001, maintain: 49.999, destroy: 40 } ]) assert.throws(() => validateRates(row));
  assert.deepEqual(validateRates({ success: 10, maintain: 44.45, destroy: 45.55 }), { success: 10, maintain: 44.45, destroy: 45.55 });
});
test('exact cumulative boundaries: success, then maintain, then destruction', () => {
  const rates = { success: 30, maintain: 55, destroy: 15 };
  assert.equal(rollOutcome(rates, 0), 'success');
  assert.equal(rollOutcome(rates, .299999), 'success');
  assert.equal(rollOutcome(rates, .3), 'maintain');
  assert.equal(rollOutcome(rates, .849999), 'maintain');
  assert.equal(rollOutcome(rates, .85), 'destroy');
  assert.equal(rollOutcome(rates, .99999999), 'destroy');
  for (const value of [-1, 1, Infinity, NaN, '0']) assert.throws(() => rollOutcome(rates, value));
  assert.equal(rollOutcome(DEFAULT_RATES[0], .9999999), 'success');
});
test('probability editor validates every row before changing any row', () => {
  const m = new ForgeSimulation(), old = structuredClone(m.rates), next = structuredClone(old);
  next[0] = { success: 90, maintain: 10, destroy: 0 }; next[14].success = 9;
  assert.throws(() => m.setRates(next)); assert.deepEqual(m.rates, old);
  next[14] = { success: 10, maintain: 45, destroy: 45 }; m.setRates(next); assert.deepEqual(m.rates, next);
  assert.throws(() => m.setRates(next.slice(1)));
});
test('protection is gameplay-only; no box or draw source can award it', () => {
  assert.equal(canAcquireProtection('GAMEPLAY'), true);
  for (const source of ['BOX', 'GACHA', 'PRIME_EQUIPMENT_SUPPLY_BOX', 'BLACK_MIRACLE_PACK', 'SHOP', undefined]) assert.equal(canAcquireProtection(source), false);
  assert.equal(PREVIEW_POLICY.boxAcquisition, false);
});
test('protection preserves the success rate and folds destruction into maintenance', () => {
  const original = { success: 30, maintain: 55, destroy: 15 };
  assert.deepEqual(displayedRates(original, true), { success: 30, maintain: 70, destroy: 0 });
  assert.deepEqual(displayedRates(original, false), original);
  assert.deepEqual(original, { success: 30, maintain: 55, destroy: 15 });
});
test('success raises precisely one stage and consumes review materials once', () => {
  const m = new ForgeSimulation(), wallet = { ...m.wallet }, cost = costAt(7);
  const r = m.enhance(request('success')); assert.equal(r.after.level, 8); assert.equal(r.before.level, 7);
  assert.equal(m.wallet.coins, wallet.coins - cost.coins); assert.equal(m.wallet.crystals, wallet.crystals - cost.crystals);
  assert.equal(m.wallet.protection, wallet.protection); assert.equal(m.records.length, 1);
});
test('maintenance preserves equipment and level, consumes materials, and does not create a destruction record', () => {
  const m = new ForgeSimulation(), r = m.enhance(request('maintain', .5));
  assert.equal(r.visual, 'maintain'); assert.equal(r.after.level, 7); assert.equal(r.after.status, 'owned');
  assert.equal(m.records.length, 1); assert.equal(m.wallet.coins, 12640000);
});
test('destruction removes usability and snapshots the exact item and pre-attempt level', () => {
  const m = new ForgeSimulation(), r = m.enhance(request('destroy', .99));
  assert.equal(r.after.status, 'destroyed'); assert.equal(m.records[0].id, r.recordId);
  assert.equal(m.records[0].item.level, 7); assert.equal(m.records[0].item.id, r.before.id);
  assert.equal(m.records[0].item.image, r.before.image);
  const before = snapshot(m); assert.throws(() => m.enhance(request('destroy-again', .3))); assert.equal(snapshot(m), before);
});
test('protected destruction consumes one seal and creates no lost-item record', () => {
  const m = new ForgeSimulation(), r = m.enhance({ ...request('shield', .99), protection: true });
  assert.equal(r.outcome, 'destroy'); assert.equal(r.visual, 'protected');
  assert.equal(r.after.status, 'owned'); assert.equal(r.after.level, 7); assert.equal(m.wallet.protection, 1); assert.equal(m.records.length, 1);
});
test('selected seal is not spent on a successful or maintained attempt in this explicitly provisional policy', () => {
  for (const roll of [0, .5]) { const m = new ForgeSimulation(); m.enhance({ ...request('shield-safe', roll), protection: true }); assert.equal(m.wallet.protection, 2); }
});
test('no seal, insufficient coins, insufficient materials, missing equipment and max level reject without mutation', () => {
  for (const prepare of [m => { m.wallet.protection = 0; }, m => { m.wallet.coins = 1; }, m => { m.wallet.crystals = 1; }, m => { m.items[0].status = 'destroyed'; }, m => { m.items[0].level = 15; }]) {
    const m = new ForgeSimulation(); prepare(m); const before = snapshot(m);
    assert.throws(() => m.enhance({ ...request('no-change', .8), protection: true })); assert.equal(snapshot(m), before);
  }
});
test('restoration restores the identical instance and level, consumes one coupon and does not refund materials', () => {
  const m = new ForgeSimulation(), lost = m.enhance(request('lost', .99)), wallet = { ...m.wallet };
  const r = m.restore({ recordId: lost.recordId, requestId: 'restore' });
  assert.equal(r.after.id, lost.before.id); assert.equal(r.after.level, 7); assert.equal(r.after.status, 'owned');
  assert.equal(m.items.length, 6); assert.equal(m.wallet.restoration, 0); assert.equal(m.wallet.coins, wallet.coins); assert.equal(m.wallet.crystals, wallet.crystals);
  assert.ok(m.records[0].restoredAt);
  const next = m.enhance(request('after-restore', 0)); assert.equal(next.after.level, 8);
});
test('one destruction record cannot be restored twice even with a new request and another coupon', () => {
  const m = new ForgeSimulation(); m.restore({ recordId: 'demo-destruction-001', requestId: 'restore' }); m.wallet.restoration = 3;
  const before = snapshot(m); assert.throws(() => m.restore({ recordId: 'demo-destruction-001', requestId: 'again' })); assert.equal(snapshot(m), before);
});
test('missing record and missing coupon both reject restoration without any change', () => {
  const m = new ForgeSimulation(); const before = snapshot(m);
  assert.throws(() => m.restore({ recordId: 'missing', requestId: 'missing' })); assert.equal(snapshot(m), before);
  m.wallet.restoration = 0; const noCoupon = snapshot(m); assert.throws(() => m.restore({ recordId: 'demo-destruction-001', requestId: 'no-coupon' })); assert.equal(snapshot(m), noCoupon);
});
test('repeated requests return the same isolated receipt without duplicate costs or restores', () => {
  const m = new ForgeSimulation(), r = m.enhance(request('once', .99)), before = snapshot(m);
  const repeated = m.enhance(request('once', .99)); assert.deepEqual(repeated, r); assert.equal(snapshot(m), before);
  repeated.after.level = 999; assert.equal(m.enhance(request('once', .99)).after.level, 7);
  const restored = m.restore({ recordId: r.recordId, requestId: 'restore-once' }), after = snapshot(m);
  assert.deepEqual(m.restore({ recordId: r.recordId, requestId: 'restore-once' }), restored); assert.equal(snapshot(m), after);
});
test('preview modules have no account persistence or account mutation paths', () => {
  const app = readFileSync(new URL('./source/app.mjs', import.meta.url), 'utf8');
  const fx = readFileSync(new URL('./source/fx.mjs', import.meta.url), 'utf8');
  const success = readFileSync(new URL('./source/success-v2.mjs', import.meta.url), 'utf8');
  assert.doesNotMatch(app + fx + success, /\/api\/|apiRequest\(|localStorage|sessionStorage|createOscillator|createPeriodicWave/);
  const index = readFileSync(new URL('./index.html', import.meta.url), 'utf8');
  assert.match(index, /ui-fx-vendor-v2045\.bundle\.js/); assert.doesNotMatch(index, /cdn.*(?:pixi|gsap)/i);
  assert.match(fx, /part\.node\.position\.set/); assert.match(fx, /source\.playbackRate\.value = speed/);
});

test('authored success sequence reaches its blast at the shared impact and visits every frame in order', () => {
  assert.equal(successFrameAt(0), 0);
  assert.equal(successFrameAt(2.25), 4);
  assert.equal(successFrameAt(4.8), 15);
  const visited = new Set(); let previous = -1;
  for (let milliseconds = 0; milliseconds <= 4800; milliseconds += 5) {
    const frame = successFrameAt(milliseconds / 1000);
    assert.ok(frame >= previous && frame >= 0 && frame < SUCCESS_ATLAS.frames);
    visited.add(Math.floor(frame)); previous = frame;
  }
  assert.equal(visited.size, 16);
});

test('V2 authored assets match their recorded originals and actual atlas dimensions', () => {
  const manifest = JSON.parse(readFileSync(new URL('./asset-manifest.json', import.meta.url), 'utf8'));
  assert.equal(manifest.version, 2);
  for (const asset of manifest.assets) {
    const data = readFileSync(new URL('../../' + asset.path, import.meta.url));
    assert.equal(createHash('sha256').update(data).digest('hex'), asset.sha256, asset.path);
  }
  const png = readFileSync(new URL('./' + SUCCESS_ATLAS.file, import.meta.url));
  assert.equal(png.readUInt32BE(16), SUCCESS_ATLAS.width);
  assert.equal(png.readUInt32BE(20), SUCCESS_ATLAS.height);
});
test('all equipment source images exist and preserved source audio hashes match provenance', () => {
  const m = new ForgeSimulation(); for (const item of m.items) assert.ok(existsSync(new URL('../..' + item.image, import.meta.url)));
  const root = new URL('../../assets/sfx/v3-advancement-awakening-v1/', import.meta.url);
  const manifest = JSON.parse(readFileSync(new URL('manifest.json', root), 'utf8'));
  for (const asset of Object.values(manifest.assets)) assert.equal(createHash('sha256').update(readFileSync(new URL(asset.file, root))).digest('hex'), asset.sha256);
});
