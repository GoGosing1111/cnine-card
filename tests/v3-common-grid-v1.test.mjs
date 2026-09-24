import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {Container} from 'pixi.js';
import {withOccupiedGrid} from '../preview/project-v-v3/source/battle/OccupiedGridLayout.js';
import {configuration, unproject} from '../preview/project-v-v3/source/battle/FormationLayout.mjs';
import {BattleCharacter} from '../preview/project-v-v3/source/battle/BattleCharacter.js';

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

test('movement depth updates keep uniform nameplates anchored to the body on both factions', () => {
  for (const team of ['ALLY', 'ENEMY']) {
    const actor = {team, formationHudY: -342.8, root: new Container(), hud: new Container(), stateHalo: new Container(), shadow: new Container()};
    for (const depth of [0, .2, .5, .9, 1]) {
      BattleCharacter.prototype.updatePerspective.call(actor, depth);
      assert.equal(actor.hud.y, actor.formationHudY);
      assert.equal(actor.hud.scale.x, 1);
    }
    delete actor.formationHudY;
    BattleCharacter.prototype.updatePerspective.call(actor, 0);
    assert.equal(actor.hud.y, -392, 'comparison baseline can restore legacy layout');
    for (const key of ['root', 'hud', 'stateHalo', 'shadow']) actor[key].destroy();
  }
});

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
  assert.deepEqual(value.station('support'), {x: 380, y: 416});
  assert.deepEqual(value.station('cards', 0, 'ENEMY'), {x: 1010, y: 416});
  assert.deepEqual(value.station('objective'), {x: 800, y: 592});
  value.viewportFit = {offsetX: 30, offsetY: 90};
  assert.deepEqual(value.station('support'), {x: 354, y: 670});
  assert.deepEqual(value.station('cards', 0, 'ENEMY'), {x: 786, y: 670});
  assert.deepEqual(value.station('objective'), {x: 570, y: 970});
  value.isoFloorLayer.destroy();
});

test('repeated layouts give both factions, mercenaries and support the same scale without accumulating old slot/depth factors', () => {
  class Legacy extends PresentationHarness {
    constructor() {
      super();
      this.characters.forEach((actor, index) => Object.assign(actor, {root: new Container(), hud: {y: 0}, fullBodyHeight: 360,
        setFormation(x, y, scale) {this.baseX = x; this.baseY = y; this.restScale = scale;},
        setCompactHud() {}, updatePerspective(value) {this.perspectiveDepth = value;}}));
      this.accountBattleUnit = {root: new Container(), setFormation(x, y, scale) {this.root.baseX = x; this.root.baseY = y; this.root.restScale = scale;}};
    }
    layoutCharacterGrid() {
      this.characters.forEach((actor, index) => {actor.baseY = 100 + index * 29; actor.restScale = .31 + index * .08; actor.designScale = .48 + index * .01;});
      this.accountBattleUnit.root.restScale = .37;
    }
    screenToGrid(x, y) {const p = unproject(this.isoConfig, x, y); return {gridX: p.x, gridY: p.y};}
  }
  const Uniform = withOccupiedGrid(Legacy), value = new Uniform();
  const mercenary = {team: 'ALLY', root: new Container()}; value.formationMercenaries = [mercenary];
  for (const compact of [false, true, false, true]) {
    value.mobile = compact; value.viewportFit = compact ? {offsetX: 30, offsetY: 90, actorScale: 1.3} : null;
    value.configureIsometricScene();
    value.layoutCharacterGrid();
    const expected = compact ? .65 : .5;
    for (const actor of value.characters) {
      assert.equal(actor.restScale, expected);
      assert.equal(actor.perspectiveResolver(actor.baseY - 400), expected);
      assert.equal(actor.perspectiveResolver(actor.baseY + 400), expected);
      const p = unproject(configuration(false), actor.baseX, actor.baseY);
      assert.deepEqual(actor.gridPosition, p, 'movement still uses the common inverse projection');
    }
    assert.equal(value.accountBattleUnit.root.restScale, expected);
    assert.equal(mercenary.root.scale.x, expected);
  }
  value.isoFloorLayer.destroy({children: true});
  for (const actor of value.characters) actor.root.destroy();
  mercenary.root.destroy(); value.accountBattleUnit.root.destroy();
});

test('all nine served V3 bundles including the account entry share the current common grid', () => {
  const report = JSON.parse(read('preview/project-v-v3/grid-build-report.json'));
  assert.equal(report.version, 'OCCUPIED_GRID_V1');
  assert.equal(report.layoutVersion, 'UNIFORM_LATTICE_V2');
  assert.equal(report.outputs.length, 9); assert.equal(report.sources.length, 47);
  for(const file of ['preview/project-v-v3/source/battle/CryvernCombatPlayback.js','preview/mercenary-ice-crystal-dual-sword-v1/source/IceDualSwordFX.js','preview/mercenary-ice-crystal-dual-sword-v1/skill.mjs','shared/mercenary-cryvern-v1.mjs'])
    assert.ok(report.sources.some(row=>row.file===file),`${file} must participate in bundle freshness checks`);
  // The already released OctaSeeker adds five inputs to the same nine bundles.
  for(const file of ['shared/battle-suit-skill-chips.mjs','preview/project-v-v3/source/battle/BattleSuitSkillChipPlayback.js','preview/battle-suit-octaseeker-v1/source/sequence.mjs','preview/battle-suit-octaseeker-v1/source/OctaSeekerFX.js','preview/battle-suit-octaseeker-v1/source/OctaSeekerAudio.js'])
    assert.ok(report.sources.some(row=>row.file===file),`${file} must participate in bundle freshness checks`);
  for(const file of ['preview/project-v-v3/source/battle/HeukwolCombatPlayback.js','preview/mercenary-black-moon-swordsman-ss-v1/source/BlackMoonFX.js','preview/mercenary-black-moon-swordsman-ss-v1/skill.mjs','shared/mercenary-heukwol-v1.mjs','preview/project-v-mercenary-system-v1/source/MercenarySpriteSequence.js'])
    assert.ok(report.sources.some(row=>row.file===file),`${file} must participate in bundle freshness checks`);
  for(const file of ['preview/project-v-v3/source/battle/BikiniJoeunCombatPlayback.js','preview/mercenary-bikini-joeun-v1/source/BikiniJoeunSkillFX.js','shared/mercenary-bikini-joeun-v1.mjs'])
    assert.ok(report.sources.some(row=>row.file===file),`${file} must participate in bundle freshness checks`);
  for(const name of ['AccountBattleUnit.js','ZBodySwordAnimation.js','ZBodySwordModel.mjs','ZBodyDashProfile.mjs','ZBodyDashFX.mjs'])
    assert.ok(report.sources.some(row=>row.file===`preview/project-v-v3/source/battle/${name}`),`${name} must participate in bundle freshness checks`);
  assert.ok(report.sources.some(row=>row.file==='preview/project-v-v3/source/battle/MercenaryRoleAttackFX.js'));
  assert.ok(report.sources.some(row=>row.file==='preview/project-v-v3/source/battle/ProjectileTrail.mjs'));
  assert.ok(report.sources.some(row=>row.file==='preview/project-v-v3/source/battle/MangisaCombatPlayback.js'));
  assert.ok(report.sources.some(row=>row.file==='preview/mercenary-mangisa-v1/source/MangisaSkillFX.js'));
  const seen = new Set();
  assert.equal(report.layoutClients.length, 1);
  for (const row of [...report.sources, ...report.outputs, ...report.layoutClients]) {
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
