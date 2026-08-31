const ITEM_CODE = 'BLACK_MIRACLE_PACK';
const SETTINGS_KEY = 'black_miracle_pack_settings_v1485';
const IMAGE = 'assets/ui/packs/black-miracle-pack-v1485-768.jpg';
const MIN_POWER_RATE_PERCENT = 0.01;
const MAX_POWER_RATE_PERCENT = 0.1;
// 2026-08-31 OWNER release instruction: Black Miracle inventory opening is live.
// CMS remains the operational switch so an OWNER can pause opening without
// affecting drops or already-owned quantities.
const BLACK_MIRACLE_INVENTORY_USE_RELEASE_ENABLED = true;
const POWER_GROUP_DEFAULTS = { enabled: true, mode: 'AUTO', minRatePercent: MIN_POWER_RATE_PERCENT, maxRatePercent: MAX_POWER_RATE_PERCENT, curve: 'LINEAR', powerFloor: 0, powerCeiling: 0, maxItems: 0, overrides: {} };
const DEFAULTS = {
  // Opening must fail closed. Drops and owned quantities are controlled separately.
  enabled: false, name: '블랙 미라클 팩', image: IMAGE,
  sources: {
    PVE: { enabled: true, rate: 0.01, quantity: 1 }, PVE_AUTO: { enabled: true, rate: 0.005, quantity: 1 },
    PVP: { enabled: true, rate: 0.01, quantity: 1 }, TOWER: { enabled: true, rate: 0.05, quantity: 1 },
    RAID: { enabled: true, rate: 0.1, quantity: 1 }, RIFT: { enabled: true, rate: 0.1, quantity: 1 },
    CAPTAIN: { enabled: true, rate: 0.02, quantity: 1 },
  },
  rewards: {
    MYTHIC_EQUIPMENT: { rate: 25 }, MYTHIC_VEHICLE: { rate: 15 },
    MASTER_STAR: { rate: 35, min: 50, max: 100 }, COIN: { rate: 25, min: 1_000_000, max: 1_000_000 },
  },
  powerRewards: { enabled: true, maxTotalRatePercent: 5, equipment: POWER_GROUP_DEFAULTS, vehicle: POWER_GROUP_DEFAULTS },
  presentation: { cardCount: 5 }, fallbackMasterStars: 100,
};
let ready = null;
const number = (value, min, max, fallback = 0) => { const parsed = Number(value); return Math.max(min, Math.min(max, Number.isFinite(parsed) ? parsed : fallback)); };
const integer = (value, min, max, fallback = 0) => Math.floor(number(value, min, max, fallback));
const bool = (value, fallback = true) => { if (value === undefined || value === null || value === '') return fallback; if (value === true || value === 1) return true; return ['1', 'true', 'on'].includes(String(value).trim().toLowerCase()); };
const parse = (value, fallback) => { try { return JSON.parse(value) || fallback; } catch { return fallback; } };
const roundedRate = (value) => Number(Math.max(0, Number(value) || 0).toFixed(8));
const randomUnit = (random = Math.random) => { let value = 0; try { value = Number(typeof random === 'function' ? random() : random); } catch { value = 0; } if (!Number.isFinite(value)) value = 0; return Math.max(0, Math.min(1 - Number.EPSILON, value)); };

function cleanPowerGroup(raw = {}) {
  const firstRate = number(raw.minRatePercent, MIN_POWER_RATE_PERCENT, MAX_POWER_RATE_PERCENT, MIN_POWER_RATE_PERCENT);
  const secondRate = number(raw.maxRatePercent, MIN_POWER_RATE_PERCENT, MAX_POWER_RATE_PERCENT, MAX_POWER_RATE_PERCENT);
  const modeValue = String(raw.mode || POWER_GROUP_DEFAULTS.mode).trim().toUpperCase();
  const curveValue = String(raw.curve || POWER_GROUP_DEFAULTS.curve).trim().toUpperCase();
  const overrides = {};
  if (raw.overrides && typeof raw.overrides === 'object' && !Array.isArray(raw.overrides)) {
    for (const [rawId, rawOverride] of Object.entries(raw.overrides)) {
      const id = String(rawId || '').trim().slice(0, 120);
      if (!id || !rawOverride || typeof rawOverride !== 'object') continue;
      const override = { enabled: bool(rawOverride.enabled, true) };
      const suppliedRate = rawOverride.ratePercent ?? rawOverride.rate;
      if (suppliedRate !== undefined && suppliedRate !== null && suppliedRate !== '') override.rate = number(suppliedRate, MIN_POWER_RATE_PERCENT, MAX_POWER_RATE_PERCENT, MIN_POWER_RATE_PERCENT);
      overrides[id] = override;
    }
  }
  return {
    enabled: bool(raw.enabled, true), mode: ['AUTO', 'HYBRID', 'MANUAL'].includes(modeValue) ? modeValue : 'AUTO',
    minRatePercent: Math.min(firstRate, secondRate), maxRatePercent: Math.max(firstRate, secondRate),
    curve: ['LINEAR', 'EASE_IN', 'EASE_OUT'].includes(curveValue) ? curveValue : 'LINEAR',
    powerFloor: integer(raw.powerFloor, 0, 1_000_000_000, 0), powerCeiling: integer(raw.powerCeiling, 0, 1_000_000_000, 0),
    maxItems: integer(raw.maxItems, 0, 10_000, 0), overrides,
  };
}

