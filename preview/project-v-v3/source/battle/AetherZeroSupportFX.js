import { Graphics, Rectangle, Texture } from 'pixi.js';
import { VehicleSupportFloor, supportSprite, clamp, easeOut } from './VehicleSupportFloor.js';

export class WingSeal extends VehicleSupportFloor {
  constructor(engine, actor, wings, refraction, index) {
    super(engine, actor, 'Aether Zero wing seal', 1.56 + index * .12);
    this.rim = new Graphics();
    this.root.addChild(this.rim);
    const half = wings.width / 2;
    this.textures = [0, half].map(x => new Texture({source: wings.source, frame: new Rectangle(x, 0, half, wings.height)}));
    this.panels = this.textures.map((texture, side) => {
      const panel = supportSprite(texture, this.root);
      panel.anchor.set(side === 0 ? 1 : 0, .52);
      return panel;
    });
    this.refraction = supportSprite(refraction, this.root);
    this.refraction.anchor.set(.5, .82);
    this.refraction.blendMode = 'add';
  }

  render(time, reduced) {
    if (!this.show(time)) return;
    const age = time - this.revealAt;
    const intro = easeOut(age / .32);
    const sinceHit = time - this.lastHit;
    const pulse = sinceHit < 0 ? 0 : clamp(1 - sinceHit / .50);
    const fold = reduced ? 0 : pulse * easeOut(sinceHit / .075);
    const span = this.size * (reduced ? 1 : .72 + .28 * intro);
    const spread = reduced ? 0 : (1 - intro) * .14;
    for (const [i, panel] of this.panels.entries()) {
      const side = i === 0 ? -1 : 1;
      panel.width = span * (.5 - .055 * fold);
      panel.height = span * (.72 + .16 * fold);
      panel.x = side * span * (spread - fold * .047);
      panel.rotation = side * fold * -.24;
      panel.alpha = intro;
    }

    const rim = this.rim.clear();
    for (const side of [-1, 1]) {
      // Two thin chevrons trace the wing shape around the actor's footprint.
      rim.moveTo(side * span * .31, -span * .34)
        .lineTo(side * span * .51, -span * .23)
        .lineTo(side * span * .40, span * .15)
        .stroke({width: span * .011, color: 0xcaff60, alpha: intro * (.68 + .32 * pulse)});
    }
    const flare = this.refraction;
    flare.visible = pulse > .015;
    if (!flare.visible) return;
    flare.width = span * (reduced ? .95 : .82 + .37 * (1 - pulse));
    // Counter the floor projection so the refracting facets rise to the ankles.
    flare.height = span * (reduced ? .24 : .27 + .13 * fold) / this.root.scale.y;
    flare.y = span * .08;
    flare.alpha = pulse * (reduced ? .72 : .98);
  }

  destroy() {
    super.destroy();
    for (const part of this.textures) part.destroy(false);
  }
}
