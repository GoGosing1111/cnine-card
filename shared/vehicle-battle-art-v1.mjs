import {mercenaryVehicleSupport, vehicleTransitSnapshot} from './mercenary-vehicle-support-v1.mjs';

const folder = '/assets/effects/';
const garage = folder + 'garage-support-v1/';
export const VEHICLE_ART = Object.freeze({
  __proto__: null,
  HELIOS_R: {body:folder+'helios-r-v1/vehicle.webp', floor:folder+'helios-r-v1/turbine.webp', accent:0xff953a, light:0xffdf8f},
  AETHER_ZERO: {body:folder+'aether-zero-v1/aircraft.webp', floor:folder+'aether-zero-v1/wings.webp', accent:0xb0ff3e, light:0x91ffee},
  ROLLS_ROYCE_HYPERCAR: {body:garage+'rolls-body.webp', floor:garage+'rolls.webp', accent:0x36e1d3, light:0xd0fff9},
  BMW_M9: {body:garage+'bmw-body.webp', floor:garage+'bmw.webp', accent:0xffb546, light:0xffe4a5},
  VECTOR_GT: {body:garage+'vector-body.webp', floor:garage+'vector.webp', accent:0xbaf52a, light:0xedffcc}
});

// A member slot identifies a deployed owner, even when the same car or mercenary appears on both sides.
export function vehicleBattleGroups(teams = {}) {
  const groups = [];
  for (const side of ['A', 'B']) {
    const team = teams[side];
    if (!team) continue;
    const owners = new Map();
    for (const member of team.members?.length ? team.members : [team]) {
      const transit = vehicleTransitSnapshot(member.vehicleTransit);
      if (transit && (member.ownerId == null || Number(member.ownerId) === transit.ownerId)) {
        owners.set(transit.ownerId, {...transit, side, rows:[]});
      }
    }
    for (const row of team.mercenaries || []) {
      const spec = mercenaryVehicleSupport(row);
      if (!spec || row.hp <= 0) continue;
      const ownerId = row.vehicleSupport.ownerId;
      const group = owners.get(ownerId) || {ownerId, side, vehicle:spec.vehicle, rows:[]};
      if (group.vehicle !== spec.vehicle) continue;
      group.rows.push(row);
      owners.set(ownerId, group);
    }
    groups.push([...owners.values()]);
  }
  // Alternate sides while keeping each owner's entrance and pair of feet together.
  const ordered = [];
  for (let slot = 0; groups.some(side => slot < side.length); slot++) {
    for (const side of groups) if (side[slot]) ordered.push(side[slot]);
  }
  return ordered;
}
