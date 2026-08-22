import assert from 'node:assert/strict';
import { createPveBattleV2 } from '../functions/_battle_v2_preview.js';

const attackCard = (id, power) => ({
  id,
  title: id,
  rarity: id.startsWith('P') ? 'PRESTIGE' : 'LIMITED',
  power,
  breakthrough_level: id.startsWith('P') ? 10 : 13,
  uniqueAbility: { attackPercent: 14, defensePercent: 7, hpPercent: 9, speedPercent: 0, dominantType: 'ATTACK' }
});
const speedCard = (id, power) => ({
  id,
  title: id,
  rarity: id,
  power,
  breakthrough_level: id === 'FUR' ? 10 : 13,
  uniqueAbility: { attackPercent: 6, defensePercent: 7, hpPercent: 8, speedPercent: 9, dominantType: 'SPEED' }
});

const common = [attackCard('P1', 25080), attackCard('P2', 25080), attackCard('L1', 22743), attackCard('L2', 22743)];
// V1812 HP 축소 뒤 25만 구간은 두 덱 모두 100%로 포화된다.
// 승급 카드의 속도/전투력 우위를 계속 구분할 수 있는 경계 구간을 사용한다.
const monster = { id: 31, name: 'TEST BOSS', battle_power: 450000, is_boss: 1 };
const options = {
  characterBonus: 40800,
  monster,
  ultimateDamage: 55176,
  bossUltimatePercent: 99,
  singleHealerBonus: { enabled: true, teamHpPercent: 8, healPercent: 10, crisisThresholdPercent: 40, crisisHealPercent: 16, pvpMaxActivations: 4, pveMaxActivations: 6 }
};

let lowerWins = 0;
let higherWins = 0;
for (let seed = 1; seed <= 5000; seed += 1) {
  const lower = createPveBattleV2({ ...options, cards: [...common, speedCard('FUR', 18656)], seed });
  const higher = createPveBattleV2({ ...options, cards: [...common, speedCard('LIMITED', 21147)], seed });
  lowerWins += lower.result.winner === 'A' ? 1 : 0;
  higherWins += higher.result.winner === 'A' ? 1 : 0;
  assert.equal(lower.rules.timeoutRule, 'MONSTER_SURVIVES_LOSE');
  assert.equal(lower.rules.maxDuration, 4);
  assert.equal(lower.rules.maxActions, 2000);
}

assert.ok(higherWins > lowerWins, `higher power speed card must not regress: ${higherWins} <= ${lowerWins}`);
console.log(JSON.stringify({ lowerWins, higherWins, trials: 5000 }));
