import {equipmentCountsReady,EQUIPMENT_COUNTS_TABLE} from './_equipment_counts_v1.js';

// The first paint needs one real instance per item, not a scan of millions of
// copies. Both subqueries use the existing (user_id,equipment_id,id) index.
export async function equipmentPreviewRows(env,userId,{admin=false}={}){
  return env.DB.prepare(`SELECT representative.id AS instance_id,representative.source_type,representative.source_id,
      latest.acquired_at,NULL AS quantity,i.*
    FROM character_equipment_items i
    JOIN user_equipment_instances latest ON latest.id=(
      SELECT x.id FROM user_equipment_instances x WHERE x.user_id=? AND x.equipment_id=i.id ORDER BY x.id DESC LIMIT 1
    )
    LEFT JOIN user_equipment_loadout l ON l.user_id=? AND l.slot=i.slot
    LEFT JOIN user_equipment_instances equipped ON equipped.id=l.instance_id AND equipped.user_id=l.user_id AND equipped.equipment_id=i.id
    JOIN user_equipment_instances representative ON representative.id=COALESCE(equipped.id,latest.id)
    WHERE ${admin?'1=1':'i.is_active=1 AND i.is_public=1'}
    ORDER BY i.slot,i.sort_order,latest.acquired_at DESC,representative.id DESC`).bind(userId,userId).all();
}

export async function equipmentQuantities(env,userId,afterEquipmentId=0){
  // PIPE-0920: 집계 테이블이 준비된 운영 DB 에서는 한 번에 전부 돌려준다(4개씩 나눌 이유가 없어진다).
  if(await equipmentCountsReady(env)){
    const result=await env.DB.prepare(`SELECT i.id AS equipment_id,COALESCE(c.quantity,0) AS quantity
      FROM character_equipment_items i LEFT JOIN ${EQUIPMENT_COUNTS_TABLE} c ON c.user_id=? AND c.equipment_id=i.id
      WHERE i.is_active=1 AND i.is_public=1 AND i.id>? ORDER BY i.id`).bind(userId,afterEquipmentId).all();
    return {quantities:result.results.map(row=>({equipmentId:Number(row.equipment_id),quantity:Number(row.quantity)})),nextEquipmentId:null};
  }
  // Keep acquired_at/source columns out of this aggregate so PostgreSQL can
  // count the covering index instead of scanning the 160M+ row heap.
  // Correlate by catalog item as well as user: a global GROUP BY can still
  // choose a whole-table scan when account sizes/statistics are uneven.
  const result=await env.DB.prepare(`WITH page AS MATERIALIZED (
      SELECT id FROM character_equipment_items WHERE is_active=1 AND is_public=1 AND id>? ORDER BY id LIMIT 4
    ) SELECT i.id AS equipment_id,
      (SELECT COUNT(*) FROM user_equipment_instances x WHERE x.user_id=? AND x.equipment_id=i.id) AS quantity
    FROM page i ORDER BY i.id`).bind(afterEquipmentId,userId).all();
  // Bound each request even while a large draw is inserting new copies and
  // PostgreSQL must check heap visibility. The screen fills counts in stages.
  return {quantities:result.results.map(row=>({equipmentId:Number(row.equipment_id),quantity:Number(row.quantity)})),
    nextEquipmentId:result.results.length===4?Number(result.results.at(-1).equipment_id):null};
}
