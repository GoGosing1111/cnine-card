const MAX_PREVIEW = 200;
const MAX_BASE_SCAN = 1200;
const MAX_DELETE_BATCH = 10;
const MAX_RECEIPT_BATCH = 500;
const MAX_RECEIPT_TARGET = 50000;
const RECEIPT_SQL_ID_CHUNK = 100; // D1/SQLite 바인딩 변수 255개 제한보다 충분히 낮게 유지
const CAPTAIN_CLEANUP_BATCH = 100;
const CAPTAIN_CLEANUP_MAX_TARGET = 5000;
const CAPTAIN_CLEANUP_COUNT_CAP = 1000000;

const USER_DELETE_SPECS = [
  ['sessions',['user_id']],['user_cards',['user_id']],['attendance_logs',['user_id']],
  ['draw_logs',['user_id']],['coin_logs',['user_id']],['shard_logs',['user_id']],
  ['admin_permissions',['admin_user_id']],['account_ip_registrations',['user_id']],
  ['wago_verifications',['user_id']],['user_messages',['user_id']],['user_message_rewards',['user_id']],
  ['verified_coupon_deliveries',['user_id']],['coupon_redemptions',['user_id']],
  ['cnine_user_inventory',['user_id']],['inventory_logs',['user_id']],['inventory_use_receipts',['user_id']],
  ['battle_logs',['user_id']],['user_battle_energy',['user_id']],['pve_decks',['user_id']],
  ['pve_auto_locks',['user_id']],['pve_auto_runs',['user_id']],['pvp_decks',['user_id']],
  ['pvp_profiles',['user_id']],['pvp_match_history',['attacker_id','defender_id','winner_id']],
  ['user_pvp_energy',['user_id']],['pvp_reward_claims',['user_id']],['pvp_rank_reward_claims',['user_id']],
  ['pvp_season_settlement_ranks',['user_id']],['pvp_season_settlement_deliveries',['user_id']],
  ['cube_drop_boost_state',['user_id']],['cube_drop_receipts',['user_id']],
  ['premium_cube_weekly_state',['user_id']],['user_pack_pity',['user_id']],
  ['magic_card_draw_receipts',['user_id']],['magic_card_loadouts',['user_id']],
  ['magic_crystal_logs',['user_id']],['magic_crystal_reward_receipts',['user_id']],
  ['user_magic_cards',['user_id']],['mineral_exchange_requests',['user_id']],
  ['tower_clear_history',['user_id']],['tower_user_progress',['user_id']],
  ['raid_daily_entries',['user_id']],['raid_daily_entry_uses',['user_id']],
  ['raid_daily_entry_restores',['user_id']],['raid_open_requests',['user_id']],
  ['raid_participants',['user_id']],['raid_damage_logs',['user_id']],['raid_reward_receipts',['user_id']],
  ['raid_room_cancellations',['refund_user_id']],['captain_energy',['user_id']],
  ['captain_registrations',['user_id']],['captain_team_members',['user_id']],
  ['captain_reward_claims',['user_id']],
  ['captain_match_history_v2',['attacker_user_id','defender_user_id','winner_user_id']],
  ['captain_match_history_v3',['initiated_by_user_id']],['captain_match_receipts_v3',['user_id']],
  ['captain_cooldown_reset_events',['target_user_id']],['card_evolution_logs',['user_id']],
  ['card_evolution_progress',['user_id']],
  ['card_retirement_refunds',['user_id']],['limited_acquisition_audit',['user_id']],
  ['limited_manual_grant_receipts',['user_id']],['wago_daily_comment_claims',['user_id']],
  ['wago_daily_comment_progress',['user_id']],['wago_daily_post_progress_v2',['user_id']],
  ['wago_daily_quest_claims',['user_id']],['wago_daily_quest_progress',['user_id']],
  ['wago_extension_reward_receipts',['user_id']],['user_runtime_commands',['user_id']],
  ['draw_request_receipts',['user_id']],['draw_request_receipts_v2',['user_id']],
  ['draw_grant_assertions',['user_id']],
  ['territory_war_v3_users',['user_id']],['territory_war_v3_actions',['user_id']],
  ['territory_war_v3_rewards',['user_id']]
];

const ESTIMATE_SPECS = [
  ['user_cards',['user_id']],['draw_logs',['user_id']],['draw_request_receipts',['user_id']],
  ['draw_request_receipts_v2',['user_id']],['coin_logs',['user_id']],['shard_logs',['user_id']],
  ['inventory_logs',['user_id']],['battle_logs',['user_id']],['user_messages',['user_id']]
];

const RECEIPT_TABLES = new Set(['draw_request_receipts','draw_request_receipts_v2']);

function clampInt(value, fallback, min, max){
  const n=Math.floor(Number(value));
  return Number.isFinite(n)?Math.max(min,Math.min(max,n)):fallback;
}
function bool(value, fallback=false){return value===undefined?fallback:value===true||value===1||value==='1'||value==='true'}
function placeholders(n){return Array.from({length:n},()=>'?').join(',')}
function cleanCriteria(raw={}){
  return {
    // v1169 R3: 운영자가 입력한 미접속 기간 하나만 후보 조건으로 사용한다.
    // 7일 같은 단기 정리도 가능하도록 최소값을 1일로 낮춘다.
    dormantDays:clampInt(raw.dormantDays,7,1,3650),
    limit:MAX_PREVIEW
  };
}
async function existingTableSet(env,names){
  const unique=[...new Set(names)].filter(Boolean),found=new Set();
  for(let i=0;i<unique.length;i+=80){
    const chunk=unique.slice(i,i+80),rows=await env.DB.prepare(`SELECT name FROM sqlite_master WHERE type='table' AND name IN (${placeholders(chunk.length)})`).bind(...chunk).all();
    for(const row of rows.results||[])found.add(String(row.name));
  }
  return found;
}
async function databasePageInfo(env){
  // D1 exposes the authoritative database byte size in every D1Result meta.size_after.
  // PRAGMA page_* may be unavailable depending on the D1 execution path, so each
  // optional PRAGMA is isolated and must never zero out the authoritative size.
  let sizeBytes=null,pageSize=null,freePages=null;
  try{
    const probe=await env.DB.prepare('SELECT 1 AS storage_probe').run();
    const size=Number(probe?.meta?.size_after);
    if(Number.isFinite(size)&&size>=0)sizeBytes=size;
  }catch(e){console.error('D1 size_after probe failed',e)}
  const pragmaNumber=async sql=>{
    try{
      const row=await env.DB.prepare(sql).first();
      const value=Number(Object.values(row||{})[0]);
      return Number.isFinite(value)&&value>=0?value:null;
    }catch{return null}
  };
  [pageSize,freePages]=await Promise.all([
    pragmaNumber('PRAGMA page_size'),pragmaNumber('PRAGMA freelist_count')
  ]);
  const reusableBytes=Number.isFinite(pageSize)&&Number.isFinite(freePages)?pageSize*freePages:null;
  const pageCount=Number.isFinite(sizeBytes)&&Number.isFinite(pageSize)&&pageSize>0?Math.ceil(sizeBytes/pageSize):null;
  return {pageCount,pageSize,freePages,sizeBytes,reusableBytes,sizeSource:sizeBytes===null?'UNAVAILABLE':'D1_META'};
}
async function chunkedGroupedCount(env,table,column,ids){
  const map=new Map(); if(!ids.length)return map;
  for(let i=0;i<ids.length;i+=50){
    const chunk=ids.slice(i,i+50),rows=await env.DB.prepare(`SELECT ${column} user_id,COUNT(*) count FROM ${table} WHERE ${column} IN (${placeholders(chunk.length)}) GROUP BY ${column}`).bind(...chunk).all();
    for(const row of rows.results||[])map.set(Number(row.user_id),Number(row.count||0));
  }
  return map;
}
const RECENT_ACTIVITY_SPECS = [
  {table:'draw_logs',userColumns:['user_id'],timeColumns:['created_at']},
  {table:'attendance_logs',userColumns:['user_id'],timeColumns:['claimed_at','created_at']},
  {table:'battle_logs',userColumns:['user_id'],timeColumns:['created_at','updated_at']},
  {table:'pve_auto_runs',userColumns:['user_id'],timeColumns:['updated_at','created_at']},
  {table:'inventory_logs',userColumns:['user_id'],timeColumns:['created_at','updated_at']},
  {table:'pvp_match_history',userColumns:['attacker_id','defender_id'],timeColumns:['created_at','updated_at']},
  {table:'tower_clear_history',userColumns:['user_id'],timeColumns:['cleared_at','created_at']},
  {table:'raid_damage_logs',userColumns:['user_id'],timeColumns:['created_at','updated_at']},
  {table:'captain_match_history_v2',userColumns:['attacker_user_id','defender_user_id','winner_user_id'],timeColumns:['created_at','updated_at']},
  {table:'captain_match_history_v3',userColumns:['initiated_by_user_id'],timeColumns:['updated_at','created_at']},
  {table:'card_evolution_logs',userColumns:['user_id'],timeColumns:['created_at']}
];
function utcMs(value){
  const raw=String(value||'').trim();
  if(!raw)return 0;
  const normalized=/[zZ]|[+-]\d\d:?\d\d$/.test(raw)?raw:raw.replace(' ','T')+'Z';
  const ms=Date.parse(normalized);
  return Number.isFinite(ms)?ms:0;
}
function newerTimestamp(a,b){return utcMs(b)>utcMs(a)?b:a}
async function baseDormantUsers(env,criteria,onlyIds=null){
  const modifier=`-${criteria.dormantDays} days`,binds=[modifier];
  let idClause='';
  if(Array.isArray(onlyIds)&&onlyIds.length){idClause=` AND u.id IN (${placeholders(onlyIds.length)})`;binds.push(...onlyIds)}
  const limit=Array.isArray(onlyIds)&&onlyIds.length?onlyIds.length:Math.min(MAX_BASE_SCAN,Math.max(criteria.limit*4,criteria.limit));
  binds.push(limit);
  const sql=`SELECT u.id,u.nickname,u.coin,COALESCE(u.card_shards,0) card_shards,u.status,u.created_at,u.last_login_at,
    COALESCE(u.last_login_at,u.created_at) activity_at
    FROM users u
    WHERE COALESCE(u.role,'USER')='USER'
      AND datetime(COALESCE(u.last_login_at,u.created_at))<=datetime('now',?)${idClause}
    ORDER BY datetime(COALESCE(u.last_login_at,u.created_at)) ASC,u.id ASC LIMIT ?`;
  return (await env.DB.prepare(sql).bind(...binds).all()).results||[];
}
async function recentActivityMap(env,ids){
  const map=new Map(),activeSessionUsers=new Set();
  if(!ids.length)return {map,activeSessionUsers};
  const tableNames=['sessions',...RECENT_ACTIVITY_SPECS.map(x=>x.table)];
  const existing=await existingTableSet(env,tableNames);

  if(existing.has('sessions')){
    const cols=new Set(await tableColumnNames(env,'sessions'));
    if(cols.has('user_id')&&cols.has('created_at')){
      for(let i=0;i<ids.length;i+=50){
        const chunk=ids.slice(i,i+50);
        const activeExpr=cols.has('expires_at')?"MAX(CASE WHEN expires_at>datetime('now') THEN 1 ELSE 0 END)":"0";
        const rows=await env.DB.prepare(`SELECT user_id,MAX(created_at) activity_at,${activeExpr} active_session FROM sessions WHERE user_id IN (${placeholders(chunk.length)}) GROUP BY user_id`).bind(...chunk).all();
        for(const row of rows.results||[]){
          const id=Number(row.user_id);map.set(id,newerTimestamp(map.get(id),row.activity_at));
          if(Number(row.active_session||0)>0)activeSessionUsers.add(id);
        }
      }
    }
  }

  for(const spec of RECENT_ACTIVITY_SPECS){
    if(!existing.has(spec.table))continue;
    const cols=new Set(await tableColumnNames(env,spec.table));
    const userColumns=spec.userColumns.filter(x=>cols.has(x));
    const timeColumn=spec.timeColumns.find(x=>cols.has(x));
    if(!userColumns.length||!timeColumn)continue;
    const chunkSize=Math.max(10,Math.floor(80/userColumns.length));
    for(let i=0;i<ids.length;i+=chunkSize){
      const chunk=ids.slice(i,i+chunkSize),parts=[],binds=[];
      for(const userColumn of userColumns){
        parts.push(`SELECT ${userColumn} user_id,${timeColumn} activity_at FROM ${spec.table} WHERE ${userColumn} IN (${placeholders(chunk.length)})`);
        binds.push(...chunk);
      }
      const rows=await env.DB.prepare(`SELECT user_id,MAX(activity_at) activity_at FROM (${parts.join(' UNION ALL ')}) WHERE user_id IS NOT NULL GROUP BY user_id`).bind(...binds).all();
      for(const row of rows.results||[]){const id=Number(row.user_id);map.set(id,newerTimestamp(map.get(id),row.activity_at))}
    }
  }
  return {map,activeSessionUsers};
}
async function protectedCardMap(env,ids){
  const map=new Map();if(!ids.length)return map;
  const existing=await existingTableSet(env,['user_cards','cards']);
  if(!existing.has('user_cards')||!existing.has('cards'))return map;
  const userCardColumns=new Set(await tableColumnNames(env,'user_cards'));
  const levelExpr=userCardColumns.has('breakthrough_level')?'COALESCE(uc.breakthrough_level,0)':'0';
  for(let i=0;i<ids.length;i+=50){
    const chunk=ids.slice(i,i+50),rows=await env.DB.prepare(`SELECT uc.user_id,
      MAX(CASE WHEN UPPER(COALESCE(c.rarity,'')) IN ('LIMITED','PRESTIGE','FUR') THEN 1 ELSE 0 END) limited_or_higher,
      MAX(CASE WHEN ${levelExpr}>=8 THEN 1 ELSE 0 END) enhanced_eight_or_higher,
      MAX(${levelExpr}) max_breakthrough
      FROM user_cards uc JOIN cards c ON c.id=uc.card_id
      WHERE COALESCE(uc.quantity,0)>0 AND uc.user_id IN (${placeholders(chunk.length)})
      GROUP BY uc.user_id`).bind(...chunk).all();
    for(const row of rows.results||[])map.set(Number(row.user_id),{
      limitedOrHigher:Number(row.limited_or_higher||0)>0,
      enhancedEightOrHigher:Number(row.enhanced_eight_or_higher||0)>0,
      maxBreakthrough:Number(row.max_breakthrough||0)
    });
  }
  return map;
}
async function hydrateCandidateStats(env,baseRows,criteria){
  if(!baseRows.length)return {candidates:[],excluded:{recentActivity:0,activeSession:0,limitedOrHigher:0,enhancedEightOrHigher:0}};
  const ids=baseRows.map(x=>Number(x.id));
  const [tables,activity,protectedCards]=await Promise.all([
    existingTableSet(env,['user_cards']),recentActivityMap(env,ids),protectedCardMap(env,ids)
  ]);
  const cardMap=new Map();
  if(tables.has('user_cards')){
    for(let i=0;i<ids.length;i+=50){
      const chunk=ids.slice(i,i+50),rows=await env.DB.prepare(`SELECT user_id,COUNT(*) card_count,COALESCE(SUM(quantity),0) card_quantity FROM user_cards WHERE COALESCE(quantity,0)>0 AND user_id IN (${placeholders(chunk.length)}) GROUP BY user_id`).bind(...chunk).all();
      for(const row of rows.results||[])cardMap.set(Number(row.user_id),row);
    }
  }
  const cutoff=Date.now()-criteria.dormantDays*86400000;
  const excluded={recentActivity:0,activeSession:0,limitedOrHigher:0,enhancedEightOrHigher:0};
  const candidates=[];
  for(const row of baseRows){
    const id=Number(row.id),cards=cardMap.get(id)||{},protection=protectedCards.get(id)||{};
    const latestActivity=newerTimestamp(row.activity_at,activity.map.get(id));
    if(activity.activeSessionUsers.has(id)){excluded.activeSession++;continue}
    if(utcMs(latestActivity)>cutoff){excluded.recentActivity++;continue}
    if(protection.limitedOrHigher){excluded.limitedOrHigher++;continue}
    if(protection.enhancedEightOrHigher){excluded.enhancedEightOrHigher++;continue}
    candidates.push({...row,id,activity_at:latestActivity||row.activity_at,coin:Number(row.coin||0),card_shards:Number(row.card_shards||0),card_count:Number(cards.card_count||0),card_quantity:Number(cards.card_quantity||0),max_breakthrough:Number(protection.maxBreakthrough||0)});
    if(candidates.length>=criteria.limit)break;
  }
  return {candidates,excluded};
}
async function loadCandidates(env,criteria,onlyIds=null){
  const base=await baseDormantUsers(env,criteria,onlyIds);
  return hydrateCandidateStats(env,base,criteria);
}

