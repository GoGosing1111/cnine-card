import assert from 'node:assert/strict';
import fs from 'node:fs';
import {parseArgs} from 'node:util';
import {pathToFileURL} from 'node:url';
import {createPveBattleV2} from '../../functions/_battle_v2_preview.js';
import {pveDifficultyRuntime} from '../../functions/_pve_nightmare.js';
import {buildMercenaryEquipmentRuntime} from '../../functions/_mercenary_equipment_v2.js';
import {APOCALYPSE_KNIGHTS, knightProfile} from '../../shared/apocalypse-knights-v1.mjs';

// Transfer the observed polish per wearer and slot. A previously empty slot has zero polish.
export function equipmentScenario(study, sample, name) {
  if (name === 'actual') return sample.input;
  const [tier, level] = name.split('+').map(Number);
  assert([8, 10].includes(tier) && level >= 10 && level <= 15);
  const prefix = 'MERC_ASC_' + String(tier).padStart(2, '0') + '_';
  const pieces = study.catalog.filter(item => item.code.startsWith(prefix));
  assert.equal(pieces.length, 5);
  assert.equal(new Set(pieces.map(item => item.slot)).size, 5);
  const mercenaries = sample.input.mercenaries.map((mercenary, seat) => {
    const rows = pieces.map((piece, slot) => {
      const worn = mercenary.equipment?.items.find(item => item.slot === piece.slot);
      const instance = worn?.instanceId ?? String(800000000 + seat * 10 + slot);
      return {...piece, instance_id: instance, equipment_id: piece.id, level,
        value: worn?.polish ? JSON.stringify(worn.polish) : null};
    });
    const equipment = buildMercenaryEquipmentRuntime(rows, sample.owner, 'PVE', 1, study.advanced);
    if (mercenary.equipment?.polishEffects) assert.deepEqual(equipment.polishEffects, mercenary.equipment.polishEffects);
    return {...mercenary, equipment};
  });
  return {...sample.input, mercenaries};
}

export function battleMonster(study, id, power) {
  const boss = APOCALYPSE_KNIGHTS.find(b => b.monsterId === id);
  assert(boss || id === 83);
  const profile = boss ? knightProfile(boss, study.anchor) : {...study.anchor};
  if (power !== undefined) profile.battlePower = power;
  const runtime = pveDifficultyRuntime({apocalypse: {monsterProfiles: {[id]: profile}}},
    {id, name: boss?.name ?? '모르가스', pve_tab: 'APOCALYPSE', is_boss: 1});
  assert.equal(runtime.engineMonster.battle_power, profile.battlePower);
  return {monster: runtime.engineMonster, bossUltimateCapPercent: runtime.bossUltimateCapPercent};
}

export function measure(study, options) {
  const outcomes = [];
  for (const stage of options.stages.split(',')) {
    const [id, power] = stage.split(':').map(Number);
    const enemy = battleMonster(study, id, power);
    for (const scenario of options.sets.split(',')) {
      const wins = [], remaining = [], survivorsOnWin = {};
      for (const sample of study.samples) {
        const input = equipmentScenario(study, sample, scenario);
        let won = 0, allies = 0;
        for (let k = 0; k < options.count; k++) {
          const seed = Math.imul(options.offset + k + 1, 2654435761) >>> 0;
          const battle = createPveBattleV2({...input, ...enemy, seed});
          if (battle.result.winner === 'A') {
            won++;
            const deployed = new Set([...battle.teams.A.cards, ...battle.teams.A.mercenaries].map(actor => actor.id));
            const survived = [...battle.result.final.A, ...battle.result.final.mercenaries.A].filter(actor => deployed.has(actor.id) && actor.hp > 0).length;
            allies += survived;
            survivorsOnWin[survived] = (survivorsOnWin[survived] ?? 0) + 1;
          }
        }
        wins.push(won);
        remaining.push(won ? +(allies / won).toFixed(1) : null);
      }
      const n = options.count * study.samples.length;
      const result = {id, power: enemy.monster.battle_power, scenario, countPerParty: options.count, trials: n,
        wins, winRate: +(wins.reduce((a,b) => a+b, 0) / n).toFixed(4), meanSurvivorsOnWin: remaining, survivorsOnWin};
      console.log(id, result.power, scenario, wins.join('/'), result.winRate);
      outcomes.push(result);
    }
  }
  return {capturedAt: study.capturedAt, seedOffset: options.offset, parties: study.samples.map(s => s.label), outcomes};
}

if (process.argv[1] && pathToFileURL(process.argv[1]).href === import.meta.url) {
  const {values} = parseArgs({options: {
    input: {type:'string'}, out: {type:'string'}, count: {type:'string', default:'64'},
    offset: {type:'string', default:'2048'}, stages: {type:'string', default:'83,84,85'},
    sets: {type:'string', default:'actual,8+10,8+12,8+15,10+15'}
  }});
  assert(values.input, 'Pass a captured read-only study file with --input');
  const count = Number(values.count), offset = Number(values.offset);
  assert(Number.isSafeInteger(count) && count > 0 && Number.isSafeInteger(offset) && offset >= 0);
  const report = measure(JSON.parse(fs.readFileSync(values.input)), {...values, count, offset});
  if (values.out) fs.writeFileSync(values.out, JSON.stringify(report, null, 2) + '\n');
}
