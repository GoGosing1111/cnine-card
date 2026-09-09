// A CMS-issued entitlement, not a freely grantable or repeatable loot box.
export const NEW_USER_GIFT_CODE = 'NEW_USER_GIFT_BOX';
export const NEW_USER_GIFT_DAYS = 7;
export const NEW_USER_GIFT_COIN = 10_000_000_000;
export const NEW_USER_GIFT_EQUIPMENT = Object.freeze([
  { code: 'EQ_1785961398598', name: '프라임 배틀슈트', slot: 'TOP', subtype: 'TOP' },
  { code: 'EQ_1785961420255', name: '프라임 배틀레깅스', slot: 'BOTTOM', subtype: 'BOTTOM' },
  { code: 'EQ_1785961440314', name: '프라임 배틀슈즈', slot: 'SHOES', subtype: 'SHOES' },
  { code: 'EQ_1786908918550', name: '프라임 듀얼디스크', slot: 'ACCESSORY', subtype: 'DUAL_DISK' },
  { code: 'EQ_1785961300455', name: '인피니티 M200', slot: 'WEAPON', subtype: 'RIFLE' },
]);
const TABLE = 'new_user_gift_receipts_v1';
const STAMP = "to_char(timezone('UTC',CURRENT_TIMESTAMP),'YYYY-MM-DD HH24:MI:SS')";
export const NEW_USER_GIFT_SCHEMA = `CREATE TABLE IF NOT EXISTS new_user_gift_receipts_v1 (
  user_id BIGINT PRIMARY KEY,
  provider TEXT NOT NULL CHECK(provider IN ('PLAYDK','WAGO')),
  identity_hash TEXT NOT NULL,
  status TEXT NOT NULL CHECK(status IN ('ISSUED','OPENED')),
  issued_by BIGINT NOT NULL,
  issued_at TEXT NOT NULL,
  joined_at TEXT NOT NULL,
  request_id TEXT NOT NULL,
  manifest_json TEXT NOT NULL,
  manifest_hash TEXT NOT NULL,
  opened_at TEXT,
  result_json TEXT,
  UNIQUE(provider,identity_hash)
)`;
// No cascading FK: account deletion/unlink/reset must not erase the once-only receipt.
const foundation = new WeakMap();
class GiftError extends Error {
  constructor(code, message, status = 409) { super(message); this.code = code; this.status = status; }
}
function fail(code, message, status) { throw new GiftError(code, message, status); }
function safeId(value) {
  const id = Number(value);
  if (!Number.isSafeInteger(id) || id < 1) fail('INVALID_USER', '유저를 다시 선택하세요.', 400);
  return id;
}
async function digest(value) {
  const bytes = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value));
  return [...new Uint8Array(bytes)].map(b => b.toString(16).padStart(2, '0')).join('');
}
export function giftTimestamp(value) {
  if (value instanceof Date) return value.getTime();
  const raw = String(value || '').trim();
  if (/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/.test(raw)) {
    const iso = raw.replace(' ', 'T') + 'Z';
    const time = Date.parse(iso);
    return Number.isFinite(time) && new Date(time).toISOString().slice(0, 19) === iso.slice(0, 19) ? time : NaN;
  }
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,6})?(?:Z|[+-]\d{2}:\d{2})$/.test(raw)) return NaN;
  const calendar = raw.slice(0, 10), day = new Date(calendar + 'T00:00:00Z');
  if (!Number.isFinite(day.getTime()) || day.toISOString().slice(0, 10) !== calendar) return NaN;
  return Date.parse(raw);
}
export function giftEligibility(user, verification, now, receipt = null) {
  const joined = giftTimestamp(user?.created_at), current = giftTimestamp(now);
  const verified = ['WAGO', 'PLAYDK'].includes(verification?.provider)
    && Boolean(String(verification?.provider_user_id || '').trim()) && Number.isFinite(giftTimestamp(verification?.verified_at));
  let code = 'ELIGIBLE', message = '가입 7일 이내 · 2차 인증 완료 · 최초 지급 가능';
  if (receipt) { code = 'ALREADY_ISSUED'; message = receipt.status === 'OPENED' ? '이미 개봉한 계정입니다. 재지급할 수 없습니다.' : '이미 박스를 지급한 계정입니다. 재지급할 수 없습니다.'; }
  else if (!user || user.status !== 'ACTIVE') { code = 'INACTIVE_USER'; message = '활성 계정에만 지급할 수 있습니다.'; }
  else if (!Number.isFinite(joined) || !Number.isFinite(current) || joined > current) { code = 'JOIN_DATE_INVALID'; message = '숲켓몬 가입일을 검증할 수 없어 지급을 차단했습니다.'; }
  else if (current - joined > NEW_USER_GIFT_DAYS * 86400000) { code = 'EXPIRED'; message = '숲켓몬 가입 후 7일이 지나 지급할 수 없습니다.'; }
  else if (!verified) { code = 'SECOND_VERIFICATION_REQUIRED'; message = '2차 인증(WAGO 또는 PLAY DK)을 완료해야 지급할 수 있습니다.'; }
  return { eligible: code === 'ELIGIBLE', code, message, joinedAt: Number.isFinite(joined) ? new Date(joined).toISOString() : null,
    deadline: Number.isFinite(joined) ? new Date(joined + NEW_USER_GIFT_DAYS * 86400000).toISOString() : null,
    days: NEW_USER_GIFT_DAYS, verified, provider: verified ? verification.provider : null };
}
async function identity(verification) {
  return digest(`${verification.provider}:${String(verification.provider_user_id).trim()}`);
}
export async function ensureNewUserGift(env) {
  const db = env.DB;
  if (db?.dialect !== 'postgres' || !db.client || typeof db.enqueue !== 'function') fail('DATABASE_UNSUPPORTED', '기프트 박스의 원자적 지급을 지원하지 않는 DB입니다.', 503);
  if (!foundation.has(db)) foundation.set(db, (async () => {
    const row = await db.prepare(`SELECT to_regclass('public.${TABLE}') AS relation`).first();
    if (!row?.relation) await db.execSchema(NEW_USER_GIFT_SCHEMA);
    await db.prepare(`INSERT INTO inventory_items(code,name,subtitle,description,category,rarity,image_url,sort_order,is_active)
      VALUES(?,'신규유저 기프트 박스','NEW PLAYER GIFT',
        '100억 코인 · 공개 FUR/제니스 각 1장 +10 · 프라임 방어구 4종과 인피니티 M200 · 활성 마법카드 각 1장 +5. CMS 지급 전용, 계정·2차 인증 계정당 1회.',
        'GIFT_BOX','SPECIAL','assets/ui/packs/supply-high.jpeg',37,1) ON CONFLICT(code) DO NOTHING`).bind(NEW_USER_GIFT_CODE).run();
  })().catch(error => { foundation.delete(db); throw error; }));
  return foundation.get(db);
}
async function transaction(env, operation) {
  await ensureNewUserGift(env);
  return env.DB.enqueue(async () => {
    const q = async (text, values = []) => (await env.DB.client.query({ text, values })).rows;
    await q('BEGIN');
    try {
      await q("SET LOCAL TIME ZONE 'UTC'");
      await q("SET LOCAL lock_timeout='3s'");
      await q("SET LOCAL statement_timeout='15s'");
      const result = await operation(q);
      await q('COMMIT');
      return result;
    } catch (error) {
      try { await q('ROLLBACK'); } catch {}
      if (error.code === '23505') fail('DUPLICATE_GIFT', '이미 지급한 계정 또는 2차 인증 계정입니다. 새로고침해 확인하세요.');
      throw error;
    }
  });
}
async function catalog(q) {
  const cards = await q(`SELECT c.id,c.title,UPPER(c.rarity) AS grade FROM cards_effective_v1210 c
    JOIN members m ON m.id=c.member_id WHERE c.is_active=1 AND COALESCE(c.card_status,'PUBLIC')='PUBLIC'
    AND m.is_active=1 AND UPPER(c.rarity) IN ('FUR','ZENITH') ORDER BY c.rarity,c.id LIMIT 1001`);
  const magic = await q('SELECT id,code,name FROM magic_cards WHERE is_active=1 ORDER BY id LIMIT 501');
  const equipment = await q('SELECT id,code,name,slot,subtype FROM character_equipment_items WHERE code=ANY($1::text[]) AND is_active=1 AND is_public=1 ORDER BY code', [NEW_USER_GIFT_EQUIPMENT.map(e => e.code)]);
  if (!cards.some(c => c.grade === 'FUR') || !cards.some(c => c.grade === 'ZENITH') || cards.length > 1000 || !magic.length || magic.length > 500) fail('CATALOG_INVALID', 'FUR·제니스·마법카드 보상 목록을 확인해야 합니다. 지급하지 않았습니다.');
  if (equipment.length !== 5 || !NEW_USER_GIFT_EQUIPMENT.every(expected => equipment.some(row => row.code === expected.code && row.slot === expected.slot && row.subtype === expected.subtype && row.name === expected.name))) fail('EQUIPMENT_INVALID', '프라임 방어구 4종과 인피니티 M200의 공개·활성 상태를 확인하세요. 지급하지 않았습니다.');
  return { version: 1, coin: NEW_USER_GIFT_COIN, cardLevel: 10, magicLevel: 5, cards,
    magic: magic.map(m => ({ ...m, id: Number(m.id) })), equipment: equipment.map(e => ({ ...e, id: Number(e.id) })) };
}
function receiptSummary(row) {
  return row ? { status: row.status, issuedAt: row.issued_at, openedAt: row.opened_at || null } : null;
}
function parseManifest(row) {
  try { return JSON.parse(row.manifest_json); } catch { fail('RECEIPT_INVALID', '보상 지급 기록을 확인해야 합니다. 관리자에게 문의하세요.'); }
}
export async function newUserGiftStatus(env, userId, admin = null) {
  const id = safeId(userId);
  return transaction(env, async q => {
    const [user] = await q('SELECT id,nickname,status,role,created_at FROM users WHERE id=$1', [id]);
    if (!user) fail('USER_NOT_FOUND', '유저를 찾을 수 없습니다.', 404);
    if (admin && user.role === 'OWNER' && admin.role !== 'OWNER') fail('OWNER_ONLY', 'OWNER 계정은 수정할 수 없습니다.', 403);
    const [verification] = await q('SELECT provider,provider_user_id,verified_at FROM user_second_verifications WHERE user_id=$1', [id]);
    const [receipt] = await q(`SELECT * FROM ${TABLE} WHERE user_id=$1`, [id]);
    const [{ now }] = await q('SELECT CURRENT_TIMESTAMP AS now');
    let eligibility = giftEligibility(user, verification, now, receipt);
    if (eligibility.eligible) {
      const [prior] = await q(`SELECT user_id FROM ${TABLE} WHERE provider=$1 AND identity_hash=$2`, [verification.provider, await identity(verification)]);
      if (prior) eligibility = { ...eligibility, eligible: false, code: 'IDENTITY_ALREADY_ISSUED', message: '이 2차 인증 계정으로 이미 지급받았습니다. 재가입해도 다시 받을 수 없습니다.' };
    }
    const [item] = await q('SELECT is_active FROM inventory_items WHERE code=$1', [NEW_USER_GIFT_CODE]);
    const [inventory] = await q('SELECT quantity FROM cnine_user_inventory WHERE user_id=$1 AND item_code=$2', [id, NEW_USER_GIFT_CODE]);
    let rewards = receipt ? parseManifest(receipt) : null;
    let catalogError = '';
    if (admin && !receipt) {
      try { rewards = await catalog(q); } catch (error) { if (!(error instanceof GiftError)) throw error; catalogError = error.message; }
    }
    const matchingIdentity = receipt && eligibility.verified && receipt.provider === verification.provider && receipt.identity_hash === await identity(verification);
    const active = Number(item?.is_active) === 1;
    return { user: { id, nickname: user.nickname }, eligibility, receipt: receiptSummary(receipt), rewards, catalogError,
      canIssue: Boolean(admin && eligibility.eligible && active && rewards && !catalogError),
      canOpen: Boolean(user.status === 'ACTIVE' && receipt?.status === 'ISSUED' && matchingIdentity && active && Number(inventory?.quantity) === 1),
      available: active, quantity: Number(inventory?.quantity || 0), serverNow: new Date(giftTimestamp(now)).toISOString() };
  });
}
export async function issueNewUserGift(env, { userId, requestId, reason }, admin) {
  const id = safeId(userId), req = String(requestId || ''), note = String(reason || '').trim().slice(0, 160);
  if (!/^[A-Za-z0-9_-]{8,100}$/.test(req) || !note) fail('INVALID_REQUEST', '요청 ID와 지급 사유가 필요합니다.', 400);
  if (!admin?.id) fail('ADMIN_REQUIRED', '유저 관리 권한이 필요합니다.', 403);
  return transaction(env, async q => {
    const [user] = await q('SELECT id,nickname,status,role,created_at FROM users WHERE id=$1 FOR UPDATE', [id]);
    if (!user) fail('USER_NOT_FOUND', '유저를 찾을 수 없습니다.', 404);
    if (user.role === 'OWNER' && admin.role !== 'OWNER') fail('OWNER_ONLY', 'OWNER 계정은 수정할 수 없습니다.', 403);
    const [prior] = await q(`SELECT * FROM ${TABLE} WHERE user_id=$1`, [id]);
    if (prior) return { ok: true, replayed: true, receipt: receiptSummary(prior), rewards: parseManifest(prior) };
    const [verification] = await q('SELECT provider,provider_user_id,verified_at FROM user_second_verifications WHERE user_id=$1 FOR SHARE', [id]);
    const [{ now }] = await q('SELECT CURRENT_TIMESTAMP AS now');
    const eligible = giftEligibility(user, verification, now);
    if (!eligible.eligible) fail(eligible.code, eligible.message);
    const identityHash = await identity(verification);
    await q('SELECT pg_advisory_xact_lock(hashtextextended($1,0))', [`new-user-gift:${verification.provider}:${identityHash}`]);
    if ((await q(`SELECT user_id FROM ${TABLE} WHERE provider=$1 AND identity_hash=$2`, [verification.provider, identityHash])).length) fail('IDENTITY_ALREADY_ISSUED', '이 2차 인증 계정으로 이미 지급받았습니다.');
    const [item] = await q('SELECT is_active FROM inventory_items WHERE code=$1 FOR SHARE', [NEW_USER_GIFT_CODE]);
    if (Number(item?.is_active) !== 1) fail('GIFT_DISABLED', '기프트 박스 지급이 중지되어 있습니다.');
    const [owned] = await q('SELECT quantity FROM cnine_user_inventory WHERE user_id=$1 AND item_code=$2 FOR UPDATE', [id, NEW_USER_GIFT_CODE]);
    if (Number(owned?.quantity || 0) !== 0) fail('UNTRACKED_BOX', '기존 박스와 지급 기록이 일치하지 않습니다. 관리자 확인이 필요합니다.');
    const rewards = await catalog(q), manifest = JSON.stringify(rewards);
    await q(`INSERT INTO ${TABLE}(user_id,provider,identity_hash,status,issued_by,issued_at,joined_at,request_id,manifest_json,manifest_hash)
      VALUES($1,$2,$3,'ISSUED',$4,${STAMP},$5,$6,$7,$8)`, [id, verification.provider, identityHash, admin.id, user.created_at, req, manifest, await digest(manifest)]);
    const granted = await q(`INSERT INTO cnine_user_inventory(user_id,item_code,quantity,unseen_quantity) VALUES($1,$2,1,1)
      ON CONFLICT(user_id,item_code) DO UPDATE SET quantity=1,unseen_quantity=1,updated_at=${STAMP}
      WHERE cnine_user_inventory.quantity=0 RETURNING quantity`, [id, NEW_USER_GIFT_CODE]);
    if (granted.length !== 1) fail('GRANT_FAILED', '박스를 지급하지 못했습니다. 변경 사항을 모두 취소했습니다.');
    await q(`INSERT INTO inventory_logs(user_id,item_code,change_amount,balance_after,reason,reference_type,reference_id,admin_id)
      VALUES($1,$2,1,1,$3,'NEW_USER_GIFT',$4,$5)`, [id, NEW_USER_GIFT_CODE, note, `newgift:${id}`, admin.id]);
    await q(`INSERT INTO admin_logs(admin_id,action_type,target_type,target_id,before_data,after_data)
      VALUES($1,'NEW_USER_GIFT_ISSUE','USER',$2,$3,$4)`, [admin.id, String(id), JSON.stringify({ nickname: user.nickname, joinedAt: eligible.joinedAt, provider: verification.provider }), JSON.stringify({ requestId: req, reason: note, rewards })]);
    return { ok: true, replayed: false, receipt: { status: 'ISSUED', issuedAt: new Date(giftTimestamp(now)).toISOString() }, rewards };
  });
}
export async function openNewUserGift(env, userId) {
  const id = safeId(userId);
  return transaction(env, async q => {
    const [user] = await q('SELECT id,status,coin FROM users WHERE id=$1 FOR UPDATE', [id]);
    if (!user || user.status !== 'ACTIVE') fail('INACTIVE_USER', '활성 계정에서만 개봉할 수 있습니다.');
    const [receipt] = await q(`SELECT * FROM ${TABLE} WHERE user_id=$1 FOR UPDATE`, [id]);
    if (!receipt) fail('NOT_ISSUED', 'CMS에서 정식 지급받은 기프트 박스가 없습니다.');
    if (receipt.status === 'OPENED') {
      try { return { ...JSON.parse(receipt.result_json), replayed: true }; } catch { fail('RECEIPT_INVALID', '개봉 기록을 확인해야 합니다.'); }
    }
    const [verification] = await q('SELECT provider,provider_user_id,verified_at FROM user_second_verifications WHERE user_id=$1 FOR SHARE', [id]);
    if (!['WAGO','PLAYDK'].includes(verification?.provider) || !String(verification?.provider_user_id || '').trim() || !Number.isFinite(giftTimestamp(verification?.verified_at)) || verification.provider !== receipt.provider || await identity(verification) !== receipt.identity_hash) fail('SECOND_VERIFICATION_REQUIRED', '지급 당시의 2차 인증 계정이 유지되어야 개봉할 수 있습니다.');
    const [item] = await q('SELECT is_active FROM inventory_items WHERE code=$1 FOR SHARE', [NEW_USER_GIFT_CODE]);
    if (Number(item?.is_active) !== 1) fail('GIFT_DISABLED', '기프트 박스 사용이 중지되어 있습니다.');
    if (await digest(receipt.manifest_json) !== receipt.manifest_hash) fail('RECEIPT_INVALID', '보상 구성 검증에 실패했습니다.');
    const rewards = parseManifest(receipt), current = await catalog(q);
    if (rewards.version !== 1 || rewards.coin !== NEW_USER_GIFT_COIN || rewards.cardLevel !== 10 || rewards.magicLevel !== 5
      || !Array.isArray(rewards.cards) || !rewards.cards.length || !Array.isArray(rewards.magic) || !rewards.magic.length || rewards.equipment?.length !== 5
      || new Set(rewards.cards.map(c => c.id)).size !== rewards.cards.length || new Set(rewards.magic.map(c => c.id)).size !== rewards.magic.length
      || !rewards.cards.every(c => current.cards.some(r => r.id === c.id && r.grade === c.grade))
      || !rewards.magic.every(c => current.magic.some(r => r.id === c.id && r.code === c.code))
      || new Set(rewards.equipment.map(e => e.id)).size !== 5
      || !rewards.equipment.every(e => current.equipment.some(r => r.id === e.id && r.code === e.code))) fail('REWARD_CHANGED', '지급받은 보상 중 삭제·비공개된 항목이 있습니다. 박스는 차감하지 않았습니다. 관리자에게 문의하세요.');
    const coinBefore = Number(user.coin);
    if (!Number.isSafeInteger(coinBefore) || coinBefore < 0 || !Number.isSafeInteger(coinBefore + rewards.coin)) fail('COIN_OVERFLOW', '코인 잔액을 안전하게 지급할 수 없습니다. 관리자에게 문의하세요.');
    const used = await q(`UPDATE cnine_user_inventory SET quantity=0,unseen_quantity=0,updated_at=${STAMP}
      WHERE user_id=$1 AND item_code=$2 AND quantity=1 RETURNING quantity`, [id, NEW_USER_GIFT_CODE]);
    if (used.length !== 1) fail('BOX_MISSING', '박스 수량과 지급 기록이 일치하지 않습니다. 개봉하지 않았습니다.');
    const cardIds = rewards.cards.map(c => c.id);
    // Lock the base catalog too; CMS retirement/stock changes cannot race a grant.
    const stock = await q('SELECT id,limited_total,issued_count FROM cards WHERE id=ANY($1::text[]) ORDER BY id FOR UPDATE', [cardIds]);
    if (stock.length !== cardIds.length) fail('REWARD_CHANGED', '카드 원본 목록이 달라져 개봉하지 않았습니다.');
    await q('SELECT m.id FROM members m JOIN cards c ON c.member_id=m.id WHERE c.id=ANY($1::text[]) ORDER BY m.id FOR SHARE OF m', [cardIds]);
    await q('SELECT id FROM magic_cards WHERE id=ANY($1::bigint[]) ORDER BY id FOR SHARE', [rewards.magic.map(c => c.id)]);
    await q('SELECT id FROM character_equipment_items WHERE id=ANY($1::bigint[]) ORDER BY id FOR SHARE', [rewards.equipment.map(e => e.id)]);
    const activeCards = await q(`SELECT c.id FROM cards_effective_v1210 c JOIN members m ON m.id=c.member_id
      WHERE c.id=ANY($1::text[]) AND c.is_active=1 AND COALESCE(c.card_status,'PUBLIC')='PUBLIC' AND m.is_active=1`, [cardIds]);
    if (activeCards.length !== cardIds.length) fail('REWARD_CHANGED', '비공개 카드가 포함되어 개봉하지 않았습니다.');
    for (const card of stock) if (card.limited_total != null) {
      const reserved = await q('UPDATE cards SET issued_count=issued_count+1 WHERE id=$1 AND issued_count<limited_total RETURNING id', [card.id]);
      if (reserved.length !== 1) fail('CARD_STOCK_EXHAUSTED', '보상 카드의 한정 수량이 소진되어 개봉하지 않았습니다.');
    }
    const cards = await q(`INSERT INTO user_cards(user_id,card_id,quantity,breakthrough_level,breakthrough_fail_count)
      SELECT $1,unnest($2::text[]),1,10,0
      ON CONFLICT(user_id,card_id) DO UPDATE SET quantity=GREATEST(user_cards.quantity,0)+1,
        breakthrough_level=CASE WHEN user_cards.quantity<=0 THEN 10 ELSE GREATEST(user_cards.breakthrough_level,10) END,
        breakthrough_fail_count=CASE WHEN user_cards.quantity<=0 OR user_cards.breakthrough_level<10 THEN 0 ELSE user_cards.breakthrough_fail_count END,
        last_obtained_at=${STAMP} RETURNING card_id,quantity,breakthrough_level`, [id, cardIds]);
    const magic = await q(`INSERT INTO user_magic_cards(user_id,magic_card_id,quantity,enhancement_level)
      SELECT $1,id,1,5 FROM magic_cards WHERE id=ANY($2::bigint[]) AND is_active=1
      ON CONFLICT(user_id,magic_card_id) DO UPDATE SET quantity=GREATEST(user_magic_cards.quantity,0)+1,
        enhancement_level=CASE WHEN user_magic_cards.quantity<=0 THEN 5 ELSE GREATEST(user_magic_cards.enhancement_level,5) END,
        updated_at=${STAMP} RETURNING magic_card_id,quantity,enhancement_level`, [id, rewards.magic.map(c => c.id)]);
    const equipment = await q(`INSERT INTO user_equipment_instances(user_id,equipment_id,source_type,source_id,request_id)
      SELECT $1,id,'NEW_USER_GIFT',$2,$2||':'||id::text FROM character_equipment_items
      WHERE id=ANY($3::bigint[]) AND is_active=1 AND is_public=1 RETURNING id,equipment_id`, [id, `newgift:${id}`, rewards.equipment.map(e => e.id)]);
    if (cards.length !== cardIds.length || magic.length !== rewards.magic.length || equipment.length !== 5) fail('PARTIAL_GRANT', '보상 수량 검증에 실패해 박스 차감과 지급을 모두 취소했습니다.');
    const balances = await q('UPDATE users SET coin=coin+$2 WHERE id=$1 RETURNING coin', [id, rewards.coin]);
    if (balances.length !== 1 || Number(balances[0].coin) !== coinBefore + rewards.coin) fail('COIN_MISMATCH', '코인 검증에 실패해 모든 지급을 취소했습니다.');
    await q("INSERT INTO coin_logs(user_id,change_amount,balance_after,reason,admin_id) VALUES($1,$2,$3,'신규유저 기프트 박스',$4)", [id, rewards.coin, balances[0].coin, receipt.issued_by]);
    await q(`INSERT INTO inventory_logs(user_id,item_code,change_amount,balance_after,reason,reference_type,reference_id)
      VALUES($1,$2,-1,0,'신규유저 기프트 박스 개봉','NEW_USER_GIFT',$3)`, [id, NEW_USER_GIFT_CODE, `newgift:${id}`]);
    const result = { ok: true, replayed: false, coin: rewards.coin, coinAfter: Number(balances[0].coin),
      summary: { fur: rewards.cards.filter(c => c.grade === 'FUR').length, zenith: rewards.cards.filter(c => c.grade === 'ZENITH').length, magic: magic.length, equipment: equipment.length }, cards, magic, equipment, rewards };
    const saved = await q(`UPDATE ${TABLE} SET status='OPENED',opened_at=${STAMP},result_json=$2 WHERE user_id=$1 AND status='ISSUED' RETURNING user_id`, [id, JSON.stringify(result)]);
    if (saved.length !== 1) fail('RECEIPT_FAILED', '수령 기록 저장에 실패해 모든 지급을 취소했습니다.');
    return result;
  });
}
export async function handleNewUserGift({ path, request, env, deps }) {
  if (!['admin/users/new-user-gift', 'new-user-gift', 'new-user-gift/open'].includes(path)) return null;
  const { authenticate, requirePermission, json, readBody, ensureSecondVerificationFoundation } = deps;
  const isAdmin = path === 'admin/users/new-user-gift';
  const actor = isAdmin ? await requirePermission(request, env, 'USER_MANAGE') : await authenticate(request, env);
  if (!actor) return json({ error: isAdmin ? '유저 관리 권한이 없습니다.' : '로그인이 필요합니다.' }, isAdmin ? 403 : 401);
  try {
    await ensureSecondVerificationFoundation(env);
    if (isAdmin && request.method === 'GET') return json(await newUserGiftStatus(env, new URL(request.url).searchParams.get('userId'), actor));
    if (isAdmin && request.method === 'POST') return json(await issueNewUserGift(env, await readBody(request), actor));
    if (path === 'new-user-gift' && request.method === 'GET') return json(await newUserGiftStatus(env, actor.id));
    if (path === 'new-user-gift/open' && request.method === 'POST') return json(await openNewUserGift(env, actor.id));
    return json({ error: '지원하지 않는 요청입니다.' }, 405);
  } catch (error) {
    if (error instanceof GiftError) return json({ error: error.message, code: error.code }, error.status);
    console.error('new_user_gift_failed', { path, code: String(error?.code || 'INTERNAL') });
    return json({ error: '기프트 박스 처리에 실패했습니다. 지급 기록을 새로 확인한 뒤 재시도하세요.', code: 'GIFT_FAILED' }, 500);
  }
}
