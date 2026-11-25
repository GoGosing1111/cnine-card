import { VEHICLE_SUPPORTS, vehicleTransitSnapshot, vehicleBuffText } from '../shared/mercenary-vehicle-support-v1.mjs';

// Public battles and private ranked matchmaking share the released garage rules.
export function withReleasedVehicleSupport(env) {
  return {MERCENARY_VEHICLE_BUFFS: '1', VEHICLE_TRANSIT_FX: '1', ...env};
}

const enabled = (env, vehicle) => env?.MERCENARY_VEHICLE_BUFFS === '1' || env?.[vehicle + '_BATTLE_SUPPORT'] === '1';
export const enabledVehiclePolicies = env => VEHICLE_SUPPORTS.filter(spec => enabled(env, spec.vehicle));

export function equippedVehiclePolicy(env, code) {
  return VEHICLE_SUPPORTS.find(spec => spec.vehicle === code && enabled(env, code));
}

export function garageTransit(env, ownerId, vehicle) {
  if (!vehicle?.code || env?.VEHICLE_TRANSIT_FX !== '1' && !equippedVehiclePolicy(env, vehicle.code)) return null;
  return vehicleTransitSnapshot({version: 1, ownerId: Number(ownerId), vehicle: vehicle.code, name: vehicle.name, image: vehicle.image_url});
}

export function garageSupportText(env, code) {
  const spec = equippedVehiclePolicy(env, code);
  return spec ? '장착 효과 · ' + spec.name + ' · PvP·PvE에서 내 출전 용병의 ' + vehicleBuffText(spec) : '';
}

export async function readEquippedVehicleSupports(env, snapshots) {
  const result = new Map();
  const specs = enabledVehiclePolicies(env);
  if (!specs.length) return result;
  const ids = [...snapshots].filter(([, rows]) => Array.isArray(rows) ? rows.length : rows).map(([id]) => id);
  const codes = specs.map(spec => spec.vehicle);
  // Ranked batch reads may cover up to 200 owners. Keep each read within the
  // SQLite bind limit as well as the PostgreSQL adapter's query contract.
  for (let offset = 0; offset < ids.length; offset += 90) {
    const group = ids.slice(offset, offset + 90);
    const { results } = await env.DB.prepare(`SELECT l.user_id,g.code FROM user_garage_loadout l
      JOIN user_garage_vehicles u ON u.user_id=l.user_id AND u.garage_id=l.garage_id
      JOIN character_garage_items g ON g.id=l.garage_id AND g.is_active=1
      WHERE g.code IN (${codes.map(() => '?').join(',')}) AND l.user_id IN (${group.map(() => '?').join(',')})`)
      .bind(...codes, ...group).all();
    for (const row of results) result.set(Number(row.user_id), specs.find(spec => spec.vehicle === row.code));
  }
  return result;
}

export function attachVehicleSupports(snapshots, byOwner) {
  if (!byOwner.size) return snapshots;
  const result = new Map(snapshots);
  for (const [ownerId, spec] of byOwner) {
    const rows = snapshots.get(ownerId);
    if (!rows || !spec) continue;
    const mark = row => ({...row, vehicleSupport: {vehicle: spec.vehicle, version: spec.version, ownerId}});
    result.set(ownerId, Array.isArray(rows) ? rows.map(mark) : mark(rows));
  }
  return result;
}
