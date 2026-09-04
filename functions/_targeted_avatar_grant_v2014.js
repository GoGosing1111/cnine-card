export const TARGETED_AVATAR_GRANT_VERSION=2014;
export const TARGETED_AVATAR_GRANT_MARKER_KEY='targeted_avatar_grant_v2014_joeun_terran_empress_joeun';
export const TARGETED_AVATAR_GRANT_NICKNAME='조은';
export const TARGETED_AVATAR_GRANT_CODE='TERRAN_EMPRESS_JOEUN';

const TARGETED_AVATAR_GRANT_NAME='테란여제 조은';
const TARGETED_AVATAR_GRANT_ACTION='SYSTEM_AVATAR_GRANT_V2014';
const TARGETED_AVATAR_GRANT_VERIFICATION_TABLE='targeted_avatar_grant_v2014_verifications';

function rows(result){return result?.results||[]}
function integer(value,fallback=0){const number=Number(value);return Number.isFinite(number)?Math.floor(number):fallback}
function safeJson(value,fallback){try{const parsed=typeof value==='string'?JSON.parse(value):value;return parsed??fallback}catch{return fallback}}
function completedSummary(row,{replayed=true}={}){const parsed=safeJson(row?.value,null);return parsed?.status==='COMPLETED'?{...parsed,replayed}:null}

async function ensureFoundation(env){
  const postgres=env.DB?.dialect==='postgres';
  const nowDefault=postgres?"to_char(timezone('UTC',CURRENT_TIMESTAMP),'YYYY-MM-DD HH24:MI:SS')":'CURRENT_TIMESTAMP';
  const schema=[`CREATE TABLE IF NOT EXISTS ${TARGETED_AVATAR_GRANT_VERIFICATION_TABLE}(
    operation_key TEXT PRIMARY KEY,verified INTEGER NOT NULL CHECK(verified=1),detail TEXT NOT NULL DEFAULT '',created_at TEXT NOT NULL DEFAULT ${nowDefault})`];
  if(postgres&&typeof env.DB.execSchema==='function')await env.DB.execSchema(schema);
  else await env.DB.batch(schema.map(sql=>env.DB.prepare(sql)));
}

