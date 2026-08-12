const POOL_TABLE='unified_drop_pools_v1667';
const ENTRY_TABLE='unified_drop_entries_v1667';
const BINDING_TABLE='unified_drop_bindings_v1667';
const RECEIPT_TABLE='unified_drop_receipts_v1667';
const LEDGER_TABLE='unified_drop_ledger_v1667';
const REWARD_TYPES=new Set(['COIN','CARD_SHARDS','MAGIC_CRYSTAL','MASTER_STAR','INVENTORY_ITEM']);
const ROLL_MODES=new Set(['INDEPENDENT','WEIGHTED_ONE']);
const SCRAPYARD_DIFFICULTIES=[
  ['OUTER','SCRAPYARD_PARTS_OUTER','폐차장 · 외곽 부품'],
  ['CORE','SCRAPYARD_PARTS_CORE','폐차장 · 압축 설비 부품'],
  ['FURNACE','SCRAPYARD_PARTS_FURNACE','폐차장 · 용광로 부품']
];
let foundationPromise=null;
const bindingCache=new Map();
const entryCache=new Map();

export function invalidateUnifiedDropPoolCache(){bindingCache.clear();entryCache.clear()}

const int=(value,min=0,max=Number.MAX_SAFE_INTEGER,fallback=min)=>{const n=Math.floor(Number(value));return Number.isFinite(n)?Math.max(min,Math.min(max,n)):fallback};
const num=(value,min=0,max=100,fallback=min)=>{const n=Number(value);return Number.isFinite(n)?Math.max(min,Math.min(max,n)):fallback};
const text=(value,max=160)=>String(value??'').trim().slice(0,max);
const code=(value,max=80)=>text(value,max).toUpperCase().replace(/[^A-Z0-9_*:-]/g,'_').replace(/_+/g,'_');
const bool=value=>value===true||value===1||String(value)==='1';
const parse=(value,fallback={})=>{try{return JSON.parse(value||'{}')}catch{return fallback}};
const randomUnit=()=>{const values=new Uint32Array(1);crypto.getRandomValues(values);return values[0]/4294967296};
const seededRandom=seed=>{let state=2166136261;for(const ch of String(seed)){state^=ch.charCodeAt(0);state=Math.imul(state,16777619)>>>0}return()=>{state+=0x6D2B79F5;let value=state;value=Math.imul(value^value>>>15,value|1);value^=value+Math.imul(value^value>>>7,value|61);return((value^value>>>14)>>>0)/4294967296}};
const quantity=(entry,random=randomUnit)=>{const min=int(entry.min_quantity,1,100000000,1),max=int(entry.max_quantity,min,100000000,min);return min+Math.floor(random()*(max-min+1))};

const FOUNDATION_SQL=[
  `CREATE TABLE IF NOT EXISTS ${POOL_TABLE}(id INTEGER PRIMARY KEY AUTOINCREMENT,code TEXT NOT NULL UNIQUE,name TEXT NOT NULL,description TEXT NOT NULL DEFAULT '',roll_mode TEXT NOT NULL DEFAULT 'INDEPENDENT',rolls INTEGER NOT NULL DEFAULT 1,no_drop_weight REAL NOT NULL DEFAULT 0,is_enabled INTEGER NOT NULL DEFAULT 1,owner_test_only INTEGER NOT NULL DEFAULT 0,config_version INTEGER NOT NULL DEFAULT 1,created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP)`,
  `CREATE TABLE IF NOT EXISTS ${ENTRY_TABLE}(id INTEGER PRIMARY KEY AUTOINCREMENT,pool_id INTEGER NOT NULL,reward_type TEXT NOT NULL,reward_ref TEXT NOT NULL DEFAULT '',reward_name TEXT NOT NULL DEFAULT '',chance_percent REAL NOT NULL DEFAULT 0,weight REAL NOT NULL DEFAULT 0,min_quantity INTEGER NOT NULL DEFAULT 1,max_quantity INTEGER NOT NULL DEFAULT 1,daily_limit INTEGER NOT NULL DEFAULT 0,conditions_json TEXT NOT NULL DEFAULT '{}',sort_order INTEGER NOT NULL DEFAULT 0,is_enabled INTEGER NOT NULL DEFAULT 1,created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,UNIQUE(pool_id,reward_type,reward_ref,sort_order))`,
  `CREATE TABLE IF NOT EXISTS ${BINDING_TABLE}(id INTEGER PRIMARY KEY AUTOINCREMENT,source_type TEXT NOT NULL,source_id TEXT NOT NULL DEFAULT '*',trigger_type TEXT NOT NULL DEFAULT 'WIN',pool_id INTEGER NOT NULL,priority INTEGER NOT NULL DEFAULT 0,is_enabled INTEGER NOT NULL DEFAULT 1,created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,UNIQUE(source_type,source_id,trigger_type,pool_id))`,
  `CREATE TABLE IF NOT EXISTS ${RECEIPT_TABLE}(request_id TEXT NOT NULL,user_id INTEGER NOT NULL,source_type TEXT NOT NULL,source_id TEXT NOT NULL DEFAULT '*',trigger_type TEXT NOT NULL DEFAULT 'WIN',status TEXT NOT NULL DEFAULT 'PENDING',result_json TEXT,error_message TEXT,created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,PRIMARY KEY(request_id,user_id))`,
  `CREATE TABLE IF NOT EXISTS ${LEDGER_TABLE}(id INTEGER PRIMARY KEY AUTOINCREMENT,request_id TEXT NOT NULL,user_id INTEGER NOT NULL,pool_id INTEGER NOT NULL,entry_id INTEGER NOT NULL,source_type TEXT NOT NULL,source_id TEXT NOT NULL DEFAULT '*',reward_type TEXT NOT NULL,reward_ref TEXT NOT NULL DEFAULT '',quantity INTEGER NOT NULL,balance_after INTEGER,created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP)`,
  `CREATE INDEX IF NOT EXISTS idx_unified_drop_entries_pool_v1667 ON ${ENTRY_TABLE}(pool_id,is_enabled,sort_order,id)`,
  `CREATE INDEX IF NOT EXISTS idx_unified_drop_bindings_source_v1667 ON ${BINDING_TABLE}(source_type,source_id,trigger_type,is_enabled,priority)`,
  `CREATE INDEX IF NOT EXISTS idx_unified_drop_receipts_user_v1667 ON ${RECEIPT_TABLE}(user_id,created_at DESC)`,
  `CREATE INDEX IF NOT EXISTS idx_unified_drop_ledger_daily_v1667 ON ${LEDGER_TABLE}(user_id,entry_id,created_at DESC)`
];

