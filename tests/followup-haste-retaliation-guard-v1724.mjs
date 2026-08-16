import assert from 'node:assert/strict';
import { simulateBattleV2Preview } from '../functions/_battle_v2_preview.js';

const fighter = (id, side, overrides = {}) => ({
  id,
  cardId: id,
  side,
  slot: 0,
  row: 'FRONT',
  title: id,
  grade: 'LIMITED',
  battleMode: 'PVP',
  type: 'ATTACK',
  typeLabel: '공격형',
  uniqueAbility: null,
  maxHp: 100,
  hp: 5,
  attack: 20,
  defense: 1,
  speed: side === 'A' ? 1000 : 35,
  shield: 0,
  maxShield: 0,
  gauge: side === 'A' ? 95 : 0,
  alive: true,
  actions: 0,
  damageDealt: 0,
  healingDone: 0,
  huntStacks: 0,
  ...overrides
});

const haste = { id: 1, slotNo: 1, code: 'V2_FOLLOWUP_HASTE', name: '질풍의 연계', effectType: 'FOLLOWUP_HASTE', effectValue: 22, triggerChance: 100, maxActivations: 1 };
const trap = { id: 2, slotNo: 1, code: 'V2_PUNISH_TRAP', name: '응징의 마법진', effectType: 'PUNISH_TRAP', effectValue: 100, triggerChance: 100, maxActivations: 1 };

const result = simulateBattleV2Preview({
  teamA: [fighter('A', 'A')],
  teamB: [fighter('B', 'B', { maxHp: 1000, hp: 1000 })],
  magicA: [haste],
  magicB: [trap],
  seed: 7,
  maxActions: 1
});

const hasteEvent = result.timeline.find(event => event.type === 'MAGIC_CARD' && event.effectType === 'FOLLOWUP_HASTE');
const trapEvent = result.timeline.find(event => event.type === 'MAGIC_CARD' && event.effectType === 'PUNISH_TRAP');
assert.ok(hasteEvent, '질풍의 연계가 발동해야 한다');
assert.ok(trapEvent, '응징의 마법진이 발동해야 한다');
assert.equal(trapEvent.hasteRetaliationGuard, true);
assert.equal(trapEvent.targetHpAfter, 1, '질풍 발동 직후 반격은 HP를 최소 1 남겨야 한다');
assert.ok(trapEvent.preventedDamage > 0, '치명 반격 피해가 실제로 차단되어야 한다');
assert.equal(result.timeline.some(event => event.type === 'KO' && event.targetId === 'A'), false, '질풍 발동 공격의 반격으로 사망하면 안 된다');

const defeatedTarget = simulateBattleV2Preview({
  teamA: [fighter('A2', 'A', { hp: 100, attack: 10000 })],
  teamB: [fighter('B2', 'B', { maxHp: 10, hp: 1 })],
  magicA: [haste],
  magicB: [trap],
  seed: 11,
  maxActions: 1
});
assert.equal(defeatedTarget.timeline.some(event => event.type === 'MAGIC_CARD' && event.effectType === 'PUNISH_TRAP'), false, '처치된 대상은 사후 반격하면 안 된다');

console.log('followup haste retaliation guard ok');
