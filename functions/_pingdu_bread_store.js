import { CNINE_WATCH_STREAMERS, SOOP_WATCH_PREFIX } from './_soop_watch.js';
import { validSoopId } from './_soop_watch_contract.js';
import { jointHash } from './_joint_transactions.js';

export const DAYS = 'pingdu_bread_days_v1';
export const POLICY = 'pingdu_bread_pool_v1';
export const SNAPSHOT = 'pingdu_bread_pool_snapshot:';

export function fail(message, status = 409) {
  throw Object.assign(new Error(message), { breadError: true, status });
}

export function whole(value, max, title) {
  if (!Number.isSafeInteger(value) || value < 1 || value > max) fail(title + ' 입력값을 확인하세요.', 400);
  return value;
}

export async function transaction(env, operation) {
  const db = env.DB;
  if (db?.dialect !== 'postgres' || !db.client || !db.enqueue) fail('이벤트 저장소에 연결할 수 없습니다.', 503);
  return db.enqueue(async () => {
    const q = async (text, values = []) => (await db.client.query({ text, values })).rows;
    await q('BEGIN');
    try {
      await q("SET LOCAL lock_timeout = '5s'");
      const result = await operation(q);
      await q('COMMIT');
      return result;
    } catch (error) {
      await q('ROLLBACK').catch(() => {});
      throw error;
    }
  });
}

export async function identity(q, userId) {
  const [row] = await q(`SELECT u.id,u.nickname,v.provider_user_id,m.value
    FROM users u LEFT JOIN user_second_verifications v ON v.user_id=u.id AND v.provider='PLAYDK'
    LEFT JOIN app_meta m ON m.key=$2||u.id::text WHERE u.id=$1 AND u.status='ACTIVE'`, [userId, SOOP_WATCH_PREFIX]);
  if (!row) fail('활동 중인 계정을 찾을 수 없습니다.', 404);
  return linkedIdentity(row);
}
export function linkedIdentity(row) {
  let consent;
  try { consent = JSON.parse(row.value || 'null'); } catch { /* No usable record. */ }
  const linked = consent?.version === 1 && consent.userId === Number(row.id) && consent.providerUuid === row.provider_user_id && validSoopId(consent.soopUserId);
  return { uuid: row.provider_user_id || null, soopId: linked ? consent.soopUserId : null, nickname: row.nickname };
}
export const signature = (who, boards) => jointHash([who.uuid, who.soopId, [...boards].sort(), CNINE_WATCH_STREAMERS.map(member => member.id)]);
export async function pool(q, lock = false) {
  const [row] = await q('SELECT value FROM app_meta WHERE key=$1' + (lock ? ' FOR UPDATE' : ''), [POLICY]);
  return JSON.parse(row.value);
}

export async function availableItems(q, items) {
  const codes = [...new Set(items.filter(item => item.code !== 'COIN' && (item.units ?? item.chance) > 0).map(item => item.code))];
  if (!codes.length) return;
  const rows = await q('SELECT code FROM inventory_items WHERE code=ANY($1::text[]) AND is_active=1 FOR SHARE', [codes]);
  if (rows.length !== codes.length) fail('선택한 아이템 중 현재 지급할 수 없는 항목이 있습니다.');
}

export async function snapshotPool(q, config, expectedRevision) {
  if (!config.items.length) fail('개봉 아이템과 확률을 먼저 저장하세요.');
  if (config.revision !== expectedRevision) fail('개봉 보상 설정이 바뀌었습니다. 최신 설정으로 다시 집계하거나 조회하세요.');
  await availableItems(q, config.items);
  await q('INSERT INTO app_meta(key,value,updated_at) VALUES($1,$2,CURRENT_TIMESTAMP) ON CONFLICT(key) DO NOTHING',
    [SNAPSHOT + config.revision, JSON.stringify(config.items)]);
}