async function ensureScrapyardDifficultyPools(env){
  const marker=await env.DB.prepare("SELECT value FROM app_meta WHERE key='safe_runtime_upgrade_v1682_scrapyard_difficulty_drop_pools'").first();
  if(marker?.value==='1')return;
  const source=await env.DB.prepare(`SELECT * FROM ${POOL_TABLE} WHERE code='SCRAPYARD_PARTS'`).first();
  for(const [difficulty,poolCode,poolName] of SCRAPYARD_DIFFICULTIES){
    await env.DB.prepare(`INSERT OR IGNORE INTO ${POOL_TABLE}(code,name,description,roll_mode,rolls,no_drop_weight,is_enabled,owner_test_only,config_version) VALUES(?,?,?,'WEIGHTED_ONE',1,?,1,0,1)`).bind(poolCode,poolName,`${difficulty} 난이도 완주 시 차량 부품을 한 번 판정합니다.`,Number(source?.no_drop_weight??50)).run();
    const target=await env.DB.prepare(`SELECT id FROM ${POOL_TABLE} WHERE code=?`).bind(poolCode).first();
    if(!target?.id)continue;
    if(source?.id)await env.DB.prepare(`INSERT OR IGNORE INTO ${ENTRY_TABLE}(pool_id,reward_type,reward_ref,reward_name,chance_percent,weight,min_quantity,max_quantity,daily_limit,conditions_json,sort_order,is_enabled) SELECT ?,reward_type,reward_ref,reward_name,chance_percent,weight,min_quantity,max_quantity,daily_limit,conditions_json,sort_order,is_enabled FROM ${ENTRY_TABLE} WHERE pool_id=?`).bind(target.id,source.id).run();
    else await env.DB.batch([
      env.DB.prepare(`INSERT OR IGNORE INTO ${ENTRY_TABLE}(pool_id,reward_type,reward_ref,reward_name,weight,min_quantity,max_quantity,sort_order,is_enabled) VALUES(?,'INVENTORY_ITEM','VEHICLE_PART_TIRE','고성능 타이어',60,1,2,10,1)`).bind(target.id),
      env.DB.prepare(`INSERT OR IGNORE INTO ${ENTRY_TABLE}(pool_id,reward_type,reward_ref,reward_name,weight,min_quantity,max_quantity,sort_order,is_enabled) VALUES(?,'INVENTORY_ITEM','VEHICLE_PART_FRAME','강화 차체 프레임',28,1,1,20,1)`).bind(target.id),
      env.DB.prepare(`INSERT OR IGNORE INTO ${ENTRY_TABLE}(pool_id,reward_type,reward_ref,reward_name,weight,min_quantity,max_quantity,sort_order,is_enabled) VALUES(?,'INVENTORY_ITEM','VEHICLE_PART_ENGINE','고출력 엔진',12,1,1,30,1)`).bind(target.id)
    ]);
    await env.DB.prepare(`INSERT OR IGNORE INTO ${BINDING_TABLE}(source_type,source_id,trigger_type,pool_id,priority,is_enabled) VALUES('SCRAPYARD',?,'CLEAR',?,100,1)`).bind(difficulty,target.id).run();
  }
  await env.DB.batch([
    env.DB.prepare(`UPDATE ${BINDING_TABLE} SET is_enabled=0 WHERE source_type='SCRAPYARD' AND source_id='*'`),
    env.DB.prepare(`UPDATE ${POOL_TABLE} SET is_enabled=0,updated_at=CURRENT_TIMESTAMP WHERE code='SCRAPYARD_PARTS'`),
    env.DB.prepare("INSERT OR REPLACE INTO app_meta(key,value,updated_at) VALUES('safe_runtime_upgrade_v1682_scrapyard_difficulty_drop_pools','1',CURRENT_TIMESTAMP)")
  ]);
  invalidateUnifiedDropPoolCache();
}

