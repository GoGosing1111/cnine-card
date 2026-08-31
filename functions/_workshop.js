import { ensureEquipmentFoundation } from './_equipment.js';

const RECIPE_TABLE='workshop_recipes_v1668';
const MATERIAL_TABLE='workshop_recipe_materials_v1668';
const RECEIPT_TABLE='workshop_craft_receipts_v1668';
const GUARD_TABLE='workshop_craft_guards_v1668';
const LOG_TABLE='workshop_craft_logs_v1668';
const SYNTH_RECEIPT_TABLE='equipment_synthesis_receipts_v1676';
const SYNTH_LOG_TABLE='equipment_synthesis_logs_v1676';
const SYNTH_RECIPE_TABLE='equipment_synthesis_recipes_v1677';
const CATEGORIES=new Set(['VEHICLE','EQUIPMENT_SYNTHESIS','MATERIAL_CRAFT']);
const OUTPUT_TYPES=new Set(['VEHICLE','EQUIPMENT','INVENTORY_ITEM']);
const PAYMENT_MODES=new Set(['COIN_OR_MASTER_STAR','COIN_ONLY','MASTER_STAR_ONLY','BOTH','COIN_AND_CARD_SHARD']);
const MATERIAL_CRAFT_UPGRADE_KEY='safe_runtime_upgrade_v1933_workshop_material_craft_no_schema_change';
const MYSTIC_ENERGY_RECIPE_CODE='WORKSHOP_MYSTIC_ENERGY';
const MYSTIC_ENERGY_ITEM_CODE='STARLIGHT_ARMOR_CORE';
const FIXED_RECIPE_COSTS=Object.freeze({
  [MYSTIC_ENERGY_RECIPE_CODE]:Object.freeze({
    category:'MATERIAL_CRAFT',
    outputType:'INVENTORY_ITEM',
    outputRef:MYSTIC_ENERGY_ITEM_CODE,
    outputQuantity:1,
    paymentMode:'COIN_AND_CARD_SHARD',
    coin:200000000,
    cardShards:5000000,
    successRate:10
  })
});
let foundationPromise=null;

const int=(value,min=0,max=Number.MAX_SAFE_INTEGER,fallback=min)=>{const n=Math.floor(Number(value));return Number.isFinite(n)?Math.max(min,Math.min(max,n)):fallback};
const num=(value,min=0,max=100,fallback=min)=>{const n=Number(value);return Number.isFinite(n)?Math.max(min,Math.min(max,n)):fallback};
const clean=(value,max=180)=>String(value??'').trim().slice(0,max);
const code=(value,max=80)=>clean(value,max).toUpperCase().replace(/[^A-Z0-9_:-]/g,'_').replace(/_+/g,'_');
const bool=value=>value===true||value===1||String(value)==='1';
const parse=(value,fallback=null)=>{try{return JSON.parse(value)}catch{return fallback}};
const isAdmin=user=>String(user?.role||'').toUpperCase()==='OWNER';
const isOwner=user=>String(user?.role||'').toUpperCase()==='OWNER';

const FOUNDATION_SQL=[
  `CREATE TABLE IF NOT EXISTS ${RECIPE_TABLE}(id INTEGER PRIMARY KEY AUTOINCREMENT,code TEXT NOT NULL UNIQUE,category TEXT NOT NULL DEFAULT 'VEHICLE',name TEXT NOT NULL,description TEXT NOT NULL DEFAULT '',output_type TEXT NOT NULL DEFAULT 'VEHICLE',output_ref TEXT NOT NULL,output_quantity INTEGER NOT NULL DEFAULT 1,payment_mode TEXT NOT NULL DEFAULT 'COIN_OR_MASTER_STAR',coin_cost INTEGER NOT NULL DEFAULT 0,master_star_cost INTEGER NOT NULL DEFAULT 0,success_rate REAL NOT NULL DEFAULT 100,is_featured INTEGER NOT NULL DEFAULT 0,is_active INTEGER NOT NULL DEFAULT 1,is_public INTEGER NOT NULL DEFAULT 1,owner_test_only INTEGER NOT NULL DEFAULT 0,sort_order INTEGER NOT NULL DEFAULT 0,created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP)`,
  `CREATE TABLE IF NOT EXISTS ${MATERIAL_TABLE}(recipe_id INTEGER NOT NULL,item_code TEXT NOT NULL,quantity INTEGER NOT NULL DEFAULT 1,sort_order INTEGER NOT NULL DEFAULT 0,created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,PRIMARY KEY(recipe_id,item_code))`,
  `CREATE TABLE IF NOT EXISTS ${RECEIPT_TABLE}(request_id TEXT NOT NULL,user_id INTEGER NOT NULL,recipe_id INTEGER NOT NULL,payment_type TEXT NOT NULL,status TEXT NOT NULL DEFAULT 'PENDING',result_json TEXT,error_message TEXT,created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,PRIMARY KEY(request_id,user_id))`,
  `CREATE TABLE IF NOT EXISTS ${GUARD_TABLE}(guard_id TEXT PRIMARY KEY,user_id INTEGER NOT NULL,recipe_id INTEGER NOT NULL,verified INTEGER NOT NULL DEFAULT 0,created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP)`,
  `CREATE TABLE IF NOT EXISTS ${LOG_TABLE}(id INTEGER PRIMARY KEY AUTOINCREMENT,request_id TEXT NOT NULL,user_id INTEGER NOT NULL,recipe_id INTEGER NOT NULL,recipe_name TEXT NOT NULL,category TEXT NOT NULL,output_type TEXT NOT NULL,output_ref TEXT NOT NULL,output_quantity INTEGER NOT NULL DEFAULT 1,payment_type TEXT NOT NULL,coin_spent INTEGER NOT NULL DEFAULT 0,master_star_spent INTEGER NOT NULL DEFAULT 0,success INTEGER NOT NULL DEFAULT 1,created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,UNIQUE(request_id,user_id))`,
  `CREATE TABLE IF NOT EXISTS ${SYNTH_RECEIPT_TABLE}(request_id TEXT NOT NULL,user_id INTEGER NOT NULL,equipment_id INTEGER NOT NULL,status TEXT NOT NULL DEFAULT 'PENDING',result_json TEXT,error_message TEXT,created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,PRIMARY KEY(request_id,user_id))`,
  `CREATE TABLE IF NOT EXISTS ${SYNTH_LOG_TABLE}(id INTEGER PRIMARY KEY AUTOINCREMENT,request_id TEXT NOT NULL,user_id INTEGER NOT NULL,input_equipment_id INTEGER NOT NULL,output_equipment_id INTEGER NOT NULL,input_instance_ids TEXT NOT NULL DEFAULT '[]',success INTEGER NOT NULL DEFAULT 1,created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,UNIQUE(request_id,user_id))`,
  `CREATE TABLE IF NOT EXISTS ${SYNTH_RECIPE_TABLE}(id INTEGER PRIMARY KEY AUTOINCREMENT,code TEXT NOT NULL UNIQUE,name TEXT NOT NULL,description TEXT NOT NULL DEFAULT '',input_equipment_id INTEGER NOT NULL,output_equipment_id INTEGER NOT NULL,input_quantity INTEGER NOT NULL DEFAULT 3,success_rate REAL NOT NULL DEFAULT 100,is_active INTEGER NOT NULL DEFAULT 1,is_public INTEGER NOT NULL DEFAULT 1,owner_test_only INTEGER NOT NULL DEFAULT 0,sort_order INTEGER NOT NULL DEFAULT 0,created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP)`,
  `CREATE INDEX IF NOT EXISTS idx_workshop_recipes_public_v1668 ON ${RECIPE_TABLE}(category,is_active,is_public,sort_order,id)`,
  `CREATE INDEX IF NOT EXISTS idx_workshop_materials_recipe_v1668 ON ${MATERIAL_TABLE}(recipe_id,sort_order,item_code)`,
  `CREATE INDEX IF NOT EXISTS idx_workshop_logs_user_v1668 ON ${LOG_TABLE}(user_id,created_at DESC)`,
  `CREATE INDEX IF NOT EXISTS idx_workshop_guards_created_v1668 ON ${GUARD_TABLE}(created_at)`,
  `CREATE INDEX IF NOT EXISTS idx_equipment_synthesis_logs_user_v1676 ON ${SYNTH_LOG_TABLE}(user_id,created_at DESC)`,
  `CREATE INDEX IF NOT EXISTS idx_equipment_synthesis_recipes_public_v1677 ON ${SYNTH_RECIPE_TABLE}(is_active,is_public,sort_order,id)`,
  `CREATE INDEX IF NOT EXISTS idx_equipment_synthesis_recipes_input_v1677 ON ${SYNTH_RECIPE_TABLE}(input_equipment_id)`
];

