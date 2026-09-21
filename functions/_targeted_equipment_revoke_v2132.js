export const TARGETED_EQUIPMENT_REVOKE_V2132_VERSION=2132;
export const TARGETED_EQUIPMENT_REVOKE_V2132_MARKER_KEY='targeted_equipment_revoke_v2132_jinjja_diem_z_body';
export const TARGETED_EQUIPMENT_REVOKE_V2132_NICKNAME='진짜디임';
export const TARGETED_EQUIPMENT_REVOKE_V2132_EQUIPMENT_CODE='BATTLE_SUIT_Z_BODY';

const ACTION='SYSTEM_EQUIPMENT_REVOKE_V2132';
const REASON='사용자 요청 · 진짜디임 Z-BODY 전량 회수';
const AUDIT_TABLE='targeted_equipment_revoke_v2132_audit';
const VERIFICATION_TABLE='targeted_equipment_revoke_v2132_verifications';

function rows(result){return result?.results||[]}
function integer(value,fallback=0){const number=Number(value);return Number.isFinite(number)?Math.floor(number):fallback}
function safeJson(value,fallback){try{const parsed=typeof value==='string'?JSON.parse(value):value;return parsed??fallback}catch{return fallback}}
function completedSummary(row,{replayed=true}={}){const parsed=safeJson(row?.value,null);return parsed?.status==='COMPLETED'?{...parsed,replayed}:null}

async function ensureFoundation(env){
  const postgres=env.DB?.dialect==='postgres';
  const nowDefault=postgres?"to_char(timezone('UTC',CURRENT_TIMESTAMP),'YYYY-MM-DD HH24:MI:SS')":'CURRENT_TIMESTAMP';
  const schema=[
    `CREATE TABLE IF NOT EXISTS ${AUDIT_TABLE}(
      operation_key TEXT NOT NULL,instance_id BIGINT NOT NULL,user_id BIGINT NOT NULL,equipment_id BIGINT NOT NULL,
      equipment_code TEXT NOT NULL,equipment_name TEXT NOT NULL DEFAULT '',source_type TEXT NOT NULL DEFAULT '',
      source_id TEXT NOT NULL DEFAULT '',request_id TEXT,was_equipped INTEGER NOT NULL DEFAULT 0,
      forge_level INTEGER NOT NULL DEFAULT 0,forge_revision INTEGER NOT NULL DEFAULT 0,acquired_at TEXT,
      recalled_at TEXT NOT NULL DEFAULT ${nowDefault},PRIMARY KEY(operation_key,instance_id))`,
    `CREATE TABLE IF NOT EXISTS ${VERIFICATION_TABLE}(
      operation_key TEXT PRIMARY KEY,verified INTEGER NOT NULL CHECK(verified=1),detail TEXT NOT NULL DEFAULT '',
      created_at TEXT NOT NULL DEFAULT ${nowDefault})`
  ];
  if(postgres&&typeof env.DB.execSchema==='function')await env.DB.execSchema(schema);
  else await env.DB.batch(schema.map(sql=>env.DB.prepare(sql)));
}

async function currentOwnership(env,userId){
  const result=await env.DB.prepare(`SELECT x.id,x.user_id,x.equipment_id,x.source_type,x.source_id,x.request_id,x.acquired_at,
    i.code equipment_code,i.name equipment_name,
    CASE WHEN l.instance_id IS NULL THEN 0 ELSE 1 END was_equipped,
    COALESCE(s.level,0) forge_level,COALESCE(s.revision,0) forge_revision
    FROM user_equipment_instances x JOIN character_equipment_items i ON i.id=x.equipment_id
    LEFT JOIN user_equipment_loadout l ON l.user_id=x.user_id AND l.instance_id=x.id
    LEFT JOIN equipment_forge_states_v1 s ON s.user_id=x.user_id AND s.instance_id=x.id
    WHERE x.user_id=? AND i.code=? ORDER BY x.id`).bind(userId,TARGETED_EQUIPMENT_REVOKE_V2132_EQUIPMENT_CODE).all();
  return rows(result);
}