export async function ensureUnifiedDropPoolFoundation(env){
  if(foundationPromise)return foundationPromise;
  foundationPromise=(async()=>{
    for(const sql of FOUNDATION_SQL)await env.DB.prepare(sql).run();
    await env.DB.batch([
      env.DB.prepare(`INSERT OR IGNORE INTO inventory_items(code,name,subtitle,description,category,rarity,image_url,sort_order,is_active) VALUES('VEHICLE_PART_TIRE','고성능 타이어','SCRAPYARD PART','폐차장 던전에서 획득하는 차량 제작용 타이어입니다.','VEHICLE_PART','RARE','assets/ui/scrapyard/vehicle-part-tire-v1667.svg',166701,1)`),
      env.DB.prepare(`INSERT OR IGNORE INTO inventory_items(code,name,subtitle,description,category,rarity,image_url,sort_order,is_active) VALUES('VEHICLE_PART_FRAME','강화 차체 프레임','SCRAPYARD PART','폐차장 던전에서 획득하는 차량 제작용 차체 프레임입니다.','VEHICLE_PART','EPIC','assets/ui/scrapyard/vehicle-part-frame-v1667.svg',166702,1)`),
      env.DB.prepare(`INSERT OR IGNORE INTO inventory_items(code,name,subtitle,description,category,rarity,image_url,sort_order,is_active) VALUES('VEHICLE_PART_ENGINE','고출력 엔진','SCRAPYARD PART','폐차장 던전에서 획득하는 차량 제작용 엔진입니다.','VEHICLE_PART','LEGENDARY','assets/ui/scrapyard/vehicle-part-engine-v1667.svg',166703,1)`)
    ]);
    await ensureScrapyardDifficultyPools(env);
    const ticketMarker=await env.DB.prepare("SELECT value FROM app_meta WHERE key='safe_runtime_upgrade_v1680_scrapyard_ticket_drop_pool'").first();
    if(ticketMarker?.value!=='1'){
      await env.DB.batch([
        env.DB.prepare(`INSERT INTO inventory_items(code,name,subtitle,description,category,rarity,image_url,sort_order,is_active) VALUES('SCRAPYARD_ENTRY_TICKET','폐차장 출입 허가증','SALVAGE ACCESS PASS','망각의 기계 폐차장에 1회 입장할 수 있는 금속 출입 허가증입니다. 입장 시 1장이 차감됩니다.','ENTRY_TICKET','EPIC','assets/ui/scrapyard/scrapyard-entry-ticket-v1680.png',166700,1) ON CONFLICT(code) DO UPDATE SET name=excluded.name,subtitle=excluded.subtitle,description=excluded.description,category=excluded.category,rarity=excluded.rarity,image_url=excluded.image_url,sort_order=excluded.sort_order,is_active=1,updated_at=CURRENT_TIMESTAMP`),
        env.DB.prepare(`INSERT OR IGNORE INTO ${POOL_TABLE}(code,name,description,roll_mode,rolls,no_drop_weight,is_enabled,owner_test_only,config_version) VALUES('SCRAPYARD_ENTRY_TICKET_DROP','폐차장 출입 허가증','PVE 승리 시 폐차장 출입 허가증을 독립 판정합니다. CMS 통합 드랍률에서 확률·수량·일일 제한·연결 콘텐츠를 변경할 수 있습니다.','INDEPENDENT',1,0,1,0,1)`)
      ]);
      const ticketPool=await env.DB.prepare(`SELECT id FROM ${POOL_TABLE} WHERE code='SCRAPYARD_ENTRY_TICKET_DROP'`).first();
      if(ticketPool?.id)await env.DB.batch([
        env.DB.prepare(`INSERT OR IGNORE INTO ${ENTRY_TABLE}(pool_id,reward_type,reward_ref,reward_name,chance_percent,weight,min_quantity,max_quantity,daily_limit,sort_order,is_enabled) VALUES(?,'INVENTORY_ITEM','SCRAPYARD_ENTRY_TICKET','폐차장 출입 허가증',2,0,1,1,5,10,1)`).bind(ticketPool.id),
        env.DB.prepare(`INSERT OR IGNORE INTO ${BINDING_TABLE}(source_type,source_id,trigger_type,pool_id,priority,is_enabled) VALUES('PVE','*','WIN',?,80,1)`).bind(ticketPool.id),
        env.DB.prepare(`INSERT OR IGNORE INTO ${BINDING_TABLE}(source_type,source_id,trigger_type,pool_id,priority,is_enabled) VALUES('PVE_AUTO','*','WIN',?,80,1)`).bind(ticketPool.id)
      ]);
      await env.DB.prepare("INSERT OR REPLACE INTO app_meta(key,value,updated_at) VALUES('safe_runtime_upgrade_v1680_scrapyard_ticket_drop_pool','1',CURRENT_TIMESTAMP)").run();
    }
    await env.DB.prepare("INSERT OR REPLACE INTO app_meta(key,value,updated_at) VALUES('safe_runtime_upgrade_v1667_unified_drop_pool','1',CURRENT_TIMESTAMP)").run();
    return true;
  })().catch(error=>{foundationPromise=null;throw error});
  return foundationPromise;
}

