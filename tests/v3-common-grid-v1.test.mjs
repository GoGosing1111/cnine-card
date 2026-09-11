import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {Container} from 'pixi.js';
import {withOccupiedGrid} from '../preview/project-v-v3/source/battle/OccupiedGridLayout.js';

const root = new URL('../', import.meta.url);
const read = file => readFileSync(new URL(file, root), 'utf8');
const hash = text => createHash('sha256').update(text.replace(/\r\n/g, '\n')).digest('hex');
class PresentationHarness {
  constructor() {
    const actors = () => Array.from({length: 5}, () => ({hp: 100, battleActive: true}));
    this.allies = actors(); this.enemies = actors(); this.characters = [...this.allies, ...this.enemies];
    this.isoFloorLayer = new Container(); this.mobile = false;
  }
  sortCombatDepth() {}
}
const Grid = withOccupiedGrid(PresentationHarness);
function engine() {const value = new Grid(); value.configureIsometricScene(); return value;}
const tileIds = value => value.isoTiles.map(tile => tile.station.id);

test('common floor follows deployment, KO, revival and replacement without trailing cells', () => {
  const value = engine();
  value.enemies[3].battleActive = value.enemies[4].battleActive = false;
  value.drawIsometricFloor(); assert.equal(value.isoTiles.length, 8);
  const survivingTile = value.isoTiles[0];
  value.sortCombatDepth(); assert.equal(value.isoTiles[0], survivingTile, 'unchanged frames reuse tiles');
  value.allies[4].hp = 0; value.sortCombatDepth();
  assert.equal(value.isoTiles.length, 7); assert.ok(!tileIds(value).includes('ALLY:cards:4'));
  value.allies[4].hp = 25; value.enemies[3].battleActive = true; value.sortCombatDepth();
  assert.equal(value.isoTiles.length, 9); assert.ok(tileIds(value).includes('ALLY:cards:4'));
  assert.ok(tileIds(value).includes('ENEMY:cards:3'));
  for (const actor of value.characters) actor.hp = 0;
  value.sortCombatDepth(); assert.deepEqual(tileIds(value), []); assert.equal(value.gridDiagnostics().floor, null);
  value.isoFloorLayer.destroy({children: true});
});

test('floor remains at formation stations while sprites attack or move', () => {
  const value = engine(); value.drawIsometricFloor();
  const before = value.gridDiagnostics().tiles;
  value.allies[0].root = {x: 990, y: 500}; value.allies[0].baseX = -800;
  value.sortCombatDepth(); assert.deepEqual(value.gridDiagnostics().tiles, before);
  value.isoFloorLayer.destroy({children: true});
});

test('one optional mercenary per team never enters regular combat arrays and removes its tile when unequipped', () => {
  const value = engine(), counts = [value.allies.length, value.enemies.length, value.characters.length];
  const ally = {team: 'ALLY', root: new Container()}, enemy = {team: 'ENEMY', root: new Container()};
  value.setFormationMercenaries([ally, enemy]); assert.equal(value.isoTiles.length, 12);
  assert.deepEqual([value.allies.length, value.enemies.length, value.characters.length], counts);
  assert.throws(() => value.setFormationMercenaries([ally, ally]), /MAX_ONE_MERCENARY/);
  assert.throws(() => value.setFormationMercenaries([{team: 'OTHER', root: ally.root}]), /INVALID_MERCENARY/);
  assert.deepEqual(value.formationMercenaries, [ally, enemy], 'invalid registration is atomic');
  ally.enabled = false; value.setFormationMercenaries([ally, enemy]); assert.equal(value.isoTiles.length, 11);
  value.setFormationMercenaries([]); assert.equal(value.isoTiles.length, 10);
  value.isoFloorLayer.destroy({children: true}); ally.root.destroy(); enemy.root.destroy();
});

test('only enabled support and visible escort objective get occupied cells', () => {
  const value = engine();
  value.accountBattleUnit = {}; value.objectiveSprite = {visible: false}; value.objectiveData = {};
  value.drawIsometricFloor(); assert.equal(value.isoTiles.length, 10);
  value.accountBattleUnitEnabled = true; value.objectiveSprite.visible = true; value.sortCombatDepth();
  assert.equal(value.isoTiles.length, 12);
  assert.equal(value.accountBattleUnitTile.station.kind, 'support');
  value.accountBattleUnitEnabled = false; value.objectiveSprite.visible = false; value.sortCombatDepth();
  assert.equal(value.isoTiles.length, 10); assert.equal(value.accountBattleUnitTile, null);
  value.isoFloorLayer.destroy({children: true});
});

test('single boss, ally-center support and escort carrier have separate stations on desktop and mobile', () => {
  const value = engine(); value.formationScenario = 'PVE'; value.formationSingleTarget = true;
  assert.deepEqual(value.station('support'), {x: 410, y: 425});
  assert.deepEqual(value.station('cards', 0, 'ENEMY'), {x: 1210, y: 425});
  assert.deepEqual(value.station('objective'), {x: 890, y: 540});
  value.viewportFit = {offsetX: 30, offsetY: 90};
  assert.deepEqual(value.station('support'), {x: 275, y: 780});
  assert.deepEqual(value.station('cards', 0, 'ENEMY'), {x: 835, y: 740});
  assert.deepEqual(value.station('objective'), {x: 820, y: 1060});
  value.isoFloorLayer.destroy();
});

test('all seven served V3 bundles are rebuilt together from the current common grid', () => {
  const report = JSON.parse(read('preview/project-v-v3/grid-build-report.json'));
  assert.equal(report.version, 'OCCUPIED_GRID_V1');
  assert.equal(report.outputs.length, 7); assert.equal(report.sources.length, 4);
  const seen = new Set();
  for (const row of [...report.sources, ...report.outputs]) {
    assert.ok(!seen.has(row.file)); seen.add(row.file);
    assert.equal(hash(read(row.file)), row.sha256, `stale consumer/source: ${row.file}; run npm run build:v3-grid`);
  }
  for (const row of report.outputs) {
    assert.equal(row.commonGrid, true); assert.match(read(row.file), /OCCUPIED_GRID_V1/);
  }
  const pkg = JSON.parse(read('package.json'));
  assert.match(pkg.scripts['build:v3'], /build:v3-grid/);
  assert.match(pkg.scripts['release:gate'], /test:v3-grid/);
});
