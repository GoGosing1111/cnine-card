import {Container, Graphics} from 'pixi.js';
import {GRID, configuration, scaleAt, stationPoint} from './FormationLayout.mjs';
import {compactStation, fitCompactViewport, usesCompactViewport} from './ViewportLayout.mjs';

// Shared presentation policy. The base engine still owns combatants, attacks,
// equipment gates, damage, the camera, effects, and the single Pixi application.
export const withOccupiedGrid = Base => class extends Base {
  constructor(options) {
    super(options);
    this.gridMode = 'wide';
    this.formationMercenaries = [];
  }
  async applyBattlePayload(payload) {
    this.formationScenario = payload?.wideGridPreview?.scenario ||
      (payload?.monster || payload?.continuousEncounter || payload?.scrapyardPreview ||
        /PVE|HUNT|TOWER|RAID|SEAL|ESCORT|DUNGEON|APOCALYPSE|IDLE/.test(String(payload?.mode || payload?.battleV2?.mode || '')) ? 'PVE' : 'PVP');
    this.formationSingleTarget = Boolean(payload?.monster);
    for (const actor of this.characters || []) if (Number.isFinite(actor.legacyGridHudY)) actor.hud.y = actor.legacyGridHudY;
    const result = await super.applyBattlePayload(payload);
    for (const actor of this.characters || []) actor.legacyGridHudY = actor.hud.y;
    return result;
  }
  setFormationMercenaries(items = []) {
    for (const team of ['ALLY', 'ENEMY']) if (items.filter(item => item.team === team).length > 1) throw new Error('MAX_ONE_MERCENARY_PER_TEAM');
    if (items.some(item => !['ALLY', 'ENEMY'].includes(item.team) || !item.root)) throw new Error('INVALID_MERCENARY_STATION');
    // Registration is layout-only. It does not add a unit to any combat/API array.
    this.formationMercenaries = items;
    this.layoutFormationMercenaries(); this.drawIsometricFloor();
  }
  configureIsometricScene() {
    this.isoConfig = configuration(this.viewportFit ? false : this.mobile, this.gridMode || 'wide');
    return this.isoConfig;
  }
  station(kind, index = 0, team = 'ALLY') {
    const scenario = this.formationScenario || 'PVP';
    let p;
    if (kind === 'objective') p = this.viewportFit ? {x: 790, y: 970} : {x: 890, y: 540};
    else if (kind === 'cards' && team === 'ENEMY' && this.formationSingleTarget)
      p = this.viewportFit ? {x: 805, y: 650} : {x: 1210, y: 425};
    else p = this.viewportFit ? compactStation(kind, index, team, scenario) : stationPoint(kind, index, team, this.mobile);
    return {x: p.x + (this.viewportFit?.offsetX || 0), y: p.y + (this.viewportFit?.offsetY || 0)};
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
    let top = statusRect?.height > 0 ? Math.max(0, statusRect.bottom - hostRect.top) : 8;
    let objectiveHudFit = null;
    if (this.objectiveData && this.objectiveHud?.visible) {
      const b = this.objectiveHud.getLocalBounds(), scale = Math.min(1, (this.app.screen.width - 24) / b.width);
      objectiveHudFit = {x: 12, y: top + 8, scale, height: b.height * scale + 8};
      top += objectiveHudFit.height;
    }
    this.viewportFit = fitCompactViewport({width: this.app.screen.width, height: this.app.screen.height, top, bottom});
    this.viewportFit.objectiveHud = objectiveHudFit;
    const extraTop = String(objectiveHudFit?.height || 0);
    if (this.host.dataset.v3FormationExtraTop !== extraTop) {
      this.host.dataset.v3FormationExtraTop = extraTop;
      this.host.dispatchEvent(new CustomEvent('v3-formation-resize', {bubbles: true}));
    }
    this.scene = this.viewportFit.scene;
    this.root.scale.set(this.viewportFit.scale); this.root.position.set(0, 0);
    this.camera.setViewport(this.scene.width, this.scene.height);
    this.skillTimeline.width = this.scene.width; this.skillTimeline.height = this.scene.height;
    this.layoutParallax(this.scene.width, this.scene.height);
    if (this.bottomShade) {this.bottomShade.width = this.scene.width; this.bottomShade.height = bottom / this.viewportFit.scale; this.bottomShade.y = this.scene.height - this.bottomShade.height;}
    this.configureIsometricScene(); this.layoutCharacterGrid(); this.sortCombatDepth();
    this.uiLayer.statusPanel.position.set(this.scene.width / 2 - 300, this.scene.height - 62);
    this.uiLayer.status.position.set(this.scene.width / 2, this.scene.height - 41);
    this.uiLayer.banner.position.set(this.scene.width / 2 - 290, 118);
    this.layoutObjectiveHud();
  }
  accountBattleUnitFormation() {
    const base = super.accountBattleUnitFormation();
    if (this.gridMode !== 'wide' || this.baselineLayout) return base;
    const p = this.station('support');
    return {...base, ...this.screenToGrid(p.x, p.y)};
  }
  formationStations() {
    const rows = [];
    const add = (kind, index, team, actor) => rows.push({id: `${team}:${kind}:${index}`, kind, index, team, actor, ...this.station(kind, index, team)});
    for (const [team, actors] of [['ALLY', this.allies], ['ENEMY', this.enemies]]) {
      (actors || []).forEach((actor, index) => {if (actor.battleActive !== false && actor.hp > 0) add('cards', index, team, actor);});
    }
    for (const item of this.formationMercenaries || []) if (item.root.visible) add('mercenaries', 0, item.team, item);
    if (this.accountBattleUnitEnabled && this.accountBattleUnit) add('support', 0, 'ALLY', this.accountBattleUnit);
    if (this.objectiveData && this.objectiveSprite?.visible) add('objective', 0, 'ALLY', this.objectiveSprite);
    return rows;
  }
  drawIsometricFloor() {
    if (this.gridMode === 'original') return super.drawIsometricFloor();
    if (!this.isoFloorLayer || !this.isoConfig) return;
    this.isoFloorLayer.removeChildren().forEach(child => child.destroy({children: true}));
    this.isoTiles = []; this.accountBattleUnitTile = null;
    const {tileWidth: w, tileHeight: h} = this.isoConfig;
    for (const station of this.formationStations()) {
      const support = station.kind === 'support', mercenary = station.kind === 'mercenaries', objective = station.kind === 'objective', ally = station.team === 'ALLY';
      const accent = support ? 0xffc16f : mercenary ? 0xc49cff : objective ? 0x9cdfa2 : ally ? 0x40cfff : 0xff536b;
      const tile = new Container({label: `OccupiedTile:${station.id}`});
      tile.station = station; tile.position.set(station.x, station.y); tile.depthSortY = -100000;
      const lower = new Graphics().poly([0, -h * .42, w * .49, 0, 0, h * .58, -w * .49, 0]).fill({color: 0x02060b, alpha: .74}); lower.y = 7;
      tile.addChild(lower,
        new Graphics().poly([0, -h / 2, w / 2, 0, 0, h / 2, -w / 2, 0]).fill({color: support ? 0x382610 : mercenary ? 0x241536 : ally ? 0x0a3346 : 0x3a111b, alpha: .48}).stroke({width: 2, color: accent, alpha: .72}),
        new Graphics().poly([0, -h * .38, w * .38, 0, 0, h * .38, -w * .38, 0]).stroke({width: 1, color: accent, alpha: .2}));
      if (support) {tile.isAccountBattleUnitTile = true; this.accountBattleUnitTile = tile;}
      this.isoFloorLayer.addChild(tile); this.isoTiles.push(tile);
    }
    this.occupiedTileSignature = this.formationStations().map(s => s.id).join('|');
    this.syncAccountBattleUnitTile();
  }
  syncAccountBattleUnitTile() {
    if (this.gridMode === 'original') return super.syncAccountBattleUnitTile();
    if (this.accountBattleUnitTile) this.accountBattleUnitTile.visible = Boolean(this.accountBattleUnitEnabled);
  }
  sortCombatDepth() {
    super.sortCombatDepth();
    if (this.gridMode !== 'wide' || !this.isoFloorLayer) return;
    // Covers KO, revival, a replacement generation, equipment removal and reset.
    // Keep station positions stable during an attack; never follow its moving feet.
    const signature = this.formationStations().map(s => s.id).join('|');
    if (signature !== this.occupiedTileSignature) this.drawIsometricFloor();
  }
  layoutCharacterGrid() {
    if (this.gridMode !== 'wide') {
      for (const actor of this.characters || []) if (Number.isFinite(actor.legacyGridHudY)) actor.hud.y = actor.legacyGridHudY;
      this.layoutFormationMercenaries(); return super.layoutCharacterGrid();
    }
    const wide = this.isoConfig, mobile = this.mobile, original = configuration(this.viewportFit ? false : mobile, 'original');
    this.baselineLayout = true; this.isoConfig = original;
    if (this.viewportFit) this.mobile = false;
    try {super.layoutCharacterGrid();} finally {this.baselineLayout = false; this.isoConfig = wide; this.mobile = mobile;}
    for (const [team, actors] of [['ALLY', this.allies], ['ENEMY', this.enemies]]) for (const [index, actor] of actors.entries()) {
      const originalY = actor.baseY, scale = actor.restScale, next = this.station('cards', index, team), factor = this.viewportFit?.actorScale || 1;
      const p = this.screenToGrid(next.x, next.y); actor.gridPosition = {x: p.gridX, y: p.gridY};
      actor.setFormation(next.x, next.y, scale * factor); actor.setCompactHud?.(mobile);
      actor.hud.y = -(actor.fullBodyHeight + 88);
      actor.perspectiveResolver = y => factor * scaleAt(original, actor.designScale, originalY + (y - next.y) * original.tileHeight / wide.tileHeight);
      actor.root.depthSortY = next.y;
    }
    if (this.accountBattleUnit) {
      const next = this.station('support');
      this.accountBattleUnit.setFormation(next.x, next.y, this.accountBattleUnit.root.restScale * (this.viewportFit?.actorScale || 1));
    }
    this.layoutObjective(); this.layoutFormationMercenaries(); this.drawIsometricFloor();
  }
  layoutAccountBattleUnit() {
    if (this.gridMode !== 'wide' || this.baselineLayout) return super.layoutAccountBattleUnit();
    const wide = this.isoConfig, mobile = this.mobile;
    this.baselineLayout = true; this.isoConfig = configuration(this.viewportFit ? false : mobile, 'original');
    if (this.viewportFit) this.mobile = false;
    try {super.layoutAccountBattleUnit();} finally {this.baselineLayout = false; this.isoConfig = wide; this.mobile = mobile;}
    if (!this.accountBattleUnit) return;
    const p = this.station('support'); this.accountBattleUnit.setFormation(p.x, p.y, this.accountBattleUnit.root.restScale * (this.viewportFit?.actorScale || 1));
  }
  layoutObjective() {
    if (this.gridMode !== 'wide' || this.baselineLayout) return super.layoutObjective();
    if (!this.objectiveSprite || !this.objectiveData) return;
    const p = this.station('objective'), texture = this.objectiveSprite.texture;
    const scale = Math.min(178 / Math.max(1, texture.height), 340 / Math.max(1, texture.width)) * (this.viewportFit?.actorScale || 1);
    this.objectiveSprite.position.set(p.x, p.y); this.objectiveSprite.scale.set(scale); this.objectiveSprite.depthSortY = p.y - 2;
  }
  async setObjective(payload) {
    const result = await super.setObjective(payload);
    if (this.mounted && this.gridMode === 'wide') this.resize();
    return result;
  }
  layoutObjectiveHud() {
    if (this.gridMode !== 'wide' || !this.objectiveHud) return super.layoutObjectiveHud();
    const fit = this.viewportFit?.objectiveHud;
    if (fit) {
      this.objectiveHud.position.set(fit.x / this.viewportFit.scale, fit.y / this.viewportFit.scale);
      this.objectiveHud.scale.set(fit.scale / this.viewportFit.scale);
    } else if (!this.mobile) {
      this.objectiveHud.position.set(this.scene.width - 660, 52); this.objectiveHud.scale.set(1);
    } else super.layoutObjectiveHud();
  }
  layoutFormationMercenaries() {
    for (const item of this.formationMercenaries || []) {
      const p = this.station('mercenaries', 0, item.team);
      const scale = this.viewportFit ? .51 * this.viewportFit.actorScale : this.mobile ? .43 : .51;
      if (typeof item.setFormation === 'function') {
        item.setFormation(p.x, p.y, scale); item.setCompactHud?.(this.mobile);
        item.perspectiveResolver = () => scale;
      } else {item.root.position.set(p.x, p.y); item.root.scale.set(scale);}
      item.root.depthSortY = p.y;
      item.root.visible = this.gridMode === 'wide' && item.enabled !== false;
    }
  }
  gridDiagnostics() {
    const tiles = (this.isoTiles || []).filter(t => t.visible).map(t => ({id: t.station?.id || t.label, x: t.x, y: t.y, kind: t.station?.kind}));
    const w = this.isoConfig?.tileWidth || 0, h = this.isoConfig?.tileHeight || 0;
    const left = Math.min(...tiles.map(t => t.x - w / 2)), right = Math.max(...tiles.map(t => t.x + w / 2));
    const top = Math.min(...tiles.map(t => t.y - h / 2)), bottom = Math.max(...tiles.map(t => t.y + h / 2));
    return {version: 'OCCUPIED_GRID_V1', mode: this.gridMode, scenario: this.formationScenario, mobile: this.mobile,
      grid: GRID[this.gridMode], tiles, floor: tiles.length ? {left, right, top, bottom, width: right - left, height: bottom - top} : null,
      mercenaries: (this.formationMercenaries || []).filter(m => m.root.visible).map(m => ({code: m.art?.code, team: m.team, index: 0, x: m.root.x, y: m.root.y, scale: m.root.scale.x})),
      rootScale: this.root?.scale.x, scene: this.scene, viewportFit: this.viewportFit,
      actors: [...this.allies, ...this.enemies].map(a => ({id: a.id, team: a.team, active: a.battleActive, grid: a.gridPosition, x: a.baseX, y: a.baseY, scale: a.restScale, depth: a.perspectiveDepth})),
      support: this.accountBattleUnitEnabled ? {x: this.accountBattleUnit.root.baseX, y: this.accountBattleUnit.root.baseY, scale: this.accountBattleUnit.root.restScale} : null,
      objective: this.objectiveData && this.objectiveSprite?.visible ? {x: this.objectiveSprite.x, y: this.objectiveSprite.y} : null};
  }
  viewportGeometry() {
    const rect = node => {const b = node.getBounds(); return {x: b.x, y: b.y, width: b.width, height: b.height};};
    return {width: this.app.screen.width, height: this.app.screen.height, fit: this.viewportFit,
      actors: this.characters.filter(a => a.battleActive && a.hp > 0).map(a => ({id: a.id, team: a.team, body: rect(a.fullBodySprite), hud: rect(a.hud), foot: {x: a.baseX * this.root.scale.x + this.root.x, y: a.baseY * this.root.scale.y + this.root.y}})),
      mercenaries: (this.formationMercenaries || []).filter(m => m.root.visible).map(m => ({team: m.team, body: rect(m.sprite || m.fullBodySprite), all: rect(m.root)})),
      support: this.accountBattleUnitEnabled ? {body: rect(this.accountBattleUnit.view), all: rect(this.accountBattleUnit.root)} : null,
      objective: this.objectiveData && this.objectiveSprite?.visible ? rect(this.objectiveSprite) : null};
  }
  diagnostics() {return {...super.diagnostics(), formation: this.gridDiagnostics()};}
};
