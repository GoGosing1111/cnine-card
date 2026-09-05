/* PROJECT V UNIQUE ADVANCEMENT V1937
 *
 * The database remains the authority for ownership, grade, breakthrough level,
 * active unique stats, success roll and MASTER_STAR balance; clients only submit
 * cardId + requestId + expectedPassUse (confirmation only, never authority).
 */

export const UNIQUE_ADVANCEMENT_SETTINGS_KEY='card_unique_advancement_settings_v1937_release';
export const UNIQUE_ADVANCEMENT_COST=3000;
export const UNIQUE_ADVANCEMENT_SUCCESS_CHANCE_PERCENT=10;
export const UNIQUE_ADVANCEMENT_PASS_CODE='UNIQUE_ADVANCEMENT_PASS';
export const UNIQUE_ADVANCEMENT_PASS_NAME='전직 패스권';
export const UNIQUE_ADVANCEMENT_MIN_BREAKTHROUGH=13;
export const UNIQUE_ADVANCEMENT_ALLOWED_GRADES=Object.freeze(['FUR','ZENITH','SUPERSTAR']);
export const UNIQUE_ADVANCEMENT_STAT_ORDER=Object.freeze(['ATTACK','DEFENSE','SPEED','HP']);

const FEATURE_MODES=Object.freeze(['OFF','TEST','ON']);
const FOUNDATION_KEY='safe_runtime_upgrade_v1937_card_unique_advancement_tx_guard';
const ADVANCEMENT_TABLE='card_unique_advancements_v1937';
const RECEIPT_TABLE='card_unique_advancement_receipts_v1937';
const GUARD_TABLE='card_unique_advancement_tx_guards_v1937';

// Catalog only: no player grant, shop listing or reward-pool change.
export async function ensureUniqueAdvancementPassCatalog(env){
  await env.DB.prepare(`INSERT INTO inventory_items(code,name,subtitle,description,category,rarity,image_url,sort_order,is_active)
    VALUES(?,?,?,?,?,?,?,?,1) ON CONFLICT(code) DO NOTHING`)
    .bind(UNIQUE_ADVANCEMENT_PASS_CODE,UNIQUE_ADVANCEMENT_PASS_NAME,'ADVANCEMENT PASS',
      '보유 시 카드 상세 > 고유효과 전직에서 1개가 자동 소모되어 100% 성공합니다. FUR·ZENITH·SUPERSTAR 13강 이상 및 활성 고유효과가 필요하며, 마스터의 별 3,000개는 별도로 소모됩니다.',
      'ADVANCEMENT','SPECIAL','assets/items/unique-advancement-pass-v2043.svg',127).run();
}

function passPayload(quantity,{used=false}={}){
  return {itemCode:UNIQUE_ADVANCEMENT_PASS_CODE,name:UNIQUE_ADVANCEMENT_PASS_NAME,quantity:Math.max(0,Math.floor(finite(quantity,0))),spent:used?1:0};
}

const ZERO_MODIFIERS=Object.freeze({
  criticalChancePoints:0,
  penetrationPoints:0,
  openingGaugePoints:0,
  dodgeChancePoints:0,
  dodgeCapPoints:0,
  counterChancePoints:0,
  counterMultiplierPoints:0,
  unshieldedCounterChancePoints:0,
  maxHpPercent:0,
  damageCapPoints:0,
  damageDealtPercent:0,
  lastStandHealPoolPercent:0,
  sealedLastStandHealPoolPercent:0,
  healPoolBonusPercent:0
});

// Balance values live in this one server-owned contract. The V1937 harness may
// tune these numbers without changing API, persistence or engine integration.
export const UNIQUE_ADVANCEMENT_CLASS_DEFINITIONS=Object.freeze({
  SHATTER:Object.freeze({
    classCode:'SHATTER',dominantType:'ATTACK',name:'파쇄자',subtitle:'BREACHER',
    description:'PVP 시작 행동 게이지 +10, 치명타 확률 +15%p, 관통 +35%p, 공격 피해 상한 +20%p, 직접 피해 +13%가 적용됩니다.',
    modifiers:Object.freeze({...ZERO_MODIFIERS,openingGaugePoints:10,criticalChancePoints:15,penetrationPoints:35,damageCapPoints:20,damageDealtPercent:13})
  }),
  RIPOSTE:Object.freeze({
    classCode:'RIPOSTE',dominantType:'DEFENSE',name:'반격자',subtitle:'RIPOSTE',
    description:'반격 확률 +11%p, 반격 배율 +13%p, 방벽이 없을 때 반격 확률 +5%p, 가하는 피해 +2%가 적용됩니다.',
    modifiers:Object.freeze({...ZERO_MODIFIERS,counterChancePoints:11,counterMultiplierPoints:13,unshieldedCounterChancePoints:5,damageDealtPercent:2})
  }),
  AFTERIMAGE:Object.freeze({
    classCode:'AFTERIMAGE',dominantType:'SPEED',name:'잔영자',subtitle:'AFTERIMAGE',
    description:'회피 확률 +10%p, 회피 상한 +10%p, 관통 +18%p가 적용되고 최대 생명력은 3% 감소합니다.',
    modifiers:Object.freeze({...ZERO_MODIFIERS,penetrationPoints:18,dodgeChancePoints:10,dodgeCapPoints:10,maxHpPercent:-3})
  }),
  IMMORTAL:Object.freeze({
    classCode:'IMMORTAL',dominantType:'HP',name:'불멸자',subtitle:'IMMORTAL',
    description:'최대 생명력 +27%, 아군 회복 풀 +35%가 적용되며 회복 풀 35%를 쓰는 최후 생존 판정을 얻습니다. 공격형 봉인 시에도 회복 풀 25%로 축소 생존합니다.',
    modifiers:Object.freeze({...ZERO_MODIFIERS,maxHpPercent:27,lastStandHealPoolPercent:35,sealedLastStandHealPoolPercent:25,healPoolBonusPercent:35})
  })
});

