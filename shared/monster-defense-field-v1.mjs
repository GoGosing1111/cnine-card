export const WORLD = Object.freeze({ width: 2880, height: 1280, coreX: 220, coreY: 620, mergeX: 600, spawnX: 2780,
  frontX: 1510, pressureX: 1600, breachWarningX: 1030 });
export const laneY = (lane, capacity) => capacity === 2 ? [380, 860][lane] : [280, 620, 960][lane];
const clamp = (value, low, high) => Math.max(low, Math.min(high, value));

// A sector identifies a squad's support position and bombardment warnings.
// On the open field, attack range is measured between the actual feet.
export function inDefenseRange(room, unit, target, range) {
  return (room.fieldRevision === 1 || unit.lane === target.lane) &&
    Math.hypot(unit.x - target.x, unit.y - target.y) <= range;
}

function sectorAt(y, capacity) {
  return clamp(Math.round((y - laneY(0, capacity)) / (laneY(1, capacity) - laneY(0, capacity))), 0, capacity - 1);
}

export function deployAssault(room, enemy, random, brief) {
  // A breach admits a small pack at a time. Successive packs fan out over
  // the entry edge, with overlapping approaches even in two-squad rooms.
  let pack = room.assaultPack;
  if (!pack || pack.wave !== room.wave || pack.remaining === 0) {
    const fraction = pack ? (pack.fraction + .36 + random(room) * .29) % 1 : random(room);
    let y = 170 + fraction * (WORLD.height - 340);
    if (brief && brief.kind !== 'NORMAL') y = y * .48 + laneY(brief.focus, room.capacity) * .52;
    pack = room.assaultPack = { wave: room.wave, fraction, y, remaining: 3 };
  }
  // Stagger the depth of each pack too, so units enter around each other's shoulders.
  enemy.x += (3 - pack.remaining) * 95 + (random(room) - .5) * 55;
  enemy.y = clamp(pack.y + (random(room) - .5) * 310, 130, WORLD.height - 130);
  enemy.lane = sectorAt(enemy.y, room.capacity);
  enemy.flank = (random(room) - .5) * 160;
  enemy.bornAt = room.time;
  pack.remaining--;
}

export function advanceAssault(room, enemy, step) {
  if (step <= 0) return;
  let targetX = WORLD.coreX, targetY = WORLD.coreY;
  if (enemy.x > WORLD.mergeX) {
    let nearest = Infinity;
    for (const u of room.units) {
      if (u.hp <= 0 || u.move || u.x >= enemy.x) continue;
      const distance = Math.hypot(enemy.x - u.x, enemy.y - u.y);
      if (distance >= nearest) continue;
      nearest = distance;
      targetX = u.x;
      targetY = u.y + (enemy.flank || 0);
    }
  }
  // Keep adjacent attackers from running on top of one another. The last
  // approach converges on the core so a leak always reaches its objective.
  let separation = 0;
  if (enemy.x > WORLD.mergeX) {
    for (const other of room.enemies) {
      if (other === enemy || other.hp <= 0 || Math.abs(other.x - enemy.x) >= 160) continue;
      const dy = enemy.y - other.y;
      if (Math.abs(dy) < 135) separation += (Math.sign(dy) || (enemy.id < other.id ? -1 : 1)) * (1 - Math.abs(dy) / 135);
    }
  }
  const dx = Math.max(1, enemy.x - targetX);
  const heading = (targetY - enemy.y) / dx + clamp(separation, -1, 1) * .65;
  // Accelerate out of the breach; retain the archetype's speed, slows and enrage.
  const stride = step * (1 + .36 * clamp((room.time - (enemy.bornAt ?? room.time)) / 1200, 0, 1));
  const forward = stride / Math.hypot(1, heading);
  enemy.x -= Math.min(forward, Math.max(0, enemy.x - WORLD.coreX));
  enemy.y = clamp(enemy.y + clamp(heading * forward, -stride, stride), 100, WORLD.height - 100);
  enemy.lane = sectorAt(enemy.y, room.capacity);
}
