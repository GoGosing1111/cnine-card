import {equipmentCountsReady} from './_equipment_counts_v1.js';

// Duplicate instances never need to leave the database. The live ownership
// summary covers unenhanced gear; only sparse forge/loadout rows need instances.
export async function readDuoEquipment(env,ids){
 const marks=ids.map(()=>'?').join(','),slots="i.is_active=1 AND i.slot IN('WEAPON','TOP','BOTTOM','SHOES','ACCESSORY')";
 if(await equipmentCountsReady(env))return env.DB.prepare(`WITH growth AS MATERIALIZED (
   SELECT user_id,instance_id,level FROM equipment_forge_states_v1 WHERE user_id IN (${marks}) AND level>0
  ), enhanced AS (
   SELECT s.user_id,x.equipment_id,s.level,COUNT(*) AS quantity
   FROM growth s JOIN user_equipment_instances x ON x.id=s.instance_id AND x.user_id=s.user_id
   GROUP BY s.user_id,x.equipment_id,s.level
  )
  SELECT c.user_id,i.slot,i.total_power,i.pvp_power,0 AS level,0 AS equipped_count
  FROM user_equipment_counts_v1 c JOIN character_equipment_items i ON i.id=c.equipment_id
  WHERE c.user_id IN (${marks}) AND ${slots} AND c.quantity>COALESCE((SELECT SUM(e.quantity) FROM enhanced e WHERE e.user_id=c.user_id AND e.equipment_id=c.equipment_id),0)
  UNION ALL
  SELECT e.user_id,i.slot,i.total_power,i.pvp_power,e.level,0 AS equipped_count
  FROM enhanced e JOIN character_equipment_items i ON i.id=e.equipment_id WHERE ${slots}
  UNION ALL
  SELECT l.user_id,i.slot,i.total_power,i.pvp_power,COALESCE(s.level,0) AS level,1 AS equipped_count
  FROM user_equipment_loadout l JOIN user_equipment_instances x ON x.id=l.instance_id AND x.user_id=l.user_id
  JOIN character_equipment_items i ON i.id=x.equipment_id
  LEFT JOIN equipment_forge_states_v1 s ON s.instance_id=x.id AND s.user_id=x.user_id
  WHERE l.user_id IN (${marks}) AND ${slots}`).bind(...ids,...ids,...ids).all();
 // Before ownership-summary backfill (and SQLite), aggregate equal powers in
 // SQL rather than truncating the first 65,536 instances or returning them all.
 return env.DB.prepare(`SELECT x.user_id,i.slot,i.total_power,i.pvp_power,COALESCE(s.level,0) AS level,
  SUM(CASE WHEN l.instance_id IS NULL THEN 0 ELSE 1 END) AS equipped_count
  FROM user_equipment_instances x JOIN character_equipment_items i ON i.id=x.equipment_id
  LEFT JOIN equipment_forge_states_v1 s ON s.instance_id=x.id AND s.user_id=x.user_id
  LEFT JOIN user_equipment_loadout l ON l.user_id=x.user_id AND l.instance_id=x.id
  WHERE x.user_id IN (${marks}) AND ${slots}
  GROUP BY x.user_id,i.slot,i.total_power,i.pvp_power,COALESCE(s.level,0)`).bind(...ids).all();
}