const DEFAULT_SYNTH_RECIPES=[
  ['SYNTH_VALKYRIE_SUIT_PRIME','발키리 슈트 → 프라임 배틀슈트','발키리 슈트 3개를 프라임 배틀슈트 1개로 합성합니다.','발키리 슈트','프라임 배틀슈트',10],
  ['SYNTH_ODIN_AK_INFINITY','오딘 AK → 인피니티 AK','오딘 AK 3개를 인피니티 AK 1개로 합성합니다.','오딘 AK','인피니티 AK',20],
  ['SYNTH_VALKYRIE_LEGGINGS_PRIME','발키리 레깅스 → 프라임 배틀레깅스','발키리 레깅스 3개를 프라임 배틀레깅스 1개로 합성합니다.','발키리 레깅스','프라임 배틀레깅스',30],
  ['SYNTH_VALKYRIE_BOOTS_PRIME','발키리 부츠 → 프라임 배틀슈즈','발키리 부츠 3개를 프라임 배틀슈즈 1개로 합성합니다.','발키리 부츠','프라임 배틀슈즈',40]
];

const DEFAULT_RECIPES=[
  {code:'WORKSHOP_GOLD_MATIZ',name:'황금마티즈 조립',description:'폐차장에서 회수한 기본 부품으로 완성하는 입문 차량입니다.',outputRef:'11',coin:500000,stars:2,featured:1,sort:10,materials:[['VEHICLE_PART_TIRE',4],['VEHICLE_PART_FRAME',2],['VEHICLE_PART_ENGINE',1]]},
  {code:'WORKSHOP_SIEGE_TANK',name:'틀타 시즈탱크 조립',description:'강화 차체와 고출력 엔진을 사용하는 중급 전투 차량입니다.',outputRef:'2',coin:2000000,stars:6,featured:0,sort:20,materials:[['VEHICLE_PART_TIRE',8],['VEHICLE_PART_FRAME',4],['VEHICLE_PART_ENGINE',2]]},
  {code:'WORKSHOP_SKI1000C',name:'SKI1000C 조립',description:'정밀 부품을 대량 투입해 완성하는 상급 제작 차량입니다.',outputRef:'3',coin:6000000,stars:18,featured:0,sort:30,materials:[['VEHICLE_PART_TIRE',14],['VEHICLE_PART_FRAME',8],['VEHICLE_PART_ENGINE',5]]}
];

async function ensureMaterialCraftUpgrade(env){
  const marker=await env.DB.prepare('SELECT value FROM app_meta WHERE key=?').bind(MATERIAL_CRAFT_UPGRADE_KEY).first();
  if(marker?.value==='1')return true;
  await env.DB.batch([
    env.DB.prepare(`INSERT INTO inventory_items(code,name,subtitle,description,category,rarity,image_url,sort_order,is_active) VALUES('STARLIGHT_ARMOR_CORE','미스틱 에너지','MYSTIC ENERGY','미스틱 장비 제작에 투입되는 고밀도 결정 에너지입니다. 직접 사용할 수 없는 제작 재료입니다.','MATERIAL','MYTHIC','assets/items/starlight-armor-core-v1749.png',174900,1) ON CONFLICT(code) DO UPDATE SET name=excluded.name,subtitle=excluded.subtitle,description=excluded.description,category=excluded.category,rarity=excluded.rarity,image_url=excluded.image_url,sort_order=excluded.sort_order,is_active=1,updated_at=CURRENT_TIMESTAMP`),
    env.DB.prepare(`INSERT INTO ${RECIPE_TABLE}(code,category,name,description,output_type,output_ref,output_quantity,payment_mode,coin_cost,master_star_cost,success_rate,is_featured,is_active,is_public,owner_test_only,sort_order) VALUES('WORKSHOP_MYSTIC_ENERGY','MATERIAL_CRAFT','미스틱 에너지 제작','고밀도 카드 조각을 압축해 미스틱 에너지 1개를 제작합니다.','INVENTORY_ITEM','STARLIGHT_ARMOR_CORE',1,'COIN_AND_CARD_SHARD',200000000,0,10,1,1,1,0,10) ON CONFLICT(code) DO UPDATE SET category=excluded.category,name=excluded.name,description=excluded.description,output_type=excluded.output_type,output_ref=excluded.output_ref,output_quantity=excluded.output_quantity,payment_mode=excluded.payment_mode,coin_cost=excluded.coin_cost,master_star_cost=excluded.master_star_cost,success_rate=excluded.success_rate,is_featured=excluded.is_featured,is_active=excluded.is_active,is_public=excluded.is_public,owner_test_only=excluded.owner_test_only,sort_order=excluded.sort_order,updated_at=CURRENT_TIMESTAMP`),
    env.DB.prepare(`INSERT INTO app_meta(key,value,updated_at) VALUES(?, '1', CURRENT_TIMESTAMP) ON CONFLICT(key) DO UPDATE SET value=excluded.value,updated_at=CURRENT_TIMESTAMP`).bind(MATERIAL_CRAFT_UPGRADE_KEY)
  ]);
  return true;
}