async function estimateRows(env,ids){
  if(!ids.length)return {total:0,tables:{}};
  const existing=await existingTableSet(env,ESTIMATE_SPECS.map(x=>x[0])),statements=[],labels=[];
  for(const [table,columns] of ESTIMATE_SPECS){
    if(!existing.has(table))continue;
    for(let i=0;i<ids.length;i+=50){
      const chunk=ids.slice(i,i+50),binds=[];
      const where=columns.map(col=>{binds.push(...chunk);return `${col} IN (${placeholders(chunk.length)})`}).join(' OR ');
      statements.push(env.DB.prepare(`SELECT COUNT(*) count FROM ${table} WHERE ${where}`).bind(...binds));labels.push(table);
    }
  }
  const out={};let total=0;
  if(statements.length){const results=await env.DB.batch(statements);results.forEach((r,i)=>{const count=Number(r?.results?.[0]?.count||0),table=labels[i];out[table]=(out[table]||0)+count;total+=count})}
  return {total,tables:out};
}
async function deleteUsers(env,ids){
  const specs=USER_DELETE_SPECS,existing=await existingTableSet(env,specs.map(x=>x[0])),statements=[],labels=[];
  for(const [table,columns] of specs){
    if(!existing.has(table))continue;
    const binds=[],where=columns.map(col=>{binds.push(...ids);return `${col} IN (${placeholders(ids.length)})`}).join(' OR ');
    statements.push(env.DB.prepare(`DELETE FROM ${table} WHERE ${where}`).bind(...binds));labels.push(table);
  }
  statements.push(env.DB.prepare(`DELETE FROM users WHERE id IN (${placeholders(ids.length)}) AND COALESCE(role,'USER')='USER'`).bind(...ids));labels.push('users');
  const results=await env.DB.batch(statements),changes={};
  results.forEach((r,i)=>{changes[labels[i]]=(changes[labels[i]]||0)+Number(r?.meta?.changes||0)});
  return changes;
}
async function tableColumnNames(env,table){
  const rows=(await env.DB.prepare(`PRAGMA table_info(${table})`).all()).results||[];
  return rows.map(row=>String(row.name||'')).filter(name=>/^[A-Za-z0-9_]+$/.test(name));
}
function textByteExpression(columns){
  const clean=(columns||[]).filter(name=>/^[A-Za-z0-9_]+$/.test(name));
  return clean.length?clean.map(name=>`LENGTH(CAST(COALESCE(${name},'') AS BLOB))`).join(' + '):'0';
}
function emptyReceiptMetrics(){
  return {
    receiptRows:0,responseJsonRows:0,responseJsonBytes:0,receiptPayloadBytes:0,
    assertionRows:0,assertionProofBytes:0,assertionPayloadBytes:0,
    estimatedTextBytes:0,estimatedStorageBytes:0
  };
}
async function receiptPreview(env,{table='draw_request_receipts',retentionDays=14,batchSize=25}={}){
  if(!RECEIPT_TABLES.has(table))table='draw_request_receipts';
  retentionDays=clampInt(retentionDays,14,1,3650);batchSize=clampInt(batchSize,25,1,MAX_RECEIPT_BATCH);
  const existing=await existingTableSet(env,[table,'draw_grant_assertions']);
  if(!existing.has(table))return {table,retentionDays,batchSize,rows:[],estimatedBytes:0,metrics:emptyReceiptMetrics()};

  const columns=await tableColumnNames(env,table);
  const responseExpr=columns.includes('response_json')?"LENGTH(CAST(COALESCE(response_json,'') AS BLOB))":'0';
  const payloadExpr=textByteExpression(columns);
  const rows=(await env.DB.prepare(`SELECT request_id,status,created_at,${responseExpr} response_bytes,${payloadExpr} row_payload_bytes FROM ${table}
    WHERE status IN ('COMPLETED','APPLIED','FAILED','RETRYABLE','ARCHIVED') AND created_at<datetime('now',?)
    ORDER BY rowid ASC LIMIT ?`).bind(`-${retentionDays} days`,batchSize).all()).results||[];

  const ids=rows.map(row=>String(row.request_id||'')).filter(Boolean);
  let assertionRows=0,assertionProofBytes=0,assertionPayloadBytes=0;
  if(ids.length&&existing.has('draw_grant_assertions')){
    const assertionColumns=await tableColumnNames(env,'draw_grant_assertions');
    const assertionPayloadExpr=textByteExpression(assertionColumns);
    const proofExpr=assertionColumns.includes('proof_json')?"LENGTH(CAST(COALESCE(proof_json,'') AS BLOB))":'0';
    // D1은 SQL 한 문장당 바인딩 변수가 255개를 넘으면 실패한다.
    // 500건 미리보기에서도 안전하도록 요청 ID를 100개씩 나눠 합산한다.
    for(let i=0;i<ids.length;i+=RECEIPT_SQL_ID_CHUNK){
      const idChunk=ids.slice(i,i+RECEIPT_SQL_ID_CHUNK);
      const assertion=await env.DB.prepare(`SELECT COUNT(*) assertion_rows,COALESCE(SUM(${proofExpr}),0) proof_bytes,COALESCE(SUM(${assertionPayloadExpr}),0) payload_bytes
        FROM draw_grant_assertions WHERE request_id IN (${placeholders(idChunk.length)})`).bind(...idChunk).first();
      assertionRows+=Number(assertion?.assertion_rows||0);
      assertionProofBytes+=Number(assertion?.proof_bytes||0);
      assertionPayloadBytes+=Number(assertion?.payload_bytes||0);
    }
  }

  const responseJsonBytes=rows.reduce((sum,row)=>sum+Number(row.response_bytes||0),0);
  const responseJsonRows=rows.reduce((sum,row)=>sum+(Number(row.response_bytes||0)>0?1:0),0);
  const receiptPayloadBytes=rows.reduce((sum,row)=>sum+Number(row.row_payload_bytes||0),0);
  const estimatedTextBytes=receiptPayloadBytes+assertionPayloadBytes;
  // SQLite 행 헤더·레코드 헤더의 대략적인 값만 더한다. 페이지와 인덱스 공간은 포함하지 않는다.
  const estimatedStorageBytes=estimatedTextBytes+(rows.length+assertionRows)*64;
  const metrics={
    receiptRows:rows.length,responseJsonRows,responseJsonBytes,receiptPayloadBytes,
    assertionRows,assertionProofBytes,assertionPayloadBytes,estimatedTextBytes,estimatedStorageBytes
  };
  return {table,retentionDays,batchSize,rows,estimatedBytes:responseJsonBytes,estimatedTotalBytes:estimatedStorageBytes,metrics};
}
async function receiptAggregatePreview(env,{table='draw_request_receipts',retentionDays=14,targetCount=1000,batchSize}={}){
  if(!RECEIPT_TABLES.has(table))table='draw_request_receipts';
  retentionDays=clampInt(retentionDays,14,1,3650);
  targetCount=clampInt(targetCount??batchSize,1000,1,MAX_RECEIPT_TARGET);
  const existing=await existingTableSet(env,[table,'draw_grant_assertions']);
  if(!existing.has(table))return {table,retentionDays,targetCount,batchSize:Math.min(MAX_RECEIPT_BATCH,targetCount),availableRows:0,estimatedBatches:0,rows:[],estimatedBytes:0,metrics:emptyReceiptMetrics()};

  const columns=await tableColumnNames(env,table);
  const responseExpr=columns.includes('response_json')?"LENGTH(CAST(COALESCE(response_json,'') AS BLOB))":'0';
  const payloadExpr=textByteExpression(columns);
  const modifier=`-${retentionDays} days`;
  const receipt=await env.DB.prepare(`WITH target AS (
      SELECT request_id,${responseExpr} response_bytes,${payloadExpr} row_payload_bytes
      FROM ${table}
      WHERE status IN ('COMPLETED','APPLIED','FAILED','RETRYABLE','ARCHIVED') AND created_at<datetime('now',?)
      ORDER BY rowid ASC LIMIT ?
    )
    SELECT COUNT(*) receipt_rows,
      COALESCE(SUM(CASE WHEN response_bytes>0 THEN 1 ELSE 0 END),0) response_json_rows,
      COALESCE(SUM(response_bytes),0) response_json_bytes,
      COALESCE(SUM(row_payload_bytes),0) receipt_payload_bytes
    FROM target`).bind(modifier,targetCount).first();

  let assertionRows=0,assertionProofBytes=0,assertionPayloadBytes=0;
  if(existing.has('draw_grant_assertions')){
    const assertionColumns=await tableColumnNames(env,'draw_grant_assertions');
    const assertionPayloadExpr=assertionColumns.length?assertionColumns.map(name=>`LENGTH(CAST(COALESCE(a.${name},'') AS BLOB))`).join(' + '):'0';
    const proofExpr=assertionColumns.includes('proof_json')?"LENGTH(CAST(COALESCE(a.proof_json,'') AS BLOB))":'0';
    const assertion=await env.DB.prepare(`WITH target AS (
        SELECT request_id FROM ${table}
        WHERE status IN ('COMPLETED','APPLIED','FAILED','RETRYABLE','ARCHIVED') AND created_at<datetime('now',?)
        ORDER BY rowid ASC LIMIT ?
      )
      SELECT COUNT(*) assertion_rows,COALESCE(SUM(${proofExpr}),0) proof_bytes,COALESCE(SUM(${assertionPayloadExpr}),0) payload_bytes
      FROM draw_grant_assertions a INNER JOIN target t ON t.request_id=a.request_id`).bind(modifier,targetCount).first();
    assertionRows=Number(assertion?.assertion_rows||0);
    assertionProofBytes=Number(assertion?.proof_bytes||0);
    assertionPayloadBytes=Number(assertion?.payload_bytes||0);
  }

  const receiptRows=Number(receipt?.receipt_rows||0);
  const responseJsonRows=Number(receipt?.response_json_rows||0);
  const responseJsonBytes=Number(receipt?.response_json_bytes||0);
  const receiptPayloadBytes=Number(receipt?.receipt_payload_bytes||0);
  const estimatedTextBytes=receiptPayloadBytes+assertionPayloadBytes;
  const estimatedStorageBytes=estimatedTextBytes+(receiptRows+assertionRows)*64;
  const metrics={receiptRows,responseJsonRows,responseJsonBytes,receiptPayloadBytes,assertionRows,assertionProofBytes,assertionPayloadBytes,estimatedTextBytes,estimatedStorageBytes};
  return {table,retentionDays,targetCount,batchSize:Math.min(MAX_RECEIPT_BATCH,targetCount),availableRows:receiptRows,estimatedBatches:Math.ceil(receiptRows/MAX_RECEIPT_BATCH),rows:[],estimatedBytes:responseJsonBytes,estimatedTotalBytes:estimatedStorageBytes,metrics};
}

