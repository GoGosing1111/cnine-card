/* V1985 PRIME EQUIPMENT + VEHICLE DRAW */
import { readRuntimeData, cacheRuntimeData, invalidateRuntimeData } from './_runtime_data_cache.js';
import { BATTLE_SUIT_CORE_CODES,ensureBattleSuitCoreCatalog } from './_battle_suit_materials.js';
import { SKILL_CHIP_CATALOG } from '../shared/battle-suit-skill-chips.mjs';
import { ensureSkillChipFoundation } from './_skill_chips.js';
import { SUIT_CORE_BOX,SUIT_CORE_BOX_CODES } from '../shared/suit-core-box-v1.mjs';
import { NEW_HYPERDRIVE_PACK,newHyperdriveBudgetQuote } from '../shared/new-hyperdrive-pack-v1.mjs';
import { MAX_COIN_INTEGER,coinValue } from '../shared/coin-integer-v1.mjs';
import { jointResponseError,readJointBody } from './_joint_request.js';
import { sampleHyperdriveBulk } from './_new_hyperdrive_bulk.js';

const UPGRADE_KEY='safe_runtime_upgrade_v1985_prime_draw_live';
const EQUIPMENT_POOL_TABLE='prime_equipment_draw_pool_v1985';
const VEHICLE_POOL_TABLE='prime_vehicle_draw_pool_v1985';
const NEW_HYPERDRIVE_POOL_TABLE='new_hyperdrive_vehicle_pool_v1';
const NEW_HYPERDRIVE_POOL_SEED='new_hyperdrive_vehicle_pool_seed_v1';
const EXTRA_POOL_TABLE='prime_draw_extra_pool_v1987';
const PURCHASE_RECEIPTS='prime_draw_purchase_receipts_v1985';
const OPEN_RECEIPTS='prime_draw_open_receipts_v1985';
const HYPERDRIVE_RECEIPTS='new_hyperdrive_open_receipts_v1';
const OPEN_LIMIT=500;
// 개봉은 보상 INSERT 크기 때문에 500개 원자 영수증을 유지한다. 구매는 재고 수량만
// 증가하므로 PostgreSQL INTEGER와 JS 안전 정수 범위 안에서 사실상 제한 없이 허용한다.
const PURCHASE_LIMIT=2000000000;
const RARITIES=['NORMAL','MAGIC','RARE','EPIC','LEGENDARY','MYTHIC'];
const EQUIPMENT_SLOT_LABELS={WEAPON:'무기',TOP:'상의',BOTTOM:'하의',SHOES:'신발',ACCESSORY:'장신구',BATTLE_SUIT:'배틀슈트'};
const PRIME_EQUIPMENT_ITEM_CODES=new Set([...BATTLE_SUIT_CORE_CODES,...SKILL_CHIP_CATALOG.map(chip=>chip.code)]);
const PRIME_ITEM_PLACEHOLDERS=[...PRIME_EQUIPMENT_ITEM_CODES].map(()=>'?').join(',');

const PRODUCTS=Object.freeze({
  suit_core:SUIT_CORE_BOX,
  equipment:Object.freeze({
    kind:'equipment',
    itemCode:'PRIME_EQUIPMENT_SUPPLY_BOX',
    legacyItemCode:'EQUIPMENT_SUPPLY_BOX',
    name:'프라임 아머리 상자',
    subtitle:'PRIME ARMORY VAULT',
    description:'프라임 전용 확률표에 배정된 장비·아바타·배틀슈트 재료·스킬칩 중 보상 1개를 획득합니다.',
    category:'SUPPLY_BOX',
    rarity:'PRIME',
    image:'assets/ui/packs/prime-armory-equipment-box-v1.png',
    unitPrice:100000,
    legacyPrice:1000,
    priceRatio:100,
    poolVersion:'PRIME_EQUIPMENT_V1985_1',
    settingsKey:'prime_equipment_supply_box_settings_v1985',
    table:EQUIPMENT_POOL_TABLE,
    purchaseReason:'프라임 아머리 상자 구매',
    referenceType:'PRIME_EQUIPMENT_SHOP'
  }),
  vehicle:Object.freeze({
    kind:'vehicle',
    itemCode:'PRIME_VEHICLE_DRAW_TICKET',
    legacyItemCode:'VEHICLE_DRAW_TICKET',
    name:'프라임 하이퍼드라이브 팩',
    subtitle:'PRIME HYPERDRIVE',
    description:'기존 이동수단 뽑기팩과 완전히 분리된 프라임 전용 이동수단 풀에서 이동수단 1개를 획득합니다.',
    category:'VEHICLE_DRAW',
    rarity:'PRIME',
    image:'assets/items/prime-hyperdrive-vehicle-pack-v1.png',
    unitPrice:1000000,
    legacyPrice:5000,
    priceRatio:200,
    poolVersion:'PRIME_VEHICLE_V1985_1',
    settingsKey:'prime_vehicle_draw_settings_v1985',
    table:VEHICLE_POOL_TABLE,
    purchaseReason:'프라임 하이퍼드라이브 팩 구매',
    referenceType:'PRIME_VEHICLE_SHOP'
  }),
  new_hyperdrive:Object.freeze({
    ...NEW_HYPERDRIVE_PACK,
    directOpen:true,
    image:NEW_HYPERDRIVE_PACK.assetRoot+'/pack-320.webp',
    poolVersion:'NEW_HYPERDRIVE_V1',
    settingsKey:'new_hyperdrive_pack_settings_v1',
    table:NEW_HYPERDRIVE_POOL_TABLE,
    referenceType:'NEW_HYPERDRIVE_OPEN'
  })
});

let foundationPromise=null;
let newHyperdrivePoolPromise=null;
const text=(value,max=200)=>String(value??'').trim().slice(0,max);
const int=(value,min=0,max=2147483647)=>Math.max(min,Math.min(max,Math.floor(Number(value)||0)));
const parse=(value,fallback={})=>{try{const parsed=typeof value==='string'?JSON.parse(value):value;return parsed&&typeof parsed==='object'?parsed:fallback}catch{return fallback}};
const rarityIndex=value=>Math.max(0,RARITIES.indexOf(String(value||'NORMAL').toUpperCase()));
const owner=user=>Boolean(user&&String(user.role||'').toUpperCase()==='OWNER');
const bool=(value,fallback=true)=>value===undefined||value===null?fallback:(value===true||value===1||String(value)==='1');

function defaultProductSettings(product){
  if(product.directOpen)return {openEnabled:false,shopEnabled:false,shopPrice:product.unitPrice,poolVersion:product.poolVersion,revision:'0'};
  return {openEnabled:!product.coreOnly,shopEnabled:!product.coreOnly,shopPrice:product.unitPrice,poolVersion:product.poolVersion,priceRatio:product.priceRatio};
}

function cleanProductSettings(raw,product){
  const defaults=defaultProductSettings(product),value=parse(raw,{});
  const settings={...defaults,openEnabled:bool(value.openEnabled,defaults.openEnabled),shopEnabled:bool(value.shopEnabled,defaults.shopEnabled)};
  if(product.directOpen){
    const price=Number(value.shopPrice);
    settings.shopPrice=validHyperdrivePrice(price)?price:defaults.shopPrice;
    settings.revision=text(value.revision,80)||defaults.revision;
  }
  return settings;
}

function validHyperdrivePrice(price){
  return Number.isSafeInteger(price)&&price>0&&price<=Number(NEW_HYPERDRIVE_PACK.budgets[0]);
}

// V2062: 개봉/구매/설정조회가 전부 매번 app_meta 를 읽었다. 풀도 요청당 4쿼리였다.
//   공개 설정 화면만 캐시한다. 구매·개봉 및 CMS 조회는 fresh로 운영 변경을 반영한다.
const PRIME_CACHE_TTL_MS=120000;
const primeSettingsCacheKey=product=>`prime:settings:${product.settingsKey}`;
const primePoolCacheKey=product=>`prime:pool:${product.kind}`;
export function invalidatePrimeDrawCaches(env,product){
  if(product){invalidateRuntimeData(env,primeSettingsCacheKey(product));invalidateRuntimeData(env,primePoolCacheKey(product));return}
  for(const item of Object.values(PRODUCTS||{})){invalidateRuntimeData(env,primeSettingsCacheKey(item));invalidateRuntimeData(env,primePoolCacheKey(item))}
}
async function loadProductSettings(env,product,{fresh=true}={}){
  const key=primeSettingsCacheKey(product),cached=!fresh&&readRuntimeData(env,key);if(cached)return cached;
  const row=await env.DB.prepare('SELECT value FROM app_meta WHERE key=?').bind(product.settingsKey).first();
  return cacheRuntimeData(env,key,cleanProductSettings(row?.value,product),PRIME_CACHE_TTL_MS);
}

function randomUnit(){
  if(globalThis.crypto?.getRandomValues){const value=new Uint32Array(1);globalThis.crypto.getRandomValues(value);return value[0]/4294967296}
  return Math.random();
}

function weightedPick(rows){
  const total=rows.reduce((sum,row)=>sum+Math.max(0,Number(row.draw_weight||row.drawWeight||0)),0);
  let roll=randomUnit()*total;
  for(const row of rows){roll-=Math.max(0,Number(row.draw_weight||row.drawWeight||0));if(roll<=0)return row}
  return rows[rows.length-1]||null;
}

function vehiclePoolSchema(table,postgres){
  const type=postgres?'BIGINT':'INTEGER';
  const now=postgres?"to_char(timezone('UTC',CURRENT_TIMESTAMP),'YYYY-MM-DD HH24:MI:SS')":'CURRENT_TIMESTAMP';
  return `CREATE TABLE IF NOT EXISTS ${table} (garage_id ${type} PRIMARY KEY,entry_code TEXT NOT NULL,source_weight REAL NOT NULL,source_probability REAL NOT NULL,boost_multiplier REAL NOT NULL,draw_weight REAL NOT NULL,duplicate_shards ${type} NOT NULL DEFAULT 0,power_snapshot ${type} NOT NULL DEFAULT 0,rarity_snapshot TEXT NOT NULL DEFAULT 'NORMAL',presentation_enabled INTEGER NOT NULL DEFAULT 0,presentation_tier TEXT NOT NULL DEFAULT 'STANDARD',effect_key TEXT NOT NULL DEFAULT 'NONE',pool_version TEXT NOT NULL,created_at TEXT NOT NULL DEFAULT ${now},updated_at TEXT NOT NULL DEFAULT ${now})`;
}

function presentationFor(kind,percentile){
  if(percentile>=.98)return {enabled:true,tier:'CINEMATIC',effectKey:kind==='vehicle'?'NOIRE_SOVEREIGN':'ASTRAL_ARMORY'};
  if(percentile>=.90)return {enabled:true,tier:'HERO',effectKey:kind==='vehicle'?'CRIMSON_APEX':'VIOLET_CORE'};
  if(percentile>=.75)return {enabled:true,tier:'FEATURED',effectKey:kind==='vehicle'?'SCARLET_VELOCITY':'PRIME_FORGE'};
  return {enabled:false,tier:'STANDARD',effectKey:'NONE'};
}

/**
 * 기존 확률을 출발점으로 삼되 가격 상승 배율을 최고 전투력 구간에 온전히 반영한다.
 * 최저 전투력은 1배, 최고 전투력은 priceRatio배이며 중간 구간은 로그 스케일로 보간한 뒤
 * 전체 합계를 다시 100%로 정규화한다. 따라서 기존 풀과 항목은 같아도 확률 테이블은 독립이다.
 */
function buildBoostedPool(rows,{kind,priceRatio,weightField}){
  const candidates=(Array.isArray(rows)?rows:[]).map(row=>({
    ...row,
    sourceWeight:Math.max(0,Number(row?.[weightField]||0)),
    power:Math.max(0,Number(row?.total_power||0)),
    rarity:String(row?.rarity||'NORMAL').toUpperCase()
  })).filter(row=>row.sourceWeight>0);
  if(!candidates.length)return [];
  const sorted=[...candidates].sort((a,b)=>a.power-b.power||rarityIndex(a.rarity)-rarityIndex(b.rarity)||Number(a.id)-Number(b.id));
  const sourceTotal=candidates.reduce((sum,row)=>sum+row.sourceWeight,0);
  const ranked=sorted.map((row,index)=>{
    const percentile=sorted.length===1?1:index/(sorted.length-1);
    const rarityPercentile=rarityIndex(row.rarity)/(RARITIES.length-1);
    const quality=.75*percentile+.25*rarityPercentile;
    const boostMultiplier=Math.pow(Math.max(1,Number(priceRatio)||1),quality);
    const sourceProbability=row.sourceWeight/sourceTotal*100;
    return {...row,percentile,sourceProbability,boostMultiplier,boostedRaw:sourceProbability*boostMultiplier,presentation:presentationFor(kind,percentile)};
  });
  const boostedTotal=ranked.reduce((sum,row)=>sum+row.boostedRaw,0);
  let assigned=0;
  return ranked.map((row,index)=>{
    const drawWeight=index===ranked.length-1?Number((100-assigned).toFixed(6)):Number((row.boostedRaw/boostedTotal*100).toFixed(6));
    assigned+=drawWeight;
    return {...row,drawWeight:Math.max(0,drawWeight)};
  });
}

