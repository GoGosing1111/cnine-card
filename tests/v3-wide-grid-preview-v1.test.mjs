import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {GRID, FORMATIONS, configuration, project, formationPoint, scaleAt, bounds, occupiedStations, stationPoint, mercenaryCount} from '../preview/v3-wide-grid-v1/source/grid-layout.mjs';
import {createEncounter} from '../preview/scrapyard-v3-v1/source/encounter-model.mjs';
import {createGridPreview} from '../preview/v3-wide-grid-v1/source/preview-model.mjs';
import {waitForVisualDrain} from '../preview/v3-wide-grid-v1/source/visual-drain.mjs';
import {COMPACT_BOARD, compactStation, fitCompactViewport, preferredFrameHeight, usesCompactViewport} from '../preview/v3-wide-grid-v1/source/viewport-layout.mjs';

const root = new URL('../', import.meta.url);
const read = p => fs.readFileSync(new URL(p, root), 'utf8');
const originalEngine = read('preview/project-v-v3/source/battle/BattleEngine.js');
const gridEngine = read('preview/v3-wide-grid-v1/source/WideGridBattleEngine.js');
const commonLayout = read('preview/project-v-v3/source/battle/OccupiedGridLayout.js');
const epsilon = (a, b) => assert.ok(Math.abs(a - b) < 1e-9, `${a} != ${b}`);

test('comparison baseline matches the actual live 7x6 projection, not a smaller strawman', () => {
  assert.match(originalEngine, /ISO_GRID=\{columns:7,rows:6\}/);
  for (const mobile of [false, true]) for (const [key, value] of Object.entries(configuration(mobile, 'original')))
    assert.ok(originalEngine.includes(`${key}:${value}`) || originalEngine.includes(`${key}:${String(value).replace(/^0\./, '.')}`), `${key}:${value}`);
  assert.deepEqual(FORMATIONS.allies, [[0, 1], [2, 1], [0, 3], [2, 3], [0, 5]]);
});

