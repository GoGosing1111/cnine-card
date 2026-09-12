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
  const sql = `SELECT x.id AS instance_id,x.equipment_id,x.acquired_at,
      i.code,i.name,i.slot,i.subtype,i.rarity,i.image_url,i.total_power,i.pve_power,i.pvp_power,
      CASE WHEN EXISTS(SELECT 1 FROM user_equipment_loadout l WHERE l.instance_id=x.id AND l.user_id=x.user_id AND l.slot=i.slot) THEN 1 ELSE 0 END AS equipped
    FROM user_equipment_instances x
    JOIN character_equipment_items i ON i.id=x.equipment_id
    WHERE x.user_id=? AND i.is_active=1 AND i.is_public=1 AND i.slot IN (${slots.map(()=>'?').join(',')})${cursor ? ' AND x.id<?' : ''}
    ORDER BY x.id DESC LIMIT ?`;
  const values = cursor ? [userId,...slots,cursor,limit+1] : [userId,...slots,limit+1];
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
