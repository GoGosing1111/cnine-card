export const TARGETED_INVENTORY_GRANT_V2026_VERSION=2026;
export const TARGETED_INVENTORY_GRANT_V2026_MARKER_KEY='targeted_inventory_grant_v2026_xsudaeng_high_grade_reroll_ticket_x1';
export const TARGETED_INVENTORY_GRANT_V2026_NICKNAME='X수댕';
export const TARGETED_INVENTORY_GRANT_V2026_ITEM_CODE='HIGH_GRADE_REROLL_TICKET';
export const TARGETED_INVENTORY_GRANT_V2026_QUANTITY=1;

const ITEM_NAME='고등급 재뽑기권';
const ACTION='SYSTEM_INVENTORY_GRANT_V2026';
const REFERENCE_TYPE='SYSTEM_GRANT';
const REASON='운영 요청 지급 · 고등급 재뽑기권 1개';
const VERIFICATION_TABLE='targeted_inventory_grant_v2026_verifications';

function rows(result){return result?.results||[]}
function integer(value,fallback=0){const number=Number(value);return Number.isFinite(number)?Math.floor(number):fallback}
function safeJson(value,fallback){try{const parsed=typeof value==='string'?JSON.parse(value):value;return parsed??fallback}catch{return fallback}}
function completedSummary(row,{replayed=true}={}){const parsed=safeJson(row?.value,null);return parsed?.status==='COMPLETED'?{...parsed,replayed}:null}

async function ensureFoundation(env){
  const postgres=env.DB?.dialect==='postgres';
  const nowDefault=postgres?"to_char(timezone('UTC',CURRENT_TIMESTAMP),'YYYY-MM-DD HH24:MI:SS')":'CURRENT_TIMESTAMP';
  const schema=[`CREATE TABLE IF NOT EXISTS ${VERIFICATION_TABLE}(
    operation_key TEXT PRIMARY KEY,verified INTEGER NOT NULL CHECK(verified=1),detail TEXT NOT NULL DEFAULT '',created_at TEXT NOT NULL DEFAULT ${nowDefault})`];
  if(postgres&&typeof env.DB.execSchema==='function')await env.DB.execSchema(schema);
  else await env.DB.batch(schema.map(sql=>env.DB.prepare(sql)));
}