export function cleanBlackMiracleSettings(raw = {}) {
  const sources = {};
  for (const [key, base] of Object.entries(DEFAULTS.sources)) { const value = raw.sources?.[key] || {}; sources[key] = { enabled: bool(value.enabled, base.enabled), rate: number(value.rate, 0, 100, base.rate), quantity: integer(value.quantity, 1, 10, base.quantity) }; }
  const rewards = {};
  for (const [key, base] of Object.entries(DEFAULTS.rewards)) {
    const value = raw.rewards?.[key] || {}; rewards[key] = { rate: number(value.rate, 0, 100, base.rate) };
    if (key === 'MASTER_STAR' || key === 'COIN') { rewards[key].min = integer(value.min, 1, 100_000_000, base.min); rewards[key].max = integer(value.max, rewards[key].min, 100_000_000, base.max); }
  }
  const rawPowerRewards = raw.powerRewards || {};
  return {
    enabled: BLACK_MIRACLE_INVENTORY_USE_RELEASE_ENABLED && bool(raw.enabled, DEFAULTS.enabled), name: String(raw.name || DEFAULTS.name).trim().slice(0, 80), image: String(raw.image || IMAGE).trim().slice(0, 500),
    sources, rewards,
    powerRewards: {
      // Missing v1485 powerRewards migrates to AUTO. Only explicit false restores legacy 25% / 15% categories.
      enabled: bool(rawPowerRewards.enabled, true), maxTotalRatePercent: number(rawPowerRewards.maxTotalRatePercent, MIN_POWER_RATE_PERCENT, 100, 5),
      equipment: cleanPowerGroup(rawPowerRewards.equipment || {}), vehicle: cleanPowerGroup(rawPowerRewards.vehicle || {}),
    },
    presentation: { cardCount: integer(raw.presentation?.cardCount ?? raw.cardCount, 3, 7, 5) },
    fallbackMasterStars: integer(raw.fallbackMasterStars, 1, 1_000_000, 100),
  };
}

export function blackMiraclePowerRate(totalPower, powerFloor, powerCeiling, minRatePercent = MIN_POWER_RATE_PERCENT, maxRatePercent = MAX_POWER_RATE_PERCENT, curve = 'LINEAR') {
  const firstRate = number(minRatePercent, MIN_POWER_RATE_PERCENT, MAX_POWER_RATE_PERCENT, MIN_POWER_RATE_PERCENT);
  const secondRate = number(maxRatePercent, MIN_POWER_RATE_PERCENT, MAX_POWER_RATE_PERCENT, MAX_POWER_RATE_PERCENT);
  const lowRate = Math.min(firstRate, secondRate); const highRate = Math.max(firstRate, secondRate);
  const floor = Math.max(0, Number(powerFloor) || 0); const ceiling = Math.max(floor, Number(powerCeiling) || floor);
  if (ceiling <= floor) return roundedRate(highRate);
  const ratio = number((Number(totalPower || 0) - floor) / (ceiling - floor), 0, 1, 0); const curveName = String(curve || 'LINEAR').toUpperCase();
  const curvedRatio = curveName === 'EASE_IN' ? ratio * ratio : curveName === 'EASE_OUT' ? 1 - ((1 - ratio) * (1 - ratio)) : ratio;
  return roundedRate(highRate - ((highRate - lowRate) * curvedRatio));
}

function powerRow(row, type) {
  if (!row || typeof row !== 'object') return null;
  const active = row.is_active ?? row.isActive; const isPublic = row.is_public ?? row.isPublic;
  if (active !== undefined && !bool(active, false)) return null; if (isPublic !== undefined && !bool(isPublic, false)) return null;
  const rarity = String(row.rarity || '').trim().toUpperCase(); if (rarity && rarity !== 'MYTHIC') return null;
  const numericId = Number(row.id); const id = Number.isFinite(numericId) ? numericId : String(row.id || '').trim(); if (id === '') return null;
  return {
    id, code: String(row.code || ''), type: String(type || row.type || 'EQUIPMENT').toUpperCase() === 'VEHICLE' ? 'VEHICLE' : 'EQUIPMENT',
    name: String(row.name || ''), image: String(row.image_url ?? row.image ?? ''), rarity: rarity || 'MYTHIC', slot: String(row.slot || ''),
    totalPower: integer(row.total_power ?? row.totalPower, 0, 1_000_000_000, 0), pvePower: integer(row.pve_power ?? row.pvePower, 0, 1_000_000_000, 0), pvpPower: integer(row.pvp_power ?? row.pvpPower, 0, 1_000_000_000, 0),
  };
}
function comparePowerEntries(left, right) { if (right.totalPower !== left.totalPower) return right.totalPower - left.totalPower; const a = Number(left.id); const b = Number(right.id); if (Number.isFinite(a) && Number.isFinite(b) && a !== b) return a - b; return String(left.id).localeCompare(String(right.id)); }

