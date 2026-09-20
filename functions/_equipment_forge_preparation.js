// Authenticated, read-only inventory for the approved Upgrade Lab public release.
// The caller must authenticate first and pass that account's ID, never a body-supplied user ID.
function positiveId(value) {
  if (typeof value === 'number' && !Number.isSafeInteger(value)) throw new Error('정확한 장비/계정 ID가 필요합니다.');
  const text = typeof value === 'number' || typeof value === 'string' ? String(value) : '';
  if (!/^[1-9][0-9]{0,18}$/.test(text) || BigInt(text) > 9223372036854775807n) throw new Error('올바른 장비/계정 ID가 필요합니다.');
  return text;
}

export async function readForgePreparationInventory(db, authenticatedUserId, { beforeId = null, limit = 40, group = 'all' } = {}) {
  const userId = positiveId(authenticatedUserId), cursor = beforeId == null ? null : positiveId(beforeId);
  if (!Number.isSafeInteger(limit) || limit < 1 || limit > 100) throw new Error('장비는 페이지당 1~100개까지 조회합니다.');
  const groups={all:['WEAPON','TOP','BOTTOM','SHOES','ACCESSORY'],weapon:['WEAPON'],armor:['TOP','BOTTOM','SHOES'],accessory:['ACCESSORY']};
  if(!Object.hasOwn(groups,group))throw new Error('장비 종류를 확인하세요.');
  const slots=groups[group];
  // PIPE-0920: 예전에는 ORDER BY x.id DESC 였다. PostgreSQL 은 user_equipment_instances(3억 2천만 행, 178GB) 의
  //   PK 를 뒤에서부터 훑으며 user_id 를 걸렀다 — 보유 1,575개인 계정도 80초 넘게 걸렸다(Neon EXPLAIN 실측, 평균 119초).
  //   idx_user_equipment_instances_user(user_id, acquired_at DESC, id DESC) 순서로 정렬하면 8.7ms 다.
  //   획득 시각은 INSERT 시각이라 id 순서와 같고, 같은 시각 안에서는 id 로 이어 정렬하므로 표시 순서는 그대로다.
  //   커서(beforeId)는 API 계약 그대로 두고, 그 행의 (acquired_at,id) 를 찾아 행 비교로 이어 읽는다(PG·SQLite 모두 지원).
  let cursorRow = null;
  if (cursor) {
    cursorRow = await db.prepare('SELECT acquired_at,id FROM user_equipment_instances WHERE id=? AND user_id=?').bind(cursor, userId).first();
    if (!cursorRow) return { accountId: userId, mode: 'PREPARATION_READ_ONLY', canEnhance: false, items: [], nextCursor: null };
  }
  const sql = `SELECT x.id AS instance_id,x.equipment_id,x.acquired_at,
      i.code,i.name,i.slot,i.subtype,i.rarity,i.image_url,i.total_power,i.pve_power,i.pvp_power,
      CASE WHEN EXISTS(SELECT 1 FROM user_equipment_loadout l WHERE l.instance_id=x.id AND l.user_id=x.user_id AND l.slot=i.slot) THEN 1 ELSE 0 END AS equipped
    FROM user_equipment_instances x
    JOIN character_equipment_items i ON i.id=x.equipment_id
    WHERE x.user_id=? AND i.is_active=1 AND i.is_public=1 AND i.slot IN (${slots.map(()=>'?').join(',')})${cursorRow ? ' AND (x.acquired_at,x.id)<(?,?)' : ''}
    ORDER BY x.user_id DESC,x.acquired_at DESC,x.id DESC LIMIT ?`;
  const values = cursorRow ? [userId,...slots,cursorRow.acquired_at,String(cursorRow.id),limit+1] : [userId,...slots,limit+1];
  const result = await db.prepare(sql).bind(...values).all();
  const rows = result.results || [];
  const items = rows.slice(0, limit).map(row => ({
    instanceId: positiveId(row.instance_id), equipmentId: positiveId(row.equipment_id),
    name: String(row.name), code: String(row.code), slot: String(row.slot), subtype: String(row.subtype),
    grade: String(row.rarity), image: String(row.image_url), acquiredAt: row.acquired_at,
    equipped: Number(row.equipped) === 1,
    basePower: { total: Number(row.total_power), pve: Number(row.pve_power), pvp: Number(row.pvp_power) },
    // Existing instances have no enhancement state column. Do not turn demo +levels into account state.
    enhancement: null,
  }));
  return { accountId: userId, mode: 'PREPARATION_READ_ONLY', canEnhance: false, items,
    nextCursor: rows.length > limit ? items.at(-1).instanceId : null };
}
