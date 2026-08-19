import assert from 'node:assert/strict';
import fs from 'node:fs';
import { resolvePvpOutcome } from '../functions/_battle_v2_preview.js';

const fighter = (hp, maxHp = 100, shield = 0, maxShield = 0) => ({ hp, maxHp, shield, maxShield });
const team = power => [{ power, basePower: power, equipmentShare: 0, maxHp: 100, attack: 10, defense: 10, speed: 100 }];
const limited = (a, b, winner = 'B') => ({
  winner,
  reason: 'ACTION_LIMIT',
  final: { A: a, B: b },
  timeline: [{ type: 'RESULT', winner, reason: 'ACTION_LIMIT' }]
});

const survivorFirst = resolvePvpOutcome(
  limited([fighter(5), fighter(5), fighter(5)], [fighter(100)]),
  team(100),
  team(1000)
);
assert.equal(survivorFirst.winner, 'A', 'more surviving cards must win before HP ratio is compared');
assert.equal(survivorFirst.reason, 'SURVIVOR_COUNT');
assert.deepEqual(survivorFirst.survivorCount, { A: 3, B: 1 });
assert.equal(survivorFirst.timeline.at(-1).winner, 'A');

const hpSecond = resolvePvpOutcome(
  limited([fighter(25)], [fighter(80)]),
  team(900),
  team(100)
);
assert.equal(hpSecond.winner, 'B', 'equal survivor count must use remaining team HP ratio');
assert.equal(hpSecond.reason, 'HP_RATIO_TIEBREAK');

const powerLast = resolvePvpOutcome(
  limited([fighter(50)], [fighter(50)], 'DRAW'),
  team(500),
  team(499)
);
assert.equal(powerLast.winner, 'A', 'power and then attacker priority must remain the final tie-break');
assert.equal(powerLast.reason, 'POWER_TIEBREAK');

const eliminated = { winner: 'B', reason: 'ELIMINATION', final: { A: [], B: [fighter(10)] }, timeline: [] };
assert.equal(resolvePvpOutcome(eliminated, team(1), team(1)), eliminated, 'elimination results must not be rewritten');

const api = fs.readFileSync(new URL('../functions/api/[[path]].js', import.meta.url), 'utf8');
assert.match(api, /userEquipmentBonuses\(env,user\.id\)/);
assert.match(api, /attackerEquipmentBonus:Number\(aCharacterBonus\.pvp\|\|0\)/);
assert.match(api, /currentMatchAPower=.*Number\(aCharacterBonus\.pvp\|\|0\)/);

const app = fs.readFileSync(new URL('../js/app.js', import.meta.url), 'utf8');
assert.match(app, /제한 종료 판정: 생존 카드 수 → 잔여 HP 비율 → 편성 전투력/);
assert.match(app, /장비·칭호·차고 \+\$\{Number\(d\.attackerCharacterBonus\?\.pvp\|\|0\)/);

console.log('pvp survivor and equipment contract: OK');