function conditionMatches(entry,context={}){
  const rule=parse(entry.conditions_json,{}),difficulty=Number(context.difficulty||0);
  if(rule.minDifficulty!=null&&difficulty<Number(rule.minDifficulty))return false;
  if(rule.maxDifficulty!=null&&difficulty>Number(rule.maxDifficulty))return false;
  if(rule.boss!=null&&Boolean(context.boss)!==Boolean(rule.boss))return false;
  if(rule.minWave!=null&&Number(context.wave||0)<Number(rule.minWave))return false;
  if(rule.maxWave!=null&&Number(context.wave||0)>Number(rule.maxWave))return false;
  return true;
}

function rollPool(pool,entries,context={},random=randomUnit){
  const enabled=entries.filter(entry=>Number(entry.is_enabled)!==0&&conditionMatches(entry,context));
  const rewards=[];
  // 콘텐츠가 여러 웨이브를 한 서버 요청으로 정산할 수 있게 배수만 확장한다.
  // 폐차장 UI는 각 웨이브를 재생하지만 D1 영수증/지급은 한 번만 기록한다.
  const totalRolls=Math.min(100,int(pool.rolls,1,100,1)*int(context.rollsMultiplier,1,10,1));
  for(let roll=0;roll<totalRolls;roll++){
    if(String(pool.roll_mode)==='WEIGHTED_ONE'){
      const total=enabled.reduce((sum,entry)=>sum+Math.max(0,Number(entry.weight||0)),0)+Math.max(0,Number(pool.no_drop_weight||0));
      if(total<=0)continue;
      let point=random()*total,picked=null;
      for(const entry of enabled){point-=Math.max(0,Number(entry.weight||0));if(point<0){picked=entry;break}}
      if(picked)rewards.push({poolId:Number(pool.id),poolCode:pool.code,entryId:Number(picked.id),rewardType:picked.reward_type,rewardRef:picked.reward_ref,rewardName:picked.reward_name,quantity:quantity(picked,random),dailyLimit:Number(picked.daily_limit||0)});
      continue;
    }
    for(const entry of enabled)if(random()*100<Math.max(0,Math.min(100,Number(entry.chance_percent||0))))rewards.push({poolId:Number(pool.id),poolCode:pool.code,entryId:Number(entry.id),rewardType:entry.reward_type,rewardRef:entry.reward_ref,rewardName:entry.reward_name,quantity:quantity(entry,random),dailyLimit:Number(entry.daily_limit||0)});
  }
  return rewards;
}

async function applyDailyLimits(env,userId,rewards){
  const result=[];
  for(const reward of rewards){
    let amount=Math.max(0,Number(reward.quantity||0));
    if(reward.dailyLimit>0){
      const row=await env.DB.prepare(`SELECT COALESCE(SUM(quantity),0) amount FROM ${LEDGER_TABLE} WHERE user_id=? AND entry_id=? AND date(created_at,'+9 hours')=date('now','+9 hours')`).bind(userId,reward.entryId).first();
      amount=Math.min(amount,Math.max(0,reward.dailyLimit-Number(row?.amount||0)));
    }
    if(amount>0)result.push({...reward,quantity:amount});
  }
  return result;
}

function normalizedRewardType(reward){return reward.rewardType==='MASTER_STAR'?'INVENTORY_ITEM':reward.rewardType}
function normalizedRewardRef(reward){return reward.rewardType==='MASTER_STAR'?'MASTER_STAR':reward.rewardRef}

async function matchingPools(env,source,trigger,sid,role){
  const key=`${source}:${trigger}:${sid}:${String(role).toUpperCase()}`,now=Date.now(),cached=bindingCache.get(key);
  if(cached&&cached.expiresAt>now)return cached.pools;
  const rows=await env.DB.prepare(`SELECT b.priority,p.* FROM ${BINDING_TABLE} b JOIN ${POOL_TABLE} p ON p.id=b.pool_id WHERE b.source_type=? AND b.trigger_type=? AND b.is_enabled=1 AND p.is_enabled=1 AND (b.source_id=? OR b.source_id='*') ORDER BY CASE WHEN b.source_id=? THEN 0 ELSE 1 END,b.priority DESC,p.id`).bind(source,trigger,sid,sid).all();
  const pools=(rows.results||[]).filter(pool=>Number(pool.owner_test_only)===0||String(role).toUpperCase()==='OWNER');
  bindingCache.set(key,{pools,expiresAt:now+15000});
  return pools;
}

async function poolEntries(env,pool){
  const key=`${Number(pool.id)}:${Number(pool.config_version||0)}`,now=Date.now(),cached=entryCache.get(key);
  if(cached&&cached.expiresAt>now)return cached.entries;
  const rows=await env.DB.prepare(`SELECT * FROM ${ENTRY_TABLE} WHERE pool_id=? AND is_enabled=1 ORDER BY sort_order,id`).bind(pool.id).all(),entries=rows.results||[];
  entryCache.set(key,{entries,expiresAt:now+15000});
  return entries;
}

