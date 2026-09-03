import { ensureUniqueAdvancementFoundation, resolveDominantUniqueStat } from './_unique_advancement.js';

export const TARGETED_CARD_TRANSFER_VERSION=2003;
export const TARGETED_CARD_TRANSFER_MARKER_KEY='targeted_card_transfer_v2003_tyrant_kimseongtae_namsoon';
export const TARGETED_CARD_TRANSFER_NICKNAME='폭군#';
export const TARGETED_CARD_TRANSFER_SOURCE_CARD_ID='CN-F500880B2ED34350';
export const TARGETED_CARD_TRANSFER_TARGET_CARD_ID='CN-2CEC24C0087A4B61';

const VERIFICATION_TABLE='targeted_card_transfer_v2003_verifications';
const ADVANCEMENT_TABLE='card_unique_advancements_v1937';
const ACTION_TYPE='USER_CARD_TRANSFER_V2003';
const SOURCE_MEMBER='킴성태';
const TARGET_MEMBER='남순';
const REQUIRED_LEVEL=13;
const REQUIRED_CLASS='SHATTER';
const REQUIRED_DOMINANT='ATTACK';

function resultRows(result){return result?.results||[]}
function integer(value,fallback=0){const number=Number(value);return Number.isFinite(number)?Math.floor(number):fallback}
function safeJson(value,fallback){try{return JSON.parse(String(value||''))}catch{return fallback}}

export function rewriteTransferredCardIds(cardIds,sourceCardId=TARGETED_CARD_TRANSFER_SOURCE_CARD_ID,targetCardId=TARGETED_CARD_TRANSFER_TARGET_CARD_ID){
  const output=[];
  for(const rawId of Array.isArray(cardIds)?cardIds:[]){
    const id=String(rawId||'');
    const next=id===sourceCardId?targetCardId:id;
    if(next&&!output.includes(next))output.push(next);
  }
  return output;
}

function completedSummary(row,{replayed=true}={}){
  const parsed=safeJson(row?.value,null);
  return parsed?.status==='COMPLETED'?{...parsed,replayed}:null;
}

function validateCard(card,{cardId,member}){
  if(!card||String(card.id)!==cardId)throw new Error(`${cardId} 카드 정보를 찾지 못해 이전을 중단했습니다.`);
  if(String(card.memberName||'')!==member)throw new Error(`${cardId} 카드 멤버가 ${member}(으)로 확인되지 않아 이전을 중단했습니다.`);
  if(String(card.rarity||'').toUpperCase()!=='FUR')throw new Error(`${cardId} 카드가 FUR 등급이 아니어서 이전을 중단했습니다.`);
  if(integer(card.isActive)!==1||String(card.cardStatus||'PUBLIC').toUpperCase()!=='PUBLIC'||integer(card.memberActive)!==1){
    throw new Error(`${cardId} 카드가 현재 활성·공개 상태가 아니어서 이전을 중단했습니다.`);
  }
  if(integer(card.uniqueActive)!==1)throw new Error(`${cardId} 카드의 고유효과가 활성 상태가 아니어서 이전을 중단했습니다.`);
  const dominant=resolveDominantUniqueStat(card);
  if(dominant.highest<=0||dominant.dominantType!==REQUIRED_DOMINANT){
    throw new Error(`${cardId} 카드가 공격형 고유효과로 확인되지 않아 이전을 중단했습니다.`);
  }
  return dominant;
}

function deckRewrites(rows=[]){
  const rewrites=[];
  for(const row of rows){
    const before=safeJson(row.card_ids,[]);
    const after=rewriteTransferredCardIds(before);
    if(JSON.stringify(before)!==JSON.stringify(after))rewrites.push({row,before,after});
  }
  return rewrites;
}

async function ensureFoundation(env){
  const postgres=env.DB?.dialect==='postgres';
  const nowDefault=postgres?"to_char(timezone('UTC',CURRENT_TIMESTAMP),'YYYY-MM-DD HH24:MI:SS')":'CURRENT_TIMESTAMP';
  const schema=[`CREATE TABLE IF NOT EXISTS ${VERIFICATION_TABLE}(
    operation_key TEXT PRIMARY KEY,verified INTEGER NOT NULL CHECK(verified=1),detail TEXT NOT NULL DEFAULT '',created_at TEXT NOT NULL DEFAULT ${nowDefault})`];
  if(postgres&&typeof env.DB.execSchema==='function')await env.DB.execSchema(schema);
  else await env.DB.batch(schema.map(sql=>env.DB.prepare(sql)));
}

