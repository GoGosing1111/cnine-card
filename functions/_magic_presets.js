import { readRuntimeData, cacheRuntimeData } from './_runtime_data_cache.js';

const SCHEMA_KEY = 'schema:pvp-magic-presets:20260922';
export async function ensurePvpMagicPresets(env) {
  if (readRuntimeData(env, SCHEMA_KEY)) return;
  // Independent of the old foundation fast-gate: already migrated accounts need this too.
  const marker = await env.DB.prepare('SELECT value FROM app_meta WHERE key=?').bind(SCHEMA_KEY).first();
  if (!marker) {
    const schema = [
      'CREATE TABLE IF NOT EXISTS pvp_deck_presets (user_id INTEGER NOT NULL,preset_no INTEGER NOT NULL,card_ids TEXT NOT NULL,updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,PRIMARY KEY(user_id,preset_no))',
      'CREATE TABLE IF NOT EXISTS pvp_active_presets (user_id INTEGER PRIMARY KEY,preset_no INTEGER NOT NULL DEFAULT 1,updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP)',
      'CREATE TABLE IF NOT EXISTS pvp_magic_presets (user_id INTEGER NOT NULL,preset_no INTEGER NOT NULL,magic_card_ids TEXT NOT NULL,updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,PRIMARY KEY(user_id,preset_no))'
    ];
    // The Neon compatibility adapter intentionally ignores SQLite DDL in batch().
    if (env.DB.dialect === 'postgres') await env.DB.execSchema(['SELECT pg_advisory_xact_lock(20260922, 2147)', ...schema.map(s => s.replaceAll('INTEGER', 'BIGINT').replaceAll('CURRENT_TIMESTAMP', 'sqlite_now()'))]);
    else await env.DB.batch(schema.map(s => env.DB.prepare(s)));
    await env.DB.prepare('INSERT INTO app_meta(key,value) VALUES(?,?) ON CONFLICT(key) DO NOTHING').bind(SCHEMA_KEY, '1').run();
  }
  cacheRuntimeData(env, SCHEMA_KEY, true, 300000);
}