async function grantRewards(env,{userId,requestId,sourceType,sourceId,rewards}){
  const user=await env.DB.prepare('SELECT coin,card_shards,magic_crystals FROM users WHERE id=?').bind(userId).first();
  if(!user)throw new Error('드랍 보상을 지급할 유저를 찾을 수 없습니다.');
  const aggregates=new Map();
  for(const reward of rewards){const type=normalizedRewardType(reward),ref=normalizedRewardRef(reward),key=`${type}:${ref}`;aggregates.set(key,{type,ref,quantity:Number(aggregates.get(key)?.quantity||0)+Number(reward.quantity||0)})}
  let coin=Number(user.coin||0),shards=Number(user.card_shards||0),crystals=Number(user.magic_crystals||0);
  const inventoryRefs=[...new Set([...aggregates.values()].filter(x=>x.type==='INVENTORY_ITEM').map(x=>x.ref))];
  const inventoryBalances=new Map();
  for(const ref of inventoryRefs){const item=await env.DB.prepare('SELECT code,name,is_active FROM inventory_items WHERE code=?').bind(ref).first();if(!item||Number(item.is_active)===0)throw new Error(`지급 가능한 인벤토리 아이템이 아닙니다: ${ref}`);const row=await env.DB.prepare('SELECT quantity FROM cnine_user_inventory WHERE user_id=? AND item_code=?').bind(userId,ref).first();inventoryBalances.set(ref,Number(row?.quantity||0))}
  const statements=[];
  for(const item of aggregates.values()){
    if(item.type==='COIN'){coin+=item.quantity;statements.push(env.DB.prepare('UPDATE users SET coin=coin+? WHERE id=?').bind(item.quantity,userId),env.DB.prepare("INSERT INTO coin_logs(user_id,change_amount,balance_after,reason) VALUES(?,?,?,'UNIFIED_DROP_POOL')").bind(userId,item.quantity,coin));continue}
    if(item.type==='CARD_SHARDS'){shards+=item.quantity;statements.push(env.DB.prepare('UPDATE users SET card_shards=card_shards+? WHERE id=?').bind(item.quantity,userId),env.DB.prepare("INSERT INTO shard_logs(user_id,change_amount,balance_after,reason) VALUES(?,?,?,'UNIFIED_DROP_POOL')").bind(userId,item.quantity,shards));continue}
    if(item.type==='MAGIC_CRYSTAL'){crystals+=item.quantity;statements.push(env.DB.prepare('UPDATE users SET magic_crystals=magic_crystals+? WHERE id=?').bind(item.quantity,userId),env.DB.prepare("INSERT INTO magic_crystal_logs(user_id,change_amount,balance_after,reason,reference_type,reference_id) VALUES(?,?,?,'통합 드랍풀','UNIFIED_DROP',?)").bind(userId,item.quantity,crystals,requestId));continue}
    if(item.type==='INVENTORY_ITEM'){const after=Number(inventoryBalances.get(item.ref)||0)+item.quantity;inventoryBalances.set(item.ref,after);statements.push(env.DB.prepare(`INSERT INTO cnine_user_inventory(user_id,item_code,quantity,unseen_quantity,created_at,updated_at) VALUES(?,?,?,?,CURRENT_TIMESTAMP,CURRENT_TIMESTAMP) ON CONFLICT(user_id,item_code) DO UPDATE SET quantity=cnine_user_inventory.quantity+excluded.quantity,unseen_quantity=cnine_user_inventory.unseen_quantity+excluded.unseen_quantity,updated_at=CURRENT_TIMESTAMP`).bind(userId,item.ref,item.quantity,item.quantity),env.DB.prepare("INSERT INTO inventory_logs(user_id,item_code,change_amount,balance_after,reason,reference_type,reference_id) VALUES(?,?,?,?,?,'UNIFIED_DROP',?)").bind(userId,item.ref,item.quantity,after,`통합 드랍풀 · ${sourceType}`,requestId))}
  }
  for(const reward of rewards){const type=normalizedRewardType(reward),ref=normalizedRewardRef(reward),balance=type==='COIN'?coin:type==='CARD_SHARDS'?shards:type==='MAGIC_CRYSTAL'?crystals:inventoryBalances.get(ref);statements.push(env.DB.prepare(`INSERT INTO ${LEDGER_TABLE}(request_id,user_id,pool_id,entry_id,source_type,source_id,reward_type,reward_ref,quantity,balance_after) VALUES(?,?,?,?,?,?,?,?,?,?)`).bind(requestId,userId,reward.poolId,reward.entryId,sourceType,sourceId,reward.rewardType,reward.rewardRef,reward.quantity,balance??null))}
  return {statements,balances:{coin,cardShards:shards,magicCrystals:crystals,inventory:Object.fromEntries(inventoryBalances)}};
}

