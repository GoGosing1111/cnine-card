import { Graphics } from 'pixi.js';
import { VehicleSupportFloor, supportSprite as sprite, clamp, easeOut } from './VehicleSupportFloor.js';

const tau = 2 * Math.PI;

export class MercenaryTurbine extends VehicleSupportFloor {
  constructor(engine, actor, texture, index) {
    super(engine, actor, 'Helios-R floor', 1.58 + index * .11);
    this.ring = sprite(texture, this.root);
    this.ring.blendMode = 'add';
    this.flare = sprite(texture, this.root);
    this.flare.blendMode = 'add';
    this.sparks = new Graphics();
    this.root.addChild(this.sparks);
  }

  render(time, reduced) {
    if (!this.show(time)) return;
    const { ring, flare, sparks, size } = this;
    const age = time - this.revealAt;
    const intro = easeOut(age / .32);
    const sinceHit = time - this.lastHit;
    const pulse = sinceHit < 0 ? 0 : clamp(1 - sinceHit / .46);
    const scale = reduced ? 1 : .55 + .45 * intro;
    ring.width = ring.height = size * scale;
    const kick = this.hits ? this.hits - 1 + easeOut(sinceHit / .46) : 0;
    ring.rotation = reduced ? 0 : time * .49 + kick * .52;
    ring.alpha = intro * (.86 + pulse * .14);
    const ignition = reduced ? 0 : Math.max(1 - intro, pulse);
    flare.visible = ignition > .01 || reduced && pulse > 0;
    if (flare.visible) {
      flare.width = flare.height = size * (1 + (1 - ignition) * .39);
      flare.rotation = ring.rotation;
      flare.alpha = reduced ? .30 * pulse : ignition * .88;
    }
    sparks.clear();
    const angle = reduced ? 0 : time * .72;
    const rim = size * .486 * scale;
    for (let i = 0; i < 3; i++) {
      const a = angle + i * tau / 3;
      const x = rim * Math.cos(a), y = rim * Math.sin(a);
      sparks.moveTo(x, y).arc(0, 0, rim, a, a + .52).stroke({width: 4, color: 0xffb33b, alpha: intro * .9});
      sparks.moveTo(x, y).arc(0, 0, rim, a, a + .18).stroke({width: 2, color: 0xfff2c8, alpha: intro});
    }
    if (ignition > .02) {
      const r = size * (.45 + (1 - ignition) * .22);
      for (let i = 0; i < 8; i++) {
        const a = tau * i / 8 + .22;
        sparks.moveTo(r * Math.cos(a), r * Math.sin(a))
          .lineTo((r + 8 + ignition * 12) * Math.cos(a + .045), (r + 8 + ignition * 12) * Math.sin(a + .045));
      }
      sparks.stroke({width: 3.5, color: 0xffdf9b, alpha: ignition});
    }
  }
}
