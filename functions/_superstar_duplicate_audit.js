// OWNER-only, read-only evidence for reconciling SUPERSTAR inventory. This
// endpoint never grants cards and never treats spent duplicate copies as missing.
const ROW_LIMIT = 10000;
const PAGE_SIZE = 500;
const rows = result => result?.results || [];
const parse = value => { try { return JSON.parse(value || '{}'); } catch { return null; } };
const bounded = (result, label) => {
  const value = rows(result);
  if (value.length > ROW_LIMIT) throw Object.assign(new Error(`${label} 감사 범위를 초과했습니다. 부분 결과로 복구하지 마세요.`), { status: 413 });
  return value;
};

export async function handleSuperstarDuplicateAudit({ request, env, deps }) {
  const { requirePermission, json } = deps;
  const admin = await requirePermission(request, env, 'USER_MANAGE');
  if (String(admin?.role || '').toUpperCase() !== 'OWNER') return json({ error: 'OWNER 전용 중복 카드 감사입니다.' }, 403);
  if (request.method !== 'GET') return json({ error: '읽기 전용 감사입니다.' }, 405);
  const url = new URL(request.url), section = url.searchParams.get('section') || 'summary';
  try {
    if (section === 'receipts') {
      const cursor = url.searchParams.get('cursor') || '';
      if (cursor.length > 100 || (cursor && !/^[a-zA-Z0-9_-]+$/.test(cursor))) return json({ error: '잘못된 감사 커서입니다.' }, 400);
      const result = rows(await env.DB.prepare(`SELECT r.request_id,r.user_id,r.status,r.outcome,r.card_id,r.cost,r.response_json,r.created_at,r.updated_at,
          d.cost debit_cost,d.created_at debit_at
        FROM superstar_pack_receipts_v1 r LEFT JOIN superstar_pack_debits_v1 d ON d.request_id=r.request_id AND d.user_id=r.user_id
        WHERE r.request_id>? ORDER BY r.request_id LIMIT ?`).bind(cursor, PAGE_SIZE + 1).all());
      const page = result.slice(0, PAGE_SIZE);
      return json({ readOnly: true, receipts: page.map(({ response_json, ...row }) => ({ ...row, response: parse(response_json) })), nextCursor: result.length > PAGE_SIZE ? page.at(-1).request_id : null });
    }
    if (section !== 'summary') return json({ error: '지원하지 않는 감사 구간입니다.' }, 400);
    const superstar = "SELECT id FROM cards_effective_v1210 WHERE UPPER(rarity)='SUPERSTAR'";
    const result = await Promise.all([
      env.DB.prepare(`SELECT id,title,rarity,is_active,card_status FROM cards_effective_v1210 WHERE UPPER(rarity)='SUPERSTAR' ORDER BY id LIMIT ${ROW_LIMIT + 1}`).all(),
      env.DB.prepare(`SELECT uc.user_id,u.nickname,u.role,u.status,uc.card_id,uc.quantity,uc.breakthrough_level,uc.breakthrough_fail_count,uc.first_obtained_at,uc.last_obtained_at
        FROM user_cards uc JOIN users u ON u.id=uc.user_id WHERE uc.card_id IN (${superstar}) ORDER BY uc.user_id,uc.card_id LIMIT ${ROW_LIMIT + 1}`).all(),
      env.DB.prepare(`SELECT user_id,card_id,COUNT(*) wins,SUM(CASE WHEN is_new=0 THEN 1 ELSE 0 END) duplicates,MIN(created_at) first_at,MAX(created_at) last_at
        FROM draw_logs WHERE card_id IN (${superstar}) GROUP BY user_id,card_id ORDER BY user_id,card_id LIMIT ${ROW_LIMIT + 1}`).all(),
      env.DB.prepare(`SELECT id,user_id,card_id,grade,level,change_amount,balance_after,reason,created_at FROM card_material_logs_v1802
        WHERE card_id IN (${superstar}) ORDER BY id LIMIT ${ROW_LIMIT + 1}`).all(),
      env.DB.prepare(`SELECT id,action_type,target_type,target_id,before_data,after_data,created_at FROM admin_logs
        WHERE action_type IN ('CARDS_RESET','ACCOUNT_RESET') OR after_data LIKE '%SUPERSTAR%' OR before_data LIKE '%SUPERSTAR%'
        ORDER BY id LIMIT ${ROW_LIMIT + 1}`).all(),
      env.DB.prepare('SELECT status,COUNT(*) count,MIN(created_at) first_at,MAX(created_at) last_at FROM superstar_pack_receipts_v1 GROUP BY status').all(),
    ]);
    const [cards, inventory, drawCounts, materialLogs, adminLogs, receiptCounts] = result.map((value, index) => bounded(value, `SUPERSTAR ${index + 1}`));
    return json({ readOnly: true, generatedAt: new Date().toISOString(), cards, inventory, drawCounts, materialLogs, adminLogs, receiptCounts,
      summary: { owners: new Set(inventory.filter(row => Number(row.quantity) > 0).map(row => Number(row.user_id))).size,
        copies: inventory.reduce((sum, row) => sum + Math.max(0, Number(row.quantity) || 0), 0),
        duplicateCopies: inventory.reduce((sum, row) => sum + Math.max(0, (Number(row.quantity) || 0) - 1), 0) } });
  } catch (error) {
    return json({ error: error.message || '중복 카드 감사 실패', code: 'SUPERSTAR_AUDIT_FAILED' }, error.status || 500);
  }
}
