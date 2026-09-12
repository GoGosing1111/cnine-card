import { SuccessCinematic } from './success-v2.mjs';
const { pixi: { Application, Assets, Container, Graphics, Sprite } = {}, gsap } = globalThis.CNineUiFxVendor || {};
const TAU = Math.PI * 2;
const clamp = n => Math.max(0, Math.min(1, n));
const fract = n => n - Math.floor(n);
const random = n => fract(Math.sin(n * 78.233 + 12.9898) * 43758.5453);
const easeOut = n => 1 - (1 - clamp(n)) ** 3;
export const EFFECT_TIMING = Object.freeze({ charge: 1.5, impact: 2.25, reveal: 3.15, duration: 4.8 });
const AUDIO_ROOT = '/assets/sfx/v3-advancement-awakening-v1/';
export const SOUND_CUES = Object.freeze({
  success: { file: 'riposte-advancement-v1.mp3', sync: .300, gain: .48 },
  maintain: { file: 'afterimage-advancement-v1.mp3', sync: .178, gain: .16 },
  destroy: { file: 'shatter-advancement-v1.mp3', sync: .250, gain: .34 },
  protected: { file: 'immortal-advancement-v1.mp3', sync: .333, gain: .32 },
  restore: { file: 'immortal-advancement-v1.mp3', sync: .333, gain: .38 },
});

class RecordedAudio {
  constructor() { this.enabled = false; this.buffers = new Map(); this.generation = 0; this.syncErrorMs = null; }
  async enable(value) {
    this.enabled = value;
    if (!value) { this.stop(); return false; }
    try {
      this.context ||= new (window.AudioContext || window.webkitAudioContext)();
      await this.context.resume();
      return this.context.state === 'running';
    } catch { this.enabled = false; return false; }
  }
  stop() { this.generation++; try { this.source?.stop(); } catch {} this.source?.disconnect(); this.gain?.disconnect(); this.source = null; this.reference = null; }
  reconcile(kind, getClock) {
    if (!this.reference || !this.source || !this.enabled) return;
    const { time, speed, paused } = getClock();
    if (paused) return;
    const projected = this.reference.time + (this.context.currentTime - this.reference.audioTime) * speed;
    if (Math.abs(projected - time) > .025) this.schedule(kind, getClock);
  }
  async schedule(kind, getClock) {
    this.stop();
    if (!this.enabled || !this.context) return;
    const generation = this.generation, cue = SOUND_CUES[kind];
    try {
      if (!this.buffers.has(cue.file)) {
        const response = await fetch(AUDIO_ROOT + cue.file);
        if (!response.ok) return;
        this.buffers.set(cue.file, await this.context.decodeAudioData(await response.arrayBuffer()));
      }
      if (generation !== this.generation || !this.enabled) return;
      const { time, speed, paused } = getClock();
      if (paused) return;
      const start = EFFECT_TIMING.impact - cue.sync, offset = Math.max(0, time - start);
      const buffer = this.buffers.get(cue.file);
      if (offset >= buffer.duration) return;
      const delay = Math.max(0, (start - time) / speed);
      this.source = this.context.createBufferSource();
      this.gain = this.context.createGain();
      this.source.buffer = buffer;
      this.source.playbackRate.value = speed;
      this.gain.gain.value = cue.gain;
      this.source.connect(this.gain).connect(this.context.destination);
      const scheduledAt = this.context.currentTime + delay;
      this.reference = { time, audioTime: this.context.currentTime };
      // Both the authored source peak and renderer collision use the GSAP elapsed time.
      this.syncErrorMs = Math.abs(delay + (cue.sync - offset) / speed - (EFFECT_TIMING.impact - time) / speed) * 1000;
      this.source.start(scheduledAt, offset);
    } catch { /* Missing/blocked sound must never prevent a visual result. */ }
  }
  destroy() { this.stop(); this.context?.close().catch(() => {}); }
}

