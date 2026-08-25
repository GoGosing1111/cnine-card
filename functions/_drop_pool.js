const POOL_TABLE='unified_drop_pools_v1667';
const ENTRY_TABLE='unified_drop_entries_v1667';
const BINDING_TABLE='unified_drop_bindings_v1667';
const RECEIPT_TABLE='unified_drop_receipts_v1667';
const LEDGER_TABLE='unified_drop_ledger_v1667';
const REWARD_TYPES=new Set(['COIN','CARD_SHARDS','MAGIC_CRYSTAL','MASTER_STAR','INVENTORY_ITEM','CARD','EQUIPMENT','VEHICLE']);
const ROLL_MODES=new Set(['INDEPENDENT','WEIGHTED_ONE']);
const SCRAPYARD_DIFFICULTIES=[
  ['OUTER','SCRAPYARD_PARTS_OUTER','폐차장 · 외곽 부품'],
  ['CORE','SCRAPYARD_PARTS_CORE','폐차장 · 압축 설비 부품'],
  ['FURNACE','SCRAPYARD_PARTS_FURNACE','폐차장 · 용광로 부품']
];
const SCRAPYARD_POOL_CODES=new Set(SCRAPYARD_DIFFICULTIES.map(([,poolCode])=>poolCode));
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
  if(marker?.value!=='1'){
    const source=await env.DB.prepare(`SELECT * FROM ${POOL_TABLE} WHERE code='SCRAPYARD_PARTS'`).first();
    for(const [difficulty,poolCode,poolName] of SCRAPYARD_DIFFICULTIES){
      await env.DB.prepare(`INSERT OR IGNORE INTO ${POOL_TABLE}(code,name,description,roll_mode,rolls,no_drop_weight,is_enabled,owner_test_only,config_version) VALUES(?,?,?,'INDEPENDENT',1,0,1,0,1)`).bind(poolCode,poolName,`${difficulty} 난이도 완주 시 각 보상을 독립 확률로 한 번 판정합니다.`).run();
      const target=await env.DB.prepare(`SELECT id FROM ${POOL_TABLE} WHERE code=?`).bind(poolCode).first();
      if(!target?.id)continue;
      if(source?.id)await env.DB.prepare(`INSERT OR IGNORE INTO ${ENTRY_TABLE}(pool_id,reward_type,reward_ref,reward_name,chance_percent,weight,min_quantity,max_quantity,daily_limit,conditions_json,sort_order,is_enabled) SELECT ?,reward_type,reward_ref,reward_name,chance_percent,0,min_quantity,max_quantity,daily_limit,conditions_json,sort_order,is_enabled FROM ${ENTRY_TABLE} WHERE pool_id=?`).bind(target.id,source.id).run();
      else await env.DB.batch([
        env.DB.prepare(`INSERT OR IGNORE INTO ${ENTRY_TABLE}(pool_id,reward_type,reward_ref,reward_name,chance_percent,weight,min_quantity,max_quantity,sort_order,is_enabled) VALUES(?,'INVENTORY_ITEM','VEHICLE_PART_TIRE','고성능 타이어',10,0,1,2,10,1)`).bind(target.id),
        env.DB.prepare(`INSERT OR IGNORE INTO ${ENTRY_TABLE}(pool_id,reward_type,reward_ref,reward_name,chance_percent,weight,min_quantity,max_quantity,sort_order,is_enabled) VALUES(?,'INVENTORY_ITEM','VEHICLE_PART_FRAME','강화 차체 프레임',5,0,1,1,20,1)`).bind(target.id),
        env.DB.prepare(`INSERT OR IGNORE INTO ${ENTRY_TABLE}(pool_id,reward_type,reward_ref,reward_name,chance_percent,weight,min_quantity,max_quantity,sort_order,is_enabled) VALUES(?,'INVENTORY_ITEM','VEHICLE_PART_ENGINE','고출력 엔진',3,0,1,1,30,1)`).bind(target.id)
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
  const independentMarker=await env.DB.prepare("SELECT value FROM app_meta WHERE key='safe_runtime_upgrade_v1722_scrapyard_independent_drop_rates'").first();
  if(independentMarker?.value!=='1'){
    const fixedPoolCount=await env.DB.prepare(`SELECT COUNT(*) count FROM ${POOL_TABLE} WHERE code IN ('SCRAPYARD_PARTS_OUTER','SCRAPYARD_PARTS_CORE','SCRAPYARD_PARTS_FURNACE')`).first();
    if(Number(fixedPoolCount?.count||0)!==SCRAPYARD_DIFFICULTIES.length)throw new Error('폐차장 난이도별 드랍풀 구성이 완전하지 않습니다.');
    await env.DB.batch([
      env.DB.prepare(`UPDATE ${POOL_TABLE} SET roll_mode='INDEPENDENT',rolls=1,no_drop_weight=0,config_version=config_version+1,updated_at=CURRENT_TIMESTAMP WHERE code IN ('SCRAPYARD_PARTS_OUTER','SCRAPYARD_PARTS_CORE','SCRAPYARD_PARTS_FURNACE') AND (roll_mode<>'INDEPENDENT' OR rolls<>1 OR no_drop_weight<>0)`),
      env.DB.prepare(`UPDATE ${ENTRY_TABLE} SET weight=0,updated_at=CURRENT_TIMESTAMP WHERE pool_id IN (SELECT id FROM ${POOL_TABLE} WHERE code IN ('SCRAPYARD_PARTS_OUTER','SCRAPYARD_PARTS_CORE','SCRAPYARD_PARTS_FURNACE')) AND weight<>0`),
      env.DB.prepare("INSERT OR REPLACE INTO app_meta(key,value,updated_at) VALUES('safe_runtime_upgrade_v1722_scrapyard_independent_drop_rates','1',CURRENT_TIMESTAMP)")
    ]);
    invalidateUnifiedDropPoolCache();
  }
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
  const limitedIds=[...new Set(rewards.filter(reward=>Number(reward.dailyLimit||0)>0).map(reward=>Number(reward.entryId)).filter(Boolean))],usedByEntry=new Map();
  if(limitedIds.length){const marks=limitedIds.map(()=>'?').join(','),rows=await env.DB.prepare(`SELECT entry_id,COALESCE(SUM(quantity),0) amount FROM ${LEDGER_TABLE} WHERE user_id=? AND entry_id IN (${marks}) AND date(created_at,'+9 hours')=date('now','+9 hours') GROUP BY entry_id`).bind(userId,...limitedIds).all();for(const row of rows.results||[])usedByEntry.set(Number(row.entry_id),Number(row.amount||0))}
  const result=[];
  for(const reward of rewards){
    let amount=Math.max(0,Number(reward.quantity||0));
    if(reward.dailyLimit>0)amount=Math.min(amount,Math.max(0,reward.dailyLimit-Number(usedByEntry.get(Number(reward.entryId))||0)));
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
  const cardRefs=[...new Set([...aggregates.values()].filter(x=>x.type==='CARD').map(x=>String(x.ref)).filter(Boolean))];
  const equipmentRefs=[...new Set([...aggregates.values()].filter(x=>x.type==='EQUIPMENT').map(x=>Number(x.ref)).filter(Boolean))];
  const vehicleRefs=[...new Set([...aggregates.values()].filter(x=>x.type==='VEHICLE').map(x=>Number(x.ref)).filter(Boolean))];
  const inventoryBalances=new Map(),cardBalances=new Map(),equipmentBalances=new Map();
  if(inventoryRefs.length){const marks=inventoryRefs.map(()=>'?').join(','),rows=await env.DB.prepare(`SELECT i.code,i.name,i.is_active,COALESCE(ui.quantity,0) quantity FROM inventory_items i LEFT JOIN cnine_user_inventory ui ON ui.user_id=? AND ui.item_code=i.code WHERE i.code IN (${marks})`).bind(userId,...inventoryRefs).all(),byCode=new Map((rows.results||[]).map(row=>[String(row.code),row]));for(const ref of inventoryRefs){const item=byCode.get(String(ref));if(!item||Number(item.is_active)===0)throw new Error(`지급 가능한 인벤토리 아이템이 아닙니다: ${ref}`);inventoryBalances.set(ref,Number(item.quantity||0))}}
  if(cardRefs.length){const marks=cardRefs.map(()=>'?').join(','),rows=await env.DB.prepare(`SELECT CAST(c.id AS TEXT) id,COALESCE(uc.quantity,0) quantity FROM cards_effective_v1210 c JOIN members m ON m.id=c.member_id LEFT JOIN user_cards uc ON uc.user_id=? AND uc.card_id=c.id WHERE CAST(c.id AS TEXT) IN (${marks}) AND UPPER(c.rarity) IN ('SUPERSTAR','ZENITH','FUR') AND c.is_active=1 AND m.is_active=1 AND COALESCE(c.card_status,'PUBLIC')='PUBLIC'`).bind(userId,...cardRefs).all(),byId=new Map((rows.results||[]).map(row=>[String(row.id),row]));for(const ref of cardRefs){const card=byId.get(String(ref));if(!card)throw new Error(`지급 가능한 SUPERSTAR/ZENITH/FUR 카드가 아닙니다: ${ref}`);cardBalances.set(String(ref),Number(card.quantity||0))}}
  if(equipmentRefs.length){const marks=equipmentRefs.map(()=>'?').join(','),rows=await env.DB.prepare(`SELECT i.id,COUNT(x.id) quantity FROM character_equipment_items i LEFT JOIN user_equipment_instances x ON x.user_id=? AND x.equipment_id=i.id WHERE i.id IN (${marks}) AND i.is_active=1 AND i.is_public=1 GROUP BY i.id`).bind(userId,...equipmentRefs).all(),byId=new Map((rows.results||[]).map(row=>[Number(row.id),row]));for(const ref of equipmentRefs){const item=byId.get(Number(ref));if(!item)throw new Error(`지급 가능한 장비가 아닙니다: ${ref}`);equipmentBalances.set(Number(ref),Number(item.quantity||0))}}
  if(vehicleRefs.length){const marks=vehicleRefs.map(()=>'?').join(','),rows=await env.DB.prepare(`SELECT id FROM character_garage_items WHERE id IN (${marks}) AND is_active=1 AND is_public=1`).bind(...vehicleRefs).all(),valid=new Set((rows.results||[]).map(row=>Number(row.id)));for(const ref of vehicleRefs)if(!valid.has(Number(ref)))throw new Error(`지급 가능한 이동수단이 아닙니다: ${ref}`)}
  const statements=[];
  for(const item of aggregates.values()){
    if(item.type==='COIN'){coin+=item.quantity;statements.push(env.DB.prepare('UPDATE users SET coin=coin+? WHERE id=?').bind(item.quantity,userId),env.DB.prepare("INSERT INTO coin_logs(user_id,change_amount,balance_after,reason) VALUES(?,?,?,'UNIFIED_DROP_POOL')").bind(userId,item.quantity,coin));continue}
    if(item.type==='CARD_SHARDS'){shards+=item.quantity;statements.push(env.DB.prepare('UPDATE users SET card_shards=card_shards+? WHERE id=?').bind(item.quantity,userId),env.DB.prepare("INSERT INTO shard_logs(user_id,change_amount,balance_after,reason) VALUES(?,?,?,'UNIFIED_DROP_POOL')").bind(userId,item.quantity,shards));continue}
    if(item.type==='MAGIC_CRYSTAL'){crystals+=item.quantity;statements.push(env.DB.prepare('UPDATE users SET magic_crystals=magic_crystals+? WHERE id=?').bind(item.quantity,userId),env.DB.prepare("INSERT INTO magic_crystal_logs(user_id,change_amount,balance_after,reason,reference_type,reference_id) VALUES(?,?,?,'통합 드랍풀','UNIFIED_DROP',?)").bind(userId,item.quantity,crystals,requestId));continue}
    if(item.type==='INVENTORY_ITEM'){const after=Number(inventoryBalances.get(item.ref)||0)+item.quantity;inventoryBalances.set(item.ref,after);statements.push(env.DB.prepare(`INSERT INTO cnine_user_inventory(user_id,item_code,quantity,unseen_quantity,created_at,updated_at) VALUES(?,?,?,?,CURRENT_TIMESTAMP,CURRENT_TIMESTAMP) ON CONFLICT(user_id,item_code) DO UPDATE SET quantity=cnine_user_inventory.quantity+excluded.quantity,unseen_quantity=cnine_user_inventory.unseen_quantity+excluded.unseen_quantity,updated_at=CURRENT_TIMESTAMP`).bind(userId,item.ref,item.quantity,item.quantity),env.DB.prepare("INSERT INTO inventory_logs(user_id,item_code,change_amount,balance_after,reason,reference_type,reference_id) VALUES(?,?,?,?,?,'UNIFIED_DROP',?)").bind(userId,item.ref,item.quantity,after,`통합 드랍풀 · ${sourceType}`,requestId))}
    if(item.type==='CARD'){const ref=String(item.ref),after=Number(cardBalances.get(ref)||0)+item.quantity;cardBalances.set(ref,after);statements.push(env.DB.prepare(`INSERT INTO user_cards(user_id,card_id,quantity) VALUES(?,?,?) ON CONFLICT(user_id,card_id) DO UPDATE SET quantity=user_cards.quantity+excluded.quantity,last_obtained_at=CURRENT_TIMESTAMP`).bind(userId,ref,item.quantity))}
    if(item.type==='EQUIPMENT'){const ref=Number(item.ref),before=Number(equipmentBalances.get(ref)||0);for(let index=0;index<item.quantity;index++)statements.push(env.DB.prepare(`INSERT INTO user_equipment_instances(user_id,equipment_id,source_type,source_id,request_id) SELECT ?,id,'UNIFIED_DROP',?,? FROM character_equipment_items WHERE id=? AND is_active=1 AND is_public=1`).bind(userId,requestId,`${requestId}:EQ:${ref}:${index}`,ref));equipmentBalances.set(ref,before+item.quantity)}
    if(item.type==='VEHICLE')statements.push(env.DB.prepare(`INSERT OR IGNORE INTO user_garage_vehicles(user_id,garage_id,source_type,source_id) SELECT ?,id,'UNIFIED_DROP',? FROM character_garage_items WHERE id=? AND is_active=1 AND is_public=1`).bind(userId,requestId,Number(item.ref)));
  }
  for(const reward of rewards){const type=normalizedRewardType(reward),ref=normalizedRewardRef(reward),balance=type==='COIN'?coin:type==='CARD_SHARDS'?shards:type==='MAGIC_CRYSTAL'?crystals:type==='CARD'?cardBalances.get(String(ref)):type==='EQUIPMENT'?equipmentBalances.get(Number(ref)):inventoryBalances.get(ref);statements.push(env.DB.prepare(`INSERT INTO ${LEDGER_TABLE}(request_id,user_id,pool_id,entry_id,source_type,source_id,reward_type,reward_ref,quantity,balance_after) VALUES(?,?,?,?,?,?,?,?,?,?)`).bind(requestId,userId,reward.poolId,reward.entryId,sourceType,sourceId,reward.rewardType,reward.rewardRef,reward.quantity,balance??null))}
  return {statements,balances:{coin,cardShards:shards,magicCrystals:crystals,inventory:Object.fromEntries(inventoryBalances),cards:Object.fromEntries(cardBalances),equipment:Object.fromEntries(equipmentBalances)}};
}

async function rewardPresentation(env,rewards,balances){
  const inventoryRefs=[...new Set(rewards.filter(reward=>['INVENTORY_ITEM','MASTER_STAR'].includes(String(reward.rewardType))).map(reward=>String(reward.rewardType)==='MASTER_STAR'?'MASTER_STAR':String(reward.rewardRef)).filter(Boolean))];
  const cardRefs=[...new Set(rewards.filter(reward=>String(reward.rewardType)==='CARD').map(reward=>String(reward.rewardRef)).filter(Boolean))];
  const equipmentRefs=[...new Set(rewards.filter(reward=>String(reward.rewardType)==='EQUIPMENT').map(reward=>Number(reward.rewardRef)).filter(Boolean))];
  const vehicleRefs=[...new Set(rewards.filter(reward=>String(reward.rewardType)==='VEHICLE').map(reward=>Number(reward.rewardRef)).filter(Boolean))];
  const inventory=new Map(),cards=new Map(),equipment=new Map(),vehicles=new Map();
  if(inventoryRefs.length){
    const marks=inventoryRefs.map(()=>'?').join(',');
    const rows=await env.DB.prepare(`SELECT code,name,rarity,replace(image_url,char(92),'/') image FROM inventory_items WHERE code IN (${marks})`).bind(...inventoryRefs).all();
    for(const row of rows.results||[])inventory.set(String(row.code),row);
  }
  if(vehicleRefs.length){
    const marks=vehicleRefs.map(()=>'?').join(',');
    const rows=await env.DB.prepare(`SELECT id,name,rarity,replace(image_url,char(92),'/') image FROM character_garage_items WHERE id IN (${marks})`).bind(...vehicleRefs).all();
    for(const row of rows.results||[])vehicles.set(Number(row.id),row);
  }
  if(cardRefs.length){
    const marks=cardRefs.map(()=>'?').join(',');
    const rows=await env.DB.prepare(`SELECT CAST(c.id AS TEXT) id,c.title name,c.rarity,replace(c.image_url,char(92),'/') image,m.name memberName FROM cards_effective_v1210 c JOIN members m ON m.id=c.member_id WHERE CAST(c.id AS TEXT) IN (${marks})`).bind(...cardRefs).all();
    for(const row of rows.results||[])cards.set(String(row.id),row);
  }
  if(equipmentRefs.length){
    const marks=equipmentRefs.map(()=>'?').join(',');
    const rows=await env.DB.prepare(`SELECT id,name,rarity,replace(image_url,char(92),'/') image FROM character_equipment_items WHERE id IN (${marks})`).bind(...equipmentRefs).all();
    for(const row of rows.results||[])equipment.set(Number(row.id),row);
  }
  const fixed={COIN:{name:'코인',rarity:'SPECIAL'},CARD_SHARDS:{name:'카드 조각',rarity:'SPECIAL'},MAGIC_CRYSTAL:{name:'마법 결정',rarity:'EPIC'}};
  return rewards.map(reward=>{
    const type=String(reward.rewardType||''),ref=type==='MASTER_STAR'?'MASTER_STAR':String(reward.rewardRef||''),meta=type==='VEHICLE'?vehicles.get(Number(ref)):type==='CARD'?cards.get(ref):type==='EQUIPMENT'?equipment.get(Number(ref)):inventory.get(ref),fallback=fixed[type]||{};
    const balance=type==='COIN'?balances.coin:type==='CARD_SHARDS'?balances.cardShards:type==='MAGIC_CRYSTAL'?balances.magicCrystals:type==='CARD'?balances.cards?.[ref]:type==='EQUIPMENT'?balances.equipment?.[ref]:balances.inventory?.[ref];
    const destination=type==='VEHICLE'?'차고지':type==='CARD'?'카드 보관함':type==='EQUIPMENT'?'장비 보관함':'인벤토리';
    return {...reward,rewardRef:ref,displayName:meta?.name||reward.rewardName||fallback.name||ref||type,image:meta?.image||'',rarity:meta?.rarity||fallback.rarity||(type==='VEHICLE'?'MYTHIC':'SPECIAL'),balance:balance??null,destination};
  });
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
  for(const pool of pools){
    const entries=await poolEntries(env,pool),fixedScrapyard=source==='SCRAPYARD'&&SCRAPYARD_POOL_CODES.has(String(pool.code||''));
    const effectivePool=fixedScrapyard?{...pool,roll_mode:'INDEPENDENT',rolls:1,no_drop_weight:0}:pool,effectiveContext=fixedScrapyard?{...context,rollsMultiplier:1}:context;
    const random=seededRandom(`${uid}:${rid}:${pool.id}:${pool.config_version}`);
    rewards.push(...rollPool(effectivePool,entries,effectiveContext,random));
  }
  rewards=await applyDailyLimits(env,uid,rewards);
  // 미획득까지 영수증으로 쓰면 자동 PVE에서 D1이 불필요하게 팽창한다. 요청별 결정론적 난수로 재시도 결과를 고정하고 미획득은 무기록 반환한다.
  if(!rewards.length)return {ok:true,requestId:rid,sourceType:source,sourceId:sid,triggerType:trigger,pools:pools.map(x=>({id:Number(x.id),code:x.code,name:x.name,version:Number(x.config_version)})),rewards:[],balances:null,skipped:'NO_REWARD'};
  let reserved;
  if(prior)reserved=await env.DB.prepare(`UPDATE ${RECEIPT_TABLE} SET status='PENDING',result_json=NULL,error_message=NULL,updated_at=CURRENT_TIMESTAMP WHERE request_id=? AND user_id=? AND status='FAILED'`).bind(rid,uid).run();
  else reserved=await env.DB.prepare(`INSERT OR IGNORE INTO ${RECEIPT_TABLE}(request_id,user_id,source_type,source_id,trigger_type,status) VALUES(?,?,?,?,?,'PENDING')`).bind(rid,uid,source,sid,trigger).run();
  if(!reserved.meta?.changes)throw new Error('같은 드랍 요청을 처리 중입니다.');
  try{
    const grant=await grantRewards(env,{userId:uid,requestId:rid,sourceType:source,sourceId:sid,rewards});
    const presentedRewards=await rewardPresentation(env,rewards,grant.balances);
    const response={ok:true,requestId:rid,sourceType:source,sourceId:sid,triggerType:trigger,pools:pools.map(x=>({id:Number(x.id),code:x.code,name:x.name,version:Number(x.config_version)})),rewards:presentedRewards,balances:grant.balances};
    await env.DB.batch([...grant.statements,env.DB.prepare(`UPDATE ${RECEIPT_TABLE} SET status='COMPLETED',result_json=?,updated_at=CURRENT_TIMESTAMP WHERE request_id=? AND user_id=? AND status='PENDING'`).bind(JSON.stringify(response),rid,uid)]);
    return response;
  }catch(error){await env.DB.prepare(`UPDATE ${RECEIPT_TABLE} SET status='FAILED',error_message=?,updated_at=CURRENT_TIMESTAMP WHERE request_id=? AND user_id=? AND status='PENDING'`).bind(String(error?.message||error).slice(0,500),rid,uid).run();throw error}
}

function cleanEntry(raw,index){
  const rewardType=code(raw.rewardType||raw.reward_type),rawRef=text(raw.rewardRef||raw.reward_ref,100),rewardRef=rewardType==='CARD'?rawRef:code(rawRef,100);
  if(!REWARD_TYPES.has(rewardType))throw new Error(`${index+1}번째 보상 종류가 올바르지 않습니다.`);
  if(['INVENTORY_ITEM','CARD','EQUIPMENT','VEHICLE'].includes(rewardType)&&!rewardRef)throw new Error(`${index+1}번째 지급 대상을 선택하세요.`);
  const quantityLimit=rewardType==='EQUIPMENT'?100:100000000,minQuantity=rewardType==='VEHICLE'?1:int(raw.minQuantity??raw.min_quantity,1,quantityLimit,1),maxQuantity=rewardType==='VEHICLE'?1:int(raw.maxQuantity??raw.max_quantity,minQuantity,quantityLimit,minQuantity);
  return {rewardType,rewardRef:rewardType==='MASTER_STAR'?'MASTER_STAR':rewardRef,rewardName:text(raw.rewardName||raw.reward_name,80),chancePercent:num(raw.chancePercent??raw.chance_percent,0,100,0),weight:num(raw.weight,0,100000000,0),minQuantity,maxQuantity,dailyLimit:int(raw.dailyLimit??raw.daily_limit,0,100000000,0),conditionsJson:JSON.stringify(raw.conditions&&typeof raw.conditions==='object'?raw.conditions:parse(raw.conditionsJson||raw.conditions_json,{})),sortOrder:int(raw.sortOrder??raw.sort_order,-100000,100000,index*10),isEnabled:raw.isEnabled!==false&&Number(raw.is_enabled)!==0};
}

async function adminSnapshot(env){
  await env.DB.prepare("UPDATE inventory_items SET name='미스틱 에너지',subtitle='MYSTIC ENERGY',description='미스틱 장비 제작에 투입되는 고밀도 결정 에너지입니다. 직접 사용할 수 없는 제작 재료입니다.',category='MATERIAL',rarity='MYTHIC',image_url='assets/items/starlight-armor-core-v1749.png',is_active=1,updated_at=CURRENT_TIMESTAMP WHERE code='STARLIGHT_ARMOR_CORE'").run();
  const [pools,entries,bindings,items,vehicles,ledger,previewEquipment,dropCards,equipmentItems]=await Promise.all([
    env.DB.prepare(`SELECT * FROM ${POOL_TABLE} WHERE code<>'SCRAPYARD_PARTS' ORDER BY is_enabled DESC,name,id`).all(),
    env.DB.prepare(`SELECT * FROM ${ENTRY_TABLE} ORDER BY pool_id,sort_order,id`).all(),
    env.DB.prepare(`SELECT b.*,p.code pool_code,p.name pool_name FROM ${BINDING_TABLE} b JOIN ${POOL_TABLE} p ON p.id=b.pool_id WHERE p.code<>'SCRAPYARD_PARTS' ORDER BY b.source_type,b.priority DESC,b.id`).all(),
    env.DB.prepare("SELECT code,name,category,rarity,image_url FROM inventory_items WHERE is_active=1 ORDER BY category,sort_order,name").all(),
    env.DB.prepare("SELECT id,name,rarity,image_url FROM character_garage_items WHERE is_active=1 AND is_public=1 ORDER BY rarity,name,id").all(),
    env.DB.prepare(`SELECT l.*,u.nickname,p.name pool_name FROM ${LEDGER_TABLE} l LEFT JOIN users u ON u.id=l.user_id LEFT JOIN ${POOL_TABLE} p ON p.id=l.pool_id ORDER BY l.id DESC LIMIT 80`).all(),
    env.DB.prepare("SELECT id,name,rarity,replace(image_url,char(92),'/') image_url FROM character_equipment_items WHERE UPPER(REPLACE(COALESCE(name,''),' ','')) IN ('인피니티AK','INFINITYAK') ORDER BY is_active DESC,id LIMIT 1").first(),
    env.DB.prepare(`SELECT CAST(c.id AS TEXT) id,c.title,m.name member_name,c.rarity,replace(c.image_url,char(92),'/') image_url FROM cards_effective_v1210 c JOIN members m ON m.id=c.member_id WHERE UPPER(c.rarity) IN ('SUPERSTAR','ZENITH','FUR') AND c.is_active=1 AND m.is_active=1 AND COALESCE(c.card_status,'PUBLIC')='PUBLIC' ORDER BY CASE UPPER(c.rarity) WHEN 'SUPERSTAR' THEN 0 WHEN 'ZENITH' THEN 1 ELSE 2 END,m.sort_order,c.title`).all(),
    env.DB.prepare("SELECT id,name,slot,subtype,rarity,replace(image_url,char(92),'/') image_url FROM character_equipment_items WHERE is_active=1 AND is_public=1 ORDER BY slot,sort_order,name,id").all()
  ]);
  const byPool=new Map();for(const row of entries.results||[]){if(!byPool.has(Number(row.pool_id)))byPool.set(Number(row.pool_id),[]);byPool.get(Number(row.pool_id)).push({...row,conditions:parse(row.conditions_json,{})})}
  return {pools:(pools.results||[]).map(pool=>({...pool,entries:byPool.get(Number(pool.id))||[]})),bindings:bindings.results||[],inventoryItems:items.results||[],vehicles:vehicles.results||[],dropCards:dropCards.results||[],equipmentItems:equipmentItems.results||[],previewEquipment:previewEquipment||null,recentLedger:ledger.results||[],rewardTypes:[...REWARD_TYPES],rollModes:[...ROLL_MODES],sourceTypes:['PVE','PVE_AUTO','PVE_NIGHTMARE','PVE_NIGHTMARE_AUTO','PVP','TOWER','RAID','RIFT','CAPTAIN','SIEGE','IDLE_DUNGEON','SCRAPYARD'],triggerTypes:['WIN','FIRST_CLEAR','CLEAR','WAVE_CLEAR','BOSS_CLEAR','SETTLEMENT']};
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
    const raw=body.pool||{},id=int(raw.id,0),poolCode=code(raw.code),name=text(raw.name,80);let before=null;
    if(!poolCode||!name)return deps.json({error:'드랍풀 코드와 이름을 입력하세요.'},400);
    if(id){before=await env.DB.prepare(`SELECT * FROM ${POOL_TABLE} WHERE id=?`).bind(id).first();if(!before)return deps.json({error:'수정할 드랍풀을 찾을 수 없습니다.'},404)}
    const fixedScrapyard=SCRAPYARD_POOL_CODES.has(poolCode)||SCRAPYARD_POOL_CODES.has(String(before?.code||''));
    if(fixedScrapyard&&before&&poolCode!==String(before.code))return deps.json({error:'폐차장 난이도 고정 풀 코드는 변경할 수 없습니다.'},400);
    const mode=fixedScrapyard?'INDEPENDENT':code(raw.rollMode||raw.roll_mode),rolls=fixedScrapyard?1:int(raw.rolls,1,100,1),noDropWeight=fixedScrapyard?0:num(raw.noDropWeight??raw.no_drop_weight,0,100000000,0),entries=(Array.isArray(raw.entries)?raw.entries:[]).slice(0,100).map(cleanEntry).map(entry=>fixedScrapyard?{...entry,weight:0}:entry);
    if(!ROLL_MODES.has(mode))return deps.json({error:'드랍 판정 방식을 확인하세요.'},400);
    if(!entries.length&&raw.isEnabled!==false)return deps.json({error:'운영 사용 드랍풀에는 보상을 하나 이상 등록하세요.'},400);
    for(const entry of entries)if(entry.rewardType==='INVENTORY_ITEM'||entry.rewardType==='MASTER_STAR'){const item=await env.DB.prepare('SELECT code FROM inventory_items WHERE code=? AND is_active=1').bind(entry.rewardRef).first();if(!item)return deps.json({error:`등록되지 않은 인벤토리 아이템입니다: ${entry.rewardRef}`},400)}
    for(const entry of entries)if(entry.rewardType==='CARD'){const card=await env.DB.prepare("SELECT c.id FROM cards_effective_v1210 c JOIN members m ON m.id=c.member_id WHERE CAST(c.id AS TEXT)=? AND UPPER(c.rarity) IN ('SUPERSTAR','ZENITH','FUR') AND c.is_active=1 AND m.is_active=1 AND COALESCE(c.card_status,'PUBLIC')='PUBLIC'").bind(entry.rewardRef).first();if(!card)return deps.json({error:`등록되지 않은 SUPERSTAR/ZENITH/FUR 카드입니다: ${entry.rewardRef}`},400)}
    for(const entry of entries)if(entry.rewardType==='EQUIPMENT'){const item=await env.DB.prepare('SELECT id FROM character_equipment_items WHERE id=? AND is_active=1 AND is_public=1').bind(Number(entry.rewardRef)).first();if(!item)return deps.json({error:`등록되지 않은 공개 장비입니다: ${entry.rewardRef}`},400)}
    for(const entry of entries)if(entry.rewardType==='VEHICLE'){const vehicle=await env.DB.prepare('SELECT id FROM character_garage_items WHERE id=? AND is_active=1 AND is_public=1').bind(Number(entry.rewardRef)).first();if(!vehicle)return deps.json({error:`등록되지 않은 공개 이동수단입니다: ${entry.rewardRef}`},400)}
    let poolId=id;
    if(id)await env.DB.prepare(`UPDATE ${POOL_TABLE} SET code=?,name=?,description=?,roll_mode=?,rolls=?,no_drop_weight=?,is_enabled=?,owner_test_only=?,config_version=config_version+1,updated_at=CURRENT_TIMESTAMP WHERE id=?`).bind(poolCode,name,text(raw.description,400),mode,rolls,noDropWeight,raw.isEnabled===false?0:1,raw.ownerTestOnly?1:0,id).run();
    else{const created=await env.DB.prepare(`INSERT INTO ${POOL_TABLE}(code,name,description,roll_mode,rolls,no_drop_weight,is_enabled,owner_test_only) VALUES(?,?,?,?,?,?,?,?)`).bind(poolCode,name,text(raw.description,400),mode,rolls,noDropWeight,raw.isEnabled===false?0:1,raw.ownerTestOnly?1:0).run();poolId=Number(created.meta?.last_row_id||0)}
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
  if(action==='SAVE_NIGHTMARE_BINDINGS'){
    const mappings=(Array.isArray(body.mappings)?body.mappings:[]).slice(0,300).map(raw=>({monsterId:int(raw.monsterId,1),poolId:int(raw.poolId,0)}));
    const ids=[...new Set(mappings.map(row=>row.monsterId))];
    if(ids.length){
      const marks=ids.map(()=>'?').join(','),rows=await env.DB.prepare(`SELECT id FROM battle_monsters WHERE id IN (${marks}) AND is_active=1 AND is_boss=1 AND UPPER(COALESCE(pve_tab,''))='NIGHTMARE'`).bind(...ids).all(),valid=new Set((rows.results||[]).map(row=>Number(row.id)));
      if(ids.some(id=>!valid.has(id)))return deps.json({error:'나이트메어 보스가 아닌 대상이 드랍 설정에 포함되어 있습니다.'},400);
    }
    for(const mapping of mappings)if(mapping.poolId&&!await env.DB.prepare(`SELECT id FROM ${POOL_TABLE} WHERE id=?`).bind(mapping.poolId).first())return deps.json({error:`드랍풀 #${mapping.poolId}을 찾을 수 없습니다.`},400);
    const statements=[env.DB.prepare(`DELETE FROM ${BINDING_TABLE} WHERE source_type IN ('PVE_NIGHTMARE','PVE_NIGHTMARE_AUTO')`)];
    for(const mapping of mappings.filter(row=>row.poolId>0))for(const sourceType of ['PVE_NIGHTMARE','PVE_NIGHTMARE_AUTO'])statements.push(env.DB.prepare(`INSERT INTO ${BINDING_TABLE}(source_type,source_id,trigger_type,pool_id,priority,is_enabled) VALUES(?,?,'WIN',?,100,1)`).bind(sourceType,String(mapping.monsterId),mapping.poolId));
    await env.DB.batch(statements);invalidateUnifiedDropPoolCache();if(deps.writeAdminLog)await deps.writeAdminLog(env,admin,'NIGHTMARE_DROP_BINDINGS_SAVE','DROP_BINDING','NIGHTMARE',null,{bosses:mappings.filter(row=>row.poolId>0).length});return deps.json({ok:true,snapshot:await adminSnapshot(env)});
  }
  if(action==='SIMULATE'){
    const poolId=int(body.poolId,1),iterations=int(body.iterations,100,100000,10000),pool=await env.DB.prepare(`SELECT * FROM ${POOL_TABLE} WHERE id=?`).bind(poolId).first();if(!pool)return deps.json({error:'시뮬레이션할 드랍풀을 찾을 수 없습니다.'},404);const rows=await env.DB.prepare(`SELECT * FROM ${ENTRY_TABLE} WHERE pool_id=? AND is_enabled=1 ORDER BY sort_order,id`).bind(poolId).all(),counts=new Map(),random=Math.random;let empty=0,totalRewards=0;for(let i=0;i<iterations;i++){const rolled=rollPool(pool,rows.results||[],body.context||{},random);if(!rolled.length)empty++;for(const reward of rolled){const key=String(reward.entryId),prior=counts.get(key)||{entryId:reward.entryId,rewardName:reward.rewardName,rewardType:reward.rewardType,rewardRef:reward.rewardRef,hits:0,quantity:0};prior.hits++;prior.quantity+=reward.quantity;counts.set(key,prior);totalRewards++}}return deps.json({ok:true,iterations,empty,emptyRate:Number((empty/iterations*100).toFixed(4)),averageRewards:Number((totalRewards/iterations).toFixed(6)),results:[...counts.values()].map(row=>({...row,hitRate:Number((row.hits/iterations*100).toFixed(4)),averageQuantity:Number((row.quantity/iterations).toFixed(6))}))});
  }
  return deps.json({error:'지원하지 않는 드랍풀 작업입니다.'},400);
}