function publicEquipment(row){
  return {id:Number(row.id),code:row.code,name:row.name,rarity:String(row.rarity||'NORMAL').toUpperCase(),image:row.image_url||'',description:row.description||'',slot:row.slot,slotLabel:EQUIPMENT_SLOT_LABELS[row.slot]||row.slot,totalPower:Number(row.total_power||0),pvePower:Number(row.pve_power||0),pvpPower:Number(row.pvp_power||0)};
}

function publicVehicle(row){
  return {id:Number(row.id),code:row.code,name:row.name,rarity:String(row.rarity||'NORMAL').toUpperCase(),image:row.image_url||'',description:row.description||'',totalPower:Number(row.total_power||0),pvePower:Number(row.pve_power||0),pvpPower:Number(row.pvp_power||0)};
}

function publicAvatar(row){
  return {code:row.code,name:row.name,rarity:'AVATAR',image:row.image_url||row.lobby_image||'',description:row.description||'',roleLabel:row.role_label||'',accent:row.accent||'#82c7d7'};
}

function publicInventoryItem(row){
  return {code:row.code,name:row.name,rarity:String(row.rarity||'SPECIAL').toUpperCase(),image:row.image_url||'',description:row.description||'',category:row.category||'MATERIAL'};
}

function aggregateResults(kind,results){
  const grouped=new Map();
  for(const result of results){
    const item=result.item||result.vehicle||result.avatar,rewardType=String(result.type||kind).toUpperCase(),key=`${rewardType}:${item.code}`;
    const row=grouped.get(key)||{rewardType,code:item.code,name:item.name,rarity:item.rarity,image:item.image,category:item.category||'',count:0,newCount:0,duplicateCount:0,shardsGained:0,presentation:result.presentation||{enabled:false,tier:'STANDARD',effectKey:'NONE'}};
    row.count++;
    if(rewardType==='EQUIPMENT'||rewardType==='AVATAR'||!result.duplicate)row.newCount++;
    if(result.duplicate)row.duplicateCount++;
    row.shardsGained+=Number(result.shardsGained||0);
    grouped.set(key,row);
  }
  return [...grouped.values()].sort((a,b)=>RARITIES.indexOf(b.rarity)-RARITIES.indexOf(a.rarity)||b.count-a.count);
}

function specialQueueFrom(aggregated){
  const order={STANDARD:0,FEATURED:1,HERO:2,CINEMATIC:3};
  return aggregated.filter(row=>row.presentation?.enabled).sort((a,b)=>(order[b.presentation.tier]||0)-(order[a.presentation.tier]||0));
}

function primeSchemaStatements(postgres=false){
  const idType=postgres?'BIGINT':'INTEGER',amountType=postgres?'BIGINT':'INTEGER';
  const nowDefault=postgres?"to_char(timezone('UTC',CURRENT_TIMESTAMP),'YYYY-MM-DD HH24:MI:SS')":'CURRENT_TIMESTAMP';
  return [
    `CREATE TABLE IF NOT EXISTS ${EQUIPMENT_POOL_TABLE} (equipment_id ${idType} PRIMARY KEY,entry_code TEXT NOT NULL,source_weight REAL NOT NULL,source_probability REAL NOT NULL,boost_multiplier REAL NOT NULL,draw_weight REAL NOT NULL,power_snapshot ${amountType} NOT NULL DEFAULT 0,rarity_snapshot TEXT NOT NULL DEFAULT 'NORMAL',presentation_enabled INTEGER NOT NULL DEFAULT 0,presentation_tier TEXT NOT NULL DEFAULT 'STANDARD',effect_key TEXT NOT NULL DEFAULT 'NONE',pool_version TEXT NOT NULL,created_at TEXT NOT NULL DEFAULT ${nowDefault},updated_at TEXT NOT NULL DEFAULT ${nowDefault})`,
    vehiclePoolSchema(VEHICLE_POOL_TABLE,postgres),
    `CREATE TABLE IF NOT EXISTS ${EXTRA_POOL_TABLE} (product_kind TEXT NOT NULL,reward_type TEXT NOT NULL,reward_ref TEXT NOT NULL,draw_weight REAL NOT NULL DEFAULT 0,presentation_enabled INTEGER NOT NULL DEFAULT 0,presentation_tier TEXT NOT NULL DEFAULT 'STANDARD',effect_key TEXT NOT NULL DEFAULT 'NONE',pool_version TEXT NOT NULL,created_at TEXT NOT NULL DEFAULT ${nowDefault},updated_at TEXT NOT NULL DEFAULT ${nowDefault},PRIMARY KEY(product_kind,reward_type,reward_ref))`,
    `CREATE TABLE IF NOT EXISTS ${PURCHASE_RECEIPTS} (request_id TEXT PRIMARY KEY,user_id ${idType} NOT NULL,item_code TEXT NOT NULL,count INTEGER NOT NULL,unit_price ${amountType} NOT NULL,total_price ${amountType} NOT NULL,status TEXT NOT NULL DEFAULT 'PENDING',response_json TEXT,error_message TEXT,created_at TEXT NOT NULL DEFAULT ${nowDefault},updated_at TEXT NOT NULL DEFAULT ${nowDefault})`,
    `CREATE TABLE IF NOT EXISTS ${OPEN_RECEIPTS} (request_id TEXT PRIMARY KEY,user_id ${idType} NOT NULL,item_code TEXT NOT NULL,count INTEGER NOT NULL,pool_version TEXT NOT NULL,status TEXT NOT NULL DEFAULT 'PENDING',response_json TEXT,error_message TEXT,created_at TEXT NOT NULL DEFAULT ${nowDefault},updated_at TEXT NOT NULL DEFAULT ${nowDefault})`,
    `CREATE INDEX IF NOT EXISTS idx_prime_purchase_user_v1985 ON ${PURCHASE_RECEIPTS}(user_id,created_at DESC)`,
    `CREATE INDEX IF NOT EXISTS idx_prime_open_user_v1985 ON ${OPEN_RECEIPTS}(user_id,created_at DESC)`
  ];
}

function eligiblePool(rows,ownedAvatarCodes){
  return rows.filter(row=>row.rewardType!=='AVATAR'||!ownedAvatarCodes.has(row.code));
}

function avatarGrantStatement(env,{requestId,userId,itemCode,avatarCodes}){
  const rewards=JSON.stringify([...avatarCodes]);
  return env.DB.prepare(`WITH receipt_guard AS (SELECT 1 FROM ${OPEN_RECEIPTS} WHERE request_id=? AND user_id=? AND item_code=? AND status='PENDING'),reward_rows AS (SELECT CAST(value AS TEXT) avatar_code FROM json_each(?)) INSERT OR IGNORE INTO avatar_user_ownership_v1(user_id,avatar_code,source_type,source_ref,acquired_at,expires_at) SELECT ?,reward_rows.avatar_code,'PRIME_DRAW',?,CURRENT_TIMESTAMP,NULL FROM reward_rows CROSS JOIN receipt_guard`).bind(requestId,userId,itemCode,rewards,userId,requestId);
}

function checkedOpenMutationStatements(env,{sql,values,requestId,userId,boxCode,receiptTable=OPEN_RECEIPTS,returnColumn='item_code',expectedChanges=1}){
  const guardValues=[requestId,userId,boxCode];
  // Check the actual debit/grant, including stock lost to a concurrent opener.
  // NOT NULL count aborts the whole batch if a pending receipt changes zero rows.
  const guard=proof=>`UPDATE ${receiptTable} SET count=CASE WHEN ${proof} THEN count ELSE NULL END WHERE request_id=? AND user_id=? AND item_code=? AND status='PENDING'`;
  if(env.DB?.dialect==='postgres')return [env.DB.prepare(`WITH changed AS (${sql} RETURNING ${returnColumn}) ${guard(`(SELECT COUNT(*) FROM changed)=${expectedChanges}`)}`).bind(...values,...guardValues)];
  return [env.DB.prepare(sql).bind(...values),env.DB.prepare(guard(`changes()=${expectedChanges}`)).bind(...guardValues)];
}

// PERF-0919: 프라임 구매의 코인 차감도 같은 방식으로 확인한다. 구매는 사용자 락 대상이 아니라서
//   PostgreSQL 에서 다른 코인 사용과 겹치면 차감 0행 + 상자 지급이 가능했다.
function checkedPurchaseDebitStatements(env,{sql,values,requestId,userId,itemCode,returnColumn='id'}){
  const guardValues=[requestId,userId,itemCode];
  const guard=proof=>`UPDATE ${PURCHASE_RECEIPTS} SET count=CASE WHEN ${proof} THEN count ELSE NULL END WHERE request_id=? AND user_id=? AND item_code=? AND status='PENDING'`;
  if(env.DB?.dialect==='postgres')return [env.DB.prepare(`WITH changed AS (${sql} RETURNING ${returnColumn}) ${guard('(SELECT COUNT(*) FROM changed)=1')}`).bind(...values,...guardValues)];
  return [env.DB.prepare(sql).bind(...values),env.DB.prepare(guard('changes()=1')).bind(...guardValues)];
}
// PERF-0919: 완료 UPDATE 의 RETURNING 결과를 쓰고, 0행일 때만(동일 요청 경쟁·재고 부족) 영수증을 다시 읽는다.
async function completedReceipt(env,batched,table,requestId,userId){
  const row=batched?.at?.(-1)?.results?.[0];
  if(row?.status)return row;
  return env.DB.prepare(`SELECT status,response_json FROM ${table} WHERE request_id=? AND user_id=?`).bind(requestId,userId).first();
}

function inventoryGrantStatements(env,{requestId,userId,boxCode,itemCode,quantity}){
  const sql=`INSERT INTO cnine_user_inventory(user_id,item_code,quantity,unseen_quantity,created_at,updated_at) SELECT ?,?,?,?,CURRENT_TIMESTAMP,CURRENT_TIMESTAMP WHERE EXISTS(SELECT 1 FROM ${OPEN_RECEIPTS} WHERE request_id=? AND user_id=? AND item_code=? AND status='PENDING') ON CONFLICT(user_id,item_code) DO UPDATE SET quantity=cnine_user_inventory.quantity+excluded.quantity,unseen_quantity=cnine_user_inventory.unseen_quantity+excluded.unseen_quantity,updated_at=CURRENT_TIMESTAMP`;
  return checkedOpenMutationStatements(env,{sql,values:[userId,itemCode,quantity,quantity,requestId,userId,boxCode],requestId,userId,boxCode});
}

async function ensureTables(env){
  const postgres=env.DB?.dialect==='postgres',schema=primeSchemaStatements(postgres);
  if(postgres&&typeof env.DB.execSchema==='function')await env.DB.execSchema(schema);
  else await env.DB.batch(schema.map(statement=>env.DB.prepare(statement)));
  await env.DB.batch(Object.values(PRODUCTS).filter(product=>!product.directOpen).flatMap(product=>[
    env.DB.prepare('INSERT OR IGNORE INTO inventory_items(code,name,subtitle,description,category,rarity,image_url,sort_order,is_active) VALUES(?,?,?,?,?,?,?,?,1)').bind(product.itemCode,product.name,product.subtitle,product.description,product.category,product.rarity,product.image,product.kind==='equipment'?36:46),
    env.DB.prepare('UPDATE inventory_items SET name=?,subtitle=?,description=?,category=?,rarity=?,image_url=?,sort_order=?,is_active=1,updated_at=CURRENT_TIMESTAMP WHERE code=?').bind(product.name,product.subtitle,product.description,product.category,product.rarity,product.image,product.kind==='equipment'?36:46,product.itemCode)
  ]));
}

