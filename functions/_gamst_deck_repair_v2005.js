import { GAMST_RETIREMENT_MARKER_KEY, GAMST_RETIREMENT_PLAN_TABLE } from './_gamst_card_retirement.js';
import { resolveDominantUniqueStat } from './_unique_advancement.js';
import { readRuntimeData, cacheRuntimeData } from './_runtime_data_cache.js';

export const GAMST_DECK_REPAIR_VERSION=2005;
export const GAMST_DECK_REPAIR_MARKER_KEY='gamst_deck_repair_v2005_completed';
export const GAMST_TERRITORY_FORMATION_MARKER_KEY='gamst_deck_repair_v2005_territory_formations';
export const GAMST_TERRITORY_FORMATION_PENDING_TAG='GAMST_DECK_REPAIR_V2005_PENDING';

const DECK_SIZE=5;
const SOURCE_GRADE='FUR';
const DECK_GRADE_LIMITS=Object.freeze({PRESTIGE:2,FUR:2,ZENITH:2});
const GRADE_RANK=Object.freeze({C:1,U:2,R:3,SR:4,HR:5,UR:6,SSR:7,MA:8,LIMITED:9,PRESTIGE:10,FUR:11,ZENITH:12,SUPERSTAR:13});

function rows(result){return result?.results||[]}
function integer(value,fallback=0){const number=Number(value);return Number.isFinite(number)?Math.floor(number):fallback}
function safeJson(value,fallback){try{const parsed=typeof value==='string'?JSON.parse(value):value;return parsed??fallback}catch{return fallback}}
function normalizedIds(value){const parsed=Array.isArray(value)?value:safeJson(value,[]);return Array.isArray(parsed)?parsed.map(item=>String(item&&typeof item==='object'?(item.id??item.card_id??''):item)).filter(Boolean).slice(0,DECK_SIZE):[]}
function completedSummary(row,{replayed=true}={}){const parsed=safeJson(row?.value,null);return parsed?.status==='COMPLETED'?{...parsed,replayed}:null}
function normalizedType(value){const type=String(value||'').trim().toUpperCase();if(['ATTACK','ATK','OFFENSE'].includes(type))return'ATTACK';if(['DEFENSE','DEF','GUARD'].includes(type))return'DEFENSE';if(['SPEED','SPD'].includes(type))return'SPEED';if(['HP','HEAL','HEALER','LIFE','RECOVERY'].includes(type))return'HP';return''}
function dominantType(card={}){const dominant=resolveDominantUniqueStat(card);return dominant.highest>0?dominant.dominantType:normalizedType(card.powerType??card.power_type)}
function normalizePlan(row={}){return{userId:integer(row.userId??row.user_id),sourceCardId:String((row.sourceCardId??row.source_card_id)||''),targetCardId:String((row.targetCardId??row.target_card_id)||''),dominantType:normalizedType(row.dominantType??row.dominant_type),sourceLevel:Math.max(0,integer(row.sourceLevel??row.source_level)),compensationType:String((row.compensationType??row.compensation_type)||'').toUpperCase(),grade:SOURCE_GRADE}}
function normalizeOwned(row={}){return{userId:integer(row.userId??row.user_id),id:String((row.id??row.cardId??row.card_id)||''),grade:String((row.grade??row.rarity)||'').toUpperCase(),level:Math.max(0,integer(row.level??row.breakthroughLevel??row.breakthrough_level)),basePower:Math.max(0,Number(row.basePower??row.base_power)||0),dominantType:normalizedType(row.dominantType??row.dominant_type)||dominantType(row),title:String(row.title||'')}}
function gradeAllowed(card,counts){const limit=DECK_GRADE_LIMITS[card.grade];return !limit||Number(counts.get(card.grade)||0)<limit}
function candidateBucket(card,context={}){
  const sameGrade=card.grade===String(context.grade||SOURCE_GRADE).toUpperCase(),level13=card.level>=13,sameType=Boolean(context.dominantType)&&card.dominantType===context.dominantType;
  if(context.targetCardId&&card.id===context.targetCardId)return[0,0];
  if(sameGrade&&level13)return[1,sameType?0:1];
  if(sameGrade)return[2,sameType?0:1];
  if(level13)return[3,sameType?0:1];
  return[4,sameType?0:1];
}
function additionReason(card,context={}){if(context.targetCardId&&card.id===context.targetCardId)return'SETTLEMENT_TARGET';if(card.grade===SOURCE_GRADE&&card.level>=13)return'SAME_GRADE_13';if(card.grade===SOURCE_GRADE)return'SAME_GRADE';if(card.level>=13)return'OTHER_GRADE_13';return'BEST_OWNED'}
function compareCandidates(left,right,context){const a=candidateBucket(left,context),b=candidateBucket(right,context);return a[0]-b[0]||a[1]-b[1]||(GRADE_RANK[right.grade]||0)-(GRADE_RANK[left.grade]||0)||right.level-left.level||right.basePower-left.basePower||left.id.localeCompare(right.id)}