export async function ensureWorkshopFoundation(env){
  if(foundationPromise)return foundationPromise;
  foundationPromise=(async()=>{
    const current=await env.DB.prepare("SELECT value FROM app_meta WHERE key='safe_runtime_upgrade_v1678_synthesis_rate_scrapyard_rewards'").first();
    if(current?.value!=='1'){
      await ensureEquipmentFoundation(env);
      for(const sql of FOUNDATION_SQL)await env.DB.prepare(sql).run();
      const recipeColumns=await env.DB.prepare(`PRAGMA table_info(${SYNTH_RECIPE_TABLE})`).all();
      if(!(recipeColumns.results||[]).some(row=>row.name==='success_rate'))await env.DB.prepare(`ALTER TABLE ${SYNTH_RECIPE_TABLE} ADD COLUMN success_rate REAL NOT NULL DEFAULT 100`).run();
      const logColumns=await env.DB.prepare(`PRAGMA table_info(${SYNTH_LOG_TABLE})`).all();
      if(!(logColumns.results||[]).some(row=>row.name==='success'))await env.DB.prepare(`ALTER TABLE ${SYNTH_LOG_TABLE} ADD COLUMN success INTEGER NOT NULL DEFAULT 1`).run();
      await env.DB.batch([
        env.DB.prepare("UPDATE inventory_items SET image_url='assets/ui/workshop/vehicle-part-tire-v1668.png',updated_at=CURRENT_TIMESTAMP WHERE code='VEHICLE_PART_TIRE'"),
        env.DB.prepare("UPDATE inventory_items SET image_url='assets/ui/workshop/vehicle-part-frame-v1668.png',updated_at=CURRENT_TIMESTAMP WHERE code='VEHICLE_PART_FRAME'"),
        env.DB.prepare("UPDATE inventory_items SET image_url='assets/ui/workshop/vehicle-part-engine-v1668.png',updated_at=CURRENT_TIMESTAMP WHERE code='VEHICLE_PART_ENGINE'"),
        env.DB.prepare(`DELETE FROM ${GUARD_TABLE} WHERE created_at<datetime('now','-1 day')`)
      ]);
      for(const recipe of DEFAULT_RECIPES){
        await env.DB.prepare(`INSERT OR IGNORE INTO ${RECIPE_TABLE}(code,category,name,description,output_type,output_ref,output_quantity,payment_mode,coin_cost,master_star_cost,success_rate,is_featured,is_active,is_public,owner_test_only,sort_order) SELECT ?,'VEHICLE',?,?,'VEHICLE',CAST(id AS TEXT),1,'COIN_OR_MASTER_STAR',?,?,100,?,1,1,0,? FROM character_garage_items WHERE id=?`).bind(recipe.code,recipe.name,recipe.description,recipe.coin,recipe.stars,recipe.featured,recipe.sort,Number(recipe.outputRef)).run();
        const row=await env.DB.prepare(`SELECT id FROM ${RECIPE_TABLE} WHERE code=?`).bind(recipe.code).first();
        if(row?.id){const statements=recipe.materials.map(([itemCode,quantity],index)=>env.DB.prepare(`INSERT OR IGNORE INTO ${MATERIAL_TABLE}(recipe_id,item_code,quantity,sort_order) VALUES(?,?,?,?)`).bind(row.id,itemCode,quantity,(index+1)*10));if(statements.length)await env.DB.batch(statements)}
      }
      for(const [recipeCode,name,description,inputName,outputName,sortOrder] of DEFAULT_SYNTH_RECIPES){
        await env.DB.prepare(`INSERT OR IGNORE INTO ${SYNTH_RECIPE_TABLE}(code,name,description,input_equipment_id,output_equipment_id,input_quantity,is_active,is_public,owner_test_only,sort_order)
          SELECT ?,?,?,input.id,output.id,3,1,1,0,? FROM character_equipment_items input JOIN character_equipment_items output ON output.name=? WHERE input.name=? LIMIT 1`).bind(recipeCode,name,description,sortOrder,outputName,inputName).run();
      }
      await env.DB.batch([
        env.DB.prepare("INSERT OR REPLACE INTO app_meta(key,value,updated_at) VALUES('safe_runtime_upgrade_v1668_workshop','1',CURRENT_TIMESTAMP)"),
        env.DB.prepare("INSERT OR REPLACE INTO app_meta(key,value,updated_at) VALUES('safe_runtime_upgrade_v1676_workshop_synthesis','1',CURRENT_TIMESTAMP)"),
        env.DB.prepare("INSERT OR REPLACE INTO app_meta(key,value,updated_at) VALUES('safe_runtime_upgrade_v1677_equipment_synthesis_recipes','1',CURRENT_TIMESTAMP)"),
        env.DB.prepare("INSERT OR REPLACE INTO app_meta(key,value,updated_at) VALUES('safe_runtime_upgrade_v1678_synthesis_rate_scrapyard_rewards','1',CURRENT_TIMESTAMP)")
      ]);
    }
    await ensureMaterialCraftUpgrade(env);
    return true;
  })().catch(error=>{foundationPromise=null;throw error});
  return foundationPromise;
}

async function recipeRows(env,{admin=false}={}){
  const where=admin?'1=1':'r.is_active=1 AND r.is_public=1';
  const rows=await env.DB.prepare(`SELECT r.*,COALESCE(g.name,e.name,i.name,r.name) output_name,replace(COALESCE(g.image_url,e.image_url,i.image_url,''),char(92),'/') output_image,COALESCE(g.rarity,e.rarity,i.rarity,'SPECIAL') output_rarity,COALESCE(g.pve_power,e.pve_power,0) output_pve,COALESCE(g.pvp_power,e.pvp_power,0) output_pvp FROM ${RECIPE_TABLE} r LEFT JOIN character_garage_items g ON r.output_type='VEHICLE' AND CAST(g.id AS TEXT)=r.output_ref LEFT JOIN character_equipment_items e ON r.output_type='EQUIPMENT' AND CAST(e.id AS TEXT)=r.output_ref LEFT JOIN inventory_items i ON r.output_type='INVENTORY_ITEM' AND i.code=r.output_ref WHERE ${where} ORDER BY r.category,r.sort_order,r.id`).all();
  const materials=await env.DB.prepare(`SELECT m.*,i.name item_name,replace(i.image_url,char(92),'/') image_url,i.rarity FROM ${MATERIAL_TABLE} m LEFT JOIN inventory_items i ON i.code=m.item_code ORDER BY m.recipe_id,m.sort_order,m.item_code`).all();
  const byRecipe=new Map();
  for(const material of materials.results||[]){const id=Number(material.recipe_id);if(!byRecipe.has(id))byRecipe.set(id,[]);byRecipe.get(id).push({...material,quantity:Number(material.quantity||0)})}
  return (rows.results||[]).map(row=>{
    const fixed=FIXED_RECIPE_COSTS[String(row.code||'').toUpperCase()];
    return {...row,
      id:Number(row.id),
      category:fixed?.category??row.category,
      output_type:fixed?.outputType??row.output_type,
      output_ref:fixed?.outputRef??row.output_ref,
      output_quantity:Number(fixed?.outputQuantity??row.output_quantity??1),
      payment_mode:fixed?.paymentMode??row.payment_mode,
      coin_cost:Number(fixed?.coin??row.coin_cost??0),
      master_star_cost:Number(fixed?0:row.master_star_cost||0),
      card_shard_cost:Number(fixed?.cardShards||0),
      success_rate:Number(fixed?.successRate??row.success_rate??100),
      materials:fixed?[]:byRecipe.get(Number(row.id))||[]
    };
  });
}

async function synthesisRecipeRows(env,user,{admin=false}={}){
  const visibility=admin?'1=1':`r.is_active=1 AND r.is_public=1 AND input.is_public=1 AND output.is_public=1 AND (r.owner_test_only=0 OR ?='OWNER')`;
  const statement=env.DB.prepare(`SELECT r.id recipe_id,r.code,r.name recipe_name,r.description,r.input_equipment_id,r.output_equipment_id,r.input_quantity,r.success_rate,r.is_active,r.is_public,r.owner_test_only,r.sort_order,
    input.name,input.slot,input.rarity,replace(input.image_url,char(92),'/') image_url,input.pve_power,input.pvp_power,
    output.name output_name,output.slot output_slot,output.rarity output_rarity,replace(output.image_url,char(92),'/') output_image,output.pve_power output_pve_power,output.pvp_power output_pvp_power,
    COALESCE(owned.quantity,0) quantity
    FROM ${SYNTH_RECIPE_TABLE} r
    JOIN character_equipment_items input ON input.id=r.input_equipment_id AND input.is_active=1
    JOIN character_equipment_items output ON output.id=r.output_equipment_id AND output.is_active=1
    LEFT JOIN (SELECT x.equipment_id,COUNT(*) quantity FROM user_equipment_instances x LEFT JOIN user_equipment_loadout l ON l.instance_id=x.id WHERE x.user_id=? AND l.instance_id IS NULL GROUP BY x.equipment_id) owned ON owned.equipment_id=r.input_equipment_id
    WHERE ${visibility} ORDER BY r.sort_order,r.id`);
  const rows=admin?await statement.bind(user.id).all():await statement.bind(user.id,String(user.role||'').toUpperCase()).all();
  return (rows.results||[]).map(row=>({...row,recipe_id:Number(row.recipe_id),input_equipment_id:Number(row.input_equipment_id),output_equipment_id:Number(row.output_equipment_id),input_quantity:Number(row.input_quantity||3),success_rate:Number(row.success_rate??100),quantity:Number(row.quantity||0),pve_power:Number(row.pve_power||0),pvp_power:Number(row.pvp_power||0),output_pve_power:Number(row.output_pve_power||0),output_pvp_power:Number(row.output_pvp_power||0)}));
}

