import {buildFighter, buildMonsterFighter, buildBattleSuitFighter, publicFighter,
  simulateBattleV2Preview, teamSummary} from '../../../functions/_battle_v2_preview.js';
import {buildPreviewDeck, BATTLE_SUIT} from '../../idle-v3-v1/source/idle-model.mjs';

export const NORMAL_COUNT = 9;
export const ACTION_LIMIT = 100;
export const SPECIMENS = Object.freeze({
  gearjaw: {name: '기어죠 스캐빈저', sourceArt: '/assets/ui/scrapyard/monsters/gearjaw-scavenger-v1698.webp',
    battleSprite: '/preview/scrapyard-v3-v1/assets/gearjaw-sd-v1.png'},
  breaker: {name: '고철군주 브레이커', sourceArt: '/assets/ui/scrapyard/monsters/wrecklord-breaker-v1698.webp',
    battleSprite: '/preview/scrapyard-v3-v1/assets/breaker-sd-v1.png'}
});

// Authored preview-only stats. These never write CMS, recipes or drop pools.
export function createEncounter({catalog, equipment, seed = 7123, powerScale = 1} = {}) {
  if (![0.25, 1, 2].includes(powerScale)) throw new Error('INVALID_PREVIEW_POWER');
  const cards = buildPreviewDeck(catalog).map(card => ({...card, power: Math.round(card.power * powerScale)}));
  const suit = equipment.suits.find(row => row.code === BATTLE_SUIT.code);
  const weapon = equipment.weapons.find(row => row.equipmentCode === BATTLE_SUIT.weaponCode);
  if (!suit || !weapon) throw new Error('승인된 슈트 리소스를 찾을 수 없습니다.');
  const suitPower = Math.round(BATTLE_SUIT.basePower * powerScale);
  const equippedBattleSuit = {code: suit.code, pvePower: suitPower,
    appearance: {battleSprite: suit.image, battleHeight: 278}};
  const equippedWeapon = {code: weapon.equipmentCode, appearance: {battleSprite: weapon.battleSprite}};
  const support = buildBattleSuitFighter({...equippedBattleSuit, weapon: equippedWeapon, accountNickname: '회수대 지원'});
  const teamA = cards.map((card, i) => buildFighter(card, i, 'A', null, 'PVE'));
  const monsters = Array.from({length: NORMAL_COUNT + 1}, (_, i) => {
    const boss = i === NORMAL_COUNT, art = SPECIMENS[boss ? 'breaker' : 'gearjaw'];
    const monster = {id: boss ? 'SCRAP_OUTER_BREAKER' : 'SCRAP_OUTER_GEARJAW', name: art.name,
      battle_power: boss ? 2500000 : 850000, is_boss: boss ? 1 : 0,
      pve_difficulty: 'APOCALYPSE'};
    const fighter = buildMonsterFighter(monster);
    const slot = boss ? 1 : i % 3;
    return {...fighter, id: `B:${slot}:SCRAP:${i + 1}`, slot, encounterAfterClear: boss,
      previewSpecies: boss ? 'breaker' : 'gearjaw', previewArt: art};
  });
  const initial = monsters.slice(0, 3), pending = monsters.slice(3);
  const simulation = simulateBattleV2Preview({teamA: [...teamA, support], teamB: initial,
    reinforcements: pending, seed, maxActions: ACTION_LIMIT, maxDuration: 2,
    forcedMonsterEvery: 3, healerPenalty: true});
  const amount = e => Math.max(0, Number(e.damage || 0)) + Math.max(0, Number(e.absorbed || 0));
  const suitDamage = simulation.timeline.filter(e => e.actorId === support.id).reduce((n, e) => n + amount(e), 0);
  const cardDamage = simulation.timeline.filter(e => e.actorId?.startsWith('A:') && e.actorId !== support.id).reduce((n, e) => n + amount(e), 0);
  const supportRow = {...publicFighter(support), authoritative: true, damageAuthority: 'SERVER_TIMELINE', damageDealt: suitDamage};
  const result = {...simulation, final: {...simulation.final, A: simulation.final.A.filter(row => row.id !== support.id)},
    damageBreakdown: {cards: cardDamage, battleSuit: suitDamage, total: cardDamage + suitDamage}};
  return {previewOnly: true, mode: 'HUNT', battlefieldMode: 'HUNT', cards,
    accountNickname: '폐차장 회수대 · 검수 덱', equippedBattleSuit, equippedWeapon,
    characterBonus: {battleSuitPve: suitPower, equippedBattleSuit, equippedWeapon},
    scrapyardPreview: {seed, powerScale, total: monsters.length, normalCount: NORMAL_COUNT,
      instances: monsters.map(row => ({...publicFighter(row), slot: row.slot, boss: row.isBoss,
        species: row.previewSpecies, ...row.previewArt})), initialIds: initial.map(row => row.id)},
    battleV2: {schemaVersion: 2, engine: 'BATTLE_ENGINE_V2', seed,
      rules: {maxActions: ACTION_LIMIT, fixedEnemyStats: true, continuousEncounter: true,
        battleSuitDamageAuthority: 'SERVER_TIMELINE', battleSuitActionClock: 'INDEPENDENT_TIME_CADENCE'},
      teams: {A: {cards: teamA.map(publicFighter), summary: teamSummary(teamA), supports: [supportRow]},
        B: {cards: initial.map(publicFighter), summary: teamSummary(initial)}}, result}};
}