export function buildBlackMiraclePowerPool(rows = [], config = {}, type = 'EQUIPMENT') {
  const settings = cleanPowerGroup(config || {}); if (!settings.enabled) return [];
  const candidates = (Array.isArray(rows) ? rows : []).map((row) => powerRow(row, type)).filter(Boolean).sort(comparePowerEntries); if (!candidates.length) return [];
  const autoFloor = Math.min(...candidates.map((entry) => entry.totalPower)); const autoCeiling = Math.max(...candidates.map((entry) => entry.totalPower));
  const floor = settings.powerFloor > 0 ? settings.powerFloor : autoFloor; const ceiling = settings.powerCeiling > 0 ? Math.max(floor, settings.powerCeiling) : Math.max(floor, autoCeiling);
  const selected = [];
  for (const entry of candidates) {
    const override = settings.overrides[String(entry.id)] || settings.overrides[entry.code];
    if (override?.enabled === false || (settings.mode === 'MANUAL' && !override)) continue;
    const automaticRate = blackMiraclePowerRate(entry.totalPower, floor, ceiling, settings.minRatePercent, settings.maxRatePercent, settings.curve);
    selected.push({ ...entry, dropRatePercent: roundedRate(override?.rate === undefined ? automaticRate : override.rate), automaticRatePercent: automaticRate, overridden: override?.rate !== undefined });
  }
  return settings.maxItems > 0 ? selected.slice(0, settings.maxItems) : selected;
}

function legacyOutcome(settings, unit) { const rows = Object.entries(settings.rewards).map(([type, value]) => ({ type, rate: Math.max(0, Number(value.rate) || 0) })); const total = rows.reduce((sum, row) => sum + row.rate, 0); if (total <= 0) return { type: 'MASTER_STAR' }; let position = unit * total; for (const row of rows) { if (position < row.rate) return { type: row.type }; position -= row.rate; } return { type: rows[rows.length - 1].type }; }
export function rollBlackMiracleOutcome(settings, powerPool = [], random = Math.random) {
  const cleanSettings = cleanBlackMiracleSettings(settings || {}); const unit = randomUnit(random); if (!cleanSettings.powerRewards.enabled) return legacyOutcome(cleanSettings, unit);
  const validPool = []; let remainingBudget = cleanSettings.powerRewards.maxTotalRatePercent;
  for (const item of (Array.isArray(powerPool) ? powerPool : [])) {
    const rawRate = Number(item?.dropRatePercent ?? item?.dropRate ?? item?.rate); if (!Number.isFinite(rawRate) || rawRate <= 0 || remainingBudget < MIN_POWER_RATE_PERCENT) continue;
    const configuredRate = number(rawRate, MIN_POWER_RATE_PERCENT, MAX_POWER_RATE_PERCENT, MIN_POWER_RATE_PERCENT);
    const effectiveRate = roundedRate(Math.min(configuredRate, remainingBudget)); if (effectiveRate < MIN_POWER_RATE_PERCENT) continue;
    validPool.push({ item, rate: effectiveRate }); remainingBudget = roundedRate(remainingBudget - effectiveRate);
  }
  let rareBoundary = 0;
  for (const entry of validPool) { const item = entry.item; const nextBoundary = Math.min(1, rareBoundary + (entry.rate / 100)); if (unit >= rareBoundary && unit < nextBoundary) return { type: item.type === 'VEHICLE' ? 'VEHICLE' : 'EQUIPMENT', item: { ...item, dropRatePercent: entry.rate } }; rareBoundary = nextBoundary; }
  const starWeight = Math.max(0, Number(cleanSettings.rewards.MASTER_STAR.rate) || 0); const coinWeight = Math.max(0, Number(cleanSettings.rewards.COIN.rate) || 0); const fillerTotal = starWeight + coinWeight;
  if (fillerTotal <= 0 || coinWeight <= 0) return { type: 'MASTER_STAR' }; if (starWeight <= 0) return { type: 'COIN' };
  const fillerUnit = rareBoundary >= 1 ? 0 : number((unit - rareBoundary) / (1 - rareBoundary), 0, 1, 0); return { type: fillerUnit < (starWeight / fillerTotal) ? 'MASTER_STAR' : 'COIN' };
}

