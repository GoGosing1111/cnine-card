// One basic action: echoes share its cap, protections, procs and mercenary turn.
export const PVP_SPEED_REFORM = Object.freeze({
  version: '20260930', openingGauge: 60, guardSuppression: 0.30,
  echoMultiplier: 0.50, burstEvery: 3, comboCapScale: 0.80,
});
// Only the extra team barrier from duplicate guards is reduced. A single
// guard's own shield, defense and counterattack retain their existing values.
export const PVP_GUARD_SHIELD_CURVE = Object.freeze([1, 0.25, 0.15, 0.10, 0.05]);
export function isPvpSpeedCard(actor) {
  return actor?.battleMode === 'PVP' && actor.type === 'SPEED' &&
    !actor.isMercenary && !actor.isMonster && !actor.isBattleSuitSupport;
}
export function speedComboPlan(basicAttack, damage, cap) {
  const hitCount = (Math.max(1, basicAttack) - 1) % PVP_SPEED_REFORM.burstEvery === 0 ? 3 : 2;
  const multiplier = 1 + PVP_SPEED_REFORM.echoMultiplier * (hitCount - 1);
  return {hitCount, damage: Math.max(0, Math.min(Math.round(damage * multiplier), Math.floor(cap)))};
}
// Split the server-resolved loss. Protections and on-hit hooks run once per action.
export function speedComboSnapshots(state, hitCount) {
  const weights = [1, ...Array(hitCount - 1).fill(PVP_SPEED_REFORM.echoMultiplier)];
  const weightTotal = weights.reduce((sum, value) => sum + value, 0);
  let accumulated = 0, hp = state.hpBefore, shield = state.shieldBefore, dealt = 0, absorbed = 0;
  const hits=[];
  for(const weight of weights) {
    accumulated += weight;
    const nextDamage = Math.round(state.hpDamage * accumulated / weightTotal);
    const nextAbsorbed = Math.round(state.absorbed * accumulated / weightTotal);
    const hit = {damage: nextDamage - dealt, absorbed: nextAbsorbed - absorbed};
    dealt = nextDamage; absorbed = nextAbsorbed;
    hp -= hit.damage; shield -= hit.absorbed;
    hits.push({...hit, targetHpAfter: hp, targetShieldAfter: shield});
    if(hp<=0){
      // Rounding a one-HP KO can end the visual sequence early. Keep every
      // already-resolved shield loss on that final impact instead of dropping it.
      hits.at(-1).absorbed+=state.absorbed-absorbed;
      hits.at(-1).targetShieldAfter=state.shieldBefore-state.absorbed;
      break;
    }
  }
  return hits;
}