async function userWorkshopState(env,user,{admin=false}={}){
  const [wallet,items,ownedVehicles,recipes,synthesisRows]=await Promise.all([
    env.DB.prepare(`SELECT u.coin,u.card_shards,COALESCE((SELECT quantity FROM cnine_user_inventory WHERE user_id=u.id AND item_code='MASTER_STAR'),0) master_stars FROM users u WHERE u.id=?`).bind(user.id).first(),
    env.DB.prepare(`SELECT i.code,i.name,replace(i.image_url,char(92),'/') image_url,i.rarity,COALESCE(ui.quantity,0) quantity FROM inventory_items i LEFT JOIN cnine_user_inventory ui ON ui.item_code=i.code AND ui.user_id=? WHERE i.code='MASTER_STAR' OR EXISTS(SELECT 1 FROM ${MATERIAL_TABLE} m WHERE m.item_code=i.code) OR EXISTS(SELECT 1 FROM ${RECIPE_TABLE} r WHERE r.output_type='INVENTORY_ITEM' AND r.output_ref=i.code AND r.is_active=1 AND r.is_public=1)`).bind(user.id).all(),
    env.DB.prepare('SELECT garage_id FROM user_garage_vehicles WHERE user_id=?').bind(user.id).all(),
    recipeRows(env,{admin}),
    synthesisRecipeRows(env,user,{admin})
  ]);
  const inventory=Object.fromEntries((items.results||[]).map(row=>[row.code,{...row,quantity:Number(row.quantity||0)}]));
  const owned=new Set((ownedVehicles.results||[]).map(row=>String(row.garage_id)));
  return {serverNow:new Date().toISOString(),wallet:{coin:Number(wallet?.coin||0),cardShards:Number(wallet?.card_shards||0),masterStars:Number(wallet?.master_stars||0)},inventory,recipes:recipes.filter(recipe=>admin||Number(recipe.owner_test_only)===0||isOwner(user)).map(recipe=>({...recipe,owned:recipe.output_type==='VEHICLE'&&owned.has(String(recipe.output_ref))})),synthesis:synthesisRows,categories:[{id:'VEHICLE',name:'차량 제작',enabled:true},{id:'EQUIPMENT_SYNTHESIS',name:'장비 합성',enabled:true},{id:'MATERIAL_CRAFT',name:'재료 제작',enabled:true}]};
}

function paymentFor(recipe,requested){
  const mode=String(recipe.payment_mode||'COIN_OR_MASTER_STAR').toUpperCase(),choice=String(requested||'').toUpperCase();
  const fixed=FIXED_RECIPE_COSTS[String(recipe.code||'').toUpperCase()];
  if(fixed)return {type:'COIN_AND_CARD_SHARD',coin:Number(fixed.coin||0),stars:0,shards:Number(fixed.cardShards||0)};
  if(mode==='COIN_ONLY')return {type:'COIN',coin:Number(recipe.coin_cost||0),stars:0,shards:0};
  if(mode==='MASTER_STAR_ONLY')return {type:'MASTER_STAR',coin:0,stars:Number(recipe.master_star_cost||0),shards:0};
  if(mode==='BOTH')return {type:'BOTH',coin:Number(recipe.coin_cost||0),stars:Number(recipe.master_star_cost||0),shards:0};
  if(mode==='COIN_AND_CARD_SHARD')return {type:'COIN_AND_CARD_SHARD',coin:Number(recipe.coin_cost||0),stars:0,shards:Number(recipe.card_shard_cost||0)};
  if(!['COIN','MASTER_STAR'].includes(choice))throw new Error('코인 또는 마스터의 별 결제 방식을 선택하세요.');
  return choice==='COIN'?{type:'COIN',coin:Number(recipe.coin_cost||0),stars:0,shards:0}:{type:'MASTER_STAR',coin:0,stars:Number(recipe.master_star_cost||0),shards:0};
}

