import {layoutIconTechniqueWeapons} from './IconTechniquePlayback.js';
import {drawBattleGroundStations} from './BattleGroundSigil.js';
import {battleGroundSignature} from './BattleGroundStyle.mjs';
import {GRID, FORMATION_LAYOUT_VERSION, configuration, formationActorScale, stationPoint, DUO_BOARDS, DUO_DUAL_BOARDS, duoStation, COOP_BOARDS, COOP_DUAL_BOARDS, coopStation} from './FormationLayout.mjs';
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
    this.cooperativeFrame=null;
    this.formationMercenariesPerOwner=payload?.battleV2?.rules?.mercenariesPerOwner===2?2:1;
    this.formationCoop = payload?.battleV2?.rules?.formation === 'COOP_THREE_SQUADS';
    // Shared battles keep a fixed camera; simultaneous ultimates cannot reframe
    // the other players' formation. Restore ordinary camera behavior on reuse.
    if(this.camera){this.camera.zoomEnabled=!this.formationCoop;if(this.formationCoop)this.camera.reset(true);}
    this.formationDuo = payload?.battleV2?.rules?.formation === 'DUO_TWO_SQUADS';
    if(!this.formationDuo&&!this.formationCoop&&this.allies?.length>5){this.ensureAllyCapacity(5);this.ensureEnemyCapacity(payload?.battleV2?.rules?.enemyFormation==='BOSS_WITH_SIX_MINIONS'?7:5);}
    this.formationScenario = payload?.wideGridPreview?.scenario ||
      (payload?.monster || payload?.continuousEncounter || payload?.scrapyardPreview ||
        /PVE|HUNT|TOWER|RAID|SEAL|ESCORT|DUNGEON|APOCALYPSE|IDLE/.test(String(payload?.mode || payload?.battleV2?.mode || '')) ? 'PVE' : 'PVP');
    this.formationEnemySquad = payload?.battleV2?.rules?.enemyFormation === 'BOSS_WITH_SIX_MINIONS';
    this.formationSingleTarget = Boolean(payload?.monster) && !this.formationEnemySquad;
    for (const actor of this.characters || []) if (Number.isFinite(actor.legacyGridHudY)) actor.hud.y = actor.legacyGridHudY;
    const result = await super.applyBattlePayload(payload);
    if(payload?.preparationOnly){for(const side of ['A','B'])for(const row of payload.battleV2?.teams?.[side]?.cards||[]){const actor=this.combatantById(row.id);if(actor&&Number.isInteger(row.slot)&&row.slot>=0&&row.slot<5)actor.iconTechniqueDisplaySlot=row.slot;}this.layoutCharacterGrid();}
    for (const actor of this.characters || []) actor.legacyGridHudY = actor.hud.y;
    return result;
  }
  setFormationMercenaries(items = []) {
    for (const team of ['ALLY', 'ENEMY']) if (items.filter(item => item.team === team).length > (this.formationCoop?3*this.formationMercenariesPerOwner:this.formationDuo?2*this.formationMercenariesPerOwner:2)) throw new Error('MAX_MERCENARIES_PER_TEAM');
    if (items.some(item => !['ALLY', 'ENEMY'].includes(item.team) || !item.root)) throw new Error('INVALID_MERCENARY_STATION');
    // Registration is layout-only. It does not add a unit to any combat/API array.
    for(const team of ['ALLY','ENEMY'])items.filter(item=>item.team===team).forEach((item,index)=>{item.formationMercenaryIndex=index;});
    this.formationMercenaries = items;
    this.layoutFormationMercenaries(); this.drawIsometricFloor();
  }
  configureIsometricScene() {
    this.isoConfig = configuration(this.viewportFit ? false : this.mobile, this.gridMode || 'wide');
    return this.isoConfig;
  }
  depthForY(y) {return this.gridMode === 'wide' ? .5 : super.depthForY(y);}
  station(kind, index = 0, team = 'ALLY') {
    if(this.formationCoop&&['cards','mercenaries'].includes(kind)){const p=coopStation(kind,index,team,this.mobile,this.formationMercenariesPerOwner);return {x:p.x+(this.viewportFit?.offsetX||0),y:p.y+(this.viewportFit?.offsetY||0)};}
    if(this.formationDuo&&['cards','mercenaries'].includes(kind)){const p=duoStation(kind,index,team,this.mobile,this.formationMercenariesPerOwner);return {x:p.x+(this.viewportFit?.offsetX||0),y:p.y+(this.viewportFit?.offsetY||0)};}
    const scenario = this.formationScenario || 'PVP';
    if(kind==='cards'&&team==='ENEMY'&&this.formationEnemySquad)kind='squad';
    if (kind === 'cards' && team === 'ENEMY' && this.formationSingleTarget) {kind = 'boss'; index = 0;}
    const p = this.viewportFit ? compactStation(kind, index, team, scenario) : stationPoint(kind, index, team, this.mobile);
    return {x: p.x + (this.viewportFit?.offsetX || 0), y: p.y + (this.viewportFit?.offsetY || 0)};
  }
  resize() {
    this.viewportFit = null;
    super.resize();
    // Desktop cooperative battles use the ordinary 1600 x 820 viewport.
    // Fitting the board again above the card dock shrinks the entire battle.
    if (!this.root || this.gridMode !== 'wide' || !this.formationDuo&&!usesCompactViewport(this.app.screen.width)) return;
    const hostRect = this.host.getBoundingClientRect(), shell = this.host.closest('.battle-v3-live-shell');
    const dock = shell?.querySelector('.battle-v3-dock')?.getBoundingClientRect();
    const status = shell?.querySelector('.battle-v3-status');
    const statusRect = status && getComputedStyle(status).display !== 'none' ? status.getBoundingClientRect() : null;
    // The live notice now sits above the card dock. Reserve it at the bottom;
    // treating its bottom edge as a top inset collapses the mobile battlefield.
    const statusAtDock = statusRect?.height > 0 && shell?.classList.contains('is-roster-visible');
    // Portrait solo/PVP stations end at the last card's feet. Keep room for
    // the pet below that row, including its name, above the measured HUD dock.
    const petBottom=this.mobile&&!this.formationCoop&&!this.formationDuo&&this.petSupports?.size?82:0;
    const bottom = Math.max(dock?.height > 0 ? Math.max(0, hostRect.bottom - dock.top) : 130,
      statusAtDock ? hostRect.bottom - statusRect.top + 8 : 0)+petBottom;
    let top = !statusAtDock && statusRect?.height > 0 ? Math.max(0, statusRect.bottom - hostRect.top) : 8;
    // Mobile dialogue overlays the background, while occupied stations start
    // below it. Desktop has an empty right-hand lane for the same frame.
    const dialogue=shell?.querySelector('.jinmu-dialogue-rail');
    if(dialogue)top=Math.max(top,dialogue.getBoundingClientRect().bottom-hostRect.top);
    let objectiveHudFit = null;
    if (this.objectiveData && this.objectiveHud?.visible) {
      const b = this.objectiveHud.getLocalBounds(), scale = Math.min(1, (this.app.screen.width - 24) / b.width);
      objectiveHudFit = {x: 12, y: top + 8, scale, height: b.height * scale + 8};
      top += objectiveHudFit.height;
    }
    this.viewportFit = fitCompactViewport({width: this.app.screen.width, height: this.app.screen.height, top, bottom,board:this.formationCoop?(this.formationMercenariesPerOwner===2?COOP_DUAL_BOARDS:COOP_BOARDS)[this.mobile?'compact':'desktop']:this.formationDuo?(this.formationMercenariesPerOwner===2?DUO_DUAL_BOARDS:DUO_BOARDS)[this.mobile?'compact':'desktop']:undefined});
    this.viewportFit.objectiveHud = objectiveHudFit;
    const extraTop = String(objectiveHudFit?.height || 0);
    if (this.host.dataset.v3FormationExtraTop !== extraTop) {
      this.host.dataset.v3FormationExtraTop = extraTop;
      this.host.dispatchEvent(new CustomEvent('v3-formation-resize', {bubbles: true}));
    }
    this.scene = this.viewportFit.scene;
    this.root.scale.set(this.viewportFit.scale); this.root.position.set(0, 0);
    this.accountBattleUnit?.setNameViewportScale?.(this.viewportFit.scale);
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
    const add = (kind, index, team, actor) => {
      const point = this.gridMode === 'original'
        ? {x: actor.baseX ?? actor.root?.baseX ?? actor.x, y: actor.baseY ?? actor.root?.baseY ?? actor.y}
        : this.station(kind, index, team);
      if (Number.isFinite(point.x) && Number.isFinite(point.y)) rows.push({id: `${team}:${kind}:${index}`, kind, index, team, actor, ...point});
    };
    for (const [team, actors] of [['ALLY', this.allies], ['ENEMY', this.enemies]]) {
      (actors || []).forEach((actor, index) => {if (actor.battleActive !== false && actor.hp > 0) add('cards', actor.iconTechniqueDisplaySlot??index, team, actor);});
    }
    for (const item of this.formationMercenaries || []) if (item.root.visible) add('mercenaries', (this.formationDuo||this.formationCoop)?Number(item.squadIndex)*this.formationMercenariesPerOwner+Math.max(0,Number(item.localSlot??(this.formationDuo?5:2))-(this.formationDuo?5:2)):(item.formationMercenaryIndex||0), item.team, item);
    if (this.accountBattleUnitEnabled && this.accountBattleUnit) add('support', 0, 'ALLY', this.accountBattleUnit);
    if (this.objectiveData && this.objectiveSprite?.visible) add('objective', 0, 'ALLY', this.objectiveSprite);
    return rows;
  }
  drawIsometricFloor() {
    if (this.gridMode === 'original') return super.drawIsometricFloor();
    drawBattleGroundStations(this, this.formationStations());
  }
  syncAccountBattleUnitTile() {
    if (this.gridMode === 'original') return super.syncAccountBattleUnitTile();
    if (this.accountBattleUnitTile) this.accountBattleUnitTile.visible = Boolean(this.accountBattleUnitEnabled);
  }
  sortCombatDepth() {
    super.sortCombatDepth();
    if (!['wide', 'original'].includes(this.gridMode) || !this.isoFloorLayer) return;
    // Covers KO, revival, a replacement generation, equipment removal and reset.
    // Keep station positions stable during an attack; never follow its moving feet.
    const signature = battleGroundSignature(this.formationStations());
    if (signature !== this.occupiedTileSignature) this.drawIsometricFloor();
  }
  layoutCharacterGrid() {
    if (this.gridMode !== 'wide') {
      for (const actor of this.characters || []) {
        delete actor.formationHudY;
        if (Number.isFinite(actor.legacyGridHudY)) actor.hud.y = actor.legacyGridHudY;
      }
      this.layoutFormationMercenaries();
      const result = super.layoutCharacterGrid(); this.drawIsometricFloor(); return result;
    }
    const wide = this.isoConfig, mobile = this.mobile, original = configuration(this.viewportFit ? false : mobile, 'original');
    this.baselineLayout = true; this.isoConfig = original;
    if (this.viewportFit) this.mobile = false;
    try {super.layoutCharacterGrid();} finally {this.baselineLayout = false; this.isoConfig = wide; this.mobile = mobile;}
    for (const [team, actors] of [['ALLY', this.allies], ['ENEMY', this.enemies]]) for (const [index, actor] of actors.entries()) {
      const scale = this.formationCoop?(this.formationMercenariesPerOwner===2?COOP_DUAL_BOARDS:COOP_BOARDS)[this.mobile?'compact':'desktop'].actorScale:this.formationDuo?DUO_BOARDS[mobile?'compact':'desktop'].actorScale:formationActorScale(Boolean(this.viewportFit), mobile), next = this.station('cards', actor.iconTechniqueDisplaySlot??index, team);
      const p = this.screenToGrid(next.x, next.y); actor.gridPosition = {x: p.gridX, y: p.gridY};
      actor.designScale = scale;
      actor.setFormation(next.x, next.y, scale); actor.setCompactHud?.(mobile);
      actor.formationHudY = -(actor.fullBodyHeight * .98 + 88);
      // Slot order and faction must not change a character's apparent size.
      // Asset-defined boss/body proportions and attack transforms stay intact.
      actor.perspectiveResolver = () => scale; actor.updatePerspective?.(.5);
      actor.hud.y = actor.formationHudY;
      actor.root.depthSortY = next.y;
    }
    if (this.accountBattleUnit) {
      const next = this.station('support');
      this.accountBattleUnit.setFormation(next.x, next.y, formationActorScale(Boolean(this.viewportFit), mobile));
      this.accountBattleUnit.root.depthSortY = next.y;
    }
    this.layoutObjective(); this.layoutFormationMercenaries(); layoutIconTechniqueWeapons(this); this.drawIsometricFloor();
  }
  layoutAccountBattleUnit() {
    if (this.gridMode !== 'wide' || this.baselineLayout) return super.layoutAccountBattleUnit();
    const wide = this.isoConfig, mobile = this.mobile;
    this.baselineLayout = true; this.isoConfig = configuration(this.viewportFit ? false : mobile, 'original');
    if (this.viewportFit) this.mobile = false;
    try {super.layoutAccountBattleUnit();} finally {this.baselineLayout = false; this.isoConfig = wide; this.mobile = mobile;}
    if (!this.accountBattleUnit) return;
    const p = this.station('support'); this.accountBattleUnit.setFormation(p.x, p.y, formationActorScale(Boolean(this.viewportFit), mobile));
    this.accountBattleUnit.root.depthSortY = p.y;
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
      item.cooperativeScaleLocked=Boolean(this.formationCoop);
      const p = this.station('mercenaries', (this.formationDuo||this.formationCoop)?Number(item.squadIndex)*this.formationMercenariesPerOwner+Math.max(0,Number(item.localSlot??(this.formationDuo?5:2))-(this.formationDuo?5:2)):(item.formationMercenaryIndex||0), item.team);
      const scale = this.formationCoop?(this.formationMercenariesPerOwner===2?COOP_DUAL_BOARDS:COOP_BOARDS)[this.mobile?'compact':'desktop'].actorScale:this.formationDuo?(this.formationMercenariesPerOwner===2?DUO_DUAL_BOARDS:DUO_BOARDS)[this.mobile?'compact':'desktop'].actorScale:formationActorScale(Boolean(this.viewportFit), this.mobile);
      if (typeof item.setFormation === 'function') {
        item.setFormation(p.x, p.y, scale); item.setCompactHud?.(this.mobile);
        item.perspectiveResolver = () => scale;
      } else {item.root.position.set(p.x, p.y); item.root.scale.set(scale);}
      item.root.depthSortY = p.y;
      item.root.visible = this.gridMode === 'wide' && item.enabled !== false && (!item.isMercenary||item.hp>0&&item.battleActive!==false);
    }
  }
  gridDiagnostics() {
    const tiles = (this.isoTiles || []).filter(t => t.visible).map(t => ({id: t.station?.id || t.label, x: t.x, y: t.y, kind: t.station?.kind, style: t.groundStyle, asset: t.groundAsset}));
    const w = this.isoConfig?.tileWidth || 0, h = this.isoConfig?.tileHeight || 0;
    const left = Math.min(...tiles.map(t => t.x - w / 2)), right = Math.max(...tiles.map(t => t.x + w / 2));
    const top = Math.min(...tiles.map(t => t.y - h / 2)), bottom = Math.max(...tiles.map(t => t.y + h / 2));
    return {version: 'OCCUPIED_GRID_V1', layoutVersion: FORMATION_LAYOUT_VERSION, mode: this.gridMode, scenario: this.formationScenario, mobile: this.mobile,
      grid: GRID[this.gridMode], tiles, floor: tiles.length ? {left, right, top, bottom, width: right - left, height: bottom - top} : null,
      mercenaries: (this.formationMercenaries || []).filter(m => m.root.visible).map(m => ({code: m.art?.code, team: m.team, index: m.formationMercenaryIndex, x: m.root.x, y: m.root.y, scale: m.root.scale.x})),
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
