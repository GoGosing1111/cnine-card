export const TARGETED_CARD_GRANT_V2016_VERSION=2016;
export const TARGETED_CARD_GRANT_V2016_MARKER_KEY='targeted_card_grant_v2016_simsimi_fur_cheolwadae_kimseongtae_x1_level12';
export const TARGETED_CARD_GRANT_V2016_NICKNAME='심심이';
export const TARGETED_CARD_GRANT_V2016_CARD_ID='CN-02D9DC1E8A8A4209';
export const TARGETED_CARD_GRANT_V2016_QUANTITY=1;
export const TARGETED_CARD_GRANT_V2016_LEVEL=12;

const TARGETED_CARD_GRANT_V2016_TITLE='철와대 킴성태';
const TARGETED_CARD_GRANT_V2016_MEMBER='킴성태';
const TARGETED_CARD_GRANT_V2016_GRADE='FUR';
const TARGETED_CARD_GRANT_V2016_ACTION='SYSTEM_CARD_GRANT_V2016';
const TARGETED_CARD_GRANT_V2016_VERIFICATION_TABLE='targeted_card_grant_v2016_verifications';

function rows(result){return result?.results||[]}
function integer(value,fallback=0){const number=Number(value);return Number.isFinite(number)?Math.floor(number):fallback}
function safeJson(value,fallback){try{const parsed=typeof value==='string'?JSON.parse(value):value;return parsed??fallback}catch{return fallback}}
function completedSummary(row,{replayed=true}={}){const parsed=safeJson(row?.value,null);return parsed?.status==='COMPLETED'?{...parsed,replayed}:null}

async function ensureFoundation(env){
  const postgres=env.DB?.dialect==='postgres';
  const nowDefault=postgres?"to_char(timezone('UTC',CURRENT_TIMESTAMP),'YYYY-MM-DD HH24:MI:SS')":'CURRENT_TIMESTAMP';
  const schema=[`CREATE TABLE IF NOT EXISTS ${TARGETED_CARD_GRANT_V2016_VERIFICATION_TABLE}(
    operation_key TEXT PRIMARY KEY,verified INTEGER NOT NULL CHECK(verified=1),detail TEXT NOT NULL DEFAULT '',created_at TEXT NOT NULL DEFAULT ${nowDefault})`];
  if(postgres&&typeof env.DB.execSchema==='function')await env.DB.execSchema(schema);
  else await env.DB.batch(schema.map(sql=>env.DB.prepare(sql)));
}