export async function ensureTargetedCardTransferV2003(env){
  const existing=completedSummary(await env.DB.prepare('SELECT value FROM app_meta WHERE key=?').bind(TARGETED_CARD_TRANSFER_MARKER_KEY).first());
  if(existing)return existing;

  await ensureUniqueAdvancementFoundation(env);
  await ensureFoundation(env);

  const userRows=resultRows(await env.DB.prepare('SELECT id,nickname FROM users WHERE nickname=? ORDER BY id LIMIT 2').bind(TARGETED_CARD_TRANSFER_NICKNAME).all());
  if(userRows.length!==1)throw new Error(`대상 계정 ${TARGETED_CARD_TRANSFER_NICKNAME}을(를) 정확히 한 개 찾지 못해 이전을 중단했습니다.`);
  const userId=integer(userRows[0].id);

  const [cardsResult,holdingsResult,advancementsResult,ownerResult,pveResult,pvpResult,presetResult]=await env.DB.batch([
    env.DB.prepare(`SELECT c.id,c.title,c.rarity,c.is_active AS isActive,COALESCE(c.card_status,'PUBLIC') AS cardStatus,
      m.name AS memberName,m.is_active AS memberActive,COALESCE(cue.is_active,0) AS uniqueActive,
      COALESCE(cue.attack_percent,0) AS attackPercent,COALESCE(cue.defense_percent,0) AS defensePercent,
      COALESCE(cue.speed_percent,0) AS speedPercent,COALESCE(cue.hp_percent,0) AS hpPercent
      FROM cards_effective_v1210 c JOIN members m ON m.id=c.member_id LEFT JOIN card_unique_effects cue ON cue.card_id=c.id
      WHERE c.id IN (?,?) ORDER BY c.id`).bind(TARGETED_CARD_TRANSFER_SOURCE_CARD_ID,TARGETED_CARD_TRANSFER_TARGET_CARD_ID),
    env.DB.prepare(`SELECT card_id,quantity,COALESCE(breakthrough_level,0) AS breakthrough_level,
      COALESCE(breakthrough_fail_count,0) AS breakthrough_fail_count FROM user_cards
      WHERE user_id=? AND card_id IN (?,?) ORDER BY card_id`).bind(userId,TARGETED_CARD_TRANSFER_SOURCE_CARD_ID,TARGETED_CARD_TRANSFER_TARGET_CARD_ID),
    env.DB.prepare(`SELECT card_id,class_code,dominant_type,config_version,cost_master_stars,modifiers_json,request_id,activated_at,updated_at
      FROM ${ADVANCEMENT_TABLE} WHERE user_id=? AND card_id IN (?,?) ORDER BY card_id`).bind(userId,TARGETED_CARD_TRANSFER_SOURCE_CARD_ID,TARGETED_CARD_TRANSFER_TARGET_CARD_ID),
    env.DB.prepare("SELECT id FROM users WHERE UPPER(role)='OWNER' ORDER BY id LIMIT 1"),
    env.DB.prepare('SELECT user_id,card_ids FROM pve_decks WHERE user_id=? AND card_ids LIKE ?').bind(userId,`%${TARGETED_CARD_TRANSFER_SOURCE_CARD_ID}%`),
    env.DB.prepare('SELECT user_id,card_ids FROM pvp_decks WHERE user_id=? AND card_ids LIKE ?').bind(userId,`%${TARGETED_CARD_TRANSFER_SOURCE_CARD_ID}%`),
    env.DB.prepare('SELECT user_id,preset_no,card_ids FROM pvp_deck_presets WHERE user_id=? AND card_ids LIKE ? ORDER BY preset_no').bind(userId,`%${TARGETED_CARD_TRANSFER_SOURCE_CARD_ID}%`)
  ]);

  const cards=new Map(resultRows(cardsResult).map(row=>[String(row.id),row]));
  const sourceCard=cards.get(TARGETED_CARD_TRANSFER_SOURCE_CARD_ID),targetCard=cards.get(TARGETED_CARD_TRANSFER_TARGET_CARD_ID);
  validateCard(sourceCard,{cardId:TARGETED_CARD_TRANSFER_SOURCE_CARD_ID,member:SOURCE_MEMBER});
  validateCard(targetCard,{cardId:TARGETED_CARD_TRANSFER_TARGET_CARD_ID,member:TARGET_MEMBER});

  const holdings=new Map(resultRows(holdingsResult).map(row=>[String(row.card_id),row]));
  const sourceHolding=holdings.get(TARGETED_CARD_TRANSFER_SOURCE_CARD_ID);
  const targetHolding=holdings.get(TARGETED_CARD_TRANSFER_TARGET_CARD_ID)||null;
  const sourceQuantity=integer(sourceHolding?.quantity),sourceLevel=integer(sourceHolding?.breakthrough_level),sourceFailCount=integer(sourceHolding?.breakthrough_fail_count);
  const targetQuantity=integer(targetHolding?.quantity),targetLevel=integer(targetHolding?.breakthrough_level),targetFailCount=integer(targetHolding?.breakthrough_fail_count);
  if(sourceQuantity<1)throw new Error(`${TARGETED_CARD_TRANSFER_NICKNAME} 계정에 이전할 킴성태 카드가 없습니다.`);
  if(sourceLevel<REQUIRED_LEVEL)throw new Error(`${TARGETED_CARD_TRANSFER_NICKNAME} 계정의 킴성태 카드가 +13이 아니어서 이전을 중단했습니다.`);

  const advancements=new Map(resultRows(advancementsResult).map(row=>[String(row.card_id),row]));
  const sourceAdvancement=advancements.get(TARGETED_CARD_TRANSFER_SOURCE_CARD_ID);
  const targetAdvancement=advancements.get(TARGETED_CARD_TRANSFER_TARGET_CARD_ID)||null;
  if(!sourceAdvancement||String(sourceAdvancement.class_code).toUpperCase()!==REQUIRED_CLASS||String(sourceAdvancement.dominant_type).toUpperCase()!==REQUIRED_DOMINANT){
    throw new Error(`${TARGETED_CARD_TRANSFER_NICKNAME} 계정의 킴성태 공격형 전직을 확인하지 못해 이전을 중단했습니다.`);
  }
  if(targetAdvancement&&(String(targetAdvancement.class_code).toUpperCase()!==REQUIRED_CLASS||String(targetAdvancement.dominant_type).toUpperCase()!==REQUIRED_DOMINANT)){
    throw new Error(`${TARGETED_CARD_TRANSFER_NICKNAME} 계정의 남순 카드에 다른 계열 전직이 있어 이전을 중단했습니다.`);
  }
  const ownerId=integer(resultRows(ownerResult)[0]?.id);
  if(!ownerId)throw new Error('카드 이전 감사 로그를 기록할 OWNER 계정을 찾지 못했습니다.');

  const pveRewrites=deckRewrites(resultRows(pveResult)),pvpRewrites=deckRewrites(resultRows(pvpResult)),presetRewrites=deckRewrites(resultRows(presetResult));
  const summary={
    status:'COMPLETED',version:TARGETED_CARD_TRANSFER_VERSION,completedAt:new Date().toISOString(),nickname:TARGETED_CARD_TRANSFER_NICKNAME,userId,
    source:{cardId:TARGETED_CARD_TRANSFER_SOURCE_CARD_ID,title:String(sourceCard.title||''),quantityBefore:sourceQuantity,quantityAfter:sourceQuantity-1,breakthroughBefore:sourceLevel,breakthroughAfter:0},
    target:{cardId:TARGETED_CARD_TRANSFER_TARGET_CARD_ID,title:String(targetCard.title||''),quantityBefore:targetQuantity,quantityAfter:targetQuantity+1,breakthroughBefore:targetLevel,breakthroughAfter:Math.max(REQUIRED_LEVEL,targetLevel)},
    advancement:{classCode:REQUIRED_CLASS,dominantType:REQUIRED_DOMINANT,moved:targetAdvancement?false:true,targetAlreadyAdvanced:Boolean(targetAdvancement)},
    rewrittenDecks:{pve:pveRewrites.length,pvp:pvpRewrites.length,presets:presetRewrites.length}
  };
  const beforeAudit=JSON.stringify({operationKey:TARGETED_CARD_TRANSFER_MARKER_KEY,sourceCardId:TARGETED_CARD_TRANSFER_SOURCE_CARD_ID,quantity:sourceQuantity,breakthroughLevel:sourceLevel,advancementClass:sourceAdvancement.class_code});
  const afterAudit=JSON.stringify({operationKey:TARGETED_CARD_TRANSFER_MARKER_KEY,targetCardId:TARGETED_CARD_TRANSFER_TARGET_CARD_ID,quantity:targetQuantity+1,breakthroughLevel:Math.max(REQUIRED_LEVEL,targetLevel),advancementClass:REQUIRED_CLASS});
  const runningValue=JSON.stringify({status:'RUNNING',version:TARGETED_CARD_TRANSFER_VERSION,nonce:crypto.randomUUID()});
  const completedValue=JSON.stringify(summary);
  const guard='EXISTS(SELECT 1 FROM app_meta WHERE key=? AND value=?)';
  const guarded=(sql,...values)=>env.DB.prepare(sql.replaceAll('{GUARD}',guard)).bind(...values,TARGETED_CARD_TRANSFER_MARKER_KEY,runningValue);
  const targetHoldingGuard=targetHolding
    ?'EXISTS(SELECT 1 FROM user_cards WHERE user_id=? AND card_id=? AND quantity=? AND COALESCE(breakthrough_level,0)=? AND COALESCE(breakthrough_fail_count,0)=?)'
    :'NOT EXISTS(SELECT 1 FROM user_cards WHERE user_id=? AND card_id=?)';
  const targetHoldingGuardValues=targetHolding?[userId,TARGETED_CARD_TRANSFER_TARGET_CARD_ID,targetQuantity,targetLevel,targetFailCount]:[userId,TARGETED_CARD_TRANSFER_TARGET_CARD_ID];
  const targetAdvancementGuard=targetAdvancement
    ?`EXISTS(SELECT 1 FROM ${ADVANCEMENT_TABLE} WHERE user_id=? AND card_id=? AND class_code=? AND dominant_type=? AND request_id=?)`
    :`NOT EXISTS(SELECT 1 FROM ${ADVANCEMENT_TABLE} WHERE user_id=? AND card_id=?)`;
  const targetAdvancementGuardValues=targetAdvancement
    ?[userId,TARGETED_CARD_TRANSFER_TARGET_CARD_ID,String(targetAdvancement.class_code),String(targetAdvancement.dominant_type),String(targetAdvancement.request_id)]
    :[userId,TARGETED_CARD_TRANSFER_TARGET_CARD_ID];
  const preflightDetail=JSON.stringify({sourceQuantity,sourceLevel,targetQuantity,targetLevel,targetAlreadyAdvanced:Boolean(targetAdvancement)});

  const statements=[
    env.DB.prepare('INSERT OR IGNORE INTO app_meta(key,value,updated_at) VALUES(?,?,CURRENT_TIMESTAMP)').bind(TARGETED_CARD_TRANSFER_MARKER_KEY,runningValue),
    guarded(`INSERT INTO ${VERIFICATION_TABLE}(operation_key,verified,detail)
      SELECT ?,CASE WHEN
        EXISTS(SELECT 1 FROM users WHERE id=? AND nickname=?)
        AND EXISTS(SELECT 1 FROM user_cards WHERE user_id=? AND card_id=? AND quantity=? AND COALESCE(breakthrough_level,0)=? AND COALESCE(breakthrough_fail_count,0)=?)
        AND ${targetHoldingGuard}
        AND EXISTS(SELECT 1 FROM ${ADVANCEMENT_TABLE} WHERE user_id=? AND card_id=? AND class_code=? AND dominant_type=? AND request_id=?)
        AND ${targetAdvancementGuard}
        THEN 1 ELSE 0 END,? WHERE {GUARD}`,
      `${TARGETED_CARD_TRANSFER_MARKER_KEY}:preflight`,userId,TARGETED_CARD_TRANSFER_NICKNAME,
      userId,TARGETED_CARD_TRANSFER_SOURCE_CARD_ID,sourceQuantity,sourceLevel,sourceFailCount,
      ...targetHoldingGuardValues,
      userId,TARGETED_CARD_TRANSFER_SOURCE_CARD_ID,String(sourceAdvancement.class_code),String(sourceAdvancement.dominant_type),String(sourceAdvancement.request_id),
      ...targetAdvancementGuardValues,preflightDetail),
    guarded(`INSERT INTO user_cards(user_id,card_id,quantity,breakthrough_level,breakthrough_fail_count,first_obtained_at,last_obtained_at)
      SELECT ?,?,1,?,0,CURRENT_TIMESTAMP,CURRENT_TIMESTAMP WHERE {GUARD}
      ON CONFLICT(user_id,card_id) DO UPDATE SET quantity=user_cards.quantity+1,
        breakthrough_level=CASE WHEN user_cards.breakthrough_level<excluded.breakthrough_level THEN excluded.breakthrough_level ELSE user_cards.breakthrough_level END,
        breakthrough_fail_count=0,last_obtained_at=CURRENT_TIMESTAMP`,userId,TARGETED_CARD_TRANSFER_TARGET_CARD_ID,REQUIRED_LEVEL),
    guarded(`UPDATE ${ADVANCEMENT_TABLE} SET card_id=?,updated_at=CURRENT_TIMESTAMP
      WHERE user_id=? AND card_id=? AND class_code=? AND dominant_type=?
        AND NOT EXISTS(SELECT 1 FROM ${ADVANCEMENT_TABLE} target WHERE target.user_id=? AND target.card_id=?) AND {GUARD}`,
      TARGETED_CARD_TRANSFER_TARGET_CARD_ID,userId,TARGETED_CARD_TRANSFER_SOURCE_CARD_ID,REQUIRED_CLASS,REQUIRED_DOMINANT,userId,TARGETED_CARD_TRANSFER_TARGET_CARD_ID),
    guarded(`DELETE FROM ${ADVANCEMENT_TABLE} WHERE user_id=? AND card_id=? AND class_code=? AND dominant_type=?
      AND EXISTS(SELECT 1 FROM ${ADVANCEMENT_TABLE} target WHERE target.user_id=? AND target.card_id=? AND target.class_code=? AND target.dominant_type=?) AND {GUARD}`,
      userId,TARGETED_CARD_TRANSFER_SOURCE_CARD_ID,REQUIRED_CLASS,REQUIRED_DOMINANT,userId,TARGETED_CARD_TRANSFER_TARGET_CARD_ID,REQUIRED_CLASS,REQUIRED_DOMINANT),
    guarded(`UPDATE user_cards SET quantity=quantity-1,breakthrough_level=0,breakthrough_fail_count=0,last_obtained_at=CURRENT_TIMESTAMP
      WHERE user_id=? AND card_id=? AND quantity=? AND COALESCE(breakthrough_level,0)=? AND COALESCE(breakthrough_fail_count,0)=? AND {GUARD}`,
      userId,TARGETED_CARD_TRANSFER_SOURCE_CARD_ID,sourceQuantity,sourceLevel,sourceFailCount),
    guarded('DELETE FROM user_cards WHERE user_id=? AND card_id=? AND quantity<=0 AND {GUARD}',userId,TARGETED_CARD_TRANSFER_SOURCE_CARD_ID),
    guarded('INSERT INTO admin_logs(admin_id,action_type,target_type,target_id,before_data,after_data) SELECT ?,?,?,CAST(? AS TEXT),?,? WHERE {GUARD}',
      ownerId,ACTION_TYPE,'USER_CARD',userId,beforeAudit,afterAudit)
  ];

  for(const item of pveRewrites)statements.push(guarded('UPDATE pve_decks SET card_ids=?,updated_at=CURRENT_TIMESTAMP WHERE user_id=? AND card_ids=? AND {GUARD}',JSON.stringify(item.after),userId,String(item.row.card_ids)));
  for(const item of pvpRewrites)statements.push(guarded('UPDATE pvp_decks SET card_ids=?,updated_at=CURRENT_TIMESTAMP WHERE user_id=? AND card_ids=? AND {GUARD}',JSON.stringify(item.after),userId,String(item.row.card_ids)));
  for(const item of presetRewrites)statements.push(guarded('UPDATE pvp_deck_presets SET card_ids=?,updated_at=CURRENT_TIMESTAMP WHERE user_id=? AND preset_no=? AND card_ids=? AND {GUARD}',JSON.stringify(item.after),userId,integer(item.row.preset_no),String(item.row.card_ids)));

  const expectedSourceQuantity=sourceQuantity-1;
  const finalSourceCondition=expectedSourceQuantity>0
    ?'EXISTS(SELECT 1 FROM user_cards WHERE user_id=? AND card_id=? AND quantity=? AND COALESCE(breakthrough_level,0)=0 AND COALESCE(breakthrough_fail_count,0)=0)'
    :'NOT EXISTS(SELECT 1 FROM user_cards WHERE user_id=? AND card_id=?)';
  const finalSourceValues=expectedSourceQuantity>0?[userId,TARGETED_CARD_TRANSFER_SOURCE_CARD_ID,expectedSourceQuantity]:[userId,TARGETED_CARD_TRANSFER_SOURCE_CARD_ID];
  statements.push(
    guarded(`INSERT INTO ${VERIFICATION_TABLE}(operation_key,verified,detail)
      SELECT ?,CASE WHEN
        ${finalSourceCondition}
        AND EXISTS(SELECT 1 FROM user_cards WHERE user_id=? AND card_id=? AND quantity=? AND COALESCE(breakthrough_level,0)>=?)
        AND NOT EXISTS(SELECT 1 FROM ${ADVANCEMENT_TABLE} WHERE user_id=? AND card_id=?)
        AND EXISTS(SELECT 1 FROM ${ADVANCEMENT_TABLE} WHERE user_id=? AND card_id=? AND class_code=? AND dominant_type=?)
        AND NOT EXISTS(SELECT 1 FROM pve_decks WHERE user_id=? AND card_ids LIKE ?)
        AND NOT EXISTS(SELECT 1 FROM pvp_decks WHERE user_id=? AND card_ids LIKE ?)
        AND NOT EXISTS(SELECT 1 FROM pvp_deck_presets WHERE user_id=? AND card_ids LIKE ?)
        AND EXISTS(SELECT 1 FROM admin_logs WHERE admin_id=? AND action_type=? AND target_type='USER_CARD' AND target_id=CAST(? AS TEXT) AND after_data=?)
        THEN 1 ELSE 0 END,? WHERE {GUARD}`,
      `${TARGETED_CARD_TRANSFER_MARKER_KEY}:final`,...finalSourceValues,
      userId,TARGETED_CARD_TRANSFER_TARGET_CARD_ID,targetQuantity+1,REQUIRED_LEVEL,
      userId,TARGETED_CARD_TRANSFER_SOURCE_CARD_ID,
      userId,TARGETED_CARD_TRANSFER_TARGET_CARD_ID,REQUIRED_CLASS,REQUIRED_DOMINANT,
      userId,`%${TARGETED_CARD_TRANSFER_SOURCE_CARD_ID}%`,userId,`%${TARGETED_CARD_TRANSFER_SOURCE_CARD_ID}%`,userId,`%${TARGETED_CARD_TRANSFER_SOURCE_CARD_ID}%`,
      ownerId,ACTION_TYPE,userId,afterAudit,completedValue),
    guarded(`UPDATE app_meta SET value=?,updated_at=CURRENT_TIMESTAMP WHERE key=? AND value=?
      AND EXISTS(SELECT 1 FROM ${VERIFICATION_TABLE} WHERE operation_key=? AND verified=1) AND {GUARD}`,
      completedValue,TARGETED_CARD_TRANSFER_MARKER_KEY,runningValue,`${TARGETED_CARD_TRANSFER_MARKER_KEY}:final`)
  );

  const results=await env.DB.batch(statements);
  if(Number(results[0]?.meta?.changes||0)===0){
    const replay=completedSummary(await env.DB.prepare('SELECT value FROM app_meta WHERE key=?').bind(TARGETED_CARD_TRANSFER_MARKER_KEY).first());
    if(replay)return replay;
    throw new Error('동일 카드 이전 작업이 완료되지 않은 상태입니다.');
  }
  const stored=completedSummary(await env.DB.prepare('SELECT value FROM app_meta WHERE key=?').bind(TARGETED_CARD_TRANSFER_MARKER_KEY).first(),{replayed:false});
  if(!stored)throw new Error('카드 이전은 실행됐지만 최종 검증 마커가 확인되지 않았습니다.');
  console.log('TARGETED_CARD_TRANSFER_V2003',JSON.stringify(stored));
  return stored;
}