async function ensure(env) {
  if (ready) return ready;
  ready = (async () => {
    const postgres = env.DB?.dialect === 'postgres';
    const userIdType = postgres ? 'BIGINT' : 'INTEGER';
    const nowDefault = postgres ? "to_char(timezone('UTC',CURRENT_TIMESTAMP),'YYYY-MM-DD HH24:MI:SS')" : 'CURRENT_TIMESTAMP';
    const schema = [
      `CREATE TABLE IF NOT EXISTS black_miracle_pack_drop_receipts(user_id ${userIdType} NOT NULL,source_type TEXT NOT NULL,reference_id TEXT NOT NULL,status TEXT NOT NULL DEFAULT 'MISSED',quantity INTEGER NOT NULL DEFAULT 0,created_at TEXT NOT NULL DEFAULT ${nowDefault},PRIMARY KEY(user_id,source_type,reference_id))`,
      `CREATE TABLE IF NOT EXISTS black_miracle_pack_open_receipts(request_id TEXT PRIMARY KEY,user_id ${userIdType} NOT NULL,status TEXT NOT NULL DEFAULT 'PENDING',response_json TEXT,error_message TEXT,created_at TEXT NOT NULL DEFAULT ${nowDefault},updated_at TEXT NOT NULL DEFAULT ${nowDefault})`,
    ];
    // PostgreSQL compatibility intentionally ignores DDL in prepare()/batch(); fixed schema goes through its safe path.
    if (postgres && typeof env.DB.execSchema === 'function') await env.DB.execSchema(schema);
    const statements = postgres ? [] : schema.map((sql) => env.DB.prepare(sql));
    statements.push(env.DB.prepare(`INSERT INTO inventory_items(code,name,subtitle,description,category,rarity,image_url,sort_order,is_active) VALUES(?,?,?,?,?,?,?,?,1) ON CONFLICT(code) DO UPDATE SET name=excluded.name,subtitle=excluded.subtitle,description=excluded.description,category=excluded.category,rarity=excluded.rarity,image_url=excluded.image_url,is_active=1,updated_at=CURRENT_TIMESTAMP`).bind(ITEM_CODE, DEFAULTS.name, 'MYTHIC JACKPOT', '전투력 기반 초희귀 신화 장비·이동수단 또는 마스터의 별·코인 중 하나를 획득합니다.', 'JACKPOT', 'MYTHIC', IMAGE, 8));
    await env.DB.batch(statements);
    return true;
  })().catch((error) => { ready = null; throw error; }); return ready;
}
export async function blackMiracleSettings(env, { fresh = false } = {}) { void fresh; await ensure(env); const row = await env.DB.prepare('SELECT value FROM app_meta WHERE key=?').bind(SETTINGS_KEY).first(); const settings = cleanBlackMiracleSettings(parse(row?.value, DEFAULTS)); return { ...settings, enabled: BLACK_MIRACLE_INVENTORY_USE_RELEASE_ENABLED && settings.enabled }; }
export async function saveBlackMiracleSettings(env, raw) { const settings = cleanBlackMiracleSettings(raw); const total = Object.values(settings.rewards).reduce((sum, value) => sum + value.rate, 0); const fillerTotal = settings.rewards.MASTER_STAR.rate + settings.rewards.COIN.rate; if (!settings.powerRewards.enabled && Math.abs(total - 100) > 0.0001) throw new Error(`LEGACY 팩 내부 보상 확률 합계는 100%여야 합니다. 현재 ${total}%입니다.`); if (settings.powerRewards.enabled && fillerTotal <= 0) throw new Error('AUTO 모드의 실패 보상은 마스터의 별 또는 코인 가중치가 1개 이상 필요합니다.'); await ensure(env); await env.DB.batch([env.DB.prepare(`INSERT INTO app_meta(key,value,updated_at) VALUES(?,?,CURRENT_TIMESTAMP) ON CONFLICT(key) DO UPDATE SET value=excluded.value,updated_at=CURRENT_TIMESTAMP`).bind(SETTINGS_KEY, JSON.stringify(settings)), env.DB.prepare('UPDATE inventory_items SET name=?,image_url=?,is_active=1,updated_at=CURRENT_TIMESTAMP WHERE code=?').bind(settings.name, settings.image, ITEM_CODE)]); return settings; }

function capPowerPool(entries, maxTotalRatePercent) {
  const configured = [...entries].sort((left, right) => { const byPower = comparePowerEntries(left, right); return byPower !== 0 ? byPower : String(left.type).localeCompare(String(right.type)); });
  const budget = number(maxTotalRatePercent, MIN_POWER_RATE_PERCENT, 100, 5);
  const configuredTotalRareRatePercent = roundedRate(configured.reduce((sum, entry) => sum + Number(entry.dropRatePercent || 0), 0));
  const pool = []; let remainingBudget = budget;
  for (const entry of configured) {
    if (remainingBudget < MIN_POWER_RATE_PERCENT) break;
    const configuredRate = number(entry.dropRatePercent, MIN_POWER_RATE_PERCENT, MAX_POWER_RATE_PERCENT, MIN_POWER_RATE_PERCENT);
    const effectiveRate = roundedRate(Math.min(configuredRate, remainingBudget)); if (effectiveRate < MIN_POWER_RATE_PERCENT) break;
    pool.push({ ...entry, dropRatePercent: effectiveRate }); remainingBudget = roundedRate(remainingBudget - effectiveRate);
  }
  const totalRareRatePercent = roundedRate(pool.reduce((sum, entry) => sum + entry.dropRatePercent, 0));
  return { pool, totalRareRatePercent, configuredTotalRareRatePercent, rateScale: 1, excludedByCap: Math.max(0, configured.length - pool.length) };
}