export async function ensureTargetedEquipmentRevokeV2132(env){
  await ensureFoundation(env);

  const existing=completedSummary(await env.DB.prepare('SELECT value FROM app_meta WHERE key=?').bind(TARGETED_EQUIPMENT_REVOKE_V2132_MARKER_KEY).first());
  if(existing){
    const users=rows(await env.DB.prepare('SELECT id FROM users WHERE nickname=? AND UPPER(status)=\'ACTIVE\' ORDER BY id LIMIT 2').bind(TARGETED_EQUIPMENT_REVOKE_V2132_NICKNAME).all());
    const remaining=users.length===1?await currentOwnership(env,users[0].id):[];
    return{...existing,ownershipVerified:users.length===1&&remaining.length===0};
  }

  const [usersResult,item,owner]=await Promise.all([
    env.DB.prepare('SELECT id,nickname,role,status FROM users WHERE nickname=? ORDER BY id LIMIT 2').bind(TARGETED_EQUIPMENT_REVOKE_V2132_NICKNAME).all(),
    env.DB.prepare('SELECT id,code,name,slot,is_active isActive FROM character_equipment_items WHERE code=?').bind(TARGETED_EQUIPMENT_REVOKE_V2132_EQUIPMENT_CODE).first(),
    env.DB.prepare("SELECT id FROM users WHERE UPPER(role)='OWNER' AND UPPER(status)='ACTIVE' ORDER BY id LIMIT 1").first()
  ]);
  const users=rows(usersResult);
  if(users.length!==1)throw new Error('지정 대상 계정을 정확히 한 개 찾지 못해 Z-BODY 회수를 중단했습니다.');
  const user=users[0],userId=integer(user.id),ownerId=integer(owner?.id),equipmentId=integer(item?.id);
  if(!userId||String(user.nickname||'')!==TARGETED_EQUIPMENT_REVOKE_V2132_NICKNAME||String(user.status||'').trim().toUpperCase()!=='ACTIVE'){
    throw new Error('지정 대상 계정이 활성 계정으로 확인되지 않아 Z-BODY 회수를 중단했습니다.');
  }
  if(!ownerId)throw new Error('Z-BODY 회수 감사 로그를 기록할 활성 OWNER 계정을 찾지 못했습니다.');
  if(!equipmentId||String(item.code||'')!==TARGETED_EQUIPMENT_REVOKE_V2132_EQUIPMENT_CODE||String(item.slot||'')!=='BATTLE_SUIT'){
    throw new Error('회수 대상 Z-BODY 카탈로그가 정확히 확인되지 않아 회수를 중단했습니다.');
  }

  const instances=await currentOwnership(env,userId),removedQuantity=instances.length;
  const unequippedQuantity=instances.filter(instance=>integer(instance.was_equipped)===1).length;
  const forgedQuantity=instances.filter(instance=>integer(instance.forge_level)>0||integer(instance.forge_revision)>0).length;
  const summary={
    status:'COMPLETED',version:TARGETED_EQUIPMENT_REVOKE_V2132_VERSION,completedAt:new Date().toISOString(),
    equipmentCode:TARGETED_EQUIPMENT_REVOKE_V2132_EQUIPMENT_CODE,removedQuantity,unequippedQuantity,forgedQuantity,
    alreadyAbsent:removedQuantity===0,ownershipVerified:true
  };
  const runningValue=JSON.stringify({status:'RUNNING',version:TARGETED_EQUIPMENT_REVOKE_V2132_VERSION,nonce:crypto.randomUUID(),startedAt:new Date().toISOString()});
  const completedValue=JSON.stringify(summary),targetId=`${userId}:${TARGETED_EQUIPMENT_REVOKE_V2132_EQUIPMENT_CODE}`;
  const beforeAudit=JSON.stringify({operationKey:TARGETED_EQUIPMENT_REVOKE_V2132_MARKER_KEY,actor:'SYSTEM_MIGRATION',reason:REASON,instances});
  const afterAudit=JSON.stringify({operationKey:TARGETED_EQUIPMENT_REVOKE_V2132_MARKER_KEY,actor:'SYSTEM_MIGRATION',reason:REASON,
    equipmentCode:TARGETED_EQUIPMENT_REVOKE_V2132_EQUIPMENT_CODE,removedQuantity,unequippedQuantity,forgedQuantity,remainingQuantity:0});
  const guard='EXISTS(SELECT 1 FROM app_meta WHERE key=? AND value=?)';
  const guarded=(sql,...values)=>env.DB.prepare(sql.replaceAll('{GUARD}',guard)).bind(...values,TARGETED_EQUIPMENT_REVOKE_V2132_MARKER_KEY,runningValue);
  const rowLock=env.DB?.dialect==='postgres'?' FOR UPDATE':'';
  const preflightKey=`${TARGETED_EQUIPMENT_REVOKE_V2132_MARKER_KEY}:preflight`,finalKey=`${TARGETED_EQUIPMENT_REVOKE_V2132_MARKER_KEY}:final`;
  const targetCondition=`EXISTS(SELECT 1 FROM users WHERE id=? AND nickname=? AND UPPER(status)='ACTIVE')
    AND NOT EXISTS(SELECT 1 FROM users WHERE id<>? AND nickname=?)
    AND EXISTS(SELECT 1 FROM users WHERE id=? AND UPPER(role)='OWNER' AND UPPER(status)='ACTIVE')
    AND EXISTS(SELECT 1 FROM character_equipment_items WHERE id=? AND code=? AND slot='BATTLE_SUIT')`;
  const targetValues=[userId,TARGETED_EQUIPMENT_REVOKE_V2132_NICKNAME,userId,TARGETED_EQUIPMENT_REVOKE_V2132_NICKNAME,
    ownerId,equipmentId,TARGETED_EQUIPMENT_REVOKE_V2132_EQUIPMENT_CODE];
  const verified=(key)=>`EXISTS(SELECT 1 FROM ${VERIFICATION_TABLE} WHERE operation_key='${key}' AND verified=1)`;
  const statements=[
    env.DB.prepare('INSERT OR IGNORE INTO app_meta(key,value,updated_at) VALUES(?,?,CURRENT_TIMESTAMP)').bind(TARGETED_EQUIPMENT_REVOKE_V2132_MARKER_KEY,runningValue),
    env.DB.prepare(`SELECT id FROM users WHERE id=? AND nickname=? AND UPPER(status)='ACTIVE'${rowLock}`).bind(userId,TARGETED_EQUIPMENT_REVOKE_V2132_NICKNAME),
    env.DB.prepare(`SELECT id FROM users WHERE id=? AND UPPER(role)='OWNER' AND UPPER(status)='ACTIVE'${rowLock}`).bind(ownerId),
    env.DB.prepare(`SELECT id FROM character_equipment_items WHERE id=? AND code=? AND slot='BATTLE_SUIT'${rowLock}`).bind(equipmentId,TARGETED_EQUIPMENT_REVOKE_V2132_EQUIPMENT_CODE),
    env.DB.prepare(`SELECT x.id FROM user_equipment_instances x WHERE x.user_id=? AND x.equipment_id=? ORDER BY x.id${rowLock}`).bind(userId,equipmentId),
    guarded(`INSERT INTO ${VERIFICATION_TABLE}(operation_key,verified,detail)
      SELECT ?,CASE WHEN ${targetCondition}
        AND (SELECT COUNT(*) FROM user_equipment_instances WHERE user_id=? AND equipment_id=?)=?
        THEN 1 ELSE 0 END,? WHERE {GUARD}`,
      preflightKey,...targetValues,userId,equipmentId,removedQuantity,JSON.stringify({actor:'SYSTEM_MIGRATION',targetVerified:true,removedQuantity}))
  ];

  for(const instance of instances){
    statements.push(guarded(`INSERT OR IGNORE INTO ${AUDIT_TABLE}(
      operation_key,instance_id,user_id,equipment_id,equipment_code,equipment_name,source_type,source_id,request_id,
      was_equipped,forge_level,forge_revision,acquired_at)
      SELECT ?,x.id,x.user_id,x.equipment_id,i.code,i.name,x.source_type,x.source_id,x.request_id,
        CASE WHEN l.instance_id IS NULL THEN 0 ELSE 1 END,COALESCE(s.level,0),COALESCE(s.revision,0),x.acquired_at
      FROM user_equipment_instances x JOIN character_equipment_items i ON i.id=x.equipment_id
      LEFT JOIN user_equipment_loadout l ON l.user_id=x.user_id AND l.instance_id=x.id
      LEFT JOIN equipment_forge_states_v1 s ON s.user_id=x.user_id AND s.instance_id=x.id
      WHERE x.id=? AND x.user_id=? AND x.equipment_id=? AND i.code=? AND ${verified(preflightKey)} AND {GUARD}`,
      TARGETED_EQUIPMENT_REVOKE_V2132_MARKER_KEY,instance.id,userId,equipmentId,TARGETED_EQUIPMENT_REVOKE_V2132_EQUIPMENT_CODE));
  }

  statements.push(
    guarded(`DELETE FROM user_equipment_loadout WHERE user_id=? AND instance_id IN(
      SELECT id FROM user_equipment_instances WHERE user_id=? AND equipment_id=?) AND ${verified(preflightKey)} AND {GUARD}`,
      userId,userId,equipmentId),
    guarded(`DELETE FROM equipment_forge_states_v1 WHERE user_id=? AND instance_id IN(
      SELECT id FROM user_equipment_instances WHERE user_id=? AND equipment_id=?) AND ${verified(preflightKey)} AND {GUARD}`,
      userId,userId,equipmentId),
    guarded(`DELETE FROM user_equipment_instances WHERE user_id=? AND equipment_id=? AND ${verified(preflightKey)} AND {GUARD}`,
      userId,equipmentId),
    guarded(`INSERT INTO admin_logs(admin_id,action_type,target_type,target_id,before_data,after_data)
      SELECT ?,?,'USER_EQUIPMENT',?,?,? WHERE ${targetCondition}
        AND NOT EXISTS(SELECT 1 FROM user_equipment_instances WHERE user_id=? AND equipment_id=?)
        AND (SELECT COUNT(*) FROM ${AUDIT_TABLE} WHERE operation_key=?)=?
        AND NOT EXISTS(SELECT 1 FROM admin_logs WHERE action_type=? AND target_type='USER_EQUIPMENT' AND target_id=? AND after_data=?)
        AND ${verified(preflightKey)} AND {GUARD}`,
      ownerId,ACTION,targetId,beforeAudit,afterAudit,...targetValues,userId,equipmentId,TARGETED_EQUIPMENT_REVOKE_V2132_MARKER_KEY,removedQuantity,
      ACTION,targetId,afterAudit),
    guarded(`INSERT INTO ${VERIFICATION_TABLE}(operation_key,verified,detail)
      SELECT ?,CASE WHEN ${targetCondition}
        AND NOT EXISTS(SELECT 1 FROM user_equipment_instances WHERE user_id=? AND equipment_id=?)
        AND NOT EXISTS(SELECT 1 FROM user_equipment_loadout WHERE user_id=? AND instance_id IN(
          SELECT instance_id FROM ${AUDIT_TABLE} WHERE operation_key=?))
        AND NOT EXISTS(SELECT 1 FROM equipment_forge_states_v1 WHERE user_id=? AND instance_id IN(
          SELECT instance_id FROM ${AUDIT_TABLE} WHERE operation_key=?))
        AND (SELECT COUNT(*) FROM ${AUDIT_TABLE} WHERE operation_key=?)=?
        AND EXISTS(SELECT 1 FROM admin_logs WHERE action_type=? AND target_type='USER_EQUIPMENT' AND target_id=? AND after_data=?)
        THEN 1 ELSE 0 END,? WHERE ${verified(preflightKey)} AND {GUARD}`,
      finalKey,...targetValues,userId,equipmentId,userId,TARGETED_EQUIPMENT_REVOKE_V2132_MARKER_KEY,
      userId,TARGETED_EQUIPMENT_REVOKE_V2132_MARKER_KEY,TARGETED_EQUIPMENT_REVOKE_V2132_MARKER_KEY,removedQuantity,
      ACTION,targetId,afterAudit,completedValue),
    guarded(`UPDATE app_meta SET value=?,updated_at=CURRENT_TIMESTAMP WHERE key=? AND value=?
      AND ${verified(finalKey)} AND {GUARD}`,
      completedValue,TARGETED_EQUIPMENT_REVOKE_V2132_MARKER_KEY,runningValue)
  );

  const results=await env.DB.batch(statements);
  if(Number(results[0]?.meta?.changes||0)===0){
    const replay=completedSummary(await env.DB.prepare('SELECT value FROM app_meta WHERE key=?').bind(TARGETED_EQUIPMENT_REVOKE_V2132_MARKER_KEY).first());
    if(replay)return replay;
    return{status:'RUNNING',version:TARGETED_EQUIPMENT_REVOKE_V2132_VERSION,replayed:true};
  }
  const stored=completedSummary(await env.DB.prepare('SELECT value FROM app_meta WHERE key=?').bind(TARGETED_EQUIPMENT_REVOKE_V2132_MARKER_KEY).first(),{replayed:false});
  if(!stored)throw new Error('진짜디임 Z-BODY 회수 결과를 최종 검증하지 못했습니다.');
  console.log('TARGETED_EQUIPMENT_REVOKE_V2132',JSON.stringify({status:stored.status,version:stored.version,equipmentCode:stored.equipmentCode,
    removedQuantity:stored.removedQuantity,unequippedQuantity:stored.unequippedQuantity,ownershipVerified:stored.ownershipVerified,replayed:stored.replayed}));
  return stored;
}
