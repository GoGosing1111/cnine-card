export const TARGETED_SKILL_CHIP_GRANT_V2055_VERSION=2055;
export const TARGETED_SKILL_CHIP_GRANT_V2055_MARKER_KEY='targeted_skill_chip_grant_v2055_jinjja_diem_and_pink_rocket_airstrike';
export const TARGETED_SKILL_CHIP_GRANT_V2055_NICKNAMES=Object.freeze(['진짜디임','핑크빛유두']);
export const TARGETED_SKILL_CHIP_GRANT_V2055_ITEMS=Object.freeze([
  Object.freeze({code:'SKILL_CHIP_ROCKET_LAUNCHER',name:'로켓런처 스킬칩'}),
  Object.freeze({code:'SKILL_CHIP_HELICOPTER_AIRSTRIKE',name:'헬기폭격 스킬칩'})
]);

const ACTION='SYSTEM_SKILL_CHIP_GRANT_V2055';
const REFERENCE_TYPE='SYSTEM_GRANT';
const REASON='운영 요청 지급 · 배틀슈트 스킬칩 영구 보유';
const VERIFICATION_TABLE='targeted_skill_chip_grant_v2055_verifications';

function rows(result){return result?.results||[]}
function integer(value,fallback=0){const number=Number(value);return Number.isFinite(number)?Math.floor(number):fallback}
function safeJson(value,fallback){try{const parsed=typeof value==='string'?JSON.parse(value):value;return parsed??fallback}catch{return fallback}}
function completedSummary(row,{replayed=true}={}){
  const parsed=safeJson(row?.value,null);
  return parsed?.status==='COMPLETED'?{...parsed,replayed}:null;
}

async function ensureFoundation(env){
  const postgres=env.DB?.dialect==='postgres';
  const nowDefault=postgres?"to_char(timezone('UTC',CURRENT_TIMESTAMP),'YYYY-MM-DD HH24:MI:SS')":'CURRENT_TIMESTAMP';
  const schema=[`CREATE TABLE IF NOT EXISTS ${VERIFICATION_TABLE}(
    operation_key TEXT PRIMARY KEY,verified INTEGER NOT NULL CHECK(verified=1),detail TEXT NOT NULL DEFAULT '',created_at TEXT NOT NULL DEFAULT ${nowDefault})`];
  if(postgres&&typeof env.DB.execSchema==='function')await env.DB.execSchema(schema);
  else await env.DB.batch(schema.map(sql=>env.DB.prepare(sql)));
}