export async function ensureTargetedAvatarGrantV2014(env){
  const existing=completedSummary(await env.DB.prepare('SELECT value FROM app_meta WHERE key=?').bind(TARGETED_AVATAR_GRANT_MARKER_KEY).first());
  if(existing)return existing;

  await ensureFoundation(env);

  const [usersResult,avatar,ownership,ownerResult]=await Promise.all([
    env.DB.prepare('SELECT id,nickname,role,status FROM users WHERE nickname=? ORDER BY id LIMIT 2').bind(TARGETED_AVATAR_GRANT_NICKNAME).all(),
    env.DB.prepare('SELECT code,name,is_active,is_public,sale_enabled,acquisition_type FROM avatar_catalog_v1 WHERE code=?').bind(TARGETED_AVATAR_GRANT_CODE).first(),
    env.DB.prepare(`SELECT user_id,avatar_code,source_type,source_ref,expires_at FROM avatar_user_ownership_v1
      WHERE user_id=(SELECT id FROM users WHERE nickname=? ORDER BY id LIMIT 1) AND avatar_code=?`).bind(TARGETED_AVATAR_GRANT_NICKNAME,TARGETED_AVATAR_GRANT_CODE).first(),
    env.DB.prepare("SELECT id FROM users WHERE UPPER(role)='OWNER' AND UPPER(status)='ACTIVE' ORDER BY id LIMIT 1").first()
  ]);
  const users=rows(usersResult);
  if(users.length!==1)throw new Error('지정 대상 계정을 정확히 한 개 찾지 못해 아바타 지급을 중단했습니다.');
  const user=users[0],userId=integer(user.id),ownerId=integer(ownerResult?.id);
  if(!userId||String(user.nickname||'')!==TARGETED_AVATAR_GRANT_NICKNAME||String(user.status||'').trim().toUpperCase()!=='ACTIVE'){
    throw new Error('지정 대상 계정이 활성 계정으로 확인되지 않아 아바타 지급을 중단했습니다.');
  }
  if(!ownerId)throw new Error('아바타 지급 감사 로그를 기록할 활성 OWNER 계정을 찾지 못했습니다.');
  if(!avatar||String(avatar.code||'')!==TARGETED_AVATAR_GRANT_CODE||String(avatar.name||'')!==TARGETED_AVATAR_GRANT_NAME||integer(avatar.is_active)!==1||integer(avatar.is_public)!==1){
    throw new Error('지정 아바타가 활성·공개 카탈로그로 확인되지 않아 지급을 중단했습니다.');
  }

  const summary={
    status:'COMPLETED',version:TARGETED_AVATAR_GRANT_VERSION,completedAt:new Date().toISOString(),
    avatarCode:TARGETED_AVATAR_GRANT_CODE,permanent:true,alreadyOwned:Boolean(ownership&&ownership.expires_at==null)
  };
  const runningValue=JSON.stringify({status:'RUNNING',version:TARGETED_AVATAR_GRANT_VERSION,nonce:crypto.randomUUID(),startedAt:new Date().toISOString()});
  const completedValue=JSON.stringify(summary);
  const beforeAudit=JSON.stringify({
    operationKey:TARGETED_AVATAR_GRANT_MARKER_KEY,actor:'SYSTEM_MIGRATION',
    ownership:ownership?{sourceType:String(ownership.source_type||''),sourceRef:String(ownership.source_ref||''),expiresAt:ownership.expires_at||null}:null
  });
  const afterAudit=JSON.stringify({operationKey:TARGETED_AVATAR_GRANT_MARKER_KEY,actor:'SYSTEM_MIGRATION',avatarCode:TARGETED_AVATAR_GRANT_CODE,permanent:true});
  const guard='EXISTS(SELECT 1 FROM app_meta WHERE key=? AND value=?)';
  const guarded=(sql,...values)=>env.DB.prepare(sql.replace('{GUARD}',guard)).bind(...values,TARGETED_AVATAR_GRANT_MARKER_KEY,runningValue);
  const rowLock=env.DB?.dialect==='postgres'?' FOR UPDATE':'';
  const preflightKey=`${TARGETED_AVATAR_GRANT_MARKER_KEY}:preflight`;
  const finalKey=`${TARGETED_AVATAR_GRANT_MARKER_KEY}:final`;
  const statements=[
    env.DB.prepare('INSERT OR IGNORE INTO app_meta(key,value,updated_at) VALUES(?,?,CURRENT_TIMESTAMP)').bind(TARGETED_AVATAR_GRANT_MARKER_KEY,runningValue),
    env.DB.prepare(`SELECT id FROM users WHERE id=? AND nickname=? AND UPPER(status)='ACTIVE'${rowLock}`).bind(userId,TARGETED_AVATAR_GRANT_NICKNAME),
    env.DB.prepare(`SELECT id FROM users WHERE id=? AND UPPER(role)='OWNER' AND UPPER(status)='ACTIVE'${rowLock}`).bind(ownerId),
    env.DB.prepare(`SELECT code FROM avatar_catalog_v1 WHERE code=? AND name=? AND is_active=1 AND is_public=1${rowLock}`).bind(TARGETED_AVATAR_GRANT_CODE,TARGETED_AVATAR_GRANT_NAME),
    guarded(`INSERT INTO ${TARGETED_AVATAR_GRANT_VERIFICATION_TABLE}(operation_key,verified,detail)
      SELECT ?,CASE WHEN
        EXISTS(SELECT 1 FROM users WHERE id=? AND nickname=? AND UPPER(status)='ACTIVE')
        AND NOT EXISTS(SELECT 1 FROM users WHERE id<>? AND nickname=?)
        AND EXISTS(SELECT 1 FROM users WHERE id=? AND UPPER(role)='OWNER' AND UPPER(status)='ACTIVE')
        AND EXISTS(SELECT 1 FROM avatar_catalog_v1 WHERE code=? AND name=? AND is_active=1 AND is_public=1)
        THEN 1 ELSE 0 END,? WHERE {GUARD}`,
      preflightKey,userId,TARGETED_AVATAR_GRANT_NICKNAME,userId,TARGETED_AVATAR_GRANT_NICKNAME,
      ownerId,TARGETED_AVATAR_GRANT_CODE,TARGETED_AVATAR_GRANT_NAME,JSON.stringify({actor:'SYSTEM_MIGRATION',targetVerified:true})),
    guarded(`INSERT INTO avatar_user_ownership_v1(user_id,avatar_code,source_type,source_ref,acquired_at,expires_at)
      SELECT ?,?,'ADMIN_GRANT',?,CURRENT_TIMESTAMP,NULL WHERE
      EXISTS(SELECT 1 FROM users WHERE id=? AND nickname=? AND UPPER(status)='ACTIVE')
      AND EXISTS(SELECT 1 FROM avatar_catalog_v1 WHERE code=? AND name=? AND is_active=1 AND is_public=1) AND {GUARD}
      ON CONFLICT(user_id,avatar_code) DO UPDATE SET source_type=excluded.source_type,source_ref=excluded.source_ref,acquired_at=CURRENT_TIMESTAMP,expires_at=NULL
      WHERE avatar_user_ownership_v1.expires_at IS NOT NULL`,
      userId,TARGETED_AVATAR_GRANT_CODE,TARGETED_AVATAR_GRANT_MARKER_KEY,userId,TARGETED_AVATAR_GRANT_NICKNAME,TARGETED_AVATAR_GRANT_CODE,TARGETED_AVATAR_GRANT_NAME),
    guarded(`INSERT INTO admin_logs(admin_id,action_type,target_type,target_id,before_data,after_data)
      SELECT ?,?,'USER_AVATAR',CAST(? AS TEXT),?,? WHERE
      NOT EXISTS(SELECT 1 FROM admin_logs WHERE admin_id=? AND action_type=? AND target_type='USER_AVATAR' AND target_id=CAST(? AS TEXT) AND after_data=?)
      AND {GUARD}`,
      ownerId,TARGETED_AVATAR_GRANT_ACTION,userId,beforeAudit,afterAudit,ownerId,TARGETED_AVATAR_GRANT_ACTION,userId,afterAudit),
    guarded(`INSERT INTO ${TARGETED_AVATAR_GRANT_VERIFICATION_TABLE}(operation_key,verified,detail)
      SELECT ?,CASE WHEN
        EXISTS(SELECT 1 FROM users WHERE id=? AND nickname=? AND UPPER(status)='ACTIVE')
        AND NOT EXISTS(SELECT 1 FROM users WHERE id<>? AND nickname=?)
        AND EXISTS(SELECT 1 FROM users WHERE id=? AND UPPER(role)='OWNER' AND UPPER(status)='ACTIVE')
        AND EXISTS(SELECT 1 FROM avatar_catalog_v1 WHERE code=? AND name=? AND is_active=1 AND is_public=1)
        AND EXISTS(SELECT 1 FROM avatar_user_ownership_v1 WHERE user_id=? AND avatar_code=? AND expires_at IS NULL)
        AND EXISTS(SELECT 1 FROM admin_logs WHERE admin_id=? AND action_type=? AND target_type='USER_AVATAR' AND target_id=CAST(? AS TEXT) AND after_data=?)
        THEN 1 ELSE 0 END,? WHERE {GUARD}`,
      finalKey,
      userId,TARGETED_AVATAR_GRANT_NICKNAME,userId,TARGETED_AVATAR_GRANT_NICKNAME,
      ownerId,TARGETED_AVATAR_GRANT_CODE,TARGETED_AVATAR_GRANT_NAME,
      userId,TARGETED_AVATAR_GRANT_CODE,ownerId,TARGETED_AVATAR_GRANT_ACTION,userId,afterAudit,completedValue),
    guarded(`UPDATE app_meta SET value=?,updated_at=CURRENT_TIMESTAMP WHERE key=? AND value=?
      AND EXISTS(SELECT 1 FROM ${TARGETED_AVATAR_GRANT_VERIFICATION_TABLE} WHERE operation_key=? AND verified=1) AND {GUARD}`,
      completedValue,TARGETED_AVATAR_GRANT_MARKER_KEY,runningValue,finalKey)
  ];

  const results=await env.DB.batch(statements);
  if(Number(results[0]?.meta?.changes||0)===0){
    const replay=completedSummary(await env.DB.prepare('SELECT value FROM app_meta WHERE key=?').bind(TARGETED_AVATAR_GRANT_MARKER_KEY).first());
    if(replay)return replay;
    return{status:'RUNNING',version:TARGETED_AVATAR_GRANT_VERSION,replayed:true};
  }
  const stored=completedSummary(await env.DB.prepare('SELECT value FROM app_meta WHERE key=?').bind(TARGETED_AVATAR_GRANT_MARKER_KEY).first(),{replayed:false});
  if(!stored)throw new Error('지정 계정의 아바타 영구 지급 결과를 최종 검증하지 못했습니다.');
  console.log('TARGETED_AVATAR_GRANT_V2014',JSON.stringify({status:stored.status,version:stored.version,avatarCode:stored.avatarCode,permanent:stored.permanent,replayed:stored.replayed}));
  return stored;
}
