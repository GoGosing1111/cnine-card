import { readFile, writeFile } from 'node:fs/promises';
import { createPveBattleV2, createPvpBattleV2 } from '../../functions/_battle_v2_preview.js';
import { attachHeliosRSupport } from '../../functions/_helios_r_support.js';
import { JOKRO_ART } from '../../shared/mercenary-jokro-v1.mjs';
import { fixture } from '../../tests/helpers/cooperative-fixture.mjs';

const {cards, monster} = JSON.parse(await readFile(new URL('../equipment-sets-v3-20261019/fixture-pve.json', import.meta.url)));
const heukwol = fixture.mercenaries.find(row => row.code === 'V-048');
const jokro = {...JOKRO_ART, statMode: 'RANK_FIXED', level: 1, combat: heukwol.combat};
const mercenaries = attachHeliosRSupport(new Map([[1, [jokro, heukwol]]]), new Set([1])).get(1);
const boss = {...monster, battle_power: 17000000, pve_hp_percent: 350};
const seed = 295;
for (const mode of ['PVE', 'PVP']) {
  const pve = mode === 'PVE';
  const battle = pve
    ? createPveBattleV2({cards, monster: boss, mercenaries, seed})
    : createPvpBattleV2({attackerCards: cards, defenderCards: cards, attackerMercenaries: mercenaries,
        defenderMercenary: heukwol, seed});
  const payload = {mode, cards, ...(pve ? {monster: boss} : {attackerCards: cards, defenderCards: cards, enemyCards: cards}),
    battleV2: battle};
  await writeFile(new URL('./' + mode.toLowerCase() + '.json', import.meta.url), JSON.stringify(payload) + '\n');
}