async function seedIndependentPools(env){
  const [equipmentRows,vehicleRows,legacyEquipmentSettings]=await Promise.all([
    env.DB.prepare('SELECT id,code,name,rarity,total_power,supply_weight FROM character_equipment_items WHERE is_active=1 AND is_public=1 AND supply_enabled=1 AND supply_weight>0 ORDER BY sort_order,id').all(),
    env.DB.prepare('SELECT id,code,name,rarity,total_power,draw_weight,duplicate_shards FROM character_garage_items WHERE is_active=1 AND is_public=1 AND draw_enabled=1 AND draw_weight>0 ORDER BY sort_order,id').all(),
    env.DB.prepare("SELECT value FROM app_meta WHERE key='equipment_supply_box_settings_v1247'").first()
  ]);
  const equipment=buildBoostedPool(equipmentRows.results||[],{kind:'equipment',priceRatio:PRODUCTS.equipment.priceRatio,weightField:'supply_weight'});
  const vehicles=buildBoostedPool(vehicleRows.results||[],{kind:'vehicle',priceRatio:PRODUCTS.vehicle.priceRatio,weightField:'draw_weight'});
  if(!equipment.length)throw new Error('프라임 장비 풀로 복사할 기존 활성 장비가 없습니다.');
  if(!vehicles.length)throw new Error('프라임 이동수단 풀로 복사할 기존 활성 이동수단이 없습니다.');
  const equipmentJson=JSON.stringify(equipment.map(row=>[Number(row.id),row.code,row.sourceWeight,row.sourceProbability,row.boostMultiplier,row.drawWeight,row.power,row.rarity,row.presentation.enabled?1:0,row.presentation.tier,row.presentation.effectKey,PRODUCTS.equipment.poolVersion]));
  const vehicleJson=JSON.stringify(vehicles.map(row=>[Number(row.id),row.code,row.sourceWeight,row.sourceProbability,row.boostMultiplier,row.drawWeight,int(row.duplicate_shards,0,100000000),row.power,row.rarity,row.presentation.enabled?1:0,row.presentation.tier,row.presentation.effectKey,PRODUCTS.vehicle.poolVersion]));
  const oldSettings={...parse(legacyEquipmentSettings?.value,{}),enabled:true,shopEnabled:false};
  await env.DB.batch([
    env.DB.prepare(`DELETE FROM ${EQUIPMENT_POOL_TABLE}`),
    env.DB.prepare(`WITH rows AS (SELECT value FROM json_each(?)) INSERT INTO ${EQUIPMENT_POOL_TABLE}(equipment_id,entry_code,source_weight,source_probability,boost_multiplier,draw_weight,power_snapshot,rarity_snapshot,presentation_enabled,presentation_tier,effect_key,pool_version) SELECT CAST(json_extract(value,'$[0]') AS INTEGER),json_extract(value,'$[1]'),CAST(json_extract(value,'$[2]') AS REAL),CAST(json_extract(value,'$[3]') AS REAL),CAST(json_extract(value,'$[4]') AS REAL),CAST(json_extract(value,'$[5]') AS REAL),CAST(json_extract(value,'$[6]') AS INTEGER),json_extract(value,'$[7]'),CAST(json_extract(value,'$[8]') AS INTEGER),json_extract(value,'$[9]'),json_extract(value,'$[10]'),json_extract(value,'$[11]') FROM rows`).bind(equipmentJson),
    env.DB.prepare(`DELETE FROM ${VEHICLE_POOL_TABLE}`),
    env.DB.prepare(`WITH rows AS (SELECT value FROM json_each(?)) INSERT INTO ${VEHICLE_POOL_TABLE}(garage_id,entry_code,source_weight,source_probability,boost_multiplier,draw_weight,duplicate_shards,power_snapshot,rarity_snapshot,presentation_enabled,presentation_tier,effect_key,pool_version) SELECT CAST(json_extract(value,'$[0]') AS INTEGER),json_extract(value,'$[1]'),CAST(json_extract(value,'$[2]') AS REAL),CAST(json_extract(value,'$[3]') AS REAL),CAST(json_extract(value,'$[4]') AS REAL),CAST(json_extract(value,'$[5]') AS REAL),CAST(json_extract(value,'$[6]') AS INTEGER),CAST(json_extract(value,'$[7]') AS INTEGER),json_extract(value,'$[8]'),CAST(json_extract(value,'$[9]') AS INTEGER),json_extract(value,'$[10]'),json_extract(value,'$[11]'),json_extract(value,'$[12]') FROM rows`).bind(vehicleJson),
    env.DB.prepare("INSERT INTO app_meta(key,value,updated_at) VALUES('equipment_supply_box_settings_v1247',?,CURRENT_TIMESTAMP) ON CONFLICT(key) DO UPDATE SET value=excluded.value,updated_at=CURRENT_TIMESTAMP").bind(JSON.stringify(oldSettings)),
    env.DB.prepare('INSERT INTO app_meta(key,value,updated_at) VALUES(?,?,CURRENT_TIMESTAMP) ON CONFLICT(key) DO UPDATE SET value=excluded.value,updated_at=CURRENT_TIMESTAMP').bind(PRODUCTS.equipment.settingsKey,JSON.stringify(defaultProductSettings(PRODUCTS.equipment))),
    env.DB.prepare('INSERT INTO app_meta(key,value,updated_at) VALUES(?,?,CURRENT_TIMESTAMP) ON CONFLICT(key) DO UPDATE SET value=excluded.value,updated_at=CURRENT_TIMESTAMP').bind(PRODUCTS.vehicle.settingsKey,JSON.stringify(defaultProductSettings(PRODUCTS.vehicle))),
    env.DB.prepare('INSERT INTO app_meta(key,value,updated_at) VALUES(?,?,CURRENT_TIMESTAMP) ON CONFLICT(key) DO UPDATE SET value=excluded.value,updated_at=CURRENT_TIMESTAMP').bind(UPGRADE_KEY,JSON.stringify({equipmentEntries:equipment.length,vehicleEntries:vehicles.length,equipmentPrice:PRODUCTS.equipment.unitPrice,vehiclePrice:PRODUCTS.vehicle.unitPrice,createdAt:new Date().toISOString()}))
  ]);
}

export async function ensurePrimeDrawFoundation(env,deps={}){
  if(foundationPromise)return foundationPromise;
  foundationPromise=(async()=>{
    if(typeof deps.ensureEquipmentFoundation==='function')await deps.ensureEquipmentFoundation(env);
    if(typeof deps.ensureVehicleDrawFoundation==='function')await deps.ensureVehicleDrawFoundation(env);
    if(typeof deps.ensureAvatarFoundation==='function')await deps.ensureAvatarFoundation(env);
    await ensureBattleSuitCoreCatalog(env);
    await ensureSkillChipFoundation(env);
    await ensureTables(env);
    const marker=await env.DB.prepare('SELECT value FROM app_meta WHERE key=?').bind(UPGRADE_KEY).first();
    if(!marker?.value)await seedIndependentPools(env);
    return true;
  })().catch(error=>{foundationPromise=null;throw error});
  return foundationPromise;
}

function ensureNewHyperdrivePool(env){
  if(newHyperdrivePoolPromise)return newHyperdrivePoolPromise;
  newHyperdrivePoolPromise=(async()=>{
    const db=env.DB,product=PRODUCTS.new_hyperdrive;
    const postgres=db.dialect==='postgres',type=postgres?'BIGINT':'INTEGER';
    const schema=[
      vehiclePoolSchema(product.table,postgres),
      `CREATE TABLE IF NOT EXISTS ${HYPERDRIVE_RECEIPTS} (request_id TEXT PRIMARY KEY,user_id ${type} NOT NULL,item_code TEXT NOT NULL,count ${type} NOT NULL,status TEXT NOT NULL,response_json TEXT,created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP)`
    ];
    if(postgres&&typeof db.execSchema==='function')await db.execSchema(schema);
    else await db.batch(schema.map(sql=>db.prepare(sql)));
    if(await db.prepare('SELECT 1 AS seeded FROM app_meta WHERE key=?').bind(NEW_HYPERDRIVE_POOL_SEED).first())return;
    // Claim the seed in the copy transaction so a second isolate cannot replace a saved pool.
    const token=crypto.randomUUID();
    const claimed='EXISTS (SELECT 1 FROM app_meta WHERE key=? AND value=?)';
    const columns='garage_id,entry_code,source_weight,source_probability,boost_multiplier,draw_weight,duplicate_shards,power_snapshot,rarity_snapshot,presentation_enabled,presentation_tier,effect_key';
    await db.batch([
      db.prepare('INSERT INTO app_meta(key,value,updated_at) VALUES(?,?,CURRENT_TIMESTAMP) ON CONFLICT(key) DO NOTHING').bind(NEW_HYPERDRIVE_POOL_SEED,token),
      db.prepare(`INSERT INTO ${product.table}(${columns},pool_version) SELECT ${columns},? FROM ${VEHICLE_POOL_TABLE} WHERE ${claimed}`).bind(product.poolVersion,NEW_HYPERDRIVE_POOL_SEED,token),
      db.prepare(`INSERT INTO ${EXTRA_POOL_TABLE}(product_kind,reward_type,reward_ref,draw_weight,presentation_enabled,presentation_tier,effect_key,pool_version) SELECT ?,reward_type,reward_ref,draw_weight,presentation_enabled,presentation_tier,effect_key,? FROM ${EXTRA_POOL_TABLE} WHERE product_kind='vehicle' AND ${claimed}`).bind(product.kind,product.poolVersion,NEW_HYPERDRIVE_POOL_SEED,token)
    ]);
  })().catch(error=>{newHyperdrivePoolPromise=null;throw error});
  return newHyperdrivePoolPromise;
}

function poolRow(row,rewardType,isExtra=false){
  const type=String(rewardType||'').toUpperCase(),code=String(row.code||row.reward_ref||row.entry_code||'');
  return {...row,id:Number(row.id||0),code,rewardType:type,rewardRef:code,poolKey:`${type}:${code}`,isExtra,removable:isExtra,presentation:{enabled:Number(row.presentation_enabled)!==0,tier:row.presentation_tier||'STANDARD',effectKey:row.effect_key||'NONE'}};
}

async function loadPool(env,product,{includeZero=false,fresh=true}={}){
  if(product.coreOnly)return loadSuitCorePool(env,{includeZero});
  // includeZero 는 CMS 편집 화면 전용이라 캐시하지 않는다.
  if(!includeZero&&!fresh){const cached=readRuntimeData(env,primePoolCacheKey(product));if(cached)return cached}
  const weightClause=includeZero?'':' AND p.draw_weight>0',extraWeightClause=includeZero?'':' AND x.draw_weight>0';
  const baseSql=product.kind==='equipment'
    ?`SELECT p.*,i.id,i.code,i.name,i.rarity,i.image_url,i.description,i.slot,i.total_power,i.pve_power,i.pvp_power FROM ${EQUIPMENT_POOL_TABLE} p JOIN character_equipment_items i ON i.id=p.equipment_id WHERE i.is_active=1 AND i.is_public=1${weightClause} ORDER BY p.draw_weight DESC,i.id`
    :`SELECT p.*,i.id,i.code,i.name,i.rarity,i.image_url,i.description,i.total_power,i.pve_power,i.pvp_power FROM ${product.table} p JOIN character_garage_items i ON i.id=p.garage_id WHERE i.is_active=1 AND i.is_public=1${weightClause} ORDER BY p.draw_weight DESC,i.id`;
  const nativeType=product.kind==='equipment'?'EQUIPMENT':'VEHICLE',nativeTable=product.kind==='equipment'?'character_equipment_items':'character_garage_items';
  const nativeExtraSql=`SELECT x.*,i.id,i.code,i.name,i.rarity,i.image_url,i.description,i.total_power,i.pve_power,i.pvp_power${product.kind==='equipment'?',i.slot':''},0 source_probability,1 boost_multiplier FROM ${EXTRA_POOL_TABLE} x JOIN ${nativeTable} i ON i.code=x.reward_ref WHERE x.product_kind=? AND x.reward_type=? AND i.is_active=1 AND i.is_public=1${extraWeightClause} ORDER BY x.draw_weight DESC,i.id`;
  const avatarSql=`SELECT x.*,a.code,a.name,'AVATAR' rarity,a.lobby_image image_url,a.description,a.role_label,a.accent,0 total_power,0 pve_power,0 pvp_power,0 source_probability,1 boost_multiplier FROM ${EXTRA_POOL_TABLE} x JOIN avatar_catalog_v1 a ON a.code=x.reward_ref WHERE x.product_kind=? AND x.reward_type='AVATAR' AND a.is_active=1 AND a.is_public=1${extraWeightClause} ORDER BY x.draw_weight DESC,a.sort_order,a.code`;
  const inventoryItemSql=`SELECT x.*,i.code,i.name,i.rarity,i.image_url,i.description,i.category,0 total_power,0 pve_power,0 pvp_power,0 source_probability,1 boost_multiplier FROM ${EXTRA_POOL_TABLE} x JOIN inventory_items i ON i.code=x.reward_ref WHERE x.product_kind='equipment' AND x.reward_type='INVENTORY_ITEM' AND i.is_active=1 AND i.code IN (${PRIME_ITEM_PLACEHOLDERS})${extraWeightClause} ORDER BY x.draw_weight DESC,i.sort_order,i.code`;
  const [baseResult,nativeExtraResult,avatarResult,inventoryItemResult]=await Promise.all([
    env.DB.prepare(baseSql).all(),
    env.DB.prepare(nativeExtraSql).bind(product.kind,nativeType).all(),
    env.DB.prepare(avatarSql).bind(product.kind).all(),
    product.kind==='equipment'?env.DB.prepare(inventoryItemSql).bind(...PRIME_EQUIPMENT_ITEM_CODES).all():Promise.resolve({results:[]})
  ]);
  const combined=[...(baseResult.results||[]).map(row=>poolRow(row,nativeType,false)),...(nativeExtraResult.results||[]).map(row=>poolRow(row,nativeType,true)),...(avatarResult.results||[]).map(row=>poolRow(row,'AVATAR',true)),...(inventoryItemResult.results||[]).map(row=>poolRow(row,'INVENTORY_ITEM',true))],seen=new Set();
  const built=combined.filter(row=>row.code&&!seen.has(row.poolKey)&&(seen.add(row.poolKey)||true));
  return includeZero?built:cacheRuntimeData(env,primePoolCacheKey(product),built,PRIME_CACHE_TTL_MS);
}

