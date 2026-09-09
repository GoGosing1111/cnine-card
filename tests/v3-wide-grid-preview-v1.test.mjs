import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {GRID, FORMATIONS, configuration, project, formationPoint, scaleAt, bounds} from '../preview/v3-wide-grid-v1/source/grid-layout.mjs';
import {createEncounter} from '../preview/scrapyard-v3-v1/source/encounter-model.mjs';
import {waitForVisualDrain} from '../preview/v3-wide-grid-v1/source/visual-drain.mjs';

const root = new URL('../', import.meta.url);
const read = p => fs.readFileSync(new URL(p, root), 'utf8');
const originalEngine = read('preview/project-v-v3/source/battle/BattleEngine.js');
const gridEngine = read('preview/v3-wide-grid-v1/source/WideGridBattleEngine.js');
const epsilon = (a, b) => assert.ok(Math.abs(a - b) < 1e-9, `${a} != ${b}`);

test('comparison baseline matches the actual live 7x6 projection, not a smaller strawman', () => {
  assert.match(originalEngine, /ISO_GRID=\{columns:7,rows:6\}/);
  for (const mobile of [false, true]) for (const [key, value] of Object.entries(configuration(mobile, 'original')))
    assert.ok(originalEngine.includes(`${key}:${value}`) || originalEngine.includes(`${key}:${String(value).replace(/^0\./, '.')}`), `${key}:${value}`);
  assert.deepEqual(FORMATIONS.allies, [[0, 1], [2, 1], [0, 3], [2, 3], [0, 5]]);
});

for (const mobile of [false, true]) {
  const label = mobile ? 'portrait mobile' : 'desktop';
  test(`${label}: expanded grid genuinely grows and all 63 tiles stay inside the canonical scene`, () => {
    const old = bounds(mobile, 'original'), next = bounds(mobile), scene = mobile ? {width: 1050, height: 1500} : {width: 1600, height: 820};
    assert.equal(GRID.wide.columns * GRID.wide.rows, 63);
    assert.ok(next.width > old.width * 1.17);
    assert.ok(next.height > old.height);
    assert.ok(next.left >= 16 && next.right <= scene.width - 16);
    assert.ok(next.top > 0 && next.bottom + 16 < scene.height);
    const c = configuration(mobile);
    for (let x = 0; x < 9; x++) for (let y = 0; y < 7; y++) {
      const p = project(c, x, y);
      const dx = (p.x - c.originX) / (c.tileWidth / 2), dy = (p.y - c.originY) / (c.tileHeight / 2);
      epsilon((dx + dy) / 2, x); epsilon((dy - dx) / 2, y);
    }
  });
  test(`${label}: five cards, five hostile slots and separate support have distinct tile centres`, () => {
    const occupied = [...FORMATIONS.allies.map(p => [...p, 'ALLY']), ...FORMATIONS.enemies.map(p => [...p, 'ENEMY']), [...FORMATIONS.support, 'ALLY']]
      .map(([x, y, side]) => formationPoint(x, y, side));
    assert.equal(new Set(occupied.map(p => `${p.x}:${p.y}`)).size, 11);
    for (const p of occupied) assert.ok(p.x >= 0 && p.x < 9 && p.y >= 0 && p.y < 7);
    const positions = (mode, rows, side) => rows.map(([x, y]) => {const p = formationPoint(x, y, side, mode); return project(configuration(mobile, mode), p.x, p.y);});
    const gap = mode => Math.min(...positions(mode, FORMATIONS.enemies.slice(0, 3), 'ENEMY').map(p => p.x)) - Math.max(...positions(mode, FORMATIONS.allies, 'ALLY').map(p => p.x));
    assert.ok(gap('wide') > gap('original') * 2.8);
  });
  test(`${label}: moving stations preserves every actor's exact baseline perspective scale`, () => {
    const before = configuration(mobile, 'original'), after = configuration(mobile);
    for (const [i, p] of [...FORMATIONS.allies, ...FORMATIONS.enemies].entries()) {
      const a = project(before, ...p), mapped = formationPoint(...p, i < 5 ? 'ALLY' : 'ENEMY'), b = project(after, mapped.x, mapped.y);
      const base = .52 * (mobile ? .84 : 1);
      const resolve = y => scaleAt(before, base, a.y + (y - b.y) * before.tileHeight / after.tileHeight);
      epsilon(resolve(b.y), scaleAt(before, base, a.y));
      for (const step of [-30, 20, 60]) assert.ok(Number.isFinite(resolve(b.y + step)));
    }
    assert.match(gridEngine, /actor\.setFormation\(next\.x, next\.y, originalScale\)/);
    assert.match(gridEngine, /layoutAccountBattleUnit\(\)/);
    assert.match(gridEngine, /this\.accountBattleUnit\.root\.restScale/);
  });
}

