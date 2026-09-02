import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile, stat } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';
import { normalizedOdds, weightedPick, materialScore, cardEffectScore, rewardAutoFactor } from '../functions/_alchemy.js';

const read = path => readFile(new URL(`../${path}`, import.meta.url), 'utf8');

test('alchemy reward weights are normalized and selected deterministically at boundaries', () => {
  const source = [{ id:'A', weight:100, effectiveWeight:1 }, { id:'B', weight:1, effectiveWeight:3 }, { id:'OFF', weight:1, effectiveWeight:0 }];
  const odds = normalizedOdds(source);
  assert.equal(odds.length, 2);
  assert.equal(odds.reduce((sum, row) => sum + row.probability, 0), 100);
  assert.equal(weightedPick(source, 0).id, 'A');
  assert.equal(weightedPick(source, 0.249999).id, 'A');
  assert.equal(weightedPick(source, 0.25).id, 'B');
  assert.equal(weightedPick(source, 0.999999).id, 'B');
});

test('alchemy material quality rises with real equipment power and high-card grade while reward factor falls with strength', () => {
  const bounds = { min:1000, max:100000 };
  assert.ok(materialScore({ type:'EQUIPMENT', totalPower:1000 }, bounds) < materialScore({ type:'EQUIPMENT', totalPower:50000 }, bounds));
  assert.ok(materialScore({ type:'EQUIPMENT', totalPower:50000 }, bounds) < materialScore({ type:'EQUIPMENT', totalPower:100000 }, bounds));
  const grades = ['LIMITED','PRESTIGE','FUR','ZENITH'].map(rarity => materialScore({ type:'CARD', rarity }));
  assert.deepEqual(grades, [120,180,240,320]);
  assert.ok(rewardAutoFactor(10) > rewardAutoFactor(50));
  assert.ok(rewardAutoFactor(50) > rewardAutoFactor(100));
  assert.ok(cardEffectScore({ attackPercent:10, defensePercent:5, effectValue:20, triggerChance:50, maxActivations:2 }) > 30);
});