async function craft(env,user,body){
  const recipeId=int(body.recipeId,1,2147483647),requestId=clean(body.requestId,120);
  if(!requestId)throw new Error('제작 요청 번호가 없습니다.');
  const prior=await env.DB.prepare(`SELECT status,result_json,error_message FROM ${RECEIPT_TABLE} WHERE request_id=? AND user_id=?`).bind(requestId,user.id).first();
  if(prior?.status==='COMPLETED')return {...parse(prior.result_json,{ok:true}),replayed:true,state:await userWorkshopState(env,user)};
  if(prior?.status==='PENDING')throw new Error('같은 제작 요청을 처리 중입니다. 잠시 후 다시 확인하세요.');
  if(prior?.status==='FAILED')throw new Error(prior.error_message||'이 제작 요청은 취소되었습니다. 새로 시도하세요.');
  const recipe=(await recipeRows(env,{admin:isOwner(user)})).find(row=>Number(row.id)===recipeId);
  if(!recipe||Number(recipe.is_active)===0||Number(recipe.is_public)===0||Number(recipe.owner_test_only)!==0&&!isOwner(user))throw new Error('현재 제작할 수 없는 레시피입니다.');
  if(recipe.output_type==='VEHICLE'&&await env.DB.prepare('SELECT 1 FROM user_garage_vehicles WHERE user_id=? AND garage_id=?').bind(user.id,int(recipe.output_ref,1)).first())throw new Error('이미 보유한 차량입니다.');
  const payment=paymentFor(recipe,body.paymentType),state=await userWorkshopState(env,user),missing=recipe.materials.filter(material=>Number(state.inventory[material.item_code]?.quantity||0)<Number(material.quantity||0));
  if(missing.length)throw new Error(`제작 재료가 부족합니다: ${missing.map(material=>material.item_name||material.item_code).join(', ')}`);
  if(state.wallet.coin<payment.coin)throw new Error('제작에 필요한 코인이 부족합니다.');
  if(state.wallet.cardShards<payment.shards)throw new Error('제작에 필요한 카드 조각이 부족합니다.');
  if(state.wallet.masterStars<payment.stars)throw new Error('제작에 필요한 마스터의 별이 부족합니다.');
  const reserved=await env.DB.prepare(`INSERT OR IGNORE INTO ${RECEIPT_TABLE}(request_id,user_id,recipe_id,payment_type,status) VALUES(?,?,?,?,'PENDING')`).bind(requestId,user.id,recipe.id,payment.type).run();
  if(!reserved.meta?.changes)throw new Error('같은 제작 요청을 처리 중입니다.');
  const guardId=`WORKSHOP:${user.id}:${requestId}`,success=Math.random()*100<recipe.success_rate;
  const result={ok:true,requestId,recipeId:recipe.id,recipeName:recipe.name,category:recipe.category,success,paymentType:payment.type,coinSpent:payment.coin,masterStarSpent:payment.stars,cardShardSpent:payment.shards,output:success?{type:recipe.output_type,ref:recipe.output_ref,name:recipe.output_name,image:recipe.output_image,rarity:recipe.output_rarity,quantity:recipe.output_quantity}:null};
  const guard=env.DB.prepare(`INSERT INTO ${GUARD_TABLE}(guard_id,user_id,recipe_id,verified) SELECT ?,?,?,CASE WHEN EXISTS(SELECT 1 FROM users WHERE id=? AND coin>=? AND card_shards>=?) AND (?=0 OR EXISTS(SELECT 1 FROM cnine_user_inventory WHERE user_id=? AND item_code='MASTER_STAR' AND quantity>=?)) AND NOT EXISTS(SELECT 1 FROM ${MATERIAL_TABLE} m LEFT JOIN cnine_user_inventory ui ON ui.user_id=? AND ui.item_code=m.item_code WHERE m.recipe_id=? AND COALESCE(ui.quantity,0)<m.quantity) AND (?<>'VEHICLE' OR NOT EXISTS(SELECT 1 FROM user_garage_vehicles WHERE user_id=? AND garage_id=?)) THEN 1 ELSE 0 END`).bind(guardId,user.id,recipe.id,user.id,payment.coin,payment.shards,payment.stars,user.id,payment.stars,user.id,recipe.id,recipe.output_type,user.id,int(recipe.output_ref,0));
  const verified=`EXISTS(SELECT 1 FROM ${GUARD_TABLE} WHERE guard_id=? AND verified=1)`;
  const statements=[];
  if(env.DB?.dialect==='postgres'){
    statements.push(env.DB.prepare('SELECT id FROM users WHERE id=? FOR UPDATE').bind(user.id));
    const inventoryCodes=[...new Set([...(payment.stars>0?['MASTER_STAR']:[]),...recipe.materials.map(material=>material.item_code)])];
    if(inventoryCodes.length){const marks=inventoryCodes.map(()=>'?').join(',');statements.push(env.DB.prepare(`SELECT item_code FROM cnine_user_inventory WHERE user_id=? AND item_code IN (${marks}) FOR UPDATE`).bind(user.id,...inventoryCodes))}
  }
  statements.push(guard);
  if(payment.coin>0||payment.shards>0)statements.push(env.DB.prepare(`UPDATE users SET coin=coin-?,card_shards=card_shards-? WHERE id=? AND coin>=? AND card_shards>=? AND ${verified}`).bind(payment.coin,payment.shards,user.id,payment.coin,payment.shards,guardId));
  if(payment.stars>0)statements.push(env.DB.prepare(`UPDATE cnine_user_inventory SET quantity=quantity-?,unseen_quantity=MIN(unseen_quantity,quantity-?),updated_at=CURRENT_TIMESTAMP WHERE user_id=? AND item_code='MASTER_STAR' AND ${verified}`).bind(payment.stars,payment.stars,user.id,guardId));
  for(const material of recipe.materials)statements.push(env.DB.prepare(`UPDATE cnine_user_inventory SET quantity=quantity-?,unseen_quantity=MIN(unseen_quantity,quantity-?),updated_at=CURRENT_TIMESTAMP WHERE user_id=? AND item_code=? AND ${verified}`).bind(material.quantity,material.quantity,user.id,material.item_code,guardId));
  if(success&&recipe.output_type==='VEHICLE')statements.push(env.DB.prepare(`INSERT INTO user_garage_vehicles(user_id,garage_id,source_type,source_id) SELECT ?,CAST(? AS INTEGER),'WORKSHOP',? WHERE ${verified}`).bind(user.id,recipe.output_ref,requestId,guardId));
  if(success&&recipe.output_type==='EQUIPMENT')statements.push(env.DB.prepare(`INSERT INTO user_equipment_instances(user_id,equipment_id,source_type,source_id,request_id) SELECT ?,CAST(? AS INTEGER),'WORKSHOP',?,? WHERE ${verified}`).bind(user.id,recipe.output_ref,requestId,requestId,guardId));
  if(success&&recipe.output_type==='INVENTORY_ITEM')statements.push(env.DB.prepare(`INSERT INTO cnine_user_inventory(user_id,item_code,quantity,unseen_quantity,created_at,updated_at) SELECT ?,?,?,?,CURRENT_TIMESTAMP,CURRENT_TIMESTAMP WHERE ${verified} ON CONFLICT(user_id,item_code) DO UPDATE SET quantity=cnine_user_inventory.quantity+excluded.quantity,unseen_quantity=cnine_user_inventory.unseen_quantity+excluded.unseen_quantity,updated_at=CURRENT_TIMESTAMP`).bind(user.id,recipe.output_ref,recipe.output_quantity,recipe.output_quantity,guardId));
  statements.push(env.DB.prepare(`INSERT INTO ${LOG_TABLE}(request_id,user_id,recipe_id,recipe_name,category,output_type,output_ref,output_quantity,payment_type,coin_spent,master_star_spent,success) SELECT ?,?,?,?,?,?,?,?,?,?,?,? WHERE ${verified}`).bind(requestId,user.id,recipe.id,recipe.name,recipe.category,recipe.output_type,recipe.output_ref,recipe.output_quantity,payment.type,payment.coin,payment.stars,success?1:0,guardId));
  for(const material of recipe.materials)statements.push(env.DB.prepare(`INSERT INTO inventory_logs(user_id,item_code,change_amount,balance_after,reason,reference_type,reference_id) SELECT ?,?,-?,quantity,'WORKSHOP_MATERIAL','WORKSHOP',? FROM cnine_user_inventory WHERE user_id=? AND item_code=? AND ${verified}`).bind(user.id,material.item_code,material.quantity,requestId,user.id,material.item_code,guardId));
  if(payment.stars>0)statements.push(env.DB.prepare(`INSERT INTO inventory_logs(user_id,item_code,change_amount,balance_after,reason,reference_type,reference_id) SELECT ?,'MASTER_STAR',-?,quantity,'WORKSHOP_PAYMENT','WORKSHOP',? FROM cnine_user_inventory WHERE user_id=? AND item_code='MASTER_STAR' AND ${verified}`).bind(user.id,payment.stars,requestId,user.id,guardId));
  if(payment.coin>0)statements.push(env.DB.prepare(`INSERT INTO coin_logs(user_id,change_amount,balance_after,reason) SELECT ?,-?,coin,'WORKSHOP_PAYMENT' FROM users WHERE id=? AND ${verified}`).bind(user.id,payment.coin,user.id,guardId));
  if(payment.shards>0)statements.push(env.DB.prepare(`INSERT INTO shard_logs(user_id,change_amount,balance_after,reason,card_id) SELECT ?,-?,card_shards,'WORKSHOP_PAYMENT',NULL FROM users WHERE id=? AND ${verified}`).bind(user.id,payment.shards,user.id,guardId));
  if(success&&recipe.output_type==='INVENTORY_ITEM')statements.push(env.DB.prepare(`INSERT INTO inventory_logs(user_id,item_code,change_amount,balance_after,reason,reference_type,reference_id) SELECT ?,?,?,quantity,'WORKSHOP_OUTPUT','WORKSHOP',? FROM cnine_user_inventory WHERE user_id=? AND item_code=? AND ${verified}`).bind(user.id,recipe.output_ref,recipe.output_quantity,requestId,user.id,recipe.output_ref,guardId));
  statements.push(env.DB.prepare(`UPDATE ${RECEIPT_TABLE} SET status='COMPLETED',result_json=?,updated_at=CURRENT_TIMESTAMP WHERE request_id=? AND user_id=? AND ${verified}`).bind(JSON.stringify(result),requestId,user.id,guardId));
  try{await env.DB.batch(statements)}catch(error){
    const message=clean(error?.message||'제작 트랜잭션 처리 실패',300);
    await env.DB.prepare(`UPDATE ${RECEIPT_TABLE} SET status='FAILED',error_message=?,updated_at=CURRENT_TIMESTAMP WHERE request_id=? AND user_id=? AND status='PENDING'`).bind(message,requestId,user.id).run().catch(()=>null);
    await env.DB.prepare(`DELETE FROM ${GUARD_TABLE} WHERE guard_id=?`).bind(guardId).run().catch(()=>null);
    throw error;
  }
  const checked=await env.DB.prepare(`SELECT verified FROM ${GUARD_TABLE} WHERE guard_id=?`).bind(guardId).first();
  await env.DB.prepare(`DELETE FROM ${GUARD_TABLE} WHERE guard_id=?`).bind(guardId).run();
  if(Number(checked?.verified)!==1){await env.DB.prepare(`UPDATE ${RECEIPT_TABLE} SET status='FAILED',error_message='재료 또는 재화가 변경되어 제작이 취소되었습니다.',updated_at=CURRENT_TIMESTAMP WHERE request_id=? AND user_id=? AND status='PENDING'`).bind(requestId,user.id).run();throw new Error('재료 또는 재화가 변경되어 제작이 취소되었습니다. 다시 확인하세요.')}
  return {...result,state:await userWorkshopState(env,user)};
}

