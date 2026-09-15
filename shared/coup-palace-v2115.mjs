export const COUP_VERSION = 2115;
export const COUP_DEFAULTS = Object.freeze({ battleMinutes: 180, trialMinutes: 1440, attackCooldownSeconds: 30, siegeHp: 500000 });
export const PALACE_NODES = Object.freeze([
  { name: '황궁 외문', x: 16, y: 72 }, { name: '근위대 뜰', x: 31, y: 43 },
  { name: '황궁 광장', x: 54, y: 54 }, { name: '내궁 관문', x: 69, y: 34 },
  { name: '황제의 정전', x: 85, y: 18 }
]);
export function coupSettings(input = {}) {
  const limits = { battleMinutes: [1, 10080], trialMinutes: [1, 10080], attackCooldownSeconds: [5, 300], siegeHp: [1000, 100000000] };
  return Object.fromEntries(Object.entries(limits).map(([key, [min, max]]) => {
    const n = input[key] == null ? COUP_DEFAULTS[key] : Number(input[key]);
    if (!Number.isSafeInteger(n) || n < min || n > max) throw new Error(`${key}: ${min}~${max} 범위의 정수를 입력하세요.`);
    return [key, n];
  }));
}
export function rebelPenalty(coin) {
  const n = BigInt(coin);
  return n > 0n ? n / 5n : 3000000000n;
}
// This opt-in is pinned to one round and is never part of the global CMS defaults.
export function coupRebelDefeatPolicy(roundId, settings = {}) {
  const trial = settings.rebelTrial;
  return roundId && trial?.roundId === roundId && trial.prisonHours === 3
    ? { type: 'PRISON', hours: 3, trialRun: true }
    : { type: 'COIN', hours: 0, trialRun: false };
}
export function coupMatchedOpponent(candidates, attackerPower, recentIds = [], random = Math.random) {
  const power = Math.max(1, Number(attackerPower) || 1);
  const ranked = candidates.map(row => ({ ...row, gap: Math.abs(Number(row.deck_power) - power) })).sort((a, b) => a.gap - b.gap);
  if (!ranked.length) return null;
  const pool = ranked.filter(row => row.gap <= Math.max(power * .15, ranked[0].gap + power * .1));
  const recent = recentIds.map(Number);
  const eligible = pool.length > 1 ? pool.filter(row => Number(row.user_id) !== recent[0]) : pool;
  const encounters = row => recent.filter(id => id === Number(row.user_id)).length;
  const least = Math.min(...eligible.map(encounters));
  const choices = eligible.filter(row => encounters(row) === least);
  const { gap, ...chosen } = choices[Math.min(choices.length - 1, Math.floor(Math.max(0, random()) * choices.length))];
  return { ...chosen, match_power_gap_percent: Math.round(gap / power * 10000) / 100, match_pool_size: pool.length };
}
export function deadlineWinner(round) {
  const front = Number(round.front_index);
  if (front > 2) return 'REBEL';
  if (front < 2) return 'CHIEF';
  const chief = Number(round.chief_hp), rebel = Number(round.rebel_hp);
  return chief === rebel ? 'DRAW' : chief < rebel ? 'REBEL' : 'CHIEF';
}
export function advanceFront(round, damagedSide, damage) {
  let front = Number(round.front_index), chief = Number(round.chief_hp), rebel = Number(round.rebel_hp), winner = null;
  if (damagedSide === 'CHIEF') chief = Math.max(0, chief - damage);
  if (damagedSide === 'REBEL') rebel = Math.max(0, rebel - damage);
  const moved = chief === 0 || rebel === 0;
  if (moved) {
    front += chief === 0 ? 1 : -1;
    if (front > 4) winner = 'REBEL';
    else if (front < 0) winner = 'CHIEF';
    else chief = rebel = Number(round.max_hp);
  }
  return { front: Math.max(0, Math.min(4, front)), chief, rebel, winner, moved };
}
export function trialVerdict(reinstate, remove) { return Number(remove) > Number(reinstate) ? 'REMOVED' : 'REINSTATED'; }
