const statSupport = (vehicle, name, percent) => Object.freeze({vehicle, name, version: 2, attackPercent: percent, defensePercent: percent});

export const HELIOS_R_SUPPORT = statSupport('HELIOS_R', '솔라 오버드라이브', 10);
export const AETHER_ZERO_SUPPORT = statSupport('AETHER_ZERO', '팬텀 베일', 20);
export const ROLLS_ROYCE_SUPPORT = statSupport('ROLLS_ROYCE_HYPERCAR', '로열 크레스트', 35);
export const BMW_M9_SUPPORT = statSupport('BMW_M9', '골든 터빈', 55);
export const VECTOR_GT_SUPPORT = statSupport('VECTOR_GT', '피니시 라인', 80);
export const VEHICLE_SUPPORTS = Object.freeze([HELIOS_R_SUPPORT, AETHER_ZERO_SUPPORT, ROLLS_ROYCE_SUPPORT, BMW_M9_SUPPORT, VECTOR_GT_SUPPORT]);
const policies = new Map(VEHICLE_SUPPORTS.map(spec => [spec.vehicle, spec]));

// Queued matches can still contain their original combat rules.
const historical = new Map([
  ['HELIOS_R', Object.freeze({vehicle:'HELIOS_R', version:1, name:HELIOS_R_SUPPORT.name, basicPowerPercent:12})],
  ['AETHER_ZERO', Object.freeze({vehicle:'AETHER_ZERO', version:1, name:AETHER_ZERO_SUPPORT.name, basicGuardPercent:15})]
]);

export function vehicleBuffText(spec) {
  if (spec?.attackPercent) return '공격력 +' + spec.attackPercent + '% · 방어력 +' + spec.defensePercent + '%';
  if (spec?.basicPowerPercent) return '기본 공격 위력 +' + spec.basicPowerPercent + '%';
  if (spec?.basicGuardPercent) return '기본 공격 피해 ' + spec.basicGuardPercent + '% 감소';
  return '';
}

// Replays carry the actual owner's vehicle and policy version at battle entry.
export function mercenaryVehicleSupport(fighter) {
  const saved = fighter?.vehicleSupport;
  if (fighter?.isMercenary !== true || !Number.isSafeInteger(saved?.ownerId) || saved.ownerId <= 0) return null;
  if (fighter.ownerId != null && Number(fighter.ownerId) !== saved.ownerId) return null;
  const spec = (saved.version === 1 ? historical : policies).get(saved.vehicle);
  return spec && spec.version === saved.version ? spec : null;
}

export function vehicleTransitSnapshot(value) {
  if (value?.version !== 1 || !Number.isSafeInteger(value.ownerId) || value.ownerId <= 0 ||
      typeof value.vehicle !== 'string' || !value.vehicle || value.vehicle.length > 100) return null;
  const raw = String(value.image || '').trim();
  const path = raw.startsWith('/') ? raw : '/' + raw;
  let image = '';
  if (path.startsWith('/assets/') && !/[\\]/.test(path) && !path.split('/').includes('..')) image = path;
  else if (raw.startsWith('https://')) {
    try {
      const url = new URL(raw);
      if (!url.username && !url.password) image = url.href;
    } catch { /* A missing catalog image still has a portal and a departure. */ }
  }
  return {version: 1, ownerId: value.ownerId, vehicle: value.vehicle, name: String(value.name || value.vehicle).slice(0, 80), image};
}
