import {EQUIPMENT_POWER_STANDARD} from '../shared/equipment-mercenary-power-v1.mjs';
import {forgePower} from '../shared/equipment-forge-policy-v1.mjs';

// Authenticated inventory: callers pass the authenticated account, never a body-supplied ID.
function positiveId(value) {
  if (typeof value === 'number' && !Number.isSafeInteger(value)) throw new Error('정확한 장비/계정 ID가 필요합니다.');
  const text = typeof value === 'number' || typeof value === 'string' ? String(value) : '';
  if (!/^[1-9][0-9]{0,18}$/.test(text) || BigInt(text) > 9223372036854775807n) throw new Error('올바른 장비/계정 ID가 필요합니다.');
  return text;
}

const currentPowerSql = `CAST(i.total_power AS BIGINT)*(CASE s.level ${EQUIPMENT_POWER_STANDARD.bonusPercentByLevel.map((bonus,level)=>`WHEN ${level} THEN ${100+bonus}`).join(' ')} ELSE 100 END)/100`;

export async function readForgePreparationInventory(db, authenticatedUserId, { beforeId = null, limit = 40, group = 'all', includeEnhancement = false } = {}) {
  const userId = positiveId(authenticatedUserId), cursor = beforeId == null ? null : positiveId(beforeId);
  if (!Number.isSafeInteger(limit) || limit < 1 || limit > 100) throw new Error('장비는 페이지당 1~100개까지 조회합니다.');
  const groups={all:['WEAPON','TOP','BOTTOM','SHOES','ACCESSORY'],weapon:['WEAPON'],armor:['TOP','BOTTOM','SHOES'],accessory:['ACCESSORY']};
  if(!Object.hasOwn(groups,group))throw new Error('장비 종류를 확인하세요.');
  const slots=groups[group],empty={accountId:userId,mode:'PREPARATION_READ_ONLY',canEnhance:false,items:[],nextCursor:null};
  let cursorPower=null;
  if (cursor) {
    const row=await db.prepare(`SELECT i.total_power,${includeEnhancement?'COALESCE(s.level,0)':'0'} AS level
      FROM user_equipment_instances x JOIN character_equipment_items i ON i.id=x.equipment_id
      ${includeEnhancement?'LEFT JOIN equipment_forge_states_v1 s ON s.instance_id=x.id AND s.user_id=x.user_id':''}
      WHERE x.id=? AND x.user_id=?`).bind(cursor,userId).first();
    if(!row)return empty;
    cursorPower=Number(row.level)>0?forgePower(Number(row.total_power),Number(row.level)).total:Number(row.total_power);
  }
  // Bound production reads: one page per catalog type via (user_id,equipment_id,id),
  // plus the small enhanced set. Never sort millions of owned copies or scan the
  // global PK. Apply the cursor BEFORE per-type limits so later pages stay exact.
  const baseWhere=`b.user_id=? AND b.equipment_id=i.id
    ${includeEnhancement?'AND NOT EXISTS(SELECT 1 FROM growth s WHERE s.instance_id=b.id AND s.level>0)':''}
    ${cursor?'AND b.id<=CASE WHEN CAST(i.total_power AS BIGINT)=? THEN CAST(? AS BIGINT)-1 ELSE 9223372036854775807 END':''}`;
  const baseValues=[userId,...(cursor?[cursorPower,cursor]:[]),limit+1];
  const normal=db.dialect==='postgres'?`SELECT b.id AS instance_id,i.total_power AS current_power FROM catalog i
    CROSS JOIN LATERAL (SELECT b.id FROM user_equipment_instances b WHERE ${baseWhere}
      ORDER BY b.user_id DESC,b.equipment_id DESC,b.id DESC LIMIT ?) b`:
    `SELECT x.id AS instance_id,i.total_power AS current_power FROM catalog i
      JOIN user_equipment_instances x ON x.id IN(SELECT b.id FROM user_equipment_instances b WHERE ${baseWhere}
        ORDER BY b.user_id DESC,b.equipment_id DESC,b.id DESC LIMIT ?)`;
  const sql=`WITH catalog AS MATERIALIZED (
      SELECT * FROM character_equipment_items WHERE is_active=1 AND is_public=1 AND slot IN (${slots.map(()=>'?').join(',')})
        ${cursor?'AND total_power<=?':''}
    ),${includeEnhancement?'growth AS MATERIALIZED (SELECT instance_id,level,revision FROM equipment_forge_states_v1 WHERE user_id=?),':''}
    normal AS MATERIALIZED (${normal}),
    candidates AS (
      SELECT instance_id,current_power FROM normal
      ${includeEnhancement?`UNION ALL SELECT x.id AS instance_id,${currentPowerSql} AS current_power
        FROM growth s JOIN user_equipment_instances x ON x.id=s.instance_id AND x.user_id=?
        JOIN catalog i ON i.id=x.equipment_id WHERE s.level>0
        ${cursor?`AND (${currentPowerSql},x.id)<(?,?)`:''}`:''}
    ),page AS MATERIALIZED (SELECT * FROM candidates ORDER BY current_power DESC,instance_id DESC LIMIT ?)
    SELECT x.id AS instance_id,x.equipment_id,x.acquired_at,
      i.code,i.name,i.slot,i.subtype,i.rarity,i.image_url,i.total_power,i.pve_power,i.pvp_power,
      ${includeEnhancement?'COALESCE(s.level,0) AS level,COALESCE(s.revision,0) AS revision,':''}
      CASE WHEN EXISTS(SELECT 1 FROM user_equipment_loadout l WHERE l.instance_id=x.id AND l.user_id=x.user_id AND l.slot=i.slot) THEN 1 ELSE 0 END AS equipped
    FROM page p JOIN user_equipment_instances x ON x.id=p.instance_id JOIN catalog i ON i.id=x.equipment_id
    ${includeEnhancement?'LEFT JOIN growth s ON s.instance_id=x.id':''}
    ORDER BY p.current_power DESC,p.instance_id DESC`;
  const values=[...slots,...(cursor?[cursorPower]:[]),...(includeEnhancement?[userId]:[]),...baseValues,
    ...(includeEnhancement?[userId,...(cursor?[cursorPower,cursor]:[])]:[]),limit+1];
  const result = await db.prepare(sql).bind(...values).all();
  const rows = result.results || [];
  const items = rows.slice(0, limit).map(row => ({
    instanceId: positiveId(row.instance_id), equipmentId: positiveId(row.equipment_id),
    name: String(row.name), code: String(row.code), slot: String(row.slot), subtype: String(row.subtype),
    grade: String(row.rarity), image: String(row.image_url), acquiredAt: row.acquired_at,
    equipped: Number(row.equipped) === 1,
    basePower: { total: Number(row.total_power), pve: Number(row.pve_power), pvp: Number(row.pvp_power) },
    enhancement: includeEnhancement?{level:Number(row.level),revision:Number(row.revision),power:forgePower(Number(row.total_power),Number(row.level))}:null,
  }));
  return { accountId: userId, mode: 'PREPARATION_READ_ONLY', canEnhance: false, items,
    nextCursor: rows.length > limit ? items.at(-1).instanceId : null };
}
