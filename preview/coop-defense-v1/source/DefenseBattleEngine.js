import { Assets, BitmapFont, Cache, Container, Graphics, Rectangle, Sprite, Text, Texture, TilingSprite } from 'pixi.js';
import { gsap } from 'gsap';
import { BattleEngine } from '../../project-v-v3/source/battle/BattleEngine.js';
import { BattleCharacter, TEAM } from '../../project-v-v3/source/battle/BattleCharacter.js';
import { SkillEffectFX, triggerWhiteFlash } from '../../project-v-v3/source/battle/SkillEffectFX.js';
import { WORLD, laneY, LANES } from './defense-model.mjs';

const OWNER_COLORS = [0x70e4cf, 0xe7bb76, 0xbda5f5];
const DIGIT_FONT = 'CoopDefenseDigitsV1';
const textStyle = { fontFamily: 'Pretendard, Malgun Gothic, sans-serif', fontSize: 25, fontWeight: '700', fill: 0xc4d6d3 };
export class DefenseBattleEngine extends BattleEngine {
  constructor({ host, catalog }) {
    super({ host, battleData: { mode: 'PVE', battleV2: {} } });
    this.gridMode = 'defense'; this.catalog = catalog; this.actors = new Map(); this.capacity = 3;
    this.focusLane = null; this.focusX = WORLD.frontX - 170; this.selectedUnit = null; this.myLane = 0; this.state = null;
    this.fxRuns = new Set(); this.activeEffects = new Set(); this.visualNow = 0; this.lastEvent = 0;
    this.disposed = false; this.soundEnabled = false;
  }
  async loadBattlefieldTexture() {
    const [background] = await Promise.all([this.catalog.background, this.catalog.environment.causeway, this.catalog.environment.core].map(path => Assets.load(path)));
    return background;
  }
  createBackground() {
    this.defenseBackdrop = new Sprite(this.activeBattlefieldTexture);
    this.defenseShade = new Graphics(); this.backgroundLayer.addChild(this.defenseBackdrop, this.defenseShade);
  }
  createIsometricFloor() {
    this.isoFloorLayer = new Container({ label: 'DefenseRoutes' }); this.isoFloorLayer.zIndex = -100;
    this.combatLayer.addChild(this.isoFloorLayer);
    this.routeArt = new Container({ label: 'PaintedCauseways' }); this.routeLabels = new Container();
    const road = Assets.get(this.catalog.environment.causeway);
    this.routeJoinTexture = new Texture({ source: road.source, frame: new Rectangle(800, 0, 300, road.height) });
    this.coreArt = new Sprite(Assets.get(this.catalog.environment.core)); this.coreArt.label = 'PaintedGuardianCrystal';
    this.coreArt.anchor.set(.5, .91); this.coreArt.height = 430; this.coreArt.scale.x = this.coreArt.scale.y;
    this.coreArt.position.set(WORLD.coreX, WORLD.coreY);
    this.isoFloorLayer.addChild(this.routeArt, this.coreArt, this.routeLabels);
    this.bossWarnings=new Graphics();this.isoFloorLayer.addChild(this.bossWarnings);
    this.drawRoutes();
  }
  createCard() { const card = new Container(); card.visible = false; return card; }
  async createCharacters() {
    const paths = [...Object.values(this.catalog.units).map(x => x.battleSprite), ...Object.values(this.catalog.enemies).map(x => x.battleSprite)];
    await Promise.all([...new Set(paths)].map(p => Assets.load(p)));
    this.characters = []; this.allies = []; this.enemies = [];
  }
  createUi() { /* Fixed command controls are accessible HTML outside the combat camera. */ }
  bindControls() {
    this.cameraControls = new AbortController();
    const options = { signal: this.cameraControls.signal };
    this.host.addEventListener('pointerdown', event => {
      if (this.focusLane === null || event.button !== 0) return;
      this.panDrag = { id: event.pointerId, x: event.clientX, y: event.clientY, center: this.focusX };
      this.host.setPointerCapture(event.pointerId);
    }, options);
    this.host.addEventListener('pointermove', event => {
      if (this.panDrag?.id !== event.pointerId) return;
      const alongRoad = (event.clientX - this.panDrag.x) * Math.cos(this.fieldTilt)
        + (event.clientY - this.panDrag.y) * Math.sin(this.fieldTilt);
      this.focusX = this.panDrag.center - alongRoad / this.root.scale.x;
      this.resize();
    }, options);
    const endDrag = event => {
      if (this.panDrag?.id !== event.pointerId) return;
      this.panDrag = null;
      if (this.host.hasPointerCapture(event.pointerId)) this.host.releasePointerCapture(event.pointerId);
    };
    this.host.addEventListener('pointerup', endDrag, options);
    this.host.addEventListener('pointercancel', endDrag, options);
    this.host.addEventListener('keydown', event => {
      if (this.focusLane === null) return;
      if (event.key === 'ArrowLeft' || event.key === 'ArrowRight') {
        event.preventDefault(); this.panBy(event.key === 'ArrowLeft' ? -1 : 1);
      } else if (event.key === 'Home') { event.preventDefault(); this.centerSquad(); }
    }, options);
  }
  setObjective() { return Promise.resolve(); }
  drawIsometricFloor() { this.drawRoutes(); }
  layoutCharacterGrid() {}
  configureIsometricScene() { return {}; }
  async mount() {
    await super.mount();
    this.app.ticker.maxFPS = 60;
    if (!Cache.has(`${DIGIT_FONT}-bitmap`)) BitmapFont.install({ name: DIGIT_FONT,
      style: { fontFamily: 'Arial Black, Arial', fontSize: 76, fill: 0xffffff, stroke: { color: 0x08120d, width: 8, join: 'round' } },
      chars: [['0', '9'], '+', ','], resolution: 1, padding: 5 });
    this.drawRoutes(); this.resize();
    this.renderTick = ticker => this.updateActors(ticker.deltaMS);
    this.app.ticker.add(this.renderTick);
    await this.setVisible(true);
    return this;
  }
  setVisible(next) {
    this.requestedVisible = next; this.visible = Boolean(next && !document.hidden);
    if (!this.app) return Promise.resolve(this);
    if (this.visible) {
      this.app.start();
      for (const actor of this.actors.values()) actor.animationController?.timeline?.resume();
    } else {
      this.app.stop(); this.clearEffects();
      for (const actor of this.actors.values()) actor.animationController?.timeline?.pause();
    }
    return Promise.resolve(this);
  }
  setView(lane) {
    this.focusLane = lane; this.focusX = WORLD.frontX - 170; this.panDrag = null;
    this.host.dataset.pannable = String(lane !== null); this.drawRoutes(); this.resize();
  }
  panBy(direction) { if (this.focusLane !== null) { this.focusX += direction * this.viewWidth * .55; this.resize(); } }
  centerSquad() { this.focusX = WORLD.frontX - 170; this.resize(); }
  selectUnit(id) { this.selectedUnit = id; }
  resize() {
    if (!this.root || !this.app) return;
    const w = this.app.screen.width, h = this.app.screen.height;
    this.mobile = w <= 760;
    this.scene = { ...WORLD }; this.camera.setViewport(WORLD.width, WORLD.height);
    const focused = this.focusLane !== null;
    const shortLandscape = w > h && h < 340;
    const portrait = focused && w < h && w <= 760;
    this.fieldTilt = portrait ? -Math.PI * .23 : 0;
    const top = laneY(0, this.capacity) - 370, bottom = laneY(this.capacity - 1, this.capacity) + 210;
    const scale = focused ? Math.min(w / (portrait ? 1000 : w <= 760 ? 1280 : 2000), Math.max(1, h - (shortLandscape ? 28 : 90)) / 560)
      : Math.min((w - 24) / WORLD.width, (h - 24) / (bottom - top));
    this.viewWidth = (portrait ? Math.min(w / Math.cos(this.fieldTilt), (h - 90) / Math.abs(Math.sin(this.fieldTilt))) : w) / scale;
    const halfView = Math.min(WORLD.width / 2, this.viewWidth / 2);
    this.focusX = Math.max(halfView, Math.min(WORLD.width - halfView, this.focusX));
    const centerX = focused ? this.focusX : WORLD.width / 2;
    const centerY = focused ? laneY(this.focusLane, this.capacity) - 90 : (top + bottom) / 2;
    this.root.scale.set(scale);
    this.root.position.set(w / 2 - centerX * scale, h * .5 - centerY * scale);
    for (const layer of [this.combatLayer, this.effectLayer]) {
      layer.pivot.set(centerX, centerY); layer.position.set(centerX, centerY); layer.rotation = this.fieldTilt;
    }
    this.coreArt.rotation = -this.fieldTilt;
    this.routeLabels.children.forEach(label => { label.rotation = -this.fieldTilt; });
    const left = -this.root.x / scale, viewTop = -this.root.y / scale, width = w / scale, height = h / scale;
    const bg = this.defenseBackdrop, cover = Math.max(width / bg.texture.width, height / bg.texture.height);
    bg.scale.set(cover); bg.position.set(left + (width - bg.width) / 2, viewTop + (height - bg.height) / 2);
    this.defenseShade.clear().rect(left, viewTop, width, height).fill({ color: 0x071211, alpha: .6 });
    this.skillTimeline.width = WORLD.width; this.skillTimeline.height = WORLD.height;
    for (const actor of this.actors.values()) this.layoutActorHud(actor, scale);
    this.refreshVisibility();
  }
  layoutActorHud(actor, scale = this.root.scale.x) {
    actor.root.rotation = -(this.fieldTilt || 0);
    actor.hud.scale.set(actor.enemy ? .65 : .85);
    actor.nameLabel.style.fontSize = Math.max(20, 10 / (scale * actor.hud.scale.x));
    actor.namePlate.visible = !actor.enemy;
    actor.nameLabel.visible = !actor.enemy || actor.unitData.type === 'BOSS';
  }
  drawRoutes() {
    if (!this.routeArt) return;
    this.routeArt.removeChildren().forEach(c => c.destroy());
    this.routeLabels.removeChildren().forEach(c => c.destroy());
    const segment = (fromX, fromY, toX, toY, height) => {
      const texture = Assets.get(this.catalog.environment.causeway);
      const strip = new TilingSprite({ texture, width: Math.hypot(toX - fromX, toY - fromY) + 30, height }); strip.anchor.set(.5);
      strip.tileScale.set(height / texture.height);
      strip.position.set((fromX + toX) / 2, (fromY + toY) / 2);
      strip.rotation = Math.atan2(toY - fromY, toX - fromX);
      // Cover the original strip's irregular ends with matching center paving, without stretching the stonework.
      const repeat = texture.width * height / texture.height;
      for (let at = repeat; at < strip.width; at += repeat) {
        const join = new Sprite(this.routeJoinTexture); join.anchor.set(.5); join.scale.set(height / texture.height);
        join.position.set(fromX + (at - 15) * Math.cos(strip.rotation), fromY + (at - 15) * Math.sin(strip.rotation));
        join.rotation = strip.rotation; this.routeArt.addChild(join);
      }
      this.routeArt.addChild(strip);
    };
    // The shared approach is laid beneath the long lane sections; the monument covers their convergence.
    for (let lane = 0; lane < this.capacity; lane++) {
      if (this.focusLane !== null && this.focusLane !== lane) continue;
      segment(WORLD.coreX, WORLD.coreY, WORLD.mergeX + 35, laneY(lane, this.capacity), 350);
    }
    for (let lane = 0; lane < this.capacity; lane++) {
      if (this.focusLane !== null && this.focusLane !== lane) continue;
      const y = laneY(lane, this.capacity), color = OWNER_COLORS[lane];
      segment(WORLD.mergeX - 10, y, WORLD.width - 20, y, 450);
      const label = new Text({ text: `${LANES[lane]} 방어선`, style: { ...textStyle, fill: color } });
      label.position.set(WORLD.mergeX + 30, y + 140); this.routeLabels.addChild(label);
    }
    this.coreArt.visible = true;
    if (this.focusLane === null) {
      const x = WORLD.coreX, y = WORLD.coreY;
      const label = new Text({ text: '공동 수호석', style: { ...textStyle, fill: 0xc3f8e9 } });
      label.anchor.set(.5, 0); label.position.set(x, y + 80); this.routeLabels.addChild(label);
    }
  }
  makeActor(unit, enemy = false) {
    const art = enemy ? this.catalog.enemies[unit.archetype||unit.type] : this.catalog.units[unit.code];
    const texture = Assets.get(art.battleSprite);
    const actor = new BattleCharacter({ id: unit.id, name: enemy ? art.name : `${LANES[unit.ownerLane]} · ${unit.name}`,
      team: enemy ? TEAM.ENEMY : TEAM.ALLY, texture, fullBodyTexture: texture, fullBodyHeight: enemy ? (art.height||180) : 245,
      x: unit.x, y: unit.y, scale: 1, accent: enemy ? 0xe97c72 : OWNER_COLORS[unit.ownerLane], hp: 100 });
    actor.artFacing = enemy ? art.artFacing || 1 : 1;
    actor.applyFacing(); // Also updates the neutral pose used by move/attack/hit resets.
    if (art.footAnchor) actor.mainSprite.anchor.set(art.footAnchor.x, art.footAnchor.y);
    actor.hud.y = -(actor.fullBodyHeight + 40);
    actor.hud.scale.set(enemy ? .65 : .75);
    actor.stateHalo.clear().ellipse(0, -3, enemy ? 28 : 44, enemy ? 10 : 15).stroke({ width: 3, color: actor.accent, alpha: .7 });
    actor.root.eventMode = 'none'; actor.root.alpha = 1; actor.enemy = enemy; actor.unitData = unit;
    this.layoutActorHud(actor);
    actor.targetX = unit.x; actor.targetY = unit.y; actor.actionUntil = 0;
    if (this.reducedMotion) actor.animationController.kill();
    this.combatLayer.addChild(actor.root); this.actors.set(unit.id, actor);
    return actor;
  }
  applySnapshot(state, playerId) {
    if (this.disposed) return;
    this.state = state; this.visualNow = state.time; this.receivedAt = performance.now();
    this.myLane = state.players.find(p => p.id === playerId)?.lane ?? 0;
    if (this.capacity !== state.capacity) { this.capacity = state.capacity; this.drawRoutes(); this.resize(); }
    const next = new Set();
    for (const [rows, enemy] of [[state.units, false], [state.enemies, true]]) for (const row of rows) {
      next.add(row.id);
      const actor = this.actors.get(row.id) || this.makeActor(row, enemy);
      actor.unitData = row; actor.targetX = row.x; actor.targetY = row.y;
      if (actor.hp !== row.hp / row.maxHp * 100) actor.setHp(row.hp / row.maxHp * 100);
      if (this.reducedMotion) actor.animationController.kill();
      actor.root.alpha = row.hp > 0 ? 1 : .32;
      actor.nameLabel.text = enemy ? this.catalog.enemies[row.archetype||row.type].name : `${LANES[row.ownerLane]} · ${row.name}`;
    }
    for (const [id, actor] of this.actors) if (!next.has(id)) {
      actor.animationController?.kill(); actor.root.removeFromParent(); actor.root.destroy({ children: true }); this.actors.delete(id);
    }
    this.characters = [...this.actors.values()]; this.allies = this.characters.filter(a => !a.enemy); this.enemies = this.characters.filter(a => a.enemy);
    this.refreshVisibility();
    this.bossWarnings.clear();
    for(const enemy of state.enemies)if(enemy.cast&&enemy.cast.endsAt>state.time&&(this.focusLane===null||this.focusLane===enemy.cast.lane)){
      this.bossWarnings.roundRect(820,laneY(enemy.cast.lane,state.capacity)-115,900,230,24).fill({color:0xf35f63,alpha:.2}).stroke({color:0xffaa81,width:4,alpha:.9});
    }
    // Old events after reconnect are never replayed as a long animation backlog.
    for (const event of state.events) if (event.seq > this.lastEvent && state.time - event.at < 1200 && this.visible) this.playDefenseEvent(event);
    this.lastEvent = state.seq;
    if (['VICTORY', 'DEFEAT'].includes(state.phase)) this.clearEffects();
  }
  refreshVisibility() {
    for (const actor of this.actors.values()) {
      const unit = actor.unitData;
      actor.root.visible = this.focusLane === null || unit.lane === this.focusLane || unit.move?.lane === this.focusLane;
    }
  }
  updateActors(delta) {
    const blend = Math.min(1, delta / 85);
    for (const actor of this.actors.values()) {
      actor.root.x += (actor.targetX - actor.root.x) * blend;
      actor.root.y += (actor.targetY - actor.root.y) * blend;
      actor.root.zIndex = Math.round(actor.root.y);
      actor.stateHalo.alpha = actor.id === this.selectedUnit ? 1 : .35;
      if (actor.unitData.hp <= 0 || this.reducedMotion) continue;
      const moving = Boolean(actor.unitData.move) || (actor.enemy && Math.abs(actor.targetX - actor.root.x) > .5);
      const desired = performance.now() < actor.actionUntil ? 'ATTACK' : moving ? 'MOVE' : 'IDLE';
      if (actor.state !== desired) actor.setState(desired);
    }
    this.combatLayer.sortChildren();
  }
  trackTimeline(timeline, cleanup = () => {}) {
    const entry = { timeline, cleanup }; this.fxRuns.add(entry);
    timeline.eventCallback('onComplete', () => { cleanup(); this.fxRuns.delete(entry); });
    return timeline;
  }
  playDefenseEvent(event) {
    const actor = this.actors.get(event.actorId), target = this.actors.get(event.targetId);
    if (actor?.root.visible && ['HIT', 'ENEMY_HIT', 'SKILL'].includes(event.type)) {
      actor.actionUntil = performance.now() + 280;
      if (!this.reducedMotion && actor.unitData.hp > 0) actor.setState('ATTACK');
    }
    if (target?.root.visible && ['HIT', 'ENEMY_HIT', 'HEAL'].includes(event.type)) {
      const damage = this.pools.damage.acquire();
      // Reuse V3's pool, but keep one installed font instead of creating styled atlases on every hit.
      for (const child of damage.children) child.visible = child === damage.numberLabel;
      damage.numberLabel.style.fontFamily = DIGIT_FONT; damage.numberLabel.style.fontSize = 76;
      damage.numberLabel.text = `${event.type === 'HEAL' ? '+' : ''}${event.amount.toLocaleString('ko-KR')}`;
      damage.numberLabel.tint = event.type === 'HEAL' ? 0x75ffbd : 0xffc553;
      damage.scale.set(.54);
      damage.rotation = -this.fieldTilt;
      damage.position.set(target.root.x, target.root.y - target.fullBodyHeight * .65); damage.alpha = 1;
      this.effectLayer.addChild(damage);
      const timeline = gsap.timeline().to(damage, { y: damage.y - 55, alpha: 0, duration: this.reducedMotion ? .25 : .65, ease: 'power1.out' });
      this.trackTimeline(timeline, () => { damage.removeFromParent(); this.pools.damage.release(damage); });
      if (event.type !== 'HEAL' && !this.reducedMotion) triggerWhiteFlash(target);
    }
    if (['SKILL','BOSS_CAST'].includes(event.type) && actor?.root.visible && !this.reducedMotion) {
      const kind = ['HEALER', 'CAPTAIN'].includes(event.role) ? 'HP' : event.role === 'GUARD' ? 'DEFENSE' : 'ATTACK';
      const effect = SkillEffectFX.create({ kind, x: event.x, y: event.y - 95, scale: .62 }).attach(this.effectLayer);
      this.activeEffects.add(effect);
      const timeline = gsap.timeline(); effect.play(timeline, { at: .18 });
      this.trackTimeline(timeline, () => { effect.release(); this.activeEffects.delete(effect); });
    }
  }
  clearEffects() {
    for (const entry of this.fxRuns) { entry.timeline.kill(); entry.cleanup(); }
    this.fxRuns.clear();
    for (const effect of this.activeEffects) effect.release(); this.activeEffects.clear();
  }
  diagnostics() {
    return { engine: 'V3 BattleEngine subclass', rendererCount: this.host.querySelectorAll('canvas').length,
      environment: { renderer: 'painted-sprites', routeSprites: this.routeArt.children.length, coreTexture: this.catalog.environment.core,
        causewayTexture: this.catalog.environment.causeway },
      capacity: this.capacity, allies: this.allies.length, enemies: this.enemies.length, focusLane: this.focusLane,
      enemySprites: this.enemies.map(actor => ({ id: actor.id, archetype: actor.unitData.archetype, state: actor.state,
        sourceFacing: actor.artFacing, viewScaleX: actor.view.scale.x, neutralScaleX: actor.neutralAvatarPose.scaleX, hudScaleX: actor.hud.scale.x })),
      phase: this.state?.phase, activeEffects: this.activeEffects.size, timelines: this.fxRuns.size,
      camera: { x: this.focusLane === null ? WORLD.width / 2 : this.focusX, scale: this.root.scale.x, viewWidth: this.viewWidth, tilt: this.fieldTilt },
      serverDeterminesDamage: true, resolution: this.app?.renderer.resolution, world: WORLD, roleFx: SkillEffectFX.diagnostics() };
  }
  destroy() {
    if (this.disposed) return;
    this.disposed = true; this.clearEffects(); this.cameraControls?.abort(); this.panDrag = null;
    if (this.renderTick) this.app?.ticker.remove(this.renderTick);
    for (const actor of this.actors.values()) actor.animationController?.kill();
    this.actors.clear(); super.destroy(); this.routeJoinTexture?.destroy(false);
  }
}
