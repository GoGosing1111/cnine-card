import test from 'node:test';
import assert from 'node:assert/strict';
import { buildPvePlayerTeam, createPvpBattleV2, distributePveEquipment } from '../functions/_battle_v2_preview.js';

const party = () => ['DEFENSE', 'DEFENSE', 'HP', 'ATTACK', 'ATTACK'].map((type, index) => ({
  id: `CARD-${index}`, title: `CARD-${index}`, rarity: index % 2 ? 'ZENITH' : 'FUR',
  power: [83200, 75625, 75625, 93200, 83200][index],
  uniqueAbility: { dominantType: type, attackPercent: 60, defensePercent: 30, hpPercent: 30 },
}));
const combatStats = fighter => Object.fromEntries(['power', 'equipmentShare', 'maxHp', 'attack', 'defense', 'speed', 'shield'].map(key => [key, fighter[key]]));

test('enhancing any PvE card keeps every unchanged ally stat and equipment share intact', () => {
  for (let slot = 0; slot < 5; slot++) {
    const cards = party();
    const before = buildPvePlayerTeam({ cards, characterBonus: 988703 }).teamA;
    const upgraded = cards.map((card, index) => index === slot ? {
      ...card, power: 195200,
      uniqueAbility: { ...card.uniqueAbility, attackPercent: 360, defensePercent: 180, hpPercent: 180 },
    } : card);
    const after = buildPvePlayerTeam({ cards: upgraded, characterBonus: 988703 }).teamA;
    for (let index = 0; index < cards.length; index++) {
      if (index !== slot) assert.deepEqual(combatStats(after[index]), combatStats(before[index]));
    }
    assert.equal(after[slot].equipmentShare, before[slot].equipmentShare);
    assert.ok(after[slot].maxHp > before[slot].maxHp);
    assert.ok(after[slot].attack > before[slot].attack);
    assert.equal(after.reduce((total, fighter) => total + fighter.equipmentShare, 0), 988703);
    assert.ok(cards.every(card => !Object.hasOwn(card, 'equipmentShare')), 'input cards must stay reusable');
  }
});

test('PvE preserves the support total and zero-support stats for one to five cards', () => {
  for (let size = 1; size <= 5; size++) {
    const cards = party().slice(0, size);
    const supported = distributePveEquipment(cards, 1001);
    assert.equal(supported.reduce((total, card) => total + card.equipmentShare, 0), 1001);
    assert.ok(supported.every(card => Number.isInteger(card.equipmentShare) && card.equipmentShare >= 0));
    for (const bonus of [0, -10, NaN, Infinity]) {
      const team = distributePveEquipment(cards, bonus);
      assert.deepEqual(team.map(card => card.effectivePower), cards.map(card => card.power));
      assert.ok(team.every(card => card.equipmentShare === 0));
    }
  }
  assert.deepEqual(distributePveEquipment([], 1001), []);
});

test('independent PvE battle suit keeps its power outside card support', () => {
  const cards = party();
  const without = buildPvePlayerTeam({ cards, characterBonus: 988700 });
  const withSuit = buildPvePlayerTeam({ cards, characterBonus: 988700, battleSuit: {
    code: 'BATTLE_SUIT_03', name: 'G-BODY', pvePower: 750000, skillChips: [],
  } });
  assert.deepEqual(withSuit.teamA.map(combatStats), without.teamA.map(combatStats));
  assert.equal(withSuit.battleSuitFighter.power, 750000);
});

test('PvP continues to use its existing enhanced-power proportional support', () => {
  const cards = party();
  const battle = createPvpBattleV2({ attackerCards: cards, defenderCards: cards, attackerEquipmentBonus: 988700, defenderEquipmentBonus: 0, seed: 17 });
  assert.deepEqual(battle.teams.A.cards.map(card => card.equipmentShare), [200218, 181989, 181989, 224283, 200221]);
  assert.ok(battle.teams.B.cards.every(card => card.equipmentShare === 0));
});
