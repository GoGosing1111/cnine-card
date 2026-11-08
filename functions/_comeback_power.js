import {equipmentCountsReady} from './_equipment_counts_v1.js';
import {readForgeAdvancedForLevels} from './_equipment_forge_advanced.js';
import {forgePower} from '../shared/equipment-forge-policy-v1.mjs';
import {battleConfig,mercenarySnapshotPower,readMercenaryDocument,readMercenaryRuntime} from './_mercenary_account.js';
import {attachReleasedMercenaryLevels} from './_mercenary_level_policy.js';
import {ownedCardCollectionPower} from './_magic.js';

export const COMEBACK_POWER_LIMIT=8500000;

// The summary counts all instances. Only enhanced instances need individual lookups.
// SQLite and installations awaiting the summary backfill read the same holdings directly.
async function equipmentPower(env,id){
  const DB=env.DB;
  const sql=await equipmentCountsReady(env)?`WITH enhanced AS MATERIALIZED (
    SELECT x.equipment_id,MAX(f.level) level FROM equipment_forge_states_v1 f
    JOIN user_equipment_instances x ON x.id=f.instance_id AND x.user_id=f.user_id
    WHERE f.user_id=? AND f.level>0 GROUP BY x.equipment_id)
    SELECT i.slot,i.total_power,COALESCE(e.level,0) level FROM user_equipment_counts_v1 c
    JOIN character_equipment_items i ON i.id=c.equipment_id AND i.is_active=1 AND i.slot<>'BATTLE_SUIT'
    LEFT JOIN enhanced e ON e.equipment_id=i.id WHERE c.user_id=? AND c.quantity>0`:
    `SELECT i.slot,i.total_power,COALESCE(MAX(f.level),0) level FROM user_equipment_instances x
    JOIN character_equipment_items i ON i.id=x.equipment_id AND i.is_active=1 AND i.slot<>'BATTLE_SUIT'
    LEFT JOIN equipment_forge_states_v1 f ON f.user_id=? AND f.instance_id=x.id
    WHERE x.user_id=? GROUP BY i.id,i.slot,i.total_power`;
  const {results}=await DB.prepare(sql).bind(id,id).all();
  const advanced=await readForgeAdvancedForLevels(DB,results);
  return results.reduce((sum,item)=>sum+(Number(item.level)>0?forgePower(Number(item.total_power),Number(item.level),advanced).total:Number(item.total_power)),0);
}

async function mercenaryPower(env,id){
  const {results}=await env.DB.prepare('SELECT mercenary_code FROM user_mercenary_cards_v1 WHERE user_id=? AND total_copies>0').bind(id).all();
  if(!results.length)return 0;
  const [{document},runtime]=await Promise.all([readMercenaryDocument(env),readMercenaryRuntime(env)]);
  const roster=[];
  for(const row of results){
    try{roster.push({...battleConfig(document,row.mercenary_code,1),combat:runtime.combat});}
    catch(e){if(e.code!=='MERCENARY_STATS_PENDING')throw e;}
  }
  const leveled=roster.some(m=>m.statMode!=='RANK_FIXED')?(await attachReleasedMercenaryLevels(env,new Map([[id,roster]]))).get(id):roster;
  return leveled.reduce((sum,m)=>sum+mercenarySnapshotPower(m),0);
}

async function collectionCardPower(env,id,deps){
  const [{results:cards},settings]=await Promise.all([
    env.DB.prepare(`SELECT c.id,c.title,c.rarity,c.power_type,c.base_power,u.breakthrough_level
      FROM user_cards u JOIN cards_effective_v1210 c ON c.id=u.card_id WHERE u.user_id=? AND u.quantity>0`).bind(id).all(),
    deps.readBattleSettings(env)
  ]);
  if(!cards.length)return 0;
  const valued=cards.map(card=>({...card,power:deps.cardBattlePower(card,Number(card.breakthrough_level),settings)}));
  return ownedCardCollectionPower(env,{id,role:'USER'},valued);
}

export async function comebackOwnedPower(env,id,deps){
  const DB=env.DB;
  const [equipment,cards,mercenaries,other,avatars]=await Promise.all([
    equipmentPower(env,id),collectionCardPower(env,id,deps),mercenaryPower(env,id),
    DB.prepare(`SELECT
      (SELECT COALESCE(SUM(g.total_power),0) FROM user_garage_vehicles o JOIN character_garage_items g ON g.id=o.garage_id AND g.is_active=1 WHERE o.user_id=?) vehicles,
      (SELECT COALESCE(SUM(t.pve_power),0) FROM user_character_titles o JOIN character_titles t ON t.id=o.title_id AND t.is_active=1 WHERE o.user_id=? AND (NULLIF(o.expires_at,'') IS NULL OR SUBSTR(REPLACE(o.expires_at,'T',' '),1,19)>CURRENT_TIMESTAMP)) titles`).bind(id,id).first(),
    DB.prepare(`SELECT a.code,a.effect_type,a.effect_value,e.effect_type option_type,e.effect_value option_value,s.value settings FROM avatar_user_ownership_v1 o
      JOIN avatar_catalog_v1 a ON a.code=o.avatar_code AND a.is_active=1
      JOIN app_meta s ON s.key='avatar_settings_v1'
      LEFT JOIN avatar_effect_options_v1 e ON e.avatar_code=a.code AND e.effect_type IN ('BATTLE_POWER_PERCENT','BATTLE_POWER_BASIS_POINTS')
      WHERE o.user_id=? AND (NULLIF(o.expires_at,'') IS NULL OR SUBSTR(REPLACE(o.expires_at,'T',' '),1,19)>CURRENT_TIMESTAMP)`).bind(id).all()
  ]);
  const percents=new Map();
  for(const a of avatars.results){
    if(JSON.parse(a.settings).mode!=='ON')continue;
    const type=a.option_type||a.effect_type,v=Number(a.option_value??a.effect_value);
    const pct=type==='BATTLE_POWER_PERCENT'?v:type==='BATTLE_POWER_BASIS_POINTS'?v/100:0;
    percents.set(a.code,Math.max(percents.get(a.code)||0,pct));
  }
  const avatarPercent=[...percents.values()].reduce((a,b)=>a+b,0);
  const vehicles=Number(other.vehicles),titles=Number(other.titles),subtotal=equipment+cards+mercenaries+vehicles+titles;
  const avatar=Math.round(subtotal*avatarPercent/100),total=subtotal+avatar;
  if(![equipment,cards,mercenaries,vehicles,titles,avatar,total].every(n=>Number.isSafeInteger(n)&&n>=0))throw Error('INVALID_COMEBACK_POWER');
  return {equipment,cards,mercenaries,vehicles,titles,avatar,avatarPercent,total};
}

export const attendanceSql=`(SELECT CASE WHEN COUNT(l.user_id)>COALESCE(MAX(s.total_days),0)+COUNT(CASE WHEN l.attendance_date>s.last_attendance_date THEN 1 END)
  THEN COUNT(l.user_id) ELSE COALESCE(MAX(s.total_days),0)+COUNT(CASE WHEN l.attendance_date>s.last_attendance_date THEN 1 END) END
  FROM users a LEFT JOIN user_attendance_summary_v1401 s ON s.user_id=a.id LEFT JOIN attendance_logs l ON l.user_id=a.id WHERE a.id=?)`;
