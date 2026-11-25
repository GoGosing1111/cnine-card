import {VEHICLE_ART} from '../../../../shared/vehicle-battle-art-v1.mjs';
import {mercenaryVehicleSupport, vehicleBuffText} from '../../../../shared/mercenary-vehicle-support-v1.mjs';
import { Container, Graphics, Text, Texture } from 'pixi.js';
import { clamp, easeOut, supportSprite } from './VehicleSupportFloor.js';

export const TRANSIT_LAYERS = ['gate', 'pressure', 'wake', 'bloom'];
const phase = (t, start, end) => clamp((t - start) / (end - start));
const envelope = (t, start, peak, fall, end) => phase(t, start, peak) * (1 - phase(t, fall, end));

const paint = (node, x, y, width, height, alpha, rotation = 0, direction = 1) => {
  node.visible = alpha > .009;
  if (!node.visible) return;
  node.position.set(x, y);
  node.rotation = rotation;
  node.alpha = clamp(alpha);
  node.scale.set(direction * width / node.texture.width, height / node.texture.height);
};

function layer(texture, parent, tint, additive = false) {
  const node = supportSprite(texture, parent);
  node.tint = tint;
  if (additive) node.blendMode = 'add';
  node.visible = false;
  return node;
}

// The garage can supply a complete showroom photograph. Project its center
// through a feathered aperture so a rectangular photo cannot cover the field.
function projectGarageArt(texture) {
  const source = texture?.source?.resource;
  if (!source) return texture;
  const canvas = document.createElement('canvas');
  canvas.width = Math.min(640, texture.width);
  canvas.height = Math.max(1, Math.round(canvas.width * texture.height / texture.width));
  const ctx = canvas.getContext('2d');
  if (!ctx) return texture;
  try { ctx.drawImage(source, 0, 0, canvas.width, canvas.height); }
  catch { return texture; }
  ctx.globalCompositeOperation = 'destination-in';
  ctx.scale(canvas.width / 2, canvas.height / 2);
  const mask = ctx.createRadialGradient(1, 1, .22, 1, 1, 1.04);
  mask.addColorStop(0, '#fff');
  mask.addColorStop(.59, '#fff');
  mask.addColorStop(.82, 'rgba(255,255,255,.76)');
  mask.addColorStop(1, 'transparent');
  ctx.fillStyle = mask;
  ctx.fillRect(0, 0, 2, 2);
  return Texture.from(canvas);
}

const palettes = {
  ASTRA_VOLT: [0x46beff, 0xd0ffff], OBSIDIAN_RAVEN: [0xa7a7fb, 0xe5e2ff]
};

export class VehicleTransitFX {
  constructor(engine, group, body, textures, feet, delay) {
    this.engine = engine;
    this.feet = feet;
    this.delay = delay;
    this.vehicle = group.vehicle;
    if (!textures) return;
    this.dir = group.side === 'B' ? -1 : 1;
    this.airborne = this.vehicle === 'AETHER_ZERO';
    const art = VEHICLE_ART[this.vehicle];
    this.projection = !art;
    const [accent, light] = art ? [art.accent, art.light] : palettes[this.vehicle] || [0x80d9ff, 0xdeefff];
    const [gate, pressure, wake, bloom] = textures;
    this.back = new Container({label: 'Vehicle portal and ground pressure', eventMode: 'none'});
    this.front = new Container({label: 'Vehicle materialization and departure', eventMode: 'none'});
    this.back.depthSortY = -99990;
    this.front.depthSortY = 100000;
    engine.combatLayer.addChild(this.back, this.front);

    this.gate = layer(gate, this.back, accent);
    this.gateLight = layer(gate, this.back, light, true);
    this.dust = layer(pressure, this.back, light);
    this.headlights = this.vehicle === 'HELIOS_R' ? [-1, 1].map(() => {
      const lightBeam = layer(wake, this.back, light, true);
      lightBeam.anchor.set(.93, .5);
      return lightBeam;
    }) : [];
    this.wake = layer(wake, this.front, accent, true);
    this.wake.anchor.set(.85, .5);
    this.departure = layer(bloom, this.front, light, true);
    if (body) {
      const art = this.projection ? projectGarageArt(body) : body;
      if (art !== body) this.projectedArt = art;
      this.ghosts = [accent, light].map(tint => layer(art, this.front, tint, true));
      this.body = layer(art, this.front, 0xffffff);
      this.sheen = layer(art, this.front, light, true);
      this.sweep = new Graphics({eventMode: 'none'});
      this.front.addChild(this.sweep);
      this.sheen.mask = this.sweep;
    }
    this.rims = [-1, 1].map(() => layer(pressure, this.front, light, true));
    this.ignition = layer(bloom, this.front, accent, true);
    this.landings = feet.map(() => layer(pressure, this.back, light, true));
    const spec = mercenaryVehicleSupport(group.rows?.[0]);
    if (spec?.attackPercent && feet.length) {
      this.buffLabel = new Text({text: vehicleBuffText(spec), style: {
        fontFamily:'system-ui, sans-serif', fontSize:engine.mobile ? 22 : 19, fontWeight:'700', fill:light,
        stroke:{color:0x0d1722, width:4, join:'round'}
      }});
      this.buffLabel.anchor.set(.5, .5);
      this.buffLabel.visible = false;
      this.front.addChild(this.buffLabel);
    }
    this.transitEnd = Math.max(this.buffLabel ? 2.96 : 2.52, (feet.at(-1)?.revealAt || 0) + .58);
  }

