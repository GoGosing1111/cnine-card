import { Container, Sprite } from 'pixi.js';

export const clamp = n => Math.min(1, Math.max(0, n));
export const easeOut = n => 1 - (1 - clamp(n)) ** 3;

export function supportSprite(texture, parent) {
  const image = new Sprite(texture);
  image.anchor.set(.5);
  parent.addChild(image);
  return image;
}

export class VehicleSupportFloor {
  constructor(engine, actor, label, revealAt) {
    this.engine = engine;
    this.actor = actor;
    this.revealAt = revealAt;
    this.lastHit = -10;
    this.hits = 0;
    this.root = new Container({label, eventMode: 'none'});
    // The actor root follows the foot pivot during lunges and camera movement.
    this.root.zIndex = 1;
    this.root.y = -4;
    this.root.scale.set(1, .38);
    this.root.visible = false;
    actor.root.addChild(this.root);
  }

  hit(time) {
    this.hits++;
    this.lastHit = Math.max(time, this.revealAt + .12);
  }

  show(time) {
    const {actor, root} = this;
    root.visible = time >= this.revealAt && actor.hp > 0 && actor.battleActive !== false && actor.enabled !== false;
    if (!root.visible) {
      this.releaseTile();
      return false;
    }
    if (this.tile && !this.tile.destroyed && this.tile.station.actor === actor) return true;
    this.releaseTile();
    this.tile = this.engine.isoTiles?.find(tile => tile.station?.actor === actor);
    if (this.tile) {
      this.tileWasRenderable = this.tile.renderable;
      this.tile.renderable = false;
    }
    return true;
  }

  get size() {
    return (this.tile?.groundWidth || this.engine.isoConfig?.tileWidth || 180) * 1.04 / Math.max(.28, this.actor.restScale);
  }

  releaseTile() {
    if (this.tile && !this.tile.destroyed) this.tile.renderable = this.tileWasRenderable;
    this.tile = null;
  }

  destroy() {
    this.releaseTile();
    if (!this.root.destroyed) this.root.destroy({children: true});
  }
}