const CLASS_BY_DOMINANT=Object.freeze(Object.fromEntries(
  Object.values(UNIQUE_ADVANCEMENT_CLASS_DEFINITIONS).map(definition=>[definition.dominantType,definition.classCode])
));

function finite(value,fallback=0){const number=Number(value);return Number.isFinite(number)?number:fallback}
function nonNegative(value){return Math.max(0,finite(value,0))}
function rows(result){return result?.results||[]}
function first(result){return rows(result)[0]||null}
function safeJson(value,fallback=null){try{const parsed=typeof value==='string'?JSON.parse(value):value;return parsed&&typeof parsed==='object'?parsed:fallback}catch{return fallback}}
function normalizedGrade(value){return String(value||'').trim().toUpperCase()}
function validRequestId(value){return /^[A-Za-z0-9:_-]{12,120}$/.test(String(value||'').trim())}

export function rollUniqueAdvancement(randomUint32){
  let value=Number(randomUint32);
  if(!Number.isInteger(value)||value<0||value>0xffffffff){
    const values=new Uint32Array(1);
    crypto.getRandomValues(values);
    value=values[0];
  }
  const roll=value/0x100000000;
  return {success:roll<UNIQUE_ADVANCEMENT_SUCCESS_CHANCE_PERCENT/100,roll};
}

export function normalizeUniqueAdvancementModifiers(raw={}){
  const value=raw&&typeof raw==='object'?raw:{};
  return Object.fromEntries(Object.keys(ZERO_MODIFIERS).map(key=>[key,finite(value[key],0)]));
}

function publicClassDefinition(definition){
  if(!definition)return null;
  return {
    classCode:definition.classCode,
    dominantType:definition.dominantType,
    name:definition.name,
    subtitle:definition.subtitle,
    description:definition.description,
    modifiers:normalizeUniqueAdvancementModifiers(definition.modifiers)
  };
}

export function uniqueAdvancementDefinitions(){
  return Object.values(UNIQUE_ADVANCEMENT_CLASS_DEFINITIONS).map(publicClassDefinition);
}

export function resolveDominantUniqueStat(source={}){
  const stats={
    ATTACK:nonNegative(source.attackPercent??source.attack_percent??source.ATTACK),
    DEFENSE:nonNegative(source.defensePercent??source.defense_percent??source.DEFENSE),
    SPEED:nonNegative(source.speedPercent??source.speed_percent??source.SPEED),
    HP:nonNegative(source.hpPercent??source.hp_percent??source.HP)
  };
  let dominantType=UNIQUE_ADVANCEMENT_STAT_ORDER[0],highest=-1;
  for(const type of UNIQUE_ADVANCEMENT_STAT_ORDER){
    if(stats[type]>highest){dominantType=type;highest=stats[type]}
  }
  return {dominantType,highest,stats,classCode:CLASS_BY_DOMINANT[dominantType]||''};
}

export function normalizeUniqueAdvancementSettings(raw={}){
  const mode=String(raw?.mode||'ON').trim().toUpperCase();
  return {
    mode:FEATURE_MODES.includes(mode)?mode:'OFF',
    version:Math.max(1,Math.floor(finite(raw?.version,1))),
    costMasterStars:UNIQUE_ADVANCEMENT_COST,
    successChancePercent:UNIQUE_ADVANCEMENT_SUCCESS_CHANCE_PERCENT,
    minimumBreakthrough:UNIQUE_ADVANCEMENT_MIN_BREAKTHROUGH,
    allowedGrades:[...UNIQUE_ADVANCEMENT_ALLOWED_GRADES]
  };
}

function featureMode(env,settings){
  const override=String(env?.UNIQUE_ADVANCEMENT_MODE||'').trim().toUpperCase();
  return FEATURE_MODES.includes(override)?override:settings.mode;
}

function featureAccess(mode,user){
  const role=normalizedGrade(user?.role);
  if(mode==='ON')return {enabled:true,testAccess:false};
  if(mode==='TEST'&&role==='OWNER')return {enabled:true,testAccess:true};
  return {enabled:false,testAccess:false};
}

export function evaluateUniqueAdvancementEligibility({card,masterStars=0,existing=null,featureEnabled=true}={}){
  const grade=normalizedGrade(card?.rarity??card?.grade),level=Math.max(0,Math.floor(finite(card?.breakthrough_level??card?.breakthroughLevel,0)));
  const activeUnique=Number(card?.unique_is_active??card?.uniqueIsActive??0)===1||Boolean(card?.unique_card_id??card?.uniqueCardId);
  const dominant=resolveDominantUniqueStat(card||{});
  const checks={
    featureEnabled:Boolean(featureEnabled),
    owned:Boolean(card)&&Math.max(0,Math.floor(finite(card?.quantity,0)))>0,
    grade:UNIQUE_ADVANCEMENT_ALLOWED_GRADES.includes(grade),
    breakthrough:level>=UNIQUE_ADVANCEMENT_MIN_BREAKTHROUGH,
    activeUnique,
    positiveUnique:dominant.highest>0,
    masterStars:Math.max(0,Math.floor(finite(masterStars,0)))>=UNIQUE_ADVANCEMENT_COST,
    notAdvanced:!existing
  };
  const failures=[
    ['featureEnabled','FEATURE_DISABLED','고유특성 전직은 현재 준비 중입니다.'],
    ['owned','CARD_NOT_OWNED','보유한 카드만 전직할 수 있습니다.'],
    ['grade','GRADE_NOT_ELIGIBLE','FUR, ZENITH 또는 SUPERSTAR 등급 카드만 전직할 수 있습니다.'],
    ['breakthrough','BREAKTHROUGH_REQUIRED','13강 이상 카드만 전직할 수 있습니다.'],
    ['activeUnique','ACTIVE_UNIQUE_REQUIRED','활성화된 고유효과가 있는 카드만 전직할 수 있습니다.'],
    ['positiveUnique','UNIQUE_STAT_REQUIRED','전직 기준이 될 고유 스탯을 찾을 수 없습니다.'],
    ['notAdvanced','ALREADY_ADVANCED','이미 전직을 완료한 카드입니다.'],
    ['masterStars','MASTER_STAR_SHORTAGE',`마스터의 별 ${UNIQUE_ADVANCEMENT_COST.toLocaleString('ko-KR')}개가 필요합니다.`]
  ];
  const failed=failures.find(([key])=>!checks[key]);
  return {
    eligible:!failed,
    code:failed?.[1]||'ELIGIBLE',
    reason:failed?.[2]||'전직 조건을 충족했습니다.',
    checks,
    grade,
    breakthroughLevel:level,
    dominant,
    recommendedClass:dominant.highest>0?publicClassDefinition(UNIQUE_ADVANCEMENT_CLASS_DEFINITIONS[dominant.classCode]):null
  };
}

