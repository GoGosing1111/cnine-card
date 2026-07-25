const MAX_PREVIEW = 200;
const MAX_BASE_SCAN = 1200;
const MAX_DELETE_BATCH = 10;
const MAX_RECEIPT_BATCH = 100;

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
  ['draw_grant_assertions',['user_id']]
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
async function baseDormantUsers(env,criteria,onlyIds=null){
  const modifier=`-${criteria.dormantDays} days`,binds=[modifier];
  let idClause='';
  if(Array.isArray(onlyIds)&&onlyIds.length){idClause=` AND u.id IN (${placeholders(onlyIds.length)})`;binds.push(...onlyIds)}
  const limit=Array.isArray(onlyIds)&&onlyIds.length?onlyIds.length:criteria.limit;
  binds.push(limit);
  const sql=`SELECT u.id,u.nickname,u.coin,COALESCE(u.card_shards,0) card_shards,u.status,u.created_at,u.last_login_at,
    COALESCE(u.last_login_at,u.created_at) activity_at
    FROM users u
    WHERE COALESCE(u.role,'USER')='USER'
      AND datetime(COALESCE(u.last_login_at,u.created_at))<=datetime('now',?)${idClause}
    ORDER BY datetime(COALESCE(u.last_login_at,u.created_at)) ASC,u.id ASC LIMIT ?`;
  return (await env.DB.prepare(sql).bind(...binds).all()).results||[];
}
async function hydrateCandidateStats(env,baseRows){
  if(!baseRows.length)return [];
  // 후보 필터에는 통계를 사용하지 않는다. 목록 표시에 필요한 카드 종류 수만
  // 최대 200명 단위로 조회해 대형 draw/log 테이블 스캔을 피한다.
  const ids=baseRows.map(x=>Number(x.id)),tables=await existingTableSet(env,['user_cards']);
  const cardMap=new Map();
  if(tables.has('user_cards')){
    for(let i=0;i<ids.length;i+=50){
      const chunk=ids.slice(i,i+50),rows=await env.DB.prepare(`SELECT user_id,COUNT(*) card_count,COALESCE(SUM(quantity),0) card_quantity FROM user_cards WHERE COALESCE(quantity,0)>0 AND user_id IN (${placeholders(chunk.length)}) GROUP BY user_id`).bind(...chunk).all();
      for(const row of rows.results||[])cardMap.set(Number(row.user_id),row);
    }
  }
  return baseRows.map(row=>{
    const id=Number(row.id),cards=cardMap.get(id)||{};
    return {...row,id,coin:Number(row.coin||0),card_shards:Number(row.card_shards||0),card_count:Number(cards.card_count||0),card_quantity:Number(cards.card_quantity||0)};
  });
}
async function loadCandidates(env,criteria,onlyIds=null){
  const base=await baseDormantUsers(env,criteria,onlyIds);
  return hydrateCandidateStats(env,base);
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
async function receiptPreview(env,{table='draw_request_receipts',retentionDays=14,batchSize=25}={}){
  if(!RECEIPT_TABLES.has(table))table='draw_request_receipts';
  retentionDays=clampInt(retentionDays,14,1,3650);batchSize=clampInt(batchSize,25,1,MAX_RECEIPT_BATCH);
  const existing=await existingTableSet(env,[table]);if(!existing.has(table))return {table,retentionDays,batchSize,rows:[],estimatedBytes:0};
  const rows=(await env.DB.prepare(`SELECT request_id,status,created_at,LENGTH(COALESCE(response_json,'')) response_bytes FROM ${table}
    WHERE status IN ('COMPLETED','APPLIED','FAILED') AND created_at<datetime('now',?)
    ORDER BY rowid ASC LIMIT ?`).bind(`-${retentionDays} days`,batchSize).all()).results||[];
  return {table,retentionDays,batchSize,rows,estimatedBytes:rows.reduce((s,r)=>s+Number(r.response_bytes||0),0)};
}
async function deleteReceiptBatch(env,opts){
  const preview=await receiptPreview(env,opts),ids=preview.rows.map(x=>String(x.request_id));if(!ids.length)return {...preview,deleted:0,assertionsDeleted:0};
  const existing=await existingTableSet(env,[preview.table,'draw_grant_assertions']),statements=[];
  if(existing.has('draw_grant_assertions'))statements.push(env.DB.prepare(`DELETE FROM draw_grant_assertions WHERE request_id IN (${placeholders(ids.length)})`).bind(...ids));
  statements.push(env.DB.prepare(`DELETE FROM ${preview.table} WHERE request_id IN (${placeholders(ids.length)}) AND status IN ('COMPLETED','APPLIED','FAILED')`).bind(...ids));
  const result=await env.DB.batch(statements),assertionsDeleted=statements.length===2?Number(result[0]?.meta?.changes||0):0,deleted=Number(result[result.length-1]?.meta?.changes||0);
  return {...preview,deleted,assertionsDeleted};
}

export async function handleStorageCleanup({request,env,path,requirePermission,writeAdminLog,readBody,json}){
  if(!String(path).startsWith('admin/storage-cleanup'))return null;
  const admin=await requirePermission(request,env,'USER_MANAGE');
  if(!admin||String(admin.role).toUpperCase()!=='OWNER')return json({error:'DB 정리 시스템은 OWNER만 사용할 수 있습니다.'},403);
  if(path==='admin/storage-cleanup/summary'&&request.method==='GET'){
    const [pages,userRow]=await Promise.all([databasePageInfo(env),env.DB.prepare("SELECT COUNT(*) count FROM users WHERE COALESCE(role,'USER')='USER'").first()]);
    return json({ok:true,pages,userCount:Number(userRow?.count||0),limits:{preview:MAX_PREVIEW,deleteBatch:MAX_DELETE_BATCH,receiptBatch:MAX_RECEIPT_BATCH}});
  }
  if(path==='admin/storage-cleanup/preview'&&request.method==='POST'){
    const body=await readBody(request),criteria=cleanCriteria(body.criteria||body),candidates=await loadCandidates(env,criteria);
    return json({ok:true,criteria,candidates,estimate:{total:0,tables:{}},truncated:candidates.length>=criteria.limit});
  }
  if(path==='admin/storage-cleanup/delete'&&request.method==='POST'){
    const body=await readBody(request),criteria=cleanCriteria(body.criteria||{}),ids=[...new Set((Array.isArray(body.ids)?body.ids:[]).map(Number).filter(Number.isInteger))].slice(0,MAX_DELETE_BATCH);
    if(String(body.confirmation||'')!=='휴면계정삭제')return json({error:'확인 문구가 올바르지 않습니다.'},400);
    if(!ids.length)return json({error:'삭제할 계정을 선택하세요.'},400);
    criteria.limit=ids.length;const valid=await loadCandidates(env,criteria,ids),validIds=valid.map(x=>x.id),blocked=ids.filter(id=>!validIds.includes(id));
    if(blocked.length)return json({error:'미리보기 이후 조건이 달라진 계정이 있어 삭제를 중단했습니다.',blocked},409);
    const beforePages=await databasePageInfo(env),changes=await deleteUsers(env,validIds),afterPages=await databasePageInfo(env);
    try{await writeAdminLog(env,admin,'DORMANT_USER_PURGE','USER',validIds.join(','),valid,{criteria,changes,beforePages,afterPages})}catch(e){console.error('storage cleanup admin log failed',e)}
    return json({ok:true,deletedUsers:Number(changes.users||0),ids:validIds,changes,beforePages,afterPages});
  }
  if(path==='admin/storage-cleanup/receipts/preview'&&request.method==='POST'){
    const body=await readBody(request),preview=await receiptPreview(env,body);return json({ok:true,...preview});
  }
  if(path==='admin/storage-cleanup/receipts/delete'&&request.method==='POST'){
    const body=await readBody(request);if(String(body.confirmation||'')!=='영수증정리')return json({error:'확인 문구가 올바르지 않습니다.'},400);
    const beforePages=await databasePageInfo(env),result=await deleteReceiptBatch(env,body),afterPages=await databasePageInfo(env);
    try{await writeAdminLog(env,admin,'DRAW_RECEIPT_PURGE','TABLE',result.table,null,{retentionDays:result.retentionDays,deleted:result.deleted,assertionsDeleted:result.assertionsDeleted,estimatedBytes:result.estimatedBytes,beforePages,afterPages})}catch(e){console.error('receipt cleanup admin log failed',e)}
    return json({ok:true,...result,beforePages,afterPages});
  }
  return json({error:'지원하지 않는 DB 정리 요청입니다.'},404);
}