export async function ensureTargetedSkillChipGrantV2055(env){
  const existing=completedSummary(await env.DB.prepare('SELECT value FROM app_meta WHERE key=?').bind(TARGETED_SKILL_CHIP_GRANT_V2055_MARKER_KEY).first());
  if(existing)return existing;

  await ensureFoundation(env);
  const userResults=await Promise.all(TARGETED_SKILL_CHIP_GRANT_V2055_NICKNAMES.map(nickname=>
    env.DB.prepare('SELECT id,nickname,role,status FROM users WHERE LOWER(TRIM(nickname))=LOWER(TRIM(?)) ORDER BY id LIMIT 2').bind(nickname).all()
  ));
  const [itemResults,owner]=await Promise.all([
    Promise.all(TARGETED_SKILL_CHIP_GRANT_V2055_ITEMS.map(item=>
      env.DB.prepare('SELECT code,name,category,rarity,is_active isActive FROM inventory_items WHERE code=?').bind(item.code).first()
    )),
    env.DB.prepare("SELECT id FROM users WHERE UPPER(role)='OWNER' AND UPPER(status)='ACTIVE' ORDER BY id LIMIT 1").first()
  ]);

  const users=userResults.map((result,index)=>{
    const matches=rows(result),expectedNickname=TARGETED_SKILL_CHIP_GRANT_V2055_NICKNAMES[index];
    if(matches.length!==1)throw new Error(`지정 대상 계정 ${expectedNickname}을(를) 정확히 한 개 찾지 못해 스킬칩 지급을 중단했습니다.`);
    const user=matches[0],userId=integer(user.id),actualNickname=String(user.nickname||'');
    if(!userId||actualNickname.trim().toLowerCase()!==expectedNickname.toLowerCase()||String(user.status||'').trim().toUpperCase()!=='ACTIVE'){
      throw new Error(`지정 대상 계정 ${expectedNickname}이(가) 활성 계정으로 확인되지 않아 스킬칩 지급을 중단했습니다.`);
    }
    return{userId,actualNickname,expectedNickname};
  });
  const ownerId=integer(owner?.id);
  if(!ownerId)throw new Error('스킬칩 지급 감사 로그를 기록할 활성 OWNER 계정을 찾지 못했습니다.');
  itemResults.forEach((item,index)=>{
    const expected=TARGETED_SKILL_CHIP_GRANT_V2055_ITEMS[index];
    if(!item||String(item.code||'')!==expected.code||String(item.name||'')!==expected.name||String(item.category||'')!=='SKILL_CHIP'||integer(item.isActive)!==1){
      throw new Error(`${expected.name}이(가) 활성 스킬칩 카탈로그로 확인되지 않아 지급을 중단했습니다.`);
    }
  });

  const holdingResults=await Promise.all(users.flatMap(user=>TARGETED_SKILL_CHIP_GRANT_V2055_ITEMS.map(item=>
    env.DB.prepare(`SELECT user_id,item_code,quantity,COALESCE(unseen_quantity,0) unseenQuantity FROM cnine_user_inventory
      WHERE user_id=? AND item_code=?`).bind(user.userId,item.code).first()
  )));
  let holdingIndex=0;
  const grants=users.flatMap(user=>TARGETED_SKILL_CHIP_GRANT_V2055_ITEMS.map(item=>{
    const holding=holdingResults[holdingIndex++];
    const rawQuantity=integer(holding?.quantity),rawUnseen=integer(holding?.unseenQuantity);
    const owned=rawQuantity>0,quantityGranted=owned?0:1;
    return{
      user,item,holding,rawQuantity,rawUnseen,quantityGranted,
      quantityBefore:Math.max(0,rawQuantity),
      unseenBefore:Math.max(0,rawUnseen),
      quantityAfter:owned?rawQuantity:1,
      unseenAfter:owned?rawUnseen:Math.max(0,rawUnseen)+1
    };
  }));
  const quantityGranted=grants.reduce((total,grant)=>total+grant.quantityGranted,0);
  const summary={
    status:'COMPLETED',version:TARGETED_SKILL_CHIP_GRANT_V2055_VERSION,completedAt:new Date().toISOString(),
    permanent:true,accountCount:users.length,itemCount:TARGETED_SKILL_CHIP_GRANT_V2055_ITEMS.length,
    verifiedPairs:grants.length,quantityGranted,alreadyOwned:grants.length-quantityGranted
  };
  const runningValue=JSON.stringify({status:'RUNNING',version:TARGETED_SKILL_CHIP_GRANT_V2055_VERSION,nonce:crypto.randomUUID(),startedAt:new Date().toISOString()});
  const completedValue=JSON.stringify(summary);
  const guard='EXISTS(SELECT 1 FROM app_meta WHERE key=? AND value=?)';
  const guarded=(sql,...values)=>env.DB.prepare(sql.replace('{GUARD}',guard)).bind(...values,TARGETED_SKILL_CHIP_GRANT_V2055_MARKER_KEY,runningValue);
  const rowLock=env.DB?.dialect==='postgres'?' FOR UPDATE':'';
  const preflightKey=`${TARGETED_SKILL_CHIP_GRANT_V2055_MARKER_KEY}:preflight`;
  const finalKey=`${TARGETED_SKILL_CHIP_GRANT_V2055_MARKER_KEY}:final`;

  const targetConditions=[];
  const targetValues=[];
  users.forEach(user=>{
    targetConditions.push(`EXISTS(SELECT 1 FROM users WHERE id=? AND nickname=? AND UPPER(status)='ACTIVE')`);
    targetValues.push(user.userId,user.actualNickname);
    targetConditions.push(`NOT EXISTS(SELECT 1 FROM users WHERE id<>? AND LOWER(TRIM(nickname))=LOWER(TRIM(?)))`);
    targetValues.push(user.userId,user.expectedNickname);
  });
  targetConditions.push(`EXISTS(SELECT 1 FROM users WHERE id=? AND UPPER(role)='OWNER' AND UPPER(status)='ACTIVE')`);
  targetValues.push(ownerId);
  TARGETED_SKILL_CHIP_GRANT_V2055_ITEMS.forEach(item=>{
    targetConditions.push(`EXISTS(SELECT 1 FROM inventory_items WHERE code=? AND name=? AND category='SKILL_CHIP' AND is_active=1)`);
    targetValues.push(item.code,item.name);
  });
  const holdingConditions=[];
  const holdingValues=[];
  grants.forEach(grant=>{
    if(grant.holding){
      holdingConditions.push(`EXISTS(SELECT 1 FROM cnine_user_inventory WHERE user_id=? AND item_code=? AND quantity=? AND COALESCE(unseen_quantity,0)=?)`);
      holdingValues.push(grant.user.userId,grant.item.code,grant.rawQuantity,grant.rawUnseen);
    }else{
      holdingConditions.push(`NOT EXISTS(SELECT 1 FROM cnine_user_inventory WHERE user_id=? AND item_code=?)`);
      holdingValues.push(grant.user.userId,grant.item.code);
    }
  });
  const preflightCondition=[...targetConditions,...holdingConditions].join(' AND ');
  const statements=[
    env.DB.prepare('INSERT OR IGNORE INTO app_meta(key,value,updated_at) VALUES(?,?,CURRENT_TIMESTAMP)').bind(TARGETED_SKILL_CHIP_GRANT_V2055_MARKER_KEY,runningValue),
    ...users.map(user=>env.DB.prepare(`SELECT id FROM users WHERE id=? AND nickname=? AND UPPER(status)='ACTIVE'${rowLock}`).bind(user.userId,user.actualNickname)),
    env.DB.prepare(`SELECT id FROM users WHERE id=? AND UPPER(role)='OWNER' AND UPPER(status)='ACTIVE'${rowLock}`).bind(ownerId),
    ...TARGETED_SKILL_CHIP_GRANT_V2055_ITEMS.map(item=>env.DB.prepare(`SELECT code FROM inventory_items WHERE code=? AND name=? AND category='SKILL_CHIP' AND is_active=1${rowLock}`).bind(item.code,item.name)),
    ...grants.map(grant=>env.DB.prepare(`SELECT user_id FROM cnine_user_inventory WHERE user_id=? AND item_code=?${rowLock}`).bind(grant.user.userId,grant.item.code)),
    guarded(`INSERT INTO ${VERIFICATION_TABLE}(operation_key,verified,detail)
      SELECT ?,CASE WHEN ${preflightCondition} THEN 1 ELSE 0 END,? WHERE {GUARD}`,
      preflightKey,...targetValues,...holdingValues,JSON.stringify({actor:'SYSTEM_MIGRATION',accountCount:users.length,itemCount:TARGETED_SKILL_CHIP_GRANT_V2055_ITEMS.length,verifiedPairs:grants.length}))
  ];

  for(const grant of grants.filter(entry=>entry.quantityGranted===1)){
    const referenceId=`${TARGETED_SKILL_CHIP_GRANT_V2055_MARKER_KEY}:${grant.user.userId}:${grant.item.code}`;
    const targetId=`${grant.user.userId}:${grant.item.code}`;
    const beforeAudit=JSON.stringify({operationKey:TARGETED_SKILL_CHIP_GRANT_V2055_MARKER_KEY,actor:'SYSTEM_MIGRATION',itemCode:grant.item.code,quantity:grant.quantityBefore,unseenQuantity:grant.unseenBefore});
    const afterAudit=JSON.stringify({operationKey:TARGETED_SKILL_CHIP_GRANT_V2055_MARKER_KEY,actor:'SYSTEM_MIGRATION',itemCode:grant.item.code,quantity:grant.quantityAfter,unseenQuantity:grant.unseenAfter,quantityGranted:1,permanent:true});
    Object.assign(grant,{referenceId,targetId,afterAudit});
    statements.push(
      guarded(`INSERT INTO cnine_user_inventory(user_id,item_code,quantity,unseen_quantity,created_at,updated_at)
        SELECT ?,?,?,?,CURRENT_TIMESTAMP,CURRENT_TIMESTAMP WHERE
        EXISTS(SELECT 1 FROM ${VERIFICATION_TABLE} WHERE operation_key=? AND verified=1) AND {GUARD}
        ON CONFLICT(user_id,item_code) DO UPDATE SET quantity=excluded.quantity,unseen_quantity=excluded.unseen_quantity,updated_at=CURRENT_TIMESTAMP`,
        grant.user.userId,grant.item.code,grant.quantityAfter,grant.unseenAfter,preflightKey),
      guarded(`INSERT INTO inventory_logs(user_id,item_code,change_amount,balance_after,reason,reference_type,reference_id,admin_id)
        SELECT ?,?,?,?,?,'${REFERENCE_TYPE}',?,? WHERE
        NOT EXISTS(SELECT 1 FROM inventory_logs WHERE user_id=? AND item_code=? AND reference_type='${REFERENCE_TYPE}' AND reference_id=?)
        AND EXISTS(SELECT 1 FROM ${VERIFICATION_TABLE} WHERE operation_key=? AND verified=1) AND {GUARD}`,
        grant.user.userId,grant.item.code,1,grant.quantityAfter,`${REASON} · ${grant.item.name}`,referenceId,ownerId,
        grant.user.userId,grant.item.code,referenceId,preflightKey),
      guarded(`INSERT INTO admin_logs(admin_id,action_type,target_type,target_id,before_data,after_data)
        SELECT ?,?,'USER_INVENTORY',?,?,? WHERE
        NOT EXISTS(SELECT 1 FROM admin_logs WHERE admin_id=? AND action_type=? AND target_type='USER_INVENTORY' AND target_id=? AND after_data=?)
        AND EXISTS(SELECT 1 FROM ${VERIFICATION_TABLE} WHERE operation_key=? AND verified=1) AND {GUARD}`,
        ownerId,ACTION,targetId,beforeAudit,afterAudit,ownerId,ACTION,targetId,afterAudit,preflightKey)
    );
  }

  const finalConditions=[...targetConditions];
  const finalValues=[...targetValues];
  grants.forEach(grant=>{
    finalConditions.push(`EXISTS(SELECT 1 FROM cnine_user_inventory WHERE user_id=? AND item_code=? AND quantity=? AND COALESCE(unseen_quantity,0)=?)`);
    finalValues.push(grant.user.userId,grant.item.code,grant.quantityAfter,grant.unseenAfter);
    if(grant.quantityGranted===1){
      finalConditions.push(`EXISTS(SELECT 1 FROM inventory_logs WHERE user_id=? AND item_code=? AND change_amount=1 AND balance_after=? AND reference_type='${REFERENCE_TYPE}' AND reference_id=?)`);
      finalValues.push(grant.user.userId,grant.item.code,grant.quantityAfter,grant.referenceId);
      finalConditions.push(`EXISTS(SELECT 1 FROM admin_logs WHERE admin_id=? AND action_type=? AND target_type='USER_INVENTORY' AND target_id=? AND after_data=?)`);
      finalValues.push(ownerId,ACTION,grant.targetId,grant.afterAudit);
    }
  });
  statements.push(
    guarded(`INSERT INTO ${VERIFICATION_TABLE}(operation_key,verified,detail)
      SELECT ?,CASE WHEN ${finalConditions.join(' AND ')} THEN 1 ELSE 0 END,? WHERE {GUARD}`,
      finalKey,...finalValues,completedValue),
    guarded(`UPDATE app_meta SET value=?,updated_at=CURRENT_TIMESTAMP WHERE key=? AND value=?
      AND EXISTS(SELECT 1 FROM ${VERIFICATION_TABLE} WHERE operation_key=? AND verified=1) AND {GUARD}`,
      completedValue,TARGETED_SKILL_CHIP_GRANT_V2055_MARKER_KEY,runningValue,finalKey)
  );

  const results=await env.DB.batch(statements);
  if(Number(results[0]?.meta?.changes||0)===0){
    const replay=completedSummary(await env.DB.prepare('SELECT value FROM app_meta WHERE key=?').bind(TARGETED_SKILL_CHIP_GRANT_V2055_MARKER_KEY).first());
    if(replay)return replay;
    return{status:'RUNNING',version:TARGETED_SKILL_CHIP_GRANT_V2055_VERSION,replayed:true};
  }
  const stored=completedSummary(await env.DB.prepare('SELECT value FROM app_meta WHERE key=?').bind(TARGETED_SKILL_CHIP_GRANT_V2055_MARKER_KEY).first(),{replayed:false});
  if(!stored)throw new Error('두 지정 계정의 로켓런처·헬기폭격 스킬칩 지급 결과를 최종 검증하지 못했습니다.');
  console.log('TARGETED_SKILL_CHIP_GRANT_V2055',JSON.stringify({status:stored.status,version:stored.version,accountCount:stored.accountCount,verifiedPairs:stored.verifiedPairs,quantityGranted:stored.quantityGranted,replayed:stored.replayed}));
  return stored;
}
