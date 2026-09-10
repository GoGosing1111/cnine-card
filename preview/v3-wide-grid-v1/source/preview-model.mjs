import {buildFighter, publicFighter, teamSummary} from '../../../functions/_battle_v2_preview.js';
import {buildPreviewDeck} from '../../idle-v3-v1/source/idle-model.mjs';
import {createEncounter} from '../../scrapyard-v3-v1/source/encounter-model.mjs';
import {createMercenaryBattleArtAdapter} from '../../../js/project-v-mercenary-battle-art-adapter-v1.js';

export function createGridPreview({catalog, equipment, roster, scenario = 'PVP'}) {
  const adapter = createMercenaryBattleArtAdapter(roster);
  const resolve = code => {
    const art = adapter.resolveForConsumer('BATTLE_FIELD', code);
    if (!art) throw new Error(`용병 전투 SD가 없습니다: ${code}`);
    return art;
  };
  const wideGridPreview = {scenario, mercenaries: {
    ALLY: ['V-013'].map(resolve), ENEMY: scenario === 'PVP' ? ['V-017'].map(resolve) : []
  }};
  if (scenario === 'PVE') return {...createEncounter({catalog, equipment, seed: 7123, powerScale: 1}),
    wideGridPreview, accountNickname: 'PVE 배틀슈트', title: 'PVE · 확장 편성', playerName: '일반 5 · 용병 1 · 슈트 1', phaseLabel: '배치 검수'};
  if (scenario !== 'PVP') throw new Error('INVALID_GRID_SCENARIO');
  const cards = buildPreviewDeck(catalog);
  const team = side => cards.map((card, i) => buildFighter(card, i, side, null, 'PVP'));
  const a = team('A'), b = team('B');
  // A formation specimen, not a six-card combat or balance simulation.
  return {previewOnly: true, mode: 'PVP', battlefieldMode: 'PVP', cards, opponentCards: cards,
    wideGridPreview, title: 'PVP · 확장 편성', playerName: '아군 · 일반 카드 5', opponentName: '상대 · 일반 카드 5', phaseLabel: '배치 검수',
    battleV2: {schemaVersion: 2, engine: 'BATTLE_ENGINE_V2', teams: {
      A: {cards: a.map(publicFighter), summary: teamSummary(a)},
      B: {cards: b.map(publicFighter), summary: teamSummary(b)}},
    result: {timeline: [], final: {A: a.map(publicFighter), B: b.map(publicFighter)}}}};
}