test('comparison shares one frozen combat snapshot and cannot alter damage, targets or rewards', () => {
  const catalog = ['fur/manifest-v2.json', 'zenith/manifest-v1.json', 'superstar/manifest-v1.json'].flatMap(p => {
    const m = JSON.parse(read('assets/ui/project-v/characters/' + p)); return m.characters.map(c => ({...c, grade: m.rarity}));
  });
  const equipment = JSON.parse(read('assets/ui/project-v/account-battle-suits/manifest-v2.json'));
  const payload = createEncounter({catalog, equipment, seed: 7123, powerScale: 1}), snapshot = JSON.stringify(payload);
  for (const mobile of [false, true]) for (const mode of ['wide', 'original', 'wide']) {
    bounds(mobile, mode); FORMATIONS.allies.forEach(p => formationPoint(...p, 'ALLY', mode));
  }
  assert.equal(JSON.stringify(payload), snapshot);
  assert.equal(payload.cards.length, 5); assert.equal(payload.battleV2.result.encounter.defeated, 10);
  assert.doesNotMatch(gridEngine, /simulateBattle|createPveBattleV2|fetch\(|POST|damage\s*=/);
  const app = read('preview/v3-wide-grid-v1/source/app.mjs');
  assert.equal((app.match(/createEncounter\(\{/g) || []).length, 1);
  assert.match(app, /if \(!ready \|\| busy/);
});

test('only a preview constructor is substituted; shared live card art, dock and timelines stay intact', () => {
  const html = read('preview/v3-wide-grid-v1/battle.html'), css = read('preview/v3-wide-grid-v1/style.css');
  for (const file of ['card.css', 'battle-v3-live.css', 'zenith-v1.css', 'superstar-v1.css', 'faker-card-v1.css', 'project-v-battle-art-adapter-v1.js', 'battle-v3-live.js']) assert.ok(html.includes(file));
  assert.match(html, /\/preview\/scrapyard-v3-v1\/battle-bridge\.js/);
  assert.doesNotMatch(css, /battle-v3-roster|battle-v3-dock|\.card-image/);
  assert.match(gridEngine, /extends ScrapyardBattleEngine/);
  assert.doesNotMatch(gridEngine, /new Application|new Renderer|playEvents\(|new AudioContext/);
  assert.match(gridEngine, /window\.WideGridLayout === this\.gridControl/);
  const builder = read('scripts/build-v3-wide-grid-preview-v1.mjs');
  assert.match(builder, /endsWith\('\/project-v-pixi-battle\.src\.js'\)/);
  assert.doesNotMatch(builder, /outfile: 'preview\/project-v-v3\//);
  for (const file of ['index.html', 'js/app.js', 'functions/api/[[path]].js']) assert.ok(!read(file).includes('v3-wide-grid-v1'));
});

test('occluded rAF cannot exhaust the drain timeout without advancing the shared playback clock', async () => {
  let clock = 0, state = {active: true, queued: 3, firing: true}, polls = [], finished = false;
  const result = waitForVisualDrain({readState: () => state, clock: () => clock, timeoutMs: 6000, schedule: cb => polls.push(cb)}).then(value => {finished = true; return value;});
  for (let wallSecond = 0; wallSecond < 30; wallSecond++) polls.shift()();
  await Promise.resolve(); assert.equal(finished, false); assert.equal(state.queued, 3);
  clock = 5000; polls.shift()(); await Promise.resolve(); assert.equal(finished, false);
  state = {...state, queued: 0, firing: false}; polls.shift()();
  assert.equal(await result, true); assert.equal(polls.length, 0);
});

test('visual drain remains bounded while rendering advances, and cancellation releases a frozen wait', async () => {
  let clock = 0, active = true, polls = [];
  const wait = () => waitForVisualDrain({readState: () => ({active, queued: 2, firing: true}), clock: () => clock, timeoutMs: 6000, schedule: cb => polls.push(cb)});
  const timed = wait(); clock = 6000; polls.shift()(); assert.equal(await timed, false);
  clock = 0; const cancelled = wait(); active = false; polls.shift()(); assert.equal(await cancelled, true); assert.equal(polls.length, 0);
});