function schemaStatements(env){
  const postgres=env.DB?.dialect==='postgres';
  const userIdType=postgres?'BIGINT':'INTEGER';
  const nowDefault=postgres?"to_char(timezone('UTC',CURRENT_TIMESTAMP),'YYYY-MM-DD HH24:MI:SS')":'CURRENT_TIMESTAMP';
  return [
    `CREATE TABLE IF NOT EXISTS ${ADVANCEMENT_TABLE}(
      user_id ${userIdType} NOT NULL,card_id TEXT NOT NULL,class_code TEXT NOT NULL,dominant_type TEXT NOT NULL,
      config_version INTEGER NOT NULL DEFAULT 1,cost_master_stars INTEGER NOT NULL DEFAULT ${UNIQUE_ADVANCEMENT_COST},
      modifiers_json TEXT NOT NULL DEFAULT '{}',request_id TEXT NOT NULL,activated_at TEXT NOT NULL DEFAULT ${nowDefault},updated_at TEXT NOT NULL DEFAULT ${nowDefault},
      PRIMARY KEY(user_id,card_id),UNIQUE(user_id,request_id))`,
    `CREATE TABLE IF NOT EXISTS ${RECEIPT_TABLE}(
      request_id TEXT NOT NULL,user_id ${userIdType} NOT NULL,card_id TEXT NOT NULL,status TEXT NOT NULL DEFAULT 'PENDING',
      response_json TEXT,error_message TEXT,created_at TEXT NOT NULL DEFAULT ${nowDefault},updated_at TEXT NOT NULL DEFAULT ${nowDefault},
      PRIMARY KEY(request_id,user_id))`,
    `CREATE TABLE IF NOT EXISTS ${GUARD_TABLE}(
      guard_id TEXT NOT NULL PRIMARY KEY,ok INTEGER NOT NULL CHECK(ok=1),created_at TEXT NOT NULL DEFAULT ${nowDefault})`,
    `CREATE INDEX IF NOT EXISTS idx_unique_advancement_user_v1937 ON ${ADVANCEMENT_TABLE}(user_id,activated_at,card_id)`,
    `CREATE INDEX IF NOT EXISTS idx_unique_advancement_receipt_cleanup_v1937 ON ${RECEIPT_TABLE}(status,updated_at,request_id)`
  ];
}

let foundationPromise=null;
export async function ensureUniqueAdvancementFoundation(env){
  if(foundationPromise)return foundationPromise;
  foundationPromise=(async()=>{
    const marker=await env.DB.prepare('SELECT value FROM app_meta WHERE key=?').bind(FOUNDATION_KEY).first();
    if(marker?.value==='1')return true;
    const schema=schemaStatements(env);
    if(env.DB?.dialect==='postgres'&&typeof env.DB.execSchema==='function')await env.DB.execSchema(schema);
    else await env.DB.batch(schema.map(sql=>env.DB.prepare(sql)));
    await env.DB.batch([
      env.DB.prepare('INSERT INTO app_meta(key,value,updated_at) VALUES(?,?,CURRENT_TIMESTAMP) ON CONFLICT(key) DO NOTHING')
        .bind(UNIQUE_ADVANCEMENT_SETTINGS_KEY,JSON.stringify(normalizeUniqueAdvancementSettings())),
      env.DB.prepare('INSERT INTO app_meta(key,value,updated_at) VALUES(?,?,CURRENT_TIMESTAMP) ON CONFLICT(key) DO UPDATE SET value=excluded.value,updated_at=CURRENT_TIMESTAMP')
        .bind(FOUNDATION_KEY,'1')
    ]);
    return true;
  })().catch(error=>{foundationPromise=null;throw error});
  return foundationPromise;
}

let uniqueAdvancementSettingsCache={key:'',at:0,value:null};
export async function uniqueAdvancementSettings(env,{fresh=false,ensure=true}={}){
  const now=Date.now();
  const override=String(env?.UNIQUE_ADVANCEMENT_MODE||'').trim().toUpperCase();
  const cacheKey=`${env?.DB?.dialect||'d1'}:${FEATURE_MODES.includes(override)?override:'STORED'}`;
  if(!fresh&&uniqueAdvancementSettingsCache.key===cacheKey&&uniqueAdvancementSettingsCache.value&&now-uniqueAdvancementSettingsCache.at<5000)return uniqueAdvancementSettingsCache.value;
  // 전투 hot path는 ensure:false로 읽기만 한다. 운영 중 전투마다 런타임
  // DDL/marker write가 발생하지 않도록 foundation 생성은 상태/실행 API가 맡는다.
  if(ensure)await ensureUniqueAdvancementFoundation(env);
  const row=await env.DB.prepare('SELECT value FROM app_meta WHERE key=?').bind(UNIQUE_ADVANCEMENT_SETTINGS_KEY).first();
  const settings=normalizeUniqueAdvancementSettings(safeJson(row?.value,{}));
  const value={...settings,mode:featureMode(env,settings)};
  uniqueAdvancementSettingsCache={key:cacheKey,at:now,value};
  return value;
}

