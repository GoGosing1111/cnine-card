import assert from 'node:assert/strict';
import test from 'node:test';

import {
  buildFighter,
  simulateBattleV2Preview,
} from '../functions/_battle_v2_preview.js';

const POWER = 120_000;

const unique = (type) => ({
  dominantType: type,
  attackPercent: type === 'ATTACK' ? 30 : 0,
  defensePercent: type === 'DEFENSE' ? 30 : 0,
  speedPercent: type === 'SPEED' ? 30 : 0,
  hpPercent: type === 'HP' ? 30 : 0,
});

const advancement = (classCode, dominantType, modifiers) => ({
  active: true,
  classCode,
  dominantType,
  configVersion: 'v1937-test',
  modifiers,
});

function fighter({ id, type = 'NONE', side = 'A', slot = 0, power = POWER, advance = null }) {
  return buildFighter({
    id,
    power,
    power_type: type,
    grade: 'ZENITH',
    breakthroughLevel: 13,
    uniqueAdvancement: advance,
  }, slot, side, type === 'NONE' ? null : unique(type), 'PVP');
}

test('전직은 계열과 코드가 일치하는 서버 주입 상태만 적용한다', () => {
  const base = fighter({ id: 'attack-base', type: 'ATTACK' });
  const valid = fighter({
    id: 'attack-valid',
    type: 'ATTACK',
    advance: advancement('SHATTER', 'ATTACK', { maxHpPercent: -6 }),
  });
  const forged = fighter({
    id: 'attack-forged',
    type: 'ATTACK',
    advance: advancement('IMMORTAL', 'ATTACK', { maxHpPercent: 35 }),
  });

  assert.equal(valid.uniqueAdvancement.classCode, 'SHATTER');
  assert.equal(valid.maxHp, Math.round(base.maxHp * 0.94));
  assert.equal(forged.uniqueAdvancement, null);
  assert.equal(forged.maxHp, base.maxHp);
});

test('기존 고유효과가 숨김이어도 DB 전직 계열이 카드 기본 타입보다 우선한다', () => {
  const promoted = buildFighter({
    id: 'hidden-unique-shatter',
    power: POWER,
    power_type: 'DEFENSE',
    grade: 'ZENITH',
    breakthroughLevel: 13,
    uniqueAdvancement: advancement('SHATTER', 'ATTACK', { penetrationPoints: 20 }),
  }, 0, 'A', null, 'PVP');
  assert.equal(promoted.type, 'ATTACK');
  assert.equal(promoted.uniqueAdvancement?.classCode, 'SHATTER');
  assert.equal(promoted.uniqueAdvancement?.modifiers?.penetrationPoints, 20);

  const changedAfterPromotion = buildFighter({
    id: 'stored-shatter-current-defense',
    power: POWER,
    power_type: 'DEFENSE',
    uniqueAdvancement: advancement('SHATTER', 'ATTACK', { penetrationPoints: 20 }),
  }, 0, 'A', unique('DEFENSE'), 'PVP');
  assert.equal(changedAfterPromotion.type, 'ATTACK');
  assert.equal(changedAfterPromotion.uniqueAdvancement?.classCode, 'SHATTER');

  const forged = buildFighter({
    id: 'hidden-unique-forged',
    power: POWER,
    power_type: 'DEFENSE',
    uniqueAdvancement: advancement('IMMORTAL', 'ATTACK', { maxHpPercent: 35 }),
  }, 0, 'A', null, 'PVP');
  assert.equal(forged.type, 'DEFENSE');
  assert.equal(forged.uniqueAdvancement, null);
});

test('파쇄자는 서버 설정만큼 관통을 추가한다', () => {
  const run = (advance) => {
    const attacker = fighter({ id: 'attacker', type: 'ATTACK', advance });
    const defender = fighter({ id: 'defender', type: 'NONE', side: 'B' });
    attacker.gauge = 200;
    attacker.speed = 999;
    return simulateBattleV2Preview({ teamA: [attacker], teamB: [defender], seed: 77, maxActions: 1 })
      .timeline.find((event) => event.type === 'TURN');
  };
  const base = run(null);
  const promoted = run(advancement('SHATTER', 'ATTACK', { penetrationPoints: 12 }));

  assert.equal(promoted.advancementClass, 'SHATTER');
  assert.equal(promoted.penetration, base.penetration + 12);
});

