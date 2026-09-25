import { TIMING, clamp, atlasFrame, phaseAt } from './model.mjs?v=20260922';
import { withMercenaryDeadline } from '../../shared/mercenary-loading-v1.mjs?v=20260925';
import { FusionTextures } from './textures.mjs?v=20260925';

const TAU = Math.PI * 2, GOLD = 0xe8bb72, IVORY = 0xffefc7;
const rand = n => { const x = Math.sin(n * 72.971 + 4.127) * 43758.5453; return x - Math.floor(x); };
const out = n => 1 - (1 - clamp(n)) ** 3;
const smooth = n => { n = clamp(n); return n * n * (3 - 2 * n); };
const ROOT = '/mercenary-codex/fusion/assets/';
const AUDIO = '/assets/sfx/v3-advancement-awakening-v1/';
export const SOUND_CUES = Object.freeze([
  { at: .3, file: 'afterimage-advancement-v1.mp3', peak: .178, gain: .12 },
  { at: 2.9, file: 'immortal-advancement-v1.mp3', peak: .333, gain: .14 },
  { at: TIMING.impact, file: 'shatter-advancement-v1.mp3', peak: .250, gain: .42 },
  { at: TIMING.reveal, file: 'riposte-advancement-v1.mp3', peak: .300, gain: .34 },
]);

class RecordedSound {
  constructor() { this.enabled = false; this.buffers = new Map(); this.sources = []; this.generation = 0; this.promoted = true; this.controller = new AbortController(); }
  async enable(enabled) {
    this.enabled = enabled;
    if (!enabled) { this.stop(); return false; }
    try {
      this.context ||= new (window.AudioContext || window.webkitAudioContext)();
      await withMercenaryDeadline(async () => {
      await this.context.resume();
      await Promise.all([...new Set(SOUND_CUES.map(c => c.file))].map(async file => {
        if (this.buffers.has(file)) return;
        const response = await fetch(AUDIO + file, {signal:this.controller.signal});
        if (!response.ok) throw Error('sound');
        this.buffers.set(file, await this.context.decodeAudioData(await response.arrayBuffer()));
      }));
      }, {timeoutMs:8000,signal:this.controller.signal});
      return this.context.state === 'running';
    } catch { this.enabled = false; this.controller.abort(); if (!this.destroyed) this.controller = new AbortController(); return false; }
  }
  stop() {
    this.generation++;
    this.sources.forEach(({ source, gain }) => { try { source.stop(); } catch {} source.disconnect(); gain.disconnect(); });
    this.sources = []; this.reference = null;
  }
  schedule(clock) {
    this.stop();
    if (!this.enabled || !this.context || clock.paused) return;
    const now = this.context.currentTime;
    const cues = this.promoted ? SOUND_CUES : [...SOUND_CUES.slice(0,2),
      {at:TIMING.impact,file:'afterimage-advancement-v1.mp3',peak:.178,gain:.22},
      {at:TIMING.reveal,file:'immortal-advancement-v1.mp3',peak:.333,gain:.16}];
    for (const cue of cues) {
      const buffer = this.buffers.get(cue.file), start = cue.at - cue.peak, offset = Math.max(0, clock.time - start);
      if (!buffer || offset >= buffer.duration) continue;
      if (cue.at < TIMING.impact && clock.time >= TIMING.silence) continue;
      const source = this.context.createBufferSource(), gain = this.context.createGain();
      source.buffer = buffer; gain.gain.value = cue.gain; source.playbackRate.value = clock.speed;
      source.connect(gain).connect(this.context.destination);
      const delay = Math.max(0, (start - clock.time) / clock.speed);
      let stopAt = null;
      if (cue.at < TIMING.impact) {
        const silenceAt = now + (TIMING.silence - clock.time) / clock.speed;
        gain.gain.setValueAtTime(cue.gain, Math.max(now, silenceAt - .16 / clock.speed));
        gain.gain.linearRampToValueAtTime(0, Math.max(now, silenceAt));
        stopAt = silenceAt + .01;
      }
      source.start(now + delay, offset); if (stopAt !== null) source.stop(stopAt); this.sources.push({ source, gain });
    }
    this.reference = { audio: now, time: clock.time, speed: clock.speed };
  }
  reconcile(clock) {
    if (!this.reference || clock.paused || !this.enabled) return;
    const projected = this.reference.time + (this.context.currentTime - this.reference.audio) * this.reference.speed;
    if (Math.abs(projected - clock.time) > .02) this.schedule(clock);
  }
  destroy() { this.destroyed = true; this.enabled = false; this.controller.abort(); this.stop(); this.context?.close().catch(() => {}); }
}