const SYNTH_RARITIES=['NORMAL','MAGIC','RARE','EPIC','LEGENDARY','MYTHIC'];
function normalizedRarity(value){const x=String(value||'NORMAL').toUpperCase();return x==='MYTH'?'MYTHIC':SYNTH_RARITIES.includes(x)?x:'NORMAL'}
export const MAX_EQUIPMENT_SYNTHESIS_ATTEMPTS=100;
export function equipmentSynthesisBatchPlan({available=0,required=3,attempts=1}={}){
  const stock=Math.max(0,Math.floor(Number(available)||0)),perAttempt=Math.max(1,Math.floor(Number(required)||3)),requested=Number(attempts??1);
  if(!Number.isInteger(requested)||requested<1||requested>MAX_EQUIPMENT_SYNTHESIS_ATTEMPTS)throw new Error(`장비 합성은 한 번에 1회 이상 ${MAX_EQUIPMENT_SYNTHESIS_ATTEMPTS}회 이하로 실행할 수 있습니다.`);
  const inventoryAttempts=Math.floor(stock/perAttempt),maxAttempts=Math.min(MAX_EQUIPMENT_SYNTHESIS_ATTEMPTS,inventoryAttempts);
  if(requested>maxAttempts)throw new Error(`장착하지 않은 동일 장비가 ${perAttempt*requested}개 필요합니다. 현재 일괄 합성 가능 횟수는 ${maxAttempts}회입니다.`);
  return{attempts:requested,required:perAttempt,totalRequired:perAttempt*requested,maxAttempts,inventoryAttempts};
}

async function synthesizeEquipment(env,user,body){
  const recipeId=int(body.recipeId,1,2147483647),requestId=clean(body.requestId,120);if(!requestId)throw new Error('합성 요청번호가 없습니다.');
  const prior=await env.DB.prepare(`SELECT status,result_json,error_message FROM ${SYNTH_RECEIPT_TABLE} WHERE request_id=? AND user_id=?`).bind(requestId,user.id).first();
  if(prior?.status==='COMPLETED')return {...parse(prior.result_json,{ok:true}),replayed:true,state:await userWorkshopState(env,user)};
  if(prior?.status==='PENDING')throw new Error('같은 장비 합성을 처리 중입니다.');if(prior?.status==='FAILED')throw new Error(prior.error_message||'이전 합성 요청이 취소되었습니다.');
  const recipe=(await synthesisRecipeRows(env,user)).find(row=>row.recipe_id===recipeId);if(!recipe)throw new Error('현재 공개된 장비 합성 레시피가 아닙니다.');
  const equipmentId=recipe.input_equipment_id,required=int(recipe.input_quantity,1,20,3),plan=equipmentSynthesisBatchPlan({available:recipe.quantity,required,attempts:body.attempts??1}),inputs=await env.DB.prepare(`SELECT x.id,i.id equipment_id,i.name,i.slot,i.rarity,i.image_url FROM user_equipment_instances x JOIN character_equipment_items i ON i.id=x.equipment_id LEFT JOIN user_equipment_loadout l ON l.instance_id=x.id WHERE x.user_id=? AND x.equipment_id=? AND l.instance_id IS NULL AND i.is_active=1 AND i.is_public=1 ORDER BY x.id LIMIT ?`).bind(user.id,equipmentId,plan.totalRequired).all();
  if((inputs.results||[]).length!==plan.totalRequired)throw new Error(`장착하지 않은 동일 장비 ${plan.totalRequired}개가 필요합니다.`);
  const source=inputs.results[0],result=await env.DB.prepare(`SELECT id,name,slot,rarity,replace(image_url,char(92),'/') image_url,pve_power,pvp_power FROM character_equipment_items WHERE id=? AND is_active=1 AND is_public=1`).bind(recipe.output_equipment_id).first();if(!result)throw new Error('CMS에 지정된 합성 결과 장비가 비활성 상태입니다.');
  const instanceIds=inputs.results.map(row=>Number(row.id)),reserved=await env.DB.prepare(`INSERT OR IGNORE INTO ${SYNTH_RECEIPT_TABLE}(request_id,user_id,equipment_id,status) VALUES(?,?,?,'PENDING')`).bind(requestId,user.id,equipmentId).run();if(!reserved.meta?.changes)throw new Error('같은 장비 합성을 처리 중입니다.');
  const successRate=num(recipe.success_rate,0,100,100),rollValues=new Uint32Array(plan.attempts);crypto.getRandomValues(rollValues);const outcomes=Array.from(rollValues,(roll,index)=>({attempt:index+1,success:roll/4294967296*100<successRate})),successIndexes=outcomes.filter(outcome=>outcome.success).map(outcome=>outcome.attempt),successCount=successIndexes.length,failureCount=plan.attempts-successCount,success=successCount>0;
  const guardId=`SYNTH:${user.id}:${requestId}`,instanceIdsJson=JSON.stringify(instanceIds),selectedIdRows=env.DB?.dialect==='postgres'?`SELECT CAST(value AS BIGINT) id FROM jsonb_array_elements_text(?::jsonb) AS selected(value)`:`SELECT CAST(value AS INTEGER) id FROM json_each(?)`,response={ok:true,requestId,recipeId,recipeName:recipe.recipe_name,success,allSucceeded:successCount===plan.attempts,successRate,attempts:plan.attempts,successCount,failureCount,outcomes,input:{equipmentId,name:source.name,image:String(source.image_url||'').replace(/\\/g,'/'),rarity:normalizedRarity(source.rarity),quantity:plan.totalRequired,perAttempt:required},output:{equipmentId:Number(result.id),name:result.name,image:result.image_url,rarity:normalizedRarity(result.rarity),slot:result.slot,pvePower:Number(result.pve_power||0),pvpPower:Number(result.pvp_power||0),quantity:successCount}};
  const statements=[
    env.DB.prepare(`INSERT INTO ${GUARD_TABLE}(guard_id,user_id,recipe_id,verified) SELECT ?,?,0,CASE WHEN (SELECT COUNT(*) FROM user_equipment_instances x LEFT JOIN user_equipment_loadout l ON l.instance_id=x.id WHERE x.user_id=? AND x.equipment_id=? AND l.instance_id IS NULL AND x.id IN (${selectedIdRows}))=? THEN 1 ELSE 0 END`).bind(guardId,user.id,user.id,equipmentId,instanceIdsJson,plan.totalRequired),
    env.DB.prepare(`DELETE FROM user_equipment_instances WHERE id IN (${selectedIdRows}) AND user_id=? AND EXISTS(SELECT 1 FROM ${GUARD_TABLE} WHERE guard_id=? AND verified=1)`).bind(instanceIdsJson,user.id,guardId)
  ];
  if(successCount){
    const outputRowsJson=JSON.stringify(successIndexes.map(attempt=>[Number(result.id),attempt]));
    statements.push(env.DB.prepare(env.DB?.dialect==='postgres'?`WITH output_rows AS (SELECT CAST(value->>0 AS BIGINT) equipment_id,CAST(value->>1 AS INTEGER) attempt_no FROM jsonb_array_elements(?::jsonb) AS rows(value)) INSERT INTO user_equipment_instances(user_id,equipment_id,source_type,source_id,request_id) SELECT ?,output_rows.equipment_id,'SYNTHESIS',?,?||':'||CAST(output_rows.attempt_no AS TEXT) FROM output_rows WHERE EXISTS(SELECT 1 FROM ${GUARD_TABLE} WHERE guard_id=? AND verified=1)`:`WITH output_rows AS (SELECT CAST(json_extract(value,'$[0]') AS INTEGER) equipment_id,CAST(json_extract(value,'$[1]') AS INTEGER) attempt_no FROM json_each(?)) INSERT INTO user_equipment_instances(user_id,equipment_id,source_type,source_id,request_id) SELECT ?,output_rows.equipment_id,'SYNTHESIS',?,?||':'||output_rows.attempt_no FROM output_rows WHERE EXISTS(SELECT 1 FROM ${GUARD_TABLE} WHERE guard_id=? AND verified=1)`).bind(outputRowsJson,user.id,String(equipmentId),requestId,guardId));
  }
  statements.push(
    env.DB.prepare(`INSERT INTO ${SYNTH_LOG_TABLE}(request_id,user_id,input_equipment_id,output_equipment_id,input_instance_ids,success) SELECT ?,?,?,?,?,? WHERE EXISTS(SELECT 1 FROM ${GUARD_TABLE} WHERE guard_id=? AND verified=1)`).bind(requestId,user.id,equipmentId,result.id,instanceIdsJson,successCount,guardId),
    env.DB.prepare(`UPDATE ${SYNTH_RECEIPT_TABLE} SET status='COMPLETED',result_json=?,updated_at=CURRENT_TIMESTAMP WHERE request_id=? AND user_id=? AND EXISTS(SELECT 1 FROM ${GUARD_TABLE} WHERE guard_id=? AND verified=1)`).bind(JSON.stringify(response),requestId,user.id,guardId)
  );
  try{await env.DB.batch(statements);const guard=await env.DB.prepare(`SELECT verified FROM ${GUARD_TABLE} WHERE guard_id=?`).bind(guardId).first();await env.DB.prepare(`DELETE FROM ${GUARD_TABLE} WHERE guard_id=?`).bind(guardId).run();if(Number(guard?.verified)!==1)throw new Error('보유 장비가 변경되어 합성이 취소되었습니다.');return {...response,state:await userWorkshopState(env,user)}}catch(error){await env.DB.prepare(`UPDATE ${SYNTH_RECEIPT_TABLE} SET status='FAILED',error_message=?,updated_at=CURRENT_TIMESTAMP WHERE request_id=? AND user_id=? AND status='PENDING'`).bind(clean(error.message,300),requestId,user.id).run().catch(()=>null);await env.DB.prepare(`DELETE FROM ${GUARD_TABLE} WHERE guard_id=?`).bind(guardId).run().catch(()=>null);throw error}
}

