import { Assets, BitmapFont, Cache, Container, Graphics, Rectangle, Sprite, Text, Texture, TilingSprite } from 'pixi.js';
import { gsap } from 'gsap';
import { BattleEngine } from '../../project-v-v3/source/battle/BattleEngine.js';
import {createBattleGroundSigil} from '../../project-v-v3/source/battle/BattleGroundSigil.js';
import {BATTLE_HUD_ASSETS} from '../../project-v-v3/source/battle/BattleHud.js';
import { BattleCharacter, TEAM } from '../../project-v-v3/source/battle/BattleCharacter.js';
import { SkillEffectFX, triggerWhiteFlash } from '../../project-v-v3/source/battle/SkillEffectFX.js';
import { WORLD, laneY, LANES } from './defense-model.mjs';
import {resolveV3MercenaryArt,v3MercenaryHeight} from '../../project-v-v3/source/battle/MercenaryCombatPlayback.js';
import {attachMercenaryArt} from '../../project-v-mercenary-system-v1/source/MercenaryAttachmentPoints.js';
import {defenseMercenaryPresentation} from './DefenseMercenaryPresentation.js';

const OWNER_COLORS = [0x70e4cf, 0xe7bb76, 0xbda5f5];
const DIGIT_FONT = 'CoopDefenseDigitsV1';
const textStyle = { fontFamily: 'Defense SUIT, Malgun Gothic, sans-serif', fontSize: 25, fontWeight: '700', fill: 0xc4d6d3 };
export class DefenseBattleEngine extends BattleEngine {
  constructor({ host, catalog }) {
    super({ host, battleData: { mode: 'PVE', battleV2: {} } });
    this.gridMode = 'defense'; this.catalog = catalog; this.actors = new Map(); this.capacity = 3;
    this.focusLane = null; this.focusX = WORLD.frontX - 170; this.selectedUnit = null; this.myLane = 0; this.state = null;
    this.fxRuns = new Set(); this.activeEffects = new Set(); this.visualNow = 0; this.lastEvent = 0;
    this.supportPortals = new Map(); this.portalFrames = [];
    this.presentationErrors=[];this.v3Art=new Map();this.actorSetups=[];
    this.disposed = false; this.soundEnabled = false;
  }
  async loadBattlefieldTexture() {
    const [background] = await Promise.all([this.catalog.background, this.catalog.environment.causeway, this.catalog.environment.core, this.catalog.environment.teleport, this.catalog.uiSkin.nameplate].map(path => Assets.load(path)));
    const atlas = Assets.get(this.catalog.environment.teleport);
    this.portalFrames = Array.from({length:6}, (_,i) => new Texture({source:atlas.source, frame:new Rectangle(i%3*384,Math.floor(i/3)*384,384,384)}));
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
    await Promise.all(Object.values(this.catalog.units).filter(u=>/^V-\d+$/.test(u.code)).map(async u=>{
      const art=await resolveV3MercenaryArt(u.code);if(!art)throw Error('MERCENARY_SD_NOT_READY:'+u.code);
      this.v3Art.set(u.code,art);await Assets.load(art.spriteUrl);
    }));
    const paths = [...Object.values(this.catalog.units).map(x => x.battleSprite), ...Object.values(this.catalog.enemies).map(x => x.battleSprite)];
    await Promise.all([...new Set(paths)].map(p => Assets.load(p)));
    this.characters = []; this.allies = []; this.enemies = [];
  }
  async prepareActors(){await Promise.all(this.actorSetups);}
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
    for(const actor of this.actors.values())actor.presentation?.update();
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
    actor.hud.fontSizeOverride = Math.min(30, Math.max(20, 9 / (scale * actor.hud.scale.x)));
    actor.hud.setCompact(false);
    actor.hud.setNameVisible(!actor.enemy || actor.unitData.type === 'BOSS');
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
    const mercArt=!enemy&&this.v3Art.get(unit.code),texture = Assets.get(mercArt?.spriteUrl||art.battleSprite);
    const actor = new BattleCharacter({ id: unit.id, name: enemy ? art.name : `${LANES[unit.ownerLane]} · ${unit.name}`,
      team: enemy ? TEAM.ENEMY : TEAM.ALLY, texture, fullBodyTexture: texture, fullBodyHeight: enemy ? (art.height||180) : mercArt?v3MercenaryHeight(unit.code,mercArt):art.fullBodyHeight||260,
      x: unit.x, y: unit.y, scale: 1, accent: enemy ? 0xe97c72 : OWNER_COLORS[unit.ownerLane], hp: 100 });
    actor.artFacing = enemy ? art.artFacing || 1 : 1;
    actor.applyFacing(); // Also updates the neutral pose used by move/attack/hit resets.
    // The approved compact B HUD is shared by both factions and battle modes.
    actor.nameLabel.style.fontFamily = 'Defense SUIT, Malgun Gothic, sans-serif';
    if (art.footAnchor) actor.mainSprite.anchor.set(art.footAnchor.x, art.footAnchor.y);
    if(mercArt){Object.assign(actor,{cardId:unit.code,isMercenary:true,actorKind:'MERCENARY',role:unit.mercenary?.role||art.mercenary?.role||mercArt.role,
      mercenaryRow:{...art,...(unit.mercenary||art.mercenary)},serverMaxHp:unit.maxHp,battleActive:true,enabled:true});
      actor.fullBodySprite.anchor.set(mercArt.footAnchor.x,mercArt.footAnchor.y);attachMercenaryArt(actor,mercArt);}
    actor.bodyHeight=mercArt?.bodyHeight||actor.fullBodyHeight;
    actor.hud.y = -(actor.bodyHeight + 60);
    actor.hud.scale.set(enemy ? .65 : .75);
    actor.battleCard = {...art, ...unit};
    actor.stateHalo.removeFromParent(); actor.stateHalo.destroy({children:true});
    actor.stateHalo=createBattleGroundSigil({actor,team:actor.team,width:enemy?128:180,height:enemy?40:56});
    actor.stateHalo.y=-3; actor.stateHalo.zIndex=1; actor.root.addChildAt(actor.stateHalo,0);
    // Keep contact shading inside the rune, rather than painting over its band.
    actor.shadow.scale.set(enemy ? .46 : .65);
    actor.root.eventMode = 'none'; actor.root.alpha = 1; actor.enemy = enemy; actor.unitData = unit;
    actor.skillLabel=new Text({text:'',style:{...textStyle,fontSize:19,fill:0xffe0a1}});actor.skillLabel.anchor.set(.5);actor.skillLabel.position.set(110,83);actor.hud.addChild(actor.skillLabel);
    this.layoutActorHud(actor);
    actor.targetX = unit.x; actor.targetY = unit.y; actor.actionUntil = 0;
    if (this.reducedMotion) actor.animationController.kill();
    this.combatLayer.addChild(actor.root); this.actors.set(unit.id, actor);
    if(mercArt){actor.presentation=defenseMercenaryPresentation(this,actor);this.actorSetups.push(actor.presentation.ready);}
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
      actor.serverMaxHp=row.maxHp;actor.removedAt=null;
      if (actor.hp !== row.hp / row.maxHp * 100) actor.setHp(row.hp / row.maxHp * 100);
      if (this.reducedMotion) actor.animationController.kill();
      actor.root.alpha = row.hp > 0 ? 1 : .32;
      actor.setShield(row.shield||0,row.maxShield||0);
      actor.setDisplayName(enemy ? this.catalog.enemies[row.archetype||row.type].name : `${LANES[row.ownerLane]} · ${row.name}`);
    }
    for (const [id, actor] of this.actors) if (!next.has(id)) {
      // Keep a lethal-hit target through its short V3 impact, not indefinitely.
      actor.unitData.hp=0;actor.removedAt??=performance.now();
      if(performance.now()-actor.removedAt<4000)continue;
      actor.presentation?.dispose();actor.animationController?.kill();actor.destroy();this.actors.delete(id);
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
      actor.presentation?.update();
    }
  }
  updateActors(delta) {
    const blend = Math.min(1, delta / 85);
    const now = this.state ? this.state.time + Math.min(1000,performance.now() - this.receivedAt) : 0;
    for (const actor of this.actors.values()) {
      const move=['PREP','WAVE'].includes(this.state?.phase)?actor.unitData.move:null;
      if(move){
        const progress=Math.max(0,Math.min(1,(now-move.startedAt)/(move.endsAt-move.startedAt)));
        actor.root.position.set(progress<.55?move.fromX:move.x,progress<.55?move.fromY:move.y);
        actor.root.alpha=this.reducedMotion?1:progress<.55?Math.max(0,1-progress/.32):Math.min(1,(progress-.55)/.45);
        actor.teleporting=true;this.updateSupportPortal(actor,progress);
      }else{
        if(actor.teleporting){actor.root.position.set(actor.targetX,actor.targetY);actor.teleporting=false;}
        if(!actor.presentation?.busy){actor.root.x += (actor.targetX - actor.root.x) * blend;actor.root.y += (actor.targetY - actor.root.y) * blend;}
        actor.root.alpha=actor.unitData.hp>0?1:.32;
        this.removeSupportPortal(actor.id);
      }
      actor.baseX=move?actor.root.x:actor.targetX;actor.baseY=move?actor.root.y:actor.targetY;
      actor.root.baseX=actor.baseX;actor.root.baseY=actor.baseY;actor.presentation?.update();
      actor.skillLabel.visible=performance.now()<(actor.skillLabelUntil||0);
      actor.root.zIndex = Math.round(actor.root.y);
      actor.stateHalo.alpha = actor.id === this.selectedUnit ? 1 : .72;
      actor.stateHalo.visible = actor.unitData.hp > 0;
      if (actor.unitData.hp <= 0 || this.reducedMotion || actor.presentation?.busy) continue;
      const moving = !move && actor.enemy && Math.abs(actor.targetX - actor.root.x) > .5;
      const desired = performance.now() < actor.actionUntil ? 'ATTACK' : moving ? 'MOVE' : 'IDLE';
      if (actor.state !== desired) actor.setState(desired);
    }
    for(const id of this.supportPortals.keys())if(!this.actors.has(id))this.removeSupportPortal(id);
    this.combatLayer.sortChildren();
  }
  updateSupportPortal(actor,progress){
    const move=actor.unitData.move;
    let pair=this.supportPortals.get(actor.id);
    if(!pair){
      pair=[0,1].map(()=>{const sprite=new Sprite(this.portalFrames[0]);sprite.anchor.set(.5,.91);sprite.width=350;sprite.height=350;sprite.eventMode='none';sprite.label='DefenseSupportTeleport';this.combatLayer.addChild(sprite);return sprite;});
      this.supportPortals.set(actor.id,pair);
    }
    const phases=[progress/.62,(progress-.32)/.68],lanes=[actor.unitData.lane,move.lane];
    for(let i=0;i<2;i++){
      const portal=pair[i],t=phases[i];portal.position.set(i?move.x:move.fromX,i?move.y:move.fromY);portal.zIndex=Math.round(portal.y)-1;
      portal.visible=this.visible&&t>=0&&t<1&&(this.focusLane===null||this.focusLane===lanes[i]);
      portal.texture=this.portalFrames[this.reducedMotion?2:Math.min(5,Math.floor(Math.max(0,t)*6))];
      portal.alpha=this.reducedMotion?.32:Math.min(1,t*6,(1-t)*6)*.9;
    }
  }
  removeSupportPortal(id){const pair=this.supportPortals.get(id);if(!pair)return;for(const sprite of pair){sprite.removeFromParent();sprite.destroy();}this.supportPortals.delete(id);}
  trackTimeline(timeline, cleanup = () => {}) {
    const entry = { timeline, cleanup }; this.fxRuns.add(entry);
    timeline.eventCallback('onComplete', () => { cleanup(); this.fxRuns.delete(entry); });
    return timeline;
  }
  playDefenseEvent(event) {
    const actor = this.actors.get(event.actorId), target = this.actors.get(event.targetId);
    if(event.type.startsWith('MERCENARY_')){
      if(actor&&event.type==='MERCENARY_WINDUP'){actor.skillLabel.text=event.skillName||'';actor.skillLabelUntil=performance.now()+2000;}
      const rows=event.heals||event.hits||event.impacts||(event.targetId?[event]:[]),healing=event.type.includes('HEAL');
      const amounts=new Map();for(const row of rows){const amount=healing?row.amount:row.damage;if(amount>0)amounts.set(row.targetId,(amounts.get(row.targetId)||0)+amount);}
      for(const [id,amount]of amounts)this.showDefenseAmount(this.actors.get(id),amount,healing);
    }
    if(actor?.presentation&&actor.root.visible){
      if(event.type==='HIT')void actor.presentation.play(event,true);
      else if(event.type.startsWith('MERCENARY_')&&!['MERCENARY_WINDUP','MERCENARY_END','MERCENARY_CANCEL','MERCENARY_FOCUS'].includes(event.type))void actor.presentation.play(event);
    }
    if (actor?.root.visible && ['HIT', 'ENEMY_HIT', 'SKILL'].includes(event.type)) {
      actor.actionUntil = performance.now() + 280;
      if (!actor.presentation && !this.reducedMotion && actor.unitData.hp > 0) actor.setState('ATTACK');
    }
    if (target?.root.visible && ['HIT', 'ENEMY_HIT', 'HEAL'].includes(event.type)) {
      this.showDefenseAmount(target,event.amount,event.type==='HEAL');
    }
    if (['SKILL','BOSS_CAST'].includes(event.type) && actor?.root.visible && !this.reducedMotion) {
      const kind = ['HEALER', 'CAPTAIN'].includes(event.role) ? 'HP' : event.role === 'GUARD' ? 'DEFENSE' : 'ATTACK';
      const effect = SkillEffectFX.create({ kind, x: event.x, y: event.y - 95, scale: .62 }).attach(this.effectLayer);
      this.activeEffects.add(effect);
      const timeline = gsap.timeline(); effect.play(timeline, { at: .18 });
      this.trackTimeline(timeline, () => { effect.release(); this.activeEffects.delete(effect); });
    }
  }
  showDefenseAmount(target,amount,healing=false){
      if(!target?.root.visible||target.root.destroyed||!Number.isFinite(amount)||amount<=0)return;
      const damage = this.pools.damage.acquire();
      // Reuse V3's pool, but keep one installed font instead of creating styled atlases on every hit.
      for (const child of damage.children) child.visible = child === damage.numberLabel;
      damage.numberLabel.style.fontFamily = DIGIT_FONT; damage.numberLabel.style.fontSize = 76;
      damage.numberLabel.text = `${healing ? '+' : ''}${Math.round(amount).toLocaleString('ko-KR')}`;
      damage.numberLabel.tint = healing ? 0x75ffbd : 0xffc553;
      damage.scale.set(.54);
      damage.rotation = -this.fieldTilt;
      const point=this.effectLayer.toLocal(target.root.toGlobal({x:0,y:-(target.bodyHeight||target.fullBodyHeight)*.65}));
      damage.position.copyFrom(point); damage.alpha = 1;
      this.effectLayer.addChild(damage);
      const timeline = gsap.timeline().to(damage, { y: damage.y - 55, alpha: 0, duration: this.reducedMotion ? .25 : .65, ease: 'power1.out' });
      this.trackTimeline(timeline, () => { damage.removeFromParent(); this.pools.damage.release(damage); });
      if (!healing && !this.reducedMotion) triggerWhiteFlash(target);
  }
  clearEffects() {
    for(const id of this.supportPortals.keys())this.removeSupportPortal(id);
    for (const entry of this.fxRuns) { entry.timeline.kill(); entry.cleanup(); }
    this.fxRuns.clear();
    for (const effect of this.activeEffects) effect.release(); this.activeEffects.clear();
  }
  diagnostics() {
    return { engine: 'V3 BattleEngine subclass', rendererCount: this.host.querySelectorAll('canvas').length,
      environment: { renderer: 'painted-sprites', routeSprites: this.routeArt.children.length, coreTexture: this.catalog.environment.core,
        causewayTexture: this.catalog.environment.causeway },
      capacity: this.capacity, allies: this.allies.length, enemies: this.enemies.length, focusLane: this.focusLane,
      hudNameplates: this.allies.map(actor => ({ id: actor.id, image: BATTLE_HUD_ASSETS.frame, sprite: actor.namePlate instanceof Sprite })),
      groundRunes: this.characters.map(actor => ({id:actor.id,team:actor.team,style:actor.stateHalo.groundStyle,visible:actor.stateHalo.visible,textureWidth:actor.stateHalo.children.at(-1)?.texture?.width})),
      enemySprites: this.enemies.map(actor => ({ id: actor.id, archetype: actor.unitData.archetype, state: actor.state,
        sourceFacing: actor.artFacing, viewScaleX: actor.view.scale.x, neutralScaleX: actor.neutralAvatarPose.scaleX, hudScaleX: actor.hud.scale.x })),
      phase: this.state?.phase, activeEffects: this.activeEffects.size, timelines: this.fxRuns.size,
      mercenaries:this.allies.filter(a=>a.isMercenary).map(a=>({id:a.id,code:a.cardId,bodyHeight:a.bodyHeight,fullBodyHeight:a.fullBodyHeight,footAnchor:{x:a.fullBodySprite.anchor.x,y:a.fullBodySprite.anchor.y},prepared:!!a.presentation?.prepared,played:a.presentation?.played||0,last:a.presentation?.lastPlayed||null,busy:!!a.presentation?.busy,visible:!!a.presentation?.effectLayer.visible,paused:!!a.presentation?.paused,queued:a.presentation?.queue.length||0,activeTimelines:a.presentation?.activeTimelines.size||0,fxChildren:a.presentation?.effectLayer.children.length||0})),presentationErrors:this.presentationErrors,
      supportTeleport:{image:this.catalog.environment.teleport,frames:this.portalFrames.length,active:this.supportPortals.size,positions:[...this.supportPortals].map(([id,pair])=>({id,portals:pair.map(p=>({x:p.x,y:p.y,visible:p.visible,alpha:p.alpha}))}))},
      camera: { x: this.focusLane === null ? WORLD.width / 2 : this.focusX, scale: this.root.scale.x, viewWidth: this.viewWidth, tilt: this.fieldTilt },
      serverDeterminesDamage: true, resolution: this.app?.renderer.resolution, world: WORLD, roleFx: SkillEffectFX.diagnostics() };
  }
  destroy() {
    if (this.disposed) return;
    this.disposed = true; this.clearEffects(); this.cameraControls?.abort(); this.panDrag = null;
    for(const actor of this.actors.values())actor.presentation?.dispose();
    if (this.renderTick) this.app?.ticker.remove(this.renderTick);
    for (const actor of this.actors.values()) actor.animationController?.kill();
    this.actors.clear(); super.destroy(); this.routeJoinTexture?.destroy(false);for(const frame of this.portalFrames)frame.destroy(false);this.portalFrames=[];
  }
}
