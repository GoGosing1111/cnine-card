export const BATTLE_SUIT_EBODY_PITY_V2059_VERSION=2059;
export const BATTLE_SUIT_EBODY_PITY_V2059_MARKER_KEY='battle_suit_ebody_pity_v2059_over_10_failures';
export const BATTLE_SUIT_EBODY_PITY_V2059_FAILURE_THRESHOLD=10;

const SNAPSHOT_TABLE='battle_suit_ebody_pity_v2059_snapshots';
const ACTION='BATTLE_SUIT_EBODY_PITY_V2059';
const SOURCE_TYPE='BATTLE_SUIT_PITY';

const pack=value=>JSON.stringify(value,(_,item)=>typeof item==='bigint'?Number(item):item);
const integer=(value,fallback=0)=>{const number=Number(value);return Number.isFinite(number)?Math.floor(number):fallback};
const check=(condition,message)=>{if(!condition)throw new Error(message)};
function completed(value,replayed=true){
  try{const parsed=typeof value==='string'?JSON.parse(value):value;return parsed?.status==='COMPLETED'?{...parsed,replayed}:null}catch{return null}
}

async function ensureFoundation(env){
  check(env.DB?.dialect==='postgres'&&env.DB.client&&typeof env.DB.enqueue==='function'&&typeof env.DB.execSchema==='function','E바디 천장 지급은 PostgreSQL 운영 DB에서만 실행할 수 있습니다.');
  await env.DB.execSchema([
    `CREATE TABLE IF NOT EXISTS ${SNAPSHOT_TABLE}(
      operation_key TEXT NOT NULL,user_id BIGINT NOT NULL,failure_count INTEGER NOT NULL CHECK(failure_count>${BATTLE_SUIT_EBODY_PITY_V2059_FAILURE_THRESHOLD}),
      equipment_id BIGINT NOT NULL,equipment_code TEXT NOT NULL,equipment_name TEXT NOT NULL,owned_before INTEGER NOT NULL DEFAULT 0,
      grant_request_id TEXT NOT NULL,created_at TEXT NOT NULL DEFAULT to_char(timezone('UTC',CURRENT_TIMESTAMP),'YYYY-MM-DD HH24:MI:SS'),
      PRIMARY KEY(operation_key,user_id),UNIQUE(grant_request_id))`,
    `CREATE INDEX IF NOT EXISTS idx_battle_suit_ebody_pity_v2059_equipment ON ${SNAPSHOT_TABLE}(equipment_id,user_id)`
  ]);
}

async function transaction(db,operation){
  return db.enqueue(async()=>{
    const query=async(text,values=[])=>{
      const result=await db.client.query({text,values});
      return{rows:result.rows||[],rowCount:Number(result.rowCount??result.affectedRows??0)};
    };
    await query('BEGIN');
    try{
      await query("SET LOCAL TIME ZONE 'UTC'");
      await query("SET LOCAL lock_timeout='5s'");
      await query("SET LOCAL statement_timeout='30s'");
      const result=await operation(query);
      await query('COMMIT');
      return result;
    }catch(error){
      try{await query('ROLLBACK')}catch{/* Preserve the original error. */}
      throw error;
    }
  });
}

