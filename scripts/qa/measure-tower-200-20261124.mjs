import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {buildTowerV3Battle, TOWER_V3_DRAFT} from '../../functions/_tower_v3.js';
import {TOWER_ABYSS_PROTOCOL} from '../../functions/_tower_abyss.js';
import {fixture, PAIRS, plan as earlierPlan, reviewSnapshot} from '../../tests/helpers/tower-expansion-20261102.mjs';
import {equipmentScenario} from './measure-apocalypse-knights.mjs';
import proposal from '../../docs/qa/tower-200-20261124/floor-plan.json' with {type:'json'};

const seedFor = index => Math.imul(index, 2654435761) >>> 0;
const seeds = Array.from({length:16}, (_, index) => seedFor(index + 1));
const config = {...TOWER_V3_DRAFT, mode:'ON', rulesVersion:TOWER_ABYSS_PROTOCOL, maxTier:proposal.maxFloor, powerGrowth:1.001};
const floors = [earlierPlan.floors.at(-1), ...proposal.floors].map(row => {
  const monster = fixture.monsters.find(m => Number(m.id) === row.monsterId);
  assert(monster);
  const casts = (row.boss || Number(monster.is_boss)) && Number(monster.ultimate_enabled);
  if (casts) assert(Number(monster.ultimate_chance) === 100 || monster.ultimate_trigger === 'ALWAYS');
  return {tier:row.floor, config, operatingFloor:{id:row.monsterId, name:monster.name, image:monster.image_url, power:row.power},
    bossUltimatePercent:casts ? Number(monster.ultimate_tower_damage_percent) : 0};
});
const checkpoints = floors.filter(row => row.tier % 10 === 0 || [159, 161, 179].includes(row.tier));
const groups = {fixed:PAIRS.flatMap(codes => [250000, 1000000].map(power => reviewSnapshot({codes, power})))};

// Rebuild both mercenaries' five equipment pieces while retaining each wearer's polish, cards, pet and suit.
if (process.argv[2]) {
  const captured = JSON.parse(readFileSync(process.argv[2], 'utf8'));
  const scenarios = {huntReference:'actual', abyss10:'8+10', abyss15:'8+15', crown15:'10+15'};
  for (const tier of [1, 2, 3]) for (const level of [10, 15]) scenarios[`unique${tier}Plus${level}`] = `unique${tier}+${level}`;
  for (const [group, scenario] of Object.entries(scenarios)) {
    groups[group] = captured.samples.map(sample => {
      const input = equipmentScenario(captured, sample, scenario);
      return {...input, cardSupportBonus:input.characterBonus, characterBonus:{pveEquipmentRuntime:input.pveEquipmentRuntime}};
    });
  }
}

function fight(encounter, snapshot, seed) {
  try {
    return buildTowerV3Battle({...encounter, snapshot, seed});
  } catch (error) {
    if (error.code === 'TOWER_UNIQUE_REQUIRED') return null;
    throw error;
  }
}

const measurements = [];
for (const encounter of checkpoints) {
  const result = {floor:encounter.tier, power:encounter.operatingFloor.power, bossUltimatePercent:encounter.bossUltimatePercent};
  for (const [group, snapshots] of Object.entries(groups)) {
    if (group.startsWith('unique') && encounter.tier < 180) continue;
    const wins = snapshots.map(snapshot => {
      let count = 0;
      for (const seed of seeds) {
        const battle = fight(encounter, snapshot, seed);
        if (battle === null) return null;
        assert.equal(battle.continuousEncounter.total, 28);
        assert.equal(battle.battleV2.teams.A.mercenaries.length, 2);
        count += Number(battle.success);
      }
      return count;
    });
    const eligible = wins.filter(count => count !== null);
    result[group] = {decks:snapshots.length, eligibleDecks:eligible.length, trials:eligible.length * seeds.length,
      wins:eligible.reduce((sum, count) => sum + count, 0), decksWithWins:eligible.filter(count => count > 0).length};
  }
  measurements.push(result);
}

const report = {seedsPerDeck:seeds.length, measurements};
if (groups.abyss10) {
  const from = 160, attemptsPerFloor = 3, seedOffset = 8192;
  const ascentFloors = floors.filter(row => row.tier >= from);
  const ascents = {}, highestByGroup = {};
  const progressingGear = tier => tier < 180 ? 'crown15' : tier < 190 ? 'unique1Plus15' : tier < 200 ? 'unique2Plus15' : 'unique3Plus15';
  for (const group of ['abyss10', 'abyss15', 'crown15', 'progressingGear']) {
    let battles = 0;
    const highest = groups.huntReference.map((_, index) => {
      let cleared = from - 1;
      for (const encounter of ascentFloors) {
        const snapshot = groups[group === 'progressingGear' ? progressingGear(encounter.tier) : group][index];
        for (let attempt = 1; attempt <= attemptsPerFloor; attempt++) {
          const seed = seedFor(seedOffset + (encounter.tier - from) * attemptsPerFloor + attempt);
          const battle = fight(encounter, snapshot, seed);
          if (battle === null) break;
          battles++;
          if (battle.success) {
            cleared = encounter.tier;
            break;
          }
        }
        if (cleared < encounter.tier) break;
      }
      return cleared;
    });
    highestByGroup[group] = highest;
    const sorted = highest.toSorted((a, b) => a - b);
    const median = (sorted[Math.floor((sorted.length - 1) / 2)] + sorted[Math.floor(sorted.length / 2)]) / 2;
    ascents[group] = {decks:highest.length, battles, medianHighestFloor:median,
      reached:Object.fromEntries([160,170,180,190,200].map(floor => [floor, highest.filter(n => n >= floor).length]))};
  }
  const changes = highestByGroup.abyss15.map((n, i) => n - highestByGroup.abyss10[i]);
  report.ascent = {from, attemptsPerFloor, seedOffset, groups:ascents,
    sameSetEnhancement:{improved:changes.filter(n => n > 0).length, same:changes.filter(n => n === 0).length,
      lower:changes.filter(n => n < 0).length, largestGain:Math.max(...changes)}};
}
console.log(JSON.stringify(report, null, 2));