async function adminSnapshot(env){
  const [recipes,vehicles,equipment,items,logs,synthesisRecipes,synthesisLogs]=await Promise.all([
    recipeRows(env,{admin:true}),
    env.DB.prepare('SELECT id,code,name,rarity,image_url FROM character_garage_items WHERE is_active=1 ORDER BY sort_order,id').all(),
    env.DB.prepare('SELECT id,code,name,slot,rarity,image_url FROM character_equipment_items WHERE is_active=1 ORDER BY sort_order,id').all(),
    env.DB.prepare('SELECT code,name,category,rarity,image_url FROM inventory_items WHERE is_active=1 ORDER BY category,sort_order,name').all(),
    env.DB.prepare(`SELECT l.*,r.code recipe_code,u.nickname,CASE WHEN UPPER(COALESCE(r.code,''))='${MYSTIC_ENERGY_RECIPE_CODE}' THEN ${FIXED_RECIPE_COSTS[MYSTIC_ENERGY_RECIPE_CODE].cardShards} ELSE 0 END card_shard_spent FROM ${LOG_TABLE} l LEFT JOIN ${RECIPE_TABLE} r ON r.id=l.recipe_id LEFT JOIN users u ON u.id=l.user_id ORDER BY l.id DESC LIMIT 60`).all(),
    env.DB.prepare(`SELECT r.*,input.name input_name,input.rarity input_rarity,replace(input.image_url,char(92),'/') input_image,output.name output_name,output.rarity output_rarity,replace(output.image_url,char(92),'/') output_image FROM ${SYNTH_RECIPE_TABLE} r JOIN character_equipment_items input ON input.id=r.input_equipment_id JOIN character_equipment_items output ON output.id=r.output_equipment_id ORDER BY r.sort_order,r.id`).all(),
    env.DB.prepare(`SELECT l.*,u.nickname,input.name input_name,output.name output_name FROM ${SYNTH_LOG_TABLE} l LEFT JOIN users u ON u.id=l.user_id LEFT JOIN character_equipment_items input ON input.id=l.input_equipment_id LEFT JOIN character_equipment_items output ON output.id=l.output_equipment_id ORDER BY l.id DESC LIMIT 60`).all()
  ]);
  return {recipes,vehicles:vehicles.results||[],equipment:equipment.results||[],inventoryItems:items.results||[],recentLogs:logs.results||[],synthesisRecipes:synthesisRecipes.results||[],recentSynthesisLogs:synthesisLogs.results||[],categories:[...CATEGORIES],outputTypes:[...OUTPUT_TYPES],paymentModes:[...PAYMENT_MODES]};
}

function cleanMaterial(raw,index){const itemCode=code(raw.itemCode||raw.item_code,100),quantity=int(raw.quantity,1,100000000,1);if(!itemCode)throw new Error(`${index+1}번째 재료 코드를 입력하세요.`);return {itemCode,quantity,sortOrder:int(raw.sortOrder??raw.sort_order,-100000,100000,(index+1)*10)}}

async function saveRecipe(env,admin,raw,deps){
  const id=int(raw.id,0,2147483647),requestedRecipeCode=code(raw.code),name=clean(raw.name,80);
  let before=null;
  if(id){before=await env.DB.prepare(`SELECT * FROM ${RECIPE_TABLE} WHERE id=?`).bind(id).first();if(!before)throw new Error('수정할 레시피를 찾을 수 없습니다.')}
  const editingCanonical=String(before?.code||'').toUpperCase()===MYSTIC_ENERGY_RECIPE_CODE;
  const recipeCode=editingCanonical?MYSTIC_ENERGY_RECIPE_CODE:requestedRecipeCode;
  const fixed=FIXED_RECIPE_COSTS[recipeCode];
  const category=fixed?.category??code(raw.category),outputType=fixed?.outputType??code(raw.outputType||raw.output_type),outputRef=fixed?.outputRef??clean(raw.outputRef||raw.output_ref,100),outputQuantity=int(fixed?.outputQuantity??raw.outputQuantity??raw.output_quantity,1,100,1),paymentMode=fixed?.paymentMode??code(raw.paymentMode||raw.payment_mode),materials=fixed?[]:(Array.isArray(raw.materials)?raw.materials:[]).slice(0,30).map(cleanMaterial);
  const requestedCardShardCost=int(raw.cardShardCost??raw.card_shard_cost,0,100000000,0),coinCost=int(fixed?.coin??raw.coinCost??raw.coin_cost,0,1000000000,0),masterStarCost=int(fixed?0:raw.masterStarCost??raw.master_star_cost,0,1000000,0),cardShardCost=Number(fixed?.cardShards||0),successRate=num(fixed?.successRate??raw.successRate??raw.success_rate,0,100,100);
  if(!recipeCode||!name||!outputRef)throw new Error('레시피 코드·이름·결과물을 입력하세요.');
  if(!CATEGORIES.has(category)||!OUTPUT_TYPES.has(outputType)||!PAYMENT_MODES.has(paymentMode))throw new Error('레시피 분류 또는 지급 방식을 확인하세요.');
  if(paymentMode==='COIN_AND_CARD_SHARD'&&!fixed)throw new Error('코인 + 카드 조각 비용은 서버 고정 재료 레시피에서만 사용할 수 있습니다.');
  if(!fixed&&requestedCardShardCost>0)throw new Error('카드 조각 비용은 서버 고정 재료 레시피에서만 사용할 수 있습니다.');
  if(!materials.length&&category!=='MATERIAL_CRAFT')throw new Error('제작 재료를 한 종류 이상 등록하세요.');
  if(!materials.length&&coinCost<=0&&masterStarCost<=0&&cardShardCost<=0)throw new Error('재료 제작에는 하나 이상의 재화 비용이 필요합니다.');
  const duplicate=new Set();for(const material of materials){if(duplicate.has(material.itemCode))throw new Error(`중복 재료입니다: ${material.itemCode}`);duplicate.add(material.itemCode);if(!await env.DB.prepare('SELECT 1 FROM inventory_items WHERE code=? AND is_active=1').bind(material.itemCode).first())throw new Error(`등록되지 않은 재료입니다: ${material.itemCode}`)}
  const outputExists=outputType==='VEHICLE'?await env.DB.prepare('SELECT 1 FROM character_garage_items WHERE id=?').bind(int(outputRef,1)).first():outputType==='EQUIPMENT'?await env.DB.prepare('SELECT 1 FROM character_equipment_items WHERE id=?').bind(int(outputRef,1)).first():await env.DB.prepare('SELECT 1 FROM inventory_items WHERE code=?').bind(outputRef).first();
  if(!outputExists)throw new Error('제작 결과물을 찾을 수 없습니다.');
  const values=[recipeCode,category,name,clean(raw.description,500),outputType,outputRef,outputQuantity,paymentMode,coinCost,masterStarCost,successRate,bool(raw.isFeatured??raw.is_featured)?1:0,raw.isActive===false||Number(raw.is_active)===0?0:1,raw.isPublic===false||Number(raw.is_public)===0?0:1,bool(raw.ownerTestOnly??raw.owner_test_only)?1:0,int(raw.sortOrder??raw.sort_order,-100000,100000,0)];
  let recipeId=id;
  if(id)await env.DB.prepare(`UPDATE ${RECIPE_TABLE} SET code=?,category=?,name=?,description=?,output_type=?,output_ref=?,output_quantity=?,payment_mode=?,coin_cost=?,master_star_cost=?,success_rate=?,is_featured=?,is_active=?,is_public=?,owner_test_only=?,sort_order=?,updated_at=CURRENT_TIMESTAMP WHERE id=?`).bind(...values,id).run();
  else{const created=await env.DB.prepare(`INSERT INTO ${RECIPE_TABLE}(code,category,name,description,output_type,output_ref,output_quantity,payment_mode,coin_cost,master_star_cost,success_rate,is_featured,is_active,is_public,owner_test_only,sort_order) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`).bind(...values).run();recipeId=Number(created.meta?.last_row_id||0)}
  const statements=[env.DB.prepare(`DELETE FROM ${MATERIAL_TABLE} WHERE recipe_id=?`).bind(recipeId),...materials.map(material=>env.DB.prepare(`INSERT INTO ${MATERIAL_TABLE}(recipe_id,item_code,quantity,sort_order) VALUES(?,?,?,?)`).bind(recipeId,material.itemCode,material.quantity,material.sortOrder))];
  await env.DB.batch(statements);
  if(deps.writeAdminLog)await deps.writeAdminLog(env,admin,'WORKSHOP_RECIPE_SAVE','WORKSHOP_RECIPE',String(recipeId),before,{code:recipeCode,name,category,outputType,outputRef,outputQuantity,paymentMode,coinCost,masterStarCost,cardShardCost,successRate,canonical:Boolean(fixed),materials:materials.length});
  return recipeId;
}

