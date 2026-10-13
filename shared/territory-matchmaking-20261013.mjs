// Territory only: diversify comparable opponents without changing battle results.
export const TERRITORY_RECENT_MATCHES = 12;
export function pickDiverseTerritoryOpponent(candidates, attackerPower, recent = [], seed = 1) {
  const power = Math.max(1, Number(attackerPower) || 1);
  const ranked = candidates.filter(row => Number(row.deck_power) > 0).map(row => ({
    row, gap: Math.abs(Number(row.deck_power) - power),
    ratio: Math.max(Number(row.deck_power), power) / Math.min(Number(row.deck_power), power) - 1
  })).sort((a, b) => a.ratio - b.ratio || Number(a.row.user_id) - Number(b.row.user_id));
  if (!ranked.length) return null;
  let band = Math.max(.20, ranked[0].ratio + .10);
  if (ranked.filter(x => x.ratio <= band).length < 6) band = Math.max(band, Math.min(.50, ranked[Math.min(5, ranked.length - 1)].ratio));
  const eligible = ranked.filter(x => x.ratio <= band + 1e-9);
  const history = recent.slice(0, TERRITORY_RECENT_MATCHES).map(row => Number(row.opponent_user_id ?? row));
  const unseen = eligible.filter(x => !history.includes(Number(x.row.user_id)));
  let pool = unseen;
  if (!pool.length) {
    // With a small pool, rotate the least recently met opponent. Never block play.
    const lastSeen = x => history.indexOf(Number(x.row.user_id));
    const oldest = Math.max(...eligible.map(lastSeen));
    pool = eligible.filter(x => lastSeen(x) === oldest);
  }
  // Per-request seeded choice, with a small preference for comparable strength.
  // Global defence counts cannot force one attacker onto the same defender.
  let state = Number(seed) >>> 0;
  state = Math.imul(state ^ (state >>> 16), 0x21f0aaad);
  state = Math.imul(state ^ (state >>> 15), 0x735a2d97);
  state ^= state >>> 15;
  const weights = pool.map(x => 1 / (1 + x.ratio * 2));
  let pick = ((state >>> 0) / 4294967296) * weights.reduce((sum, n) => sum + n, 0);
  let chosen = pool.at(-1);
  for (let i = 0; i < pool.length; i++) { pick -= weights[i]; if (pick < 0) { chosen = pool[i]; break; } }
  return { ...chosen.row, match_power_gap: chosen.gap,
    match_power_gap_percent: Math.round(chosen.gap / power * 10000) / 100,
    match_pool_size: eligible.length, match_fresh_pool_size: unseen.length,
    match_recent_window: TERRITORY_RECENT_MATCHES };
}
