import {Assets, Container, Graphics, Rectangle, Sprite, Text, Texture} from 'pixi.js';
import {gsap} from 'gsap';

export const BATTLE_HUD_ASSETS = Object.freeze({
  frame: '/assets/ui/project-v/battle-hud-b-v1/frame.webp',
  fill: '/assets/ui/project-v/battle-hud-b-v1/fill.webp'
});
export const BATTLE_HUD_SIZE = Object.freeze({
  desktop: Object.freeze({width: 240, height: 52, fontSize: 20}),
  compact: Object.freeze({width: 300, height: 70, fontSize: 32})
});
const clamp = (value, low, high) => Math.max(low, Math.min(high, Number(value) || 0));
const textures = {};
let pending;
export function preloadBattleHud() {
  if (typeof window === 'undefined') return Promise.resolve();
  return pending ||= Promise.all(Object.entries(BATTLE_HUD_ASSETS).map(async ([key, url]) => {
    textures[key] = await Assets.load(url);
  })).then(() => {
    const frame = textures.frame;
    // Sample the authored neutral lamp and the lower bar; never recolor the nameplate.
    textures.indicator = new Texture({source: frame.source, frame: new Rectangle(28, 102, 13, 65)});
    textures.barOnly = new Texture({source: frame.source, frame: new Rectangle(0, 77, 1024, 108)});
  }).catch(error => {
    pending = null;
    console.warn('[battle] B HUD image load failed', error);
  });
}

export function fitBattleHudName(value, fontSize, maxWidth, measure = null) {
  const points = Array.from(String(value ?? ''));
  const units = point => /\s/u.test(point) ? .3 : /^[\x20-\x7e]$/u.test(point) ? .58 : 1;
  const width = measure || (text => Array.from(text).reduce((sum, point) => sum + units(point), 0) * fontSize);
  if (width(points.join('')) <= maxWidth) return points.join('');
  while (points.length && width(points.join('') + '…') > maxWidth) points.pop();
  return points.join('') + '…';
}

/** Shared authored B silhouette. Only text, live fills and faction tint are dynamic. */
export class BattleHud extends Container {
  constructor({name, team, hp = 100, shield = 0, maxShield = 0} = {}) {
    super({label: 'BattleHud:B'});
    this.eventMode = 'none';
    this.fullName = String(name ?? '');
    this.team = team;
    this.hp = clamp(hp, 0, 100);
    this.shield = Math.max(0, Number(shield) || 0);
    this.maxShield = Math.max(this.shield, Number(maxShield) || 0);
    this.damage = {ratio: this.hp / 100};
    this.showName = true;
    this.frame = new Sprite(Texture.EMPTY);
    this.frame.label = 'BattleHudBAuthoredFrame';
    this.indicator = new Sprite(Texture.EMPTY);
    this.indicator.tint = team === 'ENEMY' ? 0xff626a : 0x37d7ff;
    this.hpTrail = new Sprite(Texture.WHITE);
    this.hpTrail.tint = 0xf3bd4b;
    this.hpFill = new Sprite(Texture.WHITE);
    this.hpClip = new Graphics();
    this.shieldTrack = new Sprite(Texture.WHITE);
    this.shieldTrack.tint = 0x142b3b;
    this.shieldFill = new Sprite(Texture.WHITE);
    this.shieldFill.tint = 0x4edaff;
    this.nameLabel = new Text({text: '', style: {
      fontFamily: 'Pretendard, SUIT, Arial, sans-serif', fontSize: 20,
      fontWeight: '800', fill: 0xf5f8fc, align: 'center'
    }});
    this.nameLabel.anchor.set(.5);
    this.addChild(this.frame, this.indicator, this.hpTrail, this.hpFill, this.hpClip,
      this.shieldTrack, this.shieldFill, this.nameLabel);
    this.hpTrail.mask = this.hpClip;
    this.hpFill.mask = this.hpClip;
    this.layout();
    this.applyTextures();
    void preloadBattleHud().then(() => this.applyTextures());
  }

  applyTextures() {
    if (this.destroyed) return;
    this.frame.texture = (this.showName ? textures.frame : textures.barOnly) || Texture.EMPTY;
    this.indicator.texture = textures.indicator || Texture.EMPTY;
    for (const sprite of [this.hpFill, this.hpTrail, this.shieldTrack, this.shieldFill])
      sprite.texture = textures.fill || Texture.WHITE;
    this.layout();
  }

  setName(name) {
    const next = String(name ?? '');
    if (next === this.fullName) return;
    this.fullName = next;
    this.layoutName();
  }

