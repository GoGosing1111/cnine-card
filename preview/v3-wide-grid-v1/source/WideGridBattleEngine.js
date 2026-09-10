import {Assets, Container, Graphics} from 'pixi.js';
import {gsap} from 'gsap';
import {BattleEngine as ScrapyardBattleEngine} from '../../scrapyard-v3-v1/source/ScrapyardBattleEngine.js';
import {BattleEngine as LiveBattleEngine} from '../../project-v-v3/source/battle/BattleEngine.js';
import {GRID, configuration, formationPoint, project, scaleAt, bounds, occupiedStations, mercenaryCount} from './grid-layout.mjs';
import {createMercenaryStations, layoutMercenaryStations} from './MercenaryStations.js';
import {waitForVisualDrain} from './visual-drain.mjs';

// One canonical V3 renderer, with an isolated floor/layout experiment only.
export class BattleEngine extends ScrapyardBattleEngine {
  constructor(options) {
    super(options);
    this.gridMode = new URLSearchParams(location.search).get('grid') === 'original' ? 'original' : 'wide';
    this.mercenaryCounts = {ALLY: 1, ENEMY: 1};
    this.previewMercenaries = [];
  }
  async loadBattlefieldTexture(mode) {
    return this.gridScenario === 'PVP' || mode === 'PVP'
      ? Assets.load('/assets/ui/coin-prediction/arena-v1.png') : super.loadBattlefieldTexture(mode);
  }
  clearPreviewMercenaries() {
    for (const item of this.previewMercenaries || []) if (!item.root.destroyed) item.root.destroy({children: true});
    this.previewMercenaries = [];
  }
  async applyBattlePayload(payload) {
    this.clearPreviewMercenaries();
    for (const actor of this.characters || []) if (Number.isFinite(actor.wideGridOriginalHudY)) actor.hud.y = actor.wideGridOriginalHudY;
    this.gridScenario = payload.wideGridPreview?.scenario || 'PVE';
    if (this.gridScenario === 'PVP') this.instances = new Map();
    const result = this.gridScenario === 'PVP'
      ? await LiveBattleEngine.prototype.applyBattlePayload.call(this, payload) : await super.applyBattlePayload(payload);
    for (const actor of this.characters) actor.wideGridOriginalHudY = actor.hud.y;
    this.previewMercenaries = await createMercenaryStations(this, payload.wideGridPreview?.mercenaries);
    return result;
  }
  async mount(target) {
    await super.mount(target);
    this.gridControl = {setMode: mode => {
      if (this.previewPlaybackBusy) throw new Error('전투 중에는 배치를 바꿀 수 없습니다.');
      if (!['original', 'wide'].includes(mode)) throw new Error('INVALID_GRID_MODE');
      this.gridMode = mode; this.resize(); return this.gridDiagnostics();
    }, setMercenaries: (ally, enemy) => {
      if (this.previewPlaybackBusy) throw new Error('전투 중에는 배치를 바꿀 수 없습니다.');
      this.mercenaryCounts = {ALLY: mercenaryCount(ally), ENEMY: mercenaryCount(enemy)};
      layoutMercenaryStations(this); this.drawIsometricFloor(); this.sortCombatDepth();
      return this.gridDiagnostics();
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
    const next = formationPoint(base.gridX, base.gridY, 'ALLY', 'wide', this.mobile);
    return {...base, gridX: next.x, gridY: next.y};
  }
  drawIsometricFloor() {
    if (this.gridMode === 'original') return super.drawIsometricFloor();
    if (!this.isoFloorLayer || !this.isoConfig) return;
    this.isoFloorLayer.removeChildren().forEach(child => child.destroy({children: true}));
    this.isoTiles = []; this.accountBattleUnitTile = null;
    const {tileWidth: w, tileHeight: h} = this.isoConfig;
    for (const station of occupiedStations(this.floorOptions())) {
      const ally = station.team === 'ALLY', supportTile = station.kind === 'support', mercenary = station.kind === 'mercenaries';
      const accent = supportTile ? 0xffc16f : mercenary ? 0xc49cff : ally ? 0x40cfff : 0xff536b;
      const tile = new Container({label: `OccupiedTile:${station.id}`});
      tile.station = station;
      tile.position.set(station.x, station.y); tile.depthSortY = -100000;
      const polygon = [0, -h / 2, w / 2, 0, 0, h / 2, -w / 2, 0];
      const lower = new Graphics().poly([0, -h * .42, w * .49, 0, 0, h * .58, -w * .49, 0]).fill({color: 0x02060b, alpha: .74});
      lower.y = 7;
      tile.addChild(lower,
        new Graphics().poly(polygon).fill({color: supportTile ? 0x382610 : mercenary ? 0x241536 : ally ? 0x0a3346 : 0x3a111b, alpha: .48})
          .stroke({width: 2, color: accent, alpha: .72}),
        new Graphics().poly([0, -h * .38, w * .38, 0, 0, h * .38, -w * .38, 0]).stroke({width: 1, color: accent, alpha: .2}));
      if (supportTile) {
        tile.isAccountBattleUnitTile = true;
        this.accountBattleUnitTile = tile;
      }
      this.isoFloorLayer.addChild(tile); this.isoTiles.push(tile);
    }
    this.syncAccountBattleUnitTile();
  }
  floorOptions() {
    const activeSlots = actors => (actors || []).flatMap((actor, i) => actor.battleActive && actor.hp > 0 ? [i] : []);
    return {mobile: this.mobile, scenario: this.gridScenario || 'PVE', allySlots: activeSlots(this.allies), enemySlots: activeSlots(this.enemies),
      allyMercenaries: this.previewMercenaries?.filter(m => m.team === 'ALLY' && m.root.visible).length || 0,
      enemyMercenaries: this.previewMercenaries?.filter(m => m.team === 'ENEMY' && m.root.visible).length || 0,
      support: Boolean(this.accountBattleUnitEnabled)};
  }
  sortCombatDepth() {
    super.sortCombatDepth();
    if (this.gridMode !== 'wide') return;
    for (const tile of this.isoTiles || []) if (tile.station?.kind === 'cards') {
      const actor = (tile.station.team === 'ALLY' ? this.allies : this.enemies)?.[tile.station.index];
      tile.visible = Boolean(actor?.battleActive && actor.hp > 0 && actor.root.visible);
    }
  }
  bindMonster(row) {
    const actor = super.bindMonster(row);
    actor.wideGridOriginalHudY = actor.hud.y;
    if (this.gridMode === 'wide' && this.liveDeployed) actor.hud.y = -(actor.fullBodyHeight + 88);
    if (this.gridMode === 'wide') this.drawIsometricFloor();
    return actor;
  }
  layoutCharacterGrid() {
    if (this.gridMode !== 'wide') {
      for (const actor of this.characters) if (Number.isFinite(actor.wideGridOriginalHudY)) actor.hud.y = actor.wideGridOriginalHudY;
      layoutMercenaryStations(this); return super.layoutCharacterGrid();
    }
    const wide = this.isoConfig, original = configuration(this.mobile, 'original');
    // Ask the real renderer for the canonical scale/HUD/formation first.
    this.baselineLayout = true; this.isoConfig = original;
    try {super.layoutCharacterGrid();} finally {this.baselineLayout = false; this.isoConfig = wide;}
    for (const actor of [...this.allies, ...this.enemies]) {
      const originalY = actor.baseY, originalScale = actor.restScale;
      const p = formationPoint(actor.gridPosition.x, actor.gridPosition.y, actor.team, 'wide', this.mobile);
      const next = project(wide, p.x, p.y);
      actor.gridPosition = p; actor.setFormation(next.x, next.y, originalScale);
      // Put the existing name/HP plate near its own sprite, not above a neighbour.
      actor.hud.y = -(actor.fullBodyHeight + 88);
      // Moving the battle stations must not secretly make the actors smaller.
      actor.perspectiveResolver = y => scaleAt(original, actor.designScale,
        originalY + (y - next.y) * original.tileHeight / wide.tileHeight);
      actor.root.depthSortY = next.y;
    }
    if (this.accountBattleUnit) {
      const p = this.accountBattleUnitFormation(), next = this.gridToScreen(p.gridX, p.gridY);
      this.accountBattleUnit.setFormation(next.x, next.y, this.accountBattleUnit.root.restScale);
    }
    layoutMercenaryStations(this);
    this.drawIsometricFloor();
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
    const mode = this.gridMode, floor = bounds(this.mobile, mode, this.floorOptions()), baseline = bounds(this.mobile, 'original');
    return {mode, scenario: this.gridScenario, mobile: this.mobile, grid: GRID[mode], floor, widthGain: floor.width / baseline.width - 1,
      tiles: (this.isoTiles || []).filter(t => t.visible).map(t => ({id: t.station?.id || t.label, x: t.x, y: t.y, kind: t.station?.kind})),
      mercenaries: (this.previewMercenaries || []).filter(m => m.root.visible).map(m => ({code: m.art.code, team: m.team, index: m.index,
        sprite: m.art.battleSprite, x: m.root.x, y: m.root.y, scale: m.root.scale.x, anchor: m.art.footAnchor})),
      rootScale: this.root?.scale.x, scene: this.scene,
      actors: [...this.allies, ...this.enemies].map(a => ({id: a.id, team: a.team, active: a.battleActive,
        grid: a.gridPosition, x: a.baseX, y: a.baseY, scale: a.restScale, depth: a.perspectiveDepth})),
      support: this.accountBattleUnitEnabled ? {x: this.accountBattleUnit.root.baseX, y: this.accountBattleUnit.root.baseY, scale: this.accountBattleUnit.root.restScale} : null};
  }
  diagnostics() {
    const result = super.diagnostics();
    return {...result, projection: {...result.projection, grid: GRID[this.gridMode]}, wideGrid: this.gridDiagnostics()};
  }
  destroy() {
    this.clearPreviewMercenaries();
    if (window.WideGridLayout === this.gridControl) delete window.WideGridLayout;
    super.destroy();
  }
}
