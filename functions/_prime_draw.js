/* V1985 PRIME EQUIPMENT + VEHICLE DRAW */
import { BATTLE_SUIT_CORE_CODES,ensureBattleSuitCoreCatalog } from './_battle_suit_materials.js';

const UPGRADE_KEY='safe_runtime_upgrade_v1985_prime_draw_live';
const EQUIPMENT_POOL_TABLE='prime_equipment_draw_pool_v1985';
const VEHICLE_POOL_TABLE='prime_vehicle_draw_pool_v1985';
const EXTRA_POOL_TABLE='prime_draw_extra_pool_v1987';
const PURCHASE_RECEIPTS='prime_draw_purchase_receipts_v1985';
const OPEN_RECEIPTS='prime_draw_open_receipts_v1985';
const OPEN_LIMIT=500;
// 개봉은 보상 INSERT 크기 때문에 500개 원자 영수증을 유지한다. 구매는 재고 수량만
// 증가하므로 PostgreSQL INTEGER와 JS 안전 정수 범위 안에서 사실상 제한 없이 허용한다.
const PURCHASE_LIMIT=2000000000;
const RARITIES=['NORMAL','MAGIC','RARE','EPIC','LEGENDARY','MYTHIC'];
const EQUIPMENT_SLOT_LABELS={WEAPON:'무기',TOP:'상의',BOTTOM:'하의',SHOES:'신발',ACCESSORY:'장신구',BATTLE_SUIT:'배틀슈트'};
const PRIME_EQUIPMENT_ITEM_CODES=new Set(BATTLE_SUIT_CORE_CODES);

const PRODUCTS=Object.freeze({
  equipment:Object.freeze({
    kind:'equipment',
    itemCode:'PRIME_EQUIPMENT_SUPPLY_BOX',
    legacyItemCode:'EQUIPMENT_SUPPLY_BOX',
    name:'프라임 아머리 상자',
    subtitle:'PRIME ARMORY VAULT',
    description:'기존 장비 보급상자와 완전히 분리된 프라임 전용 장비 풀에서 장비 1개를 확정 획득합니다.',
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
  })
});

let foundationPromise=null;
const text=(value,max=200)=>String(value??'').trim().slice(0,max);
const int=(value,min=0,max=2147483647)=>Math.max(min,Math.min(max,Math.floor(Number(value)||0)));
const parse=(value,fallback={})=>{try{const parsed=typeof value==='string'?JSON.parse(value):value;return parsed&&typeof parsed==='object'?parsed:fallback}catch{return fallback}};
const rarityIndex=value=>Math.max(0,RARITIES.indexOf(String(value||'NORMAL').toUpperCase()));
const owner=user=>Boolean(user&&String(user.role||'').toUpperCase()==='OWNER');
const bool=(value,fallback=true)=>value===undefined||value===null?fallback:(value===true||value===1||String(value)==='1');

function defaultProductSettings(product){
  return {openEnabled:true,shopEnabled:true,shopPrice:product.unitPrice,poolVersion:product.poolVersion,priceRatio:product.priceRatio};
}

function cleanProductSettings(raw,product){
  const defaults=defaultProductSettings(product),value=parse(raw,{});
  return {...defaults,openEnabled:bool(value.openEnabled,defaults.openEnabled),shopEnabled:bool(value.shopEnabled,defaults.shopEnabled)};
}

