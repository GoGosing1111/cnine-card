import {MERCENARY_CMS_SEED} from './_mercenary_cms_seed.js';
import {readMercenaryDocument} from './_mercenary_account.js';

export const TARGETED_REWARD_GRANT_20260921_VERSION=1;
export const TARGETED_REWARD_GRANT_20260921_MARKER_KEY='targeted_reward_grant_20260921_blackcastle_guwaham_gongdan_v1';
export const TARGETED_REWARD_GRANT_20260921_TARGETS=Object.freeze({
  mercenary:'블랙캐슬',coin:'구와함',hBody:'공단'
});
export const TARGETED_REWARD_GRANT_20260921_COIN=300000000000;
export const TARGETED_REWARD_GRANT_20260921_EQUIPMENT_CODE='BATTLE_SUIT_H_BODY';

const VERIFICATION_TABLE='targeted_reward_grant_20260921_v1_verifications';
const MERCENARY_ACQUISITION_ID='SYSTEM-GRANT-20260921-BLACKCASTLE-S-V1';
const H_BODY_REQUEST_ID='SYSTEM-GRANT-20260921-GONGDAN-H-BODY-V1';
const MERCENARY_ACTION='SYSTEM_MERCENARY_GRANT_BLACKCASTLE_S_V1';
const COIN_ACTION='SYSTEM_COIN_GRANT_GUWAHAM_300B_V1';
const H_BODY_ACTION='SYSTEM_EQUIPMENT_GRANT_GONGDAN_H_BODY_V1';

function rows(result){return result?.results||[]}
function integer(value,fallback=0){const number=Number(value);return Number.isFinite(number)?Math.floor(number):fallback}
function safeJson(value,fallback){try{const parsed=typeof value==='string'?JSON.parse(value):value;return parsed??fallback}catch{return fallback}}
function completedSummary(row,{replayed=true}={}){const parsed=safeJson(row?.value,null);return parsed?.status==='COMPLETED'?{...parsed,replayed}:null}
function randomIndex(max){
  if(!Number.isSafeInteger(max)||max<1||max>0xffffffff)throw new Error('S급 용병 랜덤 후보 수가 올바르지 않습니다.');
  const value=new Uint32Array(1),limit=Math.floor(0x100000000/max)*max;
  do{crypto.getRandomValues(value)}while(value[0]>=limit);
  return value[0]%max;
}
function onlyActiveUser(all,nickname,label){
  const matched=all.filter(row=>String(row.nickname||'')===nickname);
  if(matched.length!==1||String(matched[0].status||'').toUpperCase()!=='ACTIVE'||!integer(matched[0].id)){
    throw new Error(`${label} 지급 대상 활성 계정을 정확히 한 개 찾지 못했습니다.`);
  }
  return matched[0];
}
async function ensureFoundation(env){
  const nowDefault=env.DB?.dialect==='postgres'?"to_char(timezone('UTC',CURRENT_TIMESTAMP),'YYYY-MM-DD HH24:MI:SS')":'CURRENT_TIMESTAMP';
  const schema=[`CREATE TABLE IF NOT EXISTS ${VERIFICATION_TABLE}(operation_key TEXT PRIMARY KEY,verified INTEGER NOT NULL CHECK(verified=1),detail TEXT NOT NULL DEFAULT '',created_at TEXT NOT NULL DEFAULT ${nowDefault})`];
  if(env.DB?.dialect==='postgres'&&typeof env.DB.execSchema==='function')await env.DB.execSchema(schema);
  else await env.DB.batch(schema.map(sql=>env.DB.prepare(sql)));
}
async function replayVerification(env,summary){
  const targets=TARGETED_REWARD_GRANT_20260921_TARGETS;
  const userRows=rows(await env.DB.prepare('SELECT id,nickname,status FROM users WHERE nickname IN (?,?,?) ORDER BY id').bind(targets.mercenary,targets.coin,targets.hBody).all());
  const mercenaryUsers=userRows.filter(row=>row.nickname===targets.mercenary&&String(row.status).toUpperCase()==='ACTIVE');
  const coinUsers=userRows.filter(row=>row.nickname===targets.coin&&String(row.status).toUpperCase()==='ACTIVE');
  const hBodyUsers=userRows.filter(row=>row.nickname===targets.hBody&&String(row.status).toUpperCase()==='ACTIVE');
  if(mercenaryUsers.length!==1||coinUsers.length!==1||hBodyUsers.length!==1)return {...summary,verification:{mercenary:false,coinReceipt:false,hBody:false,all:false}};
  const [mercenary,coinReceipt,hBody]=await Promise.all([
    env.DB.prepare('SELECT acquisition_id FROM mercenary_card_acquisitions_v1 WHERE acquisition_id=? AND user_id=? AND mercenary_code=?').bind(MERCENARY_ACQUISITION_ID,mercenaryUsers[0].id,summary.mercenary.code).first(),
    env.DB.prepare('SELECT id FROM coin_logs WHERE user_id=? AND change_amount=CAST(? AS BIGINT) AND reason=?').bind(coinUsers[0].id,String(TARGETED_REWARD_GRANT_20260921_COIN),TARGETED_REWARD_GRANT_20260921_MARKER_KEY).first(),
    env.DB.prepare(`SELECT x.id FROM user_equipment_instances x JOIN character_equipment_items i ON i.id=x.equipment_id
      WHERE x.user_id=? AND i.code=? AND x.request_id=?`).bind(hBodyUsers[0].id,TARGETED_REWARD_GRANT_20260921_EQUIPMENT_CODE,H_BODY_REQUEST_ID).first()
  ]);
  const verification={mercenary:Boolean(mercenary),coinReceipt:Boolean(coinReceipt),hBody:Boolean(hBody)};
  verification.all=verification.mercenary&&verification.coinReceipt&&verification.hBody;
  return {...summary,verification};
}