async function deleteReceiptBatch(env,opts){
  const preview=await receiptPreview(env,opts),ids=preview.rows.map(x=>String(x.request_id||'')).filter(Boolean);
  if(!ids.length)return {...preview,deleted:0,assertionsDeleted:0};
  const existing=await existingTableSet(env,[preview.table,'draw_grant_assertions']),statements=[];
  const idChunks=[];
  for(let i=0;i<ids.length;i+=RECEIPT_SQL_ID_CHUNK)idChunks.push(ids.slice(i,i+RECEIPT_SQL_ID_CHUNK));

  // 지급 검증 기록을 먼저 지우고 영수증을 지운다. 각 SQL은 최대 100개 변수만 사용한다.
  const assertionStatementCount=existing.has('draw_grant_assertions')?idChunks.length:0;
  if(assertionStatementCount){
    for(const idChunk of idChunks){
      statements.push(env.DB.prepare(`DELETE FROM draw_grant_assertions WHERE request_id IN (${placeholders(idChunk.length)})`).bind(...idChunk));
    }
  }
  for(const idChunk of idChunks){
    statements.push(env.DB.prepare(`DELETE FROM ${preview.table} WHERE request_id IN (${placeholders(idChunk.length)}) AND status IN ('COMPLETED','APPLIED','FAILED','RETRYABLE','ARCHIVED')`).bind(...idChunk));
  }

  const result=await env.DB.batch(statements);
  let assertionsDeleted=0,deleted=0;
  result.forEach((row,index)=>{
    const changes=Number(row?.meta?.changes||0);
    if(index<assertionStatementCount)assertionsDeleted+=changes;
    else deleted+=changes;
  });
  return {...preview,deleted,assertionsDeleted,sqlChunks:idChunks.length};
}


