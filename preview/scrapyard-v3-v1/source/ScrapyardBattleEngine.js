import {Assets, Container, Graphics} from 'pixi.js';
import {BattleEngine as LiveBattleEngine} from '../../project-v-v3/source/battle/BattleEngine.js';
import {CHARACTER_STATE} from '../../project-v-v3/source/battle/BattleCharacter.js';

// Preview extension of the real renderer, NOT a second renderer or formation.
// Only the five existing hostile actor slots are reused. A drained generation
// boundary and exact server instance IDs prevent old bullets hitting new mobs.
export class BattleEngine extends LiveBattleEngine {
  async mount(target) {
    await super.mount(target);
    // The shared first mount marks hostile slot 1 as a boss after payload bind.
    // In this encounter every actor's role comes from its exact instance.
    for (const actor of this.enemies) actor.isBoss = Boolean(this.instances?.get(actor.id)?.boss);
    this.currentEnemyTarget = this.enemies.find(actor => this.isAlive(actor));
    this.boss = this.currentEnemyTarget;
    return this;
  }
  async loadBattlefieldTexture() {
    return Assets.load('/assets/ui/scrapyard/scrapyard-arena-v1676.png');
  }
  async applyBattlePayload(payload) {
    const config = payload.scrapyardPreview;
    if (!config) throw new Error('SCRAPYARD_PREVIEW_PAYLOAD_REQUIRED');
    this.instances = new Map(config.instances.map(row => [row.id, row]));
    this.retiredIds = new Set();
    this.spawnCount = 0; this.defeatedCount = 0; this.previewEventCount = 0; this.maxQueuedDamageEvents = 0;
    this.seenKnockouts = new Set();
    // The shared card/suit adapters stay intact. Its single-monster branch is
    // bypassed, then real MONSTER actors bind below (never fake card IDs).
    await super.applyBattlePayload({...payload, monster: null,
      battleV2: {...payload.battleV2, teams: {...payload.battleV2.teams, B: {cards: []}}}});
    this.livePayload = true;
    this.battleData = payload;
    for (const row of config.instances) {
      if (!this.spriteTextures) this.spriteTextures = new Map();
      if (!this.spriteTextures.has(row.battleSprite)) this.spriteTextures.set(row.battleSprite, await Assets.load(row.battleSprite));
      this.rememberPendingLiveAsset(row.battleSprite, this.spriteTextures.get(row.battleSprite));
    }
    for (const id of config.initialIds) this.bindMonster(this.instances.get(id));
    this.currentEnemyTarget = this.enemies.find(actor => this.isAlive(actor));
    this.boss = this.currentEnemyTarget;
    this.activeMonsterArt = {kind: 'SCRAPYARD_PREVIEW', count: config.initialIds.length};
    return this.activeMonsterArt;
  }
  bindMonster(row) {
    const actor = this.enemies[row.slot];
    if (!actor) throw new Error('INVALID_MONSTER_SLOT');
    if (actor.battleActive && actor.id !== row.id) this.retiredIds.add(actor.id);
    this.settlePendingTails([actor]);
    // Do not capture a dead predecessor's rotation/alpha as the new bind pose.
    // useFullBodySprite captures neutral pose internally, so reset BEFORE it.
    actor.animationAdapter?.kill?.();
    actor.view.position.set(0, 0); actor.view.rotation = 0; actor.view.alpha = 1;
    actor.view.scale.set(-1, 1);
    actor.fullBodySprite.position.set(0, 0); actor.fullBodySprite.rotation = 0;
    actor.fullBodySprite.alpha = 1;
    actor.id = row.id; actor.cardId = row.cardId; actor.name = row.name;
    actor.nameLabel.text = row.boss ? row.name : `기어죠 ${row.id.split(':').at(-1)}`;
    actor.serverMaxHp = row.maxHp; actor.serverMaxShield = row.maxShield || 0;
    actor.startingShield = row.shield || 0; actor.startingMaxShield = row.maxShield || 0;
    actor.texture = this.spriteTextures.get(row.battleSprite);
    actor.cutInTexture = actor.texture;
    actor.useFullBodySprite(actor.texture, row.boss ? 395 : 280);
    // Sprites were authored facing left; counter-mirror the shared enemy view.
    actor.fullBodySprite.scale.x = -Math.abs(actor.fullBodySprite.scale.x);
    actor.captureNeutralAvatarPose();
    actor.isBoss = Boolean(row.boss); actor.combatRole = 'ATTACK';
    actor.battleActive = true;
    actor.root.visible = true; actor.root.renderable = true; actor.root.alpha = 1;
    actor.root.position.set(actor.baseX, actor.baseY); actor.root.scale.set(actor.restScale);
    actor.root.rotation = 0; actor.setTint(0xffffff);
    actor.setState(CHARACTER_STATE.IDLE); actor.setHp(100);
    actor.setShield(row.shield || 0, row.maxShield || 0);
    actor.hud.y = -(row.boss ? 408 : 305);
    actor.root.projectVMonsterArt = {kind: 'SCRAPYARD_PREVIEW', primaryUrl: row.battleSprite, sourceArt: row.sourceArt};
    this.spawnCount++;
    return actor;
  }
  combatantById(value) {
    const id = String(value?.id || value || '');
    if (id.startsWith('B:') && id.includes(':SCRAP:')) return this.enemies.find(actor => actor.id === id) || null;
    return super.combatantById(value);
  }
  advancePace(type) { super.advancePace(type); this.paceScale = this.previewSpeed || 1; }
  async drainGeneration() {
    const drained = await this.waitForAccountBattleUnitDamageQueueDrain(6000);
    if (!drained) throw new Error('배틀슈트 탄착 대기열이 남아 증원을 중단했습니다.');
  }
  async spawnMonster(event) {
    const epoch = this.playbackEpoch;
    await this.drainGeneration();
    if (epoch !== this.playbackEpoch || !this.visible) return false;
    const row = this.instances.get(event.targetId);
    if (!row || this.isAlive(this.enemies[row.slot])) throw new Error('ENEMY_SPAWN_SLOT_NOT_EMPTY');
    const actor = this.bindMonster(row);
    if (row.boss) await this.showBanner('고철군주 브레이커', 0xffa750, 'FINAL TARGET / BOSS');
    if (epoch !== this.playbackEpoch || !this.visible) return false;
    // GSAP timeline owned by the shared engine. No autonomous ticker/timer.
    const fx = new Container({label: 'SCRAPYARD_SPAWN_DUST'});
    this.effectLayer.addChild(fx);
    const ring = new Graphics().ellipse(0, 0, row.boss ? 130 : 78, 22).stroke({color: 0xe7ac5f, width: 3, alpha: .8});
    ring.position.set(actor.baseX, actor.baseY); fx.addChild(ring);
    for (let i = 0; i < 12; i++) {
      const fleck = new Graphics().rect(-2, -2, i % 3 ? 4 : 8, 3).fill(i % 2 ? 0xf6bf70 : 0xa4aeb2);
      fleck.position.set(actor.baseX, actor.baseY - 8); fx.addChild(fleck);
    }
    return this.timeline(tl => {
      tl.fromTo(actor.root, {x: actor.baseX + 100, alpha: 0}, {x: actor.baseX, alpha: 1, duration: .48, ease: 'power3.out'}, 0);
      tl.to(ring.scale, {x: 1.7, y: 1.7, duration: .6}, .12);
      tl.to(ring, {alpha: 0, duration: .5}, .18);
      fx.children.slice(1).forEach((particle, i) => tl.to(particle, {
        x: actor.baseX + Math.cos(i * 2.4) * (48 + i * 4),
        y: actor.baseY - 20 - (i % 4) * 14, alpha: 0, duration: .45, ease: 'power2.out'}, .08));
    }, () => {fx.destroy({children: true}); actor.root.x = actor.baseX;});
  }
  async playEvents(events, options) {
    const epoch = this.playbackEpoch;
    for (const event of events) {
      if (!this.visible || epoch !== this.playbackEpoch) return false;
      this.previewEventCount++;
      if (event.type === 'ENEMY_SPAWN') await this.spawnMonster(event);
      else {
        // A final shot must visibly land on the retiring instance before KO.
        if (event.type === 'KO' && this.instances.has(event.targetId)) await this.drainGeneration();
        if (!this.visible || epoch !== this.playbackEpoch) return false;
        if (this.retiredIds.has(event.targetId) || this.retiredIds.has(event.actorId)) throw new Error('STALE_ENEMY_INSTANCE');
        await super.playEvents([event], options);
        // Backpressure on the visual producer, NOT damage/shot-rate tuning.
        // Weak decks may emit hundreds of independent shots before one KO.
        // Never enqueue the full wave then time out while draining it.
        const queued = this.accountBattleUnitDamageQueue?.length || 0;
        this.maxQueuedDamageEvents = Math.max(this.maxQueuedDamageEvents, queued);
        if (queued >= 16) await this.drainGeneration();
        if (!this.visible || epoch !== this.playbackEpoch) return false;
        if (event.type === 'KO' && this.instances.has(event.targetId) && !this.seenKnockouts.has(event.targetId)) {
          this.seenKnockouts.add(event.targetId); this.defeatedCount++;
          const actor = this.combatantById(event.targetId);
          await this.timeline(tl => tl.to(actor.root, {alpha: 0, duration: .16}, .34),
            () => {actor.root.visible = false;});
        }
      }
      if (!this.visible || epoch !== this.playbackEpoch) return false;
      window.dispatchEvent(new CustomEvent('scrapyard-combat-event', {detail: event}));
    }
    return true;
  }
  syncFinalState(final) {
    const liveIds = new Set(this.enemies.map(actor => actor.id));
    const result = super.syncFinalState({...final, B: (final.B || []).filter(row => liveIds.has(row.id))});
    this.enemies.filter(actor => actor.hp <= 0).forEach(actor => {actor.root.visible = false;});
    return result;
  }
  scrapyardState() {
    return {spawned: this.spawnCount || 0, defeated: this.defeatedCount || 0,
      survivors: this.allies.filter(actor => this.isAlive(actor)).length,
      maxQueuedDamageEvents: this.maxQueuedDamageEvents || 0,
      events: this.previewEventCount || 0, retiredIds: [...(this.retiredIds || [])],
      active: this.enemies.filter(actor => this.isAlive(actor)).map(actor => ({id: actor.id, hp: actor.hp, boss: actor.isBoss,
        viewAlpha: actor.view.alpha, neutralAlpha: actor.neutralAvatarPose.alpha,
        neutralRotation: actor.neutralAvatarPose.rotation, sprite: this.instances.get(actor.id)?.battleSprite}))};
  }
  diagnostics() {
    return {...super.diagnostics(), previewBattlefieldAsset: '/assets/ui/scrapyard/scrapyard-arena-v1676.png',
      scrapyard: this.scrapyardState()};
  }
}