async function saveSynthesisRecipe(env,admin,raw,deps){
  const id=int(raw.id,0,2147483647),recipeCode=code(raw.code),name=clean(raw.name,80),description=clean(raw.description,500),inputEquipmentId=int(raw.inputEquipmentId??raw.input_equipment_id,1,2147483647),outputEquipmentId=int(raw.outputEquipmentId??raw.output_equipment_id,1,2147483647),inputQuantity=int(raw.inputQuantity??raw.input_quantity,1,20,3);
  if(!recipeCode||!name)throw new Error('합성 레시피 코드와 이름을 입력하세요.');if(inputEquipmentId===outputEquipmentId)throw new Error('입력 장비와 결과 장비는 달라야 합니다.');
  const [input,output]=await env.DB.batch([env.DB.prepare('SELECT id,slot FROM character_equipment_items WHERE id=? AND is_active=1').bind(inputEquipmentId),env.DB.prepare('SELECT id,slot FROM character_equipment_items WHERE id=? AND is_active=1').bind(outputEquipmentId)]);if(!input.results?.[0]||!output.results?.[0])throw new Error('입력 또는 결과 장비를 찾을 수 없습니다.');if(input.results[0].slot!==output.results[0].slot)throw new Error('입력 장비와 결과 장비의 슬롯이 같아야 합니다.');
  const successRate=num(raw.successRate??raw.success_rate,0,100,100),values=[recipeCode,name,description,inputEquipmentId,outputEquipmentId,inputQuantity,successRate,raw.isActive===false||Number(raw.isActive)===0||Number(raw.is_active)===0?0:1,raw.isPublic===false||Number(raw.isPublic)===0||Number(raw.is_public)===0?0:1,bool(raw.ownerTestOnly??raw.owner_test_only)?1:0,int(raw.sortOrder??raw.sort_order,-100000,100000,0)];let recipeId=id,before=null;
  if(id){before=await env.DB.prepare(`SELECT * FROM ${SYNTH_RECIPE_TABLE} WHERE id=?`).bind(id).first();if(!before)throw new Error('수정할 합성 레시피를 찾을 수 없습니다.');await env.DB.prepare(`UPDATE ${SYNTH_RECIPE_TABLE} SET code=?,name=?,description=?,input_equipment_id=?,output_equipment_id=?,input_quantity=?,success_rate=?,is_active=?,is_public=?,owner_test_only=?,sort_order=?,updated_at=CURRENT_TIMESTAMP WHERE id=?`).bind(...values,id).run()}else{const created=await env.DB.prepare(`INSERT INTO ${SYNTH_RECIPE_TABLE}(code,name,description,input_equipment_id,output_equipment_id,input_quantity,success_rate,is_active,is_public,owner_test_only,sort_order) VALUES(?,?,?,?,?,?,?,?,?,?,?)`).bind(...values).run();recipeId=Number(created.meta?.last_row_id||0)}
  const persisted=await env.DB.prepare(`SELECT success_rate FROM ${SYNTH_RECIPE_TABLE} WHERE id=?`).bind(recipeId).first();
  if(!persisted||Math.abs(Number(persisted.success_rate)-successRate)>.0001)throw new Error('합성 확률 저장값 검증에 실패했습니다. 다시 저장해 주세요.');
  if(deps.writeAdminLog)await deps.writeAdminLog(env,admin,'EQUIPMENT_SYNTHESIS_RECIPE_SAVE','SYNTHESIS_RECIPE',String(recipeId),before,{code:recipeCode,name,inputEquipmentId,outputEquipmentId,inputQuantity,successRate});return recipeId;
}

export async function handleWorkshop({path,request,env,deps}){
  if(!['workshop','workshop/craft','workshop/synthesis','admin/workshop'].includes(path))return null;
  const user=await deps.authenticate(request,env);if(!user)return deps.json({error:'로그인이 필요합니다.'},401);
  await ensureWorkshopFoundation(env);
  if(path==='workshop'&&request.method==='GET')return deps.json(await userWorkshopState(env,user));
  if(path==='workshop/craft'&&request.method==='POST'){try{return deps.json(await craft(env,user,await deps.readBody(request)))}catch(error){return deps.json({error:error.message||'제작에 실패했습니다.'},409)}}
  if(path==='workshop/synthesis'&&request.method==='POST'){try{return deps.json(await synthesizeEquipment(env,user,await deps.readBody(request)))}catch(error){return deps.json({error:error.message||'장비 합성에 실패했습니다.'},409)}}
  if(path==='admin/workshop'){
    if(!isAdmin(user))return deps.json({error:'제작소 관리 권한이 필요합니다.'},403);
    if(request.method==='GET')return deps.json(await adminSnapshot(env));
    if(request.method==='POST'){try{const body=await deps.readBody(request),action=code(body.action);if(action==='SAVE_RECIPE'){const recipeId=await saveRecipe(env,user,body.recipe||{},deps);return deps.json({ok:true,recipeId,snapshot:await adminSnapshot(env)})}if(action==='SAVE_SYNTHESIS_RECIPE'){const recipeId=await saveSynthesisRecipe(env,user,body.recipe||{},deps);return deps.json({ok:true,recipeId,snapshot:await adminSnapshot(env)})}return deps.json({error:'지원하지 않는 제작소 작업입니다.'},400)}catch(error){return deps.json({error:error.message||'레시피 저장에 실패했습니다.'},400)}}
  }
  return deps.json({error:'지원하지 않는 요청입니다.'},405);
}
