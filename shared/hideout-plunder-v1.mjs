export const PLUNDER = Object.freeze({
  maxDurability: 100, damage: 20, cooldownMs: 180000,
  protectionMs: 120000, repairPoints: 20, repairSteel: 2, repairWire: 1,
  lootPercent: 10, lootLimit: 5,
  materials: Object.freeze(['STEEL', 'WIRE', 'CIRCUIT', 'COOLANT', 'DRIVE'])
});

const DAY = 86400000;
const KST = 9 * 3600000;

export function plunderWindow(now) {
  const midnight = Math.floor((now + KST) / DAY) * DAY - KST;
  const startsAt = midnight + (20 * 60 + 30) * 60000;
  const endsAt = midnight + 22 * 3600000;
  return {
    day: new Date(midnight + KST).toISOString().slice(0, 10),
    startsAt, endsAt, open: now >= startsAt && now < endsAt,
    nextStart: now < endsAt ? startsAt : startsAt + DAY
  };
}

// Pair entrants before activating either hideout. The stronger of each new
// pair joins the side whose registered formation power is currently lower.
export function assignPlunderTeams(members) {
  const waiting = members.filter(p => !p.team);
  if (waiting.length < 2) return;
  const [strong, other] = waiting.sort((a, b) => b.power - a.power);
  const power = {A: 0, B: 0};
  for (const member of members) if (member.team) power[member.team] += member.power;
  strong.team = power.A <= power.B ? 'A' : 'B';
  other.team = strong.team === 'A' ? 'B' : 'A';
}

export function plunderTransfer(attacker, defender, stockLimits) {
  const loot = {};
  for (const code of PLUNDER.materials) {
    const available = defender.parts[code];
    const space = (stockLimits[code] ?? 1000000000) - attacker.parts[code];
    const take = Math.min(Math.ceil(available * PLUNDER.lootPercent / 100),
      PLUNDER.lootLimit, Math.max(0, space));
    if (take > 0) {
      defender.parts[code] -= take;
      attacker.parts[code] += take;
      loot[code] = take;
    }
  }
  return loot;
}
