import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {buildTowerV3Battle, TOWER_V3_DRAFT} from '../../functions/_tower_v3.js';
import {TOWER_ABYSS_PROTOCOL} from '../../functions/_tower_abyss.js';
import {fixture, PAIRS, plan as earlierPlan, reviewSnapshot} from '../../tests/helpers/tower-expansion-20261102.mjs';
import proposal from '../../docs/qa/tower-200-20261124/floor-plan.json' with {type:'json'};

const seeds = Array.from({length:16}, (_, index) => Math.imul(index + 1, 2654435761) >>> 0);
const config = {...TOWER_V3_DRAFT, mode:'ON', rulesVersion:TOWER_ABYSS_PROTOCOL, maxTier:proposal.maxFloor, powerGrowth:1.001};
const checkpoints = [earlierPlan.floors.at(-1), ...proposal.floors.filter(row => row.boss)];
const fixedDecks = PAIRS.flatMap(codes => [250000, 1000000].map(power => reviewSnapshot({codes, power})));
const decks = {fixed:fixedDecks};

// An optional local hunt snapshot supplies comparison decks. Only aggregate results leave this process.
if (process.argv[2]) {
  const captured = JSON.parse(readFileSync(process.argv[2], 'utf8'));
  decks.huntReference = captured.samples.map(({input}) => ({
    ...input, cardSupportBonus:input.characterBonus, characterBonus:{pveEquipmentRuntime:input.pveEquipmentRuntime}
  }));
}

const measurements = [];
for (const floor of checkpoints) {
  const monster = fixture.monsters.find(row => Number(row.id) === floor.monsterId);
  assert(monster);
  const bossUltimatePercent = Number(monster.ultimate_enabled) ? Number(monster.ultimate_tower_damage_percent) : 0;
  if (bossUltimatePercent) assert(Number(monster.ultimate_chance) === 100 || monster.ultimate_trigger === 'ALWAYS');
  const result = {floor:floor.floor, power:floor.power, bossUltimatePercent};
  for (const [group, snapshots] of Object.entries(decks)) {
    const wins = snapshots.map(snapshot => {
      let count = 0;
      for (const seed of seeds) {
        const battle = buildTowerV3Battle({snapshot, tier:floor.floor, seed, config, bossUltimatePercent,
          operatingFloor:{id:floor.monsterId, name:monster.name, image:monster.image_url, power:floor.power}});
        assert.equal(battle.continuousEncounter.total, 28);
        assert.equal(battle.battleV2.teams.A.mercenaries.length, 2);
        count += Number(battle.success);
      }
      return count;
    });
    result[group] = {decks:snapshots.length, trials:snapshots.length * seeds.length,
      wins:wins.reduce((sum, count) => sum + count, 0), decksWithWins:wins.filter(count => count > 0).length};
  }
  measurements.push(result);
}
console.log(JSON.stringify({seedsPerDeck:seeds.length, measurements}, null, 2));