function invalid(message, status = 400) { return Object.assign(new Error(message), { status }); }
export function magicPresetNo(value) {
  if (!Number.isInteger(Number(value)) || Number(value) < 1 || Number(value) > 3) throw invalid('PVP 프리셋은 1~3번만 사용할 수 있습니다.');
  return Number(value);
}
export function normalizeMagicSlots(value) {
  if (!Array.isArray(value) || value.length !== 5) throw invalid('마법카드 슬롯은 빈 슬롯을 포함해 정확히 5개여야 합니다.');
  const slots = value.map(id => id === null ? 0 : id);
  if (slots.some(id => typeof id !== 'number' || !Number.isSafeInteger(id) || id < 0 || id > 2147483647)) throw invalid('마법카드 ID가 올바르지 않습니다.');
  const ids = slots.filter(Boolean);
  if (new Set(ids).size !== ids.length) throw invalid('같은 마법카드는 한 덱에 한 장만 장착할 수 있습니다.', 409);
  return slots;
}
export function storedMagicSlots(value) {
  try { return normalizeMagicSlots(typeof value === 'string' ? JSON.parse(value) : value); }
  catch { return [0, 0, 0, 0, 0]; }
}
export async function validateMagicSlots(env, userId, slots, deckType) {
  const ids = normalizeMagicSlots(slots).filter(Boolean);
  if (!['PVE', 'PVP'].includes(deckType)) throw invalid('장착 덱이 올바르지 않습니다.');
  if (!ids.length) return;
  const rows = await env.DB.prepare(`SELECT mc.id,mc.scope_pve,mc.scope_pvp FROM user_magic_cards umc JOIN magic_cards mc ON mc.id=umc.magic_card_id WHERE umc.user_id=? AND umc.quantity>0 AND mc.is_active=1 AND mc.id IN (${ids.map(() => '?').join(',')})`).bind(userId, ...ids).all();
  if (rows.results.length !== ids.length) throw invalid('보유하지 않았거나 비활성화된 마법카드가 있습니다. 선택을 확인해주세요.');
  if (rows.results.some(row => Number(row[deckType === 'PVE' ? 'scope_pve' : 'scope_pvp']) !== 1)) throw invalid(`${deckType}에 적용할 수 없는 마법카드가 있습니다.`);
}
export async function readPvpMagicPresets(env, userId) {
  await ensurePvpMagicPresets(env);
  const [saved, legacy, active] = await Promise.all([
    env.DB.prepare('SELECT preset_no,magic_card_ids FROM pvp_magic_presets WHERE user_id=?').bind(userId).all(),
    env.DB.prepare("SELECT slot_no,magic_card_id FROM magic_card_loadouts WHERE user_id=? AND deck_type='PVP' ORDER BY slot_no").bind(userId).all(),
    env.DB.prepare('SELECT preset_no FROM pvp_active_presets WHERE user_id=?').bind(userId).first()
  ]);
  const previous = [0, 0, 0, 0, 0];
  for (const row of legacy.results) if (Number(row.slot_no) >= 1 && Number(row.slot_no) <= 5) previous[Number(row.slot_no) - 1] = Number(row.magic_card_id || 0);
  // Existing users keep their previous loadout in every preset until explicitly edited.
  const magicPresets = { 1: [...previous], 2: [...previous], 3: [...previous] };
  for (const row of saved.results) if ([1, 2, 3].includes(Number(row.preset_no))) magicPresets[Number(row.preset_no)] = storedMagicSlots(row.magic_card_ids);
  return { magicPresets, activePreset: [1, 2, 3].includes(Number(active?.preset_no)) ? Number(active.preset_no) : 1 };
}
export function magicLoadoutWrites(env, userId, deckType, slots, { onlyIfActivePreset } = {}) {
  return slots.map((id, index) => {
    const guard = onlyIfActivePreset == null ? '' : ' WHERE COALESCE((SELECT preset_no FROM pvp_active_presets WHERE user_id=?),1)=?';
    return env.DB.prepare(`INSERT INTO magic_card_loadouts(user_id,deck_type,slot_no,magic_card_id,updated_at) SELECT ?,?,?,?,CURRENT_TIMESTAMP${guard} ON CONFLICT(user_id,deck_type,slot_no) DO UPDATE SET magic_card_id=excluded.magic_card_id,updated_at=CURRENT_TIMESTAMP`).bind(userId, deckType, index + 1, id, ...(onlyIfActivePreset == null ? [] : [userId, onlyIfActivePreset]));
  });
}
export function pvpMagicPresetWrites(env, userId, presetNo, slots, previous) {
  return [
    ...[1, 2, 3].map(no => env.DB.prepare('INSERT INTO pvp_magic_presets(user_id,preset_no,magic_card_ids) VALUES(?,?,?) ON CONFLICT(user_id,preset_no) DO NOTHING').bind(userId, no, JSON.stringify(previous[no]))),
    env.DB.prepare('INSERT INTO pvp_magic_presets(user_id,preset_no,magic_card_ids,updated_at) VALUES(?,?,?,CURRENT_TIMESTAMP) ON CONFLICT(user_id,preset_no) DO UPDATE SET magic_card_ids=excluded.magic_card_ids,updated_at=CURRENT_TIMESTAMP').bind(userId, presetNo, JSON.stringify(slots)),
    // Retain the existing PVP loadout contract for territory/clan/legacy clients.
    ...magicLoadoutWrites(env, userId, 'PVP', slots, { onlyIfActivePreset: presetNo })
  ];
}
export async function savePvpDeckWithMagic(env, userId, presetNo, cardIds, magicCardIds) {
  presetNo = magicPresetNo(presetNo);
  const state = await readPvpMagicPresets(env, userId);
  const slots = normalizeMagicSlots(magicCardIds === undefined ? state.magicPresets[presetNo] : magicCardIds);
  await validateMagicSlots(env, userId, slots, 'PVP');
  const writes = [
    env.DB.prepare('INSERT INTO pvp_deck_presets(user_id,preset_no,card_ids,updated_at) VALUES(?,?,?,CURRENT_TIMESTAMP) ON CONFLICT(user_id,preset_no) DO UPDATE SET card_ids=excluded.card_ids,updated_at=CURRENT_TIMESTAMP').bind(userId, presetNo, JSON.stringify(cardIds)),
    env.DB.prepare('INSERT INTO pvp_active_presets(user_id,preset_no,updated_at) VALUES(?,?,CURRENT_TIMESTAMP) ON CONFLICT(user_id) DO UPDATE SET preset_no=excluded.preset_no,updated_at=CURRENT_TIMESTAMP').bind(userId, presetNo)
  ];
  if (presetNo === 1) writes.push(env.DB.prepare('INSERT INTO pvp_decks(user_id,card_ids,updated_at) VALUES(?,?,CURRENT_TIMESTAMP) ON CONFLICT(user_id) DO UPDATE SET card_ids=excluded.card_ids,updated_at=CURRENT_TIMESTAMP').bind(userId, JSON.stringify(cardIds)));
  writes.push(...pvpMagicPresetWrites(env, userId, presetNo, slots, state.magicPresets));
  await env.DB.batch(writes);
  return slots;
}