// PERF-0919: 개봉·구매용 풀 조회. loadPool 의 4문장(기본·자체 추가·아바타·아이템)을 UNION ALL 한 문장으로
//   읽는다. PostgreSQL 어댑터는 Promise.all 이어도 문장마다 순차 왕복하므로 개봉당 2~3왕복이 줄어든다.
//   운영 변경(비활성·비공개·확률 0)을 바로 반영하도록 여전히 매번 새로 읽으며, 공개 설정 화면용
//   캐시(loadPool)에는 쓰지 않는다. 각 구간의 정렬·중복 제거 순서는 loadPool 과 같다.
async function loadDrawPool(env,product){
  if(product.coreOnly)return loadSuitCorePool(env);
  const equipment=product.kind==='equipment',nativeType=equipment?'EQUIPMENT':'VEHICLE',nativeTable=equipment?'character_equipment_items':'character_garage_items';
  const baseSql=equipment
    ?`SELECT 1 pool_part,i.id,i.code,i.name,i.rarity,i.image_url,i.description,i.slot,NULL category,NULL role_label,NULL accent,i.total_power,i.pve_power,i.pvp_power,0 duplicate_shards,p.draw_weight,p.presentation_enabled,p.presentation_tier,p.effect_key,i.id pool_sort_number,'' pool_sort_text FROM ${EQUIPMENT_POOL_TABLE} p JOIN character_equipment_items i ON i.id=p.equipment_id WHERE i.is_active=1 AND i.is_public=1 AND p.draw_weight>0`
    :`SELECT 1 pool_part,i.id,i.code,i.name,i.rarity,i.image_url,i.description,NULL slot,NULL category,NULL role_label,NULL accent,i.total_power,i.pve_power,i.pvp_power,p.duplicate_shards,p.draw_weight,p.presentation_enabled,p.presentation_tier,p.effect_key,i.id pool_sort_number,'' pool_sort_text FROM ${product.table} p JOIN character_garage_items i ON i.id=p.garage_id WHERE i.is_active=1 AND i.is_public=1 AND p.draw_weight>0`;
  const nativeExtraSql=`SELECT 2 pool_part,i.id,i.code,i.name,i.rarity,i.image_url,i.description,${equipment?'i.slot':'NULL'} slot,NULL category,NULL role_label,NULL accent,i.total_power,i.pve_power,i.pvp_power,0 duplicate_shards,x.draw_weight,x.presentation_enabled,x.presentation_tier,x.effect_key,i.id pool_sort_number,'' pool_sort_text FROM ${EXTRA_POOL_TABLE} x JOIN ${nativeTable} i ON i.code=x.reward_ref WHERE x.product_kind=? AND x.reward_type=? AND i.is_active=1 AND i.is_public=1 AND x.draw_weight>0`;
  const avatarSql=`SELECT 3 pool_part,NULL id,a.code,a.name,'AVATAR' rarity,a.lobby_image image_url,a.description,NULL slot,NULL category,a.role_label,a.accent,0 total_power,0 pve_power,0 pvp_power,0 duplicate_shards,x.draw_weight,x.presentation_enabled,x.presentation_tier,x.effect_key,a.sort_order pool_sort_number,a.code pool_sort_text FROM ${EXTRA_POOL_TABLE} x JOIN avatar_catalog_v1 a ON a.code=x.reward_ref WHERE x.product_kind=? AND x.reward_type='AVATAR' AND a.is_active=1 AND a.is_public=1 AND x.draw_weight>0`;
  const inventoryItemSql=`SELECT 4 pool_part,NULL id,i.code,i.name,i.rarity,i.image_url,i.description,NULL slot,i.category,NULL role_label,NULL accent,0 total_power,0 pve_power,0 pvp_power,0 duplicate_shards,x.draw_weight,x.presentation_enabled,x.presentation_tier,x.effect_key,i.sort_order pool_sort_number,i.code pool_sort_text FROM ${EXTRA_POOL_TABLE} x JOIN inventory_items i ON i.code=x.reward_ref WHERE x.product_kind='equipment' AND x.reward_type='INVENTORY_ITEM' AND i.is_active=1 AND i.code IN (${PRIME_ITEM_PLACEHOLDERS}) AND x.draw_weight>0`;
  const parts=[baseSql,nativeExtraSql,avatarSql],bindings=[product.kind,nativeType,product.kind];
  if(equipment){parts.push(inventoryItemSql);bindings.push(...PRIME_EQUIPMENT_ITEM_CODES)}
  const result=await env.DB.prepare(`SELECT * FROM (${parts.join(' UNION ALL ')}) prime_pool ORDER BY pool_part,draw_weight DESC,pool_sort_number,pool_sort_text`).bind(...bindings).all();
  const types={1:[nativeType,false],2:[nativeType,true],3:['AVATAR',true],4:['INVENTORY_ITEM',true]},seen=new Set();
  return (result.results||[]).map(row=>{const [type,isExtra]=types[Number(row.pool_part)]||[nativeType,false];const {pool_part:_part,pool_sort_number:_sortNumber,pool_sort_text:_sortText,...rest}=row;return poolRow(rest,type,isExtra)})
    .filter(row=>row.code&&!seen.has(row.poolKey)&&(seen.add(row.poolKey)||true));
}

async function loadAdminCatalog(env){
  const [equipment,vehicle,avatar,inventoryItem]=await Promise.all([
    env.DB.prepare('SELECT id,code,name,rarity,image_url,description,total_power,pve_power,pvp_power,slot FROM character_equipment_items WHERE is_active=1 AND is_public=1 ORDER BY sort_order,id').all(),
    env.DB.prepare('SELECT id,code,name,rarity,image_url,description,total_power,pve_power,pvp_power FROM character_garage_items WHERE is_active=1 AND is_public=1 ORDER BY sort_order,id').all(),
    env.DB.prepare("SELECT code,name,'AVATAR' rarity,lobby_image image_url,description,role_label,accent,0 total_power,0 pve_power,0 pvp_power FROM avatar_catalog_v1 WHERE is_active=1 AND is_public=1 ORDER BY sort_order,code").all(),
    env.DB.prepare(`SELECT code,name,rarity,image_url,description,category,0 total_power,0 pve_power,0 pvp_power FROM inventory_items WHERE is_active=1 AND code IN (${PRIME_ITEM_PLACEHOLDERS}) ORDER BY sort_order,code`).bind(...PRIME_EQUIPMENT_ITEM_CODES).all()
  ]);
  const map=(rows,type)=>(rows.results||[]).map(row=>({poolKey:`${type}:${row.code}`,rewardType:type,rewardRef:row.code,id:Number(row.id||0),code:row.code,name:row.name,rarity:row.rarity,image:row.image_url||'',description:row.description||'',category:row.category||'',power:Number(row.total_power||0),roleLabel:row.role_label||'',accent:row.accent||''}));
  return {equipment:map(equipment,'EQUIPMENT'),vehicle:map(vehicle,'VEHICLE'),avatar:map(avatar,'AVATAR'),inventory_item:map(inventoryItem,'INVENTORY_ITEM')};
}

async function configPayload(env,user,product,{includePool=true,includeZero=false}={}){
  if(product.directOpen){
    const [wallet,pool,settings]=await Promise.all([
      env.DB.prepare('SELECT CAST(coin AS TEXT) AS coin FROM users WHERE id=?').bind(user.id).first(),
      loadPool(env,product,{includeZero}),
      loadProductSettings(env,product,{fresh:true})
    ]);
    const available=pool.some(row=>Number(row.draw_weight)>0);
    return {
      kind:product.kind,name:product.name,image:product.image,poolVersion:product.poolVersion,
      coin:wallet?.coin||'0',settings,counts:product.counts,budgets:product.budgets,openEnabled:available&&settings.openEnabled,
      shop:{enabled:available&&settings.shopEnabled,unitPrice:settings.shopPrice},
      pool:publicPool(pool)
    };
  }
  const [balance,account,pool,settings]=await Promise.all([
    env.DB.prepare('SELECT quantity FROM cnine_user_inventory WHERE user_id=? AND item_code=?').bind(user.id,product.itemCode).first(),
    env.DB.prepare('SELECT coin FROM users WHERE id=?').bind(user.id).first(),
    includePool?loadPool(env,product,{includeZero,fresh:includeZero}):Promise.resolve([]),
    loadProductSettings(env,product,{fresh:includeZero||Boolean(product.coreOnly)})
  ]);
  const available=pool.length>0;
  return {kind:product.kind,itemCode:product.itemCode,legacyItemCode:product.legacyItemCode,name:product.name,subtitle:product.subtitle,image:product.image,openEnabled:available&&settings.openEnabled,maxOpen:OPEN_LIMIT,maxPurchase:Math.min(PURCHASE_LIMIT,Math.floor(Number.MAX_SAFE_INTEGER/product.unitPrice)),batchOpenEnabled:true,poolVersion:product.poolVersion,priceRatio:product.priceRatio,balance:Number(balance?.quantity||0),ticketQuantity:Number(balance?.quantity||0),coin:Number(account?.coin||0),settings,shop:{enabled:available&&settings.shopEnabled,unitPrice:product.unitPrice,originalUnitPrice:product.unitPrice,promotionDiscountPercent:0},pool:publicPool(pool)};
}

function publicPool(pool){
  return {independent:true,legacyShared:false,entryCount:pool.length,entries:pool.map(row=>({id:Number(row.id),poolKey:row.poolKey,rewardType:row.rewardType,rewardRef:row.rewardRef,isExtra:Boolean(row.isExtra),removable:Boolean(row.removable),code:row.code,name:row.name,rarity:row.rarity,image:row.image_url||'',category:row.category||'',power:Number(row.total_power||0),sourceProbability:Number(row.source_probability||0),boostMultiplier:Number(row.boost_multiplier||0),drawWeight:Number(row.draw_weight||0),presentation:row.presentation}))};
}

