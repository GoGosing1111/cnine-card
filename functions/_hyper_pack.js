// Preparation only: mercenary ranks/acquisition must be approved before a grant route exists.
export const HYPER_PACK_PRICE = 500000000;
export const HYPER_PACK_MAX_COUNT = 10;
export const HYPER_PACK_RELEASE_ENABLED = false;
export const HYPER_PACK_SETTINGS_KEY = 'hyper_pack_draft_v2076';
export const HYPER_PACK_REWARDS = Object.freeze(['MISS', 'MASTER_STAR', 'MYSTIC_ENERGY', 'MERCENARY']);
export const HYPER_PACK_MATERIALS = Object.freeze({ MASTER_STAR: 'MASTER_STAR', MYSTIC_ENERGY: 'STARLIGHT_ARMOR_CORE' });
export const HYPER_PACK_IMAGE = 'assets/ui/packs/hyper-pack-v2076.png';

export function hyperPackCatalogRow() {
  return { id: 'hyper', name: '하이퍼팩', subtitle: 'EXTREME HYPER PACK', theme: 'hyper',
    description: '꽝 · 마스터의 별 · 미스틱 에너지 · 용병카드', range: '용병 출시 대비 · 개봉 준비 중',
    price: HYPER_PACK_PRICE, originalPrice: HYPER_PACK_PRICE, burningDiscountPercent: 0,
    allowed: [], guarantee10: null, guarantee20: null, drawMode: 'HYPER_REWARD',
    drawEnabled: false, ownerDrawEnabled: false, maxDrawCount: HYPER_PACK_MAX_COUNT,
    imageUrl: HYPER_PACK_IMAGE, revealMode: 'HYPER_SEQUENCE', releaseStatus: 'PREPARATION_ONLY' };
}

export function arrangeHyperPackCatalog(rows) {
  // Close the old Premium slot, shift Limited/Superstar left, append Hyper.
  const order = ['advanced', 'pickup', 'ultimate', 'superstar'];
  return [...rows.filter(row => !['basic', 'premium', 'hyper'].includes(String(row.id)))
    .sort((a, b) => {
      const rank = row => order.includes(String(row.id)) ? order.indexOf(String(row.id)) : order.length;
      return rank(a) - rank(b);
    }), hyperPackCatalogRow()];
}

export function hyperPackCost(count) {
  if (!Number.isInteger(count) || count < 1 || count > HYPER_PACK_MAX_COUNT) throw new Error('개봉 횟수는 1~10회 정수여야 합니다.');
  return HYPER_PACK_PRICE * count;
}

export function cleanHyperPackDraft(raw = {}) {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) throw new Error('설정 형식이 올바르지 않습니다.');
  if (raw.enabled === true || raw.drawEnabled === true || raw.ownerDrawEnabled === true) throw new Error('용병 등급·획득 승인 전에는 개봉을 활성화할 수 없습니다.');
  const rates = {}, quantities = {};
  for (const kind of HYPER_PACK_REWARDS) {
    const value = raw.rates?.[kind] ?? null;
    if (value !== null && (typeof value !== 'number' || !Number.isFinite(value) || value < 0 || value > 100 || Math.abs(value * 10000 - Math.round(value * 10000)) > 0.000001)) throw new Error('확률은 0~100%, 소수점 네 자리까지 입력하세요.');
    rates[kind] = value;
  }
  if (Object.values(rates).reduce((sum, value) => sum + (value ?? 0), 0) > 100.000001) throw new Error('확률 합계가 100%를 넘을 수 없습니다.');
  for (const kind of ['MASTER_STAR', 'MYSTIC_ENERGY']) {
    const value = raw.quantities?.[kind] ?? null;
    if (value !== null && (!Number.isSafeInteger(value) || value < 1 || value > 1000000)) throw new Error('재료 수량은 1~1,000,000개 정수로 입력하세요.');
    quantities[kind] = value;
  }
  return { rates, quantities };
}

