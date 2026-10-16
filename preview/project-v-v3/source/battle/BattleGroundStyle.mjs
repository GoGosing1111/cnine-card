import {ALL_LIMITED_MERCENARIES} from '../../../../shared/mercenary-limited-catalog-v1.mjs';
const limitedCodes = new Set(ALL_LIMITED_MERCENARIES.map(row => row.code));
export const BATTLE_GROUND_VERSION = 'BATTLE_GROUND_RUNES_V1';
export const BATTLE_GROUND_ASSETS = Object.freeze(Object.fromEntries(
  ['ally', 'enemy', 'icon', 'mercenary-sss', 'mercenary-sss-limited'].map(key =>
    [key, `/assets/ui/project-v/battle-ground-runes-v1/${key}.webp`])));

// Presentation reads the server snapshot; it never promotes a card's rank.
export function battleGroundStyle(actor = {}, kind = 'cards', team = actor.team) {
  const row = actor.mercenaryRow || actor.battleCard || actor;
  const mercenary = kind === 'mercenaries' || actor.isMercenary || row.actorKind === 'MERCENARY' || row.kind === 'MERCENARY';
  if (mercenary) {
    const rank = String(row.rank || row.grade || '').trim().toUpperCase();
    if (/^SSS(?:S|\+)*$/.test(rank)) {
      // Defense roster snapshots predate edition metadata; use the exact
      // canonical catalog code there, while keeping the snapshot's rank.
      const limited = row.edition ? String(row.edition).toUpperCase() === 'LIMITED' : limitedCodes.has(row.code);
      return limited ? 'mercenary-sss-limited' : 'mercenary-sss';
    }
  } else if (kind === 'cards' && String(row.grade || row.rarity || (row.kind === 'CARD' ? row.rank : '') || '').toUpperCase() === 'ICON') return 'icon';
  return team === 'ENEMY' || team === 'B' ? 'enemy' : 'ally';
}

export function battleGroundSignature(stations) {
  return stations.map(s => `${s.id}:${s.actor?.id || ''}:${battleGroundStyle(s.actor, s.kind, s.team)}`).join('|');
}