async function purchase({request,env,user,product,readBody,json}){
  const body=await readBody(request),rawCount=Number(body.count),count=int(rawCount,1,PURCHASE_LIMIT),requestId=text(body.requestId||crypto.randomUUID(),120),expected=body.expectedUnitPrice===undefined?product.unitPrice:Number(body.expectedUnitPrice);
  if(!Number.isSafeInteger(rawCount)||rawCount<1||rawCount>PURCHASE_LIMIT)return json({error:`구매 수량은 1개 이상 ${PURCHASE_LIMIT.toLocaleString()}개 이하여야 합니다.`},400);
  if(!requestId)return json({error:'요청 ID가 필요합니다.'},400);
  if(!Number.isInteger(expected)||expected!==product.unitPrice)return json({error:'상품 가격이 변경되었습니다. 새 가격을 확인한 뒤 다시 주문해 주세요.',code:'PRICE_CHANGED',currentUnitPrice:product.unitPrice},409);
  if(!(await loadProductSettings(env,product)).shopEnabled)return json({error:'현재 프라임 상품 판매가 중지되어 있습니다.'},423);
  if(!(await loadDrawPool(env,product)).length)return json({error:'프라임 전용 드랍풀이 비어 있어 현재 구매할 수 없습니다.'},503);
  const prior=await env.DB.prepare(`SELECT status,response_json,item_code FROM ${PURCHASE_RECEIPTS} WHERE request_id=? AND user_id=?`).bind(requestId,user.id).first();
  if(prior&&prior.item_code!==product.itemCode)return json({error:'같은 요청 ID를 다른 프라임 상품에 재사용할 수 없습니다.'},409);
  if(prior?.status==='COMPLETED'&&prior.response_json)return json(parse(prior.response_json,{}));
  if(prior)return json({error:'같은 구매 요청을 처리 중입니다.'},409);
  const totalPrice=product.unitPrice*count;
  if(!Number.isSafeInteger(totalPrice))return json({error:'구매 총액이 허용 범위를 초과합니다. 수량을 줄여 주세요.'},400);
  const response={ok:true,itemCode:product.itemCode,count,unitPrice:product.unitPrice,totalPrice,coin:0,balance:0,requestId};
  const completeSql=env.DB?.dialect==='postgres'
    ?`UPDATE ${PURCHASE_RECEIPTS} SET status='COMPLETED',response_json=(jsonb_set(jsonb_set(?::jsonb,'{coin}',to_jsonb(COALESCE((SELECT coin FROM users WHERE id=?),0)),true),'{balance}',to_jsonb(COALESCE((SELECT quantity FROM cnine_user_inventory WHERE user_id=? AND item_code=?),0)),true))::text,updated_at=CURRENT_TIMESTAMP WHERE request_id=? AND user_id=? AND status='PENDING'`
    :`UPDATE ${PURCHASE_RECEIPTS} SET status='COMPLETED',response_json=json_set(?,'$.coin',COALESCE((SELECT coin FROM users WHERE id=?),0),'$.balance',COALESCE((SELECT quantity FROM cnine_user_inventory WHERE user_id=? AND item_code=?),0)),updated_at=CURRENT_TIMESTAMP WHERE request_id=? AND user_id=? AND status='PENDING'`;

  const statements=[
    env.DB.prepare(`INSERT INTO ${PURCHASE_RECEIPTS}(request_id,user_id,item_code,count,unit_price,total_price,status) SELECT ?,?,?,?,?,?,'PENDING' WHERE EXISTS(SELECT 1 FROM users WHERE id=? AND coin>=?)`).bind(requestId,user.id,product.itemCode,count,product.unitPrice,totalPrice,user.id,totalPrice),
    ...checkedPurchaseDebitStatements(env,{sql:`UPDATE users SET coin=coin-CAST(? AS BIGINT) WHERE id=? AND coin>=? AND EXISTS(SELECT 1 FROM ${PURCHASE_RECEIPTS} WHERE request_id=? AND user_id=? AND item_code=? AND status='PENDING')`,values:[totalPrice,user.id,totalPrice,requestId,user.id,product.itemCode],requestId,userId:user.id,itemCode:product.itemCode}),
    ...(product.coreOnly?checkedPurchaseDebitStatements(env,{sql:`INSERT INTO cnine_user_inventory(user_id,item_code,quantity,unseen_quantity,created_at,updated_at) SELECT ?,?,?,?,CURRENT_TIMESTAMP,CURRENT_TIMESTAMP WHERE EXISTS(SELECT 1 FROM ${PURCHASE_RECEIPTS} WHERE request_id=? AND user_id=? AND item_code=? AND status='PENDING') ON CONFLICT(user_id,item_code) DO UPDATE SET quantity=cnine_user_inventory.quantity+excluded.quantity,unseen_quantity=cnine_user_inventory.unseen_quantity+excluded.unseen_quantity,updated_at=CURRENT_TIMESTAMP`,values:[user.id,product.itemCode,count,count,requestId,user.id,product.itemCode],requestId,userId:user.id,itemCode:product.itemCode,returnColumn:'item_code'}):[env.DB.prepare(`INSERT INTO cnine_user_inventory(user_id,item_code,quantity,unseen_quantity,created_at,updated_at) SELECT ?,?,?,?,CURRENT_TIMESTAMP,CURRENT_TIMESTAMP WHERE EXISTS(SELECT 1 FROM ${PURCHASE_RECEIPTS} WHERE request_id=? AND user_id=? AND item_code=? AND status='PENDING') ON CONFLICT(user_id,item_code) DO UPDATE SET quantity=quantity+excluded.quantity,unseen_quantity=unseen_quantity+excluded.unseen_quantity,updated_at=CURRENT_TIMESTAMP`).bind(user.id,product.itemCode,count,count,requestId,user.id,product.itemCode)]),
    env.DB.prepare(`INSERT INTO coin_logs(user_id,change_amount,balance_after,reason) SELECT ?,-?,coin,? FROM users WHERE id=? AND EXISTS(SELECT 1 FROM ${PURCHASE_RECEIPTS} WHERE request_id=? AND user_id=? AND item_code=? AND status='PENDING')`).bind(user.id,totalPrice,product.purchaseReason,user.id,requestId,user.id,product.itemCode),
    env.DB.prepare(`INSERT INTO inventory_logs(user_id,item_code,change_amount,balance_after,reason,reference_type,reference_id) SELECT ?,?,?,quantity,'SHOP_PURCHASE',?,? FROM cnine_user_inventory WHERE user_id=? AND item_code=? AND EXISTS(SELECT 1 FROM ${PURCHASE_RECEIPTS} WHERE request_id=? AND user_id=? AND item_code=? AND status='PENDING')`).bind(user.id,product.itemCode,count,product.referenceType,requestId,user.id,product.itemCode,requestId,user.id,product.itemCode)
  ];

  statements.push(env.DB.prepare(`${completeSql} RETURNING status,response_json`).bind(JSON.stringify(response),user.id,user.id,product.itemCode,requestId,user.id));
  const batched=await env.DB.batch(statements);
  const receipt=await completedReceipt(env,batched,PURCHASE_RECEIPTS,requestId,user.id);
  if(!receipt)return json({error:'코인이 부족합니다.'},409);
  if(receipt.status!=='COMPLETED'||!receipt.response_json)return json({error:'상품 구매 처리에 실패했습니다.'},500);
  return json(parse(receipt.response_json,{}));
}

async function openEquipment({request,env,user,product,readBody,json}){
  const body=await readBody(request),rawCount=Number(body.count??body.quantity),count=int(rawCount,1,OPEN_LIMIT),requestId=text(body.requestId||crypto.randomUUID(),120);
  if(!Number.isInteger(rawCount)||rawCount<1||rawCount>OPEN_LIMIT)return json({error:`${product.name}는 1개 이상 ${OPEN_LIMIT}개 이하로 개봉할 수 있습니다.`},400);
  if(body.poolVersion&&body.poolVersion!==product.poolVersion)return json({error:'상품 확률표 버전이 변경되었습니다. 다시 확인해 주세요.',code:'POOL_VERSION_CHANGED',poolVersion:product.poolVersion},409);
  if(!(await loadProductSettings(env,product)).openEnabled)return json({error:`현재 ${product.name} 개봉이 중지되어 있습니다.`},423);
  const prior=await env.DB.prepare(`SELECT status,response_json,item_code FROM ${OPEN_RECEIPTS} WHERE request_id=? AND user_id=?`).bind(requestId,user.id).first();
  if(prior&&prior.item_code!==product.itemCode)return json({error:'같은 요청 ID를 다른 프라임 상품에 재사용할 수 없습니다.'},409);
  if(prior?.status==='COMPLETED'&&prior.response_json)return json(parse(prior.response_json,{}));
  if(prior)return json({error:'같은 개봉 요청을 처리 중입니다.'},409);
  const [poolRows,stock,ownedAvatarRows]=await Promise.all([loadDrawPool(env,product),env.DB.prepare('SELECT quantity FROM cnine_user_inventory WHERE user_id=? AND item_code=?').bind(user.id,product.itemCode).first(),env.DB.prepare('SELECT avatar_code FROM avatar_user_ownership_v1 WHERE user_id=? AND (expires_at IS NULL OR expires_at>CURRENT_TIMESTAMP)').bind(user.id).all()]);
  if(!poolRows.length)return json({error:'프라임 장비 전용 드랍풀이 비어 있습니다.'},503);
  if(Number(stock?.quantity||0)<count)return json({error:`${product.name} ${count}개가 필요합니다.`},409);
  const ownedAvatarCodes=new Set((ownedAvatarRows.results||[]).map(row=>String(row.avatar_code))),newAvatarCodes=new Set(),inventoryItemCounts=new Map(),results=[];
  for(let index=0;index<count;index++){
    const candidates=eligiblePool(poolRows,ownedAvatarCodes),row=weightedPick(candidates);
    if(!row)return json({error:'획득 가능한 프라임 보상이 없습니다.'},409);
    if(row.rewardType==='AVATAR'){ownedAvatarCodes.add(row.code);newAvatarCodes.add(row.code);results.push({type:'AVATAR',avatar:publicAvatar(row),presentation:row.presentation})}
    else if(row.rewardType==='INVENTORY_ITEM'&&PRIME_EQUIPMENT_ITEM_CODES.has(row.code)){
      inventoryItemCounts.set(row.code,(inventoryItemCounts.get(row.code)||0)+1);
      results.push({type:'INVENTORY_ITEM',item:publicInventoryItem(row),duplicate:false,presentation:row.presentation});
    }
    else results.push({type:'EQUIPMENT',item:publicEquipment(row),presentation:row.presentation});
  }
  const aggregated=aggregateResults('equipment',results),specialQueue=specialQueueFrom(aggregated);
  const response={ok:true,kind:product.kind,itemCode:product.itemCode,count,poolVersion:product.poolVersion,receiptId:requestId,requestId,results,aggregated,specialQueue,remainingQuantity:0};
  const rewardRows=JSON.stringify(results.filter(result=>result.type==='EQUIPMENT').map((result,index)=>[Number(result.item.id),index]));
  const completeSql=env.DB?.dialect==='postgres'
    ?`UPDATE ${OPEN_RECEIPTS} SET status='COMPLETED',response_json=(jsonb_set(?::jsonb,'{remainingQuantity}',to_jsonb(COALESCE((SELECT quantity FROM cnine_user_inventory WHERE user_id=? AND item_code=?),0)),true))::text,updated_at=CURRENT_TIMESTAMP WHERE request_id=? AND user_id=? AND status='PENDING'`
    :`UPDATE ${OPEN_RECEIPTS} SET status='COMPLETED',response_json=json_set(?,'$.remainingQuantity',COALESCE((SELECT quantity FROM cnine_user_inventory WHERE user_id=? AND item_code=?),0)),updated_at=CURRENT_TIMESTAMP WHERE request_id=? AND user_id=? AND status='PENDING'`;
  const statements=[
    env.DB.prepare(`INSERT INTO ${OPEN_RECEIPTS}(request_id,user_id,item_code,count,pool_version,status) SELECT ?,?,?,?,?,'PENDING' WHERE EXISTS(SELECT 1 FROM cnine_user_inventory WHERE user_id=? AND item_code=? AND quantity>=?)`).bind(requestId,user.id,product.itemCode,count,product.poolVersion,user.id,product.itemCode,count),
    ...checkedOpenMutationStatements(env,{sql:`UPDATE cnine_user_inventory SET quantity=quantity-?,unseen_quantity=MIN(unseen_quantity,quantity-?),updated_at=CURRENT_TIMESTAMP WHERE user_id=? AND item_code=? AND quantity>=? AND EXISTS(SELECT 1 FROM ${OPEN_RECEIPTS} WHERE request_id=? AND user_id=? AND item_code=? AND status='PENDING')`,values:[count,count,user.id,product.itemCode,count,requestId,user.id,product.itemCode],requestId,userId:user.id,boxCode:product.itemCode})
  ];
  if(results.some(result=>result.type==='EQUIPMENT'))statements.push(env.DB.prepare(`WITH receipt_guard AS (SELECT 1 FROM ${OPEN_RECEIPTS} WHERE request_id=? AND user_id=? AND item_code=? AND status='PENDING'),reward_rows AS (SELECT CAST(json_extract(value,'$[0]') AS INTEGER) equipment_id,CAST(json_extract(value,'$[1]') AS INTEGER) reward_index FROM json_each(?)) INSERT INTO user_equipment_instances(user_id,equipment_id,source_type,source_id,request_id) SELECT ?,reward_rows.equipment_id,'PRIME_EQUIPMENT_DRAW',?,?||reward_rows.reward_index FROM reward_rows CROSS JOIN receipt_guard`).bind(requestId,user.id,product.itemCode,rewardRows,user.id,requestId,`PRIME-EQ:${requestId}:`));
  for(const [itemCode,quantity] of inventoryItemCounts){
    statements.push(
      ...inventoryGrantStatements(env,{requestId,userId:user.id,boxCode:product.itemCode,itemCode,quantity}),
      env.DB.prepare(`INSERT INTO inventory_logs(user_id,item_code,change_amount,balance_after,reason,reference_type,reference_id) SELECT ?,?,?,quantity,'PRIME_EQUIPMENT_REWARD','PRIME_EQUIPMENT_OPEN',? FROM cnine_user_inventory WHERE user_id=? AND item_code=? AND EXISTS(SELECT 1 FROM ${OPEN_RECEIPTS} WHERE request_id=? AND user_id=? AND item_code=? AND status='PENDING')`).bind(user.id,itemCode,quantity,requestId,user.id,itemCode,requestId,user.id,product.itemCode)
    );
  }
  if(newAvatarCodes.size)statements.push(avatarGrantStatement(env,{requestId,userId:user.id,itemCode:product.itemCode,avatarCodes:newAvatarCodes}));
  statements.push(
    env.DB.prepare(`INSERT INTO inventory_logs(user_id,item_code,change_amount,balance_after,reason,reference_type,reference_id) SELECT ?,?,-?,quantity,'프라임 아머리 상자 개봉','PRIME_EQUIPMENT_OPEN',? FROM cnine_user_inventory WHERE user_id=? AND item_code=? AND EXISTS(SELECT 1 FROM ${OPEN_RECEIPTS} WHERE request_id=? AND user_id=? AND item_code=? AND status='PENDING')`).bind(user.id,product.itemCode,count,requestId,user.id,product.itemCode,requestId,user.id,product.itemCode),
    env.DB.prepare(`${completeSql} RETURNING status,response_json`).bind(JSON.stringify(response),user.id,product.itemCode,requestId,user.id)
  );
  const batched=await env.DB.batch(statements);
  const receipt=await completedReceipt(env,batched,OPEN_RECEIPTS,requestId,user.id);
  if(!receipt)return json({error:`${product.name} ${count}개가 필요합니다.`},409);
  if(receipt.status!=='COMPLETED'||!receipt.response_json)return json({error:'프라임 장비 개봉 처리에 실패했습니다.'},500);
  return json(parse(receipt.response_json,{}));
}