function cleanCaptainCleanupOptions(raw={}){
  const retentionDays=clampInt(raw.retentionDays,2,2,3650);
  const historyBatchSize=clampInt(raw.historyBatchSize,CAPTAIN_CLEANUP_BATCH,0,CAPTAIN_CLEANUP_BATCH);
  const receiptBatchSize=clampInt(raw.receiptBatchSize,CAPTAIN_CLEANUP_BATCH,0,CAPTAIN_CLEANUP_BATCH);
  const targetCount=clampInt(raw.targetCount,2500,100,CAPTAIN_CLEANUP_MAX_TARGET);
  const historyCursor=clampInt(raw.historyCursor,0,0,Number.MAX_SAFE_INTEGER);
  const receiptCursor=clampInt(raw.receiptCursor,0,0,Number.MAX_SAFE_INTEGER);
  return {retentionDays,historyBatchSize,receiptBatchSize,targetCount,historyCursor,receiptCursor,batchMax:CAPTAIN_CLEANUP_BATCH};
}
function captainHistoryWhere(){
  return `h.created_at<datetime('now',?)
    AND NOT EXISTS (
      SELECT 1 FROM captain_rounds r
      WHERE r.round_key=h.week_key AND r.status='ACTIVE'
    )`;
}
function captainReceiptWhere(){
  return `cr.status IN ('DONE','FAILED')
    AND cr.updated_at<datetime('now',?)
    AND NOT EXISTS (
      SELECT 1 FROM captain_rounds r
      WHERE r.round_key=cr.week_key AND r.status='ACTIVE'
    )`;
}
async function captainCleanupFoundation(env){
  const existing=await existingTableSet(env,['captain_rounds','captain_match_history_v3','captain_match_receipts_v3']);
  if(!existing.has('captain_rounds'))throw new Error('활성 대장전 회차 보호 테이블을 확인할 수 없어 정리를 중단했습니다.');
  return existing;
}
async function captainCleanupPreview(env,raw={}){
  const options=cleanCaptainCleanupOptions(raw),existing=await captainCleanupFoundation(env),modifier=`-${options.retentionDays} days`;
  const empty={availableRows:0,countCapped:false,sampleRows:0,samplePayloadBytes:0};
  const historyPromise=existing.has('captain_match_history_v3')?(async()=>{
    const count=await env.DB.prepare(`SELECT COUNT(*) count FROM (
      SELECT h.id FROM captain_match_history_v3 h
      WHERE ${captainHistoryWhere()}
      ORDER BY h.id ASC LIMIT ?
    )`).bind(modifier,CAPTAIN_CLEANUP_COUNT_CAP).first();
    const sample=await env.DB.prepare(`SELECT COUNT(*) sample_rows,COALESCE(SUM(payload_bytes),0) sample_payload_bytes FROM (
      SELECT LENGTH(CAST(COALESCE(h.attacker_lineup_json,'') AS BLOB))+LENGTH(CAST(COALESCE(h.defender_lineup_json,'') AS BLOB))+LENGTH(CAST(COALESCE(h.battle_log_json,'') AS BLOB)) payload_bytes
      FROM captain_match_history_v3 h
      WHERE ${captainHistoryWhere()}
      ORDER BY h.id ASC LIMIT ?
    )`).bind(modifier,CAPTAIN_CLEANUP_BATCH).first();
    const availableRows=Number(count?.count||0);
    return {availableRows,countCapped:availableRows>=CAPTAIN_CLEANUP_COUNT_CAP,sampleRows:Number(sample?.sample_rows||0),samplePayloadBytes:Number(sample?.sample_payload_bytes||0)};
  })():Promise.resolve(empty);
  const receiptPromise=existing.has('captain_match_receipts_v3')?(async()=>{
    const count=await env.DB.prepare(`SELECT COUNT(*) count FROM (
      SELECT cr.rowid FROM captain_match_receipts_v3 cr
      WHERE ${captainReceiptWhere()}
      ORDER BY cr.updated_at ASC,cr.rowid ASC LIMIT ?
    )`).bind(modifier,CAPTAIN_CLEANUP_COUNT_CAP).first();
    const sample=await env.DB.prepare(`SELECT COUNT(*) sample_rows,COALESCE(SUM(payload_bytes),0) sample_payload_bytes FROM (
      SELECT LENGTH(CAST(COALESCE(cr.response_json,'') AS BLOB))+LENGTH(CAST(COALESCE(cr.error_text,'') AS BLOB)) payload_bytes
      FROM captain_match_receipts_v3 cr
      WHERE ${captainReceiptWhere()}
      ORDER BY cr.updated_at ASC,cr.rowid ASC LIMIT ?
    )`).bind(modifier,CAPTAIN_CLEANUP_BATCH).first();
    const availableRows=Number(count?.count||0);
    return {availableRows,countCapped:availableRows>=CAPTAIN_CLEANUP_COUNT_CAP,sampleRows:Number(sample?.sample_rows||0),samplePayloadBytes:Number(sample?.sample_payload_bytes||0)};
  })():Promise.resolve(empty);
  const [history,receipts]=await Promise.all([historyPromise,receiptPromise]);
  return {options,history,receipts,activeRoundsProtected:true,pendingReceiptsProtected:true};
}
async function deleteCaptainCleanupBatch(env,raw={}){
  const options=cleanCaptainCleanupOptions(raw),existing=await captainCleanupFoundation(env),modifier=`-${options.retentionDays} days`;
  const deleted={history:0,receipts:0};
  const progress={
    history:{cursor:options.historyCursor,cycleComplete:options.historyBatchSize<=0},
    receipts:{cursor:options.receiptCursor,cycleComplete:options.receiptBatchSize<=0}
  };

  // v1281: 5,000건 정리 시 매 배치마다 테이블 처음부터 다시 정렬·검색하지 않는다.
  // PK/rowid 커서를 다음 요청으로 이어 받아 앞으로만 스캔한다. 대용량 JSON 컬럼은 조회하지 않는다.
  if(options.historyBatchSize>0&&existing.has('captain_match_history_v3')){
    const window=await env.DB.prepare(`SELECT COUNT(*) candidate_rows,MIN(id) first_id,MAX(id) last_id FROM (
      SELECT h.id FROM captain_match_history_v3 h
      WHERE h.id>? AND ${captainHistoryWhere()}
      ORDER BY h.id ASC LIMIT ?
    )`).bind(options.historyCursor,modifier,options.historyBatchSize).first();
    const lastId=Number(window?.last_id||0),candidateRows=Number(window?.candidate_rows||0);
    if(candidateRows>0&&lastId>options.historyCursor){
      const result=await env.DB.prepare(`DELETE FROM captain_match_history_v3
        WHERE id>? AND id<=? AND ${captainHistoryWhere()}`).bind(options.historyCursor,lastId,modifier).run();
      deleted.history=Number(result?.meta?.changes||0);
      progress.history={cursor:lastId,cycleComplete:candidateRows<options.historyBatchSize};
    }else progress.history={cursor:options.historyCursor,cycleComplete:true};
  }

  if(options.receiptBatchSize>0&&existing.has('captain_match_receipts_v3')){
    const window=await env.DB.prepare(`SELECT COUNT(*) candidate_rows,MIN(rowid) first_id,MAX(rowid) last_id FROM (
      SELECT cr.rowid FROM captain_match_receipts_v3 cr
      WHERE cr.rowid>? AND ${captainReceiptWhere()}
      ORDER BY cr.rowid ASC LIMIT ?
    )`).bind(options.receiptCursor,modifier,options.receiptBatchSize).first();
    const lastId=Number(window?.last_id||0),candidateRows=Number(window?.candidate_rows||0);
    if(candidateRows>0&&lastId>options.receiptCursor){
      const result=await env.DB.prepare(`DELETE FROM captain_match_receipts_v3
        WHERE rowid>? AND rowid<=? AND ${captainReceiptWhere()}`).bind(options.receiptCursor,lastId,modifier).run();
      deleted.receipts=Number(result?.meta?.changes||0);
      progress.receipts={cursor:lastId,cycleComplete:candidateRows<options.receiptBatchSize};
    }else progress.receipts={cursor:options.receiptCursor,cycleComplete:true};
  }

  return {options,deleted,progress,activeRoundsProtected:true,pendingReceiptsProtected:true};
}


const SAFE_LOG_CLEANUP_SPECS = Object.freeze({
  SHARD_DUPLICATE:{
    table:'shard_logs',label:'중복 카드 조각 로그',retentionDefault:1,
    whereSql:"reason='DUPLICATE'",reasonColumn:true,
    description:'카드팩 중복 획득으로 생성된 조각 감사 로그만 정리합니다. 현재 카드 조각 잔액은 users.card_shards에 유지됩니다.'
  },
  COIN_PACK_DRAW:{
    table:'coin_logs',label:'카드팩 코인 사용 로그',retentionDefault:1,
    whereSql:"reason='PACK_DRAW'",reasonColumn:true,
    description:'오래된 카드팩 코인 사용 이력만 정리합니다. 현재 코인 잔액은 users.coin에 유지됩니다.'
  },
  BATTLE_HISTORY:{
    table:'battle_logs',label:'오래된 PVE 전투 로그',retentionDefault:1,
    whereSql:'1=1',reasonColumn:false,
    description:'오래된 PVE 결과 기록만 정리합니다. 에너지·보상·덱·진행 데이터는 건드리지 않습니다.'
  },
  PVP_HISTORY:{
    table:'pvp_match_history',label:'오래된 PVP 전투 기록',retentionDefault:3,
    whereSql:'1=1',reasonColumn:false,
    description:'보존 기간이 지난 PVP 상세 전투 이력만 정리합니다. 점수·승패·랭킹 프로필은 유지됩니다.'
  },
  INVENTORY_HISTORY:{
    table:'inventory_logs',label:'오래된 인벤토리 변동 기록',retentionDefault:30,
    whereSql:'1=1',reasonColumn:false,
    description:'현재 인벤토리 수량과 별도인 오래된 변동 감사 기록만 정리합니다. 실제 보유 아이템은 cnine_user_inventory에 유지됩니다.'
  },
  MAGIC_CRYSTAL_HISTORY:{
    table:'magic_crystal_logs',label:'오래된 마법 결정 변동 기록',retentionDefault:30,
    whereSql:'1=1',reasonColumn:false,
    description:'일일 제한 계산에 필요하지 않은 오래된 마법 결정 감사 기록만 정리합니다. 현재 잔액은 users.magic_crystals에 유지됩니다.'
  },
  TOWER_HISTORY:{
    table:'tower_clear_history',label:'오래된 무한의탑 상세 기록',retentionDefault:90,
    whereSql:'1=1',reasonColumn:false,
    description:'시즌 진행도와 랭킹 원본은 유지하고, 오래된 층별 결과 상세 기록만 정리합니다.'
  }
});
const SAFE_LOG_SCAN_BATCH = 10000;
const SAFE_LOG_MAX_TARGET = 1000000;