test('alchemy backend enforces protected inputs, secure roll, idempotency and atomic grant guard', async () => {
  const source = await read('functions/_alchemy.js');
  assert.match(source, /const INPUT_ASSET_TYPES=new Set\(\['CARD','EQUIPMENT'\]\)/);
  assert.match(source, /const REWARD_ASSET_TYPES=new Set\(\['CARD','EQUIPMENT','ITEM','VEHICLE'\]\)/);
  assert.match(source, /ALCHEMY_CARD_INPUT_GRADES=new Set\(\['LIMITED','PRESTIGE','FUR','ZENITH'\]\)/);
  assert.match(source, /UPDATE \$\{TABLES\.inputs\} SET is_enabled=0/);
  assert.match(source, /quantity>=\?/);
  assert.match(source, /crypto\.getRandomValues/);
  assert.doesNotMatch(source, /Math\.random/);
  assert.match(source, /ON CONFLICT\(request_id,user_id\) DO NOTHING/);
  assert.match(source, /alchemy_guards_v1/);
  assert.match(source, /await env\.DB\.batch\(statements\)/);
  assert.match(source, /UPPER\(e\.slot\)<>'BATTLE_SUIT'/);
  assert.match(source, /reward_type='VEHICLE'/);
  assert.match(source, /INSERT INTO user_garage_vehicles/);
  assert.match(source, /NOT EXISTS\(SELECT 1 FROM user_garage_vehicles/);
  assert.doesNotMatch(source, /entry\.type==='ITEM'/);
  assert.match(source, /BLACK_MIRACLE_INVERSE/);
  assert.match(source, /safe_runtime_upgrade_v1977_alchemy_single_mode/);
  assert.match(source, /UPDATE \$\{TABLES\.pool\} SET alchemy_mode='ANY'/);
  assert.match(source, /const mode='STANDARD'/);
  assert.doesNotMatch(source, /PRECISION|CHAOS/);
});

test('alchemy is wired through authenticated API, shell summary, lazy live route and all-menu crafting group', async () => {
  const [worker, app, shell, router, live] = await Promise.all([
    read('functions/api/[[path]].js'), read('js/app.js'), read('js/soopketmon-v21-exact-shell-adapter.js'),
    read('js/soopketmon-v21-runtime-router.js'), read('js/alchemy-v1-live.js')
  ]);
  assert.match(worker, /handleAlchemy,alchemyFeatureAccess/);
  assert.match(worker, /'alchemy\/transmute'/);
  assert.match(worker, /alchemyFeature/);
  assert.match(app, /alchemyFeatureVisible/);
  assert.match(app, /styles:\['css\/card\.css[^\]]+'css\/alchemy-v1\.css/);
  assert.match(app, /window\.bindAlchemyView/);
  assert.match(shell, /routes: Object\.freeze\(\['vehicle', 'fusion', 'alchemy'\]\)/);
  assert.match(shell, /title: '연금술', group: 'crafting'/);
  assert.match(router, /alchemy: \{ shell: 'alchemy' \}/);
  assert.match(live, /alchemy\/transmute/);
  assert.match(live, /cnine_pending_alchemy_v1/);
});

test('truth orb and fortified five-slot renderer are shared by preview and live', async () => {
  const [renderer, css, preview, previewHtml] = await Promise.all([
    read('js/alchemy-v1.js'), read('css/alchemy-v1.css'), read('preview/live-alchemy-v1/preview.js'), read('preview/live-alchemy-v1/index.html')
  ]);
  assert.match(renderer, /alchemy-truth-orb-v2\.webp/);
  assert.match(renderer, /Array\.from\(\{ length: MAX_SLOTS \}/);
  assert.match(renderer, /IDEMPOTENT RECEIPT \/ RETRY/);
  assert.match(css, /alchSlotScan/);
  assert.match(css, /\.alch-empty-rune[^\n]+border-radius:50%/);
  assert.doesNotMatch(preview, /SUPERSTAR|핑크빛유두/);
  assert.match(preview, /OWNER 검수계정/);
  assert.match(previewHtml, /single-mode/);
  assert.match(renderer, /const TYPE_TABS = \['CARD', 'EQUIPMENT'\]/);
  assert.doesNotMatch(renderer, /data-alchemy-mode|PRECISION|CHAOS|정밀 연성|혼돈 연성/);
  assert.doesNotMatch(preview, /PRECISION|CHAOS/);
  assert.match(preview, /type: 'VEHICLE'/);
  assert.doesNotMatch(preview, /assets:\s*\[[\s\S]*?type: 'ITEM'[\s\S]*?\],\s*rewardPool:/);
  const orb = new URL('../assets/ui/alchemy-v1/alchemy-truth-orb-v2.webp', import.meta.url);
  assert.ok((await stat(orb)).size > 100000);
  const metadata = await sharp(fileURLToPath(orb)).metadata();
  assert.equal(metadata.width, 1024);
  assert.equal(metadata.height, 1024);
  assert.equal(metadata.hasAlpha, true);
});

test('alchemy CMS exposes material curve, vehicles, inverse reward weights and stale receipt recovery', async () => {
  const [admin, loader, adminHtml, cleanup] = await Promise.all([
    read('admin/alchemy-admin-v1.js'), read('admin/admin-v1276.js'), read('admin/index.html'), read('functions/_storage_cleanup.js')
  ]);
  for (const action of ['SAVE_SETTINGS','SAVE_REWARD','DELETE_REWARD','RECOVER_PENDING']) assert.match(admin, new RegExp(action));
  assert.doesNotMatch(admin, /SAVE_INPUT/);
  assert.match(admin, /OWNER_TEST/);
  assert.match(admin, /BLACK MIRACLE INVERSE CURVE/);
  assert.match(admin, /보상 풀 최종 등장확률/);
  assert.match(admin, /oneInLabel/);
  assert.match(admin, /alchemy-final-probability/);
  assert.doesNotMatch(admin, /alchemyRewardMode|PRECISION|CHAOS|정밀/);
  assert.match(admin, /VEHICLE:'이동수단'/);
  assert.match(loader, /alchemy-admin-v1\.js\?v=3-single-mode/);
  assert.match(adminHtml, /admin-v1276\.js\?v=1977-alchemy-single-mode/);
  for (const table of ['alchemy_runs_v1','alchemy_user_state_v1','alchemy_asset_locks_v1','alchemy_guards_v1']) assert.match(cleanup, new RegExp(table));
});
