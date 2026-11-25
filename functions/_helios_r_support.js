import { HELIOS_R_SUPPORT } from '../shared/mercenary-vehicle-support-v1.mjs';
import { readEquippedVehicleSupports, attachVehicleSupports } from './_mercenary_vehicle_support.js';

export async function readHeliosROwners(env, snapshots) {
  if (env.HELIOS_R_BATTLE_SUPPORT !== '1' && env.MERCENARY_VEHICLE_BUFFS !== '1') return new Set();
  const supports = await readEquippedVehicleSupports(env, snapshots);
  return new Set([...supports].filter(([, spec]) => spec === HELIOS_R_SUPPORT).map(([id]) => id));
}

export function attachHeliosRSupport(snapshots, owners) {
  return attachVehicleSupports(snapshots, new Map([...owners].map(id => [id, HELIOS_R_SUPPORT])));
}
