import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import vm from 'node:vm';

const root = new URL('../', import.meta.url);
const [indexSource, appSource, pveCommandSource] = await Promise.all([
  readFile(new URL('index.html', root), 'utf8'),
  readFile(new URL('js/app.js', root), 'utf8'),
  readFile(new URL('js/pve-command-v2-live.js', root), 'utf8'),
]);

function sourceBetween(source, startMarker, endMarker) {
  const start = source.indexOf(startMarker);
  const end = source.indexOf(endMarker, start + startMarker.length);
  assert.ok(start >= 0, `missing source marker: ${startMarker}`);
  assert.ok(end > start, `missing source marker after ${startMarker}: ${endMarker}`);
  return source.slice(start, end);
}

const raidEntrySource = sourceBetween(
  appSource,
  'function switchPveMode(mode){',
  '\nasync function loadRaidView',
);
const bindRaidButtonSource = appSource.match(
  /document\.querySelectorAll\('\.pve-mode-btn\[data-pve-mode\]'\)\.forEach\(b=>b\.onclick=\(\)=>switchPveMode\(b\.dataset\.pveMode\)\);/,
)?.[0];

assert.ok(bindRaidButtonSource, 'battle shell raid-button binding is missing');

function classList() {
  const values = new Set();
  return {
    add(...names) { names.forEach(name => values.add(name)); },
    contains(name) { return values.has(name); },
    toggle(name, force) {
      const enabled = force === undefined ? !values.has(name) : Boolean(force);
      if (enabled) values.add(name);
      else values.delete(name);
      return enabled;
    },
  };
}

function markupElement(markup, id) {
  const escaped = id.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const tag = markup.match(new RegExp(`<[^>]+\\bid=["']${escaped}["'][^>]*>`, 'i'))?.[0];
  if (!tag) return null;
  return {
    id,
    hidden: /\shidden(?:\s|=|>)/i.test(tag),
    classList: classList(),
    dataset: {},
  };
}

function mountMarkup(document, markup) {
  const ids = [
    'pveHuntView',
    'pveRaidHubView',
    'pveRaidView',
    'pveCoreRaidView',
    'pveRiftView',
    'pveEscortView',
  ];
  document.elements = new Map(ids.map(id => [id, markupElement(markup, id)]).filter(([, element]) => element));
  assert.match(markup, /data-pve-mode=["']raid["']/, 'rendered PVE command must contain the raid entry');
  const raidButton = {
    dataset: { pveMode: 'raid' },
    classList: classList(),
    onclick: null,
    click() { return this.onclick?.(); },
  };
  document.modeButtons = [raidButton];
  return raidButton;
}

function optionalCore(kind, counters) {
  if (kind === 'missing') return undefined;
  return {
    openActive() {
      counters.coreCalls += 1;
      if (kind === 'reject') return Promise.reject(new Error('simulated disconnected Core failure'));
      return kind === 'true';
    },
  };
}

async function flushAsyncEntry() {
  await Promise.resolve();
  await Promise.resolve();
  await new Promise(resolve => setImmediate(resolve));
}

async function runRaidEntry(coreKind) {
  const counters = { coreCalls: 0, legacyLoads: 0 };
  const document = {
    hidden: false,
    elements: new Map(),
    modeButtons: [],
    getElementById(id) { return this.elements.get(id) || null; },
    querySelector() { return null; },
    querySelectorAll(selector) {
      return selector === '.pve-mode-btn' || selector === '.pve-mode-btn[data-pve-mode]'
        ? this.modeButtons
        : [];
    },
  };
  const context = {
    console,
    document,
    requestAnimationFrame() { return 1; },
    summaryBar() { return ''; },
    battleState: { energy: null },
    battleView() { return ''; },
    renderBattleBuilder() {},
    renderPveMonsterBrowser() {},
    renderBattleSnapshot() {},
    renderRaidView: undefined,
    invalidateRaidUiState() {},
    stopBattleEnergyTimer() {},
    setPveViewMode() {},
    applyPveViewMode() {},
    loadBattleView() { return Promise.resolve(); },
    loadRaidView() {
      const raid = document.getElementById('pveRaidView');
      if (!raid || raid.hidden || document.hidden) return;
      counters.legacyLoads += 1;
    },
  };
  context.window = context;
  context.globalThis = context;
  vm.createContext(context);

  // app.js installs the production switch first. A stale global is injected next
  // to prove that no Core implementation can intercept the production route.
  vm.runInContext(raidEntrySource, context, { filename: 'app.js#raid-entry' });
  const core = optionalCore(coreKind, counters);
  if (core) context.CoreProtocolRaidV1924 = core;

  // index.html loads this actual deferred override after app.js. It captures and
  // wraps the production switchPveMode used by the subsequently bound button.
  vm.runInContext(pveCommandSource, context, { filename: 'pve-command-v2-live.js' });
  const pveOverrideMarkup = context.battleView({});
  const raidButton = mountMarkup(document, pveOverrideMarkup);

  vm.runInContext(bindRaidButtonSource, context, { filename: 'app.js#bind-raid-button' });
  raidButton.click();
  await flushAsyncEntry();

  return {
    ...counters,
    raidHidden: document.getElementById('pveRaidView')?.hidden,
  };
}

test('production index loads the TEST-gated Core resources after the live PVE adapter', () => {
  const scripts = Array.from(indexSource.matchAll(/<script\b[^>]*\bsrc=["']([^"']+)["'][^>]*>/gi), match => match[1].split('?')[0]);
  const appIndex = scripts.indexOf('js/app.js');
  const pveCommandIndex = scripts.indexOf('js/pve-command-v2-live.js');
  const qteIndex = scripts.indexOf('js/project-v-raid-qte-v1924.js');
  const coreIndex = scripts.indexOf('js/core-protocol-raid-v1924.js');

  assert.ok(appIndex >= 0, 'index must load app.js');
  assert.ok(pveCommandIndex > appIndex, 'PVE command must wrap the production switchPveMode installed by app.js');
  assert.ok(qteIndex > pveCommandIndex, 'Core QTE must load after the live PVE adapter');
  assert.ok(coreIndex > qteIndex, 'Core controller must load after its QTE runtime');
  assert.ok(indexSource.includes('css/core-protocol-raid-v1924.css'), 'Core presentation stylesheet is missing');
  assert.match(raidEntrySource, /loadRaidView\(\);void Promise\.resolve\(globalThis\.CoreProtocolRaidV1924\?\.openActive\?\.\(\)\)\.catch/,
    'legacy raid must start first and isolate every Core entry failure');
});

test('PVE override raid click always loads legacy once and Core can never block it', async t => {
  for (const coreKind of ['missing', 'false', 'reject', 'true']) {
    await t.test(`Core ${coreKind}`, async () => {
      const result = await runRaidEntry(coreKind);
      assert.equal(result.raidHidden, false, 'legacy raid view must be visible before its loader runs');
      assert.equal(result.coreCalls, coreKind === 'missing' ? 0 : 1, `Core ${coreKind} must be probed only after legacy entry`);
      assert.equal(result.legacyLoads, 1, `Core ${coreKind} must result in one legacy load`);
    });
  }
});