export class ForgeFX {
  constructor(host, callbacks = {}) {
    this.host = host; this.callbacks = callbacks; this.clock = { time: 0 }; this.ambient = { time: 0 };
    this.sound = new RecordedAudio(); this.speed = 1; this.reduced = false; this.kind = null;
    this.running = false; this.paused = false; this.fragments = []; this.loadGeneration = 0;
  }
  async init() {
    this.app = new Application();
    await this.app.init({ resizeTo: this.host, antialias: true, backgroundAlpha: 0, resolution: Math.min(devicePixelRatio || 1, 2), autoDensity: true, preference: 'webgl', powerPreference: 'low-power' });
    this.host.appendChild(this.app.canvas);
    this.app.ticker.maxFPS = 60;
    this.root = new Container();
    // Additive plasma must blend against the room inside WebGL. A transparent canvas
    // above a CSS room would accumulate the atlas's dark alpha as a black rectangle.
    this.room = new Container(); this.roomFill = new Graphics(); this.roomSprite = new Sprite(); this.roomSprite.anchor.set(.5); this.roomSprite.alpha = .75;
    this.roomShade = new Graphics(); this.roomDark = new Graphics();
    this.room.addChild(this.roomFill, this.roomSprite, this.roomShade, this.roomDark);
    this.back = new Graphics(); this.weapon = new Sprite(); this.weapon.anchor.set(.5);
    this.fragmentLayer = new Container(); this.front = new Graphics();
    this.success = new SuccessCinematic();
    this.root.addChild(this.back, this.success.layer, this.weapon, this.fragmentLayer, this.success.flash, this.front);
    this.app.stage.addChild(this.room, this.root);
    this.draw = () => this.render();
    this.app.ticker.add(this.draw);
    this.ambientTimeline = gsap.to(this.ambient, { time: 120, duration: 120, repeat: -1, ease: 'none' });
    this.resize = new ResizeObserver(() => this.layout()); this.resize.observe(this.host);
    this.layout();
    const [roomTexture] = await Promise.all([Assets.load(new URL('../assets/upgrade-lab-v2.png', import.meta.url).href), this.success.init()]);
    if (this.destroyed) return this;
    this.roomTexture = roomTexture; this.roomSprite.texture = roomTexture; this.layout();
    this.host.closest('.forge-stage').classList.add('renderer-ready');
    return this;
  }
  layout() {
    if (!this.app?.renderer) return;
    const { width, height } = this.host.getBoundingClientRect();
    this.w = width; this.h = height;
    this.roomFill.clear().rect(0, 0, width, height).fill(0x0d152b);
    if (this.roomTexture) {
      const scale = Math.max(width / this.roomTexture.width, height / this.roomTexture.height);
      this.roomSprite.scale.set(scale); this.roomSprite.position.set(width / 2, height / 2);
    }
    this.roomShade.clear();
    const stops = [[0, .86], [.27, .15], [.51, 0], [.7, .3], [1, 1]];
    for (let i = 0; i < 128; i++) {
      const y = (i + .5) / 128, end = stops.findIndex(stop => stop[0] >= y);
      const [a, b] = [stops[end - 1], stops[end]], mix = (y - a[0]) / (b[0] - a[0]);
      this.roomShade.rect(0, i / 128 * height, width, height / 128).fill({ color: 0x090f25, alpha: a[1] + (b[1] - a[1]) * mix });
    }
    this.roomDark.clear().rect(0, 0, width, height).fill(0x020510); this.roomDark.alpha = 0;
    this.center = { x: width / 2, y: height * .445 };
    this.root.position.set(this.center.x, this.center.y);
    this.weaponWidth = Math.min(width * .83, 640);
    if (this.texture) { this.weapon.width = this.weaponWidth; this.weapon.height = this.weaponWidth * this.texture.height / this.texture.width; }
    this.weaponHeight = this.weapon.height || 100;
    if (this.texture) this.makeFragments();
    this.render();
  }
  async setItem(item) {
    const generation = ++this.loadGeneration;
    const texture = await Assets.load(item.image);
    if (generation !== this.loadGeneration || this.destroyed) return;
    this.item = item; this.texture = texture; this.weapon.texture = texture;
    this.kind = null; this.clock.time = 0; this.layout();
  }
  makeFragments() {
    this.fragmentLayer.removeChildren().forEach(child => child.destroy({ children: true, texture: false, textureSource: false }));
    this.fragments = [];
    const columns = 10, rows = 4, w = this.weaponWidth, h = this.weaponHeight;
    for (let row = 0; row < rows; row++) for (let col = 0; col < columns; col++) {
      const id = row * columns + col, x = (col / columns - .5) * w, y = (row / rows - .5) * h;
      const cw = w / columns, ch = h / rows, cx = x + cw / 2, cy = y + ch / 2;
      const fragment = new Container(), sprite = new Sprite(this.texture), mask = new Graphics();
      sprite.width = w; sprite.height = h; sprite.position.set(-w / 2 - cx, -h / 2 - cy);
      // Nonoverlapping zig-zag cells retain the exact texture at t=0 and reassemble at t=end.
      const skewL = col === 0 ? 0 : Math.sin(col * 7 + row) * cw * .15;
      const skewR = col === columns - 1 ? 0 : Math.sin((col + 1) * 7 + row) * cw * .15;
      const topL = row === 0 ? 0 : Math.sin(col * 3 + row) * ch * .14;
      const topR = row === 0 ? 0 : Math.sin((col + 1) * 3 + row) * ch * .14;
      const botL = row === rows - 1 ? 0 : Math.sin(col * 3 + row + 1) * ch * .14;
      const botR = row === rows - 1 ? 0 : Math.sin((col + 1) * 3 + row + 1) * ch * .14;
      mask.poly([-cw / 2 + skewL, -ch / 2 + topL, cw / 2 + skewR, -ch / 2 + topR, cw / 2 + skewR, ch / 2 + botR, -cw / 2 + skewL, ch / 2 + botL]).fill(0xffffff);
      sprite.mask = mask; fragment.addChild(sprite, mask); fragment.position.set(cx, cy);
      this.fragmentLayer.addChild(fragment);
      this.fragments.push({ node: fragment, x: cx, y: cy, dx: (random(id + 3) - .5) * w * 1.15, dy: (random(id + 70) - .6) * h * 2.7, rotation: (random(id + 190) - .5) * 5, lag: random(id + 250) * .18 });
    }
    this.fragmentLayer.visible = false;
  }
  reset() {
    this.cancel(); this.kind = null; this.clock.time = 0; this.ambientTimeline?.resume();
    if (!this.weapon) return;
    this.weapon.visible = true; this.fragmentLayer.visible = false; this.render();
  }
  play(kind) {
    this.cancel(); this.kind = kind; this.clock.time = 0; this.paused = false; this.running = true;
    this.ambientTimeline?.pause();
    return new Promise(resolve => {
      this.resolvePlay = resolve;
      const finish = () => {
        if (!this.running) return;
        this.running = false; this.paused = false;
        this.callbacks.onTime?.(EFFECT_TIMING.duration, kind);
        const done = this.resolvePlay; this.resolvePlay = null; done?.({ cancelled: false });
      };
      this.finish = finish;
      if (this.reduced) { this.clock.time = EFFECT_TIMING.duration; this.render(); finish(); return; }
      this.timeline = gsap.to(this.clock, { time: EFFECT_TIMING.duration, duration: EFFECT_TIMING.duration, ease: 'none', onUpdate: () => {
        this.callbacks.onTime?.(this.clock.time, kind);
        this.sound.reconcile(kind, () => ({ time: this.clock.time, speed: this.speed, paused: this.paused || !this.running }));
      }, onComplete: finish });
      this.timeline.timeScale(this.speed);
      this.scheduleAudio();
    });
  }
  scheduleAudio() { this.sound.schedule(this.kind, () => ({ time: this.clock.time, speed: this.speed, paused: this.paused || !this.running })); }
  pause(value) {
    if (!this.running) return;
    this.paused = value; this.timeline?.paused(value); this.sound.stop();
    if (!value) this.scheduleAudio();
  }
  setSpeed(value) {
    this.speed = value; this.timeline?.timeScale(value);
    if (this.running && !this.paused) this.scheduleAudio();
  }
  skip() {
    if (!this.running) return;
    this.timeline?.kill(); this.sound.stop(); this.clock.time = EFFECT_TIMING.duration; this.render(); this.finish?.();
  }
  cancel() {
    this.timeline?.kill(); this.timeline = null; this.sound.stop();
    this.running = false; this.paused = false; const resolve = this.resolvePlay; this.resolvePlay = null;
    resolve?.({ cancelled: true });
  }
  render() {
    if (!this.back || !this.w) return;
    const b = this.back, f = this.front; b.clear(); f.clear();
    if (this.kind !== 'success' || this.reduced) this.success?.hide();
    this.root.position.set(this.center.x, this.center.y);
    const idle = this.reduced ? 0 : this.ambient.time, t = this.clock.time;
    const hit = EFFECT_TIMING.impact, post = t - hit, kind = this.kind;
    this.roomDark.alpha = kind === 'success' && !this.reduced ? clamp((t - 1.2) / 1.05) * .5 * (1 - clamp(post / .28)) : 0;
    const charge = kind && t < hit ? clamp(t / hit) : 0;
    const restore = kind === 'restore', destroyed = kind === 'destroy', protectedItem = kind === 'protected';
    const color = restore ? 0x9fcaff : protectedItem ? 0x7af3b7 : destroyed ? 0xff718d : 0x9bbaff;
    const size = Math.min(this.w * .3, 180), floorY = this.h * .253;
    this.weapon.alpha = 1; this.weapon.tint = 0xffffff; this.weapon.rotation = -.095;
    this.weapon.width = this.weaponWidth; this.weapon.height = this.weaponHeight;
    this.weapon.y = this.reduced || kind ? 0 : Math.sin(idle * 1.3) * 4;
    this.weapon.x = 0; this.weapon.visible = !!this.texture; this.fragmentLayer.visible = false;
    if (!this.texture) return;
    // Subtle layered lighting and floating embers. No random values are sampled during playback.
    for (let j = 7; j > 0; j--) b.ellipse(0, floorY, size * (1 + j * .06), 15 + j * 2).fill({ color: 0x6193ff, alpha: .009 * (8 - j) });
    if (!this.reduced) for (let i = 0; i < 42; i++) {
      const x = (random(i + 800) - .5) * this.w * 1.08 + Math.sin(idle * .3 + i) * 7;
      const y = this.h * .35 - fract(random(i + 900) + (kind ? t : idle) * (.025 + random(i + 990) * .03)) * this.h * .65;
      const a = (Math.sin(idle + i) + 1) * .11 + .06;
      b.circle(x, y, .6 + random(i + 700) * .8).fill({ color: i % 7 === 0 ? 0xc7ff84 : 0x8aafff, alpha: a });
    }
    if (!kind) return;
    if (this.reduced) {
      if (destroyed) this.weapon.alpha = .06;
      if (protectedItem || restore) b.ellipse(0, 0, size * 1.3, size * .7).stroke({ color, alpha: .28, width: 1 });
      return;
    }
    if (kind === 'success') { this.success.render(this, t, hit); return; }
    if (charge > 0) {
      const intensity = Math.sin(charge * Math.PI * .65);
      for (let j = 9; j > 0; j--) b.ellipse(0, 0, size * (1 + j * .06), size * (.44 + j * .04)).fill({ color, alpha: intensity * .009 });
      // Each lane traces a tightening helix. Arc length, density and convergence evolve over time.
      for (let lane = 0; lane < 7; lane++) {
        const r = size * (1.25 - charge * .54) + Math.sin(lane + t * 2) * 4;
        const start = lane * TAU / 7 + t * (1.15 + charge), length = .15 + charge * .8;
        for (let k = 0; k < 18; k++) {
          const a = start + length * k / 18, a2 = start + length * (k + 1) / 18;
          b.moveTo(Math.cos(a) * r, Math.sin(a) * r * .6).lineTo(Math.cos(a2) * r, Math.sin(a2) * r * .6).stroke({ color, width: .5 + charge, alpha: intensity * k / 24 });
        }
      }
      for (let i = 0; i < 110; i++) {
        const phase = fract(random(i + 44) + t * .52), radius = (1 - phase) * size * 1.5 + 4;
        const a = random(i + 430) * TAU + phase * 1.2;
        const x = Math.cos(a) * radius, y = Math.sin(a) * radius * .65;
        const alpha = Math.sin(phase * Math.PI) * charge * .8;
        f.moveTo(x * 1.04, y * 1.04).lineTo(x, y).stroke({ color, alpha, width: i % 8 === 0 ? 1.8 : .8 });
      }
      if (t > 1.5 && !restore) {
        const pressure = (t - 1.5) / .75;
        this.weapon.x = Math.sin(t * 72) * pressure * 1.4;
        this.weapon.y = Math.cos(t * 68) * pressure;
        this.weapon.tint = protectedItem ? 0xe0ffe8 : 0xdfeaff;
        f.ellipse(0, 0, size * .8 * (1 - pressure), 50 * (1 - pressure)).stroke({ color, width: 1.7, alpha: pressure * .65 });
      }
    }
    if (restore) {
      const arrive = easeOut((t - .4) / 2.2);
      this.weapon.visible = t >= 2.6;
      this.fragmentLayer.visible = !this.weapon.visible;
      this.fragmentLayer.rotation = this.weapon.rotation;
      for (const part of this.fragments) {
        const n = easeOut(clamp((t - part.lag - .3) / 2.2));
        part.node.position.set(part.x + part.dx * (1 - n), part.y + part.dy * (1 - n) - 30 * Math.sin((1 - n) * Math.PI));
        part.node.rotation = part.rotation * (1 - n); part.node.alpha = clamp(t * 1.5) * (.25 + arrive * .75);
      }
      for (let i = 0; i < 30; i++) {
        const a = random(i + 55) * TAU, radius = size * 1.3 * (1 - arrive);
        const y = Math.sin(a) * radius * .6;
        b.moveTo(Math.cos(a) * radius * 1.18, y * 1.18).lineTo(Math.cos(a) * radius, y).stroke({ color, alpha: Math.sin(arrive * Math.PI) * .6, width: 1 });
      }
    }
    if (post < 0) return;
    const burst = easeOut(post / .55), fade = 1 - clamp(post / 1.8);
    if (kind === 'maintain') {
      // No violent impact: the charge quietly disperses and the exact weapon stays intact.
      for (let i = 0; i < 52; i++) {
        const x = (random(i + 14) - .5) * this.weaponWidth * .7 + Math.sin(i) * post * 19;
        const y = (random(i + 90) - .5) * 45 - post * (12 + random(i + 44) * 25);
        f.circle(x, y, .7 + random(i + 500)).fill({ color: 0xaebbbb, alpha: fade * .5 });
      }
      return;
    }
    if (destroyed) {
      this.weapon.visible = false; this.fragmentLayer.visible = post < 1.75; this.fragmentLayer.rotation = -.095;
      for (const part of this.fragments) {
        const p = Math.max(0, post - part.lag), n = easeOut(p / 1.5);
        part.node.position.set(part.x + part.dx * n, part.y + part.dy * n + p * p * 80);
        part.node.rotation = part.rotation * n; part.node.alpha = (1 - clamp(p / 1.65)) ** 1.5;
      }
      // Radial cracks branch once, followed by falling dust rather than a recolored success ring.
      for (let i = 0; i < 16; i++) {
        const a = i * TAU / 16, r = size * (.4 + random(i + 28) * .6) * burst;
        f.moveTo(0, 0).lineTo(Math.cos(a) * r * .45, Math.sin(a) * r * .33).lineTo(Math.cos(a + .16) * r * .75, Math.sin(a + .16) * r * .6).lineTo(Math.cos(a) * r, Math.sin(a) * r * .7).stroke({ color: 0xf5b58a, width: .8, alpha: (1 - clamp(post / .65)) * .8 });
      }
      for (let j = 0; j < 14; j++) {
        const x = (random(j + 490) - .5) * size * 2, y = post * 55 + random(j + 52) * 10;
        f.ellipse(x, y, 15 + post * 17, 9 + post * 9).fill({ color: 0x292823, alpha: fade * .027 });
      }
    } else if (protectedItem) {
      // Curved segments form a shield and intercept inward red fractures at its perimeter.
      const shield = Math.min(1, post * 12), shieldFade = 1 - clamp((post - 1.05) / 1.2);
      for (let layer = 4; layer > 0; layer--) b.ellipse(0, 0, size * 1.22 + layer * 5, size * .8 + layer * 4).fill({ color: 0xa2d7b5, alpha: .014 * shieldFade });
      for (let i = 0; i < 24; i++) {
        const start = i * TAU / 24, len = TAU / 24 * .8;
        const x = Math.cos(start) * size * 1.2, y = Math.sin(start) * size * .77;
        f.moveTo(x, y).lineTo(Math.cos(start + len * shield) * size * 1.2, Math.sin(start + len * shield) * size * .77).stroke({ color: 0xc5e8ca, width: 1.6, alpha: shieldFade * .8 });
        const redRadius = size * (1.8 - clamp(post * 6) * .6);
        if (post < .35) f.moveTo(Math.cos(start) * redRadius, Math.sin(start) * redRadius * .64).lineTo(Math.cos(start) * (redRadius + 11), Math.sin(start) * (redRadius + 11) * .64).stroke({ color: 0xd49883, width: 1, alpha: 1 - post / .35 });
      }
      this.weapon.tint = post < .25 ? 0xe6ffea : 0xffffff;
    } else {
      // Success rises in long amber shafts; restoration closes a cool circular seal.
      const wave = size * (.3 + burst * 1.5), ringFade = (1 - clamp(post / 1.25)) * .65;
      b.ellipse(0, 0, wave, wave * .7).stroke({ color, width: 2 - burst, alpha: ringFade });
      b.ellipse(0, floorY, wave * 1.3, wave * .15).stroke({ color, width: 1.3, alpha: ringFade * .8 });
      for (let i = 0; i < 16; i++) {
        const x = (random(i + 56) - .5) * size * 1.8;
        const height = (110 + random(i + 25) * 150) * (restore ? fade : Math.sin(clamp(post / 1.8) * Math.PI));
        const alpha = Math.sin(clamp(post / 1.9) * Math.PI) * .14;
        b.rect(x, 20 - height, 1 + random(i + 99) * 4, height).fill({ color, alpha });
      }
      this.weapon.tint = post < .18 ? 0xfff4d7 : 0xffffff;
    }
    // Actual independently moving hot fragments; shape, trail and gravity change continuously.
    for (let i = 0; i < (destroyed ? 100 : 80); i++) {
      const a = random(i + 303) * TAU, velocity = 35 + random(i + 454) * 155;
      const x = Math.cos(a) * velocity * post, y = Math.sin(a) * velocity * post * .68 + (destroyed ? post * post * 50 : -post * 9);
      const length = Math.max(1, (1 - post / 1.5) * (3 + random(i) * 8));
      f.moveTo(x, y).lineTo(x - Math.cos(a) * length, y - Math.sin(a) * length * .6).stroke({ color, width: .6 + random(i + 3), alpha: fade * (.25 + random(i + 66) * .5) });
    }
    // A localized bloom, never a fullscreen flashing layer.
    const flash = Math.max(0, 1 - post / .18);
    for (let i = 5; i > 0; i--) f.ellipse(0, 0, size * (.6 + i * .12), size * (.18 + i * .07)).fill({ color: 0xfff0ce, alpha: flash * .025 });
  }
  suspend(value) { if (value) { this.app?.ticker.stop(); this.ambientTimeline?.pause(); if (this.running) this.pause(true); } else { this.app?.ticker.start(); if (!this.running && !this.kind) this.ambientTimeline?.resume(); } }
  destroy() { this.destroyed = true; this.loadGeneration++; this.cancel(); this.sound.destroy(); this.ambientTimeline?.kill(); this.resize?.disconnect(); this.app?.ticker?.remove(this.draw); this.app?.destroy(true, { children: true, texture: false, textureSource: false }); this.success?.destroy(); }
}