function hyperdriveReceiptId(userId,requestId){
  return typeof requestId==='string'&&/^[a-z0-9_-]{1,80}$/i.test(requestId)?`new-hyperdrive:${userId}:${requestId}`:null;
}

async function openVehicle({request,env,user,product,readBody,json}){
  const body=await readBody(request),rawCount=Number(body.count??body.quantity),count=int(rawCount,1,OPEN_LIMIT),requestId=text(body.requestId||crypto.randomUUID(),120);
  if(!Number.isInteger(rawCount)||rawCount<1||rawCount>OPEN_LIMIT)return json({error:`프라임 하이퍼드라이브 팩은 1개 이상 ${OPEN_LIMIT}개 이하로 개봉할 수 있습니다.`},400);
  if(body.poolVersion&&body.poolVersion!==product.poolVersion)return json({error:'상품 확률표 버전이 변경되었습니다. 다시 확인해 주세요.',code:'POOL_VERSION_CHANGED',poolVersion:product.poolVersion},409);
  if(!(await loadProductSettings(env,product)).openEnabled)return json({error:'현재 프라임 하이퍼드라이브 팩 개봉이 중지되어 있습니다.'},423);
  const prior=await env.DB.prepare(`SELECT status,response_json,item_code FROM ${OPEN_RECEIPTS} WHERE request_id=? AND user_id=?`).bind(requestId,user.id).first();
  if(prior&&prior.item_code!==product.itemCode)return json({error:'같은 요청 ID를 다른 프라임 상품에 재사용할 수 없습니다.'},409);
  if(prior?.status==='COMPLETED'&&prior.response_json){const cached=parse(prior.response_json,{}),balances=await env.DB.prepare(`SELECT COALESCE((SELECT quantity FROM cnine_user_inventory WHERE user_id=? AND item_code=?),0) remainingQuantity,COALESCE((SELECT quantity FROM cnine_user_inventory WHERE user_id=? AND item_code='MASTER_STAR'),0) masterStarQuantity,COALESCE((SELECT card_shards FROM users WHERE id=?),0) cardShards`).bind(user.id,product.itemCode,user.id,user.id).first();return json({...cached,...balances})}
  if(prior)return json({error:'같은 개봉 요청을 처리 중입니다.'},409);
  const [poolRows,stock,ownedRows,ownedAvatarRows]=await Promise.all([loadDrawPool(env,product),env.DB.prepare('SELECT quantity FROM cnine_user_inventory WHERE user_id=? AND item_code=?').bind(user.id,product.itemCode).first(),env.DB.prepare('SELECT garage_id FROM user_garage_vehicles WHERE user_id=?').bind(user.id).all(),env.DB.prepare('SELECT avatar_code FROM avatar_user_ownership_v1 WHERE user_id=? AND (expires_at IS NULL OR expires_at>CURRENT_TIMESTAMP)').bind(user.id).all()]);
  if(!poolRows.length)return json({error:'프라임 이동수단 전용 드랍풀이 비어 있습니다.'},503);
  if(Number(stock?.quantity||0)<count)return json({error:`프라임 하이퍼드라이브 팩이 ${count}개 필요합니다.`},409);
  const ownedIds=new Set((ownedRows.results||[]).map(row=>Number(row.garage_id))),newIds=new Set(),ownedAvatarCodes=new Set((ownedAvatarRows.results||[]).map(row=>String(row.avatar_code))),newAvatarCodes=new Set(),results=[];let totalShards=0,totalStars=0;
  for(let index=0;index<count;index++){
    const candidates=eligiblePool(poolRows,ownedAvatarCodes),row=weightedPick(candidates),stars=randomUnit()*100<1?1:0;
    if(!row)return json({error:'획득 가능한 프라임 보상이 없습니다.'},409);
    if(row.rewardType==='AVATAR'){ownedAvatarCodes.add(row.code);newAvatarCodes.add(row.code);totalStars+=stars;results.push({type:'AVATAR',avatar:publicAvatar(row),duplicate:false,shardsGained:0,masterStarsGained:stars,presentation:row.presentation});continue}
    const id=Number(row.id),duplicate=ownedIds.has(id),shards=duplicate?int(row.duplicate_shards,0,100000000):0;
    ownedIds.add(id);if(!duplicate)newIds.add(id);totalShards+=shards;totalStars+=stars;
    results.push({type:'VEHICLE',vehicle:publicVehicle(row),duplicate,shardsGained:shards,masterStarsGained:stars,presentation:row.presentation});
  }
  const aggregated=aggregateResults('vehicle',results),specialQueue=specialQueueFrom(aggregated);
  const response={ok:true,kind:'vehicle',itemCode:product.itemCode,count,poolVersion:product.poolVersion,receiptId:requestId,requestId,results,aggregated,specialQueue,shardsGained:totalShards,masterStarsGained:totalStars,remainingQuantity:0,masterStarQuantity:0,cardShards:0};
  const statements=[
    env.DB.prepare(`INSERT INTO ${OPEN_RECEIPTS}(request_id,user_id,item_code,count,pool_version,status) SELECT ?,?,?,?,?,'PENDING' WHERE EXISTS(SELECT 1 FROM cnine_user_inventory WHERE user_id=? AND item_code=? AND quantity>=?)`).bind(requestId,user.id,product.itemCode,count,product.poolVersion,user.id,product.itemCode,count),
    // PERF-0919: 장비 개봉과 같은 차감 확인(PostgreSQL 동시 개봉 시 0행 차감 + 보상 지급 차단).
    ...checkedOpenMutationStatements(env,{sql:`UPDATE cnine_user_inventory SET quantity=quantity-?,unseen_quantity=MIN(unseen_quantity,quantity-?),updated_at=CURRENT_TIMESTAMP WHERE user_id=? AND item_code=? AND quantity>=? AND EXISTS(SELECT 1 FROM ${OPEN_RECEIPTS} WHERE request_id=? AND user_id=? AND item_code=? AND status='PENDING')`,values:[count,count,user.id,product.itemCode,count,requestId,user.id,product.itemCode],requestId,userId:user.id,boxCode:product.itemCode})
  ];
  if(newIds.size)statements.push(env.DB.prepare(`WITH receipt_guard AS (SELECT 1 FROM ${OPEN_RECEIPTS} WHERE request_id=? AND user_id=? AND item_code=? AND status='PENDING') INSERT OR IGNORE INTO user_garage_vehicles(user_id,garage_id,source_type,source_id) SELECT ?,CAST(value AS INTEGER),'PRIME_VEHICLE_DRAW',?||CAST(value AS INTEGER) FROM json_each(?) CROSS JOIN receipt_guard`).bind(requestId,user.id,product.itemCode,user.id,`${requestId}:`,JSON.stringify([...newIds])));
  if(newAvatarCodes.size)statements.push(avatarGrantStatement(env,{requestId,userId:user.id,itemCode:product.itemCode,avatarCodes:newAvatarCodes}));
  statements.push(
    env.DB.prepare(`UPDATE users SET card_shards=card_shards+? WHERE id=? AND ?>0 AND EXISTS(SELECT 1 FROM ${OPEN_RECEIPTS} WHERE request_id=? AND user_id=? AND item_code=? AND status='PENDING')`).bind(totalShards,user.id,totalShards,requestId,user.id,product.itemCode),
    env.DB.prepare(`INSERT INTO cnine_user_inventory(user_id,item_code,quantity,unseen_quantity,created_at,updated_at) SELECT ?,'MASTER_STAR',?,?,CURRENT_TIMESTAMP,CURRENT_TIMESTAMP WHERE ?>0 AND EXISTS(SELECT 1 FROM ${OPEN_RECEIPTS} WHERE request_id=? AND user_id=? AND item_code=? AND status='PENDING') ON CONFLICT(user_id,item_code) DO UPDATE SET quantity=quantity+excluded.quantity,unseen_quantity=unseen_quantity+excluded.unseen_quantity,updated_at=CURRENT_TIMESTAMP`).bind(user.id,totalStars,totalStars,totalStars,requestId,user.id,product.itemCode),
    env.DB.prepare(`INSERT INTO inventory_logs(user_id,item_code,change_amount,balance_after,reason,reference_type,reference_id) SELECT ?,?,-?,quantity,'프라임 하이퍼드라이브 팩 개봉','PRIME_VEHICLE_OPEN',? FROM cnine_user_inventory WHERE user_id=? AND item_code=? AND EXISTS(SELECT 1 FROM ${OPEN_RECEIPTS} WHERE request_id=? AND user_id=? AND item_code=? AND status='PENDING')`).bind(user.id,product.itemCode,count,requestId,user.id,product.itemCode,requestId,user.id,product.itemCode),
    env.DB.prepare(`INSERT INTO shard_logs(user_id,change_amount,balance_after,reason) SELECT ?,?,card_shards,'프라임 이동수단 중복 획득' FROM users WHERE id=? AND ?>0 AND EXISTS(SELECT 1 FROM ${OPEN_RECEIPTS} WHERE request_id=? AND user_id=? AND item_code=? AND status='PENDING')`).bind(user.id,totalShards,user.id,totalShards,requestId,user.id,product.itemCode),
    env.DB.prepare(`INSERT INTO inventory_logs(user_id,item_code,change_amount,balance_after,reason,reference_type,reference_id) SELECT ?,'MASTER_STAR',?,quantity,'PRIME_VEHICLE_BONUS','PRIME_VEHICLE_OPEN',? FROM cnine_user_inventory WHERE user_id=? AND item_code='MASTER_STAR' AND ?>0 AND EXISTS(SELECT 1 FROM ${OPEN_RECEIPTS} WHERE request_id=? AND user_id=? AND item_code=? AND status='PENDING')`).bind(user.id,totalStars,requestId,user.id,totalStars,requestId,user.id,product.itemCode)
  );
  const completeSql=env.DB?.dialect==='postgres'
    ?`UPDATE ${OPEN_RECEIPTS} SET status='COMPLETED',response_json=(jsonb_set(jsonb_set(jsonb_set(?::jsonb,'{remainingQuantity}',to_jsonb(COALESCE((SELECT quantity FROM cnine_user_inventory WHERE user_id=? AND item_code=?),0)),true),'{masterStarQuantity}',to_jsonb(COALESCE((SELECT quantity FROM cnine_user_inventory WHERE user_id=? AND item_code='MASTER_STAR'),0)),true),'{cardShards}',to_jsonb(COALESCE((SELECT card_shards FROM users WHERE id=?),0)),true))::text,updated_at=CURRENT_TIMESTAMP WHERE request_id=? AND user_id=? AND status='PENDING'`
    :`UPDATE ${OPEN_RECEIPTS} SET status='COMPLETED',response_json=json_set(?,'$.remainingQuantity',COALESCE((SELECT quantity FROM cnine_user_inventory WHERE user_id=? AND item_code=?),0),'$.masterStarQuantity',COALESCE((SELECT quantity FROM cnine_user_inventory WHERE user_id=? AND item_code='MASTER_STAR'),0),'$.cardShards',COALESCE((SELECT card_shards FROM users WHERE id=?),0)),updated_at=CURRENT_TIMESTAMP WHERE request_id=? AND user_id=? AND status='PENDING'`;
  statements.push(env.DB.prepare(`${completeSql} RETURNING status,response_json`).bind(JSON.stringify(response),user.id,product.itemCode,user.id,user.id,requestId,user.id));
  const batched=await env.DB.batch(statements);
  const receipt=await completedReceipt(env,batched,OPEN_RECEIPTS,requestId,user.id);
  if(!receipt)return json({error:`프라임 하이퍼드라이브 팩이 ${count}개 필요합니다.`},409);
  if(receipt.status!=='COMPLETED'||!receipt.response_json)return json({error:'프라임 이동수단 개봉 처리에 실패했습니다.'},500);
  return json(parse(receipt.response_json,{}));
}