export async function resolveUnifiedDrops(env,{userId,requestId,sourceType,sourceId='*',triggerType='WIN',context={},role='USER'}={}){
  await ensureUnifiedDropPoolFoundation(env);
  const uid=int(userId,1),rid=text(requestId,120),source=code(sourceType),sid=text(sourceId||'*',120)||'*',trigger=code(triggerType);
  if(!uid||!rid||!source||!trigger)throw new Error('통합 드랍 판정 식별값이 부족합니다.');
  const pools=await matchingPools(env,source,trigger,sid,role);
  // 연결된 운영 풀이 없을 때는 영수증을 만들지 않는다. 일반 전투마다 빈 영수증이 쌓이는 것을 원천 차단한다.
  if(!pools.length)return {ok:true,requestId:rid,sourceType:source,sourceId:sid,triggerType:trigger,pools:[],rewards:[],balances:null,skipped:'NO_ACTIVE_BINDING'};
  const prior=await env.DB.prepare(`SELECT status,result_json,error_message FROM ${RECEIPT_TABLE} WHERE request_id=? AND user_id=?`).bind(rid,uid).first();
  if(prior?.status==='COMPLETED')return {...parse(prior.result_json,{rewards:[]}),replayed:true};
  if(prior?.status==='PENDING')throw new Error('같은 드랍 요청을 처리 중입니다.');
  let rewards=[];
  for(const pool of pools){const entries=await poolEntries(env,pool);rewards.push(...rollPool(pool,entries,context,seededRandom(`${uid}:${rid}:${pool.id}:${pool.config_version}`)))}
  rewards=await applyDailyLimits(env,uid,rewards);
  // 미획득까지 영수증으로 쓰면 자동 PVE에서 D1이 불필요하게 팽창한다. 요청별 결정론적 난수로 재시도 결과를 고정하고 미획득은 무기록 반환한다.
  if(!rewards.length)return {ok:true,requestId:rid,sourceType:source,sourceId:sid,triggerType:trigger,pools:pools.map(x=>({id:Number(x.id),code:x.code,name:x.name,version:Number(x.config_version)})),rewards:[],balances:null,skipped:'NO_REWARD'};
  let reserved;
  if(prior)reserved=await env.DB.prepare(`UPDATE ${RECEIPT_TABLE} SET status='PENDING',result_json=NULL,error_message=NULL,updated_at=CURRENT_TIMESTAMP WHERE request_id=? AND user_id=? AND status='FAILED'`).bind(rid,uid).run();
  else reserved=await env.DB.prepare(`INSERT OR IGNORE INTO ${RECEIPT_TABLE}(request_id,user_id,source_type,source_id,trigger_type,status) VALUES(?,?,?,?,?,'PENDING')`).bind(rid,uid,source,sid,trigger).run();
  if(!reserved.meta?.changes)throw new Error('같은 드랍 요청을 처리 중입니다.');
  try{
    const grant=await grantRewards(env,{userId:uid,requestId:rid,sourceType:source,sourceId:sid,rewards});
    const response={ok:true,requestId:rid,sourceType:source,sourceId:sid,triggerType:trigger,pools:pools.map(x=>({id:Number(x.id),code:x.code,name:x.name,version:Number(x.config_version)})),rewards,balances:grant.balances};
    await env.DB.batch([...grant.statements,env.DB.prepare(`UPDATE ${RECEIPT_TABLE} SET status='COMPLETED',result_json=?,updated_at=CURRENT_TIMESTAMP WHERE request_id=? AND user_id=? AND status='PENDING'`).bind(JSON.stringify(response),rid,uid)]);
    return response;
  }catch(error){await env.DB.prepare(`UPDATE ${RECEIPT_TABLE} SET status='FAILED',error_message=?,updated_at=CURRENT_TIMESTAMP WHERE request_id=? AND user_id=? AND status='PENDING'`).bind(String(error?.message||error).slice(0,500),rid,uid).run();throw error}
}

function cleanEntry(raw,index){
  const rewardType=code(raw.rewardType||raw.reward_type),rewardRef=code(raw.rewardRef||raw.reward_ref,100);
  if(!REWARD_TYPES.has(rewardType))throw new Error(`${index+1}번째 보상 종류가 올바르지 않습니다.`);
  if(['MASTER_STAR','INVENTORY_ITEM'].includes(rewardType)&&!(rewardType==='MASTER_STAR'||rewardRef))throw new Error(`${index+1}번째 인벤토리 아이템 코드를 입력하세요.`);
  const minQuantity=int(raw.minQuantity??raw.min_quantity,1,100000000,1),maxQuantity=int(raw.maxQuantity??raw.max_quantity,minQuantity,100000000,minQuantity);
  return {rewardType,rewardRef:rewardType==='MASTER_STAR'?'MASTER_STAR':rewardRef,rewardName:text(raw.rewardName||raw.reward_name,80),chancePercent:num(raw.chancePercent??raw.chance_percent,0,100,0),weight:num(raw.weight,0,100000000,0),minQuantity,maxQuantity,dailyLimit:int(raw.dailyLimit??raw.daily_limit,0,100000000,0),conditionsJson:JSON.stringify(raw.conditions&&typeof raw.conditions==='object'?raw.conditions:parse(raw.conditionsJson||raw.conditions_json,{})),sortOrder:int(raw.sortOrder??raw.sort_order,-100000,100000,index*10),isEnabled:raw.isEnabled!==false&&Number(raw.is_enabled)!==0};
}