export async function ensureTargetedRewardGrant20260921V1(env,{randomInt=randomIndex}={}){
  const previous=completedSummary(await env.DB.prepare('SELECT value FROM app_meta WHERE key=?').bind(TARGETED_REWARD_GRANT_20260921_MARKER_KEY).first());
  if(previous)return replayVerification(env,previous);

  await ensureFoundation(env);
  const targets=TARGETED_REWARD_GRANT_20260921_TARGETS;
  const [usersResult,owner,item,mercenaryState]=await Promise.all([
    env.DB.prepare('SELECT id,nickname,role,status,CAST(coin AS TEXT) coin FROM users WHERE nickname IN (?,?,?) ORDER BY id').bind(targets.mercenary,targets.coin,targets.hBody).all(),
    env.DB.prepare("SELECT id FROM users WHERE UPPER(role)='OWNER' AND UPPER(status)='ACTIVE' ORDER BY id LIMIT 1").first(),
    env.DB.prepare('SELECT id,code,name,slot,is_active isActive,is_public isPublic FROM character_equipment_items WHERE code=?').bind(TARGETED_REWARD_GRANT_20260921_EQUIPMENT_CODE).first(),
    readMercenaryDocument(env)
  ]);
  const allUsers=rows(usersResult),mercenaryUser=onlyActiveUser(allUsers,targets.mercenary,'S급 용병'),coinUser=onlyActiveUser(allUsers,targets.coin,'3천억 코인'),hBodyUser=onlyActiveUser(allUsers,targets.hBody,'H-BODY');
  const userIds=[mercenaryUser,coinUser,hBodyUser].map(row=>integer(row.id));
  if(new Set(userIds).size!==3)throw new Error('지급 대상 세 계정이 서로 다르지 않아 지급을 중단했습니다.');
  const ownerId=integer(owner?.id),equipmentId=integer(item?.id);
  if(!ownerId)throw new Error('지급 감사 로그를 기록할 활성 OWNER 계정을 찾지 못했습니다.');
  if(!equipmentId||item.code!==TARGETED_REWARD_GRANT_20260921_EQUIPMENT_CODE||item.name!=='H-BODY'||item.slot!=='BATTLE_SUIT'||integer(item.isActive)!==1||integer(item.isPublic)!==1){
    throw new Error('활성 공개 H-BODY 카탈로그를 정확히 확인하지 못해 지급을 중단했습니다.');
  }
  const catalogByCode=new Map(MERCENARY_CMS_SEED.catalog.cards.map(card=>[card.code,card]));
  const sPool=mercenaryState.document.mercenaries.filter(card=>card.rank==='S'&&catalogByCode.has(card.code));
  if(!sPool.length)throw new Error('현재 용병 CMS에 지급 가능한 S급 용병이 없습니다.');
  const pick=integer(randomInt(sPool.length),-1);
  if(pick<0||pick>=sPool.length)throw new Error('S급 용병 랜덤 결과가 올바르지 않습니다.');
  const selected=sPool[pick],catalog=catalogByCode.get(selected.code);
  const [ownedMercenary,hBodyCountRow]=await Promise.all([
    env.DB.prepare('SELECT total_copies,duplicate_count FROM user_mercenary_cards_v1 WHERE user_id=? AND mercenary_code=?').bind(mercenaryUser.id,selected.code).first(),
    env.DB.prepare('SELECT COUNT(*) count FROM user_equipment_instances WHERE user_id=? AND equipment_id=?').bind(hBodyUser.id,equipmentId).first()
  ]);
  const mercenaryCopiesBefore=Math.max(0,integer(ownedMercenary?.total_copies)),mercenaryCopiesAfter=mercenaryCopiesBefore+1;
  const hBodyQuantityBefore=Math.max(0,integer(hBodyCountRow?.count)),hBodyQuantityAfter=hBodyQuantityBefore+1;
  const coinBefore=BigInt(String(coinUser.coin));
  const coinAfter=coinBefore+BigInt(TARGETED_REWARD_GRANT_20260921_COIN);
  if(coinBefore<0n||coinAfter>9223372036854775807n)throw new Error('구와함 코인 잔액이 지급 가능한 범위를 벗어났습니다.');
  const now=new Date().toISOString();
  const summary={status:'COMPLETED',version:TARGETED_REWARD_GRANT_20260921_VERSION,completedAt:now,
    mercenary:{code:selected.code,name:selected.name||catalog.name,rank:'S',duplicate:mercenaryCopiesBefore>0,totalCopiesAfter:mercenaryCopiesAfter},
    coin:{amount:TARGETED_REWARD_GRANT_20260921_COIN,balanceAfter:String(coinAfter)},
    hBody:{equipmentCode:TARGETED_REWARD_GRANT_20260921_EQUIPMENT_CODE,quantityAfter:hBodyQuantityAfter},
    verification:{mercenary:true,coinReceipt:true,hBody:true,all:true}};
  const runningValue=JSON.stringify({status:'RUNNING',version:TARGETED_REWARD_GRANT_20260921_VERSION,nonce:crypto.randomUUID(),selectedMercenaryCode:selected.code,startedAt:now});
  const completedValue=JSON.stringify(summary);
  const rowLock=env.DB?.dialect==='postgres'?' FOR UPDATE':'';
  const guard='EXISTS(SELECT 1 FROM app_meta WHERE key=? AND value=?)';
  const guarded=(sql,...values)=>env.DB.prepare(sql.replaceAll('{GUARD}',guard)).bind(...values,TARGETED_REWARD_GRANT_20260921_MARKER_KEY,runningValue);
  const preflightKey=`${TARGETED_REWARD_GRANT_20260921_MARKER_KEY}:preflight`,finalKey=`${TARGETED_REWARD_GRANT_20260921_MARKER_KEY}:final`;
  const verified=key=>`EXISTS(SELECT 1 FROM ${VERIFICATION_TABLE} WHERE operation_key='${key}' AND verified=1)`;
  const usersCondition=`EXISTS(SELECT 1 FROM users WHERE id=? AND nickname=? AND UPPER(status)='ACTIVE')
    AND NOT EXISTS(SELECT 1 FROM users WHERE id<>? AND nickname=?)
    AND EXISTS(SELECT 1 FROM users WHERE id=? AND nickname=? AND UPPER(status)='ACTIVE' AND coin=CAST(? AS BIGINT))
    AND NOT EXISTS(SELECT 1 FROM users WHERE id<>? AND nickname=?)
    AND EXISTS(SELECT 1 FROM users WHERE id=? AND nickname=? AND UPPER(status)='ACTIVE')
    AND NOT EXISTS(SELECT 1 FROM users WHERE id<>? AND nickname=?)
    AND EXISTS(SELECT 1 FROM users WHERE id=? AND UPPER(role)='OWNER' AND UPPER(status)='ACTIVE')`;
  const usersValues=[mercenaryUser.id,targets.mercenary,mercenaryUser.id,targets.mercenary,
    coinUser.id,targets.coin,String(coinBefore),coinUser.id,targets.coin,
    hBodyUser.id,targets.hBody,hBodyUser.id,targets.hBody,ownerId];
  const mercenaryBeforeCondition=ownedMercenary
    ?'EXISTS(SELECT 1 FROM user_mercenary_cards_v1 WHERE user_id=? AND mercenary_code=? AND total_copies=? AND duplicate_count=?)'
    :'NOT EXISTS(SELECT 1 FROM user_mercenary_cards_v1 WHERE user_id=? AND mercenary_code=?)';
  const mercenaryBeforeValues=ownedMercenary
    ?[mercenaryUser.id,selected.code,mercenaryCopiesBefore,mercenaryCopiesBefore-1]
    :[mercenaryUser.id,selected.code];
  const beforeAudit=JSON.stringify({operationKey:TARGETED_REWARD_GRANT_20260921_MARKER_KEY,mercenary:{code:selected.code,totalCopies:mercenaryCopiesBefore},coin:{balance:String(coinBefore)},hBody:{quantity:hBodyQuantityBefore}});
  const statements=[
    env.DB.prepare('INSERT OR IGNORE INTO app_meta(key,value,updated_at) VALUES(?,?,CURRENT_TIMESTAMP)').bind(TARGETED_REWARD_GRANT_20260921_MARKER_KEY,runningValue),
    env.DB.prepare(`SELECT id FROM users WHERE id IN (?,?,?,?) ORDER BY id${rowLock}`).bind(...userIds,ownerId),
    env.DB.prepare(`SELECT id FROM character_equipment_items WHERE id=? AND code=?${rowLock}`).bind(equipmentId,TARGETED_REWARD_GRANT_20260921_EQUIPMENT_CODE),
    env.DB.prepare(`SELECT user_id FROM user_mercenary_cards_v1 WHERE user_id=? AND mercenary_code=?${rowLock}`).bind(mercenaryUser.id,selected.code),
    env.DB.prepare(`SELECT id FROM user_equipment_instances WHERE user_id=? AND equipment_id=? ORDER BY id${rowLock}`).bind(hBodyUser.id,equipmentId),
    guarded(`INSERT INTO ${VERIFICATION_TABLE}(operation_key,verified,detail)
      SELECT ?,CASE WHEN ${usersCondition}
        AND EXISTS(SELECT 1 FROM character_equipment_items WHERE id=? AND code=? AND name='H-BODY' AND slot='BATTLE_SUIT' AND is_active=1 AND is_public=1)
        AND ${mercenaryBeforeCondition}
        AND (SELECT COUNT(*) FROM user_equipment_instances WHERE user_id=? AND equipment_id=?)=?
        AND NOT EXISTS(SELECT 1 FROM mercenary_card_acquisitions_v1 WHERE acquisition_id=?)
        AND NOT EXISTS(SELECT 1 FROM user_equipment_instances WHERE request_id=?)
        THEN 1 ELSE 0 END,? WHERE {GUARD}`,
      preflightKey,...usersValues,equipmentId,TARGETED_REWARD_GRANT_20260921_EQUIPMENT_CODE,...mercenaryBeforeValues,
      hBodyUser.id,equipmentId,hBodyQuantityBefore,MERCENARY_ACQUISITION_ID,H_BODY_REQUEST_ID,beforeAudit),
    guarded(`INSERT INTO user_mercenary_cards_v1(user_id,mercenary_code,total_copies,duplicate_count,first_obtained_at,last_obtained_at)
      SELECT ?,?,1,0,?,? WHERE ${verified(preflightKey)} AND {GUARD}
      ON CONFLICT(user_id,mercenary_code) DO UPDATE SET total_copies=user_mercenary_cards_v1.total_copies+1,
        duplicate_count=user_mercenary_cards_v1.duplicate_count+1,last_obtained_at=excluded.last_obtained_at`,
      mercenaryUser.id,selected.code,now,now),
    guarded(`INSERT INTO mercenary_card_acquisitions_v1(acquisition_id,user_id,mercenary_code,is_duplicate,total_copies_after,duplicate_count_after,created_at)
      SELECT ?,user_id,mercenary_code,CASE WHEN total_copies>1 THEN 1 ELSE 0 END,total_copies,duplicate_count,?
      FROM user_mercenary_cards_v1 WHERE user_id=? AND mercenary_code=? AND total_copies=? AND ${verified(preflightKey)} AND {GUARD}`,
      MERCENARY_ACQUISITION_ID,now,mercenaryUser.id,selected.code,mercenaryCopiesAfter),
    guarded(`UPDATE users SET coin=coin+CAST(? AS BIGINT) WHERE id=? AND nickname=? AND UPPER(status)='ACTIVE'
      AND coin=CAST(? AS BIGINT) AND ${verified(preflightKey)} AND {GUARD}`,
      String(TARGETED_REWARD_GRANT_20260921_COIN),coinUser.id,targets.coin,String(coinBefore)),
    guarded(`INSERT INTO coin_logs(user_id,change_amount,balance_after,reason,admin_id)
      SELECT id,CAST(? AS BIGINT),coin,?,? FROM users WHERE id=? AND coin=CAST(? AS BIGINT)
        AND ${verified(preflightKey)} AND NOT EXISTS(SELECT 1 FROM coin_logs WHERE user_id=? AND reason=?) AND {GUARD}`,
      String(TARGETED_REWARD_GRANT_20260921_COIN),TARGETED_REWARD_GRANT_20260921_MARKER_KEY,ownerId,coinUser.id,String(coinAfter),coinUser.id,TARGETED_REWARD_GRANT_20260921_MARKER_KEY),
    guarded(`INSERT INTO user_equipment_instances(user_id,equipment_id,source_type,source_id,request_id)
      SELECT ?,id,'ADMIN_GRANT',?,? FROM character_equipment_items WHERE id=? AND code=? AND name='H-BODY'
        AND slot='BATTLE_SUIT' AND is_active=1 AND is_public=1 AND ${verified(preflightKey)} AND {GUARD}`,
      hBodyUser.id,TARGETED_REWARD_GRANT_20260921_MARKER_KEY,H_BODY_REQUEST_ID,equipmentId,TARGETED_REWARD_GRANT_20260921_EQUIPMENT_CODE)
  ];
  for(const [action,targetType,targetId,after] of [
    [MERCENARY_ACTION,'USER_MERCENARY',String(mercenaryUser.id),JSON.stringify(summary.mercenary)],
    [COIN_ACTION,'USER_COIN',String(coinUser.id),JSON.stringify(summary.coin)],
    [H_BODY_ACTION,'USER_EQUIPMENT',String(hBodyUser.id),JSON.stringify(summary.hBody)]
  ])statements.push(guarded(`INSERT INTO admin_logs(admin_id,action_type,target_type,target_id,before_data,after_data)
    SELECT ?,?,?,?,?,? WHERE ${verified(preflightKey)} AND {GUARD}`,
    ownerId,action,targetType,targetId,beforeAudit,after));
  statements.push(
    guarded(`INSERT INTO ${VERIFICATION_TABLE}(operation_key,verified,detail)
      SELECT ?,CASE WHEN
        EXISTS(SELECT 1 FROM mercenary_card_acquisitions_v1 WHERE acquisition_id=? AND user_id=? AND mercenary_code=? AND total_copies_after=?)
        AND EXISTS(SELECT 1 FROM user_mercenary_cards_v1 WHERE user_id=? AND mercenary_code=? AND total_copies=? AND duplicate_count=?)
        AND EXISTS(SELECT 1 FROM users WHERE id=? AND coin=CAST(? AS BIGINT))
        AND EXISTS(SELECT 1 FROM coin_logs WHERE user_id=? AND change_amount=CAST(? AS BIGINT) AND balance_after=CAST(? AS BIGINT) AND reason=? AND admin_id=?)
        AND EXISTS(SELECT 1 FROM user_equipment_instances WHERE user_id=? AND equipment_id=? AND source_type='ADMIN_GRANT' AND source_id=? AND request_id=?)
        AND (SELECT COUNT(*) FROM user_equipment_instances WHERE user_id=? AND equipment_id=?)=?
        THEN 1 ELSE 0 END,? WHERE ${verified(preflightKey)} AND {GUARD}`,
      finalKey,MERCENARY_ACQUISITION_ID,mercenaryUser.id,selected.code,mercenaryCopiesAfter,
      mercenaryUser.id,selected.code,mercenaryCopiesAfter,mercenaryCopiesAfter-1,
      coinUser.id,String(coinAfter),coinUser.id,String(TARGETED_REWARD_GRANT_20260921_COIN),String(coinAfter),TARGETED_REWARD_GRANT_20260921_MARKER_KEY,ownerId,
      hBodyUser.id,equipmentId,TARGETED_REWARD_GRANT_20260921_MARKER_KEY,H_BODY_REQUEST_ID,hBodyUser.id,equipmentId,hBodyQuantityAfter,
      completedValue),
    guarded(`UPDATE app_meta SET value=?,updated_at=CURRENT_TIMESTAMP WHERE key=? AND value=? AND ${verified(finalKey)} AND {GUARD}`,
      completedValue,TARGETED_REWARD_GRANT_20260921_MARKER_KEY,runningValue)
  );
  const results=await env.DB.batch(statements);
  if(Number(results[0]?.meta?.changes||0)===0){
    const replay=completedSummary(await env.DB.prepare('SELECT value FROM app_meta WHERE key=?').bind(TARGETED_REWARD_GRANT_20260921_MARKER_KEY).first());
    if(replay)return replayVerification(env,replay);
    return{status:'RUNNING',version:TARGETED_REWARD_GRANT_20260921_VERSION,replayed:true};
  }
  const stored=completedSummary(await env.DB.prepare('SELECT value FROM app_meta WHERE key=?').bind(TARGETED_REWARD_GRANT_20260921_MARKER_KEY).first(),{replayed:false});
  if(!stored)throw new Error('세 계정의 지정 보상 지급 결과를 최종 검증하지 못했습니다.');
  console.log('TARGETED_REWARD_GRANT_20260921_V1',JSON.stringify({status:stored.status,version:stored.version,mercenary:stored.mercenary,coin:stored.coin,hBody:stored.hBody,replayed:stored.replayed}));
  return stored;
}