function cleanSafeCleanupOptions(raw={}){
  const requested=String(raw.logType||raw.table||'SHARD_DUPLICATE').toUpperCase();
  const logType=SAFE_LOG_CLEANUP_SPECS[requested]?requested:'SHARD_DUPLICATE';
  const spec=SAFE_LOG_CLEANUP_SPECS[logType];
  return {
    logType,
    table:spec.table,
    retentionDays:clampInt(raw.retentionDays,spec.retentionDefault,1,3650),
    targetRows:clampInt(raw.targetRows,250000,10000,SAFE_LOG_MAX_TARGET),
    scanBatch:clampInt(raw.scanBatch,SAFE_LOG_SCAN_BATCH,1000,SAFE_LOG_SCAN_BATCH),
    sessionRetentionDays:clampInt(raw.sessionRetentionDays,7,1,3650),
    cleanupExpiredSessions:bool(raw.cleanupExpiredSessions,true)
  };
}
function safeLogCursorKey(logType,retentionDays){return `storage_safe_log_cursor_${String(logType||'').toLowerCase()}_${Math.max(1,Number(retentionDays||0))}d`}
async function safeLogCursor(env,logType,retentionDays){
  try{
    const row=await env.DB.prepare('SELECT value FROM app_meta WHERE key=?').bind(safeLogCursorKey(logType,retentionDays)).first();
    const value=Math.max(0,Math.floor(Number(row?.value||0)));
    return Number.isFinite(value)?value:0;
  }catch{return 0}
}
async function safeLogCleanupBatch(env,raw={},execute=false){
  const options=cleanSafeCleanupOptions(raw),spec=SAFE_LOG_CLEANUP_SPECS[options.logType];
  const existing=await existingTableSet(env,[spec.table,'app_meta']);
  if(!existing.has(spec.table))return {...options,label:spec.label,description:spec.description,scannedRows:0,advancedRows:0,candidateRows:0,deletedRows:0,estimatedPayloadBytes:0,estimatedStorageBytes:0,cursorBefore:0,cursorAfter:0,highestSequence:0,cycleComplete:true};

  const columns=await tableColumnNames(env,spec.table),columnSet=new Set(columns);
  if(!columnSet.has('id')||!columnSet.has('created_at'))throw new Error(`${spec.table} 정리 기준 컬럼을 확인할 수 없습니다.`);
  const cursorBefore=await safeLogCursor(env,options.logType,options.retentionDays);
  const payloadExpr=columns.length?textByteExpression(columns):'0';
  const reasonSelect=spec.reasonColumn&&columnSet.has('reason')?',reason':'';
  const rows=(await env.DB.prepare(`SELECT id,created_at${reasonSelect},${payloadExpr} row_payload_bytes FROM ${spec.table} WHERE id>? ORDER BY id ASC LIMIT ?`).bind(cursorBefore,options.scanBatch).all()).results||[];
  const cutoffMs=Date.now()-options.retentionDays*86400000;
  const eligible=rows.filter(row=>{
    if(utcMs(row.created_at)>cutoffMs)return false;
    if(options.logType==='SHARD_DUPLICATE')return String(row.reason||'').toUpperCase()==='DUPLICATE';
    if(options.logType==='COIN_PACK_DRAW')return String(row.reason||'').toUpperCase()==='PACK_DRAW';
    return true;
  });
  const scannedCursor=rows.length?Number(rows[rows.length-1].id||cursorBefore):cursorBefore;
  const cycleComplete=rows.length<options.scanBatch;
  const cursorAfter=cycleComplete?0:Math.max(cursorBefore,scannedCursor);
  const estimatedPayloadBytes=eligible.reduce((sum,row)=>sum+Number(row.row_payload_bytes||0),0);
  const estimatedStorageBytes=estimatedPayloadBytes+eligible.length*96;
  let deletedRows=0;

  if(execute){
    // D1은 SQL 한 문장에 사용할 수 있는 바인딩 변수 수가 제한되어 있다.
    // 개별 ID를 IN (...)으로 전달하지 않고, 이번에 실제로 검사한 연속 ID 구간만 삭제한다.
    // 동일한 조건과 보존 기간을 서버에서 다시 확인하므로 유저 자산 데이터에는 접근하지 않는다.
    if(rows.length&&scannedCursor>cursorBefore){
      const result=await env.DB.prepare(`DELETE FROM ${spec.table}
        WHERE id>? AND id<=?
          AND (${spec.whereSql})
          AND created_at<datetime('now',?)`)
        .bind(cursorBefore,scannedCursor,`-${options.retentionDays} days`).run();
      deletedRows=Number(result?.meta?.changes||0);
    }
    if(existing.has('app_meta')){
      await env.DB.prepare(`INSERT INTO app_meta(key,value,updated_at) VALUES(?,?,CURRENT_TIMESTAMP)
        ON CONFLICT(key) DO UPDATE SET value=excluded.value,updated_at=CURRENT_TIMESTAMP`)
        .bind(safeLogCursorKey(options.logType,options.retentionDays),String(cursorAfter)).run();
    }
  }
  let highestSequence=0;
  try{const seq=await env.DB.prepare('SELECT seq FROM sqlite_sequence WHERE name=?').bind(spec.table).first();highestSequence=Number(seq?.seq||0)}catch{}
  return {
    ...options,label:spec.label,description:spec.description,scannedRows:rows.length,advancedRows:rows.length,
    candidateRows:eligible.length,deletedRows,estimatedPayloadBytes,estimatedStorageBytes,
    cursorBefore,cursorAfter,highestSequence,cycleComplete
  };
}
async function expiredSessionPreview(env,raw={}){
  const options=cleanSafeCleanupOptions(raw),existing=await existingTableSet(env,['sessions']);
  if(!options.cleanupExpiredSessions||!existing.has('sessions'))return {eligibleRows:0,retentionDays:options.sessionRetentionDays};
  const row=await env.DB.prepare(`SELECT COUNT(*) count FROM (
    SELECT token_hash FROM sessions WHERE expires_at<datetime('now',?) LIMIT ?
  )`).bind(`-${options.sessionRetentionDays} days`,options.scanBatch).first();
  return {eligibleRows:Number(row?.count||0),retentionDays:options.sessionRetentionDays};
}
async function deleteExpiredSessionsBatch(env,raw={}){
  const options=cleanSafeCleanupOptions(raw),existing=await existingTableSet(env,['sessions']);
  if(!options.cleanupExpiredSessions||!existing.has('sessions'))return {deletedRows:0,retentionDays:options.sessionRetentionDays};
  const result=await env.DB.prepare(`DELETE FROM sessions WHERE token_hash IN (
    SELECT token_hash FROM sessions WHERE expires_at<datetime('now',?) ORDER BY expires_at ASC LIMIT ?
  )`).bind(`-${options.sessionRetentionDays} days`,options.scanBatch).run();
  return {deletedRows:Number(result?.meta?.changes||0),retentionDays:options.sessionRetentionDays};
}