async function blackMiraclePowerCatalog(env, settings) {
  const [equipmentResult, vehicleResult] = await Promise.all([
    env.DB.prepare(`SELECT id,code,name,slot,rarity,image_url,total_power,pve_power,pvp_power,is_active,is_public,sort_order FROM character_equipment_items WHERE is_active=1 AND is_public=1 AND UPPER(rarity)='MYTHIC' ORDER BY total_power DESC,id ASC`).all(),
    env.DB.prepare(`SELECT id,code,name,rarity,image_url,total_power,pve_power,pvp_power,is_active,is_public,sort_order FROM character_garage_items WHERE is_active=1 AND is_public=1 AND UPPER(rarity)='MYTHIC' ORDER BY total_power DESC,id ASC`).all(),
  ]);
  const equipmentRows = equipmentResult.results || []; const vehicleRows = vehicleResult.results || [];
  const configuredEquipment = buildBlackMiraclePowerPool(equipmentRows, settings.powerRewards.equipment, 'EQUIPMENT'); const configuredVehicles = buildBlackMiraclePowerPool(vehicleRows, settings.powerRewards.vehicle, 'VEHICLE');
  const capped = capPowerPool([...configuredEquipment, ...configuredVehicles], settings.powerRewards.maxTotalRatePercent);
  const configuredMap = new Map([...configuredEquipment, ...configuredVehicles].map((entry) => [`${entry.type}:${entry.id}`, entry])); const effectiveMap = new Map(capped.pool.map((entry) => [`${entry.type}:${entry.id}`, entry]));
  const decorate = (rows, group, type) => buildBlackMiraclePowerPool(rows, { ...group, enabled: true, mode: 'AUTO', maxItems: 0, overrides: {} }, type).map((entry) => { const key = `${type}:${entry.id}`; const configuredEntry = configuredMap.get(key); const effectiveEntry = effectiveMap.get(key); const override = group.overrides[String(entry.id)] || group.overrides[entry.code]; return { ...entry, enabled: override?.enabled !== false, selected: Boolean(configuredEntry), included: Boolean(effectiveEntry), overrideRatePercent: override?.rate ?? null, configuredDropRatePercent: configuredEntry?.dropRatePercent ?? entry.dropRatePercent, dropRatePercent: effectiveEntry?.dropRatePercent ?? 0 }; });
  return { equipment: decorate(equipmentRows, settings.powerRewards.equipment, 'EQUIPMENT'), vehicle: decorate(vehicleRows, settings.powerRewards.vehicle, 'VEHICLE'), pool: capped.pool, totalRareRatePercent: settings.powerRewards.enabled ? capped.totalRareRatePercent : 0, previewTotalRareRatePercent: capped.totalRareRatePercent, configuredTotalRareRatePercent: capped.configuredTotalRareRatePercent, rateScale: capped.rateScale, excludedByCap: capped.excludedByCap, maxTotalRatePercent: settings.powerRewards.maxTotalRatePercent };
}

export async function rollBlackMiracleDrop(env, { userId, source, referenceId }) {
  const settings = await blackMiracleSettings(env); const type = String(source || '').toUpperCase(); const rule = settings.sources[type]; const ref = String(referenceId || '').slice(0, 160); if (!rule?.enabled || !ref) return null;
  const prior = await env.DB.prepare(`SELECT status,quantity FROM black_miracle_pack_drop_receipts WHERE user_id=? AND source_type=? AND reference_id=?`).bind(userId, type, ref).first();
  if (prior && prior.status !== 'PENDING') return prior.status === 'GRANTED' ? { itemCode: ITEM_CODE, name: settings.name, image: settings.image, quantity: Number(prior.quantity), reused: true } : null;
  const won = Math.random() * 100 < rule.rate; const quantity = won ? rule.quantity : 0;
  const results = await env.DB.batch([
    env.DB.prepare(`INSERT OR IGNORE INTO black_miracle_pack_drop_receipts(user_id,source_type,reference_id,status,quantity) VALUES(?,?,?,'PENDING',?)`).bind(userId, type, ref, quantity),
    env.DB.prepare(`INSERT INTO cnine_user_inventory(user_id,item_code,quantity,unseen_quantity,created_at,updated_at) SELECT ?,?,r.quantity,r.quantity,CURRENT_TIMESTAMP,CURRENT_TIMESTAMP FROM black_miracle_pack_drop_receipts r WHERE r.user_id=? AND r.source_type=? AND r.reference_id=? AND r.status='PENDING' AND r.quantity>0 ON CONFLICT(user_id,item_code) DO UPDATE SET quantity=cnine_user_inventory.quantity+excluded.quantity,unseen_quantity=cnine_user_inventory.unseen_quantity+excluded.unseen_quantity,updated_at=CURRENT_TIMESTAMP`).bind(userId, ITEM_CODE, userId, type, ref),
    env.DB.prepare(`INSERT INTO inventory_logs(user_id,item_code,change_amount,balance_after,reason,reference_type,reference_id) SELECT ?,?,r.quantity,i.quantity,'CONTENT_DROP',?,? FROM cnine_user_inventory i JOIN black_miracle_pack_drop_receipts r ON r.user_id=? AND r.source_type=? AND r.reference_id=? AND r.status='PENDING' AND r.quantity>0 WHERE i.user_id=? AND i.item_code=?`).bind(userId, ITEM_CODE, type, ref, userId, type, ref, userId, ITEM_CODE),
    env.DB.prepare(`UPDATE black_miracle_pack_drop_receipts SET status='GRANTED' WHERE user_id=? AND source_type=? AND reference_id=? AND status='PENDING' AND quantity>0`).bind(userId, type, ref),
    env.DB.prepare(`UPDATE black_miracle_pack_drop_receipts SET status='MISSED' WHERE user_id=? AND source_type=? AND reference_id=? AND status='PENDING'`).bind(userId, type, ref),
  ]);
  const inserted = Number(results?.[0]?.meta?.changes || 0); const receipt = await env.DB.prepare(`SELECT status,quantity FROM black_miracle_pack_drop_receipts WHERE user_id=? AND source_type=? AND reference_id=?`).bind(userId, type, ref).first(); if (receipt?.status !== 'GRANTED') return null;
  return { itemCode: ITEM_CODE, name: settings.name, image: settings.image, quantity: Number(receipt.quantity), reused: inserted !== 1 };
}