async function adminSnapshot(env){
  const [pools,entries,bindings,items,ledger]=await Promise.all([
    env.DB.prepare(`SELECT * FROM ${POOL_TABLE} WHERE code<>'SCRAPYARD_PARTS' ORDER BY is_enabled DESC,name,id`).all(),
    env.DB.prepare(`SELECT * FROM ${ENTRY_TABLE} ORDER BY pool_id,sort_order,id`).all(),
    env.DB.prepare(`SELECT b.*,p.code pool_code,p.name pool_name FROM ${BINDING_TABLE} b JOIN ${POOL_TABLE} p ON p.id=b.pool_id WHERE p.code<>'SCRAPYARD_PARTS' ORDER BY b.source_type,b.priority DESC,b.id`).all(),
    env.DB.prepare("SELECT code,name,category,rarity,image_url FROM inventory_items WHERE is_active=1 ORDER BY category,sort_order,name").all(),
    env.DB.prepare(`SELECT l.*,u.nickname,p.name pool_name FROM ${LEDGER_TABLE} l LEFT JOIN users u ON u.id=l.user_id LEFT JOIN ${POOL_TABLE} p ON p.id=l.pool_id ORDER BY l.id DESC LIMIT 80`).all()
  ]);
  const byPool=new Map();for(const row of entries.results||[]){if(!byPool.has(Number(row.pool_id)))byPool.set(Number(row.pool_id),[]);byPool.get(Number(row.pool_id)).push({...row,conditions:parse(row.conditions_json,{})})}
  return {pools:(pools.results||[]).map(pool=>({...pool,entries:byPool.get(Number(pool.id))||[]})),bindings:bindings.results||[],inventoryItems:items.results||[],recentLedger:ledger.results||[],rewardTypes:[...REWARD_TYPES],rollModes:[...ROLL_MODES],sourceTypes:['PVE','PVE_AUTO','PVP','TOWER','RAID','RIFT','CAPTAIN','SIEGE','IDLE_DUNGEON','SCRAPYARD'],triggerTypes:['WIN','FIRST_CLEAR','CLEAR','WAVE_CLEAR','BOSS_CLEAR','SETTLEMENT']};
}