// v1400: hot paths must not keep full response payloads and audit rows forever.
// One sampled request rotates through one tiny task. Active PENDING/RUNNING/READY rows are protected; only stale terminal rows or oversized completed payloads are touched.
// Never let request traffic turn maintenance into foreground database load.
// A sampled job still uses the DB lease below, but it now runs rarely and in
// small bounded chunks; the OWNER cleanup screen remains available for bulk
// maintenance when the server is quiet.
// At production traffic levels 1/1024 still generated over 100k lease writes a
// day. General maintenance stays on a ten-minute lease, while append-only audit
// logs use their own one-minute lease so a slow receipt task cannot block them.
// The OWNER cleanup endpoint remains available for deliberate bulk work.
// V1795: 정리 처리량 상향.
//
// 기존 설정으로는 41개 태스크를 10분 리스로 "1회당 1개" 씩만 돌렸다.
// 한 바퀴 = 41 × 10분 ≈ 6.8시간. 게다가 1/16384 샘플링이 먼저 걸려야 시작되므로
// 초당 27요청 이상 꾸준히 들어오지 않으면 그 6.8시간조차 못 지킨다.
// 뽑기가 많은 게임에서는 draw_logs / coin_logs / shard_logs 가 쌓이는 속도를
// 절대 따라잡지 못한다. (실제로 D1 이 계속 커지고 느려진다는 제보로 확인)
//
// 부하 상한은 리스와 배치 크기가 잡고 있으므로 샘플링은 사실상 중복 방어다.
// 샘플링을 낮추고 리스를 짧게, 1회에 여러 태스크를 처리하도록 바꾼다.
//   한 바퀴 = ceil(41/3) × 3분 ≈ 42분  (기존 6.8시간 대비 약 10배)
// 1회 부하는 여전히 "DELETE 3건 × 최대 5000행" 으로 묶여 있다.
const AUTO_STORAGE_MAINTENANCE_SAMPLE_MOD=512;
const AUTO_STORAGE_MAINTENANCE_LEASE_MINUTES=3;
const AUTO_STORAGE_MAINTENANCE_TASKS_PER_RUN=3;
// v1739: production traffic creates receipts and combat audit rows much faster
// than the old 100/2,000-row rotation could retire them.  Keep each statement
// bounded, but give every ten-minute lease enough capacity to stay ahead of a
// full day of writes.
const AUTO_STORAGE_MAINTENANCE_BATCH=5000;
const AUTO_HIGH_VOLUME_SCAN_BATCH=50000;
const AUTO_HIGH_VOLUME_TASKS=Object.freeze([
  {key:'shard_duplicate',table:'shard_logs',retentionDays:1,extraWhere:"reason='DUPLICATE'"},
  {key:'coin_pack_draw',table:'coin_logs',retentionDays:1,extraWhere:"reason='PACK_DRAW'"},
  {key:'draw_history',table:'draw_logs',retentionDays:1,extraWhere:'1=1'},
  {key:'battle_history',table:'battle_logs',retentionDays:1,extraWhere:'1=1'},
  {key:'pvp_history',table:'pvp_match_history',retentionDays:1,extraWhere:'1=1'},
  {key:'raid_damage_history',table:'raid_damage_logs',requires:['raid_instances'],retentionDays:1,
    extraWhere:"instance_id IN (SELECT id FROM raid_instances WHERE status='ENDED' AND updated_at<datetime('now','-1 day'))"}
]);
const AUTO_STORAGE_INDEX_TASKS=Object.freeze([
  {key:'twv3_actions_cleanup',table:'territory_war_v3_actions',columns:['status','updated_at','id'],sql:'CREATE INDEX IF NOT EXISTS idx_twv3_actions_cleanup_v1402 ON territory_war_v3_actions(status,updated_at,id)'},
  {key:'twv3_rewards_cleanup',table:'territory_war_v3_rewards',columns:['claimed_at','created_at','round_id'],sql:'CREATE INDEX IF NOT EXISTS idx_twv3_rewards_cleanup_v1402 ON territory_war_v3_rewards(claimed_at,created_at,round_id)'},
  {key:'twv3_admin_cleanup',table:'territory_war_v3_admin_operations',columns:['status','updated_at'],sql:'CREATE INDEX IF NOT EXISTS idx_twv3_admin_cleanup_v1402 ON territory_war_v3_admin_operations(status,updated_at)'}
]);
const AUTO_STORAGE_MAINTENANCE_TASKS=Object.freeze([
  // Ephemeral authentication/runtime rows have no value after their grace period.
  {key:'expired_sessions',table:'sessions',sql:`DELETE FROM sessions WHERE token_hash IN (
    SELECT token_hash FROM sessions WHERE expires_at<datetime('now','-7 days') ORDER BY expires_at LIMIT ?)`},
  {key:'runtime_commands',table:'user_runtime_commands',sql:`DELETE FROM user_runtime_commands WHERE id IN (
    SELECT id FROM user_runtime_commands WHERE expires_at<datetime('now','-3 days') ORDER BY expires_at LIMIT ?)`},
  {key:'pve_auto_locks',table:'pve_auto_locks',sql:`DELETE FROM pve_auto_locks WHERE user_id IN (
    SELECT user_id FROM pve_auto_locks WHERE expires_at<datetime('now','-1 day') ORDER BY expires_at LIMIT ?)`},
  {key:'expired_ip_exceptions',table:'account_ip_exceptions',sql:`DELETE FROM account_ip_exceptions WHERE ip_hash IN (
    SELECT ip_hash FROM account_ip_exceptions WHERE expires_at IS NOT NULL AND expires_at<datetime('now','-7 days') ORDER BY expires_at LIMIT ?)`},
  {key:'inventory_receipts',table:'inventory_use_receipts',sql:`DELETE FROM inventory_use_receipts WHERE rowid IN (
    SELECT rowid FROM inventory_use_receipts INDEXED BY idx_inventory_receipts_cleanup_v1739 WHERE
      (status IN ('COMPLETED','FAILED','CANCELLED') AND updated_at<datetime('now','-1 day'))
    ORDER BY updated_at LIMIT ?)`},
  {key:'rift_receipts',table:'pve_rift_action_receipts',requires:['pve_rift_runs'],sql:`DELETE FROM pve_rift_action_receipts WHERE rowid IN (
    SELECT x.rowid FROM pve_rift_action_receipts x WHERE
      (x.status IN ('COMPLETED','FAILED','CANCELLED') AND x.updated_at<datetime('now','-1 day'))
      AND NOT EXISTS (SELECT 1 FROM pve_rift_runs r WHERE r.run_id=x.run_id AND r.status IN ('ACTIVE','CLAIMING','COMPLETED_PENDING'))
    ORDER BY x.updated_at LIMIT ?)`},
  {key:'raid_receipts',table:'raid_reward_receipts',requires:['raid_participants'],sql:`DELETE FROM raid_reward_receipts WHERE rowid IN (
    SELECT rr.rowid FROM raid_reward_receipts rr WHERE
      ((rr.status='COMPLETED' AND rr.updated_at<datetime('now','-1 day') AND EXISTS (
          SELECT 1 FROM raid_participants rp WHERE rp.instance_id=rr.instance_id AND rp.user_id=rr.user_id AND COALESCE(rp.reward_claimed,0)=1
        )) OR (rr.status IN ('FAILED','CANCELLED','RETRYABLE') AND rr.updated_at<datetime('now','-1 day')))
    ORDER BY rr.updated_at LIMIT ?)`},
  {key:'magic_draw_receipts',table:'magic_card_draw_receipts',sql:`DELETE FROM magic_card_draw_receipts WHERE rowid IN (
    SELECT rowid FROM magic_card_draw_receipts WHERE
      (status IN ('COMPLETED','FAILED','CANCELLED') AND updated_at<datetime('now','-1 day'))
    ORDER BY updated_at LIMIT ?)`},
  {key:'magic_enhance_receipts',table:'magic_card_enhance_receipts',sql:`DELETE FROM magic_card_enhance_receipts WHERE rowid IN (
    SELECT rowid FROM magic_card_enhance_receipts WHERE status IN ('COMPLETED','FAILED','CANCELLED')
      AND updated_at<datetime('now','-1 day') ORDER BY updated_at LIMIT ?)`},
  {key:'breakthrough_auto_receipts',table:'breakthrough_auto_receipts_v1616',sql:`DELETE FROM breakthrough_auto_receipts_v1616 WHERE rowid IN (
    SELECT rowid FROM breakthrough_auto_receipts_v1616 WHERE status IN ('COMPLETED','FAILED','CANCELLED')
      AND updated_at<datetime('now','-1 day') ORDER BY updated_at LIMIT ?)`},
  {key:'black_miracle_open_receipts',table:'black_miracle_pack_open_receipts',sql:`DELETE FROM black_miracle_pack_open_receipts WHERE rowid IN (
    SELECT rowid FROM black_miracle_pack_open_receipts WHERE status IN ('COMPLETED','FAILED','CANCELLED')
      AND updated_at<datetime('now','-1 day') ORDER BY updated_at LIMIT ?)`},
  {key:'limited_grant_receipts',table:'limited_manual_grant_receipts',sql:`DELETE FROM limited_manual_grant_receipts WHERE rowid IN (
    SELECT rowid FROM limited_manual_grant_receipts WHERE
      (status IN ('COMPLETED','FAILED','CANCELLED') AND updated_at<datetime('now','-1 day'))
    ORDER BY updated_at LIMIT ?)`},
  {key:'vehicle_receipts',table:'vehicle_draw_receipts',sql:`DELETE FROM vehicle_draw_receipts WHERE rowid IN (
    SELECT rowid FROM vehicle_draw_receipts WHERE
      (status IN ('COMPLETED','FAILED','CANCELLED') AND updated_at<datetime('now','-1 day'))
    ORDER BY updated_at LIMIT ?)`},
  {key:'vehicle_purchase_receipts',table:'vehicle_draw_purchase_receipts',sql:`DELETE FROM vehicle_draw_purchase_receipts WHERE rowid IN (
    SELECT rowid FROM vehicle_draw_purchase_receipts WHERE
      (status IN ('COMPLETED','FAILED','CANCELLED') AND updated_at<datetime('now','-1 day'))
    ORDER BY updated_at LIMIT ?)`},
  {key:'equipment_drop_receipts',table:'equipment_drop_receipts',sql:`DELETE FROM equipment_drop_receipts WHERE rowid IN (
    SELECT rowid FROM equipment_drop_receipts WHERE
      (result NOT IN ('PENDING','RUNNING','READY','CLAIMING') AND updated_at<datetime('now','-1 day'))
    ORDER BY updated_at LIMIT ?)`},
  {key:'cube_drop_receipts',table:'cube_drop_receipts',sql:`DELETE FROM cube_drop_receipts WHERE rowid IN (
    SELECT rowid FROM cube_drop_receipts WHERE
      (status IN ('COMPLETED','FAILED','CANCELLED') AND updated_at<datetime('now','-1 day'))
    ORDER BY updated_at LIMIT ?)`},
  {key:'seal_action_receipts',table:'seal_battle_action_receipts',sql:`DELETE FROM seal_battle_action_receipts WHERE id IN (
    SELECT id FROM seal_battle_action_receipts WHERE
      (status IN ('DONE','FAILED','CANCELLED') AND updated_at<datetime('now','-1 day'))
    ORDER BY updated_at LIMIT ?)`},
  {key:'reroll_ticket_receipts',table:'high_grade_reroll_ticket_receipts',sql:`DELETE FROM high_grade_reroll_ticket_receipts WHERE rowid IN (
    SELECT rowid FROM high_grade_reroll_ticket_receipts WHERE used_at<datetime('now','-90 days') ORDER BY used_at LIMIT ?)`},
  {key:'reroll_drop_receipts',table:'high_grade_reroll_drop_receipts',sql:`DELETE FROM high_grade_reroll_drop_receipts WHERE rowid IN (
    SELECT rowid FROM high_grade_reroll_drop_receipts WHERE created_at<datetime('now','-90 days') ORDER BY created_at LIMIT ?)`},
  {key:'pve_auto_receipts',table:'pve_auto_runs',sql:`DELETE FROM pve_auto_runs WHERE rowid IN (
    SELECT rowid FROM pve_auto_runs WHERE status IN ('COMPLETED','FAILED','CANCELLED') AND updated_at<datetime('now','-1 day')
    ORDER BY updated_at LIMIT ?)`},
  {key:'magic_reward_failed',table:'magic_crystal_reward_receipts',sql:`DELETE FROM magic_crystal_reward_receipts WHERE rowid IN (
    SELECT rowid FROM magic_crystal_reward_receipts WHERE status IN ('FAILED','RETRYABLE','CANCELLED')
      AND updated_at<datetime('now','-1 day') ORDER BY updated_at LIMIT ?)`},
  // The receipt only exists to make a recent reward retry idempotent. Keeping
  // compacted terminal rows forever grew this table past 900k rows and made
  // every later maintenance pass progressively more expensive.
  {key:'magic_reward_completed',table:'magic_crystal_reward_receipts',sql:`DELETE FROM magic_crystal_reward_receipts WHERE rowid IN (
    SELECT rowid FROM magic_crystal_reward_receipts INDEXED BY idx_magic_reward_receipts_cleanup_v1401
    WHERE status='COMPLETED' AND updated_at<datetime('now','-1 day') ORDER BY updated_at LIMIT ?)`},
  {key:'unified_drop_receipts',table:'unified_drop_receipts_v1667',sql:`DELETE FROM unified_drop_receipts_v1667 WHERE rowid IN (
    SELECT rowid FROM unified_drop_receipts_v1667 WHERE status IN ('COMPLETED','FAILED','CANCELLED')
      AND updated_at<datetime('now','-1 day') ORDER BY updated_at LIMIT ?)`},
  {key:'scrapyard_run_receipts',table:'scrapyard_run_receipts_v1676',sql:`DELETE FROM scrapyard_run_receipts_v1676 WHERE rowid IN (
    SELECT rowid FROM scrapyard_run_receipts_v1676 WHERE status IN ('COMPLETED','FAILED','CANCELLED')
      AND updated_at<datetime('now','-1 day') ORDER BY updated_at LIMIT ?)`},
  {key:'workshop_craft_receipts',table:'workshop_craft_receipts_v1668',sql:`DELETE FROM workshop_craft_receipts_v1668 WHERE rowid IN (
    SELECT rowid FROM workshop_craft_receipts_v1668 WHERE status IN ('COMPLETED','FAILED','CANCELLED')
      AND updated_at<datetime('now','-1 day') ORDER BY updated_at LIMIT ?)`},
  {key:'equipment_synthesis_receipts',table:'equipment_synthesis_receipts_v1676',sql:`DELETE FROM equipment_synthesis_receipts_v1676 WHERE rowid IN (
    SELECT rowid FROM equipment_synthesis_receipts_v1676 WHERE status IN ('COMPLETED','FAILED','CANCELLED')
      AND updated_at<datetime('now','-1 day') ORDER BY updated_at LIMIT ?)`},
  {key:'monster_siege_actions',table:'monster_siege_actions',requires:['monster_siege_events'],sql:`DELETE FROM monster_siege_actions WHERE request_id IN (
    SELECT a.request_id FROM monster_siege_actions a JOIN monster_siege_events e ON e.id=a.event_id
    WHERE e.status IN ('CLEARED','FAILED') AND a.created_at<datetime('now','-1 day') ORDER BY a.created_at LIMIT ?)`},
  {key:'captain_match_receipts',table:'captain_match_receipts_v3',sql:`DELETE FROM captain_match_receipts_v3 WHERE request_id IN (
    SELECT request_id FROM captain_match_receipts_v3 WHERE status IN ('DONE','FAILED','CANCELLED')
      AND updated_at<datetime('now','-1 day') ORDER BY updated_at LIMIT ?)`},
  {key:'captain_match_history',table:'captain_match_history_v3',probe:`SELECT 1 FROM captain_match_history_v3 WHERE created_at<datetime('now','-1 day') LIMIT 1`,
    sql:`DELETE FROM captain_match_history_v3 WHERE id IN (
    SELECT id FROM captain_match_history_v3 WHERE created_at<datetime('now','-1 day') ORDER BY created_at LIMIT ?)`},
  {key:'reroll_usage_compact',table:'high_grade_reroll_usage_v2',requires:['cards'],sql:`UPDATE high_grade_reroll_usage_v2 SET response_json=json_object(
      'ok',1,'grade',grade,'usageNo',usage_no,'usedCount',usage_no,'limit',2,'sourceCardId',source_card_id,
      'resultCardId',result_card_id,'breakthroughLevel',breakthrough_level,'remaining',MAX(0,2-usage_no),'compacted',1,
      'card',json_object('id',result_card_id,'title',COALESCE((SELECT title FROM cards WHERE id=result_card_id),''),
        'grade',grade,'rarity',grade,'image',COALESCE((SELECT image_url FROM cards WHERE id=result_card_id),'')))
    WHERE rowid IN (SELECT rowid FROM high_grade_reroll_usage_v2 WHERE used_at<datetime('now','-30 days')
      AND LENGTH(COALESCE(response_json,''))>1024 ORDER BY used_at LIMIT ?)`},
  // V1803: 90일 보존은 도달 불가였다. 하루 22.8만 행씩 늘어 90일이면 2,050만 행이고,
  // 인덱스 4개까지 더하면 이 테이블만 5~6GB — DB 한도(10GB)를 먼저 넘긴다.
  // 주간 프리미엄 큐브 중복지급 방지가 최근 7일치를 조회하므로 30일이면 여유 4배다.
  {key:'inventory_logs',table:'inventory_logs',probe:`SELECT 1 FROM inventory_logs WHERE created_at<datetime('now','-30 days') LIMIT 1`,
    sql:`DELETE FROM inventory_logs WHERE id IN (
    SELECT id FROM inventory_logs WHERE created_at<datetime('now','-30 days') ORDER BY created_at LIMIT ?)`},
  {key:'magic_crystal_logs',table:'magic_crystal_logs',probe:`SELECT 1 FROM magic_crystal_logs WHERE created_at<datetime('now','-30 days') LIMIT 1`,
    sql:`DELETE FROM magic_crystal_logs WHERE id IN (
    SELECT id FROM magic_crystal_logs WHERE created_at<datetime('now','-30 days') ORDER BY created_at LIMIT ?)`},
  {key:'tower_history',table:'tower_clear_history',probe:`SELECT 1 FROM tower_clear_history WHERE created_at<datetime('now','-90 days') LIMIT 1`,
    sql:`DELETE FROM tower_clear_history WHERE id IN (
    SELECT id FROM tower_clear_history WHERE created_at<datetime('now','-90 days') ORDER BY created_at LIMIT ?)`},
  {key:'admin_log_compact',table:'admin_logs',sql:`UPDATE admin_logs SET
      before_data=CASE WHEN before_data IS NULL THEN NULL ELSE json_object('compacted',1,'originalBytes',LENGTH(before_data)) END,
      after_data=CASE WHEN after_data IS NULL THEN NULL ELSE json_object('compacted',1,'originalBytes',LENGTH(after_data)) END
    WHERE id IN (SELECT id FROM admin_logs WHERE created_at<datetime('now','-180 days')
      AND LENGTH(COALESCE(before_data,''))+LENGTH(COALESCE(after_data,''))>2048 ORDER BY created_at LIMIT ?)`,
    probe:`SELECT 1 FROM admin_logs WHERE created_at<datetime('now','-180 days') LIMIT 1`},
  {key:'territory_admin_operations',table:'territory_war_admin_operations',sql:`DELETE FROM territory_war_admin_operations WHERE rowid IN (
    SELECT rowid FROM territory_war_admin_operations WHERE
      ((status='COMPLETED' AND updated_at<datetime('now','-30 days')) OR (status='FAILED' AND updated_at<datetime('now','-7 days')))
    ORDER BY updated_at LIMIT ?)`},
  {key:'twv3_actions',table:'territory_war_v3_actions',sql:`DELETE FROM territory_war_v3_actions WHERE id IN (
    SELECT id FROM territory_war_v3_actions WHERE
      ((status='COMPLETED' AND updated_at<datetime('now','-1 day') AND round_id IN (SELECT id FROM territory_war_v3_rounds WHERE status IN ('FINISHED','DISABLED')))
       OR (status='FAILED' AND updated_at<datetime('now','-1 hour')))
    ORDER BY updated_at LIMIT ?)`},
  {key:'twv3_admin_operations',table:'territory_war_v3_admin_operations',sql:`DELETE FROM territory_war_v3_admin_operations WHERE rowid IN (
    SELECT rowid FROM territory_war_v3_admin_operations WHERE
      (status IN ('COMPLETED','FAILED') AND updated_at<datetime('now','-1 hour'))
    ORDER BY updated_at LIMIT ?)`},
  {key:'twv3_claimed_rewards',table:'territory_war_v3_rewards',sql:`DELETE FROM territory_war_v3_rewards WHERE rowid IN (
    SELECT rowid FROM territory_war_v3_rewards WHERE claimed_at IS NOT NULL AND claimed_at<datetime('now','-365 days')
    ORDER BY claimed_at LIMIT ?)`}
]);
function autoMaintenanceHash(value){let h=2166136261;for(const ch of String(value||'')){h^=ch.charCodeAt(0);h=Math.imul(h,16777619)}return h>>>0}
async function runHighVolumeLogMaintenance(env){
  const rotationRow=await env.DB.prepare("SELECT value FROM app_meta WHERE key='storage_high_volume_rotation_v1430'").first();
  const rotation=Math.max(0,Math.floor(Number(rotationRow?.value||0)))%AUTO_HIGH_VOLUME_TASKS.length;
  const task=AUTO_HIGH_VOLUME_TASKS[rotation],cursorKey=`storage_high_volume_cursor_v1430_${task.key}`;
  const requiredTables=[task.table,'app_meta',...(task.requires||[])];
  const existing=await existingTableSet(env,requiredTables);
  if(!requiredTables.every(name=>existing.has(name)))return {skipped:true,task:task.key,error:`MISSING_TABLE:${requiredTables.filter(name=>!existing.has(name)).join(',')}`};
  const cursorRow=await env.DB.prepare('SELECT value FROM app_meta WHERE key=?').bind(cursorKey).first();
  const cursor=Math.max(0,Math.floor(Number(cursorRow?.value||0)));
  const boundary=await env.DB.prepare(`SELECT id FROM ${task.table} WHERE id>? ORDER BY id LIMIT 1 OFFSET ?`)
    .bind(cursor,AUTO_HIGH_VOLUME_SCAN_BATCH-1).first();
  let endId=Number(boundary?.id||0),cycleComplete=false;
  if(!endId){
    const last=await env.DB.prepare(`SELECT MAX(id) id FROM ${task.table} WHERE id>?`).bind(cursor).first();
    endId=Number(last?.id||0);cycleComplete=true;
  }
  let deleted=0;
  if(endId>cursor){
    const result=await env.DB.prepare(`DELETE FROM ${task.table} WHERE id>? AND id<=? AND (${task.extraWhere}) AND created_at<datetime('now',?)`)
      .bind(cursor,endId,`-${task.retentionDays} days`).run();
    deleted=Number(result?.meta?.changes||0);
  }
  await env.DB.batch([
    env.DB.prepare(`INSERT INTO app_meta(key,value,updated_at) VALUES(?,?,CURRENT_TIMESTAMP)
      ON CONFLICT(key) DO UPDATE SET value=excluded.value,updated_at=CURRENT_TIMESTAMP`).bind(cursorKey,String(cycleComplete?0:endId)),
    env.DB.prepare(`INSERT INTO app_meta(key,value,updated_at) VALUES('storage_high_volume_rotation_v1430',?,CURRENT_TIMESTAMP)
      ON CONFLICT(key) DO UPDATE SET value=excluded.value,updated_at=CURRENT_TIMESTAMP`).bind(String((rotation+1)%AUTO_HIGH_VOLUME_TASKS.length))
  ]);
  return {skipped:false,task:task.key,scanned:endId>cursor?AUTO_HIGH_VOLUME_SCAN_BATCH:0,deleted,cycleComplete};
}
async function runLeasedHighVolumeLogMaintenance(env){
  const lease=await env.DB.prepare(`INSERT INTO app_meta(key,value,updated_at) VALUES('storage_high_volume_lease_v1800',?,CURRENT_TIMESTAMP)
    ON CONFLICT(key) DO UPDATE SET value=excluded.value,updated_at=CURRENT_TIMESTAMP
    WHERE app_meta.updated_at<datetime('now','-1 minute')`).bind(String(Date.now())).run();
  if(!Number(lease?.meta?.changes||0))return {skipped:true};
  return runHighVolumeLogMaintenance(env);
}
async function runMagicRewardReceiptMaintenance(env){
  const existing=await existingTableSet(env,['magic_crystal_reward_receipts']);
  if(!existing.has('magic_crystal_reward_receipts'))return {skipped:true};
  const result=await env.DB.prepare(`DELETE FROM magic_crystal_reward_receipts WHERE rowid IN (
    SELECT rowid FROM magic_crystal_reward_receipts INDEXED BY idx_magic_reward_receipts_cleanup_v1401
    WHERE status IN ('COMPLETED','FAILED','RETRYABLE','CANCELLED')
      AND updated_at<datetime('now','-1 day') ORDER BY status,updated_at LIMIT 10000
  )`).run();
  return {skipped:false,deleted:Number(result?.meta?.changes||0)};
}
async function runInventoryReceiptMaintenance(env){
  const existing=await existingTableSet(env,['inventory_use_receipts']);
  if(!existing.has('inventory_use_receipts'))return {skipped:true};
  const result=await env.DB.prepare(`DELETE FROM inventory_use_receipts WHERE rowid IN (
    SELECT rowid FROM inventory_use_receipts INDEXED BY idx_inventory_receipts_cleanup_v1739
    WHERE status IN ('COMPLETED','FAILED','CANCELLED')
      AND updated_at<datetime('now','-1 day') ORDER BY updated_at LIMIT 10000
  )`).run();
  return {skipped:false,deleted:Number(result?.meta?.changes||0)};
}
async function runBoundedStorageMaintenance(env){
  const lease=await env.DB.prepare(`INSERT INTO app_meta(key,value,updated_at) VALUES('storage_auto_maintenance_lease_v1400',?,CURRENT_TIMESTAMP)
    ON CONFLICT(key) DO UPDATE SET value=excluded.value,updated_at=CURRENT_TIMESTAMP
    WHERE app_meta.updated_at<datetime('now','-${AUTO_STORAGE_MAINTENANCE_LEASE_MINUTES} minutes')`).bind(String(Date.now())).run();
  if(!Number(lease?.meta?.changes||0))return {skipped:true};
  const cursorRow=await env.DB.prepare("SELECT value FROM app_meta WHERE key='storage_auto_maintenance_cursor_v1400'").first();
  let cursor=Math.max(0,Math.floor(Number(cursorRow?.value||0)))%AUTO_STORAGE_MAINTENANCE_TASKS.length;
  // V1795: 1회 1태스크로는 41개를 도는 데 너무 오래 걸린다. 리스 1회당 여러 태스크를 처리한다.
  const runs=[];
  const taskCount=Math.max(1,Math.min(AUTO_STORAGE_MAINTENANCE_TASKS_PER_RUN,AUTO_STORAGE_MAINTENANCE_TASKS.length));
  for(let index=0;index<taskCount;index+=1){
    const task=AUTO_STORAGE_MAINTENANCE_TASKS[cursor];
    const requiredTables=[task.table,...(task.requires||[])];
    let changed=0,taskError='',skipped=false;
    try{
      const existing=await existingTableSet(env,requiredTables);
      if(requiredTables.every(name=>existing.has(name))){
        // V1803: 지울 행이 하나도 없을 때가 가장 비쌌다.
        //   DELETE ... WHERE id IN (SELECT id ... WHERE created_at<? ORDER BY id LIMIT ?)
        //   는 ORDER BY 가 id 라서 SQLite 가 created_at 인덱스를 버리고 PK 순서로 훑는다.
        //   조건에 맞는 행이 없으면 LIMIT 을 채우지 못해 테이블 전체를 스캔한다.
        //   실측: inventory_logs 365만 행 · 1회 12초 · 3시간 동안 D1 시간 2,479초를
        //   먹으면서 삭제한 행은 0. 그동안 로그인 등 다른 요청이 밀렸다.
        // 이제 ORDER BY 를 인덱스와 맞추고, 그 앞에 값싼 존재 확인을 한 번 둔다.
        // probe 는 정렬이 없어 인덱스 탐색 1회로 끝난다.
        let hasWork=true;
        if(task.probe){
          const found=await env.DB.prepare(task.probe).first();
          hasWork=Boolean(found);
        }
        if(hasWork){
          const result=await env.DB.prepare(task.sql).bind(AUTO_STORAGE_MAINTENANCE_BATCH).run();
          changed=Number(result?.meta?.changes||0);
        }else skipped=true;
      }else taskError=`MISSING_TABLE:${requiredTables.filter(name=>!existing.has(name)).join(',')}`;
    }catch(error){taskError=String(error?.message||error||'MAINTENANCE_FAILED').slice(0,300);console.warn(`bounded storage task failed: ${task.key}`,error)}
    runs.push({task:task.key,changed,skipped:skipped||undefined,error:taskError||undefined});
    cursor=(cursor+1)%AUTO_STORAGE_MAINTENANCE_TASKS.length;
  }
  const task={key:runs.map(run=>run.task).join(',')};
  const changed=runs.reduce((sum,run)=>sum+Number(run.changed||0),0);
  const taskError=runs.map(run=>run.error).filter(Boolean).join(' | ');
  await env.DB.prepare(`INSERT INTO app_meta(key,value,updated_at) VALUES('storage_auto_maintenance_cursor_v1400',?,CURRENT_TIMESTAMP)
    ON CONFLICT(key) DO UPDATE SET value=excluded.value,updated_at=CURRENT_TIMESTAMP`).bind(String(cursor)).run();
  let magicRewards=null;
  try{magicRewards=await runMagicRewardReceiptMaintenance(env)}catch(error){console.warn('magic reward receipt cleanup failed',error);magicRewards={error:String(error?.message||error).slice(0,300)}}
  let inventoryReceipts=null;
  try{inventoryReceipts=await runInventoryReceiptMaintenance(env)}catch(error){console.warn('inventory receipt cleanup failed',error);inventoryReceipts={error:String(error?.message||error).slice(0,300)}}
  return {skipped:false,task:task.key,changed,runs,error:taskError||undefined,magicRewards,inventoryReceipts};
}
export function scheduleBoundedStorageMaintenance(context,env,seed=''){
  // PostgreSQL uses different physical tuple/cleanup semantics. The legacy D1
  // jobs depend on SQLite rowid/PRAGMA behavior and must not run after cutover.
  if(env?.DB?.dialect==='postgres')return;
  if(autoMaintenanceHash(seed)%AUTO_STORAGE_MAINTENANCE_SAMPLE_MOD!==0)return;
  const job=(async()=>{
    try{await runLeasedHighVolumeLogMaintenance(env)}catch(error){console.warn('high volume storage cleanup failed',error)}
    try{await runBoundedStorageMaintenance(env)}catch(error){console.warn('bounded storage maintenance failed',error)}
  })();
  if(typeof context?.waitUntil==='function')context.waitUntil(job);
}