function rewardItem(entry, dropRatePercent) { const dropRate = roundedRate(dropRatePercent); return { id: entry.id, code: entry.code || '', name: entry.name || '', image: entry.image || '', rarity: entry.rarity || 'MYTHIC', slot: entry.slot || '', slotLabel: entry.slot || '', total: Number(entry.totalPower || 0), pve: Number(entry.pvePower || 0), pvp: Number(entry.pvpPower || 0), totalPower: Number(entry.totalPower || 0), pvePower: Number(entry.pvePower || 0), pvpPower: Number(entry.pvpPower || 0), dropRate, dropRatePercent: dropRate }; }
function amountBetween(rule) { return integer(Math.random() * (rule.max - rule.min + 1) + rule.min, rule.min, rule.max, rule.min); }
function randomEntry(entries) { return entries.length ? entries[Math.min(entries.length - 1, Math.floor(randomUnit(Math.random) * entries.length))] : null; }
function fillerReward(settings, type, fixedAmount = 0) { if (type === 'COIN') return { type: 'COIN', label: '코인', amount: fixedAmount || amountBetween(settings.rewards.COIN) }; return { type: 'MASTER_STAR', label: '마스터의 별', amount: fixedAmount || amountBetween(settings.rewards.MASTER_STAR) }; }

async function chooseOpenReward(env, settings, catalog, userId) {
  const ownedVehicles = await env.DB.prepare('SELECT garage_id FROM user_garage_vehicles WHERE user_id=?').bind(userId).all(); const ownedVehicleIds = new Set((ownedVehicles.results || []).map((row) => String(row.garage_id)));
  const itemReward = (type, selected, rate) => { const item = rewardItem(selected, rate); return { type, label: type === 'MYTHIC_VEHICLE' ? '신화 이동수단' : '신화 장비', item, total: item.total, pve: item.pve, pvp: item.pvp, totalPower: item.totalPower, pvePower: item.pvePower, pvpPower: item.pvpPower, dropRate: item.dropRate }; };
  if (settings.powerRewards.enabled) {
    const outcome = rollBlackMiracleOutcome(settings, catalog.pool.filter((entry) => entry.type !== 'VEHICLE' || !ownedVehicleIds.has(String(entry.id))), Math.random);
    if (outcome.type === 'EQUIPMENT' || outcome.type === 'VEHICLE') return itemReward(outcome.type === 'VEHICLE' ? 'MYTHIC_VEHICLE' : 'MYTHIC_EQUIPMENT', outcome.item, outcome.item.dropRatePercent);
    return fillerReward(settings, outcome.type);
  }
  const outcome = rollBlackMiracleOutcome(settings, [], Math.random);
  if (outcome.type === 'MYTHIC_EQUIPMENT') { const candidates = catalog.equipment; const selected = randomEntry(candidates); if (selected) return itemReward('MYTHIC_EQUIPMENT', selected, settings.rewards.MYTHIC_EQUIPMENT.rate / candidates.length); }
  if (outcome.type === 'MYTHIC_VEHICLE') { const candidates = catalog.vehicle.filter((entry) => !ownedVehicleIds.has(String(entry.id))); const selected = randomEntry(candidates); if (selected) return itemReward('MYTHIC_VEHICLE', selected, settings.rewards.MYTHIC_VEHICLE.rate / candidates.length); }
  if (outcome.type === 'COIN') return fillerReward(settings, 'COIN'); if (outcome.type === 'MASTER_STAR') return fillerReward(settings, 'MASTER_STAR'); return fillerReward(settings, 'MASTER_STAR', settings.fallbackMasterStars);
}
function openGuardSql(status = 'CLAIMED') { const safeStatus = status === 'REWARDED' ? 'REWARDED' : 'CLAIMED'; return `EXISTS(SELECT 1 FROM black_miracle_pack_open_receipts r WHERE r.request_id=? AND r.user_id=? AND r.status='${safeStatus}') AND EXISTS(SELECT 1 FROM cnine_user_inventory p WHERE p.user_id=? AND p.item_code=? AND p.quantity=?)`; }
function openGuardBindings(requestId, userId, remaining) { return [requestId, userId, userId, ITEM_CODE, remaining]; }