  setCompact(compact) {
    const next = Boolean(compact);
    if (this.compact === next) {this.layoutName(); return;}
    this.compact = next;
    this.layout();
  }

  setNameVisible(visible) {
    if (this.showName === Boolean(visible)) return;
    this.showName = Boolean(visible);
    this.applyTextures();
  }

  layoutName() {
    const size = BATTLE_HUD_SIZE[this.compact ? 'compact' : 'desktop'];
    this.nameLabel.style.fontSize = this.fontSizeOverride || size.fontSize;
    const key = JSON.stringify([this.fullName,this.nameLabel.style.fontSize,size.width,this.nameLabel.style.fontFamily,this.showName]);
    if (key === this.nameLayoutKey) return;
    this.nameLayoutKey = key;
    // Use the loaded font's actual glyph widths in the game. The estimate is only
    // for non-browser layout checks, so narrow Latin names are not cut needlessly.
    const measure = typeof document === 'undefined' ? null : text => {
      this.nameLabel.text = text;
      return this.nameLabel.width;
    };
    this.nameLabel.text = fitBattleHudName(this.fullName, this.nameLabel.style.fontSize, size.width * .53, measure);
    this.nameLabel.visible = this.showName;
  }

  layout() {
    const {width, height} = BATTLE_HUD_SIZE[this.compact ? 'compact' : 'desktop'];
    const left = 110 - width / 2;
    this.frame.position.set(left, this.showName ? 0 : height * 77 / 185);
    this.frame.width = width;
    this.frame.height = this.showName ? height : height * 108 / 185;
    this.indicator.position.set(left + width * 28 / 1024, height * 102 / 185);
    this.indicator.width = width * 13 / 1024;
    this.indicator.height = height * 65 / 185;
    this.nameLabel.position.set(110, height * .255);
    this.layoutName();
    const x = left + width * 82 / 1024, y = height * 110 / 185;
    const w = width * 884 / 1024, h = height * 48 / 185, cut = h * .28;
    this.gauge = {x, y, width: w, height: h};
    // A progress mask follows the authored recessed channel, not decorative geometry.
    this.hpClip.clear().poly([x+cut,y,x+w-cut,y,x+w,y+cut,x+w,y+h-cut,
      x+w-cut,y+h,x+cut,y+h,x,y+h-cut,x,y+cut]).fill(0xffffff);
    for (const sprite of [this.hpFill, this.hpTrail]) sprite.position.set(x,y);
    const sh = this.compact ? 6 : 4;
    for (const sprite of [this.shieldTrack, this.shieldFill]) {
      sprite.position.set(x, height - 1);
      sprite.height = sh;
    }
    this.shieldTrack.width = w;
    this.renderHp();
    this.renderShield();
  }

  setHp(value) {
    const next = clamp(value, 0, 100), previous = this.hp;
    if (next === previous) return;
    this.hp = next;
    gsap.killTweensOf(this.damage);
    const reduced = typeof window === 'undefined' || globalThis.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
    if (next < previous && !reduced) {
      this.damage.ratio = Math.max(this.damage.ratio, previous / 100);
      gsap.to(this.damage, {ratio: next / 100, delay: .12, duration: .32, ease: 'power1.out',
        onUpdate: () => {if (!this.destroyed) this.renderHp();}});
    } else this.damage.ratio = next / 100;
    this.renderHp();
  }

  renderHp() {
    if (!this.gauge) return;
    const {width, height} = this.gauge, ratio = this.hp / 100;
    this.hpFill.width = width * ratio; this.hpFill.height = height;
    this.hpFill.visible = ratio > 0;
    this.hpFill.tint = this.hp < 30 ? 0xff5969 : this.hp < 60 ? 0xffc34d : 0x42ed8d;
    this.hpTrail.width = width * this.damage.ratio; this.hpTrail.height = height;
    this.hpTrail.visible = this.damage.ratio > ratio + .001;
  }

  setShield(shield, maximum) {
    this.shield = Math.max(0, Number(shield) || 0);
    this.maxShield = Math.max(this.shield, Number(maximum) || 0);
    this.renderShield();
  }

  renderShield() {
    if (!this.gauge) return;
    const ratio = this.maxShield > 0 ? clamp(this.shield / this.maxShield, 0, 1) : 0;
    this.shieldTrack.visible = this.shieldFill.visible = ratio > 0;
    this.shieldFill.width = this.gauge.width * ratio;
  }

  destroy(options) {
    gsap.killTweensOf(this.damage);
    // Shared cached textures remain owned by Assets across actor/session replacement.
    super.destroy(options);
  }
}

