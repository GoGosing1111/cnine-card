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
    dormantDays:clampInt(raw.dormantDays,90,30,3650),
    maxCards:clampInt(raw.maxCards,10,0,100000),
    maxDraws:clampInt(raw.maxDraws,20,0,10000000),
    maxCoin:clampInt(raw.maxCoin,5000,0,1000000000),
    maxShards:clampInt(raw.maxShards,0,0,1000000000),
    maxInventory:clampInt(raw.maxInventory,0,0,1000000000),
    unverifiedOnly:bool(raw.unverifiedOnly,true),
    excludeHighGrade:bool(raw.excludeHighGrade,true),
    excludeActiveCaptain:bool(raw.excludeActiveCaptain,true),
    limit:clampInt(raw.limit,200,1,MAX_PREVIEW)
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
  try{
    const [pc,ps,fc]=await Promise.all([
      env.DB.prepare('PRAGMA page_count').first(),env.DB.prepare('PRAGMA page_size').first(),env.DB.prepare('PRAGMA freelist_count').first()
    ]);
    const firstNumber=o=>Number(Object.values(o||{})[0]||0);
    const pageCount=firstNumber(pc),pageSize=firstNumber(ps),freePages=firstNumber(fc);
    return {pageCount,pageSize,freePages,sizeBytes:pageCount*pageSize,reusableBytes:freePages*pageSize};
  }catch{return {pageCount:null,pageSize:null,freePages:null,sizeBytes:null,reusableBytes:null}}
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
  binds.push(Array.isArray(onlyIds)&&onlyIds.length?onlyIds.length:MAX_BASE_SCAN);
  const sql=`SELECT u.id,u.nickname,u.coin,COALESCE(u.card_shards,0) card_shards,u.status,u.created_at,u.last_login_at,
    COALESCE(u.last_login_at,u.created_at) activity_at
    FROM users u
    WHERE COALESCE(u.role,'USER')='USER'
      AND datetime(COALESCE(u.last_login_at,u.created_at))<=datetime('now',?)
      AND NOT EXISTS (SELECT 1 FROM sessions sx WHERE sx.user_id=u.id AND sx.expires_at>datetime('now'))${idClause}
    ORDER BY datetime(COALESCE(u.last_login_at,u.created_at)) ASC,u.id ASC LIMIT ?`;
  return (await env.DB.prepare(sql).bind(...binds).all()).results||[];
}
async function hydrateCandidateStats(env,baseRows,criteria){
  if(!baseRows.length)return [];
  const ids=baseRows.map(x=>Number(x.id)),tables=await existingTableSet(env,['wago_verifications','user_cards','draw_logs','cnine_user_inventory','captain_registrations','captain_team_members','captain_rounds','captain_teams','raid_participants','raid_instances']);
  const verified=new Set(),cardMap=new Map(),drawMap=new Map(),inventoryMap=new Map(),captainSet=new Set(),raidSet=new Set();
  if(tables.has('wago_verifications')){
    for(let i=0;i<ids.length;i+=50){const chunk=ids.slice(i,i+50),rows=await env.DB.prepare(`SELECT user_id,status FROM wago_verifications WHERE user_id IN (${placeholders(chunk.length)})`).bind(...chunk).all();for(const r of rows.results||[])if(String(r.status).toUpperCase()==='VERIFIED')verified.add(Number(r.user_id));}
  }
  if(tables.has('user_cards')){
    for(let i=0;i<ids.length;i+=50){const chunk=ids.slice(i,i+50),rows=await env.DB.prepare(`SELECT uc.user_id,COUNT(*) card_count,COALESCE(SUM(uc.quantity),0) card_quantity,
      COALESCE(SUM(CASE WHEN UPPER(COALESCE(c.rarity,'')) IN ('MA','LIMITED','PRESTIGE','FUR') AND COALESCE(uc.quantity,0)>0 THEN 1 ELSE 0 END),0) high_grade_count
      FROM user_cards uc LEFT JOIN cards c ON c.id=uc.card_id WHERE COALESCE(uc.quantity,0)>0 AND uc.user_id IN (${placeholders(chunk.length)}) GROUP BY uc.user_id`).bind(...chunk).all();for(const r of rows.results||[])cardMap.set(Number(r.user_id),r);}
  }
  if(tables.has('draw_logs'))drawMap.clear(),(await chunkedGroupedCount(env,'draw_logs','user_id',ids)).forEach((v,k)=>drawMap.set(k,v));
  if(tables.has('cnine_user_inventory')){
    for(let i=0;i<ids.length;i+=50){const chunk=ids.slice(i,i+50),rows=await env.DB.prepare(`SELECT user_id,COALESCE(SUM(quantity),0) total FROM cnine_user_inventory WHERE user_id IN (${placeholders(chunk.length)}) GROUP BY user_id`).bind(...chunk).all();for(const r of rows.results||[])inventoryMap.set(Number(r.user_id),Number(r.total||0));}
  }
  if(criteria.excludeActiveCaptain&&tables.has('captain_rounds')){
    for(let i=0;i<ids.length;i+=50){
      const chunk=ids.slice(i,i+50);
      if(tables.has('captain_registrations')){
        const rows=await env.DB.prepare(`SELECT DISTINCT r.user_id FROM captain_registrations r JOIN captain_rounds cr ON cr.round_key=r.week_key WHERE cr.status='ACTIVE' AND r.status IN ('WAITING','ASSIGNED') AND r.user_id IN (${placeholders(chunk.length)})`).bind(...chunk).all();
        for(const r of rows.results||[])captainSet.add(Number(r.user_id));
      }
      if(tables.has('captain_team_members')&&tables.has('captain_teams')){
        const rows=await env.DB.prepare(`SELECT DISTINCT m.user_id FROM captain_team_members m JOIN captain_teams t ON t.id=m.team_id JOIN captain_rounds cr ON cr.round_key=t.week_key WHERE cr.status='ACTIVE' AND t.status='ACTIVE' AND m.user_id IN (${placeholders(chunk.length)})`).bind(...chunk).all();
        for(const r of rows.results||[])captainSet.add(Number(r.user_id));
      }
    }
  }
  if(tables.has('raid_participants')&&tables.has('raid_instances')){
    for(let i=0;i<ids.length;i+=50){const chunk=ids.slice(i,i+50),rows=await env.DB.prepare(`SELECT DISTINCT p.user_id FROM raid_participants p JOIN raid_instances ri ON ri.id=p.instance_id WHERE COALESCE(p.is_active,1)=1 AND ri.status IN ('WAITING','ACTIVE','OPEN') AND p.user_id IN (${placeholders(chunk.length)})`).bind(...chunk).all();for(const r of rows.results||[])raidSet.add(Number(r.user_id));}
  }
  return baseRows.map(row=>{
    const id=Number(row.id),cs=cardMap.get(id)||{};
    return {...row,id,coin:Number(row.coin||0),card_shards:Number(row.card_shards||0),verified:verified.has(id),card_count:Number(cs.card_count||0),card_quantity:Number(cs.card_quantity||0),high_grade_count:Number(cs.high_grade_count||0),draw_count:Number(drawMap.get(id)||0),inventory_count:Number(inventoryMap.get(id)||0),active_captain:captainSet.has(id),active_raid:raidSet.has(id)};
  });
}
function isCandidate(row,c){
  if(c.unverifiedOnly&&row.verified)return false;
  if(c.excludeHighGrade&&row.high_grade_count>0)return false;
  if(c.excludeActiveCaptain&&row.active_captain)return false;
  if(row.active_raid)return false;
  return row.card_count<=c.maxCards&&row.draw_count<=c.maxDraws&&row.coin<=c.maxCoin&&row.card_shards<=c.maxShards&&row.inventory_count<=c.maxInventory;
}
async function loadCandidates(env,criteria,onlyIds=null){
  const base=await baseDormantUsers(env,criteria,onlyIds),hydrated=await hydrateCandidateStats(env,base,criteria);
  return hydrated.filter(x=>isCandidate(x,criteria)).slice(0,criteria.limit);
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
    const body=await readBody(request),criteria=cleanCriteria(body.criteria||body),candidates=await loadCandidates(env,criteria),estimate=await estimateRows(env,candidates.map(x=>x.id));
    return json({ok:true,criteria,candidates,estimate,truncated:candidates.length>=criteria.limit});
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