export async function handleStorageCleanup({request,env,path,requirePermission,writeAdminLog,readBody,json}){
  if(!String(path).startsWith('admin/storage-cleanup'))return null;
  const admin=await requirePermission(request,env,'USER_MANAGE');
  if(!admin||String(admin.role).toUpperCase()!=='OWNER')return json({error:'DB 정리 시스템은 OWNER만 사용할 수 있습니다.'},403);
  if(path==='admin/storage-cleanup/summary'&&request.method==='GET'){
    const [pages,userRow]=await Promise.all([databasePageInfo(env),env.DB.prepare("SELECT COUNT(*) count FROM users WHERE COALESCE(role,'USER')='USER'").first()]);
    return json({ok:true,pages,userCount:Number(userRow?.count||0),limits:{preview:MAX_PREVIEW,deleteBatch:MAX_DELETE_BATCH,receiptBatch:MAX_RECEIPT_BATCH,receiptTarget:MAX_RECEIPT_TARGET}});
  }
  if(path==='admin/storage-cleanup/preview'&&request.method==='POST'){
    const body=await readBody(request),criteria=cleanCriteria(body.criteria||body),result=await loadCandidates(env,criteria),candidates=result.candidates;
    return json({ok:true,criteria,candidates,excluded:result.excluded,estimate:{total:0,tables:{}},truncated:candidates.length>=criteria.limit});
  }
  if(path==='admin/storage-cleanup/delete'&&request.method==='POST'){
    const body=await readBody(request),criteria=cleanCriteria(body.criteria||{}),ids=[...new Set((Array.isArray(body.ids)?body.ids:[]).map(Number).filter(Number.isInteger))].slice(0,MAX_DELETE_BATCH);
    if(String(body.confirmation||'')!=='휴면계정삭제')return json({error:'확인 문구가 올바르지 않습니다.'},400);
    if(!ids.length)return json({error:'삭제할 계정을 선택하세요.'},400);
    criteria.limit=ids.length;const checked=await loadCandidates(env,criteria,ids),valid=checked.candidates,validIds=valid.map(x=>x.id),blocked=ids.filter(id=>!validIds.includes(id));
    if(blocked.length)return json({error:'미리보기 이후 조건이 달라진 계정이 있어 삭제를 중단했습니다.',blocked},409);
    const beforePages=await databasePageInfo(env),changes=await deleteUsers(env,validIds),afterPages=await databasePageInfo(env);
    try{await writeAdminLog(env,admin,'DORMANT_USER_PURGE','USER',validIds.join(','),valid,{criteria,changes,beforePages,afterPages})}catch(e){console.error('storage cleanup admin log failed',e)}
    return json({ok:true,deletedUsers:Number(changes.users||0),ids:validIds,changes,beforePages,afterPages});
  }
  if(path==='admin/storage-cleanup/safe/preview'&&request.method==='POST'){
    const body=await readBody(request),options=cleanSafeCleanupOptions(body);
    const [logs,sessions]=await Promise.all([safeLogCleanupBatch(env,options,false),expiredSessionPreview(env,options)]);
    return json({ok:true,options,logs,sessions,protectedTables:['users','user_cards','cnine_user_inventory','user_pack_pity','pve_decks','pvp_decks','pvp_profiles','pve_rift_runs','user_messages','attendance_logs']});
  }
  if(path==='admin/storage-cleanup/safe/run'&&request.method==='POST'){
    const body=await readBody(request);if(String(body.confirmation||'')!=='안전정리')return json({error:'확인 문구가 올바르지 않습니다.'},400);
    const options=cleanSafeCleanupOptions(body),bulkRun=bool(body.bulkRun,false);
    const beforePages=bulkRun?null:await databasePageInfo(env);
    const logs=await safeLogCleanupBatch(env,options,true),sessions=await deleteExpiredSessionsBatch(env,options);
    const afterPages=bulkRun?null:await databasePageInfo(env);
    try{await writeAdminLog(env,admin,'SAFE_LOG_PURGE','TABLE',options.table,null,{options,logs,sessions,bulkRun,runId:String(body.runId||'').slice(0,80),beforePages,afterPages,protectedUserData:true})}catch(e){console.error('safe storage cleanup admin log failed',e)}
    return json({ok:true,options,logs,sessions,beforePages,afterPages});
  }
  if(path==='admin/storage-cleanup/captain/preview'&&request.method==='POST'){
    const body=await readBody(request),preview=await captainCleanupPreview(env,body);
    return json({ok:true,...preview});
  }
  if(path==='admin/storage-cleanup/captain/run'&&request.method==='POST'){
    const body=await readBody(request);if(String(body.confirmation||'')!=='대장전정리')return json({error:'확인 문구가 올바르지 않습니다.'},400);
    const bulkRun=bool(body.bulkRun,false),finalize=bool(body.finalize,false),beforePages=bulkRun?null:await databasePageInfo(env),result=await deleteCaptainCleanupBatch(env,body),afterPages=bulkRun?null:await databasePageInfo(env);
    // v1281: 5천건 실행은 수십 회의 내부 배치로 나뉜다. 배치마다 admin_logs를 쓰지 않고 완료 시 한 번만 기록한다.
    if(!bulkRun||finalize){
      const summary=body.summary&&typeof body.summary==='object'?{
        historyDeleted:clampInt(body.summary.historyDeleted,0,0,CAPTAIN_CLEANUP_MAX_TARGET+CAPTAIN_CLEANUP_BATCH),
        receiptsDeleted:clampInt(body.summary.receiptsDeleted,0,0,CAPTAIN_CLEANUP_MAX_TARGET+CAPTAIN_CLEANUP_BATCH),
        batches:clampInt(body.summary.batches,0,0,1000)
      }:null;
      try{await writeAdminLog(env,admin,'CAPTAIN_V3_DETAIL_PURGE','TABLE','captain_match_history_v3,captain_match_receipts_v3',null,{options:result.options,deleted:finalize&&summary?summary:result.deleted,bulkRun,finalize,runId:String(body.runId||'').slice(0,80),beforePages,afterPages,activeRoundsProtected:true,pendingReceiptsProtected:true,cursorScan:true})}catch(e){console.error('captain v3 cleanup admin log failed',e)}
    }
    return json({ok:true,...result,beforePages,afterPages});
  }
  if(path==='admin/storage-cleanup/receipts/preview'&&request.method==='POST'){
    const body=await readBody(request),preview=await receiptAggregatePreview(env,body);return json({ok:true,...preview});
  }
  if(path==='admin/storage-cleanup/receipts/delete'&&request.method==='POST'){
    const body=await readBody(request);if(String(body.confirmation||'')!=='영수증정리')return json({error:'확인 문구가 올바르지 않습니다.'},400);
    const bulkRun=bool(body.bulkRun,false),finalize=bool(body.finalize,false);
    if(finalize){
      const summary=body.summary&&typeof body.summary==='object'?{
        deleted:clampInt(body.summary.deleted,0,0,MAX_RECEIPT_TARGET+MAX_RECEIPT_BATCH),
        assertionsDeleted:clampInt(body.summary.assertionsDeleted,0,0,MAX_RECEIPT_TARGET*10),
        batches:clampInt(body.summary.batches,0,0,1000)
      }:null;
      if(summary){try{await writeAdminLog(env,admin,'DRAW_RECEIPT_PURGE','TABLE',RECEIPT_TABLES.has(body.table)?body.table:'draw_request_receipts',null,{retentionDays:clampInt(body.retentionDays,14,1,3650),deleted:summary.deleted,assertionsDeleted:summary.assertionsDeleted,batches:summary.batches,bulkRun:true,finalize:true,runId:String(body.runId||'').slice(0,80)})}catch(e){console.error('receipt cleanup final audit failed',e)}}
      return json({ok:true,finalized:true,summary});
    }
    const beforePages=bulkRun?null:await databasePageInfo(env),result=await deleteReceiptBatch(env,body),afterPages=bulkRun?null:await databasePageInfo(env);
    if(!bulkRun){try{await writeAdminLog(env,admin,'DRAW_RECEIPT_PURGE','TABLE',result.table,null,{retentionDays:result.retentionDays,deleted:result.deleted,assertionsDeleted:result.assertionsDeleted,metrics:result.metrics,bulkRun:false,runId:String(body.runId||'').slice(0,80),beforePages,afterPages})}catch(e){console.error('receipt cleanup admin log failed',e)}}
    return json({ok:true,...result,beforePages,afterPages});
  }
  return json({error:'지원하지 않는 DB 정리 요청입니다.'},404);
}