function advancementFromRow(row){
  if(!row)return null;
  const classCode=normalizedGrade(row.class_code??row.classCode),definition=UNIQUE_ADVANCEMENT_CLASS_DEFINITIONS[classCode];
  if(!definition)return null;
  // DB 행은 소유권·전직 계열·감사 스냅샷의 권위이고, 실제 전투 계수는 현재
  // 서버 계약이 권위다. 그래야 밸런스 패치가 기존 전직 보유 카드에도 즉시
  // 동일하게 적용되고 과거 modifiers_json 때문에 유저별 계수가 갈리지 않는다.
  return {
    active:true,
    classCode,
    dominantType:normalizedGrade(row.dominant_type??row.dominantType)||definition.dominantType,
    configVersion:Math.max(1,Math.floor(finite(row.config_version??row.configVersion,1))),
    modifiers:normalizeUniqueAdvancementModifiers(definition.modifiers),
    activatedAt:String((row.activated_at??row.activatedAt)||'')||null
  };
}

export async function loadUniqueAdvancementsForCards(env,userId,cardIds=[]){
  const ids=[...new Set((Array.isArray(cardIds)?cardIds:[]).map(value=>String(value||'').trim()).filter(Boolean))];
  const output=new Map();
  if(!ids.length)return output;
  await ensureUniqueAdvancementFoundation(env);
  const marks=ids.map(()=>'?').join(',');
  const result=await env.DB.prepare(`SELECT card_id,class_code,dominant_type,config_version,modifiers_json,activated_at
    FROM ${ADVANCEMENT_TABLE} WHERE user_id=? AND card_id IN (${marks})`).bind(userId,...ids).all();
  for(const row of rows(result)){
    const advancement=advancementFromRow(row);
    if(advancement)output.set(String(row.card_id),advancement);
  }
  return output;
}

async function stateRows(env,userId,cardId){
  const results=await env.DB.batch([
    env.DB.prepare(`SELECT uc.card_id,COALESCE(uc.quantity,0) AS quantity,COALESCE(uc.breakthrough_level,0) AS breakthrough_level,
      c.rarity,c.title,cue.card_id AS unique_card_id,COALESCE(cue.is_active,0) AS unique_is_active,
      COALESCE(cue.attack_percent,0) AS attack_percent,COALESCE(cue.defense_percent,0) AS defense_percent,
      COALESCE(cue.speed_percent,0) AS speed_percent,COALESCE(cue.hp_percent,0) AS hp_percent
      FROM user_cards uc JOIN cards_effective_v1210 c ON c.id=uc.card_id
      LEFT JOIN card_unique_effects cue ON cue.card_id=uc.card_id AND cue.is_active=1
      WHERE uc.user_id=? AND uc.card_id=? AND COALESCE(uc.quantity,0)>0 LIMIT 1`).bind(userId,cardId),
    env.DB.prepare("SELECT quantity FROM cnine_user_inventory WHERE user_id=? AND item_code='MASTER_STAR'").bind(userId),
    env.DB.prepare(`SELECT card_id,class_code,dominant_type,config_version,modifiers_json,request_id,activated_at FROM ${ADVANCEMENT_TABLE} WHERE user_id=? AND card_id=?`).bind(userId,cardId),
    env.DB.prepare('SELECT quantity FROM cnine_user_inventory WHERE user_id=? AND item_code=?').bind(userId,UNIQUE_ADVANCEMENT_PASS_CODE)
  ]);
  return {card:first(results[0]),masterStars:Math.max(0,Math.floor(finite(first(results[1])?.quantity,0))),row:first(results[2]),passQuantity:Math.max(0,Math.floor(finite(first(results[3])?.quantity,0)))};
}

function responsePayload({requestId='',card,masterStars,passQuantity=0,passUsed=false,advancement,attemptedClass=null,settings,replayed=false}){
  const definition=UNIQUE_ADVANCEMENT_CLASS_DEFINITIONS[advancement?.classCode]||attemptedClass;
  return {
    ok:true,
    requestId:String(requestId||''),
    replayed:Boolean(replayed),
    success:Boolean(advancement),
    outcome:advancement?'ADVANCED':'FAILED',
    cardId:String(card?.card_id||''),
    cardTitle:String(card?.title||''),
    grade:normalizedGrade(card?.rarity),
    breakthroughLevel:Math.max(0,Math.floor(finite(card?.breakthrough_level,0))),
    material:{itemCode:'MASTER_STAR',spent:UNIQUE_ADVANCEMENT_COST,balanceAfter:Math.max(0,Math.floor(finite(masterStars,0)))},
    advancementPass:passPayload(passQuantity,{used:passUsed}),
    effectiveSuccessChancePercent:passUsed?100:UNIQUE_ADVANCEMENT_SUCCESS_CHANCE_PERCENT,
    recommendedType:advancement?.dominantType||definition?.dominantType||null,
    recommendedClass:publicClassDefinition(definition),
    uniqueAdvancement:advancement,
    config:{version:settings.version,costMasterStars:UNIQUE_ADVANCEMENT_COST,successChancePercent:UNIQUE_ADVANCEMENT_SUCCESS_CHANCE_PERCENT,minimumBreakthrough:UNIQUE_ADVANCEMENT_MIN_BREAKTHROUGH,allowedGrades:[...UNIQUE_ADVANCEMENT_ALLOWED_GRADES]}
  };
}