async function loadProductSettings(env,product){
  const row=await env.DB.prepare('SELECT value FROM app_meta WHERE key=?').bind(product.settingsKey).first();
  return cleanProductSettings(row?.value,product);
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
    const row=grouped.get(key)||{rewardType,code:item.code,name:item.name,rarity:item.rarity,image:item.image,count:0,newCount:0,duplicateCount:0,shardsGained:0,presentation:result.presentation||{enabled:false,tier:'STANDARD',effectKey:'NONE'}};
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
    `CREATE TABLE IF NOT EXISTS ${VEHICLE_POOL_TABLE} (garage_id ${idType} PRIMARY KEY,entry_code TEXT NOT NULL,source_weight REAL NOT NULL,source_probability REAL NOT NULL,boost_multiplier REAL NOT NULL,draw_weight REAL NOT NULL,duplicate_shards ${amountType} NOT NULL DEFAULT 0,power_snapshot ${amountType} NOT NULL DEFAULT 0,rarity_snapshot TEXT NOT NULL DEFAULT 'NORMAL',presentation_enabled INTEGER NOT NULL DEFAULT 0,presentation_tier TEXT NOT NULL DEFAULT 'STANDARD',effect_key TEXT NOT NULL DEFAULT 'NONE',pool_version TEXT NOT NULL,created_at TEXT NOT NULL DEFAULT ${nowDefault},updated_at TEXT NOT NULL DEFAULT ${nowDefault})`,
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

async function ensureTables(env){
  const postgres=env.DB?.dialect==='postgres',schema=primeSchemaStatements(postgres);
  if(postgres&&typeof env.DB.execSchema==='function')await env.DB.execSchema(schema);
  else await env.DB.batch(schema.map(statement=>env.DB.prepare(statement)));
  await env.DB.batch(Object.values(PRODUCTS).flatMap(product=>[
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
    await ensureTables(env);
    const marker=await env.DB.prepare('SELECT value FROM app_meta WHERE key=?').bind(UPGRADE_KEY).first();
    if(!marker?.value)await seedIndependentPools(env);
    return true;
  })().catch(error=>{foundationPromise=null;throw error});
  return foundationPromise;
}

function poolRow(row,rewardType,isExtra=false){
  const type=String(rewardType||'').toUpperCase(),code=String(row.code||row.reward_ref||row.entry_code||'');
  return {...row,id:Number(row.id||0),code,rewardType:type,rewardRef:code,poolKey:`${type}:${code}`,isExtra,removable:isExtra,presentation:{enabled:Number(row.presentation_enabled)!==0,tier:row.presentation_tier||'STANDARD',effectKey:row.effect_key||'NONE'}};
}

async function loadPool(env,product,{includeZero=false}={}){
  const weightClause=includeZero?'':' AND p.draw_weight>0',extraWeightClause=includeZero?'':' AND x.draw_weight>0';
  const baseSql=product.kind==='equipment'
    ?`SELECT p.*,i.id,i.code,i.name,i.rarity,i.image_url,i.description,i.slot,i.total_power,i.pve_power,i.pvp_power FROM ${EQUIPMENT_POOL_TABLE} p JOIN character_equipment_items i ON i.id=p.equipment_id WHERE i.is_active=1 AND i.is_public=1${weightClause} ORDER BY p.draw_weight DESC,i.id`
    :`SELECT p.*,i.id,i.code,i.name,i.rarity,i.image_url,i.description,i.total_power,i.pve_power,i.pvp_power FROM ${VEHICLE_POOL_TABLE} p JOIN character_garage_items i ON i.id=p.garage_id WHERE i.is_active=1 AND i.is_public=1${weightClause} ORDER BY p.draw_weight DESC,i.id`;
  const nativeType=product.kind==='equipment'?'EQUIPMENT':'VEHICLE',nativeTable=product.kind==='equipment'?'character_equipment_items':'character_garage_items';
  const nativeExtraSql=`SELECT x.*,i.id,i.code,i.name,i.rarity,i.image_url,i.description,i.total_power,i.pve_power,i.pvp_power${product.kind==='equipment'?',i.slot':''},0 source_probability,1 boost_multiplier FROM ${EXTRA_POOL_TABLE} x JOIN ${nativeTable} i ON i.code=x.reward_ref WHERE x.product_kind=? AND x.reward_type=? AND i.is_active=1 AND i.is_public=1${extraWeightClause} ORDER BY x.draw_weight DESC,i.id`;
  const avatarSql=`SELECT x.*,a.code,a.name,'AVATAR' rarity,a.lobby_image image_url,a.description,a.role_label,a.accent,0 total_power,0 pve_power,0 pvp_power,0 source_probability,1 boost_multiplier FROM ${EXTRA_POOL_TABLE} x JOIN avatar_catalog_v1 a ON a.code=x.reward_ref WHERE x.product_kind=? AND x.reward_type='AVATAR' AND a.is_active=1 AND a.is_public=1${extraWeightClause} ORDER BY x.draw_weight DESC,a.sort_order,a.code`;
  const inventoryItemSql=`SELECT x.*,i.code,i.name,i.rarity,i.image_url,i.description,i.category,0 total_power,0 pve_power,0 pvp_power,0 source_probability,1 boost_multiplier FROM ${EXTRA_POOL_TABLE} x JOIN inventory_items i ON i.code=x.reward_ref WHERE x.product_kind='equipment' AND x.reward_type='INVENTORY_ITEM' AND i.is_active=1 AND i.code IN ('SUIT_CORE_1','SUIT_CORE_2','SUIT_CORE_3')${extraWeightClause} ORDER BY x.draw_weight DESC,i.sort_order,i.code`;
  const [baseResult,nativeExtraResult,avatarResult,inventoryItemResult]=await Promise.all([
    env.DB.prepare(baseSql).all(),
    env.DB.prepare(nativeExtraSql).bind(product.kind,nativeType).all(),
    env.DB.prepare(avatarSql).bind(product.kind).all(),
    product.kind==='equipment'?env.DB.prepare(inventoryItemSql).all():Promise.resolve({results:[]})
  ]);
  const combined=[...(baseResult.results||[]).map(row=>poolRow(row,nativeType,false)),...(nativeExtraResult.results||[]).map(row=>poolRow(row,nativeType,true)),...(avatarResult.results||[]).map(row=>poolRow(row,'AVATAR',true)),...(inventoryItemResult.results||[]).map(row=>poolRow(row,'INVENTORY_ITEM',true))],seen=new Set();
  return combined.filter(row=>row.code&&!seen.has(row.poolKey)&&(seen.add(row.poolKey)||true));
}

async function loadAdminCatalog(env){
  const [equipment,vehicle,avatar,inventoryItem]=await Promise.all([
    env.DB.prepare('SELECT id,code,name,rarity,image_url,description,total_power,pve_power,pvp_power,slot FROM character_equipment_items WHERE is_active=1 AND is_public=1 ORDER BY sort_order,id').all(),
    env.DB.prepare('SELECT id,code,name,rarity,image_url,description,total_power,pve_power,pvp_power FROM character_garage_items WHERE is_active=1 AND is_public=1 ORDER BY sort_order,id').all(),
    env.DB.prepare("SELECT code,name,'AVATAR' rarity,lobby_image image_url,description,role_label,accent,0 total_power,0 pve_power,0 pvp_power FROM avatar_catalog_v1 WHERE is_active=1 AND is_public=1 ORDER BY sort_order,code").all(),
    env.DB.prepare("SELECT code,name,rarity,image_url,description,category,0 total_power,0 pve_power,0 pvp_power FROM inventory_items WHERE is_active=1 AND code IN ('SUIT_CORE_1','SUIT_CORE_2','SUIT_CORE_3') ORDER BY sort_order,code").all()
  ]);
  const map=(rows,type)=>(rows.results||[]).map(row=>({poolKey:`${type}:${row.code}`,rewardType:type,rewardRef:row.code,id:Number(row.id||0),code:row.code,name:row.name,rarity:row.rarity,image:row.image_url||'',description:row.description||'',power:Number(row.total_power||0),roleLabel:row.role_label||'',accent:row.accent||''}));
  return {equipment:map(equipment,'EQUIPMENT'),vehicle:map(vehicle,'VEHICLE'),avatar:map(avatar,'AVATAR'),inventory_item:map(inventoryItem,'INVENTORY_ITEM')};
}

async function configPayload(env,user,product,{includePool=true,includeZero=false}={}){
  const [balance,account,pool,settings]=await Promise.all([
    env.DB.prepare('SELECT quantity FROM cnine_user_inventory WHERE user_id=? AND item_code=?').bind(user.id,product.itemCode).first(),
    env.DB.prepare('SELECT coin FROM users WHERE id=?').bind(user.id).first(),
    includePool?loadPool(env,product,{includeZero}):Promise.resolve([]),
    loadProductSettings(env,product)
  ]);
  const available=pool.length>0;
  return {kind:product.kind,itemCode:product.itemCode,legacyItemCode:product.legacyItemCode,name:product.name,subtitle:product.subtitle,image:product.image,openEnabled:available&&settings.openEnabled,maxOpen:OPEN_LIMIT,maxPurchase:PURCHASE_LIMIT,batchOpenEnabled:true,poolVersion:product.poolVersion,priceRatio:product.priceRatio,balance:Number(balance?.quantity||0),ticketQuantity:Number(balance?.quantity||0),coin:Number(account?.coin||0),settings,shop:{enabled:available&&settings.shopEnabled,unitPrice:product.unitPrice,originalUnitPrice:product.unitPrice,promotionDiscountPercent:0},pool:{independent:true,legacyShared:false,entryCount:pool.length,entries:pool.map(row=>({id:Number(row.id),poolKey:row.poolKey,rewardType:row.rewardType,rewardRef:row.rewardRef,isExtra:Boolean(row.isExtra),removable:Boolean(row.removable),code:row.code,name:row.name,rarity:row.rarity,image:row.image_url||'',power:Number(row.total_power||0),sourceProbability:Number(row.source_probability||0),boostMultiplier:Number(row.boost_multiplier||0),drawWeight:Number(row.draw_weight||0),presentation:row.presentation}))}};
}

async function purchase({request,env,user,product,readBody,json}){
  const body=await readBody(request),rawCount=Number(body.count),count=int(rawCount,1,PURCHASE_LIMIT),requestId=text(body.requestId||crypto.randomUUID(),120),expected=body.expectedUnitPrice===undefined?product.unitPrice:Number(body.expectedUnitPrice);
  if(!Number.isSafeInteger(rawCount)||rawCount<1||rawCount>PURCHASE_LIMIT)return json({error:`구매 수량은 1개 이상 ${PURCHASE_LIMIT.toLocaleString()}개 이하여야 합니다.`},400);
  if(!requestId)return json({error:'요청 ID가 필요합니다.'},400);
  if(!Number.isInteger(expected)||expected!==product.unitPrice)return json({error:'상품 가격이 변경되었습니다. 새 가격을 확인한 뒤 다시 주문해 주세요.',code:'PRICE_CHANGED',currentUnitPrice:product.unitPrice},409);
  if(!(await loadProductSettings(env,product)).shopEnabled)return json({error:'현재 프라임 상품 판매가 중지되어 있습니다.'},423);
  if(!(await loadPool(env,product)).length)return json({error:'프라임 전용 드랍풀이 비어 있어 현재 구매할 수 없습니다.'},503);
  const prior=await env.DB.prepare(`SELECT status,response_json,item_code FROM ${PURCHASE_RECEIPTS} WHERE request_id=? AND user_id=?`).bind(requestId,user.id).first();
  if(prior&&prior.item_code!==product.itemCode)return json({error:'같은 요청 ID를 다른 프라임 상품에 재사용할 수 없습니다.'},409);
  if(prior?.status==='COMPLETED'&&prior.response_json)return json(parse(prior.response_json,{}));
  if(prior)return json({error:'같은 구매 요청을 처리 중입니다.'},409);
  const totalPrice=product.unitPrice*count;
  const response={ok:true,itemCode:product.itemCode,count,unitPrice:product.unitPrice,totalPrice,coin:0,balance:0,requestId};
  const completeSql=env.DB?.dialect==='postgres'
    ?`UPDATE ${PURCHASE_RECEIPTS} SET status='COMPLETED',response_json=(jsonb_set(jsonb_set(?::jsonb,'{coin}',to_jsonb(COALESCE((SELECT coin FROM users WHERE id=?),0)),true),'{balance}',to_jsonb(COALESCE((SELECT quantity FROM cnine_user_inventory WHERE user_id=? AND item_code=?),0)),true))::text,updated_at=CURRENT_TIMESTAMP WHERE request_id=? AND user_id=? AND status='PENDING'`
    :`UPDATE ${PURCHASE_RECEIPTS} SET status='COMPLETED',response_json=json_set(?,'$.coin',COALESCE((SELECT coin FROM users WHERE id=?),0),'$.balance',COALESCE((SELECT quantity FROM cnine_user_inventory WHERE user_id=? AND item_code=?),0)),updated_at=CURRENT_TIMESTAMP WHERE request_id=? AND user_id=? AND status='PENDING'`;
  await env.DB.batch([
    env.DB.prepare(`INSERT INTO ${PURCHASE_RECEIPTS}(request_id,user_id,item_code,count,unit_price,total_price,status) SELECT ?,?,?,?,?,?,'PENDING' WHERE EXISTS(SELECT 1 FROM users WHERE id=? AND coin>=?)`).bind(requestId,user.id,product.itemCode,count,product.unitPrice,totalPrice,user.id,totalPrice),
    env.DB.prepare(`UPDATE users SET coin=coin-? WHERE id=? AND coin>=? AND EXISTS(SELECT 1 FROM ${PURCHASE_RECEIPTS} WHERE request_id=? AND user_id=? AND item_code=? AND status='PENDING')`).bind(totalPrice,user.id,totalPrice,requestId,user.id,product.itemCode),
    env.DB.prepare(`INSERT INTO cnine_user_inventory(user_id,item_code,quantity,unseen_quantity,created_at,updated_at) SELECT ?,?,?,?,CURRENT_TIMESTAMP,CURRENT_TIMESTAMP WHERE EXISTS(SELECT 1 FROM ${PURCHASE_RECEIPTS} WHERE request_id=? AND user_id=? AND item_code=? AND status='PENDING') ON CONFLICT(user_id,item_code) DO UPDATE SET quantity=quantity+excluded.quantity,unseen_quantity=unseen_quantity+excluded.unseen_quantity,updated_at=CURRENT_TIMESTAMP`).bind(user.id,product.itemCode,count,count,requestId,user.id,product.itemCode),
    env.DB.prepare(`INSERT INTO coin_logs(user_id,change_amount,balance_after,reason) SELECT ?,-?,coin,? FROM users WHERE id=? AND EXISTS(SELECT 1 FROM ${PURCHASE_RECEIPTS} WHERE request_id=? AND user_id=? AND item_code=? AND status='PENDING')`).bind(user.id,totalPrice,product.purchaseReason,user.id,requestId,user.id,product.itemCode),
    env.DB.prepare(`INSERT INTO inventory_logs(user_id,item_code,change_amount,balance_after,reason,reference_type,reference_id) SELECT ?,?,?,quantity,'SHOP_PURCHASE',?,? FROM cnine_user_inventory WHERE user_id=? AND item_code=? AND EXISTS(SELECT 1 FROM ${PURCHASE_RECEIPTS} WHERE request_id=? AND user_id=? AND item_code=? AND status='PENDING')`).bind(user.id,product.itemCode,count,product.referenceType,requestId,user.id,product.itemCode,requestId,user.id,product.itemCode),
    env.DB.prepare(completeSql).bind(JSON.stringify(response),user.id,user.id,product.itemCode,requestId,user.id)
  ]);
  const receipt=await env.DB.prepare(`SELECT status,response_json FROM ${PURCHASE_RECEIPTS} WHERE request_id=? AND user_id=?`).bind(requestId,user.id).first();
  if(!receipt)return json({error:'코인이 부족합니다.'},409);
  if(receipt.status!=='COMPLETED'||!receipt.response_json)return json({error:'상품 구매 처리에 실패했습니다.'},500);
  return json(parse(receipt.response_json,{}));
}

async function openEquipment({request,env,user,product,readBody,json}){
  const body=await readBody(request),rawCount=Number(body.count??body.quantity),count=int(rawCount,1,OPEN_LIMIT),requestId=text(body.requestId||crypto.randomUUID(),120);
  if(!Number.isInteger(rawCount)||rawCount<1||rawCount>OPEN_LIMIT)return json({error:`프라임 아머리 상자는 1개 이상 ${OPEN_LIMIT}개 이하로 개봉할 수 있습니다.`},400);
  if(body.poolVersion&&body.poolVersion!==product.poolVersion)return json({error:'상품 확률표 버전이 변경되었습니다. 다시 확인해 주세요.',code:'POOL_VERSION_CHANGED',poolVersion:product.poolVersion},409);
  if(!(await loadProductSettings(env,product)).openEnabled)return json({error:'현재 프라임 아머리 상자 개봉이 중지되어 있습니다.'},423);
  const prior=await env.DB.prepare(`SELECT status,response_json,item_code FROM ${OPEN_RECEIPTS} WHERE request_id=? AND user_id=?`).bind(requestId,user.id).first();
  if(prior&&prior.item_code!==product.itemCode)return json({error:'같은 요청 ID를 다른 프라임 상품에 재사용할 수 없습니다.'},409);
  if(prior?.status==='COMPLETED'&&prior.response_json)return json(parse(prior.response_json,{}));
  if(prior)return json({error:'같은 개봉 요청을 처리 중입니다.'},409);
  const [poolRows,stock,ownedAvatarRows]=await Promise.all([loadPool(env,product),env.DB.prepare('SELECT quantity FROM cnine_user_inventory WHERE user_id=? AND item_code=?').bind(user.id,product.itemCode).first(),env.DB.prepare('SELECT avatar_code FROM avatar_user_ownership_v1 WHERE user_id=? AND (expires_at IS NULL OR expires_at>CURRENT_TIMESTAMP)').bind(user.id).all()]);
  if(!poolRows.length)return json({error:'프라임 장비 전용 드랍풀이 비어 있습니다.'},503);
  if(Number(stock?.quantity||0)<count)return json({error:`프라임 아머리 상자가 ${count}개 필요합니다.`},409);
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
  const response={ok:true,kind:'equipment',itemCode:product.itemCode,count,poolVersion:product.poolVersion,receiptId:requestId,requestId,results,aggregated,specialQueue,remainingQuantity:0};
  const rewardRows=JSON.stringify(results.filter(result=>result.type==='EQUIPMENT').map((result,index)=>[Number(result.item.id),index]));
  const completeSql=env.DB?.dialect==='postgres'
    ?`UPDATE ${OPEN_RECEIPTS} SET status='COMPLETED',response_json=(jsonb_set(?::jsonb,'{remainingQuantity}',to_jsonb(COALESCE((SELECT quantity FROM cnine_user_inventory WHERE user_id=? AND item_code=?),0)),true))::text,updated_at=CURRENT_TIMESTAMP WHERE request_id=? AND user_id=? AND status='PENDING'`
    :`UPDATE ${OPEN_RECEIPTS} SET status='COMPLETED',response_json=json_set(?,'$.remainingQuantity',COALESCE((SELECT quantity FROM cnine_user_inventory WHERE user_id=? AND item_code=?),0)),updated_at=CURRENT_TIMESTAMP WHERE request_id=? AND user_id=? AND status='PENDING'`;
  const statements=[
    env.DB.prepare(`INSERT INTO ${OPEN_RECEIPTS}(request_id,user_id,item_code,count,pool_version,status) SELECT ?,?,?,?,?,'PENDING' WHERE EXISTS(SELECT 1 FROM cnine_user_inventory WHERE user_id=? AND item_code=? AND quantity>=?)`).bind(requestId,user.id,product.itemCode,count,product.poolVersion,user.id,product.itemCode,count),
    env.DB.prepare(`UPDATE cnine_user_inventory SET quantity=quantity-?,unseen_quantity=MIN(unseen_quantity,quantity-?),updated_at=CURRENT_TIMESTAMP WHERE user_id=? AND item_code=? AND quantity>=? AND EXISTS(SELECT 1 FROM ${OPEN_RECEIPTS} WHERE request_id=? AND user_id=? AND item_code=? AND status='PENDING')`).bind(count,count,user.id,product.itemCode,count,requestId,user.id,product.itemCode)
  ];
  if(results.some(result=>result.type==='EQUIPMENT'))statements.push(env.DB.prepare(`WITH receipt_guard AS (SELECT 1 FROM ${OPEN_RECEIPTS} WHERE request_id=? AND user_id=? AND item_code=? AND status='PENDING'),reward_rows AS (SELECT CAST(json_extract(value,'$[0]') AS INTEGER) equipment_id,CAST(json_extract(value,'$[1]') AS INTEGER) reward_index FROM json_each(?)) INSERT INTO user_equipment_instances(user_id,equipment_id,source_type,source_id,request_id) SELECT ?,reward_rows.equipment_id,'PRIME_EQUIPMENT_DRAW',?,?||reward_rows.reward_index FROM reward_rows CROSS JOIN receipt_guard`).bind(requestId,user.id,product.itemCode,rewardRows,user.id,requestId,`PRIME-EQ:${requestId}:`));
  for(const [itemCode,quantity] of inventoryItemCounts){
    statements.push(
      env.DB.prepare(`INSERT INTO cnine_user_inventory(user_id,item_code,quantity,unseen_quantity,created_at,updated_at) SELECT ?,?,?,?,CURRENT_TIMESTAMP,CURRENT_TIMESTAMP WHERE EXISTS(SELECT 1 FROM ${OPEN_RECEIPTS} WHERE request_id=? AND user_id=? AND item_code=? AND status='PENDING') ON CONFLICT(user_id,item_code) DO UPDATE SET quantity=cnine_user_inventory.quantity+excluded.quantity,unseen_quantity=cnine_user_inventory.unseen_quantity+excluded.unseen_quantity,updated_at=CURRENT_TIMESTAMP`).bind(user.id,itemCode,quantity,quantity,requestId,user.id,product.itemCode),
      env.DB.prepare(`INSERT INTO inventory_logs(user_id,item_code,change_amount,balance_after,reason,reference_type,reference_id) SELECT ?,?,?,quantity,'PRIME_EQUIPMENT_REWARD','PRIME_EQUIPMENT_OPEN',? FROM cnine_user_inventory WHERE user_id=? AND item_code=? AND EXISTS(SELECT 1 FROM ${OPEN_RECEIPTS} WHERE request_id=? AND user_id=? AND item_code=? AND status='PENDING')`).bind(user.id,itemCode,quantity,requestId,user.id,itemCode,requestId,user.id,product.itemCode)
    );
  }
  if(newAvatarCodes.size)statements.push(avatarGrantStatement(env,{requestId,userId:user.id,itemCode:product.itemCode,avatarCodes:newAvatarCodes}));
  statements.push(
    env.DB.prepare(`INSERT INTO inventory_logs(user_id,item_code,change_amount,balance_after,reason,reference_type,reference_id) SELECT ?,?,-?,quantity,'프라임 아머리 상자 개봉','PRIME_EQUIPMENT_OPEN',? FROM cnine_user_inventory WHERE user_id=? AND item_code=? AND EXISTS(SELECT 1 FROM ${OPEN_RECEIPTS} WHERE request_id=? AND user_id=? AND item_code=? AND status='PENDING')`).bind(user.id,product.itemCode,count,requestId,user.id,product.itemCode,requestId,user.id,product.itemCode),
    env.DB.prepare(completeSql).bind(JSON.stringify(response),user.id,product.itemCode,requestId,user.id)
  );
  await env.DB.batch(statements);
  const receipt=await env.DB.prepare(`SELECT status,response_json FROM ${OPEN_RECEIPTS} WHERE request_id=? AND user_id=?`).bind(requestId,user.id).first();
  if(!receipt)return json({error:`프라임 아머리 상자가 ${count}개 필요합니다.`},409);
  if(receipt.status!=='COMPLETED'||!receipt.response_json)return json({error:'프라임 장비 개봉 처리에 실패했습니다.'},500);
  return json(parse(receipt.response_json,{}));
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
  const [poolRows,stock,ownedRows,ownedAvatarRows]=await Promise.all([loadPool(env,product),env.DB.prepare('SELECT quantity FROM cnine_user_inventory WHERE user_id=? AND item_code=?').bind(user.id,product.itemCode).first(),env.DB.prepare('SELECT garage_id FROM user_garage_vehicles WHERE user_id=?').bind(user.id).all(),env.DB.prepare('SELECT avatar_code FROM avatar_user_ownership_v1 WHERE user_id=? AND (expires_at IS NULL OR expires_at>CURRENT_TIMESTAMP)').bind(user.id).all()]);
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
    env.DB.prepare(`UPDATE cnine_user_inventory SET quantity=quantity-?,unseen_quantity=MIN(unseen_quantity,quantity-?),updated_at=CURRENT_TIMESTAMP WHERE user_id=? AND item_code=? AND quantity>=? AND EXISTS(SELECT 1 FROM ${OPEN_RECEIPTS} WHERE request_id=? AND user_id=? AND item_code=? AND status='PENDING')`).bind(count,count,user.id,product.itemCode,count,requestId,user.id,product.itemCode)
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
  statements.push(env.DB.prepare(completeSql).bind(JSON.stringify(response),user.id,product.itemCode,user.id,user.id,requestId,user.id));
  await env.DB.batch(statements);
  const receipt=await env.DB.prepare(`SELECT status,response_json FROM ${OPEN_RECEIPTS} WHERE request_id=? AND user_id=?`).bind(requestId,user.id).first();
  if(!receipt)return json({error:`프라임 하이퍼드라이브 팩이 ${count}개 필요합니다.`},409);
  if(receipt.status!=='COMPLETED'||!receipt.response_json)return json({error:'프라임 이동수단 개봉 처리에 실패했습니다.'},500);
  return json(parse(receipt.response_json,{}));
}

export async function handlePrimeDraw({path,request,env,deps}){
  const {authenticate,readBody,json,ensureEquipmentFoundation,ensureVehicleDrawFoundation,ensureAvatarFoundation}=deps;
  const routes={
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
    const [equipment,vehicle,catalog,marker]=await Promise.all([configPayload(env,user,PRODUCTS.equipment,{includeZero:true}),configPayload(env,user,PRODUCTS.vehicle,{includeZero:true}),loadAdminCatalog(env),env.DB.prepare('SELECT value,updated_at FROM app_meta WHERE key=?').bind(UPGRADE_KEY).first()]);
    return json({ok:true,legacyShop:{equipment:false,vehicle:false},equipment,vehicle,catalog,migration:parse(marker?.value,{}),updatedAt:marker?.updated_at||null});
  }
  if(path==='admin/prime-draw/pool'&&request.method==='POST'){
    if(!owner(user))return json({error:'OWNER 권한이 필요합니다.'},403);
    const body=await readBody(request),product=PRODUCTS[String(body.kind||'').toLowerCase()],entries=Array.isArray(body.entries)?body.entries:[];
    if(!product)return json({error:'수정할 풀 종류가 올바르지 않습니다.'},400);
    const currentPool=await loadPool(env,product,{includeZero:true}),currentByKey=new Map(currentPool.map(row=>[row.poolKey,row])),catalog=await loadAdminCatalog(env),allowedCatalog=[...(product.kind==='equipment'?[...catalog.equipment,...catalog.inventory_item]:catalog.vehicle),...catalog.avatar],catalogByKey=new Map(allowedCatalog.map(row=>[row.poolKey,row]));
    const normalized=entries.map(row=>{
      const poolKey=text(row.poolKey||`${row.rewardType||''}:${row.rewardRef||row.code||''}`,180),current=currentByKey.get(poolKey),candidate=catalogByKey.get(poolKey),source=current||candidate;
      return {poolKey,source,current,isExtra:Boolean(current?.isExtra||(!current&&candidate)),id:Number(current?.id||candidate?.id||0),rewardType:String(source?.rewardType||'').toUpperCase(),rewardRef:String(source?.rewardRef||source?.code||''),weight:Number(Number(row.drawWeight).toFixed(6)),enabled:bool(row.presentation?.enabled,false),tier:['STANDARD','FEATURED','HERO','CINEMATIC'].includes(String(row.presentation?.tier||'').toUpperCase())?String(row.presentation.tier).toUpperCase():'STANDARD',effectKey:text(row.presentation?.effectKey||'NONE',80)};
    });
    if(normalized.some(row=>!Number.isFinite(row.weight)||row.weight<0||row.weight>100))return json({error:'각 아이템 확률은 0% 이상 100% 이하여야 합니다.'},400);
    if(normalized.some(row=>!row.source||!row.rewardRef))return json({error:'현재 활성 카탈로그에 없는 품목이 포함됐습니다. 새로고침 후 다시 저장해 주세요.'},409);
    const submittedKeys=new Set(normalized.map(row=>row.poolKey)),requiredBaseKeys=new Set(currentPool.filter(row=>!row.isExtra).map(row=>row.poolKey));
    if(submittedKeys.size!==normalized.length||[...requiredBaseKeys].some(key=>!submittedKeys.has(key)))return json({error:'기본 독립 드랍풀 항목은 삭제하거나 중복 제출할 수 없습니다. 확률을 0%로 설정해 주세요.'},409);
    const total=normalized.reduce((sum,row)=>sum+(Number.isFinite(row.weight)&&row.weight>0?row.weight:0),0);
    if(!normalized.length||Math.abs(total-100)>.0001)return json({error:`활성 확률 합계는 100%여야 합니다. 현재 ${total.toFixed(6)}%입니다.`},400);
    const idColumn=product.kind==='equipment'?'equipment_id':'garage_id';
    const currentSettings=await loadProductSettings(env,product),nextSettings={...currentSettings,openEnabled:bool(body.settings?.openEnabled,currentSettings.openEnabled),shopEnabled:bool(body.settings?.shopEnabled,currentSettings.shopEnabled),shopPrice:product.unitPrice,poolVersion:product.poolVersion,priceRatio:product.priceRatio};
    const statements=[
      env.DB.prepare('INSERT INTO app_meta(key,value,updated_at) VALUES(?,?,CURRENT_TIMESTAMP) ON CONFLICT(key) DO UPDATE SET value=excluded.value,updated_at=CURRENT_TIMESTAMP').bind(product.settingsKey,JSON.stringify(nextSettings)),
      env.DB.prepare(`DELETE FROM ${EXTRA_POOL_TABLE} WHERE product_kind=?`).bind(product.kind)
    ];
    for(const row of normalized){
      if(row.isExtra)statements.push(env.DB.prepare(`INSERT INTO ${EXTRA_POOL_TABLE}(product_kind,reward_type,reward_ref,draw_weight,presentation_enabled,presentation_tier,effect_key,pool_version,updated_at) VALUES(?,?,?,?,?,?,?,?,CURRENT_TIMESTAMP)`).bind(product.kind,row.rewardType,row.rewardRef,row.weight,row.enabled?1:0,row.tier,row.effectKey,product.poolVersion));
      else statements.push(env.DB.prepare(`UPDATE ${product.table} SET draw_weight=?,presentation_enabled=?,presentation_tier=?,effect_key=?,updated_at=CURRENT_TIMESTAMP WHERE ${idColumn}=?`).bind(row.weight,row.enabled?1:0,row.tier,row.effectKey,row.id));
    }
    await env.DB.batch(statements);
    return json({ok:true,...await configPayload(env,user,product,{includeZero:true})});
  }
  if(route.action==='config'&&request.method==='GET')return json(await configPayload(env,user,route.product));
  if(route.action==='purchase'&&request.method==='POST')return purchase({request,env,user,product:route.product,readBody,json});
  if(route.action==='open'&&request.method==='POST')return route.product.kind==='equipment'?openEquipment({request,env,user,product:route.product,readBody,json}):openVehicle({request,env,user,product:route.product,readBody,json});
  return null;
}

export const __primeDrawTest=Object.freeze({PRODUCTS,OPEN_LIMIT,PURCHASE_LIMIT,PRIME_EQUIPMENT_ITEM_CODES:Object.freeze([...PRIME_EQUIPMENT_ITEM_CODES]),buildBoostedPool,presentationFor,aggregateResults,primeSchemaStatements,cleanProductSettings});