export async function ensureBattleSuitEbodyPityV2059(env){
  await ensureFoundation(env);
  return transaction(env.DB,async query=>{
    const running=pack({status:'RUNNING',version:BATTLE_SUIT_EBODY_PITY_V2059_VERSION,startedAt:new Date().toISOString()});
    await query(`INSERT INTO app_meta(key,value,updated_at) VALUES($1,$2,CURRENT_TIMESTAMP) ON CONFLICT(key) DO NOTHING`,[BATTLE_SUIT_EBODY_PITY_V2059_MARKER_KEY,running]);
    const [marker]=await query('SELECT value FROM app_meta WHERE key=$1 FOR UPDATE',[BATTLE_SUIT_EBODY_PITY_V2059_MARKER_KEY]).then(result=>result.rows);
    const replay=completed(marker?.value,true);
    if(replay)return replay;

    const requiredTables=['users','character_equipment_items','user_equipment_instances','workshop_recipes_v1668','workshop_craft_logs_v1668','admin_logs'];
    const existingTables=await query(`SELECT table_name FROM information_schema.tables WHERE table_schema=current_schema() AND table_name=ANY($1::text[])`,[requiredTables]);
    check(existingTables.rows.length===requiredTables.length,'E바디 천장 지급에 필요한 운영 테이블이 모두 준비되지 않았습니다.');

    const candidates=await query(`SELECT i.id,i.code,i.name,COUNT(DISTINCT r.id)::integer recipe_count
      FROM character_equipment_items i
      JOIN workshop_recipes_v1668 r ON UPPER(TRIM(r.category))='BATTLE_SUIT_CRAFT'
        AND UPPER(TRIM(r.output_type))='EQUIPMENT' AND TRIM(r.output_ref)=CAST(i.id AS TEXT)
      WHERE UPPER(TRIM(i.slot))='BATTLE_SUIT' AND i.is_active=1
        AND LOWER(REGEXP_REPLACE(CONCAT_WS(' ',i.code,i.name,i.subtype,i.description,r.code,r.name,r.description),'[[:space:]_-]+','','g'))
          SIMILAR TO '%(e바디|ebody)%'
      GROUP BY i.id,i.code,i.name ORDER BY i.id`);
    check(candidates.rows.length===1,`활성 배틀슈트 E바디 장비를 정확히 한 개 식별하지 못했습니다. 후보 ${candidates.rows.length}개`);
    const equipment=candidates.rows[0],equipmentId=integer(equipment.id);
    check(equipmentId>0&&String(equipment.code||'').trim()&&String(equipment.name||'').trim(),'E바디 장비 식별값이 올바르지 않습니다.');
    const [owner]=await query("SELECT id FROM users WHERE UPPER(role)='OWNER' AND UPPER(status)='ACTIVE' ORDER BY id LIMIT 1").then(result=>result.rows);
    check(integer(owner?.id)>0,'E바디 천장 지급 감사 로그를 기록할 활성 OWNER 계정이 없습니다.');

    const [databaseClock]=await query('SELECT CURRENT_TIMESTAMP cutoff_at').then(result=>result.rows);
    const cutoffAt=new Date(databaseClock?.cutoff_at||Date.now()).toISOString();
    await query(`INSERT INTO ${SNAPSHOT_TABLE}(operation_key,user_id,failure_count,equipment_id,equipment_code,equipment_name,owned_before,grant_request_id)
      SELECT $1,l.user_id,COUNT(*)::integer,$2,$3,$4,
        (SELECT COUNT(*)::integer FROM user_equipment_instances owned WHERE owned.user_id=l.user_id AND owned.equipment_id=$2),
        $1||':'||CAST(l.user_id AS TEXT)
      FROM workshop_craft_logs_v1668 l JOIN users u ON u.id=l.user_id
      WHERE UPPER(TRIM(l.category))='BATTLE_SUIT_CRAFT' AND UPPER(TRIM(l.output_type))='EQUIPMENT'
        AND TRIM(l.output_ref)=CAST($2 AS TEXT) AND l.success=0
      GROUP BY l.user_id HAVING COUNT(*)>$5
      ON CONFLICT(operation_key,user_id) DO UPDATE SET failure_count=excluded.failure_count,equipment_id=excluded.equipment_id,
        equipment_code=excluded.equipment_code,equipment_name=excluded.equipment_name,owned_before=excluded.owned_before,grant_request_id=excluded.grant_request_id`,
      [BATTLE_SUIT_EBODY_PITY_V2059_MARKER_KEY,equipmentId,String(equipment.code),String(equipment.name),BATTLE_SUIT_EBODY_PITY_V2059_FAILURE_THRESHOLD]);

    const snapshotResult=await query(`SELECT user_id,failure_count,owned_before,grant_request_id FROM ${SNAPSHOT_TABLE}
      WHERE operation_key=$1 ORDER BY user_id FOR UPDATE`,[BATTLE_SUIT_EBODY_PITY_V2059_MARKER_KEY]);
    const snapshots=snapshotResult.rows;
    check(snapshots.every(row=>integer(row.failure_count)>BATTLE_SUIT_EBODY_PITY_V2059_FAILURE_THRESHOLD),'E바디 천장 대상 스냅샷에 기준 미달 계정이 포함됐습니다.');

    const inserted=await query(`INSERT INTO user_equipment_instances(user_id,equipment_id,source_type,source_id,request_id)
      SELECT s.user_id,s.equipment_id,$2,$1,s.grant_request_id FROM ${SNAPSHOT_TABLE} s
      WHERE s.operation_key=$1 AND NOT EXISTS(
        SELECT 1 FROM user_equipment_instances owned WHERE owned.user_id=s.user_id AND owned.equipment_id=s.equipment_id
          AND owned.source_type=$2 AND owned.source_id=$1 AND owned.request_id=s.grant_request_id)
      RETURNING user_id`,[BATTLE_SUIT_EBODY_PITY_V2059_MARKER_KEY,SOURCE_TYPE]);
    check(inserted.rowCount===snapshots.length,'E바디 천장 대상 수와 실제 지급 수가 달라 전체 지급을 취소했습니다.');

    const [verification]=await query(`SELECT COUNT(*)::integer grant_count,COUNT(DISTINCT x.user_id)::integer account_count
      FROM user_equipment_instances x JOIN ${SNAPSHOT_TABLE} s ON s.operation_key=$1 AND s.user_id=x.user_id
        AND s.equipment_id=x.equipment_id AND s.grant_request_id=x.request_id
      WHERE x.source_type=$2 AND x.source_id=$1`,[BATTLE_SUIT_EBODY_PITY_V2059_MARKER_KEY,SOURCE_TYPE]).then(result=>result.rows);
    check(integer(verification?.grant_count)===snapshots.length&&integer(verification?.account_count)===snapshots.length,'E바디 천장 지급 최종 검증에 실패했습니다.');

    const alreadyOwnedAccounts=snapshots.filter(row=>integer(row.owned_before)>0).length;
    const failureCountTotal=snapshots.reduce((sum,row)=>sum+integer(row.failure_count),0);
    const summary={
      status:'COMPLETED',version:BATTLE_SUIT_EBODY_PITY_V2059_VERSION,completedAt:new Date().toISOString(),cutoffAt,
      oneTime:true,failureThresholdExclusive:BATTLE_SUIT_EBODY_PITY_V2059_FAILURE_THRESHOLD,minimumFailures:BATTLE_SUIT_EBODY_PITY_V2059_FAILURE_THRESHOLD+1,
      equipment:{id:equipmentId,code:String(equipment.code),name:String(equipment.name)},eligibleAccounts:snapshots.length,
      grantedQuantity:snapshots.length,alreadyOwnedAccounts,failureCountTotal,snapshotRows:snapshots.length,
      verification:{completedFailuresOnly:true,exactlyOnePerEligibleAccount:true,existingOwnershipDoesNotBlock:true,idempotent:true},replayed:false
    };
    await query(`INSERT INTO admin_logs(admin_id,action_type,target_type,target_id,before_data,after_data)
      VALUES($1,$2,'EQUIPMENT_BATCH',$3,$4,$5)`,[integer(owner.id),ACTION,BATTLE_SUIT_EBODY_PITY_V2059_MARKER_KEY,
      pack({cutoffAt,minimumFailures:BATTLE_SUIT_EBODY_PITY_V2059_FAILURE_THRESHOLD+1,equipmentId,snapshotTable:SNAPSHOT_TABLE}),pack(summary)]);
    await query('UPDATE app_meta SET value=$2,updated_at=CURRENT_TIMESTAMP WHERE key=$1',[BATTLE_SUIT_EBODY_PITY_V2059_MARKER_KEY,pack(summary)]);
    console.log(ACTION,pack({status:summary.status,version:summary.version,equipmentCode:summary.equipment.code,eligibleAccounts:summary.eligibleAccounts,grantedQuantity:summary.grantedQuantity}));
    return summary;
  });
}

export const __battleSuitEbodyPityV2059Test=Object.freeze({SNAPSHOT_TABLE,SOURCE_TYPE,ACTION});