function statusPayload({card,masterStars,passQuantity=0,row,settings,user}){
  const access=featureAccess(settings.mode,user),advancement=advancementFromRow(row);
  const eligibility=evaluateUniqueAdvancementEligibility({card,masterStars,existing:advancement,featureEnabled:access.enabled});
  const currentDefinition=advancement?UNIQUE_ADVANCEMENT_CLASS_DEFINITIONS[advancement.classCode]:null;
  const displayType=advancement?.dominantType||(eligibility.dominant.highest>0?eligibility.dominant.dominantType:null);
  const displayClass=currentDefinition?publicClassDefinition(currentDefinition):eligibility.recommendedClass;
  return {
    ok:true,
    feature:{mode:settings.mode,enabledForUser:access.enabled,testAccess:access.testAccess,ready:true},
    config:{version:settings.version,costMasterStars:UNIQUE_ADVANCEMENT_COST,successChancePercent:UNIQUE_ADVANCEMENT_SUCCESS_CHANCE_PERCENT,minimumBreakthrough:UNIQUE_ADVANCEMENT_MIN_BREAKTHROUGH,allowedGrades:[...UNIQUE_ADVANCEMENT_ALLOWED_GRADES],classes:uniqueAdvancementDefinitions()},
    card:{id:String(card.card_id),title:String(card.title||''),grade:eligibility.grade,breakthroughLevel:eligibility.breakthroughLevel,uniqueStats:eligibility.dominant.stats},
    // 완료 뒤 CMS 고유 스탯이 바뀌더라도 저장된 전직이 표시 권위다.
    recommendedType:displayType,
    recommendedClass:displayClass,
    masterStars,
    advancementPass:passPayload(passQuantity),
    effectiveSuccessChancePercent:passQuantity>0?100:UNIQUE_ADVANCEMENT_SUCCESS_CHANCE_PERCENT,
    uniqueAdvancement:advancement,
    eligibility,
    canAdvance:eligibility.eligible
  };
}

async function markReceiptFailed(env,requestId,userId,message){
  await env.DB.prepare(`UPDATE ${RECEIPT_TABLE} SET status='FAILED',response_json=NULL,error_message=?,updated_at=CURRENT_TIMESTAMP WHERE request_id=? AND user_id=? AND status='PENDING'`)
    .bind(String(message||'FAILED').slice(0,500),requestId,userId).run();
}