async function openNewHyperdrive({body,env,user,product,json}){
  const {count,budget,expectedUnitPrice,expectedRevision}=body;
  const requestId=hyperdriveReceiptId(user.id,body.requestId),bulk=budget!==undefined;
  if(!requestId||!Number.isSafeInteger(count)||count<1||(bulk?!product.budgets.includes(budget):!product.counts.includes(count))){
    return json({error:'개봉 횟수 또는 일괄 개봉 예산을 확인해 주세요.',code:'INVALID_DRAW'},400);
  }
  const db=env.DB;
  const prepare=(sql,...values)=>db.prepare(sql).bind(...values);
  const prior=await prepare(`SELECT status,response_json FROM ${HYPERDRIVE_RECEIPTS} WHERE request_id=? AND user_id=?`,requestId,user.id).first();
  if(prior?.status==='COMPLETED'){
    const saved=parse(prior.response_json);
    if(saved.count!==count||saved.unitPrice!==expectedUnitPrice||(saved.budget??undefined)!==budget){
      return json({error:'이전 개봉 요청과 가격, 횟수 또는 예산이 다릅니다.',code:'REQUEST_MISMATCH'},409);
    }
    return json(saved);
  }
  if(prior)return json({error:'같은 개봉 요청을 처리 중입니다.'},409);

  const row=await prepare('SELECT value FROM app_meta WHERE key=?',product.settingsKey).first();
  const settings=cleanProductSettings(row?.value,product),unitPrice=settings.shopPrice;
  if(!settings.openEnabled||!settings.shopEnabled)return json({error:'뉴 하이퍼드라이브팩은 판매 준비 중입니다.',code:'PACK_CLOSED'},423);
  if(expectedRevision!==settings.revision||expectedUnitPrice!==unitPrice)return json({error:'개봉 조건이 변경되었습니다. 가격과 확률을 다시 확인해 주세요.',code:'PACK_CHANGED'},409);
  const quote=bulk?newHyperdriveBudgetQuote(unitPrice,budget):{count,cost:count*unitPrice,unused:0};
  if(quote.count!==count)return json({error:'예산에 맞는 개봉 횟수를 확인해 주세요.',code:'INVALID_DRAW'},400);
  const wallet=await prepare('SELECT CAST(coin AS TEXT) AS coin,CAST(card_shards AS TEXT) AS shards FROM users WHERE id=?',user.id).first();
  const insufficient=()=>json({error:'코인이 부족합니다.',code:'INSUFFICIENT_COINS'},409);
  if(BigInt(wallet?.coin||0)<BigInt(quote.cost))return insufficient();

  const [pool,vehicleRows,avatarRows]=await Promise.all([
    loadDrawPool(env,product),
    prepare('SELECT garage_id FROM user_garage_vehicles WHERE user_id=?',user.id).all(),
    prepare('SELECT avatar_code FROM avatar_user_ownership_v1 WHERE user_id=? AND (expires_at IS NULL OR expires_at>CURRENT_TIMESTAMP)',user.id).all()
  ]);
  const ownedVehicles=new Set(vehicleRows.results.map(entry=>Number(entry.garage_id)));
  const ownedAvatars=new Set(avatarRows.results.map(entry=>entry.avatar_code));
  const plan=sampleHyperdriveBulk(pool,count,ownedAvatars);
  if(!plan)return json({error:'획득 가능한 보상이 없습니다.',code:'POOL_EMPTY'},503);

  const vehicles=[],avatars=[];
  let shards=0n;
  const aggregated=plan.draws.map(({row:reward,count:quantity})=>{
    const avatar=reward.rewardType==='AVATAR';
    const item=avatar?publicAvatar(reward):publicVehicle(reward);
    const newCount=avatar||!ownedVehicles.has(item.id)?1:0;
    const duplicateCount=quantity-newCount;
    if(avatar)avatars.push(item.code);
    else if(newCount)vehicles.push(item.id);
    const gained=avatar?0n:BigInt(duplicateCount)*BigInt(int(reward.duplicate_shards,0,100000000));
    shards+=gained;
    return {rewardType:reward.rewardType,code:item.code,name:item.name,rarity:item.rarity,image:item.image,
      count:quantity,newCount,duplicateCount,shardsGained:gained.toString(),presentation:reward.presentation};
  }).sort((a,b)=>RARITIES.indexOf(b.rarity)-RARITIES.indexOf(a.rarity)||b.count-a.count);
  if(shards+BigInt(wallet.shards||0)>MAX_COIN_INTEGER){
    return json({error:'카드 조각 보유 한도를 초과합니다. 개봉 횟수를 줄여 주세요.',code:'REWARD_CAPACITY'},409);
  }
  const receiptKeys=[requestId,user.id,product.itemCode];
  const guard=`EXISTS(SELECT 1 FROM ${HYPERDRIVE_RECEIPTS} WHERE request_id=? AND user_id=? AND item_code=? AND status='PENDING')`;
  const checked=(sql,values,returnColumn,expectedChanges=1)=>checkedOpenMutationStatements(env,{
    sql,values,requestId,userId:user.id,boxCode:product.itemCode,receiptTable:HYPERDRIVE_RECEIPTS,returnColumn,expectedChanges
  });
  const postgres=db.dialect==='postgres';
  const statements=[
    prepare(`INSERT INTO ${HYPERDRIVE_RECEIPTS}(request_id,user_id,item_code,count,status) SELECT ?,?,?,?,'PENDING' WHERE EXISTS(SELECT 1 FROM users WHERE id=? AND coin>=?)`,...receiptKeys,count,user.id,quote.cost),
    ...(postgres?[prepare('SELECT key FROM app_meta WHERE key=? FOR SHARE',product.settingsKey)]:[]),
    ...checked(`UPDATE users SET coin=coin-CAST(? AS BIGINT) WHERE id=? AND coin>=? AND EXISTS(SELECT 1 FROM app_meta WHERE key=? AND value=?) AND ${guard}`,
      [quote.cost,user.id,quote.cost,product.settingsKey,row.value,...receiptKeys],'id'),
    ...checked(`INSERT INTO coin_logs(user_id,change_amount,balance_after,reason) SELECT id,?,coin,? FROM users WHERE id=? AND ${guard}`,
      [-quote.cost,product.name+' '+requestId,user.id,...receiptKeys],'user_id')
  ];
  if(vehicles.length)statements.push(...checked(
    `INSERT INTO user_garage_vehicles(user_id,garage_id,source_type,source_id) SELECT ?,CAST(value AS INTEGER),?,?||CAST(value AS INTEGER) FROM json_each(?) WHERE ${guard} ON CONFLICT(user_id,garage_id) DO NOTHING`,
    [user.id,product.referenceType,requestId+':',JSON.stringify(vehicles),...receiptKeys],'garage_id',vehicles.length));
  if(avatars.length)statements.push(...checked(
    `INSERT INTO avatar_user_ownership_v1(user_id,avatar_code,source_type,source_ref,acquired_at,expires_at) SELECT ?,CAST(value AS TEXT),?,?,CURRENT_TIMESTAMP,NULL FROM json_each(?) WHERE ${guard}
     ON CONFLICT(user_id,avatar_code) DO UPDATE SET source_type=excluded.source_type,source_ref=excluded.source_ref,acquired_at=excluded.acquired_at,expires_at=NULL
     WHERE avatar_user_ownership_v1.expires_at IS NOT NULL AND avatar_user_ownership_v1.expires_at<=CURRENT_TIMESTAMP`,
    [user.id,product.referenceType,requestId,JSON.stringify(avatars),...receiptKeys],'avatar_code',avatars.length));
  if(shards>0n)statements.push(
    ...checked(`UPDATE users SET card_shards=card_shards+CAST(? AS BIGINT) WHERE id=? AND card_shards<=CAST(? AS BIGINT) AND ${guard}`,
      [shards.toString(),user.id,(MAX_COIN_INTEGER-shards).toString(),...receiptKeys],'id'),
    ...checked(`INSERT INTO shard_logs(user_id,change_amount,balance_after,reason) SELECT id,CAST(? AS BIGINT),card_shards,? FROM users WHERE id=? AND ${guard}`,
      [shards.toString(),product.name+' 중복 획득',user.id,...receiptKeys],'user_id'));
  if(plan.stars>0){
    const starHeadroom=(MAX_COIN_INTEGER-BigInt(plan.stars)).toString();
    statements.push(
      ...checked(`INSERT INTO cnine_user_inventory(user_id,item_code,quantity,unseen_quantity,created_at,updated_at) SELECT ?,'MASTER_STAR',?,?,CURRENT_TIMESTAMP,CURRENT_TIMESTAMP WHERE ${guard}
        ON CONFLICT(user_id,item_code) DO UPDATE SET quantity=cnine_user_inventory.quantity+excluded.quantity,unseen_quantity=cnine_user_inventory.unseen_quantity+excluded.unseen_quantity,updated_at=CURRENT_TIMESTAMP
        WHERE cnine_user_inventory.quantity<=CAST(? AS BIGINT) AND cnine_user_inventory.unseen_quantity<=CAST(? AS BIGINT)`,
        [user.id,plan.stars,plan.stars,...receiptKeys,starHeadroom,starHeadroom],'item_code'),
      ...checked(`INSERT INTO inventory_logs(user_id,item_code,change_amount,balance_after,reason,reference_type,reference_id) SELECT user_id,item_code,?,quantity,'NEW_HYPERDRIVE_BONUS',?,? FROM cnine_user_inventory WHERE user_id=? AND item_code='MASTER_STAR' AND ${guard}`,
        [plan.stars,product.referenceType,requestId,user.id,...receiptKeys],'item_code'));
  }

  const response={ok:true,kind:product.kind,itemCode:product.itemCode,count,poolVersion:product.poolVersion,receiptId:requestId,requestId:body.requestId,
    unitPrice,totalPrice:quote.cost,...(bulk?{budget,unused:quote.unused}:{}),aggregated,specialQueue:specialQueueFrom(aggregated),
    shardsGained:coinValue(shards),masterStarsGained:plan.stars};
  const walletCoin='CAST((SELECT coin FROM users WHERE id=?) AS TEXT)',walletShards='CAST((SELECT card_shards FROM users WHERE id=?) AS TEXT)';
  const responseJson=postgres
    ?`jsonb_set(jsonb_set(?::jsonb,'{coin}',to_jsonb(${walletCoin})),'{cardShards}',to_jsonb(${walletShards}))::text`
    :`json_set(?,'$.coin',${walletCoin},'$.cardShards',${walletShards})`;
  statements.push(prepare(`UPDATE ${HYPERDRIVE_RECEIPTS} SET status='COMPLETED',response_json=${responseJson}
    WHERE request_id=? AND user_id=? AND status='PENDING' RETURNING status,response_json`,JSON.stringify(response),user.id,user.id,requestId,user.id));
  const receipt=await completedReceipt(env,await db.batch(statements),HYPERDRIVE_RECEIPTS,requestId,user.id);
  if(!receipt)return insufficient();
  if(receipt.status!=='COMPLETED'||!receipt.response_json)return json({error:'개봉 영수증을 확인해 주세요.'},503);
  return json(parse(receipt.response_json));
}

