import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

import {
  blackMiraclePowerRate,
  buildBlackMiraclePowerPool,
  cleanBlackMiracleSettings,
  rollBlackMiracleOutcome,
} from '../functions/_black_miracle_pack.js';

const text = (file) => readFile(new URL(`../${file}`, import.meta.url), 'utf8');
const closeTo = (actual, expected, epsilon = 1e-12) => {
  assert.ok(Math.abs(Number(actual) - Number(expected)) <= epsilon, `${actual} is not close to ${expected}`);
};
const outcomeType = (outcome) => String(outcome?.type || outcome?.kind || outcome?.key || '').toUpperCase();
const outcomeItemId = (outcome) => Number(outcome?.item?.id ?? outcome?.entry?.id ?? outcome?.id ?? 0);

test('power-derived item rates stay within 0.01%-0.1% and stronger rewards are rarer', () => {
  closeTo(blackMiraclePowerRate(100, 100, 1_000, 0.01, 0.1), 0.1);
  closeTo(blackMiraclePowerRate(550, 100, 1_000, 0.01, 0.1), 0.055);
  closeTo(blackMiraclePowerRate(1_000, 100, 1_000, 0.01, 0.1), 0.01);

  const rates = [100, 325, 550, 775, 1_000]
    .map((power) => blackMiraclePowerRate(power, 100, 1_000, 0.01, 0.1));
  for (const rate of rates) assert.ok(rate >= 0.01 && rate <= 0.1, `out-of-range rate: ${rate}`);
  for (let index = 1; index < rates.length; index += 1) {
    assert.ok(rates[index] <= rates[index - 1], 'higher power must never get a higher acquisition rate');
  }

  // Operator input cannot widen the economy-safe absolute percentage-point band.
  closeTo(blackMiraclePowerRate(100, 100, 1_000, -20, 90), 0.1);
  closeTo(blackMiraclePowerRate(1_000, 100, 1_000, -20, 90), 0.01);
});

test('automatic power pools are stable, public-only, power-sorted and overrideable', () => {
  const rows = [
    { id: 30, name: 'middle', total_power: 550, rarity: 'MYTHIC', is_active: 1, is_public: 1 },
    { id: 20, name: 'floor', totalPower: 100, rarity: 'MYTHIC', isActive: true, isPublic: true },
    { id: 10, name: 'ceiling', total_power: 1_000, rarity: 'MYTHIC', is_active: 1, is_public: 1 },
    { id: 11, name: 'ceiling tie', total_power: 1_000, rarity: 'MYTHIC', is_active: 1, is_public: 1 },
    { id: 40, name: 'inactive', total_power: 9_000, rarity: 'MYTHIC', is_active: 0, is_public: 1 },
    { id: 50, name: 'private', total_power: 8_000, rarity: 'MYTHIC', is_active: 1, is_public: 0 },
    { id: 60, name: 'not mythic', total_power: 7_000, rarity: 'LEGENDARY', is_active: 1, is_public: 1 },
  ];
  const config = {
    enabled: true,
    mode: 'AUTO',
    minRatePercent: 0.01,
    maxRatePercent: 0.1,
    powerFloor: 100,
    powerCeiling: 1_000,
    maxItems: 10,
    overrides: { 30: { enabled: true, rate: 0.07 } },
  };

  const forward = buildBlackMiraclePowerPool(rows, config, 'EQUIPMENT');
  const reverse = buildBlackMiraclePowerPool([...rows].reverse(), config, 'EQUIPMENT');
  assert.deepEqual(forward, reverse, 'database row order must not affect rates or selection order');
  assert.deepEqual(forward.map((entry) => entry.id), [10, 11, 30, 20]);
  assert.ok(forward.every((entry) => entry.type === 'EQUIPMENT'));
  closeTo(forward[0].dropRatePercent, 0.01);
  closeTo(forward[1].dropRatePercent, 0.01, 1e-12);
  closeTo(forward[2].dropRatePercent, 0.07);
  closeTo(forward[3].dropRatePercent, 0.1);

  const disabled = buildBlackMiraclePowerPool(rows, {
    ...config,
    overrides: { 30: { enabled: false, ratePercent: 0.07 } },
  }, 'EQUIPMENT');
  assert.equal(disabled.some((entry) => entry.id === 30), false, 'an explicit disabled override removes the item');
  assert.deepEqual(buildBlackMiraclePowerPool(rows, { ...config, maxItems: 2 }, 'EQUIPMENT').map((entry) => entry.id), [10, 11]);
});

