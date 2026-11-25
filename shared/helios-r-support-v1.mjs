import { HELIOS_R_SUPPORT, mercenaryVehicleSupport } from './mercenary-vehicle-support-v1.mjs';
export { HELIOS_R_SUPPORT };
export function hasHeliosRSupport(fighter) {
  return mercenaryVehicleSupport(fighter)?.vehicle === HELIOS_R_SUPPORT.vehicle;
}
