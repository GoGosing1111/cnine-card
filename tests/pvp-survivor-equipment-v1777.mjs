import assert from 'node:assert/strict';
import fs from 'node:fs';
import { resolvePvpOutcome, simulateBattleV2Preview } from '../functions/_battle_v2_preview.js';

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

const inconsistentElimination = {
  winner: 'B',
  reason: 'ELIMINATION',
  final: { A: [fighter(10)], B: [fighter(0)] },
  timeline: [{ type: 'RESULT', winner: 'B', reason: 'ELIMINATION' }]
};
const correctedElimination = resolvePvpOutcome(inconsistentElimination, team(1), team(1));
assert.equal(correctedElimination.winner, 'A', 'the only surviving side must win even if an upstream result is inconsistent');
assert.equal(correctedElimination.reason, 'ELIMINATION');
assert.deepEqual(correctedElimination.survivorCount, { A: 1, B: 0 });
assert.equal(correctedElimination.timeline.at(-1).winner, 'A');

const api = fs.readFileSync(new URL('../functions/api/[[path]].js', import.meta.url), 'utf8');
assert.match(api, /userEquipmentBonuses\(env,user\.id\)/);
assert.match(api, /attackerEquipmentBonus:Number\(aCharacterBonus\.pvp\|\|0\)/);
assert.match(api, /currentMatchAPower=.*Number\(aCharacterBonus\.pvp\|\|0\)/);
assert.match(api, /CREATE TABLE IF NOT EXISTS pvp_battle_audits_v1781/);
assert.match(api, /final_state_json/);

const app = fs.readFileSync(new URL('../js/app.js', import.meta.url), 'utf8');
assert.match(app, /제한 종료 판정: 생존 카드 수 → 잔여 HP 비율 → 편성 전투력/);
assert.match(app, /장비·칭호·차고 \+\$\{Number\(d\.attackerCharacterBonus\?\.pvp\|\|0\)/);

const v3 = fs.readFileSync(new URL('../js/battle-v3-live.js', import.meta.url), 'utf8');
assert.match(v3, /const finalState = payload\?\.battleV2\?\.result\?\.final/);
assert.match(v3, /ProjectVPixiBattle\.syncFinalState\(finalState\)/);
assert.match(v3, /ProjectVPixiBattle\.cancelActiveAnimations/);

const engine = fs.readFileSync(new URL('../preview/project-v-v3/source/battle/BattleEngine.js', import.meta.url), 'utf8');
const entry = fs.readFileSync(new URL('../preview/project-v-v3/source/project-v-pixi-battle.src.js', import.meta.url), 'utf8');
assert.match(engine, /syncFinalState\(final=\{\}\)/);
assert.match(engine, /character\.setState\(CHARACTER_STATE\.IDLE\);\s*character\.setHp\(percent\)/);
assert.match(entry, /cancelActiveAnimations/);
assert.match(entry, /syncFinalState/);

const overtimeTeam = side => Array.from({ length: 5 }, (_, slot) => ({
  id: `${side}:${slot}`, cardId: `${side}${slot}`, side, slot,
  row: slot < 2 ? 'FRONT' : 'BACK', title: `${side}${slot}`, grade: 'FUR',
  power: 100000, basePower: 100000, equipmentShare: 0,
  type: slot === 0 ? 'HP' : 'DEFENSE', battleMode: 'PVP',
  maxHp: 1000000, hp: 1000000, attack: 100, defense: 999999, speed: 100 + slot,
  shield: 0, maxShield: 0, gauge: 0, alive: true,
  emergencyUsed: false, survivalUsed: false, frontlineAnnounced: false,
  actions: 0, damageDealt: 0, healingDone: 0, uniqueAbility: null
}));
const overtime = simulateBattleV2Preview({
  teamA: overtimeTeam('A'), teamB: overtimeTeam('B'), seed: 2,
  maxActions: 130, suddenDeathAfter: 100, healerPenalty: true
});
assert.equal(overtime.timeline.some(event => event.type === 'SUDDEN_DEATH'), true, 'a stalled 2:2-style battle must enter overtime');
assert.equal(overtime.reason, 'ELIMINATION', 'overtime must finish by elimination instead of a survivor HP judgment');
assert.ok(overtime.final.A.every(card => card.hp <= 0) || overtime.final.B.every(card => card.hp <= 0));

console.log('pvp survivor and equipment contract: OK');