test('release kill switch keeps missing and legacy enabled settings OFF while preserving reward compatibility', () => {
  assert.equal(cleanBlackMiracleSettings({}).enabled, false, 'missing or invalid settings must keep inventory opening OFF');
  assert.equal(cleanBlackMiracleSettings({ enabled: true }).enabled, false, 'a stored enabled:true value must not bypass the release kill switch');
  const migrated = cleanBlackMiracleSettings({
    enabled: true,
    rewards: {
      MYTHIC_EQUIPMENT: { rate: 25 },
      MYTHIC_VEHICLE: { rate: 15 },
      MASTER_STAR: { rate: 35, min: 50, max: 100 },
      COIN: { rate: 25, min: 1_000_000, max: 1_000_000 },
    },
  });
  assert.equal(migrated.powerRewards.enabled, true, 'saved v1485 settings without powerRewards must adopt AUTO');
  assert.equal(migrated.enabled, false, 'legacy saved settings must remain inventory-use OFF for this release');
  assert.equal(migrated.powerRewards.equipment.mode, 'AUTO');
  assert.equal(migrated.powerRewards.vehicle.mode, 'AUTO');

  const clamped = cleanBlackMiracleSettings({
    powerRewards: {
      enabled: true,
      maxTotalRatePercent: 99,
      equipment: { mode: 'AUTO', minRatePercent: -5, maxRatePercent: 4 },
      vehicle: { mode: 'HYBRID', minRatePercent: 0.001, maxRatePercent: 8 },
    },
  });
  for (const pool of [clamped.powerRewards.equipment, clamped.powerRewards.vehicle]) {
    assert.equal(pool.minRatePercent, 0.01);
    assert.equal(pool.maxRatePercent, 0.1);
  }

  const legacy = cleanBlackMiracleSettings({
    powerRewards: { enabled: false },
    rewards: {
      MYTHIC_EQUIPMENT: { rate: 25 },
      MYTHIC_VEHICLE: { rate: 15 },
      MASTER_STAR: { rate: 35, min: 50, max: 100 },
      COIN: { rate: 25, min: 1_000_000, max: 1_000_000 },
    },
  });
  assert.equal(legacy.powerRewards.enabled, false);
  assert.equal(legacy.rewards.MYTHIC_EQUIPMENT.rate, 25);
  assert.equal(legacy.rewards.MYTHIC_VEHICLE.rate, 15);
  assert.equal(outcomeType(rollBlackMiracleOutcome(legacy, [], () => 0)), 'MYTHIC_EQUIPMENT');
});

test('0.01 means 0.01 percentage points, exact boundary misses, and every rare miss has a filler', () => {
  const settings = cleanBlackMiracleSettings({
    powerRewards: {
      enabled: true,
      maxTotalRatePercent: 1,
      equipment: { minRatePercent: 0.01, maxRatePercent: 0.1 },
      vehicle: { minRatePercent: 0.01, maxRatePercent: 0.1 },
    },
    rewards: {
      MYTHIC_EQUIPMENT: { rate: 25 },
      MYTHIC_VEHICLE: { rate: 15 },
      MASTER_STAR: { rate: 35, min: 50, max: 100 },
      COIN: { rate: 25, min: 1_000_000, max: 1_000_000 },
    },
  });
  const pool = [{ id: 777, type: 'EQUIPMENT', name: 'absolute 0.01%', dropRatePercent: 0.01 }];

  const justInside = rollBlackMiracleOutcome(settings, pool, () => 0.000099999999);
  assert.equal(outcomeType(justInside), 'EQUIPMENT');
  assert.equal(outcomeItemId(justInside), 777);

  const exactBoundary = rollBlackMiracleOutcome(settings, pool, () => 0.0001);
  assert.ok(['MASTER_STAR', 'COIN'].includes(outcomeType(exactBoundary)), '0.0001 unit is outside a 0.01% interval');

  const farMiss = rollBlackMiracleOutcome(settings, pool, () => 0.999999999);
  assert.ok(['MASTER_STAR', 'COIN'].includes(outcomeType(farMiss)), 'a rare miss must resolve to the configured filler pool');
  assert.ok(rollBlackMiracleOutcome(settings, [], () => 0), 'AUTO with no eligible rare item still returns a filler');
  assert.ok(['MASTER_STAR', 'COIN'].includes(outcomeType(rollBlackMiracleOutcome(settings, [], () => 0))));

  const capped = cleanBlackMiracleSettings({
    powerRewards: { enabled: true, maxTotalRatePercent: 0.1 },
  });
  const oversizedPool = [
    { id: 1, type: 'EQUIPMENT', dropRatePercent: 0.1 },
    { id: 2, type: 'VEHICLE', dropRatePercent: 0.1 },
  ];
  const cappedHit = rollBlackMiracleOutcome(capped, oversizedPool, () => 0.00075);
  assert.equal(outcomeType(cappedHit), 'EQUIPMENT',
    'the combined cap keeps the first high-power reward inside the absolute range and excludes overflow rewards');
  closeTo(cappedHit.item.dropRatePercent, 0.1);
  assert.ok(['MASTER_STAR', 'COIN'].includes(outcomeType(rollBlackMiracleOutcome(capped, oversizedPool, () => 0.001))),
    'the exact combined 0.1% boundary belongs to filler');
});

