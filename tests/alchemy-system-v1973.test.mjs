import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile, stat } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';
import { normalizedOdds, weightedPick } from '../functions/_alchemy.js';

const read = path => readFile(new URL(`../${path}`, import.meta.url), 'utf8');

test('alchemy reward weights are normalized and selected deterministically at boundaries', () => {
  const source = [{ id:'A', weight:1 }, { id:'B', weight:3 }, { id:'OFF', weight:0 }];
  const odds = normalizedOdds(source);
  assert.equal(odds.length, 2);
  assert.equal(odds.reduce((sum, row) => sum + row.probability, 0), 100);
  assert.equal(weightedPick(source, 0).id, 'A');
  assert.equal(weightedPick(source, 0.249999).id, 'A');
  assert.equal(weightedPick(source, 0.25).id, 'B');
  assert.equal(weightedPick(source, 0.999999).id, 'B');
});

test('alchemy backend enforces protected inputs, secure roll, idempotency and atomic grant guard', async () => {
  const source = await read('functions/_alchemy.js');
  assert.match(source, /const ASSET_TYPES=new Set\(\['CARD','EQUIPMENT','ITEM'\]\)/);
  assert.match(source, /BLOCKED_CARD_RARITIES=new Set\(\['SUPERSTAR'\]\)/);
  assert.match(source, /quantity>=\?/);
  assert.match(source, /crypto\.getRandomValues/);
  assert.doesNotMatch(source, /Math\.random/);
  assert.match(source, /ON CONFLICT\(request_id,user_id\) DO NOTHING/);
  assert.match(source, /alchemy_guards_v1/);
  assert.match(source, /await env\.DB\.batch\(statements\)/);
  assert.match(source, /UPPER\(e\.slot\)<>'BATTLE_SUIT'/);
  assert.match(source, /VEHICLE/);
  assert.doesNotMatch(source, /reward_type[^\n]{0,80}VEHICLE/);
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
  assert.doesNotMatch(preview, /SUPERSTAR|BLACK_MIRACLE|핑크빛유두/);
  assert.match(preview, /OWNER 검수계정/);
  assert.match(previewHtml, /truth-orb-slots/);
  const orb = new URL('../assets/ui/alchemy-v1/alchemy-truth-orb-v2.webp', import.meta.url);
  assert.ok((await stat(orb)).size > 100000);
  const metadata = await sharp(fileURLToPath(orb)).metadata();
  assert.equal(metadata.width, 1024);
  assert.equal(metadata.height, 1024);
  assert.equal(metadata.hasAlpha, true);
});

test('alchemy CMS controls gate, allowlist, reward weights and stale receipt recovery', async () => {
  const [admin, loader, adminHtml, cleanup] = await Promise.all([
    read('admin/alchemy-admin-v1.js'), read('admin/admin-v1276.js'), read('admin/index.html'), read('functions/_storage_cleanup.js')
  ]);
  for (const action of ['SAVE_SETTINGS','SAVE_INPUT','SAVE_REWARD','DELETE_REWARD','RECOVER_PENDING']) assert.match(admin, new RegExp(action));
  assert.match(admin, /OWNER_TEST/);
  assert.match(admin, /정규화 확률/);
  assert.match(loader, /alchemy-admin-v1\.js\?v=1-live-cms/);
  assert.match(adminHtml, /admin-v1276\.js\?v=1973-alchemy-owner-test/);
  for (const table of ['alchemy_runs_v1','alchemy_user_state_v1','alchemy_asset_locks_v1','alchemy_guards_v1']) assert.match(cleanup, new RegExp(table));
});