async function handleNewHyperdrive({path,request,env,deps}){
  const product=PRODUCTS.new_hyperdrive,{authenticate,json,withUserMutationLock}=deps;
  const action=path.slice(product.apiPath.length+1),respond=(body,status=200)=>json(body,status,{'cache-control':'no-store'});
  if(!['config','open','receipt'].includes(action))return null;
  if(request.method!==(action==='open'?'POST':'GET'))return respond({error:'지원하지 않는 요청입니다.'},405);
  const user=await authenticate(request,env);
  if(!user)return respond({error:'로그인이 필요합니다.'},401);
  try{
    await ensurePrimeDrawFoundation(env,deps);
    await ensureNewHyperdrivePool(env);
    if(action==='receipt'){
      const requestId=hyperdriveReceiptId(user.id,new URL(request.url).searchParams.get('requestId'));
      if(!requestId)return respond({error:'요청 ID를 확인해 주세요.',code:'INVALID_DRAW'},400);
      const row=await env.DB.prepare(`SELECT r.response_json,CAST(u.coin AS TEXT) AS coin,CAST(u.card_shards AS TEXT) AS card_shards FROM ${HYPERDRIVE_RECEIPTS} r JOIN users u ON u.id=r.user_id WHERE r.request_id=? AND r.user_id=? AND r.item_code=? AND r.status='COMPLETED'`).bind(requestId,user.id,product.itemCode).first();
      if(!row)return respond({error:'완료된 개봉 결과가 아직 없습니다.',code:'RECEIPT_MISSING'},404);
      return respond({...parse(row.response_json),coin:row.coin,cardShards:row.card_shards});
    }
    if(action==='config')return respond(await configPayload(env,user,product));
    const body=await readJointBody(request,{maxBytes:1024,fields:['requestId','count','budget','expectedRevision','expectedUnitPrice']});
    return await withUserMutationLock(env,user.id,path,()=>openNewHyperdrive({body,env,user,product,json:respond}));
  }catch(error){return jointResponseError(error,respond);}
}

export async function handlePrimeDraw({path,request,env,deps}){
  const {authenticate,readBody,json,ensureEquipmentFoundation,ensureVehicleDrawFoundation,ensureAvatarFoundation}=deps;
  if(path.startsWith(NEW_HYPERDRIVE_PACK.apiPath+'/'))return handleNewHyperdrive({path,request,env,deps});
  const routes={
    'suit-core-box/config':{product:PRODUCTS.suit_core,action:'config'},
    'suit-core-box/purchase':{product:PRODUCTS.suit_core,action:'purchase'},
    'suit-core-box/open':{product:PRODUCTS.suit_core,action:'open'},
    'equipment/prime-supply-box/config':{product:PRODUCTS.equipment,action:'config'},
    'equipment/prime-supply-box/purchase':{product:PRODUCTS.equipment,action:'purchase'},
    'equipment/prime-supply-box/open':{product:PRODUCTS.equipment,action:'open'},
    'vehicle-draw/prime/config':{product:PRODUCTS.vehicle,action:'config'},
    'vehicle-draw/prime/purchase':{product:PRODUCTS.vehicle,action:'purchase'},
    'vehicle-draw/prime/open':{product:PRODUCTS.vehicle,action:'open'}
  };
  const route=routes[path];
  if(!route&&path!=='admin/prime-draw/status'&&path!=='admin/prime-draw/pool')return null;
  await ensurePrimeDrawFoundation(env,{ensureEquipmentFoundation,ensureVehicleDrawFoundation,ensureAvatarFoundation});
  const user=await authenticate(request,env);if(!user)return json({error:'로그인이 필요합니다.'},401);
  if(path==='admin/prime-draw/status'&&request.method==='GET'){
    if(!owner(user))return json({error:'OWNER 권한이 필요합니다.'},403);
    await ensureNewHyperdrivePool(env);
    const [equipment,vehicle,new_hyperdrive,catalog,marker]=await Promise.all([configPayload(env,user,PRODUCTS.equipment,{includeZero:true}),configPayload(env,user,PRODUCTS.vehicle,{includeZero:true}),configPayload(env,user,PRODUCTS.new_hyperdrive,{includeZero:true}),loadAdminCatalog(env),env.DB.prepare('SELECT value,updated_at FROM app_meta WHERE key=?').bind(UPGRADE_KEY).first()]);
    const suit_core=await configPayload(env,user,PRODUCTS.suit_core,{includeZero:true});
    return json({ok:true,legacyShop:{equipment:false,vehicle:false},equipment,vehicle,suit_core,new_hyperdrive,catalog,migration:parse(marker?.value,{}),updatedAt:marker?.updated_at||null});
  }
  if(path==='admin/prime-draw/pool'&&request.method==='POST'){
    if(!owner(user))return json({error:'OWNER 권한이 필요합니다.'},403);
    const body=await readBody(request),product=PRODUCTS[String(body.kind||'').toLowerCase()],entries=Array.isArray(body.entries)?body.entries:[];
    if(!product)return json({error:'수정할 풀 종류가 올바르지 않습니다.'},400);
    if(product.directOpen)await ensureNewHyperdrivePool(env);
    const currentPool=await loadPool(env,product,{includeZero:true}),currentByKey=new Map(currentPool.map(row=>[row.poolKey,row])),catalog=await loadAdminCatalog(env),allowedCatalog=product.coreOnly?catalog.inventory_item.filter(row=>SUIT_CORE_BOX_CODES.includes(row.code)):[...(product.kind==='equipment'?[...catalog.equipment,...catalog.inventory_item]:catalog.vehicle),...catalog.avatar],catalogByKey=new Map(allowedCatalog.map(row=>[row.poolKey,row]));
    const normalized=entries.map(row=>{
      const poolKey=text(row.poolKey||`${row.rewardType||''}:${row.rewardRef||row.code||''}`,180),current=currentByKey.get(poolKey),candidate=catalogByKey.get(poolKey),source=current||candidate;
      return {poolKey,source,current,isExtra:Boolean(current?.isExtra||(!current&&candidate)),id:Number(current?.id||candidate?.id||0),rewardType:String(source?.rewardType||'').toUpperCase(),rewardRef:String(source?.rewardRef||source?.code||''),weight:Number(Number(row.drawWeight).toFixed(6)),enabled:bool(row.presentation?.enabled,false),tier:['STANDARD','FEATURED','HERO','CINEMATIC'].includes(String(row.presentation?.tier||'').toUpperCase())?String(row.presentation.tier).toUpperCase():'STANDARD',effectKey:text(row.presentation?.effectKey||'NONE',80)};
    });
    if(normalized.some(row=>!Number.isFinite(row.weight)||row.weight<0||row.weight>100))return json({error:'각 아이템 확률은 0% 이상 100% 이하여야 합니다.'},400);
    if(normalized.some(row=>!row.source||!row.rewardRef))return json({error:'현재 활성 카탈로그에 없는 품목이 포함됐습니다. 새로고침 후 다시 저장해 주세요.'},409);
    if(product.coreOnly){
      if(normalized.length!==SUIT_CORE_BOX_CODES.length||SUIT_CORE_BOX_CODES.some(code=>!normalized.some(row=>row.rewardRef===code)))return json({error:'슈트코어 전용 상자는 코어 1~4 네 종류를 모두 포함해야 합니다.'},400);
      for(const row of normalized){row.isExtra=true;row.enabled=false;row.tier='STANDARD';row.effectKey='NONE';}
    }
    const submittedKeys=new Set(normalized.map(row=>row.poolKey)),requiredBaseKeys=new Set(currentPool.filter(row=>!row.isExtra).map(row=>row.poolKey));
    if(submittedKeys.size!==normalized.length||[...requiredBaseKeys].some(key=>!submittedKeys.has(key)))return json({error:'기본 독립 드랍풀 항목은 삭제하거나 중복 제출할 수 없습니다. 확률을 0%로 설정해 주세요.'},409);
    const total=normalized.reduce((sum,row)=>sum+(Number.isFinite(row.weight)&&row.weight>0?row.weight:0),0);
    if(!normalized.length||Math.abs(total-100)>.0001)return json({error:`활성 확률 합계는 100%여야 합니다. 현재 ${total.toFixed(6)}%입니다.`},400);
    const idColumn=product.kind==='equipment'?'equipment_id':'garage_id';
    const direct=product.directOpen;
    const previous=direct?await env.DB.prepare('SELECT value FROM app_meta WHERE key=?').bind(product.settingsKey).first():null;
    const currentSettings=direct?cleanProductSettings(previous?.value,product):await loadProductSettings(env,product);
    const nextSettings={...currentSettings,openEnabled:bool(body.settings?.openEnabled,currentSettings.openEnabled),shopEnabled:bool(body.settings?.shopEnabled,currentSettings.shopEnabled),shopPrice:product.unitPrice,poolVersion:product.poolVersion,priceRatio:product.priceRatio};
    if(product.directOpen){
      const price=Number(body.settings?.shopPrice??currentSettings.shopPrice);
      if(!validHyperdrivePrice(price))return json({error:'1회 가격을 허용 범위의 양의 정수로 입력해 주세요.'},400);
      if(body.settings?.revision!==currentSettings.revision)return json({error:'설정이 변경되었습니다. 새로고침 후 다시 저장해 주세요.'},409);
      nextSettings.shopPrice=price;
      nextSettings.revision=crypto.randomUUID();
    }
    const payload=JSON.stringify(nextSettings);
    const updateGuard=direct?' WHERE app_meta.value=? RETURNING key':'';
    const settingProof='EXISTS(SELECT 1 FROM app_meta WHERE key=? AND value=?)';
    const poolGuard=direct?` AND ${settingProof}`:'';
    const guardValues=direct?[product.settingsKey,payload]:[];
    const statements=[
      env.DB.prepare(`INSERT INTO app_meta(key,value,updated_at) VALUES(?,?,CURRENT_TIMESTAMP) ON CONFLICT(key) DO UPDATE SET value=excluded.value,updated_at=CURRENT_TIMESTAMP${updateGuard}`).bind(product.settingsKey,payload,...(direct?[previous?.value??null]:[])),
      env.DB.prepare(`DELETE FROM ${EXTRA_POOL_TABLE} WHERE product_kind=?${poolGuard}`).bind(product.kind,...guardValues)
    ];
    for(const row of normalized){
      if(row.isExtra)statements.push(env.DB.prepare(`INSERT INTO ${EXTRA_POOL_TABLE}(product_kind,reward_type,reward_ref,draw_weight,presentation_enabled,presentation_tier,effect_key,pool_version,updated_at) SELECT ?,?,?,?,?,?,?,?,CURRENT_TIMESTAMP${direct?` WHERE ${settingProof}`:''}`).bind(product.kind,row.rewardType,row.rewardRef,row.weight,row.enabled?1:0,row.tier,row.effectKey,product.poolVersion,...guardValues));
      else statements.push(env.DB.prepare(`UPDATE ${product.table} SET draw_weight=?,presentation_enabled=?,presentation_tier=?,effect_key=?,updated_at=CURRENT_TIMESTAMP WHERE ${idColumn}=?${poolGuard}`).bind(row.weight,row.enabled?1:0,row.tier,row.effectKey,row.id,...guardValues));
    }
    const [saved]=await env.DB.batch(statements);
    if(direct&&!saved?.results?.length&&!saved?.meta?.changes)return json({error:'설정이 변경되었습니다. 새로고침 후 다시 저장해 주세요.'},409);
    invalidatePrimeDrawCaches(env,product);
    return json({ok:true,...await configPayload(env,user,product,{includeZero:true})});
  }
  if(route.action==='config'&&request.method==='GET')return json(await configPayload(env,user,route.product));
  if(route.action==='purchase'&&request.method==='POST')return purchase({request,env,user,product:route.product,readBody,json});
  if(route.action==='open'&&request.method==='POST')return route.product.kind!=='vehicle'?openEquipment({request,env,user,product:route.product,readBody,json}):openVehicle({request,env,user,product:route.product,readBody,json});
  return null;
}

export const __primeDrawTest=Object.freeze({PRODUCTS,OPEN_LIMIT,PURCHASE_LIMIT,PRIME_EQUIPMENT_ITEM_CODES:Object.freeze([...PRIME_EQUIPMENT_ITEM_CODES]),buildBoostedPool,presentationFor,aggregateResults,primeSchemaStatements,cleanProductSettings});

async function loadSuitCorePool(env,{includeZero=false}={}){
  const result=await env.DB.prepare(`SELECT x.*,i.code,i.name,i.rarity,i.image_url,i.description,i.category FROM ${EXTRA_POOL_TABLE} x JOIN inventory_items i ON i.code=x.reward_ref WHERE x.product_kind=? AND x.reward_type='INVENTORY_ITEM' AND i.is_active=1 AND i.code IN (${SUIT_CORE_BOX_CODES.map(()=>'?').join(',')}) ORDER BY i.sort_order,i.code`).bind(SUIT_CORE_BOX.kind,...SUIT_CORE_BOX_CODES).all();
  const rows=(result.results||[]).map(row=>({...poolRow(row,'INVENTORY_ITEM',true),removable:false,presentation:{enabled:false,tier:'STANDARD',effectKey:'NONE'}}));
  // An inactive/missing core must stop purchases and opening, not silently
  // redistribute its probability to the other grades.
  if(!includeZero&&(rows.length!==4||Math.abs(rows.reduce((sum,row)=>sum+Number(row.draw_weight),0)-100)>.0001))return [];
  return includeZero?rows:rows.filter(row=>Number(row.draw_weight)>0);
}