test('잔영자와 반격자는 확률 상한을 별도로 확장한다', () => {
  let baseDodges = 0;
  let promotedDodges = 0;
  let baseCounters = 0;
  let promotedCounters = 0;

  for (let seed = 1; seed <= 240; seed += 1) {
    const dodgeRun = (advance) => {
      const attacker = fighter({ id: `dodge-a-${seed}`, type: 'NONE' });
      const defender = fighter({ id: `dodge-b-${seed}`, type: 'SPEED', side: 'B', advance });
      attacker.gauge = 200;
      attacker.speed = 999;
      return simulateBattleV2Preview({ teamA: [attacker], teamB: [defender], seed, maxActions: 1 }).timeline;
    };
    if (dodgeRun(null).some((event) => event.type === 'TURN' && event.dodge)) baseDodges += 1;
    if (dodgeRun(advancement('AFTERIMAGE', 'SPEED', { dodgeChancePoints: 6, dodgeCapPoints: 6 })).some((event) => event.type === 'TURN' && event.dodge)) promotedDodges += 1;

    const counterRun = (advance) => {
      const attacker = fighter({ id: `counter-a-${seed}`, type: 'NONE' });
      const defender = fighter({ id: `counter-b-${seed}`, type: 'DEFENSE', side: 'B', advance });
      attacker.gauge = 200;
      attacker.speed = 999;
      attacker.attack = Math.max(10, Math.round(attacker.attack * 0.35));
      return simulateBattleV2Preview({ teamA: [attacker], teamB: [defender], seed, maxActions: 1 }).timeline;
    };
    if (counterRun(null).some((event) => event.type === 'COUNTER')) baseCounters += 1;
    if (counterRun(advancement('RIPOSTE', 'DEFENSE', { counterChancePoints: 12 })).some((event) => event.type === 'COUNTER')) promotedCounters += 1;
  }

  assert.ok(promotedDodges > baseDodges, `${promotedDodges} should exceed ${baseDodges}`);
  assert.ok(promotedCounters > baseCounters, `${promotedCounters} should exceed ${baseCounters}`);
});

test('불멸자는 팀 회복 풀을 소비하며 공격형 부활 봉인에 막힌다', () => {
  const lastStand = advancement('IMMORTAL', 'HP', { lastStandHealPoolPercent: 12, damageDealtPercent: -8 });
  const run = (attackerType) => {
    const attacker = fighter({ id: `killer-${attackerType}`, type: attackerType });
    const defender = fighter({ id: `immortal-${attackerType}`, type: 'HP', side: 'B', advance: lastStand });
    attacker.gauge = 200;
    attacker.speed = 999;
    attacker.attack = defender.maxHp * 20;
    defender.hp = Math.max(1, Math.round(defender.maxHp * 0.10));
    return simulateBattleV2Preview({ teamA: [attacker], teamB: [defender], seed: 13, maxActions: 1 });
  };

  const unsealed = run('NONE');
  assert.ok(unsealed.timeline.some((event) => event.type === 'ADVANCEMENT' && event.classCode === 'IMMORTAL'));
  assert.ok(unsealed.final.B[0].hp > 0);

  const sealed = run('ATTACK');
  assert.ok(sealed.timeline.some((event) => event.type === 'ADVANCEMENT_BLOCKED' && event.classCode === 'IMMORTAL'));
  assert.equal(sealed.final.B[0].hp, 0);
});

test('공격형 부활 봉인은 불사조 마법카드의 실제 부활 시도를 막는다', () => {
  const attacker = fighter({ id: 'seal-attacker', type: 'ATTACK', advance: advancement('SHATTER', 'ATTACK', {}) });
  const defender = fighter({ id: 'phoenix-target', type: 'NONE', side: 'B' });
  attacker.gauge = 200;
  attacker.speed = 999;
  attacker.attack = defender.maxHp * 20;
  defender.hp = Math.max(1, Math.round(defender.maxHp * 0.10));

  const result = simulateBattleV2Preview({
    teamA: [attacker],
    teamB: [defender],
    magicB: [{
      id: 'phoenix',
      slotNo: 1,
      code: 'V2_PHOENIX_REVIVE',
      name: '불사조의 계약',
      effectType: 'PHOENIX_REVIVE',
      effectValue: 22,
      triggerChance: 100,
      maxActivations: 1,
    }],
    seed: 19,
    maxActions: 1,
  });

  assert.ok(result.timeline.some((event) => event.type === 'REVIVE_SEALED'));
  assert.ok(!result.timeline.some((event) => event.type === 'MAGIC_CARD' && event.revived));
  assert.equal(result.final.B[0].hp, 0);
});

test('전직 카드가 없는 기존 전투에서는 불사조 부활 결과를 바꾸지 않는다', () => {
  const attacker = fighter({ id: 'legacy-attacker', type: 'ATTACK' });
  const defender = fighter({ id: 'legacy-phoenix-target', type: 'NONE', side: 'B' });
  attacker.gauge = 200;
  attacker.speed = 999;
  attacker.attack = defender.maxHp * 20;
  defender.hp = Math.max(1, Math.round(defender.maxHp * 0.10));
  const result = simulateBattleV2Preview({
    teamA: [attacker], teamB: [defender],
    magicB: [{id:'legacy-phoenix',slotNo:1,code:'V2_PHOENIX_REVIVE',name:'불사조의 계약',effectType:'PHOENIX_REVIVE',effectValue:22,triggerChance:100,maxActivations:1}],
    seed:19, maxActions:1,
  });
  assert.ok(result.timeline.some(event => event.type === 'MAGIC_CARD' && event.revived));
  assert.ok(!result.timeline.some(event => event.type === 'REVIVE_SEALED'));
  assert.ok(result.final.B[0].hp > 0);
});