async function executeAdvancement({env,user,cardId,requestId,settings,randomUint32,expectedPassUse}){
  await env.DB.prepare(`INSERT INTO ${RECEIPT_TABLE}(request_id,user_id,card_id,status) VALUES(?,?,?,'PENDING') ON CONFLICT(request_id,user_id) DO NOTHING`)
    .bind(requestId,user.id,cardId).run();
  let receipt=await env.DB.prepare(`SELECT card_id,status,response_json,error_message FROM ${RECEIPT_TABLE} WHERE request_id=? AND user_id=?`).bind(requestId,user.id).first();
  if(!receipt)throw new Error('전직 요청 영수증을 생성하지 못했습니다.');
  if(String(receipt.card_id)!==cardId)return {error:'같은 요청 번호가 다른 카드에 사용되었습니다.',code:'REQUEST_ID_CARD_MISMATCH',status:409};
  if(receipt.status==='COMPLETED'&&receipt.response_json){
    const replay=safeJson(receipt.response_json,null);
    if(replay)return {response:{...replay,replayed:true}};
  }
  if(receipt.status==='FAILED'){
    await env.DB.prepare(`UPDATE ${RECEIPT_TABLE} SET status='PENDING',response_json=NULL,error_message=NULL,updated_at=CURRENT_TIMESTAMP WHERE request_id=? AND user_id=? AND card_id=? AND status='FAILED'`)
      .bind(requestId,user.id,cardId).run();
    receipt={...receipt,status:'PENDING',response_json:null,error_message:null};
  }
  if(receipt.status!=='PENDING')return {error:'동일한 전직 요청을 처리 중입니다.',code:'ADVANCEMENT_REQUEST_IN_PROGRESS',status:409,retryable:true};

  const state=await stateRows(env,user.id,cardId),existing=advancementFromRow(state.row);
  if(existing){
    if(String(state.row?.request_id||'')===requestId){
      const passLog=await env.DB.prepare("SELECT balance_after FROM inventory_logs WHERE user_id=? AND item_code=? AND reference_type='UNIQUE_ADVANCEMENT_PASS' AND reference_id=? AND change_amount=-1")
        .bind(user.id,UNIQUE_ADVANCEMENT_PASS_CODE,`${cardId}:${requestId}`).first();
      const recovered=responsePayload({requestId,card:state.card||{card_id:cardId},masterStars:state.masterStars,passQuantity:passLog?Number(passLog.balance_after):state.passQuantity,passUsed:Boolean(passLog),advancement:existing,settings,replayed:true});
      await env.DB.prepare(`UPDATE ${RECEIPT_TABLE} SET status='COMPLETED',response_json=?,error_message=NULL,updated_at=CURRENT_TIMESTAMP WHERE request_id=? AND user_id=? AND status='PENDING'`)
        .bind(JSON.stringify(recovered),requestId,user.id).run();
      return {response:recovered};
    }
    await markReceiptFailed(env,requestId,user.id,'ALREADY_ADVANCED');
    return {error:'이미 전직을 완료한 카드입니다.',code:'ALREADY_ADVANCED',status:409};
  }
  if(!state.card){
    await markReceiptFailed(env,requestId,user.id,'CARD_NOT_OWNED');
    return {error:'보유한 카드를 찾을 수 없습니다.',code:'CARD_NOT_OWNED',status:404};
  }
  const eligibility=evaluateUniqueAdvancementEligibility({card:state.card,masterStars:state.masterStars,existing:null,featureEnabled:true});
  if(!eligibility.eligible){
    await markReceiptFailed(env,requestId,user.id,eligibility.code);
    return {error:eligibility.reason,code:eligibility.code,status:eligibility.code==='MASTER_STAR_SHORTAGE'?400:409,eligibility};
  }

  const passUsed=state.passQuantity>0;
  // Old clients must refresh before spending a newly introduced pass. A missing
  // pass must never silently turn the confirmed 100% attempt into a 10% roll.
  if((passUsed&&expectedPassUse===undefined)||(expectedPassUse!==undefined&&expectedPassUse!==passUsed)){
    await markReceiptFailed(env,requestId,user.id,'ADVANCEMENT_PASS_STATE_CHANGED');
    return {error:'전직 패스권 보유 상태를 다시 확인해 주세요. 재료는 소모되지 않았습니다.',code:'ADVANCEMENT_PASS_STATE_CHANGED',status:409};
  }
  const definition=UNIQUE_ADVANCEMENT_CLASS_DEFINITIONS[eligibility.dominant.classCode];
  const successful=passUsed||rollUniqueAdvancement(randomUint32).success;
  const advancement=successful?{active:true,classCode:definition.classCode,dominantType:definition.dominantType,configVersion:settings.version,modifiers:normalizeUniqueAdvancementModifiers(definition.modifiers),activatedAt:new Date().toISOString()}:null;
  const starBefore=state.masterStars,starAfter=starBefore-UNIQUE_ADVANCEMENT_COST;
  const passBefore=state.passQuantity,passAfter=passBefore-(passUsed?1:0);
  const response=responsePayload({requestId,card:state.card,masterStars:starAfter,passQuantity:passAfter,passUsed,advancement,attemptedClass:definition,settings});
  const stats=eligibility.dominant.stats;
  const referenceId=`${cardId}:${requestId}`;
  const guardPrefix=`${user.id}:${requestId}`;
  const guardPre=`${guardPrefix}:pre`,guardState=`${guardPrefix}:state`,guardFinal=`${guardPrefix}:final`;
  const advancementStateCondition=successful
    ?`EXISTS(SELECT 1 FROM ${ADVANCEMENT_TABLE} WHERE user_id=? AND card_id=? AND request_id=?)`
    :`NOT EXISTS(SELECT 1 FROM ${ADVANCEMENT_TABLE} WHERE user_id=? AND card_id=?)`;
  const advancementStateBindings=successful?[user.id,cardId,requestId]:[user.id,cardId];
  const statements=[];
  // PostgreSQL READ COMMITTED에서는 같은 잔액을 읽은 두 요청이 UPDATE에서
  // 경합할 수 있다. 첫 statement에서 재화 행을 잠가 두 번째 요청이 stale
  // starBefore를 자기 차감으로 오인하지 못하게 한다. D1 batch는 단일 writer
  // 트랜잭션이므로 별도 FOR UPDATE가 필요하지 않다.
  if(env.DB?.dialect==='postgres')statements.push(
    env.DB.prepare("SELECT quantity FROM cnine_user_inventory WHERE user_id=? AND item_code IN ('MASTER_STAR',?) ORDER BY item_code FOR UPDATE").bind(user.id,UNIQUE_ADVANCEMENT_PASS_CODE)
  );
  statements.push(
    // D1 batch와 PostgreSQL adapter batch는 statement 오류 시 전체 rollback한다.
    // CHECK(ok=1) guard로 조건부 0행을 오류로 승격해 차감·전직·영수증·로그를
    // 반드시 한 트랜잭션으로 확정한다. commit 뒤 보상 트랜잭션은 사용하지 않는다.
    env.DB.prepare(`INSERT INTO ${GUARD_TABLE}(guard_id,ok)
      SELECT ?,CASE WHEN
        EXISTS(SELECT 1 FROM cnine_user_inventory WHERE user_id=? AND item_code='MASTER_STAR' AND quantity=? AND quantity>=?)
        AND COALESCE((SELECT quantity FROM cnine_user_inventory WHERE user_id=? AND item_code=?),0)=?
        AND EXISTS(SELECT 1 FROM ${RECEIPT_TABLE} WHERE request_id=? AND user_id=? AND card_id=? AND status='PENDING')
        AND NOT EXISTS(SELECT 1 FROM ${ADVANCEMENT_TABLE} WHERE user_id=? AND card_id=?)
        AND NOT EXISTS(SELECT 1 FROM inventory_logs WHERE user_id=? AND reference_type='UNIQUE_ADVANCEMENT' AND reference_id=?)
        AND EXISTS(SELECT 1 FROM user_cards uc
          JOIN cards_effective_v1210 c ON c.id=uc.card_id
          JOIN card_unique_effects cue ON cue.card_id=uc.card_id AND cue.is_active=1
          WHERE uc.user_id=? AND uc.card_id=? AND COALESCE(uc.quantity,0)>0 AND COALESCE(uc.breakthrough_level,0)>=?
          AND UPPER(COALESCE(c.rarity,''))=?
          AND COALESCE(cue.attack_percent,0)=? AND COALESCE(cue.defense_percent,0)=?
          AND COALESCE(cue.speed_percent,0)=? AND COALESCE(cue.hp_percent,0)=?)
        THEN 1 ELSE 0 END`)
      .bind(guardPre,user.id,starBefore,UNIQUE_ADVANCEMENT_COST,user.id,UNIQUE_ADVANCEMENT_PASS_CODE,passBefore,requestId,user.id,cardId,user.id,cardId,user.id,referenceId,
        user.id,cardId,UNIQUE_ADVANCEMENT_MIN_BREAKTHROUGH,eligibility.grade,stats.ATTACK,stats.DEFENSE,stats.SPEED,stats.HP),
    env.DB.prepare(`UPDATE cnine_user_inventory SET quantity=?,updated_at=CURRENT_TIMESTAMP
      WHERE user_id=? AND item_code='MASTER_STAR' AND quantity=? AND quantity>=?
      AND EXISTS(SELECT 1 FROM ${RECEIPT_TABLE} WHERE request_id=? AND user_id=? AND card_id=? AND status='PENDING')
      AND NOT EXISTS(SELECT 1 FROM ${ADVANCEMENT_TABLE} WHERE user_id=? AND card_id=?)`)
      .bind(starAfter,user.id,starBefore,UNIQUE_ADVANCEMENT_COST,requestId,user.id,cardId,user.id,cardId),
    env.DB.prepare(`UPDATE cnine_user_inventory SET unseen_quantity=MIN(unseen_quantity,?),updated_at=CURRENT_TIMESTAMP
      WHERE user_id=? AND item_code='MASTER_STAR' AND quantity=?`)
      .bind(starAfter,user.id,starAfter)
  );
  if(passUsed){
    statements.push(env.DB.prepare(`UPDATE cnine_user_inventory SET quantity=?,unseen_quantity=MIN(unseen_quantity,?),updated_at=CURRENT_TIMESTAMP
      WHERE user_id=? AND item_code=? AND quantity=? AND quantity>=1`)
      .bind(passAfter,passAfter,user.id,UNIQUE_ADVANCEMENT_PASS_CODE,passBefore));
  }
  if(successful){
    statements.push(env.DB.prepare(`INSERT INTO ${ADVANCEMENT_TABLE}(user_id,card_id,class_code,dominant_type,config_version,cost_master_stars,modifiers_json,request_id,activated_at,updated_at)
      SELECT ?,?,?,?,?,?,?,?,?,? FROM user_cards uc
      JOIN cards_effective_v1210 c ON c.id=uc.card_id
      JOIN card_unique_effects cue ON cue.card_id=uc.card_id AND cue.is_active=1
      WHERE uc.user_id=? AND uc.card_id=? AND COALESCE(uc.quantity,0)>0 AND COALESCE(uc.breakthrough_level,0)>=?
      AND UPPER(COALESCE(c.rarity,''))=?
      AND COALESCE(cue.attack_percent,0)=? AND COALESCE(cue.defense_percent,0)=? AND COALESCE(cue.speed_percent,0)=? AND COALESCE(cue.hp_percent,0)=?
      AND EXISTS(SELECT 1 FROM cnine_user_inventory WHERE user_id=? AND item_code='MASTER_STAR' AND quantity=?)
      AND EXISTS(SELECT 1 FROM ${RECEIPT_TABLE} WHERE request_id=? AND user_id=? AND card_id=? AND status='PENDING')
      AND NOT EXISTS(SELECT 1 FROM ${ADVANCEMENT_TABLE} WHERE user_id=? AND card_id=?)`)
      .bind(user.id,cardId,definition.classCode,definition.dominantType,settings.version,UNIQUE_ADVANCEMENT_COST,JSON.stringify(advancement.modifiers),requestId,advancement.activatedAt,advancement.activatedAt,
        user.id,cardId,UNIQUE_ADVANCEMENT_MIN_BREAKTHROUGH,eligibility.grade,stats.ATTACK,stats.DEFENSE,stats.SPEED,stats.HP,user.id,starAfter,requestId,user.id,cardId,user.id,cardId));
  }
  statements.push(
    env.DB.prepare(`INSERT INTO ${GUARD_TABLE}(guard_id,ok)
      SELECT ?,CASE WHEN
        ${advancementStateCondition}
        AND EXISTS(SELECT 1 FROM cnine_user_inventory WHERE user_id=? AND item_code='MASTER_STAR' AND quantity=?)
        AND COALESCE((SELECT quantity FROM cnine_user_inventory WHERE user_id=? AND item_code=?),0)=?
        THEN 1 ELSE 0 END`)
      .bind(guardState,...advancementStateBindings,user.id,starAfter,user.id,UNIQUE_ADVANCEMENT_PASS_CODE,passAfter),
    env.DB.prepare(`UPDATE ${RECEIPT_TABLE} SET status='COMPLETED',response_json=?,error_message=NULL,updated_at=CURRENT_TIMESTAMP
      WHERE request_id=? AND user_id=? AND card_id=? AND status='PENDING'
      AND ${advancementStateCondition}
      AND EXISTS(SELECT 1 FROM cnine_user_inventory WHERE user_id=? AND item_code='MASTER_STAR' AND quantity=?)`)
      .bind(JSON.stringify(response),requestId,user.id,cardId,...advancementStateBindings,user.id,starAfter),
    env.DB.prepare(`INSERT INTO inventory_logs(user_id,item_code,change_amount,balance_after,reason,reference_type,reference_id)
      SELECT ?,'MASTER_STAR',?,?,?,'UNIQUE_ADVANCEMENT',?
      WHERE EXISTS(SELECT 1 FROM ${RECEIPT_TABLE} WHERE request_id=? AND user_id=? AND card_id=? AND status='COMPLETED')
      AND ${advancementStateCondition}
      AND EXISTS(SELECT 1 FROM cnine_user_inventory WHERE user_id=? AND item_code='MASTER_STAR' AND quantity=?)
      AND NOT EXISTS(SELECT 1 FROM inventory_logs WHERE user_id=? AND reference_type='UNIQUE_ADVANCEMENT' AND reference_id=?)`)
      .bind(user.id,-UNIQUE_ADVANCEMENT_COST,starAfter,`${definition.classCode}_${successful?'ADVANCED':'FAILED'}`,referenceId,
        requestId,user.id,cardId,...advancementStateBindings,user.id,starAfter,user.id,referenceId)
  );
  if(passUsed){
    statements.push(env.DB.prepare(`INSERT INTO inventory_logs(user_id,item_code,change_amount,balance_after,reason,reference_type,reference_id)
      SELECT ?,?,-1,?,?,'UNIQUE_ADVANCEMENT_PASS',?
      WHERE EXISTS(SELECT 1 FROM ${RECEIPT_TABLE} WHERE request_id=? AND user_id=? AND card_id=? AND status='COMPLETED')
      AND NOT EXISTS(SELECT 1 FROM inventory_logs WHERE user_id=? AND reference_type='UNIQUE_ADVANCEMENT_PASS' AND reference_id=?)`)
      .bind(user.id,UNIQUE_ADVANCEMENT_PASS_CODE,passAfter,`${definition.classCode}_GUARANTEED`,referenceId,requestId,user.id,cardId,user.id,referenceId));
  }
  statements.push(
    env.DB.prepare(`INSERT INTO ${GUARD_TABLE}(guard_id,ok)
      SELECT ?,CASE WHEN
        ${advancementStateCondition}
        AND EXISTS(SELECT 1 FROM ${RECEIPT_TABLE} WHERE request_id=? AND user_id=? AND card_id=? AND status='COMPLETED')
        AND EXISTS(SELECT 1 FROM cnine_user_inventory WHERE user_id=? AND item_code='MASTER_STAR' AND quantity=?)
        AND EXISTS(SELECT 1 FROM inventory_logs WHERE user_id=? AND reference_type='UNIQUE_ADVANCEMENT' AND reference_id=? AND change_amount=? AND balance_after=?)
        AND COALESCE((SELECT quantity FROM cnine_user_inventory WHERE user_id=? AND item_code=?),0)=?
        ${passUsed?"AND EXISTS(SELECT 1 FROM inventory_logs WHERE user_id=? AND item_code=? AND reference_type='UNIQUE_ADVANCEMENT_PASS' AND reference_id=? AND change_amount=-1 AND balance_after=?)":''}
        THEN 1 ELSE 0 END`)
      .bind(guardFinal,...advancementStateBindings,requestId,user.id,cardId,user.id,starAfter,user.id,referenceId,-UNIQUE_ADVANCEMENT_COST,starAfter,
        user.id,UNIQUE_ADVANCEMENT_PASS_CODE,passAfter,...(passUsed?[user.id,UNIQUE_ADVANCEMENT_PASS_CODE,referenceId,passAfter]:[])),
    env.DB.prepare(`DELETE FROM ${GUARD_TABLE} WHERE guard_id IN (?,?,?)`).bind(guardPre,guardState,guardFinal)
  );
  try{
    await env.DB.batch(statements);
  }catch(error){
    console.warn('unique advancement atomic transaction rejected',{userId:user.id,cardId,requestId,error:String(error?.message||error)});
    try{await markReceiptFailed(env,requestId,user.id,'STATE_CONFLICT')}catch{}
    return {error:'카드 또는 재화 상태가 변경되어 전직을 확정하지 못했습니다. 최신 상태에서 같은 요청 번호로 다시 시도해 주세요.',code:'ADVANCEMENT_STATE_CONFLICT',status:409,retryable:true};
  }
  return {response};
}

