import { createPvpBattleV2 } from '../../functions/_battle_v2_preview.js';
import { UNIQUE_ADVANCEMENT_CLASS_DEFINITIONS } from '../../functions/_unique_advancement.js';

const POWER = 120_000;
const EQUIPMENT = 500_000;
const SEEDS = Number(process.argv[2] || 600);
const TYPES = ['ATTACK', 'DEFENSE', 'SPEED', 'HP', 'NONE'];

const UNIQUE = Object.freeze({
  ATTACK: { dominantType: 'ATTACK', attackPercent: 30, defensePercent: 0, speedPercent: 0, hpPercent: 0 },
  DEFENSE: { dominantType: 'DEFENSE', attackPercent: 0, defensePercent: 30, speedPercent: 0, hpPercent: 0 },
  SPEED: { dominantType: 'SPEED', attackPercent: 0, defensePercent: 0, speedPercent: 30, hpPercent: 0 },
  HP: { dominantType: 'HP', attackPercent: 0, defensePercent: 0, speedPercent: 0, hpPercent: 30 },
  NONE: null,
});

// 서버 계약을 그대로 읽어 하네스 수치가 라이브 정의와 어긋나지 않게 한다.
export const ADVANCEMENT_CANDIDATES_V1937 = Object.freeze(Object.fromEntries(
  Object.entries(UNIQUE_ADVANCEMENT_CLASS_DEFINITIONS).map(([classCode, definition]) => [classCode, {
    dominantType: definition.dominantType,
    modifiers: { ...definition.modifiers },
  }]),
));

function deck(classCode = '') {
  const definition = ADVANCEMENT_CANDIDATES_V1937[classCode] || null;
  let assigned = false;
  return TYPES.map((type, index) => {
    const isOwner = definition && !assigned && type === definition.dominantType;
    if (isOwner) assigned = true;
    return {
      id: `${type}-${index}`,
      title: `${type}-${index}`,
      grade: 'ZENITH',
      breakthroughLevel: 13,
      power_type: type,
      power: POWER,
      uniqueAbility: UNIQUE[type],
      uniqueAdvancement: isOwner ? {
        active: true,
        classCode,
        dominantType: definition.dominantType,
        configVersion: 'v1937-candidate',
        modifiers: definition.modifiers,
      } : null,
    };
  });
}

function mirroredRate(classCode, opponentCode = '') {
  let promotedWins = 0;
  let games = 0;
  for (let index = 0; index < SEEDS; index += 1) {
    const seed = 1937001 + index * 7919;
    const attacker = createPvpBattleV2({
      attackerCards: deck(classCode),
      defenderCards: deck(opponentCode),
      attackerEquipmentBonus: EQUIPMENT,
      defenderEquipmentBonus: EQUIPMENT,
      seed,
    });
    promotedWins += attacker.result.winner === 'A' ? 1 : attacker.result.winner === 'DRAW' ? 0.5 : 0;
    games += 1;

    const defender = createPvpBattleV2({
      attackerCards: deck(opponentCode),
      defenderCards: deck(classCode),
      attackerEquipmentBonus: EQUIPMENT,
      defenderEquipmentBonus: EQUIPMENT,
      seed,
    });
    promotedWins += defender.result.winner === 'B' ? 1 : defender.result.winner === 'DRAW' ? 0.5 : 0;
    games += 1;
  }
  return promotedWins / games * 100;
}

const rows = [];
for (const classCode of Object.keys(ADVANCEMENT_CANDIDATES_V1937)) {
  const vsBase = mirroredRate(classCode, '');
  const matchups = {};
  for (const opponent of Object.keys(ADVANCEMENT_CANDIDATES_V1937)) {
    matchups[opponent] = mirroredRate(classCode, opponent);
  }
  const promotedMatchups = Object.values(matchups);
  rows.push({
    classCode,
    vsBase: Number(vsBase.toFixed(2)),
    minVsPromoted: Number(Math.min(...promotedMatchups).toFixed(2)),
    maxVsPromoted: Number(Math.max(...promotedMatchups).toFixed(2)),
    matchups,
  });
}

console.log(JSON.stringify({ seedsPerSide: SEEDS, gamesPerPair: SEEDS * 2, rows }, null, 2));
