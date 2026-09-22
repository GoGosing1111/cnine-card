import {equipmentCountsReady,EQUIPMENT_COUNTS_TABLE} from './_equipment_counts_v1.js';
import {FORGE_RUNTIME_RELEASE_ENABLED} from '../shared/equipment-forge-release-v1.mjs';
import {EQUIPMENT_POWER_STANDARD} from '../shared/equipment-mercenary-power-v1.mjs';
import {forgePower} from '../shared/equipment-forge-policy-v1.mjs';

// Keep duplicate copies stacked, but never combine different enhancement levels.
// Each stack carries a REAL owned instance ID; prefer the equipped copy within
// that level so changing the display never changes a player's loadout.
export async function equipmentEnhancementRows(env,userId,rows,{admin=false}={}){
  if(!FORGE_RUNTIME_RELEASE_ENABLED||!rows.length)return rows;
  const enhanced=(await env.DB.prepare(`WITH growth AS MATERIALIZED (
      SELECT instance_id,level FROM equipment_forge_states_v1 WHERE user_id=? AND level>0
    ),groups AS (
      SELECT x.equipment_id,s.level,COUNT(*) AS quantity,
        COALESCE(MAX(CASE WHEN l.instance_id=x.id THEN x.id END),MAX(x.id)) AS instance_id
      FROM growth s JOIN user_equipment_instances x ON x.id=s.instance_id AND x.user_id=?
      JOIN character_equipment_items i ON i.id=x.equipment_id
      LEFT JOIN user_equipment_loadout l ON l.user_id=x.user_id AND l.slot=i.slot AND l.instance_id=x.id
      WHERE i.slot IN (${EQUIPMENT_POWER_STANDARD.supportedSlots.map(()=>'?').join(',')}) ${admin?'':'AND i.is_active=1 AND i.is_public=1'}
      GROUP BY x.equipment_id,s.level
    ) SELECT g.instance_id,g.level AS enhancement_level,g.quantity,x.source_type,x.source_id,x.acquired_at,i.*
      FROM groups g JOIN user_equipment_instances x ON x.id=g.instance_id
      JOIN character_equipment_items i ON i.id=g.equipment_id`).bind(userId,userId,...EQUIPMENT_POWER_STANDARD.supportedSlots).all()).results;
  if(!enhanced.length)return rows;
  const counts=new Map();for(const row of enhanced)counts.set(Number(row.id),(counts.get(Number(row.id))||0)+Number(row.quantity));
  const ids=[...counts.keys()];
  // Only affected catalog types need a new level-zero representative. The
  // indexed top-one lookup avoids loading every unenhanced duplicate.
  const base=(await env.DB.prepare(`SELECT i.id AS equipment_id,x.id AS instance_id,x.source_type,x.source_id,x.acquired_at
    FROM character_equipment_items i JOIN user_equipment_instances x ON x.id=(
      SELECT b.id FROM user_equipment_instances b WHERE b.user_id=? AND b.equipment_id=i.id
        AND NOT EXISTS(SELECT 1 FROM equipment_forge_states_v1 s WHERE s.instance_id=b.id AND s.user_id=b.user_id AND s.level>0)
      ORDER BY b.user_id DESC,b.equipment_id DESC,b.id DESC LIMIT 1
    ) WHERE i.id IN (${ids.map(()=>'?').join(',')})`).bind(userId,...ids).all()).results;
  const baseById=new Map(base.map(row=>[Number(row.equipment_id),row]));
  const equippedLevels=new Set(enhanced.map(row=>String(row.instance_id)));
  const output=[];
  for(const row of rows){
    const offset=counts.get(Number(row.id));if(!offset){output.push(row);continue;}
    const plain=baseById.get(Number(row.id));if(!plain)continue;
    // If the original representative is enhanced, use the unenhanced copy;
    // otherwise retain it (notably a currently equipped level-zero copy).
    const representative=equippedLevels.has(String(row.instance_id))?plain:row;
    output.push({...row,instance_id:representative.instance_id,source_type:representative.source_type,source_id:representative.source_id,
      acquired_at:representative.acquired_at,quantity:row.quantity==null?null:Math.max(0,Number(row.quantity)-offset),quantityOffset:offset,enhancement:{level:0}});
  }
  for(const row of enhanced){
    const power=forgePower(Number(row.total_power),Number(row.enhancement_level));
    output.push({...row,total_power:power.total,pve_power:power.pve,pvp_power:power.pvp,
      quantity:Number(row.quantity),quantityFixed:true,enhancement:{level:Number(row.enhancement_level)}});
  }
  return output;
}

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
