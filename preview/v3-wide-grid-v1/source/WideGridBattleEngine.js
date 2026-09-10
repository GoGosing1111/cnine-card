import {Assets, Container, Graphics} from 'pixi.js';
import {gsap} from 'gsap';
import {BattleEngine as ScrapyardBattleEngine} from '../../scrapyard-v3-v1/source/ScrapyardBattleEngine.js';
import {BattleEngine as LiveBattleEngine} from '../../project-v-v3/source/battle/BattleEngine.js';
import {GRID, configuration, formationPoint, project, scaleAt, bounds, occupiedStations, mercenaryCount} from './grid-layout.mjs';
import {createMercenaryStations, layoutMercenaryStations} from './MercenaryStations.js';
import {waitForVisualDrain} from './visual-drain.mjs';
import {compactStation, fitCompactViewport, usesCompactViewport} from './viewport-layout.mjs';

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
    }, refreshViewport: () => {this.app.resize(); return this.gridDiagnostics();},
    geometry: () => this.viewportGeometry(), diagnostics: () => this.gridDiagnostics()};
    window.WideGridLayout = this.gridControl;
    return this;
  }
  configureIsometricScene() {
    this.isoConfig = configuration(this.viewportFit ? false : this.mobile, this.gridMode || 'wide');
    return this.isoConfig;
  }
  station(kind, index = 0, team = 'ALLY') {
    if (!this.viewportFit) return null;
    const p = compactStation(kind, index, team, this.gridScenario || 'PVE');
    return {x: p.x + this.viewportFit.offsetX, y: p.y + this.viewportFit.offsetY};
  }
  resize() {
    this.viewportFit = null;
    super.resize();
    if (!this.root || this.gridMode !== 'wide' || !usesCompactViewport(this.app.screen.width)) return;
    const hostRect = this.host.getBoundingClientRect(), shell = this.host.closest('.battle-v3-live-shell');
    const dock = shell?.querySelector('.battle-v3-dock')?.getBoundingClientRect();
    const status = shell?.querySelector('.battle-v3-status');
    const statusRect = status && getComputedStyle(status).display !== 'none' ? status.getBoundingClientRect() : null;
    const bottom = dock?.height > 0 ? Math.max(0, hostRect.bottom - dock.top) : 130;
    const top = statusRect?.height > 0 ? Math.max(0, statusRect.bottom - hostRect.top) : 8;
    this.viewportFit = fitCompactViewport({width: this.app.screen.width, height: this.app.screen.height, top, bottom});
    this.scene = this.viewportFit.scene;
    this.root.scale.set(this.viewportFit.scale);
    this.root.position.set(0, 0);
    this.camera.setViewport(this.scene.width, this.scene.height);
    this.skillTimeline.width = this.scene.width; this.skillTimeline.height = this.scene.height;
    this.layoutParallax(this.scene.width, this.scene.height);
    if (this.bottomShade) {this.bottomShade.width = this.scene.width; this.bottomShade.height = bottom / this.viewportFit.scale; this.bottomShade.y = this.scene.height - this.bottomShade.height;}
    this.configureIsometricScene();
    this.layoutCharacterGrid();
    this.sortCombatDepth();
    // Reuse the common Pixi overlays; the HTML roster remains untouched.
    this.uiLayer.statusPanel.position.set(this.scene.width / 2 - 300, this.scene.height - 62);
    this.uiLayer.status.position.set(this.scene.width / 2, this.scene.height - 41);
    this.uiLayer.banner.position.set(this.scene.width / 2 - 290, 118);
  }
  accountBattleUnitFormation() {
    const base = super.accountBattleUnitFormation();
    if (this.gridMode !== 'wide' || this.baselineLayout) return base;
    const fitted = this.station('support');
    if (fitted) {
      const p = this.screenToGrid(fitted.x, fitted.y);
      return {...base, ...p};
    }
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
      const fitted = this.station(station.kind, station.index, station.team);
      if (fitted) Object.assign(station, fitted);
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
    const wide = this.isoConfig, original = configuration(this.viewportFit ? false : this.mobile, 'original');
    const mobile = this.mobile;
    // Ask the real renderer for the canonical scale/HUD/formation first.
    this.baselineLayout = true; this.isoConfig = original;
    if (this.viewportFit) this.mobile = false;
    try {super.layoutCharacterGrid();} finally {this.baselineLayout = false; this.isoConfig = wide; this.mobile = mobile;}
    for (const actor of [...this.allies, ...this.enemies]) {
      const originalY = actor.baseY, originalScale = actor.restScale;
      const p = formationPoint(actor.gridPosition.x, actor.gridPosition.y, actor.team, 'wide', this.mobile);
      const slot = (actor.team === 'ALLY' ? this.allies : this.enemies).indexOf(actor);
      const next = this.station('cards', slot, actor.team) || project(wide, p.x, p.y);
      const scaleMultiplier = this.viewportFit?.actorScale || 1;
      const mapped = this.screenToGrid(next.x, next.y);
      actor.gridPosition = {x: mapped.gridX, y: mapped.gridY};
      actor.setFormation(next.x, next.y, originalScale * scaleMultiplier);
      actor.setCompactHud?.(mobile);
      // Put the existing name/HP plate near its own sprite, not above a neighbour.
      actor.hud.y = -(actor.fullBodyHeight + 88);
      // Moving the battle stations must not secretly make the actors smaller.
      actor.perspectiveResolver = y => scaleMultiplier * scaleAt(original, actor.designScale,
        originalY + (y - next.y) * original.tileHeight / wide.tileHeight);
      actor.root.depthSortY = next.y;
    }
    if (this.accountBattleUnit) {
      const p = this.accountBattleUnitFormation(), next = this.gridToScreen(p.gridX, p.gridY);
      this.accountBattleUnit.setFormation(next.x, next.y, this.accountBattleUnit.root.restScale * (this.viewportFit?.actorScale || 1));
    }
    layoutMercenaryStations(this);
    this.drawIsometricFloor();
  }
  layoutAccountBattleUnit() {
    if (this.gridMode !== 'wide' || this.baselineLayout) return super.layoutAccountBattleUnit();
    const wide = this.isoConfig;
    const mobile = this.mobile;
    this.baselineLayout = true; this.isoConfig = configuration(this.viewportFit ? false : this.mobile, 'original');
    if (this.viewportFit) this.mobile = false;
    try {super.layoutAccountBattleUnit();} finally {this.baselineLayout = false; this.isoConfig = wide; this.mobile = mobile;}
    if (!this.accountBattleUnit) return;
    const p = this.accountBattleUnitFormation(), next = this.gridToScreen(p.gridX, p.gridY);
    this.accountBattleUnit.setFormation(next.x, next.y, this.accountBattleUnit.root.restScale * (this.viewportFit?.actorScale || 1));
  }
  waitForAccountBattleUnitDamageQueueDrain(timeoutMs = 2500) {
    const run = this.accountBattleUnitFireRun;
    return waitForVisualDrain({timeoutMs, clock: () => gsap.globalTimeline.time() * 1000,
      readState: () => ({active: Boolean(run?.active && this.accountBattleUnitFireRun === run),
        queued: this.accountBattleUnitDamageQueue?.length || 0, firing: Boolean(this.accountBattleUnit?.fireTimeline)})});
  }
  gridDiagnostics() {
    const mode = this.gridMode, baseline = bounds(this.mobile, 'original');
    let floor = bounds(this.mobile, mode, this.floorOptions());
    const occupied = (this.isoTiles || []).filter(t => t.visible);
    if (this.viewportFit && occupied.length) {
      const {tileWidth: w, tileHeight: h} = this.isoConfig;
      const left = Math.min(...occupied.map(t => t.x)) - w / 2, right = Math.max(...occupied.map(t => t.x)) + w / 2;
      const top = Math.min(...occupied.map(t => t.y)) - h / 2, bottom = Math.max(...occupied.map(t => t.y)) + h / 2;
      floor = {left, right, top, bottom, width: right - left, height: bottom - top};
    }
    return {mode, scenario: this.gridScenario, mobile: this.mobile, grid: GRID[mode], floor, widthGain: floor.width / baseline.width - 1,
      tiles: (this.isoTiles || []).filter(t => t.visible).map(t => ({id: t.station?.id || t.label, x: t.x, y: t.y, kind: t.station?.kind})),
      mercenaries: (this.previewMercenaries || []).filter(m => m.root.visible).map(m => ({code: m.art.code, team: m.team, index: m.index,
        sprite: m.art.battleSprite, x: m.root.x, y: m.root.y, scale: m.root.scale.x, anchor: m.art.footAnchor})),
      rootScale: this.root?.scale.x, scene: this.scene, viewportFit: this.viewportFit,
      actors: [...this.allies, ...this.enemies].map(a => ({id: a.id, team: a.team, active: a.battleActive,
        grid: a.gridPosition, x: a.baseX, y: a.baseY, scale: a.restScale, depth: a.perspectiveDepth})),
      support: this.accountBattleUnitEnabled ? {x: this.accountBattleUnit.root.baseX, y: this.accountBattleUnit.root.baseY, scale: this.accountBattleUnit.root.restScale} : null};
  }
  viewportGeometry() {
    const rect = node => {const b = node.getBounds(); return {x: b.x, y: b.y, width: b.width, height: b.height};};
    return {width: this.app.screen.width, height: this.app.screen.height, fit: this.viewportFit,
      actors: this.characters.filter(a => a.battleActive && a.hp > 0).map(a => ({id: a.id, team: a.team,
        body: rect(a.fullBodySprite), hud: rect(a.hud), foot: {x: a.baseX * this.root.scale.x + this.root.x, y: a.baseY * this.root.scale.y + this.root.y}})),
      mercenaries: this.previewMercenaries.filter(m => m.root.visible).map(m => ({team: m.team, body: rect(m.sprite), all: rect(m.root)})),
      support: this.accountBattleUnitEnabled ? {body: rect(this.accountBattleUnit.view), all: rect(this.accountBattleUnit.root)} : null};
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
