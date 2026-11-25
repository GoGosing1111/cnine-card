import {VehicleSupportFloor, supportSprite, clamp, easeOut} from './VehicleSupportFloor.js';

export class GarageSupportFloor extends VehicleSupportFloor {
  constructor(engine, actor, texture, index, vehicle) {
    super(engine, actor, vehicle + ' floor', 1.57 + index * .11);
    this.vehicle = vehicle;
    this.emblem = supportSprite(texture, this.root);
    this.echo = supportSprite(texture, this.root);
    this.echo.blendMode = 'add';
  }

  render(time, reduced) {
    if (!this.show(time)) return;
    const {emblem, echo, size} = this;
    const age = time - this.revealAt;
    const reveal = easeOut(age / .35);
    const since = time - this.lastHit;
    const pulse = since < 0 ? 0 : clamp(1 - since / .44);
    const turbine = this.vehicle === 'BMW_M9';
    const track = this.vehicle === 'VECTOR_GT';
    const kick = this.hits ? this.hits - 1 + easeOut(since / .44) : 0;
    const w = size * (reduced ? 1 : .72 + .28 * reveal);
    const h = w * emblem.texture.height / emblem.texture.width;
    emblem.width = w;
    emblem.height = h;
    emblem.rotation = !reduced && turbine ? time * .34 + kick * .48 : 0;
    emblem.alpha = reveal * (.86 + pulse * .14);
    const flash = Math.max(pulse, 1 - reveal);
    echo.visible = flash > .015;
    if (!echo.visible) return;
    const spread = reduced ? 0 : 1 - flash;
    echo.width = w * (1 + spread * (track ? .26 : .20));
    echo.height = h * (1 + spread * (track ? .08 : .30));
    echo.rotation = emblem.rotation;
    echo.y = !reduced && !turbine && !track ? -h * .24 * spread : 0;
    echo.x = !reduced && track ? w * .10 * spread : 0;
    echo.alpha = flash * reveal * (reduced ? .30 : .81);
  }
}