export function buildGamstDeckRepair({cardIds=[],planRows=[],ownedCards=[],deckSize=DECK_SIZE}={}){
  const size=Math.max(1,integer(deckSize,DECK_SIZE)),before=normalizedIds(cardIds).slice(0,size),plans=(planRows||[]).map(normalizePlan).filter(row=>row.sourceCardId),retiredIds=new Set(plans.map(row=>row.sourceCardId)),owned=(ownedCards||[]).map(normalizeOwned).filter(card=>card.id),ownedById=new Map(owned.map(card=>[card.id,card]));
  const hasRetired=before.some(id=>retiredIds.has(id)),hasDuplicate=new Set(before).size!==before.length,hasInvalid=before.some(id=>!retiredIds.has(id)&&!ownedById.has(id)),affected=hasRetired||before.length<size||hasDuplicate||hasInvalid;
  if(!affected)return{affected:false,complete:before.length===size,before,after:[...before],changed:false,additions:[]};

  const plansBySource=new Map(plans.map(row=>[row.sourceCardId,row])),orderedPlans=[...plans].sort((a,b)=>Number(b.compensationType==='TRANSFER')-Number(a.compensationType==='TRANSFER')||b.sourceLevel-a.sourceLevel||a.sourceCardId.localeCompare(b.sourceCardId));
  const slots=[],contexts=[],used=new Set(),counts=new Map();
  for(const id of before){
    if(retiredIds.has(id)){slots.push(null);contexts.push(plansBySource.get(id)||orderedPlans[0]||null);continue}
    const card=ownedById.get(id);
    if(!card||used.has(id)){slots.push(null);contexts.push(null);continue}
    slots.push(id);contexts.push(null);used.add(id);counts.set(card.grade,Number(counts.get(card.grade)||0)+1);
  }
  while(slots.length<size){slots.push(null);contexts.push(null)}

  const additions=[];
  for(let index=0;index<slots.length;index++){
    if(slots[index])continue;
    const context=contexts[index]||orderedPlans.find(plan=>plan.targetCardId&&!used.has(plan.targetCardId))||orderedPlans[0]||{grade:SOURCE_GRADE};
    const candidate=owned.filter(card=>!used.has(card.id)&&gradeAllowed(card,counts)).sort((a,b)=>compareCandidates(a,b,context))[0];
    if(!candidate)continue;
    slots[index]=candidate.id;used.add(candidate.id);counts.set(candidate.grade,Number(counts.get(candidate.grade)||0)+1);
    additions.push({index,cardId:candidate.id,title:candidate.title,grade:candidate.grade,breakthroughLevel:candidate.level,dominantType:candidate.dominantType,sourceCardId:context?.sourceCardId||null,reason:additionReason(candidate,context)});
  }
  const after=slots.filter(Boolean).slice(0,size),complete=after.length===size,changed=JSON.stringify(before)!==JSON.stringify(after);
  return{affected,complete,before,after,changed,additions};
}

function groupByUser(items,normalizer){const map=new Map();for(const raw of items||[]){const item=normalizer(raw),userId=integer(item.userId);if(!userId)continue;if(!map.has(userId))map.set(userId,[]);map.get(userId).push(item)}return map}