  stage() {
    const {width, height} = this.engine.scene;
    const {dir, airborne, engine} = this;
    const mobile = engine.mobile;
    const x = width * (.5 - dir * (mobile ? .09 : .10));
    const floor = this.feet.length ? this.feet.reduce((sum, seal) => sum + seal.actor.baseY, 0) / this.feet.length : height * .57;
    const y = airborne ? height * (mobile ? .31 : .27)
      : Math.min(height * .78, Math.max(height * .60, floor + height * .08)) - (dir < 0 ? height * .09 : 0);
    const size = Math.min(width * (mobile ? .42 : .35), height * (airborne ? .52 : .62), 445);
    const margin = size * .54 + width * .018;
    const gateX = Math.max(margin, Math.min(width - margin, x - dir * size * .62));
    const gateY = Math.max(size * .53 + height * .018, airborne ? y - size * .10 : y);
    return {width, height, x, y, size, dir, airborne, gateX, gateY};
  }

  pose(t, stage, reduced) {
    const {x, y, width, size, dir, airborne, gateX, gateY} = stage;
    if (reduced) return {x, y, scale: 1, rotation: 0};
    const emerge = easeOut(phase(t, .32, 1.02));
    const launch = phase(t, 1.24, 1.98) ** 2;
    const drift = phase(t, .88, 1.26) * .035;
    const travel = drift + launch * width * .90 / size;
    return {x: gateX + (x - gateX) * emerge + dir * size * travel, y: gateY + (y - gateY) * emerge - size * (airborne ? .31 : .06) * launch,
      scale: .24 + .76 * emerge + .12 * launch,
      rotation: dir * (airborne ? -.24 + .31 * emerge - .33 * launch : .15 * (1 - emerge) - Math.sin(emerge * Math.PI) * .12)};
  }

