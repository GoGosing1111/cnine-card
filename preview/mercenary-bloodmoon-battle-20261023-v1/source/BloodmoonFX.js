import { Assets, Container, Sprite, Texture, Rectangle, Graphics } from 'pixi.js';
import { gsap } from 'gsap';
import { makePlan, sample, clamp, RAPID_PROJECTILES, DEFAULT_PLAYBACK_SPEED } from './PlaybackPlan.mjs';
import { settleAssetBatch } from './ResourceLoader.mjs';
const mix = (a, b, q) => ({ x: a.x + (b.x - a.x) * q, y: a.y + (b.y - a.y) * q });
export async function loadCharacterAssets(character, root) {
  const sheets = {};
  await settleAssetBatch(Object.entries({ ...character.motion, skill: character.effects.skill }).map(([key, spec]) => async () => {
    if (spec.path) {
      const source = await Assets.load(root + spec.path);
      sheets[key] = spec.frames.map(f => new Texture({ source: source.source, frame: new Rectangle(f.rect.x, f.rect.y, f.rect.width, f.rect.height) }));
    } else {
      sheets[key] = await settleAssetBatch(spec.frames.map(f => async () => {
        const source = await Assets.load(root + f.path);
        return new Texture({ source: source.source });
      }), texture => texture.destroy(false));
    }
    return sheets[key];
  }), textures => { for (const texture of textures) texture.destroy(false); });
  return sheets;
}
export class BloodmoonFX {
  constructor(engine, actor, targets, assets, character, onUpdate = () => {}) {
    Object.assign(this, { engine, actor, targets, assets, character, onUpdate });
    actor.animationController.kill(); this.clock = { time: 0 }; this.speed = DEFAULT_PLAYBACK_SPEED; this.destroyed = false;
    this.plan = makePlan(character.skillKind, 'idle');
    this.bodyHeight = character.battleBodyHeight;
    // kill() restores the engine's initial canvas-sized pose. Register the
    // authored body's size afterward, so start/end/cancel cannot restore it.
    this.applyPose(null);actor.captureNeutralAvatarPose();
    this.targetDefaults = targets.map(t => ({ x: t.view.x, tint: t.fullBodySprite.tint }));
    this.layer = new Container({ label: 'BloodmoonSkillFX', eventMode: 'none' }); engine.effectLayer.addChild(this.layer);
    this.pool = Array.from({ length: 20 }, () => { const sprite = new Sprite(); sprite.anchor.set(.5); sprite.visible = false; this.layer.addChild(sprite); return sprite; });
    this.light = new Graphics(); this.layer.addChild(this.light);
    this.captureFormation(); this.makeTimeline(); this.render(0);
  }
  get time() { return this.clock.time; }
  get playing() { return Boolean(this.timeline && !this.timeline.paused() && this.time < this.plan.duration); }
  captureFormation() { this.start = { x: this.actor.baseX ?? this.actor.root.x, y: this.actor.baseY ?? this.actor.root.y }; }
  makeTimeline() {
    this.removeTimeline();
    this.timeline = gsap.timeline({ paused: true, onUpdate: () => this.render(this.time), onComplete: () => {
      this.engine.simpleTimelines.delete(this.registration);
      if (this.onComplete?.(this) === true) return;
      if (this.plan.loop && !this.destroyed) { this.timeline.restart(); this.engine.simpleTimelines.add(this.registration); }
      else { this.timeline.pause(); this.render(this.plan.duration); }
    } }).to(this.clock, { time: this.plan.duration, duration: this.plan.duration, ease: 'none' }).timeScale(this.speed);
    this.registration = { instance: this.timeline, settle: () => this.cancel() };
  }
  removeTimeline() { if (this.registration) this.engine.simpleTimelines.delete(this.registration); this.timeline?.kill(); this.timeline = null; this.registration = null; }
  play() { if (this.destroyed) return; if (!this.timeline) this.makeTimeline(); if (this.time >= this.plan.duration) this.seek(0); this.engine.simpleTimelines.add(this.registration); this.timeline.play(); this.onUpdate(this); }
  pause() { this.timeline?.pause(); this.onUpdate(this); }
  seek(t) { if (this.destroyed) return; if (!this.timeline) this.makeTimeline(); this.timeline.pause().time(clamp(t, 0, this.plan.duration), true); this.clock.time = clamp(t, 0, this.plan.duration); this.render(this.time); }
  setSpeed(speed) { this.speed = clamp(Number(speed) || 1, .25, 2); this.timeline?.timeScale(this.speed); this.onUpdate(this); }
  setAction(action) { this.cancel(); this.plan = makePlan(this.character.skillKind, action); this.makeTimeline(); this.render(0); }
  cancel() { if (this.destroyed) return; this.removeTimeline(); this.clock.time = 0; this.render(0, true); }
  point(actor, fraction = 0) { return this.engine.effectLayer.toLocal(actor.root.toGlobal({ x: 0, y: -actor.fullBodyHeight * fraction })); }
  applyPose(pose) {
    const s = this.actor.fullBodySprite;
    const current=pose??{sheet:'basic',frame:0};
    const sheet = this.character.motion[current.sheet], frame = sheet.frames[current.frame];
    s.texture = this.assets[current.sheet][current.frame]; s.anchor.set(frame.foot.x / frame.rect.width, frame.foot.y / frame.rect.height);
    // Higher-resolution repaired art uses its canvas density, never a pose-bounds fit.
    this.bodyPixelDensity=frame.bodyPixelDensity??1;
    s.scale.set(this.bodyHeight / (sheet.bodyPixels*this.bodyPixelDensity));
    const neutral = this.actor.neutralAvatarPose?.mainSprite; if (neutral) { neutral.scaleX = s.scale.x; neutral.scaleY = s.scale.y; }
    return pose?frame:null;
  }
  launchOrigin(){
    const skill=this.plan.action==='skill',sheet=this.character.motion[skill?'skillMotion':'basic'],frame=sheet.frames[skill?2:5],scale=this.bodyHeight/sheet.bodyPixels;
    // The registered firing pose supplies the origin for the whole flight;
    // changing recoil/recovery frames cannot bend the projectile's path.
    return this.layer.toLocal(this.actor.view.toGlobal({x:(frame.emitter.x-frame.foot.x)*scale,y:(frame.emitter.y-frame.foot.y)*scale}));
  }
  emitter(frame) {
    if (!frame) return this.point(this.actor, .5);
    const [x0, y0, x1, y1] = frame.bounds, point = frame.emitter ?? { x: x1, y: y0 + (y1 - y0) * .44 };
    return this.engine.effectLayer.toLocal(this.actor.fullBodySprite.toGlobal({ x: point.x - frame.foot.x, y: point.y - frame.foot.y }));
  }
  shieldPoint(frame) {
    if (!frame?.shield) return this.point(this.actor, .48);
    return this.engine.effectLayer.toLocal(this.actor.fullBodySprite.toGlobal({ x: frame.shield.x - frame.foot.x, y: frame.shield.y - frame.foot.y }));
  }
  contactDestination(target) {
    const isSkillStrike = this.plan.action === 'skill' && this.plan.kind !== 'guard';
    const key = isSkillStrike ? 'skillMotion' : 'basic', index = isSkillStrike ? 2 : 5;
    const sheet = this.character.motion[key], frame = sheet.frames[index], [x0, y0, x1, y1] = frame.bounds;
    const point = frame.emitter ?? { x: x1, y: y0 + (y1 - y0) * .44 }, scale = this.bodyHeight / sheet.bodyPixels;
    const targetPoint = this.actor.root.parent.toLocal(target.root.toGlobal({ x: 0, y: -target.fullBodyHeight * .48 }));
    return { x: targetPoint.x - (point.x - frame.foot.x) * scale * this.actor.root.scale.x * this.actor.view.scale.x,
      y: targetPoint.y - (point.y - frame.foot.y) * scale * this.actor.root.scale.y * this.actor.view.scale.y };
  }
  draw(frame, at, size, alpha = 1, rotation = 0) {
    const s = this.pool[this.used++]; if (!s) throw new Error('Bloodmoon effect pool exceeded');
    s.texture = this.assets.skill[Math.max(0, Math.min(15, frame))]; s.position.set(at.x, at.y); s.width = size; s.height = size * s.texture.height / s.texture.width; s.alpha = alpha; s.rotation = rotation; s.visible = true;
    // Preserve the impact center, but fit only the VFX into a narrow viewport.
    // The full-sized character and its fixed pose scale are never changed here.
    const bounds=s.getBounds(),center=s.toGlobal({x:0,y:0}),screen=this.engine.app.screen,margin=4;
    const fit=Math.min(1,2*Math.max(0,Math.min(center.x-margin,screen.width-margin-center.x))/Math.max(1,bounds.width),2*Math.max(0,Math.min(center.y-margin,screen.height-margin-center.y))/Math.max(1,bounds.height));
    if(fit<1)s.scale.set(s.scale.x*fit,s.scale.y*fit);
    return s;
  }
  render(time, cancelled = false) {
    if (this.destroyed) return;
    this.used = 0;this.lastProjectiles=[]; for (const s of this.pool) s.visible = false; this.light.clear();
    const state = sample(this.plan, time); this.state = state;
    const frame = this.applyPose(cancelled ? null : state.pose);
    const target = this.targets[0], destination = this.contactDestination(target);
    this.actor.root.position.set(this.start.x + (destination.x - this.start.x) * state.travel - state.recoil, this.start.y + (destination.y - this.start.y) * state.travel);
    this.targets.forEach((t, i) => { t.view.x = this.targetDefaults[i].x; t.fullBodySprite.tint = this.targetDefaults[i].tint; });
    this.engine.sortCombatDepth();
    if (cancelled || state.done || time <= 0) { this.onUpdate(this); return; }
    const origin = this.emitter(frame), center = this.plan.kind === 'guard' ? this.shieldPoint(frame) : this.point(this.actor, .48), targetPoints = this.targets.map(t => this.point(t, .48));
    this.lastContactDistance = Math.hypot(origin.x - targetPoints[0].x, origin.y - targetPoints[0].y);
    const size = Math.min(target.fullBodyHeight * Math.abs(target.root.scale.y) * 2, this.engine.scene.width * .28), kind = this.plan.kind;
    if(this.plan.projectileCount){
      const start=this.launchOrigin();
      if(state.effectStage==='cast')this.draw(state.effectFrame,start,size*.3,.85);
      for(const shot of state.projectiles){
        const end=targetPoints[shot.index%targetPoints.length],travelling=shot.stage==='travel',point=travelling?mix(start,end,shot.progress):end;
        const rotation=travelling?Math.atan2(end.y-start.y,end.x-start.x):0;
        const sprite=this.draw(shot.frame,point,size*(travelling?.46:.68),travelling?1:1-shot.progress,rotation);
        this.lastProjectiles.push({index:shot.index,stage:shot.stage,origin:{...start},target:{...end},point:{x:sprite.x,y:sprite.y},rotation,progress:shot.progress,flightSeconds:RAPID_PROJECTILES.flight});
      }
      if(!this.engine.reducedMotion)for(const impact of state.impacts){const t=this.targets[impact.index%this.targets.length];t.view.x+=impact.strength*3;t.fullBodySprite.tint=Number.parseInt(this.character.accent.slice(1),16);}
      this.onUpdate(this);return;
    }
    if (this.plan.kind!=='melee' && this.plan.action === 'attack' && time >= .43 && time < .95) this.draw(8 + Math.min(7, Math.floor((time - .43) / .065)), targetPoints[0], size * .62, .9);
    if (state.effectFrame !== null) {
      const f = state.effectFrame, q = state.progress, stage = state.effectStage;
      if (stage === 'cast') this.draw(f, kind === 'guard' ? center : origin, size * (kind === 'guard' ? 1.05 : .65), .92);
      else if (stage === 'travel') {
        if (kind === 'barrage') for (let i = 0; i < 3; i++) { const p = mix(origin, targetPoints[i % targetPoints.length], clamp(q * 1.3 - i * .12)); this.draw(4 + ((f - 4 + i) % 4), p, size * .46, .95); }
        else if (kind === 'swarm') for (let i = 0; i < 3; i++) { const p = mix(origin, targetPoints[i % targetPoints.length], clamp(q * 1.12 - i * .06)); p.y += Math.sin(q * Math.PI) * (i - 1) * size * .32; this.draw(4 + ((f - 4 + i) % 4), p, size * .58); }
        else if (kind === 'spell') { this.draw(f, origin, size * .7, 1 - q * .65); this.draw(f, targetPoints[0], size * 1.3, .2 + q * .8); }
        else if (kind === 'guard') this.draw(f, center, size * 1.18);
        else if (kind === 'ricochet') { const k = Math.min(2, Math.floor(q * 3)), a = k === 0 ? origin : targetPoints[(k - 1) % targetPoints.length], b = targetPoints[k % targetPoints.length], p = mix(a, b, (q * 3) % 1); p.y -= Math.sin((q * 3 % 1) * Math.PI) * size * .35; this.draw(f, p, size * .65); }
        else if (kind === 'melee') this.draw(f, mix(origin, targetPoints[0], q), size * .9);
        else this.draw(f, mix(origin, targetPoints[0], q), size * .8);
      } else {
        const alpha = q > .8 ? (1 - q) / .2 : 1;
        if (['barrage', 'swarm', 'ricochet'].includes(kind)) for (let i = 0; i < 3; i++) this.draw(Math.max(8, f - i), targetPoints[i % targetPoints.length], size * (kind === 'swarm' ? .9 : .76), alpha);
        else { this.draw(f, targetPoints[0], size * (kind === 'spell' ? 1.32 : 1.07), alpha); if (kind === 'guard' && q < .5) this.draw(7, center, size * .7, (1 - q * 2) * .25); }
      }
    }
    if (state.strike > 0 && !this.engine.reducedMotion) {
      const count = ['barrage', 'swarm', 'ricochet'].includes(kind) && this.plan.action === 'skill' ? 3 : 1;
      for (let i = 0; i < count; i++) { const t = this.targets[i % this.targets.length]; t.view.x += state.strike * 3; t.fullBodySprite.tint = Number.parseInt(this.character.accent.slice(1), 16); }
    }
    this.onUpdate(this);
  }
  diagnostics() { return { ready: !this.destroyed, character: this.character.id, action: this.plan.action, kind: this.plan.kind, time: this.time, playing: this.playing, speed: this.speed, pose: this.state?.pose, effectFrame: this.state?.effectFrame, effectStage: this.state?.effectStage,
    visibleEffects: this.pool.filter(s => s.visible).length, ownTimelines: this.timeline ? 1 : 0, registeredTimelines: this.registration && this.engine.simpleTimelines.has(this.registration) ? 1 : 0,
    effectLayers: this.engine.effectLayer.children.filter(c => c.label === 'BloodmoonSkillFX').length, regularAllies: this.engine.allies.length, mercenaryInRegularArray: this.engine.allies.includes(this.actor), contactDistance: this.lastContactDistance ?? null,
    spriteScale: { x: this.actor.fullBodySprite.scale?.x ?? null, y: this.actor.fullBodySprite.scale?.y ?? null }, expectedSheetScale: !this.destroyed ? this.bodyHeight / (this.character.motion[this.state?.pose?.sheet??'basic'].bodyPixels*this.bodyPixelDensity) : null,
    bodyPixelDensity:this.bodyPixelDensity,
    projectiles:this.lastProjectiles??[],
    effectBounds:this.pool.filter(s=>s.visible).map(s=>{const b=s.getBounds();return {x:b.x,y:b.y,width:b.width,height:b.height};}),viewport:{width:this.engine.app?.screen?.width??0,height:this.engine.app?.screen?.height??0},
    clock: 'ONE_GSAP', damageAuthority: 'NONE_VISUAL_PREVIEW', fixedSheetScale: true };
  }
  destroy() { if (this.destroyed) return; this.cancel(); this.layer.destroy({ children: true, texture: false }); for (const group of Object.values(this.assets)) for (const texture of group) texture.destroy(false); this.destroyed = true; }
}