export async function ensureTargetedInventoryGrantV2026(env){
  const existing=completedSummary(await env.DB.prepare('SELECT value FROM app_meta WHERE key=?').bind(TARGETED_INVENTORY_GRANT_V2026_MARKER_KEY).first());
  if(existing)return existing;

  await ensureFoundation(env);
  const [usersResult,item,holding,owner]=await Promise.all([
    env.DB.prepare('SELECT id,nickname,role,status FROM users WHERE LOWER(TRIM(nickname))=LOWER(TRIM(?)) ORDER BY id LIMIT 2').bind(TARGETED_INVENTORY_GRANT_V2026_NICKNAME).all(),
    env.DB.prepare('SELECT code,name,category,rarity,is_active isActive FROM inventory_items WHERE code=?').bind(TARGETED_INVENTORY_GRANT_V2026_ITEM_CODE).first(),
    env.DB.prepare(`SELECT user_id,item_code,quantity,COALESCE(unseen_quantity,0) unseenQuantity FROM cnine_user_inventory
      WHERE user_id=(SELECT id FROM users WHERE LOWER(TRIM(nickname))=LOWER(TRIM(?)) ORDER BY id LIMIT 1) AND item_code=?`)
      .bind(TARGETED_INVENTORY_GRANT_V2026_NICKNAME,TARGETED_INVENTORY_GRANT_V2026_ITEM_CODE).first(),
    env.DB.prepare("SELECT id FROM users WHERE UPPER(role)='OWNER' AND UPPER(status)='ACTIVE' ORDER BY id LIMIT 1").first()
  ]);

  const users=rows(usersResult);
  if(users.length!==1)throw new Error('지정 대상 계정을 정확히 한 개 찾지 못해 고등급 재뽑기권 지급을 중단했습니다.');
  const user=users[0],userId=integer(user.id),ownerId=integer(owner?.id),actualNickname=String(user.nickname||'');
  if(!userId||actualNickname.trim().toLowerCase()!==TARGETED_INVENTORY_GRANT_V2026_NICKNAME.toLowerCase()||String(user.status||'').trim().toUpperCase()!=='ACTIVE'){
    throw new Error('지정 대상 계정이 활성 계정으로 확인되지 않아 고등급 재뽑기권 지급을 중단했습니다.');
  }
  if(!ownerId)throw new Error('고등급 재뽑기권 지급 감사 로그를 기록할 활성 OWNER 계정을 찾지 못했습니다.');
  if(!item||String(item.code||'')!==TARGETED_INVENTORY_GRANT_V2026_ITEM_CODE||String(item.name||'')!==ITEM_NAME||integer(item.isActive)!==1){
    throw new Error('고등급 재뽑기권 아이템이 활성 카탈로그로 확인되지 않아 지급을 중단했습니다.');
  }

  const rawQuantity=integer(holding?.quantity),rawUnseen=integer(holding?.unseenQuantity);
  const quantityBefore=Math.max(0,rawQuantity),unseenBefore=Math.max(0,rawUnseen);
  const quantityAfter=quantityBefore+TARGETED_INVENTORY_GRANT_V2026_QUANTITY;
  const unseenAfter=unseenBefore+TARGETED_INVENTORY_GRANT_V2026_QUANTITY;
  const summary={status:'COMPLETED',version:TARGETED_INVENTORY_GRANT_V2026_VERSION,completedAt:new Date().toISOString(),
    itemCode:TARGETED_INVENTORY_GRANT_V2026_ITEM_CODE,quantityGranted:TARGETED_INVENTORY_GRANT_V2026_QUANTITY,
    quantityBefore,quantityAfter,unseenBefore,unseenAfter};
  const runningValue=JSON.stringify({status:'RUNNING',version:TARGETED_INVENTORY_GRANT_V2026_VERSION,nonce:crypto.randomUUID(),startedAt:new Date().toISOString()});
  const completedValue=JSON.stringify(summary);
  const targetId=`${userId}:${TARGETED_INVENTORY_GRANT_V2026_ITEM_CODE}`;
  const beforeAudit=JSON.stringify({operationKey:TARGETED_INVENTORY_GRANT_V2026_MARKER_KEY,actor:'SYSTEM_MIGRATION',itemCode:TARGETED_INVENTORY_GRANT_V2026_ITEM_CODE,quantity:quantityBefore,unseenQuantity:unseenBefore});
  const afterAudit=JSON.stringify({operationKey:TARGETED_INVENTORY_GRANT_V2026_MARKER_KEY,actor:'SYSTEM_MIGRATION',itemCode:TARGETED_INVENTORY_GRANT_V2026_ITEM_CODE,quantity:quantityAfter,unseenQuantity:unseenAfter,quantityGranted:TARGETED_INVENTORY_GRANT_V2026_QUANTITY});
  const guard='EXISTS(SELECT 1 FROM app_meta WHERE key=? AND value=?)';
  const guarded=(sql,...values)=>env.DB.prepare(sql.replace('{GUARD}',guard)).bind(...values,TARGETED_INVENTORY_GRANT_V2026_MARKER_KEY,runningValue);
  const rowLock=env.DB?.dialect==='postgres'?' FOR UPDATE':'';
  const preflightKey=`${TARGETED_INVENTORY_GRANT_V2026_MARKER_KEY}:preflight`,finalKey=`${TARGETED_INVENTORY_GRANT_V2026_MARKER_KEY}:final`;
  const holdingCondition=holding
    ?'EXISTS(SELECT 1 FROM cnine_user_inventory WHERE user_id=? AND item_code=? AND quantity=? AND COALESCE(unseen_quantity,0)=?)'
    :'NOT EXISTS(SELECT 1 FROM cnine_user_inventory WHERE user_id=? AND item_code=?)';
  const holdingValues=holding
    ?[userId,TARGETED_INVENTORY_GRANT_V2026_ITEM_CODE,rawQuantity,rawUnseen]
    :[userId,TARGETED_INVENTORY_GRANT_V2026_ITEM_CODE];
  const targetCondition=`EXISTS(SELECT 1 FROM users WHERE id=? AND nickname=? AND UPPER(status)='ACTIVE')
    AND NOT EXISTS(SELECT 1 FROM users WHERE id<>? AND LOWER(TRIM(nickname))=LOWER(TRIM(?)))
    AND EXISTS(SELECT 1 FROM users WHERE id=? AND UPPER(role)='OWNER' AND UPPER(status)='ACTIVE')
    AND EXISTS(SELECT 1 FROM inventory_items WHERE code=? AND name=? AND is_active=1)`;
  const targetValues=[userId,actualNickname,userId,TARGETED_INVENTORY_GRANT_V2026_NICKNAME,ownerId,TARGETED_INVENTORY_GRANT_V2026_ITEM_CODE,ITEM_NAME];
  const statements=[
    env.DB.prepare('INSERT OR IGNORE INTO app_meta(key,value,updated_at) VALUES(?,?,CURRENT_TIMESTAMP)').bind(TARGETED_INVENTORY_GRANT_V2026_MARKER_KEY,runningValue),
    env.DB.prepare(`SELECT id FROM users WHERE id=? AND nickname=? AND UPPER(status)='ACTIVE'${rowLock}`).bind(userId,actualNickname),
    env.DB.prepare(`SELECT id FROM users WHERE id=? AND UPPER(role)='OWNER' AND UPPER(status)='ACTIVE'${rowLock}`).bind(ownerId),
    env.DB.prepare(`SELECT code FROM inventory_items WHERE code=? AND name=? AND is_active=1${rowLock}`).bind(TARGETED_INVENTORY_GRANT_V2026_ITEM_CODE,ITEM_NAME),
    env.DB.prepare(`SELECT user_id FROM cnine_user_inventory WHERE user_id=? AND item_code=?${rowLock}`).bind(userId,TARGETED_INVENTORY_GRANT_V2026_ITEM_CODE),
    guarded(`INSERT INTO ${VERIFICATION_TABLE}(operation_key,verified,detail)
      SELECT ?,CASE WHEN ${targetCondition} AND ${holdingCondition} THEN 1 ELSE 0 END,? WHERE {GUARD}`,
      preflightKey,...targetValues,...holdingValues,JSON.stringify({actor:'SYSTEM_MIGRATION',targetVerified:true,itemCode:TARGETED_INVENTORY_GRANT_V2026_ITEM_CODE,quantityBefore,unseenBefore})),
    guarded(`INSERT INTO cnine_user_inventory(user_id,item_code,quantity,unseen_quantity,created_at,updated_at)
      SELECT ?,?,?,?,CURRENT_TIMESTAMP,CURRENT_TIMESTAMP WHERE ${targetCondition} AND ${holdingCondition} AND {GUARD}
      ON CONFLICT(user_id,item_code) DO UPDATE SET
        quantity=CASE WHEN cnine_user_inventory.quantity<0 THEN excluded.quantity ELSE cnine_user_inventory.quantity+excluded.quantity END,
        unseen_quantity=CASE WHEN cnine_user_inventory.unseen_quantity<0 THEN excluded.unseen_quantity ELSE cnine_user_inventory.unseen_quantity+excluded.unseen_quantity END,
        updated_at=CURRENT_TIMESTAMP`,
      userId,TARGETED_INVENTORY_GRANT_V2026_ITEM_CODE,TARGETED_INVENTORY_GRANT_V2026_QUANTITY,TARGETED_INVENTORY_GRANT_V2026_QUANTITY,
      ...targetValues,...holdingValues),
    guarded(`INSERT INTO inventory_logs(user_id,item_code,change_amount,balance_after,reason,reference_type,reference_id,admin_id)
      SELECT ?,?,?,?,?,'${REFERENCE_TYPE}',?,? WHERE
      NOT EXISTS(SELECT 1 FROM inventory_logs WHERE user_id=? AND item_code=? AND reference_type='${REFERENCE_TYPE}' AND reference_id=?) AND {GUARD}`,
      userId,TARGETED_INVENTORY_GRANT_V2026_ITEM_CODE,TARGETED_INVENTORY_GRANT_V2026_QUANTITY,quantityAfter,REASON,TARGETED_INVENTORY_GRANT_V2026_MARKER_KEY,ownerId,
      userId,TARGETED_INVENTORY_GRANT_V2026_ITEM_CODE,TARGETED_INVENTORY_GRANT_V2026_MARKER_KEY),
    guarded(`INSERT INTO admin_logs(admin_id,action_type,target_type,target_id,before_data,after_data)
      SELECT ?,?,'USER_INVENTORY',?,?,? WHERE
      NOT EXISTS(SELECT 1 FROM admin_logs WHERE admin_id=? AND action_type=? AND target_type='USER_INVENTORY' AND target_id=? AND after_data=?) AND {GUARD}`,
      ownerId,ACTION,targetId,beforeAudit,afterAudit,ownerId,ACTION,targetId,afterAudit),
    guarded(`INSERT INTO ${VERIFICATION_TABLE}(operation_key,verified,detail)
      SELECT ?,CASE WHEN ${targetCondition}
        AND EXISTS(SELECT 1 FROM cnine_user_inventory WHERE user_id=? AND item_code=? AND quantity=? AND COALESCE(unseen_quantity,0)=?)
        AND EXISTS(SELECT 1 FROM inventory_logs WHERE user_id=? AND item_code=? AND change_amount=? AND balance_after=? AND reference_type='${REFERENCE_TYPE}' AND reference_id=?)
        AND EXISTS(SELECT 1 FROM admin_logs WHERE admin_id=? AND action_type=? AND target_type='USER_INVENTORY' AND target_id=? AND after_data=?)
        THEN 1 ELSE 0 END,? WHERE {GUARD}`,
      finalKey,...targetValues,
      userId,TARGETED_INVENTORY_GRANT_V2026_ITEM_CODE,quantityAfter,unseenAfter,
      userId,TARGETED_INVENTORY_GRANT_V2026_ITEM_CODE,TARGETED_INVENTORY_GRANT_V2026_QUANTITY,quantityAfter,TARGETED_INVENTORY_GRANT_V2026_MARKER_KEY,
      ownerId,ACTION,targetId,afterAudit,completedValue),
    guarded(`UPDATE app_meta SET value=?,updated_at=CURRENT_TIMESTAMP WHERE key=? AND value=?
      AND EXISTS(SELECT 1 FROM ${VERIFICATION_TABLE} WHERE operation_key=? AND verified=1) AND {GUARD}`,
      completedValue,TARGETED_INVENTORY_GRANT_V2026_MARKER_KEY,runningValue,finalKey)
  ];

  const results=await env.DB.batch(statements);
  if(Number(results[0]?.meta?.changes||0)===0){
    const replay=completedSummary(await env.DB.prepare('SELECT value FROM app_meta WHERE key=?').bind(TARGETED_INVENTORY_GRANT_V2026_MARKER_KEY).first());
    if(replay)return replay;
    return{status:'RUNNING',version:TARGETED_INVENTORY_GRANT_V2026_VERSION,replayed:true};
  }
  const stored=completedSummary(await env.DB.prepare('SELECT value FROM app_meta WHERE key=?').bind(TARGETED_INVENTORY_GRANT_V2026_MARKER_KEY).first(),{replayed:false});
  if(!stored)throw new Error('지정 계정의 고등급 재뽑기권 지급 결과를 최종 검증하지 못했습니다.');
  console.log('TARGETED_INVENTORY_GRANT_V2026',JSON.stringify({status:stored.status,version:stored.version,itemCode:stored.itemCode,quantityGranted:stored.quantityGranted,quantityAfter:stored.quantityAfter,replayed:stored.replayed}));
  return stored;
}
