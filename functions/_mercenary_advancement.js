import { POLICY, ROLE_BY_ID, quote } from '../shared/mercenary-advancement-v1.mjs';
import { mercenaryLevelStateFromStorage } from '../shared/mercenary-level-v1.mjs';
import { readMercenaryDocument } from './_mercenary_account.js';
import { ownedMercenaryLevelCatalog } from './_mercenary_level.js';
import { jointGuard, jointGuardEnd } from './_joint_atomic.js';
import { jointCoinDebit, jointInventoryChange, runJointOperation } from './_joint_transactions.js';
import { jointError, jointResponseError, readJointBody } from './_joint_request.js';

import { ADVANCEMENT_PREFIX, storedAdvancement } from './_mercenary_advancement_storage.js';
const route = 'mercenaries/v3/advancement';
const kind = 'MERCENARY_ADVANCEMENT_V1';
const keyFor = (userId, code) => ADVANCEMENT_PREFIX + userId + ':' + code;
const error = (code, message, status = 409) => jointError('MERCENARY_ADVANCEMENT_' + code, message, status);

export async function advancementState(env, userId, code = null) {
  const db = env.DB;
  const owned = db.prepare(`SELECT c.mercenary_code,c.total_copies,g.level,g.experience,g.breakthrough_mask,g.revision,m.value AS choice
    FROM user_mercenary_cards_v1 c
    LEFT JOIN user_mercenary_levels_v1 g ON g.user_id=c.user_id AND g.mercenary_code=c.mercenary_code
    LEFT JOIN app_meta m ON m.key=(?||CAST(c.user_id AS TEXT)||':'||c.mercenary_code)
    WHERE c.user_id=? AND c.total_copies>0${code ? ' AND c.mercenary_code=?' : ''} ORDER BY c.mercenary_code`);
  const [records, balance, config] = await Promise.all([
    owned.bind(ADVANCEMENT_PREFIX, userId, ...(code ? [code] : [])).all(),
    db.prepare(`SELECT CAST(u.coin AS TEXT) AS coin,
      CAST(COALESCE((SELECT quantity FROM cnine_user_inventory WHERE user_id=u.id AND item_code='MASTER_STAR'),0) AS TEXT) AS stars
      FROM users u WHERE u.id=?`).bind(userId).first(),
    readMercenaryDocument(env)
  ]);
  if (!balance) throw error('ACCOUNT', '로그인 계정을 확인하세요.', 401);
  const catalog = new Map((await ownedMercenaryLevelCatalog(env, userId, records.results, config.document)).map(card => [card.code, card]));
  const cards = records.results.filter(row => catalog.has(row.mercenary_code)).map(row => {
    const card = catalog.get(row.mercenary_code);
    return { code: card.code, name: card.name, rank: card.rank, edition: card.edition, sourceArt: card.sourceArt,
      totalCopies: Number(row.total_copies), growth: mercenaryLevelStateFromStorage(row.level == null ? null : row), advancement: storedAdvancement(row.choice) };
  });
  return { accountId: Number(userId), policyRevision: POLICY.revision,
    wallet: { coin: String(balance.coin), MASTER_STAR: String(balance.stars) }, cards };
}