export class FusionFX {
  constructor(host, callbacks = {}) {
    this.host = host; this.callbacks = callbacks; this.clock = { time: 0 }; this.ambient = { time: 0 };
    this.sound = new RecordedSound(); this.speed = 1; this.paused = false; this.active = false;
    this.reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
    this.materials = []; this.generation = 0; this.rank = 'SSS'; this.controller = new AbortController();
  }
  async init() {
    const { pixi, gsap } = globalThis.CNineUiFxVendor;
    this.pixi = pixi; this.gsap = gsap;
    const { Application, Container, Graphics, Sprite, Rectangle } = pixi;
    this.textures = new FusionTextures(pixi);
    this.app = new Application();
    await withMercenaryDeadline(this.app.init({ resizeTo: this.host, antialias: true, backgroundAlpha: 1, background: 0x080807,
      resolution: Math.min(devicePixelRatio || 1, 1.75), autoDensity: true, preference: 'webgl', powerPreference: 'low-power' })
      .then(() => { if (this.destroyed) this.disposeApp(); }), {signal:this.controller.signal});
    if (this.destroyed) return this;
    this.initialized = true;
    this.host.append(this.app.canvas); this.app.canvas.setAttribute('aria-hidden', 'true');
    this.app.ticker.maxFPS = this.host.clientWidth < 600 ? 45 : 60;
    this.room = new Sprite(); this.room.anchor.set(.5);
    this.shade = new Graphics(); this.dark = new Graphics(); this.world = new Container();
    this.floor = new Graphics(); this.aura = new Graphics(); this.orbit = new Graphics();
    this.cardsLayer = new Container(); this.dust = new Graphics(); this.energy = new Graphics();
    this.seal = new Sprite(); this.seal.anchor.set(.5);
    this.result = new Container(); this.art = new Sprite(); this.art.anchor.set(.5);
    this.frame = new Sprite(); this.frame.anchor.set(.5); this.result.addChild(this.art, this.frame);
    this.atlas = new Container(); this.bloom = [new Sprite(), new Sprite()];
    for (const sprite of this.bloom) { sprite.anchor.set(.5); sprite.blendMode = 'add'; this.atlas.addChild(sprite); }
    this.flash = new Graphics();
    this.world.addChild(this.floor, this.aura, this.orbit, this.cardsLayer, this.seal, this.result, this.atlas, this.energy, this.dust);
    this.app.stage.addChild(this.room, this.shade, this.dark, this.world, this.flash);
    const [room, back, atlas, frame] = await Promise.all([
      this.textures.load(ROOT + 'sanctum-v1.png'), this.textures.load(ROOT + 'sealed-contract-v1.png'),
      this.textures.load(ROOT + 'seal-bloom-atlas-v1.png'), this.textures.load('/assets/ui/card-frames/mercenary-contract-frame-premium-v2.png'),
    ]);
    if (this.destroyed) return this;
    this.room.texture = room; this.roomTexture = room; this.seal.texture = back; this.backTexture = back; this.frame.texture = frame;
    // Preserve the generated 1254px original. Each cell uses exact fractional UV boundaries.
    this.frames = Array.from({ length: 16 }, (_, i) => new atlas.constructor({ source: atlas.source,
      frame: new Rectangle(i % 4 * atlas.width / 4, Math.floor(i / 4) * atlas.height / 4, atlas.width / 4, atlas.height / 4) }));
    this.draw = () => this.render(); this.app.ticker.add(this.draw);
    this.ambientTimeline = gsap.to(this.ambient, { time: 120, duration: 120, repeat: -1, ease: 'none' });
    this.resizeObserver = new ResizeObserver(() => this.layout()); this.resizeObserver.observe(this.host);
    this.ready = true; this.layout(); return this;
  }
  layout() {
    if (!this.ready || this.destroyed) return;
    this.w = this.host.clientWidth; this.h = this.host.clientHeight;
    const scale = Math.max(this.w / this.roomTexture.width, this.h / this.roomTexture.height);
    this.room.scale.set(scale); this.room.position.set(this.w / 2, this.h / 2);
    this.world.position.set(this.w / 2, this.h * .47);
    this.unit = Math.min(this.w / (this.w < 600 ? 640 : 1000), this.h / 670); this.world.scale.set(this.unit);
    this.shade.clear().rect(0,0,this.w,this.h).fill({color:0x070709,alpha:.10});
    this.dark.clear().rect(0, 0, this.w, this.h).fill(0x020306);
    this.flash.clear().rect(0, 0, this.w, this.h).fill(0xffeed3);
    this.seal.width = 182; this.seal.height = 273;
    this.art.width = 232; this.art.height = 348; this.frame.width = 257; this.frame.height = 386;
    this.render();
  }
  async setCards(cards, result, {promoted = true} = {}) {
    const generation = ++this.generation;
    const { Container, Sprite } = this.pixi;
    const art = (card,size) => this.textures.load('/assets/ui/project-v/mercenaries/codex-v1/'+card.code.toLowerCase()+'-art-'+size+'.webp')
      .catch(error => { if (this.destroyed) throw error; return this.textures.load('/'+card.sourceArt); });
    let textures,resultTexture;
    try {
      [textures,resultTexture] = await withMercenaryDeadline(Promise.all([
        Promise.all(cards.map(c => art(c,320))), result ? art(result,640) : null,
      ]), {signal:this.controller.signal});
    } catch (error) { if (generation === this.generation) this.generation++; throw error; }
    if (generation !== this.generation || this.destroyed) return;
    this.cardsLayer.removeChildren().forEach(c => c.destroy({ children: true }));
    this.materials = cards.map((card, i) => {
      const group = new Container(), image = new Sprite(textures[i]), border = new Sprite(this.frame.texture);
      image.anchor.set(.5); border.anchor.set(.5); image.width = 78; image.height = 117;
      border.width = 90; border.height = 135; group.addChild(image, border); this.cardsLayer.addChild(group);
      return group;
    });
    if (resultTexture) this.art.texture = resultTexture;
    this.resultCard = result; this.rank = result?.rank || 'SSS'; this.promoted = promoted; this.sound.promoted = promoted; this.render();
  }
  getClock() { return { time: this.clock.time, speed: this.speed, paused: this.paused || !this.active }; }
  play() {
    if (!this.ready || this.destroyed || !this.resultCard || this.materials.length !== 8) return false;
    this.timeline?.kill(); this.sound.stop(); this.clock.time = 0; this.active = true; this.paused = false;
    if (this.reduced) {
      this.clock.time = TIMING.end; this.active = false; this.render(); this.callbacks.complete?.(); return true;
    }
    this.timeline = this.gsap.to(this.clock, { time: TIMING.end, duration: TIMING.end, ease: 'none',
      onUpdate: () => this.callbacks.progress?.(this.clock.time),
      onComplete: () => { this.active = false; this.sound.stop(); this.callbacks.complete?.(); } });
    this.timeline.timeScale(this.speed); this.sound.schedule(this.getClock()); return true;
  }
  pause(value = !this.paused) {
    if (!this.timeline) return;
    this.paused = value; this.timeline.paused(value);
    value ? this.sound.stop() : this.sound.schedule(this.getClock());
    this.callbacks.progress?.(this.clock.time);
  }
  seek(time) {
    if (!this.timeline) return;
    this.active = time < TIMING.end; this.paused = true; this.timeline.pause();
    this.timeline.time(clamp(time / TIMING.end) * TIMING.end, true);
    this.sound.stop(); this.render(); this.callbacks.progress?.(this.clock.time);
  }
  reset() {
    this.timeline?.kill(); this.timeline = null; this.sound.stop(); this.clock.time = 0;
    this.active = false; this.paused = false; this.render();
  }
  setVisible(visible) {
    if (!this.ready) return;
    if (!visible) { if (this.active) this.pause(true); this.ambientTimeline.pause(); this.app.ticker.stop(); }
    else { this.ambientTimeline.resume(); this.app.ticker.start(); }
  }
  render() {
    if (!this.ready || this.destroyed) return;
    const t = this.clock.time, playing = Boolean(this.timeline) || t > 0, ambient = this.reduced ? 0 : this.ambient.time;
    const impact = t - TIMING.impact, reveal = smooth((t - TIMING.reveal) / .8);
    const charging = playing ? clamp((t - 1.5) / 2.8) : .12;
    const conceal = playing && t >= TIMING.silence && t < TIMING.impact;
    const sss = this.promoted && this.rank === 'SSS', ss = this.promoted && this.rank === 'SS';
    this.host.dataset.phase = !playing ? 'idle' : t < TIMING.impact ? 'charge' : t < TIMING.reveal ? 'burst' : 'reveal';
    this.host.dataset.time = t.toFixed(3); this.host.dataset.frame = String(Math.floor(atlasFrame(t)));
    this.dark.alpha = conceal ? .91 : playing && t < TIMING.impact ? charging * .45 : impact >= 0 ? .36 * (1 - reveal) : .06;
    this.room.alpha = .9;
    const shake = this.reduced || !this.promoted ? 0 : impact >= 0 && impact < .5 ? Math.exp(-impact * 10) * (sss ? 9 : 5) : 0;
    this.world.position.set(this.w / 2 + Math.sin(t * 137) * shake * this.unit, this.h * .47 + Math.cos(t * 113) * shake * this.unit * .5);
    this.floor.clear(); this.aura.clear(); this.orbit.clear(); this.energy.clear(); this.dust.clear();
    const floor = this.floor, aura = this.aura, ring = this.orbit, fx = this.energy, dust = this.dust;

    // Elliptical inlaid floor with independently moving, engraved arc segments.
    for (let n = 0; n < 3; n++) {
      const radius = 268 + n * 30;
      floor.ellipse(0, 220, radius, radius * .235).stroke({ color: GOLD, width: n === 1 ? 1.6 : .7, alpha: conceal ? .035 : .13 + charging * .13 });
      for (let j = 0; j < 32; j++) {
        const angle = j / 32 * TAU + ambient * .02 * (n % 2 ? -1 : 1), r = radius;
        floor.moveTo(Math.cos(angle) * r, 220 + Math.sin(angle) * r * .235)
          .lineTo(Math.cos(angle) * (r + (j % 4 ? 4 : 10)), 220 + Math.sin(angle) * (r + (j % 4 ? 4 : 10)) * .235)
          .stroke({ color: IVORY, width: .7, alpha: .2 });
      }
    }

    // Soft depth light is drawn behind objects; the generated bloom stays additive inside this renderer.
    const auraAlpha = conceal ? .015 : playing ? impact < 0 ? .024 + charging * .04 : .065 + reveal * .025 : .025;
    for (let n = 18; n > 0; n--) aura.ellipse(0, -12, 30 + n * 15, 38 + n * 18).fill({ color: GOLD, alpha: auraAlpha * (1 - n / 23) });
    if (!conceal) for (let n = 0; n < 3; n++) {
      const radius = playing && impact < 0 ? 164 - charging * 47 + n * 23 : 162 + n * 23;
      const angle = ambient * .11 * (n % 2 ? -1 : 1) + (playing ? t * charging * .4 : 0);
      for (let j = 0; j < 8; j++) {
        const a = angle + j * TAU / 8;
        ring.arc(0, 0, radius, a + .025, a + TAU / 8 - .11).stroke({ color: n === 1 ? IVORY : GOLD, width: n === 1 ? 1 : 1.6, alpha: .18 + charging * .2 });
        const x = Math.cos(a) * radius, y = Math.sin(a) * radius;
        ring.circle(x, y, 2).fill({ color: GOLD, alpha: .7 });
        ring.moveTo(x * .97, y * .97).lineTo(x * 1.04, y * 1.04).stroke({ color: IVORY, width: .8, alpha: .65 });
      }
    }

    // Eight actual source-art cards rise and spiral on individual staggered trajectories.
    this.materials.forEach((sprite, i) => {
      const startAngle = -Math.PI / 2 + i * TAU / 8;
      const gather = playing ? smooth((t - .09 * i) / 1.25) : 0;
      const absorb = playing ? smooth((t - 1.65 - i * .08) / 1.42) : 0;
      const r = ((this.w < 600 ? 225 : 286) - gather * 16) * (1 - absorb);
      const angle = startAngle + absorb * TAU * .65;
      const x = Math.cos(angle) * r, y = Math.sin(angle) * r * .68;
      sprite.position.set(x, y - gather * 13 + (playing ? 0 : Math.sin(ambient * .55 + i) * 3));
      sprite.scale.set((playing ? 1 + gather * .12 : .93) * (1 - absorb * .85));
      sprite.rotation = playing ? absorb * (i % 2 ? 1 : -1) * .45 : Math.cos(startAngle) * .06;
      sprite.alpha = playing ? 1 - smooth((absorb - .72) / .28) : .78;
      sprite.visible = !conceal && (!playing || t < 3.7);
      if (playing && absorb > 0 && absorb < 1) {
        const tail = startAngle + (absorb - .12) * TAU * .65, tr = r + 70;
        for (let line = 0; line < 3; line++) fx.moveTo(Math.cos(tail) * tr, Math.sin(tail) * tr * .68)
          .bezierCurveTo(x + Math.cos(angle - 1) * 48, y + Math.sin(angle - 1) * 48, x, y, x * .38, y * .38)
          .stroke({ color: line ? GOLD : IVORY, width: line ? 4 + line * 4 : 1.5, alpha: line ? .055 : .8 });
      }
    });
    this.seal.visible = !playing || t < TIMING.reveal + .22;
    this.seal.alpha = playing && t >= TIMING.impact ? 1 - clamp(impact / .97) : conceal ? .13 : 1;
    const sealScale = playing ? 1 + charging * .035 + (impact >= 0 ? out(impact / .6) * .12 : 0) : 1;
    this.seal.width = 182 * sealScale; this.seal.height = 273 * sealScale;
    this.seal.y = !playing ? Math.sin(ambient * .6) * 4 : -charging * 6;
    this.seal.rotation = playing && t > 3.7 && !conceal && impact < 0 ? Math.sin(t * 87) * charging * .006 : 0;

    // Branching fissures grow through the central seal before an intentional dark hold.
    if (playing && t > 3.6 && impact < 0 && !conceal) {
      const crack = clamp((t - 3.6) / 1.05);
      for (let branch = 0; branch < 7; branch++) {
        const a = branch * TAU / 7 + .3;
        for (let glow = 3; glow >= 0; glow--) {
          fx.moveTo(0, -6);
          for (let j = 1; j <= 7; j++) {
            const r = j * 15 * crack, side = (rand(j + branch * 31) - .5) * 17;
            fx.lineTo(Math.cos(a) * r + Math.sin(a) * side, Math.sin(a) * r * 1.13 - 6);
          }
          fx.stroke({ color: glow ? GOLD : 0xffffff, width: glow ? glow * 5 : 1.3, alpha: glow ? .04 : .85 });
        }
      }
    }

    // Sixteen different authored shapes are interpolated from the single GSAP time.
    this.atlas.visible = playing && t > 1.6 && t < 8 && !conceal;
    if (this.atlas.visible) {
      const index = !this.promoted && impact >= 0 ? Math.min(15,11+impact*2) : atlasFrame(t), base = Math.floor(index), mix = index - base;
      const size = impact < 0 ? 340 - charging * 30 : (sss ? 800 : ss ? 690 : this.promoted ? 580 : 400) * (.62 + out(impact / .5) * .38);
      const alpha = impact < 0 ? charging * .42 : (this.promoted ? 1 : .45) * (1 - clamp((impact - 1.7) / 1.2));
      this.bloom.forEach((sprite, i) => { sprite.texture = this.frames[Math.min(15, base + i)]; sprite.width = size; sprite.height = size; sprite.alpha = alpha * (i ? mix : 1 - mix); });
    }

    this.result.visible = reveal > 0;
    this.result.alpha = reveal;
    this.result.scale.set((.76 + out(reveal) * .24) * (sss ? 1.04 : 1));
    this.result.y = 18 * (1 - reveal) - 4;
    this.result.scale.x *= .15 + .85 * smooth(reveal);
    if (impact >= 0) {
      const energy = 1 - clamp(impact / 2.7);
      // Rank identity changes geometry: S pillar, SS seal wings, SSS three coronation rings and crown rays.
      const rings = sss ? 3 : ss ? 2 : this.promoted ? 1 : 0;
      for (let n = 0; n < rings; n++) {
        const p = clamp((impact - n * .13) / 1.1), radius = 70 + out(p) * (285 + n * 52);
        if (p > 0 && p < 1) {
          fx.ellipse(0, n * 12, radius, radius * (n === 1 ? .4 : .85))
            .stroke({ color: IVORY, width: (1 - p) * 3 + .5, alpha: (1 - p) * .75 });
          fx.ellipse(0, 220, radius, radius * .22).stroke({ color: GOLD, width: 2, alpha: (1 - p) * .7 });
        }
      }
      if (reveal > 0 && this.promoted) for (let n = 0; n < (sss ? 48 : ss ? 24 : 12); n++) {
        const a = n / (sss ? 48 : ss ? 24 : 12) * TAU + .02 * ambient;
        const length = (sss ? 155 : 95) + rand(n + 27) * 75;
        aura.moveTo(Math.cos(a) * 170, Math.sin(a) * 170)
          .lineTo(Math.cos(a) * (170 + length), Math.sin(a) * (170 + length))
          .stroke({ color: n % 3 ? GOLD : IVORY, width: n % 3 ? .7 : 2, alpha: reveal * .16 });
      }
      for (let i = 0; i < (sss ? 96 : this.promoted ? 60 : 20); i++) {
        const a = rand(i + 193) * TAU, velocity = 120 + rand(i + 97) * 350, p = Math.max(0, impact - rand(i + 79) * .2);
        const r = 22 + velocity * out(p / 1.6), x = Math.cos(a) * r, y = Math.sin(a) * r * .76 + p * p * 23;
        const size = (1.5 + rand(i) * 4) * energy;
        if (size <= 0) continue;
        dust.moveTo(x, y - size).lineTo(x + size * .65, y + size * 1.5).lineTo(x - size * .4, y + size).closePath()
          .fill({ color: i % 4 ? GOLD : IVORY, alpha: energy * .85 });
      }
      if (sss && reveal > 0) {
        for (let n = 0; n < 7; n++) {
          const x = (n - 3) * 32, y = -233 + Math.abs(n - 3) * 10;
          aura.moveTo(x, y + 18).lineTo(x, y - 12 - (3 - Math.abs(n - 3)) * 5)
            .stroke({ color: IVORY, width: 1.2, alpha: reveal * .55 });
          aura.circle(x, y, n === 3 ? 3 : 1.5).fill({ color: IVORY, alpha: reveal * .9 });
        }
      }
    }
    if (!conceal) for (let i = 0; i < (this.w < 600 ? 55 : 100); i++) {
      const p = (rand(i + 18) + ambient * (.017 + rand(i) * .022)) % 1;
      const x = (rand(i + 951) - .5) * 1050 + Math.sin(ambient * .3 + i) * 12;
      const y = 360 - p * 820;
      dust.circle(x, y, .5 + rand(i + 235) * 1.1).fill({ color: i % 4 ? GOLD : IVORY, alpha: Math.sin(p * Math.PI) * .3 });
    }
    // One short local impact flash; reduced-motion mode suppresses flash and shake.
    this.flash.alpha = !this.reduced && this.promoted && impact >= 0 && impact < .19 ? Math.sin(impact / .19 * Math.PI) * .26 : 0;
    if (playing) this.sound.reconcile(this.getClock());
  }
  destroy() {
    if (this.destroyed) return;
    this.destroyed = true; this.generation++; this.timeline?.kill(); this.ambientTimeline?.kill();
    this.controller.abort(); this.resizeObserver?.disconnect(); this.sound.destroy();
    if (this.initialized) this.disposeApp();
    this.frames?.forEach(frame => frame.destroy(false));
    this.textures?.destroy();
  }
  disposeApp() {
    if (this.app?.renderer) this.app.destroy(true, { children: true, texture: false, textureSource: false });
  }
}
