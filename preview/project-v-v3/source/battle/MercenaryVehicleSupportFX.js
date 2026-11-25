import { Assets } from 'pixi.js';
import { AETHER_ZERO_SUPPORT, HELIOS_R_SUPPORT, mercenaryVehicleSupport, vehicleBuffText } from '../../../../shared/mercenary-vehicle-support-v1.mjs';
import {VEHICLE_ART, vehicleBattleGroups} from '../../../../shared/vehicle-battle-art-v1.mjs';
import {GarageSupportFloor} from './GarageSupportFloor.js';
import { MercenaryTurbine } from './HeliosRSupportFX.js';
import { WingSeal } from './AetherZeroSupportFX.js';
import { VehicleTransitFX, TRANSIT_LAYERS } from './VehicleTransitFX.js';

const effects = new Map([
  [HELIOS_R_SUPPORT.vehicle, {folder: 'helios-r-v1', names: ['vehicle', 'turbine'], Floor: MercenaryTurbine}],
  [AETHER_ZERO_SUPPORT.vehicle, {folder: 'aether-zero-v1', names: ['aircraft', 'wings', 'refraction'], Floor: WingSeal}]
]);

async function loadLayer(url) {
  try { return await Assets.load(url); }
  catch (error) { console.warn('[전투 이동수단]', url, error); return null; }
}
const loadPack = (folder, names) => Promise.all(names.map(name => loadLayer('/assets/effects/' + folder + '/' + name + '.webp')));

class MercenaryVehicleSupportFX {
  constructor(engine) {
    this.engine = engine;
    this.fields = [];
    this.time = 0;
    this.tick = ticker => {
      if (!engine.visible || !engine.liveDeployed || this.waiting) return;
      this.time += Math.min(ticker.deltaMS, 80) / 1000;
      for (const field of this.fields) field.render(this.time);
      if (this.transitOnly && this.fields.every(field => !field.front)) engine.app.ticker.remove(this.tick);
    };
  }

  async mount(groups) {
    const sessionAssets = this.engine.pendingLiveAssets;
    const [common, packs] = await Promise.all([
      loadPack('vehicle-transit-v1', TRANSIT_LAYERS),
      Promise.all(groups.map(group => {
        const effect = effects.get(group.vehicle);
        if (effect) return loadPack(effect.folder, effect.names);
        const art = VEHICLE_ART[group.vehicle];
        if (art) return Promise.all([loadLayer(art.body), loadLayer(art.floor)]);
        if (!group.image) return [];
        return loadLayer(group.image).then(body => {
          if (body && !this.disposed) sessionAssets?.set(group.image, body);
          return [body];
        });
      }))
    ]);
    if (this.disposed) return;
    for (const [index, group] of groups.entries()) {
      const [body, ...art] = packs[index];
      const Floor = effects.get(group.vehicle)?.Floor;
      const feet = art.length && art.every(Boolean) ? group.actors.map((actor, i) =>
        Floor ? new Floor(this.engine, actor, ...art, i) : new GarageSupportFloor(this.engine, actor, art[0], i, group.vehicle)) : [];
      this.fields.push(new VehicleTransitFX(this.engine, group, body, common.every(Boolean) ? common : null, feet, index * 1.15));
    }
    this.transitOnly = this.fields.every(field => !field.feet.length);
    if (this.fields.length) this.engine.app.ticker.add(this.tick);
  }

  syncClock(elapsedMs) {
    this.waiting = elapsedMs == null;
    this.time = Math.max(0, Number(elapsedMs) || 0) / 1000;
    for (const field of this.fields) field.render(this.time);
  }

  hit(actor, vehicle) {
    for (const field of this.fields) {
      if (field.vehicle !== vehicle) continue;
      const foot = field.feet.find(entry => entry.actor === actor);
      if (foot) {
        const first = foot.hits === 0;
        foot.hit(this.time - field.delay);
        if (first) {
          const spec = mercenaryVehicleSupport(actor.mercenaryRow);
          this.engine.updateStatus(actor.name + ' · ' + spec.name + ' · ' + vehicleBuffText(spec));
        }
        return;
      }
    }
  }

  destroy() {
    this.disposed = true;
    this.engine.app?.ticker.remove(this.tick);
    for (const field of this.fields) field.destroy();
    this.fields.length = 0;
  }
}

export function prepareMercenaryVehicleSupport(engine, payload) {
  const actors = new Map((engine.mercenaries || []).map(actor => [actor.mercenaryRow.id, actor]));
  const groups = vehicleBattleGroups(payload?.battleV2?.teams).map(group => ({
    ...group, actors: group.rows.map(row => actors.get(row.id)).filter(Boolean)
  }));
  if (!groups.length) return;
  const fx = engine.vehicleSupportFX = new MercenaryVehicleSupportFX(engine);
  return fx.mount(groups);
}