export async function openBlackMiraclePack(env, { userId, requestId }) {
  await ensure(env); const safeRequestId = String(requestId || '').trim().slice(0, 160); if (!safeRequestId) throw new Error('개봉 요청 식별값이 없습니다.');
  const prior = await env.DB.prepare(`SELECT status,response_json,error_message FROM black_miracle_pack_open_receipts WHERE request_id=? AND user_id=?`).bind(safeRequestId, userId).first(); if (prior?.status === 'COMPLETED') return parse(prior.response_json, null); if (prior?.status === 'FAILED') throw new Error(prior.error_message || '이미 실패한 개봉 요청입니다.');
  const settings = await blackMiracleSettings(env); if (!BLACK_MIRACLE_INVENTORY_USE_RELEASE_ENABLED || settings.enabled !== true) throw new Error('현재 블랙 미라클 팩 사용이 중지되어 있습니다. 드랍 및 보유 수량은 유지됩니다.');
  const [catalog, packRow] = await Promise.all([blackMiraclePowerCatalog(env, settings), env.DB.prepare('SELECT quantity FROM cnine_user_inventory WHERE user_id=? AND item_code=?').bind(userId, ITEM_CODE).first()]);
  const balanceBefore = Number(packRow?.quantity || 0); if (balanceBefore <= 0) throw new Error('보유한 블랙 미라클 팩이 없습니다.'); const remaining = balanceBefore - 1; const reward = await chooseOpenReward(env, settings, catalog, userId);
  const response = { ok: true, itemCode: ITEM_CODE, remaining, reward, requestId: safeRequestId, cardCount: settings.presentation.cardCount, presentation: { cardCount: settings.presentation.cardCount } }; const responseJson = JSON.stringify(response); const itemReward = reward.type === 'MYTHIC_EQUIPMENT' || reward.type === 'MYTHIC_VEHICLE'; const completionStatus = itemReward ? 'REWARDED' : 'CLAIMED'; const claimGuard = openGuardSql('CLAIMED'); const claimGuardBindings = () => openGuardBindings(safeRequestId, userId, balanceBefore); const completionGuard = openGuardSql(completionStatus); const completionGuardBindings = () => openGuardBindings(safeRequestId, userId, remaining);
  const statements = [
    env.DB.prepare(`INSERT OR IGNORE INTO black_miracle_pack_open_receipts(request_id,user_id,status) VALUES(?,?,'PENDING')`).bind(safeRequestId, userId),
    env.DB.prepare(`UPDATE black_miracle_pack_open_receipts SET status='CLAIMED',updated_at=CURRENT_TIMESTAMP WHERE request_id=? AND user_id=? AND status='PENDING' AND EXISTS(SELECT 1 FROM cnine_user_inventory p WHERE p.user_id=? AND p.item_code=? AND p.quantity=?)`).bind(safeRequestId, userId, userId, ITEM_CODE, balanceBefore),
  ];
  let rewardGrantIndex = -1; let rewardVerifyIndex = -1;
  if (reward.type === 'MYTHIC_EQUIPMENT') {
    rewardGrantIndex = statements.length;
    statements.push(env.DB.prepare(`INSERT INTO user_equipment_instances(user_id,equipment_id,source_type,source_id,request_id) SELECT ?,i.id,'BLACK_MIRACLE',?,? FROM character_equipment_items i WHERE i.id=? AND i.is_active=1 AND i.is_public=1 AND UPPER(i.rarity)='MYTHIC' AND ${claimGuard}`).bind(userId, safeRequestId, safeRequestId, reward.item.id, ...claimGuardBindings()));
    rewardVerifyIndex = statements.length;
    statements.push(env.DB.prepare(`UPDATE black_miracle_pack_open_receipts SET status='REWARDED',updated_at=CURRENT_TIMESTAMP WHERE request_id=? AND user_id=? AND status='CLAIMED' AND EXISTS(SELECT 1 FROM user_equipment_instances e WHERE e.user_id=? AND e.equipment_id=? AND e.source_type='BLACK_MIRACLE' AND e.source_id=? AND e.request_id=?)`).bind(safeRequestId, userId, userId, reward.item.id, safeRequestId, safeRequestId));
  } else if (reward.type === 'MYTHIC_VEHICLE') {
    rewardGrantIndex = statements.length;
    statements.push(env.DB.prepare(`INSERT OR IGNORE INTO user_garage_vehicles(user_id,garage_id,source_type,source_id) SELECT ?,g.id,'BLACK_MIRACLE',? FROM character_garage_items g WHERE g.id=? AND g.is_active=1 AND g.is_public=1 AND UPPER(g.rarity)='MYTHIC' AND NOT EXISTS(SELECT 1 FROM user_garage_vehicles u WHERE u.user_id=? AND u.garage_id=g.id) AND ${claimGuard}`).bind(userId, safeRequestId, reward.item.id, userId, ...claimGuardBindings()));
    rewardVerifyIndex = statements.length;
    statements.push(env.DB.prepare(`UPDATE black_miracle_pack_open_receipts SET status='REWARDED',updated_at=CURRENT_TIMESTAMP WHERE request_id=? AND user_id=? AND status='CLAIMED' AND EXISTS(SELECT 1 FROM user_garage_vehicles g WHERE g.user_id=? AND g.garage_id=? AND g.source_type='BLACK_MIRACLE' AND g.source_id=?)`).bind(safeRequestId, userId, userId, reward.item.id, safeRequestId));
  }
  const consumedIndex = statements.length;
  statements.push(env.DB.prepare(`UPDATE cnine_user_inventory SET quantity=quantity-1,unseen_quantity=CASE WHEN unseen_quantity>quantity-1 THEN quantity-1 ELSE unseen_quantity END,updated_at=CURRENT_TIMESTAMP WHERE user_id=? AND item_code=? AND quantity=? AND EXISTS(SELECT 1 FROM black_miracle_pack_open_receipts r WHERE r.request_id=? AND r.user_id=? AND r.status='${completionStatus}')`).bind(userId, ITEM_CODE, balanceBefore, safeRequestId, userId));
  if (reward.type === 'COIN') statements.push(env.DB.prepare(`UPDATE users SET coin=coin+? WHERE id=? AND ${completionGuard}`).bind(reward.amount, userId, ...completionGuardBindings()), env.DB.prepare(`INSERT INTO coin_logs(user_id,change_amount,balance_after,reason) SELECT id,?,coin,'BLACK_MIRACLE_PACK' FROM users WHERE id=? AND ${completionGuard}`).bind(reward.amount, userId, ...completionGuardBindings()));
  else if (reward.type === 'MASTER_STAR') statements.push(
    env.DB.prepare(`INSERT INTO cnine_user_inventory(user_id,item_code,quantity,unseen_quantity,created_at,updated_at) SELECT ?,'MASTER_STAR',?,?,CURRENT_TIMESTAMP,CURRENT_TIMESTAMP WHERE ${completionGuard} ON CONFLICT(user_id,item_code) DO UPDATE SET quantity=cnine_user_inventory.quantity+excluded.quantity,unseen_quantity=cnine_user_inventory.unseen_quantity+excluded.unseen_quantity,updated_at=CURRENT_TIMESTAMP`).bind(userId, reward.amount, reward.amount, ...completionGuardBindings()),
    env.DB.prepare(`INSERT INTO inventory_logs(user_id,item_code,change_amount,balance_after,reason,reference_type,reference_id) SELECT ?,'MASTER_STAR',?,quantity,'BLACK_MIRACLE_REWARD','INVENTORY_USE',? FROM cnine_user_inventory WHERE user_id=? AND item_code='MASTER_STAR' AND ${completionGuard}`).bind(userId, reward.amount, safeRequestId, userId, ...completionGuardBindings()),
  );
  statements.push(
    env.DB.prepare(`INSERT INTO inventory_logs(user_id,item_code,change_amount,balance_after,reason,reference_type,reference_id) SELECT ?,?,-1,?,'BLACK_MIRACLE_OPEN','INVENTORY_USE',? WHERE ${completionGuard}`).bind(userId, ITEM_CODE, remaining, safeRequestId, ...completionGuardBindings()),
    env.DB.prepare(`UPDATE black_miracle_pack_open_receipts SET status='COMPLETED',response_json=?,error_message=NULL,updated_at=CURRENT_TIMESTAMP WHERE request_id=? AND user_id=? AND status='${completionStatus}' AND EXISTS(SELECT 1 FROM cnine_user_inventory p WHERE p.user_id=? AND p.item_code=? AND p.quantity=?)`).bind(responseJson, safeRequestId, userId, userId, ITEM_CODE, remaining),
    env.DB.prepare(`UPDATE black_miracle_pack_open_receipts SET status='FAILED',error_message=CASE WHEN status='CLAIMED' AND ${itemReward ? 1 : 0}=1 THEN '보상을 지급하지 못해 팩을 차감하지 않았습니다.' ELSE '보유 수량이 변경되어 개봉하지 못했습니다.' END,updated_at=CURRENT_TIMESTAMP WHERE request_id=? AND user_id=? AND status IN ('PENDING','CLAIMED','REWARDED')`).bind(safeRequestId, userId),
  );
  const results = await env.DB.batch(statements); const inserted = Number(results?.[0]?.meta?.changes || 0); const claimed = Number(results?.[1]?.meta?.changes || 0); const consumed = Number(results?.[consumedIndex]?.meta?.changes || 0); const rewardGranted = rewardGrantIndex < 0 ? 1 : Number(results?.[rewardGrantIndex]?.meta?.changes || 0); const rewardVerified = rewardVerifyIndex < 0 ? 1 : Number(results?.[rewardVerifyIndex]?.meta?.changes || 0);
  const receipt = await env.DB.prepare(`SELECT user_id,status,response_json,error_message FROM black_miracle_pack_open_receipts WHERE request_id=?`).bind(safeRequestId).first();
  if (receipt?.status === 'COMPLETED' && Number(receipt.user_id) === Number(userId)) return parse(receipt.response_json, response); if (receipt && Number(receipt.user_id) !== Number(userId)) throw new Error('다른 개봉 요청과 중복된 요청 식별값입니다.'); if (inserted !== 1 || claimed !== 1 || rewardGranted !== 1 || rewardVerified !== 1 || consumed !== 1) throw new Error(receipt?.error_message || '같은 개봉 요청을 처리 중입니다.'); throw new Error(receipt?.error_message || '블랙 미라클 팩 개봉을 완료하지 못했습니다.');
}