export async function ensureTargetedCardGrantV2016(env){
  const existing=completedSummary(await env.DB.prepare('SELECT value FROM app_meta WHERE key=?').bind(TARGETED_CARD_GRANT_V2016_MARKER_KEY).first());
  if(existing)return existing;

  await ensureFoundation(env);
  const [usersResult,card,holding,owner]=await Promise.all([
    env.DB.prepare('SELECT id,nickname,role,status FROM users WHERE nickname=? ORDER BY id LIMIT 2').bind(TARGETED_CARD_GRANT_V2016_NICKNAME).all(),
    env.DB.prepare(`SELECT c.id,c.title,UPPER(c.rarity) grade,c.is_active isActive,COALESCE(c.card_status,'PUBLIC') cardStatus,
      m.name memberName,COALESCE(m.is_active,1) memberActive FROM cards_effective_v1210 c JOIN members m ON m.id=c.member_id WHERE c.id=?`).bind(TARGETED_CARD_GRANT_V2016_CARD_ID).first(),
    env.DB.prepare(`SELECT user_id,card_id,quantity,COALESCE(breakthrough_level,0) breakthroughLevel,
      COALESCE(breakthrough_fail_count,0) breakthroughFailCount FROM user_cards
      WHERE user_id=(SELECT id FROM users WHERE nickname=? ORDER BY id LIMIT 1) AND card_id=?`).bind(TARGETED_CARD_GRANT_V2016_NICKNAME,TARGETED_CARD_GRANT_V2016_CARD_ID).first(),
    env.DB.prepare("SELECT id FROM users WHERE UPPER(role)='OWNER' AND UPPER(status)='ACTIVE' ORDER BY id LIMIT 1").first()
  ]);

  const users=rows(usersResult);
  if(users.length!==1)throw new Error('지정 대상 계정을 정확히 한 개 찾지 못해 카드 지급을 중단했습니다.');
  const user=users[0],userId=integer(user.id),ownerId=integer(owner?.id);
  if(!userId||String(user.nickname||'')!==TARGETED_CARD_GRANT_V2016_NICKNAME||String(user.status||'').trim().toUpperCase()!=='ACTIVE'){
    throw new Error('지정 대상 계정이 활성 계정으로 확인되지 않아 카드 지급을 중단했습니다.');
  }
  if(!ownerId)throw new Error('카드 지급 감사 로그를 기록할 활성 OWNER 계정을 찾지 못했습니다.');
  if(!card||String(card.id||'')!==TARGETED_CARD_GRANT_V2016_CARD_ID||String(card.title||'')!==TARGETED_CARD_GRANT_V2016_TITLE
    ||String(card.memberName||'')!==TARGETED_CARD_GRANT_V2016_MEMBER||String(card.grade||'')!==TARGETED_CARD_GRANT_V2016_GRADE
    ||integer(card.isActive)!==1||String(card.cardStatus||'').toUpperCase()!=='PUBLIC'||integer(card.memberActive)!==1){
    throw new Error('지정 FUR 카드가 활성·공개 카탈로그로 확인되지 않아 지급을 중단했습니다.');
  }

  const rawQuantity=integer(holding?.quantity),quantityBefore=Math.max(0,rawQuantity),levelBefore=integer(holding?.breakthroughLevel);
  const failCountBefore=integer(holding?.breakthroughFailCount),quantityAfter=quantityBefore+TARGETED_CARD_GRANT_V2016_QUANTITY;
  const breakthroughLevel=quantityBefore>0?Math.max(levelBefore,TARGETED_CARD_GRANT_V2016_LEVEL):TARGETED_CARD_GRANT_V2016_LEVEL;
  const failCountAfter=quantityBefore>0&&levelBefore>=TARGETED_CARD_GRANT_V2016_LEVEL?failCountBefore:0;
  const summary={status:'COMPLETED',version:TARGETED_CARD_GRANT_V2016_VERSION,completedAt:new Date().toISOString(),
    cardId:TARGETED_CARD_GRANT_V2016_CARD_ID,quantityGranted:TARGETED_CARD_GRANT_V2016_QUANTITY,quantityBefore,quantityAfter,
    levelRequested:TARGETED_CARD_GRANT_V2016_LEVEL,breakthroughLevel};
  const runningValue=JSON.stringify({status:'RUNNING',version:TARGETED_CARD_GRANT_V2016_VERSION,nonce:crypto.randomUUID(),startedAt:new Date().toISOString()});
  const completedValue=JSON.stringify(summary);
  const beforeAudit=JSON.stringify({operationKey:TARGETED_CARD_GRANT_V2016_MARKER_KEY,actor:'SYSTEM_MIGRATION',cardId:TARGETED_CARD_GRANT_V2016_CARD_ID,quantity:quantityBefore,breakthroughLevel:levelBefore,breakthroughFailCount:failCountBefore});
  const afterAudit=JSON.stringify({operationKey:TARGETED_CARD_GRANT_V2016_MARKER_KEY,actor:'SYSTEM_MIGRATION',cardId:TARGETED_CARD_GRANT_V2016_CARD_ID,quantity:quantityAfter,breakthroughLevel,breakthroughFailCount:failCountAfter,quantityGranted:TARGETED_CARD_GRANT_V2016_QUANTITY});
  const guard='EXISTS(SELECT 1 FROM app_meta WHERE key=? AND value=?)';
  const guarded=(sql,...values)=>env.DB.prepare(sql.replace('{GUARD}',guard)).bind(...values,TARGETED_CARD_GRANT_V2016_MARKER_KEY,runningValue);
  const rowLock=env.DB?.dialect==='postgres'?' FOR UPDATE':'';
  const preflightKey=`${TARGETED_CARD_GRANT_V2016_MARKER_KEY}:preflight`,finalKey=`${TARGETED_CARD_GRANT_V2016_MARKER_KEY}:final`;
  const holdingCondition=holding
    ?'EXISTS(SELECT 1 FROM user_cards WHERE user_id=? AND card_id=? AND quantity=? AND COALESCE(breakthrough_level,0)=? AND COALESCE(breakthrough_fail_count,0)=?)'
    :'NOT EXISTS(SELECT 1 FROM user_cards WHERE user_id=? AND card_id=?)';
  const holdingValues=holding?[userId,TARGETED_CARD_GRANT_V2016_CARD_ID,rawQuantity,levelBefore,failCountBefore]:[userId,TARGETED_CARD_GRANT_V2016_CARD_ID];
  const statements=[
    env.DB.prepare('INSERT OR IGNORE INTO app_meta(key,value,updated_at) VALUES(?,?,CURRENT_TIMESTAMP)').bind(TARGETED_CARD_GRANT_V2016_MARKER_KEY,runningValue),
    env.DB.prepare(`SELECT id FROM users WHERE id=? AND nickname=? AND UPPER(status)='ACTIVE'${rowLock}`).bind(userId,TARGETED_CARD_GRANT_V2016_NICKNAME),
    env.DB.prepare(`SELECT id FROM users WHERE id=? AND UPPER(role)='OWNER' AND UPPER(status)='ACTIVE'${rowLock}`).bind(ownerId),
    env.DB.prepare(`SELECT user_id FROM user_cards WHERE user_id=? AND card_id=?${rowLock}`).bind(userId,TARGETED_CARD_GRANT_V2016_CARD_ID),
    guarded(`INSERT INTO ${TARGETED_CARD_GRANT_V2016_VERIFICATION_TABLE}(operation_key,verified,detail)
      SELECT ?,CASE WHEN
        EXISTS(SELECT 1 FROM users WHERE id=? AND nickname=? AND UPPER(status)='ACTIVE')
        AND NOT EXISTS(SELECT 1 FROM users WHERE id<>? AND nickname=?)
        AND EXISTS(SELECT 1 FROM users WHERE id=? AND UPPER(role)='OWNER' AND UPPER(status)='ACTIVE')
        AND EXISTS(SELECT 1 FROM cards_effective_v1210 c JOIN members m ON m.id=c.member_id WHERE c.id=? AND c.title=? AND UPPER(c.rarity)=? AND c.is_active=1 AND COALESCE(c.card_status,'PUBLIC')='PUBLIC' AND m.name=? AND COALESCE(m.is_active,1)=1)
        AND ${holdingCondition}
        THEN 1 ELSE 0 END,? WHERE {GUARD}`,
      preflightKey,userId,TARGETED_CARD_GRANT_V2016_NICKNAME,userId,TARGETED_CARD_GRANT_V2016_NICKNAME,ownerId,
      TARGETED_CARD_GRANT_V2016_CARD_ID,TARGETED_CARD_GRANT_V2016_TITLE,TARGETED_CARD_GRANT_V2016_GRADE,TARGETED_CARD_GRANT_V2016_MEMBER,
      ...holdingValues,JSON.stringify({actor:'SYSTEM_MIGRATION',targetVerified:true,quantityBefore,breakthroughLevel:levelBefore,breakthroughFailCount:failCountBefore})),
    guarded(`INSERT INTO user_cards(user_id,card_id,quantity,breakthrough_level,breakthrough_fail_count,first_obtained_at,last_obtained_at)
      SELECT ?,?,?,?,0,CURRENT_TIMESTAMP,CURRENT_TIMESTAMP WHERE
      EXISTS(SELECT 1 FROM users WHERE id=? AND nickname=? AND UPPER(status)='ACTIVE')
      AND EXISTS(SELECT 1 FROM cards_effective_v1210 c JOIN members m ON m.id=c.member_id WHERE c.id=? AND c.title=? AND UPPER(c.rarity)=? AND c.is_active=1 AND COALESCE(c.card_status,'PUBLIC')='PUBLIC' AND m.name=? AND COALESCE(m.is_active,1)=1)
      AND ${holdingCondition} AND {GUARD}
      ON CONFLICT(user_id,card_id) DO UPDATE SET quantity=CASE WHEN user_cards.quantity<0 THEN excluded.quantity ELSE user_cards.quantity+excluded.quantity END,
        breakthrough_level=CASE WHEN user_cards.quantity<=0 OR user_cards.breakthrough_level<excluded.breakthrough_level THEN excluded.breakthrough_level ELSE user_cards.breakthrough_level END,
        breakthrough_fail_count=CASE WHEN user_cards.quantity<=0 OR user_cards.breakthrough_level<excluded.breakthrough_level THEN 0 ELSE user_cards.breakthrough_fail_count END,
        last_obtained_at=CURRENT_TIMESTAMP`,
      userId,TARGETED_CARD_GRANT_V2016_CARD_ID,TARGETED_CARD_GRANT_V2016_QUANTITY,TARGETED_CARD_GRANT_V2016_LEVEL,userId,TARGETED_CARD_GRANT_V2016_NICKNAME,
      TARGETED_CARD_GRANT_V2016_CARD_ID,TARGETED_CARD_GRANT_V2016_TITLE,TARGETED_CARD_GRANT_V2016_GRADE,TARGETED_CARD_GRANT_V2016_MEMBER,...holdingValues),
    guarded(`INSERT INTO admin_logs(admin_id,action_type,target_type,target_id,before_data,after_data)
      SELECT ?,?,'USER_CARD',?, ?,? WHERE
      NOT EXISTS(SELECT 1 FROM admin_logs WHERE admin_id=? AND action_type=? AND target_type='USER_CARD' AND target_id=? AND after_data=?) AND {GUARD}`,
      ownerId,TARGETED_CARD_GRANT_V2016_ACTION,`${userId}:${TARGETED_CARD_GRANT_V2016_CARD_ID}`,beforeAudit,afterAudit,
      ownerId,TARGETED_CARD_GRANT_V2016_ACTION,`${userId}:${TARGETED_CARD_GRANT_V2016_CARD_ID}`,afterAudit),
    guarded(`INSERT INTO ${TARGETED_CARD_GRANT_V2016_VERIFICATION_TABLE}(operation_key,verified,detail)
      SELECT ?,CASE WHEN
        EXISTS(SELECT 1 FROM users WHERE id=? AND nickname=? AND UPPER(status)='ACTIVE')
        AND NOT EXISTS(SELECT 1 FROM users WHERE id<>? AND nickname=?)
        AND EXISTS(SELECT 1 FROM users WHERE id=? AND UPPER(role)='OWNER' AND UPPER(status)='ACTIVE')
        AND EXISTS(SELECT 1 FROM cards_effective_v1210 c JOIN members m ON m.id=c.member_id WHERE c.id=? AND c.title=? AND UPPER(c.rarity)=? AND c.is_active=1 AND COALESCE(c.card_status,'PUBLIC')='PUBLIC' AND m.name=? AND COALESCE(m.is_active,1)=1)
        AND EXISTS(SELECT 1 FROM user_cards WHERE user_id=? AND card_id=? AND quantity=? AND COALESCE(breakthrough_level,0)=? AND COALESCE(breakthrough_fail_count,0)=?)
        AND EXISTS(SELECT 1 FROM admin_logs WHERE admin_id=? AND action_type=? AND target_type='USER_CARD' AND target_id=? AND after_data=?)
        THEN 1 ELSE 0 END,? WHERE {GUARD}`,
      finalKey,userId,TARGETED_CARD_GRANT_V2016_NICKNAME,userId,TARGETED_CARD_GRANT_V2016_NICKNAME,ownerId,
      TARGETED_CARD_GRANT_V2016_CARD_ID,TARGETED_CARD_GRANT_V2016_TITLE,TARGETED_CARD_GRANT_V2016_GRADE,TARGETED_CARD_GRANT_V2016_MEMBER,
      userId,TARGETED_CARD_GRANT_V2016_CARD_ID,quantityAfter,breakthroughLevel,failCountAfter,
      ownerId,TARGETED_CARD_GRANT_V2016_ACTION,`${userId}:${TARGETED_CARD_GRANT_V2016_CARD_ID}`,afterAudit,completedValue),
    guarded(`UPDATE app_meta SET value=?,updated_at=CURRENT_TIMESTAMP WHERE key=? AND value=?
      AND EXISTS(SELECT 1 FROM ${TARGETED_CARD_GRANT_V2016_VERIFICATION_TABLE} WHERE operation_key=? AND verified=1) AND {GUARD}`,
      completedValue,TARGETED_CARD_GRANT_V2016_MARKER_KEY,runningValue,finalKey)
  ];

  const results=await env.DB.batch(statements);
  if(Number(results[0]?.meta?.changes||0)===0){
    const replay=completedSummary(await env.DB.prepare('SELECT value FROM app_meta WHERE key=?').bind(TARGETED_CARD_GRANT_V2016_MARKER_KEY).first());
    if(replay)return replay;
    return{status:'RUNNING',version:TARGETED_CARD_GRANT_V2016_VERSION,replayed:true};
  }
  const stored=completedSummary(await env.DB.prepare('SELECT value FROM app_meta WHERE key=?').bind(TARGETED_CARD_GRANT_V2016_MARKER_KEY).first(),{replayed:false});
  if(!stored)throw new Error('지정 계정의 FUR 카드 지급 결과를 최종 검증하지 못했습니다.');
  console.log('TARGETED_CARD_GRANT_V2016',JSON.stringify({status:stored.status,version:stored.version,cardId:stored.cardId,quantityGranted:stored.quantityGranted,quantityAfter:stored.quantityAfter,breakthroughLevel:stored.breakthroughLevel,replayed:stored.replayed}));
  return stored;
}