export async function handleUniqueAdvancement({path,request,env,deps}){
  if(path!=='card/unique-advancement/feature'&&path!=='card/unique-advancement/status'&&path!=='card/unique-advancement')return null;
  const {authenticate,readBody,json}=deps;
  const user=await authenticate(request,env);
  if(!user)return json({error:'로그인이 필요합니다.'},401);
  await ensureUniqueAdvancementFoundation(env);
  const settings=await uniqueAdvancementSettings(env),access=featureAccess(settings.mode,user);
  if(path==='card/unique-advancement/feature'&&request.method==='GET'){
    return json({ok:true,feature:{mode:settings.mode,enabledForUser:access.enabled,testAccess:access.testAccess,ready:true},config:{successChancePercent:UNIQUE_ADVANCEMENT_SUCCESS_CHANCE_PERCENT,costMasterStars:UNIQUE_ADVANCEMENT_COST}});
  }
  if((path==='card/unique-advancement/status'||path==='card/unique-advancement')&&request.method==='GET'){
    const cardId=String(new URL(request.url).searchParams.get('cardId')||'').trim();
    if(!cardId)return json({error:'카드 정보가 필요합니다.',code:'CARD_ID_REQUIRED'},400);
    const state=await stateRows(env,user.id,cardId);
    if(!state.card)return json({error:'보유한 카드를 찾을 수 없습니다.',code:'CARD_NOT_OWNED'},404);
    return json(statusPayload({...state,settings,user}));
  }
  if(path==='card/unique-advancement'&&request.method==='POST'){
    const payload=await readBody(request),cardId=String(payload.cardId||'').trim(),requestId=String(payload.requestId||'').trim();
    if(!cardId)return json({error:'카드 정보가 필요합니다.',code:'CARD_ID_REQUIRED'},400);
    if(!validRequestId(requestId))return json({error:'요청 번호가 올바르지 않습니다.',code:'INVALID_REQUEST_ID'},400);
    if(payload.expectedPassUse!==undefined&&typeof payload.expectedPassUse!=='boolean')return json({error:'패스권 사용 확인 값이 올바르지 않습니다.',code:'INVALID_PASS_CONFIRMATION'},400);
    if(!access.enabled){
      // A feature switch must not hide a transaction that already completed
      // before the caller received its response. Completed receipts stay replayable.
      const prior=await env.DB.prepare(`SELECT card_id,status,response_json FROM ${RECEIPT_TABLE} WHERE request_id=? AND user_id=?`).bind(requestId,user.id).first();
      if(prior&&String(prior.card_id)===cardId&&prior.status==='COMPLETED'&&prior.response_json){
        const replay=safeJson(prior.response_json,null);
        if(replay)return json({...replay,replayed:true});
      }
      return json({error:'고유특성 전직은 현재 준비 중입니다.',code:'FEATURE_DISABLED',feature:{mode:settings.mode,enabledForUser:false}},409);
    }
    const result=await executeAdvancement({env,user,cardId,requestId,settings,randomUint32:deps.uniqueAdvancementRandomUint32,expectedPassUse:payload.expectedPassUse});
    if(result.response)return json(result.response);
    return json({error:result.error,code:result.code,retryable:Boolean(result.retryable),eligibility:result.eligibility},result.status||400);
  }
  return json({error:'지원하지 않는 요청입니다.'},405);
}

export const __uniqueAdvancementTest=Object.freeze({
  ADVANCEMENT_TABLE,
  RECEIPT_TABLE,
  GUARD_TABLE,
  FOUNDATION_KEY,
  ZERO_MODIFIERS,
  featureAccess,
  validRequestId,
  advancementFromRow,
  schemaStatements,
  responsePayload
});