export async function ensureGamstDeckRepairV2005(env){
  const cached=readRuntimeData(env,GAMST_DECK_REPAIR_MARKER_KEY);
  if(cached)return cached;
  const existing=completedSummary(await env.DB.prepare('SELECT value FROM app_meta WHERE key=?').bind(GAMST_DECK_REPAIR_MARKER_KEY).first());
  if(existing)return cacheRuntimeData(env,GAMST_DECK_REPAIR_MARKER_KEY,existing,1800000);
  const retirement=completedSummary(await env.DB.prepare('SELECT value FROM app_meta WHERE key=?').bind(GAMST_RETIREMENT_MARKER_KEY).first());
  if(!retirement)return{status:'WAITING',version:GAMST_DECK_REPAIR_VERSION,reason:'GAMST_RETIREMENT_NOT_COMPLETED',replayed:false};

  const [planResult,ownedResult,pveResult,pvpResult,presetResult,territoryResult,ownerResult]=await env.DB.batch([
    env.DB.prepare(`SELECT user_id AS userId,source_card_id AS sourceCardId,target_card_id AS targetCardId,dominant_type AS dominantType,source_level AS sourceLevel,compensation_type AS compensationType FROM ${GAMST_RETIREMENT_PLAN_TABLE} ORDER BY user_id,source_card_id`),
    env.DB.prepare(`SELECT uc.user_id AS userId,uc.card_id AS id,c.title,c.rarity AS grade,c.power_type AS powerType,c.base_power AS basePower,COALESCE(uc.breakthrough_level,0) AS breakthroughLevel,COALESCE(cue.attack_percent,0) AS attackPercent,COALESCE(cue.defense_percent,0) AS defensePercent,COALESCE(cue.speed_percent,0) AS speedPercent,COALESCE(cue.hp_percent,0) AS hpPercent FROM user_cards uc JOIN (SELECT DISTINCT user_id FROM ${GAMST_RETIREMENT_PLAN_TABLE}) affected ON affected.user_id=uc.user_id JOIN cards_effective_v1210 c ON c.id=uc.card_id JOIN members m ON m.id=c.member_id LEFT JOIN card_unique_effects cue ON cue.card_id=c.id AND cue.is_active=1 WHERE COALESCE(uc.quantity,0)>0 AND c.is_active=1 AND COALESCE(c.card_status,'PUBLIC')='PUBLIC' AND m.is_active=1 ORDER BY uc.user_id,c.id`),
    env.DB.prepare(`SELECT d.user_id AS userId,d.card_ids AS cardIds FROM pve_decks d WHERE EXISTS(SELECT 1 FROM ${GAMST_RETIREMENT_PLAN_TABLE} p WHERE p.user_id=d.user_id) ORDER BY d.user_id`),
    env.DB.prepare(`SELECT d.user_id AS userId,d.card_ids AS cardIds FROM pvp_decks d WHERE EXISTS(SELECT 1 FROM ${GAMST_RETIREMENT_PLAN_TABLE} p WHERE p.user_id=d.user_id) ORDER BY d.user_id`),
    env.DB.prepare(`SELECT d.user_id AS userId,d.preset_no AS presetNo,d.card_ids AS cardIds FROM pvp_deck_presets d WHERE EXISTS(SELECT 1 FROM ${GAMST_RETIREMENT_PLAN_TABLE} p WHERE p.user_id=d.user_id) ORDER BY d.user_id,d.preset_no`),
    env.DB.prepare(`SELECT w.round_id AS roundId,w.user_id AS userId,w.deck_snapshot AS cardIds,u.nickname,u.role FROM territory_war_v3_users w JOIN territory_war_v3_rounds r ON r.id=w.round_id JOIN users u ON u.id=w.user_id WHERE r.status IN ('RECRUITING','PREPARING','ACTIVE') AND EXISTS(SELECT 1 FROM ${GAMST_RETIREMENT_PLAN_TABLE} p WHERE p.user_id=w.user_id) ORDER BY w.round_id,w.user_id`),
    env.DB.prepare("SELECT id FROM users WHERE UPPER(role)='OWNER' ORDER BY id LIMIT 1")
  ]);
  const plansByUser=groupByUser(rows(planResult),normalizePlan),ownedByUser=groupByUser(rows(ownedResult),normalizeOwned);
  const repairRows=(items,kind)=>rows(items).map(row=>{const userId=integer(row.userId??row.user_id),repair=buildGamstDeckRepair({cardIds:row.cardIds??row.card_ids,planRows:plansByUser.get(userId)||[],ownedCards:ownedByUser.get(userId)||[]});return{kind,row,userId,repair}}).filter(item=>item.repair.affected);
  const planned=[...repairRows(pveResult,'pve'),...repairRows(pvpResult,'pvp'),...repairRows(presetResult,'presets'),...repairRows(territoryResult,'territory')],repairs=planned.filter(item=>item.repair.complete&&item.repair.changed),unresolved=planned.filter(item=>!item.repair.complete);
  const byKind=kind=>repairs.filter(item=>item.kind===kind),reasonCounts={};
  for(const item of repairs)for(const addition of item.repair.additions)reasonCounts[addition.reason]=Number(reasonCounts[addition.reason]||0)+1;
  const repairedUserIds=[...new Set(repairs.map(item=>item.userId))],territoryRepairs=byKind('territory'),territoryRoundIds=[...new Set(territoryRepairs.map(item=>integer(item.row.roundId??item.row.round_id)).filter(Boolean))];
  const summary={status:'COMPLETED',version:GAMST_DECK_REPAIR_VERSION,completedAt:new Date().toISOString(),affectedUsers:repairedUserIds.length,rewrittenDecks:{pve:byKind('pve').length,pvp:byKind('pvp').length,presets:byKind('presets').length,territory:territoryRepairs.length},replacementReasons:reasonCounts,unresolvedDecks:{total:unresolved.length,pve:unresolved.filter(item=>item.kind==='pve').length,pvp:unresolved.filter(item=>item.kind==='pvp').length,presets:unresolved.filter(item=>item.kind==='presets').length,territory:unresolved.filter(item=>item.kind==='territory').length},grantedCards:0,usedExistingOwnershipOnly:true};
  const runningValue=JSON.stringify({status:'RUNNING',version:GAMST_DECK_REPAIR_VERSION,nonce:crypto.randomUUID(),startedAt:new Date().toISOString()}),completedValue=JSON.stringify(summary),guard='EXISTS(SELECT 1 FROM app_meta WHERE key=? AND value=?)',guarded=(sql,...values)=>env.DB.prepare(sql.replaceAll('{GUARD}',guard)).bind(...values,GAMST_DECK_REPAIR_MARKER_KEY,runningValue),pendingBreakdown=JSON.stringify({version:2,deckComplete:true,repairPending:GAMST_TERRITORY_FORMATION_PENDING_TAG});
  const statements=[env.DB.prepare('INSERT OR IGNORE INTO app_meta(key,value,updated_at) VALUES(?,?,CURRENT_TIMESTAMP)').bind(GAMST_DECK_REPAIR_MARKER_KEY,runningValue)];
  for(const item of repairs){
    const next=JSON.stringify(item.repair.after),before=String((item.row.cardIds??item.row.card_ids)||'[]');
    if(item.kind==='pve')statements.push(guarded('UPDATE pve_decks SET card_ids=?,updated_at=CURRENT_TIMESTAMP WHERE user_id=? AND card_ids=? AND {GUARD}',next,item.userId,before));
    if(item.kind==='pvp')statements.push(guarded('UPDATE pvp_decks SET card_ids=?,updated_at=CURRENT_TIMESTAMP WHERE user_id=? AND card_ids=? AND {GUARD}',next,item.userId,before));
    if(item.kind==='presets')statements.push(guarded('UPDATE pvp_deck_presets SET card_ids=?,updated_at=CURRENT_TIMESTAMP WHERE user_id=? AND preset_no=? AND card_ids=? AND {GUARD}',next,item.userId,integer(item.row.presetNo??item.row.preset_no),before));
    if(item.kind==='territory')statements.push(guarded('UPDATE territory_war_v3_users SET deck_snapshot=?,formation_breakdown_json=?,loadout_refreshed_at=NULL,updated_at=CURRENT_TIMESTAMP WHERE round_id=? AND user_id=? AND deck_snapshot=? AND {GUARD}',next,pendingBreakdown,integer(item.row.roundId??item.row.round_id),item.userId,before));
  }
  for(const roundId of territoryRoundIds)statements.push(guarded('UPDATE territory_war_v3_rounds SET version=version+1,updated_at=CURRENT_TIMESTAMP WHERE id=? AND {GUARD}',roundId));
  const formationState=territoryRepairs.length?'PENDING':'COMPLETED';
  statements.push(guarded(`INSERT INTO app_meta(key,value,updated_at) SELECT ?,?,CURRENT_TIMESTAMP WHERE {GUARD} ON CONFLICT(key) DO UPDATE SET value=excluded.value,updated_at=CURRENT_TIMESTAMP`,GAMST_TERRITORY_FORMATION_MARKER_KEY,formationState));
  const ownerId=integer(rows(ownerResult)[0]?.id);
  if(ownerId)statements.push(guarded("INSERT INTO admin_logs(admin_id,action_type,target_type,target_id,before_data,after_data) SELECT ?,'GAMST_DECK_AUTO_REPAIR_V2005','SYSTEM',?,NULL,? WHERE {GUARD}",ownerId,GAMST_DECK_REPAIR_MARKER_KEY,completedValue));
  statements.push(guarded('UPDATE app_meta SET value=?,updated_at=CURRENT_TIMESTAMP WHERE key=? AND value=? AND {GUARD}',completedValue,GAMST_DECK_REPAIR_MARKER_KEY,runningValue));

  const results=await env.DB.batch(statements);
  if(Number(results[0]?.meta?.changes||0)===0){
    const replay=completedSummary(await env.DB.prepare('SELECT value FROM app_meta WHERE key=?').bind(GAMST_DECK_REPAIR_MARKER_KEY).first());
    if(replay)return replay;
    return{status:'RUNNING',version:GAMST_DECK_REPAIR_VERSION,replayed:true};
  }
  const stored=completedSummary(await env.DB.prepare('SELECT value FROM app_meta WHERE key=?').bind(GAMST_DECK_REPAIR_MARKER_KEY).first(),{replayed:false});
  if(!stored)throw new Error('감스트 삭제 영향 덱 복구는 실행됐지만 완료 마커를 확인하지 못했습니다.');
  console.log('GAMST_DECK_REPAIR_V2005',JSON.stringify(stored));
  return stored;
}