test('server removes SQL randomness and guards source/open grants with PENDING receipts', async () => {
  const server = await text('functions/_black_miracle_pack.js');
  assert.doesNotMatch(server, /ORDER\s+BY\s+RANDOM\s*\(\s*\)/i);

  const dropStart = server.indexOf('export async function rollBlackMiracleDrop');
  const openStart = server.indexOf('export async function openBlackMiraclePack');
  const adminStart = server.indexOf('export async function handleBlackMiracleAdmin');
  assert.ok(dropStart >= 0 && openStart > dropStart && adminStart > openStart);
  const drop = server.slice(dropStart, openStart);
  const open = server.slice(openStart, adminStart);

  assert.match(server, /BLACK_MIRACLE_INVENTORY_USE_RELEASE_ENABLED\s*=\s*false/);
  assert.match(open, /!BLACK_MIRACLE_INVENTORY_USE_RELEASE_ENABLED\s*\|\|\s*settings\.enabled\s*!==\s*true/);

  assert.match(drop, /black_miracle_pack_drop_receipts/);
  assert.match(drop, /status\s*=\s*'PENDING'|'PENDING'/);
  assert.match(drop, /meta\??\.changes|meta\??\[?['"]changes|Number\([^)]*changes/);
  assert.match(drop, /status\s*=\s*'GRANTED'/);
  assert.match(drop, /env\.DB\.batch\(/);
  assert.match(drop, /WHERE[\s\S]*status\s*=\s*'PENDING'/i);

  assert.match(open, /black_miracle_pack_open_receipts/);
  assert.match(open, /status\s*=\s*'PENDING'|'PENDING'/);
  assert.match(open, /meta\??\.changes|meta\??\[?['"]changes|Number\([^)]*changes/);
  assert.match(open, /quantity\s*=\s*quantity\s*-\s*1/);
  assert.match(open, /user_equipment_instances/);
  assert.match(open, /user_garage_vehicles/);
  assert.match(open, /env\.DB\.batch\(/);
  assert.match(open, /SET\s+status='CLAIMED'[\s\S]*quantity=\?[\s\S]*status='CLAIMED'/i,
    'a request must claim the exact pre-open balance before any reward statement can run');
  assert.match(open, /UPDATE\s+black_miracle_pack_open_receipts[\s\S]*status\s*=\s*'COMPLETED'[\s\S]*status\s*=\s*'CLAIMED'/i);
  assert.doesNotMatch(open, /await\s+env\.DB\.prepare\([\s\S]{0,240}quantity\s*=\s*quantity\s*-\s*1[\s\S]{0,180}\.run\(\)/i,
    'pack consumption must be part of the guarded atomic grant batch, not a standalone write');
});

test('five-card reveal is single-use, accessible, responsive and reduced-motion safe', async () => {
  const [ui, css] = await Promise.all([
    text('js/black-miracle-opening-v1926.js'),
    text('css/black-miracle-v1485.css'),
  ]);

  assert.match(ui, /BLACK_MIRACLE_CHOICE_COUNT\s*=\s*5/);
  assert.match(ui, /response\?\.presentation\?\.cardCount/);
  assert.match(ui, /window\.BlackMiracleOpeningV1926/);
  assert.match(ui, /class="black-miracle-experience"[^>]*role="dialog"[^>]*aria-modal="true"/);
  assert.match(ui, /class="black-miracle-card-fan"[^>]*role="group"/);
  assert.match(ui, /class="[^"]*black-miracle-live[^"]*"[^>]*aria-live="polite"/);
  assert.match(ui, /type="button"\s+class="black-miracle-choice"\s+data-black-miracle-choice="\$\{index\}"/);
  assert.match(ui, /aria-label="봉인 카드 \$\{index\s*\+\s*1\} 선택"/);
  assert.match(ui, /\.disabled\s*=\s*true/);
  assert.match(ui, /is-selected/);
  assert.match(ui, /is-flipped/);
  assert.match(ui, /is-dismissed/);
  assert.match(ui, /data-phase/);
  assert.equal((ui.match(/inventory\/use/g) || []).length, 1, 'the five visual choices must share one server mutation');

  assert.match(css, /\.black-miracle-card-fan/);
  assert.match(css, /\.black-miracle-choice\.is-selected|\.black-miracle-choice\.is-flipped/);
  assert.match(css, /\.black-miracle-choice\.is-dismissed/);
  assert.match(css, /@media\s*\(max-width:\s*760px\)/);
  assert.match(css, /@media\s*\(max-height:\s*620px\)/);
  assert.match(css, /@media\s*\(prefers-reduced-motion:\s*reduce\)/);
});

test('live app delegates to the module and deployment cache keys include v1926 assets', async () => {
  const [app, index, worker, adminLoader] = await Promise.all([
    text('js/app.js'),
    text('index.html'),
    text('service-worker.js'),
    text('admin/admin-v1276.js'),
  ]);
  const start = app.indexOf('async function openBlackMiraclePack');
  const end = app.indexOf('async function openEquipmentSupplyBox', start);
  assert.ok(start >= 0 && end > start);
  const delegate = app.slice(start, end);
  assert.match(delegate, /window\.BlackMiracleOpeningV1926/);
  assert.match(delegate, /\.open\s*\(\s*\{/);
  assert.doesNotMatch(delegate, /black-miracle-result|blackMiracleOpen/);

  assert.match(index, /css\/black-miracle-v1485\.css\?v=1926-[^"']+/);
  assert.match(index, /js\/black-miracle-opening-v1926\.js\?v=1926-[^"']+/);
  assert.match(index, /js\/app\.js\?v=1940-superstar-advancement/);
  assert.ok(index.indexOf('black-miracle-opening-v1926.js') < index.indexOf('js/app.js'), 'the opening module must load before app.js');
  assert.match(worker, /soop-card-shell-v1940-superstar-advancement/);
  assert.match(adminLoader, /black-miracle-pack-admin-v1485\.js\?v=1926-[^'";]+/);
});

test('OWNER CMS exposes automatic power-rate limits and detailed overrides', async () => {
  const [admin, server, api] = await Promise.all([
    text('admin/black-miracle-pack-admin-v1485.js'),
    text('functions/_black_miracle_pack.js'),
    text('functions/api/[[path]].js'),
  ]);
  assert.match(admin, /powerRewards/);
  for (const id of [
    'bmpPowerEnabled', 'bmpPowerMaxTotal', 'bmpCardCount',
    'bmpPowerEquipmentEnabled', 'bmpPowerEquipmentMode', 'bmpPowerEquipmentMin', 'bmpPowerEquipmentMax',
    'bmpPowerEquipmentCurve', 'bmpPowerEquipmentFloor', 'bmpPowerEquipmentCeiling', 'bmpPowerEquipmentMaxItems',
    'bmpPowerVehicleEnabled', 'bmpPowerVehicleMode', 'bmpPowerVehicleMin', 'bmpPowerVehicleMax',
    'bmpPowerVehicleCurve', 'bmpPowerVehicleFloor', 'bmpPowerVehicleCeiling', 'bmpPowerVehicleMaxItems',
  ]) assert.match(admin, new RegExp(id));
  assert.match(admin, /AUTO/);
  assert.match(admin, /HYBRID|MANUAL/);
  assert.match(admin, /전투력/);
  assert.match(admin, /min="0\.01"/);
  assert.match(admin, /max="0\.1"/);
  assert.match(admin, /step="0\.001"/);
  assert.match(admin, /minRatePercent/);
  assert.match(admin, /maxRatePercent/);
  assert.match(admin, /powerFloor/);
  assert.match(admin, /powerCeiling/);
  assert.match(admin, /maxItems/);
  assert.match(admin, /overrides/);
  assert.match(admin, /data-bmp-power-item/);
  assert.match(admin, /data-bmp-power-enabled/);
  assert.match(admin, /data-bmp-power-rate/);
  assert.match(admin, /data-bmp-rate-preview/);
  assert.match(server, /String\(user\.role\).*===\s*'OWNER'|String\(user\.role\).*!==\s*'OWNER'/);
  assert.match(api, /source:'RIFT'[\s\S]{0,260}blackMiracleReward/);
  assert.match(api, /WHEN i\.code='BLACK_MIRACLE_PACK' THEN 0 ELSE 1 END AS usable/,
    'the release kill switch must keep inventory use disabled regardless of stored app_meta');
  assert.doesNotMatch(api, /WHEN i\.code='BLACK_MIRACLE_PACK' THEN COALESCE\(\(SELECT[\s\S]{0,320}black_miracle_pack_settings_v1485/,
    'raw app_meta must not be able to re-enable inventory use during this release');
});
