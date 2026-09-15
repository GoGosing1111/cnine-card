import { territoryFormationSnapshot, territoryFormationFromParts } from './_territory_war.js';
import { releasedMercenarySnapshots } from './_mercenary_account.js';

// A short-lived shared pool avoids re-reading every defender for every sortie.
// Both actual combatants are always re-read; cached entries only rank candidates.
const pools = new Map();
export async function currentCoupFormation(env, deps, row, battle) {
  const user = { id: Number(row.user_id), nickname: row.nickname || '', role: row.role || 'USER' };
  const cards = await deps.pvpDeckSnapshot(env, user.id);
  if (cards.length !== 5 || new Set(cards.map(c => String(c.id))).size !== 5) return null;
  const formation = await territoryFormationSnapshot(env, deps, user, cards, battle);
  return { ...row, cards, deck_snapshot: JSON.stringify(cards.map(c => String(c.id))),
    deck_power: Math.round(formation.formationPower), loadout_bonus_json: JSON.stringify(formation.loadoutBonus) };
}
async function candidateFormations(env, deps, rows, battle) {
  const entries = (await Promise.all(rows.map(async row => {
    const user = { id: Number(row.user_id), nickname: row.nickname || '', role: row.role || 'USER' };
    const deck = await deps.pvpDeckSnapshot(env, user.id);
    if (deck.length !== 5 || new Set(deck.map(c => String(c.id))).size !== 5) return null;
    const cards = deck.map(c => ({ ...c, id: String(c.id), power: deps.cardBattlePower(c, c.breakthrough_level, battle) }));
    return { row, user, cards, deckIds: cards.map(c => c.id) };
  }))).filter(Boolean);
  if (!entries.length) return [];
  // Batch metadata shared by the nearby candidates instead of reading each
  // account's skill settings, mercenary CMS and magic configuration repeatedly.
  const [unique, synergies, magic, mercenaries, equipment] = await Promise.all([
    deps.cardUniqueDeckStates ? deps.cardUniqueDeckStates(env, entries, 'PVP') : entries.map(e => ({ power: e.cards.reduce((sum, c) => sum + c.power, 0) })),
    deps.evaluateDeckSynergiesBatch ? deps.evaluateDeckSynergiesBatch(env, entries, 'PVP') : Promise.all(entries.map(e => deps.evaluateDeckSynergies ? deps.evaluateDeckSynergies(env, e.user, e.deckIds, 'PVP', { forceOwnerTest: e.user.role === 'OWNER' }) : { totals: { attackPercent: 0 } })),
    deps.magicBattleLoadouts ? deps.magicBattleLoadouts(env, entries.map(e => e.user), 'PVP') : Promise.all(entries.map(e => deps.magicBattleLoadout ? deps.magicBattleLoadout(env, e.user, 'PVP') : { enabled: false, cards: [] })),
    releasedMercenarySnapshots(env, entries.map(e => e.user.id)),
    Promise.all(entries.map(e => deps.userEquipmentBonuses ? deps.userEquipmentBonuses(env, e.user.id) : { pvp: 0 }))
  ]);
  return entries.map((e, i) => {
    const formation = territoryFormationFromParts({ cards: e.cards, uniqueState: unique[i], synergy: synergies[i],
      loadoutBonus: { ...equipment[i], mercenary: mercenaries.get(e.user.id) || null }, magicLoadout: magic[i] });
    return { ...e.row, deck_snapshot: JSON.stringify(e.deckIds), deck_power: Math.round(formation.formationPower), loadout_bonus_json: JSON.stringify(formation.loadoutBonus) };
  });
}
export async function currentCoupOpponents(env, deps, round, side, battle, attackerPower) {
  const key = `${round.id}:${round.starts_at}:${side}:${attackerPower}`, cached = pools.get(key);
  if (cached && cached.until > Date.now()) return cached.promise;
  const entry = { until: Infinity };
  entry.promise = (async () => {
    const rows = (await env.DB.prepare(`SELECT c.*,u.nickname,u.role FROM coup_participants_v2115 c JOIN users u ON u.id=c.user_id
      WHERE c.round_id=? AND c.side<>? AND u.status='ACTIVE'
      ORDER BY ABS(c.deck_power-?),c.user_id LIMIT 8`).bind(round.id, side, attackerPower).all()).results || [];
    const result = await candidateFormations(env, deps, rows, battle);
    entry.until = Date.now() + 5000;
    return result;
  })();
  pools.set(key, entry);
  if (pools.size > 8) for (const [oldKey, old] of pools) if (oldKey !== key && old.until <= Date.now()) pools.delete(oldKey);
  try { return await entry.promise; } catch (error) { if (pools.get(key) === entry) pools.delete(key); throw error; }
}
