import { readTrophyHonors } from './_trophy_honors.js';

export const ACHIEVEMENT_TITLES_KEY = 'achievement_titles_collection_trophies_20260927';
export const ACHIEVEMENT_TITLES = Object.freeze([
  { code: 'COLLECTION_COMPLETIONIST', name: '폐인', description: '카드 도감 100%와 차량 도감 90% 이상을 완성한 수집가.',
    image: '/assets/ui/titles/completionist-v1.webp', style: 'COMPLETIONIST', type: 'COLLECTION_MASTERY',
    config: { cardPercent: 100, vehiclePercent: 90 }, order: 901 },
  { code: 'TROPHY_HUNTER', name: '우승청부사', description: '서로 다른 트로피 4종을 수집한 승리의 증명.',
    image: '/assets/ui/titles/trophy-hunter-v1.webp', style: 'TROPHY_HUNTER', type: 'TROPHY_KINDS',
    config: { count: 4 }, order: 902 }
]);

// Existing title tables only. The marker and both seeds commit together, once;
// later CMS changes and permanent ownership survive redeployment.
export async function ensureAchievementTitles(env) {
  const marker = await env.DB.prepare('SELECT value FROM app_meta WHERE key=?').bind(ACHIEVEMENT_TITLES_KEY).first();
  if (marker?.value === '1') return;
  await env.DB.batch([
    ...ACHIEVEMENT_TITLES.map(t => env.DB.prepare(`INSERT OR IGNORE INTO character_titles
      (code,name,description,badge_text,image_url,pve_power,unlock_type,unlock_config_json,style_preset,is_active,is_public,sort_order)
      VALUES(?,?,?,?,?,0,?,?,?,1,1,?)`).bind(t.code, t.name, t.description, t.name, t.image, t.type, JSON.stringify(t.config), t.style, t.order)),
    env.DB.prepare('INSERT INTO app_meta(key,value,updated_at) VALUES(?,?,CURRENT_TIMESTAMP) ON CONFLICT(key) DO UPDATE SET value=excluded.value,updated_at=CURRENT_TIMESTAMP')
      .bind(ACHIEVEMENT_TITLES_KEY, '1')
  ]);
}

export function collectionMasteryMet(cards, vehicles) {
  return cards.total > 0 && cards.owned === cards.total && vehicles.total > 0 && vehicles.owned * 10 >= vehicles.total * 9;
}

export async function readCollectionMastery(env, userId) {
  // Start from the visible catalogue: unrelated/inactive holdings cannot fill a
  // missing entry, and copies of the same card/vehicle never increase progress.
  const [cards, vehicles] = await Promise.all([
    env.DB.prepare(`SELECT COUNT(*) AS total,COALESCE(SUM(CASE WHEN EXISTS(
      SELECT 1 FROM user_cards u WHERE u.user_id=? AND u.card_id=c.id AND COALESCE(u.quantity,0)>0
      ) THEN 1 ELSE 0 END),0) AS owned FROM cards_effective_v1210 c
      WHERE c.is_active=1 AND COALESCE(c.card_status,'PUBLIC')='PUBLIC'`).bind(userId).first(),
    env.DB.prepare(`SELECT COUNT(*) AS total,COALESCE(SUM(CASE WHEN EXISTS(
      SELECT 1 FROM user_garage_vehicles u WHERE u.user_id=? AND u.garage_id=g.id
      ) THEN 1 ELSE 0 END),0) AS owned FROM character_garage_items g WHERE g.is_active=1 AND g.is_public=1`).bind(userId).first()
  ]);
  const normalize = row => ({ owned: Number(row?.owned || 0), total: Number(row?.total || 0) });
  return { cards: normalize(cards), vehicles: normalize(vehicles) };
}

export async function syncAchievementTitles(env, userId) {
  const rows = (await env.DB.prepare(`SELECT t.id,t.code,t.unlock_type FROM character_titles t
    WHERE ((t.code='COLLECTION_COMPLETIONIST' AND t.unlock_type='COLLECTION_MASTERY')
      OR (t.code='TROPHY_HUNTER' AND t.unlock_type='TROPHY_KINDS')) AND t.is_active=1 AND t.is_public=1
      AND NOT EXISTS(SELECT 1 FROM user_character_titles u WHERE u.user_id=? AND u.title_id=t.id)`)
    .bind(userId).all()).results || [];
  if (!rows.length) return { granted: [], progress: {} };
  const needs = code => rows.some(t => t.code === code);
  const [collection, trophies] = await Promise.all([
    needs('COLLECTION_COMPLETIONIST') ? readCollectionMastery(env, userId) : null,
    needs('TROPHY_HUNTER') ? readTrophyHonors(env, userId) : null
  ]);
  const progress = {};
  if (collection) progress.COLLECTION_COMPLETIONIST = { ...collection, complete: collectionMasteryMet(collection.cards, collection.vehicles) };
  if (trophies) {
    const codes = Object.keys(trophies).filter(code => trophies[code].count > 0);
    progress.TROPHY_HUNTER = { owned: codes.length, goal: 4, codes, complete: codes.length >= 4 };
  }
  const matched = rows.filter(t => progress[t.code]?.complete);
  if (!matched.length) return { granted: [], progress };
  const result = await env.DB.batch(matched.map(t => env.DB.prepare(`INSERT OR IGNORE INTO user_character_titles(user_id,title_id,source_type,source_id)
    SELECT ?,id,'ACHIEVEMENT',code FROM character_titles WHERE id=? AND code=? AND unlock_type=? AND is_active=1 AND is_public=1`).bind(userId, t.id, t.code, t.unlock_type)));
  return { granted: matched.filter((_, i) => Number(result[i]?.meta?.changes || 0) > 0).map(t => Number(t.id)), progress };
}
