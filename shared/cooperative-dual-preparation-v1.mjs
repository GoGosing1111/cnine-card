// Candidate for the two-mercenary release only. Existing rooms/CMS stay intact.
// Fixed enemy multipliers apply after captured CMS/species stats, never party power.
export const COOP_DUAL_BALANCE=Object.freeze({version:'COOP_DUAL_20261028_V1',hp:1.6,attack:1.15});
export function validateCoopDualBalance(value) {
  if(!value||value.version!==COOP_DUAL_BALANCE.version||![value.hp,value.attack].every(n=>Number.isFinite(n)&&n>=1&&n<=4))throw Error('INVALID_COOP_DUAL_BALANCE');
  return {...value};
}