export function hyperPackDraftStatus(settings) {
  const total = HYPER_PACK_REWARDS.reduce((sum, kind) => sum + (settings.rates[kind] ?? 0), 0);
  const complete = HYPER_PACK_REWARDS.every(kind => settings.rates[kind] !== null) && Math.abs(total - 100) < 0.000001
    && ['MASTER_STAR', 'MYSTIC_ENERGY'].every(kind => settings.rates[kind] === 0 || settings.quantities[kind] !== null);
  return { total, complete, drawEnabled: false, releaseEnabled: HYPER_PACK_RELEASE_ENABLED,
    blockers: [...(!complete ? ['REWARD_SETTINGS_INCOMPLETE'] : []), 'MERCENARY_APPROVAL_PENDING', 'ACQUISITION_GRANT_NOT_CONNECTED'] };
}

async function readDraft(env) {
  const row = await env.DB.prepare('SELECT value FROM app_meta WHERE key=?').bind(HYPER_PACK_SETTINGS_KEY).first();
  if (!row) return { settings: cleanHyperPackDraft(), revision: null, storedValue: null };
  const parsed = JSON.parse(row.value);
  return { settings: cleanHyperPackDraft(parsed), revision: parsed.revision || null, storedValue: row.value };
}

export async function handleHyperPack({ path, request, env, deps }) {
  if (!['hyper-pack/config', 'hyper-pack/open', 'admin/hyper-pack'].includes(path)) return null;
  const { json, authenticate, readBody, requirePermission, writeAdminLog } = deps;
  if (path === 'hyper-pack/config' && request.method === 'GET') return json({ pack: hyperPackCatalogRow(), rewardKinds: HYPER_PACK_REWARDS });
  if (path === 'hyper-pack/open' && request.method === 'POST') {
    if (!await authenticate(request, env)) return json({ error: '로그인이 필요합니다.' }, 401);
    const body = await readBody(request);
    try { hyperPackCost(body.count); } catch (error) { return json({ error: error.message, code: 'HYPER_COUNT_INVALID' }, 400); }
    // No currency, receipts, inventory, card grants or owner bypass while preparing.
    return json({ error: '하이퍼팩은 용병 출시 준비 중입니다. 코인은 차감되지 않았습니다.', code: 'HYPER_PACK_NOT_RELEASED' }, 409);
  }
  if (path !== 'admin/hyper-pack') return json({ error: '지원하지 않는 요청입니다.' }, 405);
  const admin = await requirePermission(request, env, 'CARD_EDIT');
  if (!admin) return json({ error: '카드팩 관리 권한이 없습니다.' }, 403);
  if (!['GET', 'PATCH'].includes(request.method)) return json({ error: '지원하지 않는 요청입니다.' }, 405);
  const before = await readDraft(env);
  if (request.method === 'GET') return json({ settings: before.settings, revision: before.revision, pack: hyperPackCatalogRow(), status: hyperPackDraftStatus(before.settings) });
  const origin = request.headers.get('origin');
  if ((origin && origin !== new URL(request.url).origin) || request.headers.get('sec-fetch-site') === 'cross-site') return json({ error: '외부 사이트에서는 설정을 변경할 수 없습니다.' }, 403);
  const body = await readBody(request);
  let settings;
  try { settings = cleanHyperPackDraft(body); } catch (error) { return json({ error: error.message }, 400); }
  if ((body.revision ?? null) !== before.revision) return json({ error: '다른 관리자가 설정을 변경했습니다. 다시 불러오세요.' }, 409);
  const revision = crypto.randomUUID(), value = JSON.stringify({ ...settings, revision });
  const updated = before.storedValue !== null
    ? await env.DB.prepare('UPDATE app_meta SET value=?,updated_at=CURRENT_TIMESTAMP WHERE key=? AND value=?')
      .bind(value, HYPER_PACK_SETTINGS_KEY, before.storedValue).run()
    : await env.DB.prepare('INSERT INTO app_meta(key,value,updated_at) VALUES(?,?,CURRENT_TIMESTAMP) ON CONFLICT(key) DO NOTHING').bind(HYPER_PACK_SETTINGS_KEY, value).run();
  if (Number(updated.meta?.changes) !== 1) return json({ error: '설정이 갱신되었습니다. 다시 불러오세요.' }, 409);
  await writeAdminLog(env, admin, 'HYPER_PACK_DRAFT_UPDATE', 'APP_META', HYPER_PACK_SETTINGS_KEY, before.settings, settings);
  return json({ ok: true, settings, revision, pack: hyperPackCatalogRow(), status: hyperPackDraftStatus(settings) });
}
