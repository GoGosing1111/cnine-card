export const TARGETED_AVATAR_GRANT_VERSION=2007;
export const TARGETED_AVATAR_GRANT_MARKER_KEY='targeted_avatar_grant_v2007_pink_terran_empress_joeun';
export const TARGETED_AVATAR_GRANT_NICKNAME='핑크빛유두';
export const TARGETED_AVATAR_GRANT_CODE='TERRAN_EMPRESS_JOEUN';

const TARGETED_AVATAR_GRANT_NAME='테란여제 조은';
const TARGETED_AVATAR_GRANT_ACTION='USER_AVATAR_GRANT_V2007';

function rows(result){return result?.results||[]}
function integer(value,fallback=0){const number=Number(value);return Number.isFinite(number)?Math.floor(number):fallback}
function safeJson(value,fallback){try{const parsed=typeof value==='string'?JSON.parse(value):value;return parsed??fallback}catch{return fallback}}
function completedSummary(row,{replayed=true}={}){const parsed=safeJson(row?.value,null);return parsed?.status==='COMPLETED'?{...parsed,replayed}:null}

export async function ensureTargetedAvatarGrantV2007(env){
  const existing=completedSummary(await env.DB.prepare('SELECT value FROM app_meta WHERE key=?').bind(TARGETED_AVATAR_GRANT_MARKER_KEY).first());
  if(existing)return existing;

  const [usersResult,avatar,ownership]=await Promise.all([
    env.DB.prepare('SELECT id,nickname,role,status FROM users WHERE nickname=? ORDER BY id LIMIT 2').bind(TARGETED_AVATAR_GRANT_NICKNAME).all(),
    env.DB.prepare('SELECT code,name,is_active,is_public,sale_enabled,acquisition_type FROM avatar_catalog_v1 WHERE code=?').bind(TARGETED_AVATAR_GRANT_CODE).first(),
    env.DB.prepare(`SELECT user_id,avatar_code,source_type,source_ref,expires_at FROM avatar_user_ownership_v1
      WHERE user_id=(SELECT id FROM users WHERE nickname=? ORDER BY id LIMIT 1) AND avatar_code=?`).bind(TARGETED_AVATAR_GRANT_NICKNAME,TARGETED_AVATAR_GRANT_CODE).first()
  ]);
  const users=rows(usersResult);
  if(users.length!==1)throw new Error(`대상 계정 ${TARGETED_AVATAR_GRANT_NICKNAME}을(를) 정확히 한 개 찾지 못해 아바타 지급을 중단했습니다.`);
  const user=users[0],userId=integer(user.id);
  if(!userId||String(user.nickname||'')!==TARGETED_AVATAR_GRANT_NICKNAME||String(user.role||'').trim().toUpperCase()!=='OWNER'||String(user.status||'').trim().toUpperCase()!=='ACTIVE'){
    throw new Error(`${TARGETED_AVATAR_GRANT_NICKNAME} 계정이 활성 OWNER 계정으로 확인되지 않아 아바타 지급을 중단했습니다.`);
  }
  if(!avatar||String(avatar.code||'')!==TARGETED_AVATAR_GRANT_CODE||String(avatar.name||'')!==TARGETED_AVATAR_GRANT_NAME){
    throw new Error(`${TARGETED_AVATAR_GRANT_NAME} 아바타 카탈로그를 확인하지 못해 지급을 중단했습니다.`);
  }

  const summary={
    status:'COMPLETED',version:TARGETED_AVATAR_GRANT_VERSION,completedAt:new Date().toISOString(),
    nickname:TARGETED_AVATAR_GRANT_NICKNAME,userId,avatarCode:TARGETED_AVATAR_GRANT_CODE,avatarName:TARGETED_AVATAR_GRANT_NAME,
    permanent:true,alreadyOwned:Boolean(ownership&&ownership.expires_at==null),catalogActive:true,catalogPublic:true,saleEnabled:false
  };
  const runningValue=JSON.stringify({status:'RUNNING',version:TARGETED_AVATAR_GRANT_VERSION,nonce:crypto.randomUUID(),startedAt:new Date().toISOString()});
  const completedValue=JSON.stringify(summary);
  const beforeAudit=JSON.stringify({
    operationKey:TARGETED_AVATAR_GRANT_MARKER_KEY,
    catalog:{active:integer(avatar.is_active)===1,public:integer(avatar.is_public)===1,saleEnabled:integer(avatar.sale_enabled)===1,acquisitionType:String(avatar.acquisition_type||'')},
    ownership:ownership?{sourceType:String(ownership.source_type||''),sourceRef:String(ownership.source_ref||''),expiresAt:ownership.expires_at||null}:null
  });
  const afterAudit=JSON.stringify({operationKey:TARGETED_AVATAR_GRANT_MARKER_KEY,avatarCode:TARGETED_AVATAR_GRANT_CODE,permanent:true,catalogActive:true,catalogPublic:true,saleEnabled:false});
  const guard='EXISTS(SELECT 1 FROM app_meta WHERE key=? AND value=?)';
  const guarded=(sql,...values)=>env.DB.prepare(sql.replace('{GUARD}',guard)).bind(...values,TARGETED_AVATAR_GRANT_MARKER_KEY,runningValue);
  const statements=[
    env.DB.prepare('INSERT OR IGNORE INTO app_meta(key,value,updated_at) VALUES(?,?,CURRENT_TIMESTAMP)').bind(TARGETED_AVATAR_GRANT_MARKER_KEY,runningValue),
    guarded(`UPDATE avatar_catalog_v1 SET acquisition_type='EVENT',source_label='운영 지급',source_detail='지정 계정 영구 지급',is_active=1,is_public=1,sale_enabled=0,updated_at=CURRENT_TIMESTAMP
      WHERE code=? AND name=? AND {GUARD}`,TARGETED_AVATAR_GRANT_CODE,TARGETED_AVATAR_GRANT_NAME),
    guarded(`INSERT INTO avatar_user_ownership_v1(user_id,avatar_code,source_type,source_ref,acquired_at,expires_at)
      SELECT ?,?,'ADMIN_GRANT',?,CURRENT_TIMESTAMP,NULL WHERE {GUARD}
      ON CONFLICT(user_id,avatar_code) DO UPDATE SET source_type=excluded.source_type,source_ref=excluded.source_ref,acquired_at=CURRENT_TIMESTAMP,expires_at=NULL`,
      userId,TARGETED_AVATAR_GRANT_CODE,TARGETED_AVATAR_GRANT_MARKER_KEY),
    guarded(`INSERT INTO admin_logs(admin_id,action_type,target_type,target_id,before_data,after_data)
      SELECT ?,?,'USER_AVATAR',CAST(? AS TEXT),?,? WHERE
      NOT EXISTS(SELECT 1 FROM admin_logs WHERE action_type=? AND target_type='USER_AVATAR' AND target_id=CAST(? AS TEXT) AND after_data=?)
      AND {GUARD}`,
      userId,TARGETED_AVATAR_GRANT_ACTION,userId,beforeAudit,afterAudit,TARGETED_AVATAR_GRANT_ACTION,userId,afterAudit),
    guarded(`UPDATE app_meta SET value=?,updated_at=CURRENT_TIMESTAMP WHERE key=? AND value=?
      AND EXISTS(SELECT 1 FROM users WHERE id=? AND nickname=? AND UPPER(role)='OWNER' AND UPPER(status)='ACTIVE')
      AND EXISTS(SELECT 1 FROM avatar_catalog_v1 WHERE code=? AND name=? AND is_active=1 AND is_public=1 AND sale_enabled=0 AND acquisition_type='EVENT')
      AND EXISTS(SELECT 1 FROM avatar_user_ownership_v1 WHERE user_id=? AND avatar_code=? AND expires_at IS NULL)
      AND EXISTS(SELECT 1 FROM admin_logs WHERE action_type=? AND target_type='USER_AVATAR' AND target_id=CAST(? AS TEXT) AND after_data=?)
      AND {GUARD}`,
      completedValue,TARGETED_AVATAR_GRANT_MARKER_KEY,runningValue,
      userId,TARGETED_AVATAR_GRANT_NICKNAME,TARGETED_AVATAR_GRANT_CODE,TARGETED_AVATAR_GRANT_NAME,
      userId,TARGETED_AVATAR_GRANT_CODE,TARGETED_AVATAR_GRANT_ACTION,userId,afterAudit)
  ];

  const results=await env.DB.batch(statements);
  if(Number(results[0]?.meta?.changes||0)===0){
    const replay=completedSummary(await env.DB.prepare('SELECT value FROM app_meta WHERE key=?').bind(TARGETED_AVATAR_GRANT_MARKER_KEY).first());
    if(replay)return replay;
    return{status:'RUNNING',version:TARGETED_AVATAR_GRANT_VERSION,replayed:true};
  }
  const stored=completedSummary(await env.DB.prepare('SELECT value FROM app_meta WHERE key=?').bind(TARGETED_AVATAR_GRANT_MARKER_KEY).first(),{replayed:false});
  if(!stored)throw new Error('테란여제 조은 아바타는 지급됐지만 최종 검증 마커를 확인하지 못했습니다.');
  console.log('TARGETED_AVATAR_GRANT_V2007',JSON.stringify(stored));
  return stored;
}
