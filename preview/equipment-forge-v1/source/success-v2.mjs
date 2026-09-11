// The sixteen authored plasma shapes share the same GSAP clock as the weapon and sound.
export const SUCCESS_ATLAS = Object.freeze({ file: 'assets/success-plasma-atlas-v2.png', columns: 4, rows: 4, frames: 16, width: 1254, height: 1254 });
const clamp = value => Math.max(0, Math.min(1, value));
const out = value => 1 - (1 - clamp(value)) ** 3;
const TAU = Math.PI * 2;
const random = n => { const value = Math.sin(n * 91.73 + 13.21) * 48631.321; return value - Math.floor(value); };

export function successFrameAt(time, impact = 2.25) {
  if (time < impact) return Math.min(3.999, Math.max(0, time / impact * 4));
  const post = time - impact;
  if (post < .16) return 4 + post / .16 * 2;
  if (post < .55) return 6 + (post - .16) / .39 * 2;
  if (post < 1.4) return 8 + (post - .55) / .85 * 5;
  return Math.min(15, 13 + (post - 1.4) / .6 * 2);
}

export class SuccessCinematic {
  constructor() {
    const { Container, Sprite } = globalThis.CNineUiFxVendor.pixi;
    this.layer = new Container();
    this.sprites = [new Sprite(), new Sprite()];
    for (const sprite of this.sprites) { sprite.anchor.set(.5); sprite.blendMode = 'add'; this.layer.addChild(sprite); }
    this.flash = new Sprite(); this.flash.anchor.set(.5); this.flash.blendMode = 'add';
    this.hide();
  }
  async init() {
    const { Assets, Rectangle } = globalThis.CNineUiFxVendor.pixi;
    const sheet = await Assets.load(new URL('../' + SUCCESS_ATLAS.file, import.meta.url).href);
    // Preserve the source PNG. Fractional UV cell boundaries are intentional: 1254 / 4 = 313.5.
    const width = sheet.width / 4, height = sheet.height / 4;
    this.textures = Array.from({ length: 16 }, (_, index) => new sheet.constructor({ source: sheet.source, frame: new Rectangle((index % 4) * width, Math.floor(index / 4) * height, width, height) }));
    this.ready = true;
  }
  hide() { this.layer.visible = false; this.flash.visible = false; this.frame = null; }
  render(owner, time, impact) {
    const { back: b, front: f, weapon, w, h, weaponWidth, weaponHeight } = owner;
    const post = time - impact, charge = clamp(time / impact), size = Math.min(w * .98, 730);
    const radius = Math.min(w * .38, 250), height = Math.min(h * .43, 270);
    const settle = out((post - .16) / .8);
    const scale = post < 0 ? 1 - charge * .045 : 1.075 + Math.sin(clamp(post / .85) * Math.PI) * .045;
    weapon.width = weaponWidth * scale; weapon.height = weaponHeight * scale;
    weapon.rotation = post < 0 ? -.095 - charge * .025 : -.12 + settle * .025;
    weapon.y = post < 0 ? -charge * 8 : -8 - Math.sin(clamp(post / 1.1) * Math.PI) * 6;
    const shake = post >= 0 ? Math.exp(-post * 11) * 7 : Math.max(0, charge - .68) * 4;
    owner.root.position.set(owner.center.x + Math.sin(time * 107) * shake, owner.center.y + Math.cos(time * 93) * shake * .6);
    this.frame = successFrameAt(time, impact);
    if (this.ready) {
      const frame = Math.floor(this.frame), mix = this.frame - frame;
      const alpha = post < 0 ? .22 + charge * .7 : 1 - clamp((post - 1.35) / .8);
      const diameter = post < 0 ? size * (.75 - charge * .2) : size * (.9 + out(post / .5) * .13);
      this.layer.visible = alpha > 0;
      this.sprites.forEach((sprite, index) => {
        sprite.texture = this.textures[Math.min(15, frame + index)];
        sprite.width = diameter; sprite.height = diameter;
        sprite.alpha = alpha * (index ? mix : 1 - mix);
      });
      this.flash.visible = post >= 0 && post < .2;
      if (this.flash.visible) {
        this.flash.texture = this.textures[Math.min(5, frame)]; this.flash.width = size * .91; this.flash.height = size * .91;
        this.flash.alpha = (1 - post / .2) * .85;
      }
    }
    if (post < 0) {
      const pressure = clamp((time - 1.4) / (impact - 1.4));
      // Counter-rotating broken arcs, gathering rays, and a narrowing vertical reactor beam.
      for (let lane = 0; lane < 3; lane++) {
        const r = radius * (1.04 - pressure * .6) + lane * 11;
        for (let segment = 0; segment < 3; segment++) {
          const start = segment * TAU / 3 + time * (lane % 2 ? -1.4 : 1.3) + lane;
          b.arc(0, 0, r, start, start + .48 + charge * .3).stroke({ color: lane === 1 ? 0xc5b3ff : 0x74b5ff, width: lane === 1 ? 1 : 2, alpha: charge * .4 });
        }
      }
      for (let i = 0; i < 94; i++) {
        const p = (random(i + 31) + time * (.48 + pressure * .8)) % 1;
        const a = random(i + 177) * TAU + p * .18;
        const r = (1 - p) * radius * 1.55;
        const x = Math.cos(a) * r, y = Math.sin(a) * r * .76;
        const length = 4 + pressure * 24;
        f.moveTo(x, y).lineTo(x + Math.cos(a) * length, y + Math.sin(a) * length * .76).stroke({ color: i % 7 === 0 ? 0xdbff95 : 0x99cdff, width: i % 6 ? 1 : 2, alpha: Math.sin(p * Math.PI) * charge * .8 });
      }
      if (pressure > 0) {
        for (let layer = 8; layer > 0; layer--) b.rect(-layer * (2.5 - pressure), -height, layer * (5 - pressure * 2), height * 2).fill({ color: 0x68a5ff, alpha: pressure * .014 });
        f.moveTo(0, -height * pressure).lineTo(0, height * pressure).stroke({ color: 0xd7ebff, width: .7 + pressure, alpha: pressure * .6 });
        weapon.tint = 0xe2eeff;
      }
      return;
    }
    const burst = out(post / .44), energy = 1 - clamp(post / 1.6);
    // One concentrated hit, followed by perspective ground shockwaves and physical light shards.
    for (let layer = 6; layer > 0; layer--) {
      const pulse = Math.max(0, 1 - post / .22);
      f.ellipse(0, 0, radius * (.38 + layer * .11), radius * (.14 + layer * .07)).fill({ color: 0xe8ffff, alpha: pulse * .055 });
    }
    for (let ring = 0; ring < 3; ring++) {
      const p = Math.max(0, post - ring * .1), wave = out(p / .62);
      const fade = (1 - clamp(p / .85)) * .38;
      const r = radius * (.3 + wave * 1.8);
      b.ellipse(0, h * .205, r, r * .19).stroke({ color: ring === 1 ? 0xcbff7a : 0xa1d6ff, width: 2 - wave, alpha: fade });
    }
    for (let i = 0; i < 126; i++) {
      const a = random(i + 301) * TAU, speed = 80 + random(i + 411) * 360;
      const p = Math.max(0, post - random(i + 90) * .06);
      const r = speed * (p + .04), x = Math.cos(a) * r, y = Math.sin(a) * r * .73 + p * p * 28;
      const length = Math.min(r * .33, (8 + random(i + 12) * 30) * (1 - clamp(p / 1.5)));
      const color = i % 8 === 0 ? 0xd5ff87 : i % 3 ? 0xa0d9ff : 0xbeb2ff;
      f.moveTo(x, y).lineTo(x - Math.cos(a) * length, y - Math.sin(a) * length * .73).stroke({ color, width: i % 9 ? 1 : 2.6, alpha: energy * (.3 + random(i + 66) * .7) });
      if (i % 11 === 0) f.poly([x, y - 3, x + 2.5, y, x, y + 5, x - 2, y]).fill({ color, alpha: energy });
    }
    // Long-lived awakening energy frames the original weapon without replacing its texture.
    const aura = Math.sin(clamp(post / 2.6) * Math.PI) * .8 + clamp(post / 2.2) * .18;
    for (let layer = 8; layer > 0; layer--) b.ellipse(0, 0, weaponWidth * (.32 + layer * .018), weaponHeight * .42 + layer * 4).fill({ color: 0x6b98ff, alpha: aura * .009 });
    for (let side = 0; side < 2; side++) {
      const xStart = -weaponWidth * .38, yStart = (side ? 1 : -1) * (weaponHeight * .4 + 8);
      for (let point = 0; point < 28; point++) {
        const x = xStart + point / 27 * weaponWidth * .76;
        const next = xStart + (point + 1) / 27 * weaponWidth * .76;
        const dy = Math.sin(point * 1.8 + time * 14) * 3 + Math.sin(point * 4.8 - time * 10) * 2;
        const dy2 = Math.sin((point + 1) * 1.8 + time * 14) * 3 + Math.sin((point + 1) * 4.8 - time * 10) * 2;
        b.moveTo(x, yStart + dy - x * .095).lineTo(next, yStart + dy2 - next * .095).stroke({ color: side ? 0xc7ff86 : 0xa5c9ff, width: 1.2, alpha: aura * .5 * Math.sin(point / 28 * Math.PI) });
      }
    }
    weapon.tint = post < .12 ? 0xeaffff : 0xffffff;
  }
  destroy() { this.textures?.forEach(texture => texture.destroy(false)); this.textures = null; }
}