export async function handleDropPool({path,request,env,deps}){
  if(path!=='admin/drop-pools')return null;
  const admin=await deps.authenticate(request,env);
  if(!admin||!['OWNER','ADMIN'].includes(String(admin.role||'').toUpperCase()))return deps.json({error:'드랍풀 관리 권한이 필요합니다.'},403);
  await ensureUnifiedDropPoolFoundation(env);
  if(request.method==='GET')return deps.json(await adminSnapshot(env));
  if(request.method!=='POST')return deps.json({error:'지원하지 않는 요청입니다.'},405);
  const body=await deps.readBody(request),action=code(body.action);
  if(action==='SAVE_POOL'){
    const raw=body.pool||{},id=int(raw.id,0),poolCode=code(raw.code),name=text(raw.name,80),mode=code(raw.rollMode||raw.roll_mode),entries=(Array.isArray(raw.entries)?raw.entries:[]).slice(0,100).map(cleanEntry);
    if(!poolCode||!name)return deps.json({error:'드랍풀 코드와 이름을 입력하세요.'},400);
    if(!ROLL_MODES.has(mode))return deps.json({error:'드랍 판정 방식을 확인하세요.'},400);
    if(!entries.length&&raw.isEnabled!==false)return deps.json({error:'운영 사용 드랍풀에는 보상을 하나 이상 등록하세요.'},400);
    for(const entry of entries)if(entry.rewardType==='INVENTORY_ITEM'||entry.rewardType==='MASTER_STAR'){const item=await env.DB.prepare('SELECT code FROM inventory_items WHERE code=? AND is_active=1').bind(entry.rewardRef).first();if(!item)return deps.json({error:`등록되지 않은 인벤토리 아이템입니다: ${entry.rewardRef}`},400)}
    let poolId=id,before=null;
    if(id){before=await env.DB.prepare(`SELECT * FROM ${POOL_TABLE} WHERE id=?`).bind(id).first();if(!before)return deps.json({error:'수정할 드랍풀을 찾을 수 없습니다.'},404);await env.DB.prepare(`UPDATE ${POOL_TABLE} SET code=?,name=?,description=?,roll_mode=?,rolls=?,no_drop_weight=?,is_enabled=?,owner_test_only=?,config_version=config_version+1,updated_at=CURRENT_TIMESTAMP WHERE id=?`).bind(poolCode,name,text(raw.description,400),mode,int(raw.rolls,1,100,1),num(raw.noDropWeight??raw.no_drop_weight,0,100000000,0),raw.isEnabled===false?0:1,raw.ownerTestOnly?1:0,id).run()}
    else{const created=await env.DB.prepare(`INSERT INTO ${POOL_TABLE}(code,name,description,roll_mode,rolls,no_drop_weight,is_enabled,owner_test_only) VALUES(?,?,?,?,?,?,?,?)`).bind(poolCode,name,text(raw.description,400),mode,int(raw.rolls,1,100,1),num(raw.noDropWeight??raw.no_drop_weight,0,100000000,0),raw.isEnabled===false?0:1,raw.ownerTestOnly?1:0).run();poolId=Number(created.meta?.last_row_id||0)}
    const statements=[env.DB.prepare(`DELETE FROM ${ENTRY_TABLE} WHERE pool_id=?`).bind(poolId)];
    for(const entry of entries)statements.push(env.DB.prepare(`INSERT INTO ${ENTRY_TABLE}(pool_id,reward_type,reward_ref,reward_name,chance_percent,weight,min_quantity,max_quantity,daily_limit,conditions_json,sort_order,is_enabled) VALUES(?,?,?,?,?,?,?,?,?,?,?,?)`).bind(poolId,entry.rewardType,entry.rewardRef,entry.rewardName,entry.chancePercent,entry.weight,entry.minQuantity,entry.maxQuantity,entry.dailyLimit,entry.conditionsJson,entry.sortOrder,entry.isEnabled?1:0));
    await env.DB.batch(statements);invalidateUnifiedDropPoolCache();if(deps.writeAdminLog)await deps.writeAdminLog(env,admin,'UNIFIED_DROP_POOL_SAVE','DROP_POOL',String(poolId),before,{code:poolCode,name,mode,entries:entries.length});return deps.json({ok:true,poolId,snapshot:await adminSnapshot(env)});
  }
  if(action==='SAVE_BINDINGS'){
    const bindings=(Array.isArray(body.bindings)?body.bindings:[]).slice(0,200).map((raw,index)=>({sourceType:code(raw.sourceType||raw.source_type),sourceId:text(raw.sourceId||raw.source_id||'*',120)||'*',triggerType:code(raw.triggerType||raw.trigger_type||'WIN'),poolId:int(raw.poolId||raw.pool_id,1),priority:int(raw.priority,-100000,100000,index),isEnabled:raw.isEnabled!==false&&Number(raw.is_enabled)!==0})).filter(binding=>binding.sourceType!=='SCRAPYARD');
    for(const binding of bindings){if(!binding.sourceType||!binding.triggerType)return deps.json({error:'콘텐츠와 지급 조건을 입력하세요.'},400);if(!await env.DB.prepare(`SELECT id FROM ${POOL_TABLE} WHERE id=?`).bind(binding.poolId).first())return deps.json({error:`드랍풀 #${binding.poolId}을 찾을 수 없습니다.`},400)}
    for(const [difficulty,poolCode] of SCRAPYARD_DIFFICULTIES){const pool=await env.DB.prepare(`SELECT id FROM ${POOL_TABLE} WHERE code=?`).bind(poolCode).first();if(!pool)return deps.json({error:`폐차장 ${difficulty} 난이도 드랍풀이 없습니다.`},500);bindings.push({sourceType:'SCRAPYARD',sourceId:difficulty,triggerType:'CLEAR',poolId:Number(pool.id),priority:100,isEnabled:true})}
    const statements=[env.DB.prepare(`DELETE FROM ${BINDING_TABLE}`)];for(const binding of bindings)statements.push(env.DB.prepare(`INSERT INTO ${BINDING_TABLE}(source_type,source_id,trigger_type,pool_id,priority,is_enabled) VALUES(?,?,?,?,?,?)`).bind(binding.sourceType,binding.sourceId,binding.triggerType,binding.poolId,binding.priority,binding.isEnabled?1:0));await env.DB.batch(statements);invalidateUnifiedDropPoolCache();if(deps.writeAdminLog)await deps.writeAdminLog(env,admin,'UNIFIED_DROP_BINDINGS_SAVE','DROP_BINDING','ALL',null,{count:bindings.length});return deps.json({ok:true,snapshot:await adminSnapshot(env)});
  }
  if(action==='SIMULATE'){
    const poolId=int(body.poolId,1),iterations=int(body.iterations,100,100000,10000),pool=await env.DB.prepare(`SELECT * FROM ${POOL_TABLE} WHERE id=?`).bind(poolId).first();if(!pool)return deps.json({error:'시뮬레이션할 드랍풀을 찾을 수 없습니다.'},404);const rows=await env.DB.prepare(`SELECT * FROM ${ENTRY_TABLE} WHERE pool_id=? AND is_enabled=1 ORDER BY sort_order,id`).bind(poolId).all(),counts=new Map(),random=Math.random;let empty=0,totalRewards=0;for(let i=0;i<iterations;i++){const rolled=rollPool(pool,rows.results||[],body.context||{},random);if(!rolled.length)empty++;for(const reward of rolled){const key=String(reward.entryId),prior=counts.get(key)||{entryId:reward.entryId,rewardName:reward.rewardName,rewardType:reward.rewardType,rewardRef:reward.rewardRef,hits:0,quantity:0};prior.hits++;prior.quantity+=reward.quantity;counts.set(key,prior);totalRewards++}}return deps.json({ok:true,iterations,empty,emptyRate:Number((empty/iterations*100).toFixed(4)),averageRewards:Number((totalRewards/iterations).toFixed(6)),results:[...counts.values()].map(row=>({...row,hitRate:Number((row.hits/iterations*100).toFixed(4)),averageQuantity:Number((row.quantity/iterations).toFixed(6))}))});
  }
  return deps.json({error:'지원하지 않는 드랍풀 작업입니다.'},400);
}