for (const mobile of [false, true]) {
  const label = mobile ? 'portrait mobile' : 'desktop';
  test(`${label}: occupied stations fit the scene without an empty rectangular floor`, () => {
    const old = bounds(mobile, 'original'), next = bounds(mobile), scene = mobile ? {width: 1050, height: 1500} : {width: 1600, height: 820};
    assert.equal(GRID.wide.kind, 'OCCUPIED_STATIONS');
    assert.ok(mobile ? next.width <= 850 : next.width > old.width * 1.17);
    assert.ok(next.left >= 16 && next.right <= scene.width - 16);
    assert.ok(next.top > 0 && next.bottom + 16 < scene.height);
    const c = configuration(mobile);
    const stations = occupiedStations({mobile});
    assert.equal(stations.length, 12);
    assert.equal(next.bottom, Math.max(...stations.map(p => p.y)) + c.tileHeight / 2);
    assert.doesNotMatch(gridEngine, /GRID\.wide\.(rows|columns)|battlefieldOutline/);
  });
  test(`${label}: one mercenary per side and PVE-only support occupy unique, nonoverlapping tiles`, () => {
    const c = configuration(mobile);
    for (const scenario of ['PVP', 'PVE']) {
      const stations = occupiedStations({mobile, scenario});
      assert.equal(stations.length, 12);
      assert.equal(new Set(stations.map(p => `${p.x}:${p.y}`)).size, stations.length);
      assert.equal(stations.filter(s => s.kind === 'support').length, scenario === 'PVE' ? 1 : 0);
      for (let i = 0; i < stations.length; i++) for (const b of stations.slice(i + 1)) {
        const a = stations[i];
        assert.ok(Math.abs(a.x - b.x) / c.tileWidth + Math.abs(a.y - b.y) / c.tileHeight >= 1, `${a.id} overlaps ${b.id}`);
      }
    }
  });
  test(`${label}: moving stations preserves every actor's exact baseline perspective scale`, () => {
    const before = configuration(mobile, 'original'), after = configuration(mobile);
    for (const [i, p] of [...FORMATIONS.allies, ...FORMATIONS.enemies].entries()) {
      const a = project(before, ...p), mapped = formationPoint(...p, i < 5 ? 'ALLY' : 'ENEMY', 'wide', mobile), b = project(after, mapped.x, mapped.y);
      const base = .52 * (mobile ? .84 : 1);
      const resolve = y => scaleAt(before, base, a.y + (y - b.y) * before.tileHeight / after.tileHeight);
      epsilon(resolve(b.y), scaleAt(before, base, a.y));
      for (const step of [-30, 20, 60]) assert.ok(Number.isFinite(resolve(b.y + step)));
    }
    assert.match(commonLayout, /layoutAccountBattleUnit\(\)/);
    assert.match(commonLayout, /this\.accountBattleUnit\.root\.restScale/);
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
  assert.doesNotMatch(gridEngine + commonLayout, /simulateBattle|createPveBattleV2|fetch\(|POST|damage\s*=/);
  const roster = JSON.parse(read('assets/ui/project-v/mercenaries/mercenary-system-roster-v1.json'));
  const pve = createGridPreview({catalog, equipment, roster, scenario: 'PVE'});
  assert.deepEqual(pve.battleV2, payload.battleV2);
  const pvp = createGridPreview({catalog, equipment, roster});
  for (const side of ['A', 'B']) {assert.equal(pvp.battleV2.teams[side].cards.length, 5); assert.equal(pvp.battleV2.teams[side].supports, undefined);}
  assert.equal(pvp.equippedBattleSuit, undefined);
  assert.equal(pvp.cards.length, 5);
  assert.equal(pvp.wideGridPreview.mercenaries.ALLY.length, 1);
  assert.equal(pvp.wideGridPreview.mercenaries.ENEMY.length, 1);
  assert.equal(pve.wideGridPreview.mercenaries.ENEMY.length, 0);
  for (const art of Object.values(pvp.wideGridPreview.mercenaries).flat()) {
    assert.notEqual(art.sourceArt, art.battleSprite); assert.ok(fs.existsSync(new URL(art.battleSprite, root)));
  }
  const app = read('preview/v3-wide-grid-v1/source/app.mjs');
  assert.match(app, /if \(!ready \|\| busy/);
});

test('compact fitting follows content width; a taller viewport never shrinks or stretches the formation', () => {
  for (const width of [368, 554, 738, 760]) {
    const height = preferredFrameHeight({width, header: 60, dock: 125, notice: 38}) - 60;
    const fitted = fitCompactViewport({width, height, top: 38, bottom: 125});
    const taller = fitCompactViewport({width, height: height + 420, top: 38, bottom: 125});
    epsilon(fitted.scale, (width - 24) / COMPACT_BOARD.width);
    epsilon(taller.scale, fitted.scale);
    epsilon(fitted.scene.width * fitted.scale, width);
    epsilon(fitted.scene.height * fitted.scale, height);
    const a = compactStation('cards', 0, 'ALLY'), b = compactStation('cards', 3, 'ALLY');
    epsilon((b.x - a.x) * taller.scale, (b.x - a.x) * fitted.scale);
    epsilon((b.y - a.y) * taller.scale, (b.y - a.y) * fitted.scale);
    const short = fitCompactViewport({width, height: 400, top: 38, bottom: 125});
    assert.ok(COMPACT_BOARD.height * short.scale <= short.available.height);
    assert.ok(COMPACT_BOARD.width * short.scale <= short.available.width);
  }
  assert.equal(usesCompactViewport(760), true);
  for (const width of [761, 988, 1366, 1600]) assert.equal(preferredFrameHeight({width}), null);
});

test('compact PVP and PVE use distinct occupied stations with the suit inside the allied group', () => {
  for (const scenario of ['PVP', 'PVE']) {
    const rows = occupiedStations({scenario, enemySlots: scenario === 'PVE' ? [0, 1, 2] : [0, 1, 2, 3, 4]})
      .map(s => ({...s, ...compactStation(s.kind, s.index, s.team, scenario)}));
    assert.equal(rows.length, scenario === 'PVE' ? 10 : 12);
    assert.equal(new Set(rows.map(s => `${s.x}:${s.y}`)).size, rows.length);
    for (const [i, a] of rows.entries()) {
      assert.ok(a.x >= 95 && a.x + 95 <= COMPACT_BOARD.width);
      assert.ok(a.y - 39 >= 0 && a.y + 39 <= COMPACT_BOARD.height);
      for (const b of rows.slice(i + 1)) assert.ok(Math.abs(a.x - b.x) / 190 + Math.abs(a.y - b.y) / 78 >= 1);
    }
    if (scenario === 'PVE') {
      const suit = rows.find(s => s.kind === 'support'), allies = rows.filter(s => s.team === 'ALLY' && s.kind !== 'support');
      assert.ok(suit.x > Math.min(...allies.map(a => a.x)) && suit.x < Math.max(...allies.map(a => a.x)));
      assert.ok(suit.y > Math.min(...allies.map(a => a.y)) && suit.y < Math.max(...allies.map(a => a.y)));
    }
  }
});

test('comparison controls extend the common grid; shared card art, dock and timelines stay intact', () => {
  const html = read('preview/v3-wide-grid-v1/battle.html'), css = read('preview/v3-wide-grid-v1/style.css');
  for (const file of ['card.css', 'battle-v3-live.css', 'zenith-v1.css', 'superstar-v1.css', 'faker-card-v1.css', 'project-v-battle-art-adapter-v1.js', 'battle-v3-live.js']) assert.ok(html.includes(file));
  assert.match(html, /\.\/battle-bridge\.js/);
  const bridge = read('preview/v3-wide-grid-v1/battle-bridge.js');
  assert.match(bridge, /mode: payload.mode/);
  assert.match(bridge, /ProjectVBattleV3Live.createRenderer/);
  assert.doesNotMatch(css, /battle-v3-roster|battle-v3-dock|\.card-image/);
  assert.match(gridEngine, /extends ScrapyardBattleEngine/);
  assert.match(originalEngine, /export class BattleEngine extends withOccupiedGrid\(BaseBattleEngine\)/);
  assert.doesNotMatch(gridEngine, /layoutCharacterGrid\(|drawIsometricFloor\(|configureIsometricScene\(/);
  assert.match(read('preview/v3-wide-grid-v1/source/grid-layout.mjs'), /export \* from .*FormationLayout.mjs/);
  assert.doesNotMatch(gridEngine, /new Application|new Renderer|playEvents\(|new AudioContext/);
  assert.match(gridEngine, /window\.WideGridLayout === this\.gridControl/);
  const builder = read('scripts/build-v3-wide-grid-preview-v1.mjs');
  assert.match(builder, /endsWith\('\/project-v-pixi-battle\.src\.js'\)/);
  assert.doesNotMatch(builder, /outfile: 'preview\/project-v-v3\//);
  for (const file of ['index.html', 'js/app.js', 'functions/api/[[path]].js']) assert.ok(!read(file).includes('v3-wide-grid-v1'));
});

test('zero or one mercenary removes unused stations independently on each side, and a second is rejected', () => {
  for (const allyMercenaries of [0, 1]) for (const enemyMercenaries of [0, 1]) {
    const rows = occupiedStations({allyMercenaries, enemyMercenaries});
    assert.equal(rows.length, 10 + allyMercenaries + enemyMercenaries);
    assert.equal(rows.filter(p => p.kind === 'support').length, 0);
  }
  const rows = occupiedStations({scenario: 'PVE', enemySlots: [1], allySlots: [0, 3], allyMercenaries: 0, enemyMercenaries: 1, support: false});
  assert.equal(rows.length, 3);
  assert.deepEqual(rows.map(p => p.id), ['ALLY:cards:0', 'ALLY:cards:3', 'ENEMY:cards:1']);
  for (const invalid of [-1, 2, 3, 1.5, NaN, 'bad']) assert.throws(() => mercenaryCount(invalid));
});

test('the PVE suit sits inside the allied formation above the existing dock on both screen sizes', () => {
  for (const p of occupiedStations()) assert.ok(p.y + configuration().tileHeight / 2 < 624 || (p.x > 620 && p.x < 980));
  const suit = stationPoint('support');
  assert.equal(suit.x, 410);
  assert.ok(suit.y + configuration().tileHeight / 2 < 595);
  const mobileSuit = stationPoint('support', 0, 'ALLY', true);
  assert.equal(mobileSuit.x, 311);
  assert.ok(mobileSuit.y + configuration(true).tileHeight / 2 < 1240);
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
