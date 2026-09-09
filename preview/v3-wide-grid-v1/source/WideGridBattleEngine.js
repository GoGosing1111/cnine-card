import {Container, Graphics} from 'pixi.js';
import {gsap} from 'gsap';
import {BattleEngine as ScrapyardBattleEngine} from '../../scrapyard-v3-v1/source/ScrapyardBattleEngine.js';
import {GRID, FORMATIONS, configuration, formationPoint, project, scaleAt, bounds} from './grid-layout.mjs';
import {waitForVisualDrain} from './visual-drain.mjs';

// One canonical V3 renderer, with an isolated floor/layout experiment only.
export class BattleEngine extends ScrapyardBattleEngine {
  constructor(options) {
    super(options);
    this.gridMode = new URLSearchParams(location.search).get('grid') === 'original' ? 'original' : 'wide';
  }
  async mount(target) {
    await super.mount(target);
    this.gridControl = {setMode: mode => {
      if (!['original', 'wide'].includes(mode)) throw new Error('INVALID_GRID_MODE');
      this.gridMode = mode; this.resize(); return this.gridDiagnostics();
    }, diagnostics: () => this.gridDiagnostics()};
    window.WideGridLayout = this.gridControl;
    return this;
  }
  configureIsometricScene() {
    this.isoConfig = configuration(this.mobile, this.gridMode || 'wide');
    return this.isoConfig;
  }
  accountBattleUnitFormation() {
    const base = super.accountBattleUnitFormation();
    if (this.gridMode !== 'wide' || this.baselineLayout) return base;
    const next = formationPoint(base.gridX, base.gridY, 'ALLY');
    return {...base, gridX: next.x, gridY: next.y};
  }
  drawIsometricFloor() {
    if (this.gridMode === 'original') return super.drawIsometricFloor();
    if (!this.isoFloorLayer || !this.isoConfig) return;
    this.isoFloorLayer.removeChildren().forEach(child => child.destroy({children: true}));
    this.isoTiles = []; this.accountBattleUnitTile = null;
    const {tileWidth: w, tileHeight: h} = this.isoConfig;
    const keys = (rows, team) => new Set(rows.map(([x, y]) => {
      const p = formationPoint(x, y, team); return `${p.x}:${p.y}`;
    }));
    const allies = keys(FORMATIONS.allies, 'ALLY'), enemies = keys(FORMATIONS.enemies.slice(0, 3), 'ENEMY');
    const support = this.accountBattleUnitFormation();
    for (let y = 0; y < GRID.wide.rows; y++) for (let x = 0; x < GRID.wide.columns; x++) {
      const key = `${x}:${y}`, ally = allies.has(key), enemy = enemies.has(key);
      const supportTile = x === support.gridX && y === support.gridY;
      const accent = ally ? 0x40cfff : enemy ? 0xff536b : 0x6e8aa0;
      const tile = new Container({label: `WideIsoTile:${key}`}), point = this.gridToScreen(x, y);
      tile.position.set(point.x, point.y); tile.depthSortY = -100000;
      const polygon = [0, -h / 2, w / 2, 0, 0, h / 2, -w / 2, 0];
      const lower = new Graphics().poly([0, -h * .42, w * .49, 0, 0, h * .58, -w * .49, 0]).fill({color: 0x02060b, alpha: .74});
      lower.y = 7;
      tile.addChild(lower,
        new Graphics().poly(polygon).fill({color: ally ? 0x0a3346 : enemy ? 0x3a111b : (x + y) % 2 ? 0x0e1922 : 0x101e29, alpha: ally || enemy ? .58 : .48})
          .stroke({width: ally || enemy ? 2 : 1, color: accent, alpha: ally || enemy ? .72 : .25}),
        new Graphics().poly([0, -h * .38, w * .38, 0, 0, h * .38, -w * .38, 0]).stroke({width: 1, color: accent, alpha: ally || enemy ? .2 : .095}));
      if (supportTile) {
        tile.isAccountBattleUnitTile = true;
        tile.accountSupportAccent = new Graphics().poly(polygon).fill({color: 0x0a3346, alpha: .58}).stroke({width: 2, color: 0x40cfff, alpha: .72});
        tile.addChild(tile.accountSupportAccent); this.accountBattleUnitTile = tile;
      }
      this.isoFloorLayer.addChild(tile); this.isoTiles.push(tile);
    }
    const top = this.gridToScreen(0, 0), right = this.gridToScreen(8, 0), bottom = this.gridToScreen(8, 6), left = this.gridToScreen(0, 6);
    this.isoFloorLayer.addChild(new Graphics().poly([top.x, top.y - h / 2, right.x + w / 2, right.y, bottom.x, bottom.y + h / 2, left.x - w / 2, left.y])
      .stroke({width: 3, color: 0x9bdfff, alpha: .2}));
    this.syncAccountBattleUnitTile();
  }
  layoutCharacterGrid() {
    if (this.gridMode !== 'wide') return super.layoutCharacterGrid();
    const wide = this.isoConfig, original = configuration(this.mobile, 'original');
    // Ask the real renderer for the canonical scale/HUD/formation first.
    this.baselineLayout = true; this.isoConfig = original;
    try {super.layoutCharacterGrid();} finally {this.baselineLayout = false; this.isoConfig = wide;}
    for (const actor of [...this.allies, ...this.enemies]) {
      const originalY = actor.baseY, originalScale = actor.restScale;
      const p = formationPoint(actor.gridPosition.x, actor.gridPosition.y, actor.team);
      const next = project(wide, p.x, p.y);
      actor.gridPosition = p; actor.setFormation(next.x, next.y, originalScale);
      // Moving the battle stations must not secretly make the actors smaller.
      actor.perspectiveResolver = y => scaleAt(original, actor.designScale,
        originalY + (y - next.y) * original.tileHeight / wide.tileHeight);
      actor.root.depthSortY = next.y;
    }
    if (this.accountBattleUnit) {
      const p = this.accountBattleUnitFormation(), next = this.gridToScreen(p.gridX, p.gridY);
      this.accountBattleUnit.setFormation(next.x, next.y, this.accountBattleUnit.root.restScale);
    }
  }
  layoutAccountBattleUnit() {
    if (this.gridMode !== 'wide' || this.baselineLayout) return super.layoutAccountBattleUnit();
    const wide = this.isoConfig;
    this.baselineLayout = true; this.isoConfig = configuration(this.mobile, 'original');
    try {super.layoutAccountBattleUnit();} finally {this.baselineLayout = false; this.isoConfig = wide;}
    if (!this.accountBattleUnit) return;
    const p = this.accountBattleUnitFormation(), next = this.gridToScreen(p.gridX, p.gridY);
    this.accountBattleUnit.setFormation(next.x, next.y, this.accountBattleUnit.root.restScale);
  }
  waitForAccountBattleUnitDamageQueueDrain(timeoutMs = 2500) {
    const run = this.accountBattleUnitFireRun;
    return waitForVisualDrain({timeoutMs, clock: () => gsap.globalTimeline.time() * 1000,
      readState: () => ({active: Boolean(run?.active && this.accountBattleUnitFireRun === run),
        queued: this.accountBattleUnitDamageQueue?.length || 0, firing: Boolean(this.accountBattleUnit?.fireTimeline)})});
  }
  gridDiagnostics() {
    const mode = this.gridMode, floor = bounds(this.mobile, mode), baseline = bounds(this.mobile, 'original');
    return {mode, mobile: this.mobile, grid: GRID[mode], floor, widthGain: floor.width / baseline.width - 1,
      rootScale: this.root?.scale.x, scene: this.scene,
      actors: [...this.allies, ...this.enemies].map(a => ({id: a.id, team: a.team, active: a.battleActive,
        grid: a.gridPosition, x: a.baseX, y: a.baseY, scale: a.restScale, depth: a.perspectiveDepth})),
      support: this.accountBattleUnit ? {x: this.accountBattleUnit.root.baseX, y: this.accountBattleUnit.root.baseY, scale: this.accountBattleUnit.root.restScale} : null};
  }
  diagnostics() {
    const result = super.diagnostics();
    return {...result, projection: {...result.projection, grid: GRID[this.gridMode]}, wideGrid: this.gridDiagnostics()};
  }
  destroy() {
    if (window.WideGridLayout === this.gridControl) delete window.WideGridLayout;
    super.destroy();
  }
}