async function changeAdvancement(env, user, body) {
  const { idempotencyKey, mercenaryCode, advancementId, expectedRevision, expectedPolicyRevision } = body;
  if (body.expectedAccountId !== Number(user.id)) throw error('ACCOUNT', '계정이 바뀌었습니다. 전직창을 다시 여세요.', 409);
  if (!/^V-\d{3}$/.test(mercenaryCode) || !ROLE_BY_ID.has(advancementId) || !Number.isSafeInteger(expectedRevision) || expectedRevision < 0) {
    throw error('INPUT', '용병과 전직을 다시 선택하세요.', 400);
  }
  const input = { mercenaryCode, advancementId, expectedRevision, expectedPolicyRevision };
  const db = env.DB, id = user.id, key = keyFor(id, mercenaryCode);
  let preparedHere = false;
  async function validate() {
    if (expectedPolicyRevision !== POLICY.revision) throw error('STALE', '전직 비용이 갱신되었습니다. 다시 확인하세요.');
    const state = await advancementState(env, id, mercenaryCode);
    const decision = quote(state, mercenaryCode, advancementId);
    if (!decision.card || decision.unavailable) throw error('INELIGIBLE', decision.unavailable);
    if (decision.card.advancement.revision !== expectedRevision) throw error('STALE', '다른 창에서 전직을 변경했습니다. 다시 확인하세요.');
    if (decision.insufficient) throw error('FUNDS', '전직에 필요한 코인 또는 마스터의 별이 부족합니다.');
    return decision.card;
  }
  const op = await runJointOperation(env, user, {
    requestId: idempotencyKey, kind, input,
    prepare: async () => {
      const card = await validate();
      preparedHere = true;
      return { ...input, previous: card.advancement, next: { id: advancementId, revision: expectedRevision + 1 }, costs: POLICY.cost };
    },
    statements: async plan => {
      // Restored pending receipts need a fresh eligibility check. New requests already have it.
      try { if (!preparedHere) await validate(); } catch (e) {
        if (e.code?.startsWith('MERCENARY_ADVANCEMENT_') && e.status < 500) e.terminal = true;
        throw e;
      }
      const token = crypto.randomUUID();
      const previous = plan.previous.id ? 'EXISTS(SELECT 1 FROM app_meta WHERE key=? AND value=?)' : 'NOT EXISTS(SELECT 1 FROM app_meta WHERE key=?)';
      return [
        jointGuard(db, token, previous + ` AND EXISTS(SELECT 1 FROM user_mercenary_cards_v1 c JOIN user_mercenary_levels_v1 g
          ON g.user_id=c.user_id AND g.mercenary_code=c.mercenary_code
          WHERE c.user_id=? AND c.mercenary_code=? AND c.total_copies>0 AND g.level>=?)`,
          [key, ...(plan.previous.id ? [JSON.stringify(plan.previous)] : []), id, mercenaryCode, POLICY.minimumLevel]),
        ...jointCoinDebit(db, id, Number(plan.costs.coin), '용병 전직 ' + mercenaryCode + ' ' + idempotencyKey),
        ...jointInventoryChange(db, id, 'MASTER_STAR', -Number(plan.costs.MASTER_STAR), '용병 전직 ' + mercenaryCode, idempotencyKey),
        db.prepare(`INSERT INTO app_meta(key,value,updated_at) VALUES(?,?,CURRENT_TIMESTAMP)
          ON CONFLICT(key) DO UPDATE SET value=excluded.value,updated_at=excluded.updated_at`).bind(key, JSON.stringify(plan.next)),
        db.prepare('UPDATE ranked_duo_accounts_v1 SET source_version=source_version+1 WHERE user_id=?').bind(id),
        jointGuardEnd(db, token)
      ];
    }
  });
  return { requestId: op.requestId, receiptId: op.requestId, mercenaryCode, advancementId: op.plan.next.id,
    charged: op.plan.costs, replayed: op.replayed, snapshot: await advancementState(env, id) };
}

export async function handleMercenaryAdvancement({ path, request, env, deps }) {
  if (path !== route + '/state' && path !== route + '/change') return null;
  const reply = value => deps.json(value, 200, { 'cache-control': 'no-store' });
  try {
    const user = await deps.authenticate(request, env);
    if (!user) throw error('AUTH', '로그인이 필요합니다.', 401);
    if (path.endsWith('/state') && request.method === 'GET') return reply(await advancementState(env, user.id));
    if (!path.endsWith('/change') || request.method !== 'POST') throw error('METHOD', '지원하지 않는 요청입니다.', 405);
    const body = await readJointBody(request, { fields: ['idempotencyKey','mercenaryCode','advancementId','expectedRevision','expectedPolicyRevision','expectedAccountId'] });
    return reply(await deps.withUserMutationLock(env, user.id, path, () => changeAdvancement(env, user, body)));
  } catch (e) { return jointResponseError(e, deps.json); }
}