export async function handleBlackMiracleAdmin({ path, request, env, deps }) {
  if (!path.startsWith('admin/black-miracle-pack')) return null; const user = await deps.authenticate(request, env); if (!user || String(user.role).toUpperCase() !== 'OWNER') return deps.json({ error: '관리자 권한이 필요합니다.' }, 403);
  if (request.method === 'GET') { const settings = await blackMiracleSettings(env); const powerCatalog = await blackMiraclePowerCatalog(env, settings); return deps.json({ settings, powerCatalog, totalRareRatePercent: powerCatalog.totalRareRatePercent, previewTotalRareRatePercent: powerCatalog.previewTotalRareRatePercent }); }
  if (request.method === 'PATCH') { try { const settings = await saveBlackMiracleSettings(env, (await deps.readBody(request)).settings || {}); const powerCatalog = await blackMiraclePowerCatalog(env, settings); return deps.json({ ok: true, settings, powerCatalog, totalRareRatePercent: powerCatalog.totalRareRatePercent, previewTotalRareRatePercent: powerCatalog.previewTotalRareRatePercent }); } catch (error) { return deps.json({ error: error.message }, 400); } }
  return deps.json({ error: '지원하지 않는 요청입니다.' }, 405);
}
export { ITEM_CODE as BLACK_MIRACLE_PACK_CODE };