  render(time) {
    const t = time - this.delay, reduced = this.engine.reducedMotion;
    for (const seal of this.feet) seal.render(t, reduced);
    if (!this.front || t < 0) return;
    if (t > this.transitEnd) { this.clearTransit(); return; }
    const stage = this.stage();
    const {width, x, y, size, dir, airborne} = stage;
    if (this.buffLabel) {
      const opacity = envelope(t, 1.56, 1.78, 2.60, 2.95);
      const anchor = this.feet[0].actor.root, pad = this.buffLabel.width / 2 + 8;
      this.buffLabel.visible = opacity > .01 && this.feet.some(foot => foot.actor.hp > 0);
      this.buffLabel.alpha = opacity;
      this.buffLabel.position.set(Math.max(pad, Math.min(width - pad, anchor.x)), anchor.y + (this.engine.mobile ? 25 : 19));
    }
    const pos = this.pose(t, stage, reduced);
    const gateX = reduced ? x : stage.gateX;
    const gateY = reduced ? y : stage.gateY;
    const gateOpen = reduced ? 1 : easeOut(phase(t, 0, .50));
    const gateFade = envelope(t, 0, .26, .67, 1.22);
    const gateWidth = size * (reduced ? .86 : .18 + .84 * gateOpen);
    const gateHeight = size * (airborne ? .97 : .84) * (reduced ? 1 : .4 + gateOpen * .60);
    paint(this.gate, gateX, gateY, gateWidth, gateHeight, gateFade * (reduced ? .47 : .96), dir * (airborne ? -.24 : -.10), dir);
    paint(this.gateLight, gateX, gateY, gateWidth * 1.03, gateHeight * 1.04, reduced ? 0 : gateFade * .48, dir * (airborne ? -.18 : -.05), dir);
    const dustAge = reduced ? .60 : phase(t, .22, 1.3);
    paint(this.dust, gateX + dir * size * .20, gateY + size * (airborne ? .18 : .25),
      size * (.55 + dustAge * 1.13), size * (.18 + dustAge * .29), envelope(t, .18, .48, .78, 1.42) * (reduced ? .3 : .83), 0, dir);
    for (const [i, beam] of this.headlights.entries()) {
      const side = i ? 1 : -1;
      paint(beam, pos.x + dir * size * (.17 + .11 * side) * pos.scale, pos.y + size * (.10 + .045 * side),
        size * (.42 + .37 * gateOpen), size * .125, envelope(t, .14, .33, .64, .94) * (reduced ? .24 : .84),
        dir * side * .065, -dir);
    }
    const launch = reduced ? .45 : phase(t, 1.22, 1.88);
    const plume = envelope(t, 1.14, 1.46, 1.82, 2.10);
    const wakeX = reduced ? x : x + dir * Math.min(Math.abs(pos.x - x), width * .30);
    paint(this.wake, wakeX - dir * size * .16, pos.y + size * .045,
      size * (.54 + 1.16 * launch), size * (.28 + launch * .25), plume * (reduced ? .26 : .89), -dir * (airborne ? .20 : .05), dir);
    const after = reduced ? .50 : phase(t, 1.56, 2.42);
    paint(this.departure, x + dir * size * .51, y + size * .015,
      size * (reduced ? .80 : .40 + 1.14 * easeOut(after)), size * (.3 + .40 * after),
      envelope(t, 1.58, 1.82, 1.9, 2.46) * (reduced ? .32 : .84), dir * -.08, dir);
    const bodyAlpha = envelope(t, .32, .78, 1.72, 1.98);
    if (this.body) {
      const ratio = Math.min(this.projection ? .76 : 1, this.body.texture.height / this.body.texture.width) * (airborne ? .73 : 1);
      const bodyDir = this.projection && this.vehicle !== 'ASTRA_VOLT' ? dir : -dir;
      const drawBody = (part, p, opacity) => paint(part, p.x, p.y, size * p.scale, size * p.scale * ratio, opacity, p.rotation, bodyDir);
      for (const [i, ghost] of this.ghosts.entries()) {
        const silhouette = airborne ? envelope(t, .16, .34, .41, .60) * .82 : 0;
        drawBody(ghost, this.pose(t - (i + 1) * .095, stage, reduced),
          reduced ? 0 : (silhouette + envelope(t, .43, .61, .76, 1.00) * .22 + plume * .51) / (i + 1));
      }
      drawBody(this.body, pos, bodyAlpha);
      drawBody(this.sheen, pos, reduced ? 0 : envelope(t, .38, .51, .96, 1.08) * .95);
      const line = pos.x + dir * size * (-.59 + 1.2 * phase(t, .41, 1.04));
      const w = size * .10, h = size * .56;
      this.sweep.clear();
      if (this.sheen.visible) this.sweep.poly([line-w-h*.18,pos.y-h,line+w-h*.18,pos.y-h,line+w+h*.18,pos.y+h,line-w+h*.18,pos.y+h]).fill(0xffffff);
    }
    // Two independent wheel sprays or wingtip vapor collars bank with the model.
    for (const [i, rim] of this.rims.entries()) {
      const side = i ? 1 : -1;
      const near = envelope(t, .33, .59, .80, 1.10) * .65 + plume * .84;
      paint(rim, pos.x - dir * size * (airborne ? .13 : .16) + dir * side * size * .18,
        pos.y + size * (airborne ? side * .13 : .12 + side * .037), size * (.26 + launch * .38),
        size * (airborne ? .11 : .14), near * (reduced ? 0 : 1), dir * (airborne ? -.39 : -.12), dir);
    }
    const ignition = envelope(t, 1.14, 1.38, 1.45, 1.69);
    paint(this.ignition, pos.x - dir * size * .24, pos.y + size * .08, size * (.31 + launch * .52),
      size * (.16 + launch * .25), reduced ? 0 : ignition * .90, dir * -.13, dir);
    for (const [i, seal] of this.feet.entries()) {
      const arrival = reduced ? .5 : phase(t, seal.revealAt - .08, seal.revealAt + .42);
      const intensity = envelope(t, seal.revealAt - .08, seal.revealAt + .06, seal.revealAt + .13, seal.revealAt + .46);
      const radius = (seal.tile?.groundWidth || this.engine.isoConfig?.tileWidth || 180) * (1 + .40 * arrival);
      paint(this.landings[i], seal.actor.root.x, seal.actor.root.y - 2, radius, radius * .37,
        seal.actor.hp > 0 ? intensity * (reduced ? .22 : .86) : 0, 0, dir);
    }
  }

  clearTransit() {
    this.front?.destroy({children: true});
    this.back?.destroy({children: true});
    this.projectedArt?.destroy(true);
    this.front = this.back = this.projectedArt = null;
    this.body = null;
  }

  destroy() {
    this.clearTransit();
    for (const seal of this.feet) seal.destroy();
  }
}
