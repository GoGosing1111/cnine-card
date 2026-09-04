import { avatarFeatureAccess, equippedAvatarEffect } from './_avatar.js';
import { burningEventIsLive } from './_burning_event_access.js';

/* V1232 CHARACTER EQUIPMENT + TITLE SYSTEM */
const BATTLE_SUIT_SLOT='BATTLE_SUIT';
const EQUIPMENT_SLOTS=['WEAPON','TOP','BOTTOM','SHOES','ACCESSORY',BATTLE_SUIT_SLOT];
const EQUIPMENT_SLOT_LABELS={WEAPON:'무기',TOP:'상의',BOTTOM:'하의',SHOES:'신발',ACCESSORY:'장신구',[BATTLE_SUIT_SLOT]:'배틀슈트'};
const EQUIPMENT_SUBTYPES=['MODERN_SWORD','AXE','PISTOL','RIFLE','TOP','BOTTOM','SHOES','DUAL_DISK',BATTLE_SUIT_SLOT];
const EQUIPMENT_RARITIES=['NORMAL','MAGIC','RARE','EPIC','LEGENDARY','MYTHIC'];
const EQUIPMENT_RARITY_ALIASES={COMMON:'NORMAL',UNCOMMON:'MAGIC',ADVANCED:'MAGIC',MAGIC:'MAGIC',NORMAL:'NORMAL',RARE:'RARE',EPIC:'EPIC',LEGEND:'LEGENDARY',LEGENDARY:'LEGENDARY',MYTH:'MYTHIC',MYTHIC:'MYTHIC'};
const GARAGE_RARITIES=[...EQUIPMENT_RARITIES];
const SOURCE_TYPES=['PVE','PVE_AUTO','TOWER','RAID','RIFT','PVP','CAPTAIN'];
const TITLE_UNLOCK_TYPES=['MANUAL','COLLECTION_COUNT','GRADE_COUNT','MEMBER_COMPLETE','CARD_SET','CONTENT_CLEAR'];
const TITLE_STYLE_PRESETS=['DEFAULT','FOREST','FLAME','FROST','STORM','SHADOW','GOLD','RAINBOW','VOID','CRIMSON','CHALLENGER'];
const TITLE_FONT_PRESETS=['DEFAULT','SERIF','DISPLAY','ARCADE','ROUNDED','SCIFI','BRUSH','HANDWRITING','MONO','CLASSIC'];
const SUPPLY_BOX_CODE='EQUIPMENT_SUPPLY_BOX';
const SUPPLY_BOX_IMAGE='assets/ui/packs/supply-high.jpeg';
const SUPPLY_BOX_MAX_OPEN=500;
// V1985: 구형 보급상자는 인벤토리 개봉만 유지하고 상점 판매에서는 내린다.
const LEGACY_SUPPLY_BOX_SHOP_ENABLED=false;
const SUPPLY_POOL_SCALE=1000;
const SUPPLY_POOL_TOTAL_UNITS=100*SUPPLY_POOL_SCALE;
const BATTLE_SUIT_CATALOG=[
  {code:'BATTLE_SUIT_01',name:'배틀슈트 01',image:'/assets/ui/project-v/account-battle-suits/suits/battle-suit-appearance-01-white-gold-female-v2.png',description:'백금 날개 여성형 PROJECT V V3 PVE 전용 배틀슈트 외형.',pvePower:100000,sortOrder:10},
  {code:'BATTLE_SUIT_02',name:'배틀슈트 02',image:'/assets/ui/project-v/account-battle-suits/suits/battle-suit-appearance-02-orange-tactical-v1.png',description:'주황색 전술형 PROJECT V V3 PVE 전용 배틀슈트 외형.',pvePower:200000,sortOrder:20},
  {code:'BATTLE_SUIT_03',name:'배틀슈트 03',image:'/assets/ui/project-v/account-battle-suits/suits/battle-suit-appearance-03-amethyst-exosuit-v1.png',description:'자수정 기계갑주형 PROJECT V V3 PVE 전용 배틀슈트 외형.',pvePower:300000,sortOrder:30}
];
const DEFAULT_SUPPLY_BOX_SETTINGS={enabled:true,shopEnabled:true,shopPrice:1000,rewardRates:{equipment:20,shards:50,coins:30},shards:{min:10,max:30},coins:{min:300,max:1000},sources:{PVE:{enabled:true,rate:.1,quantity:1},PVE_AUTO:{enabled:true,rate:.05,quantity:1},TOWER:{enabled:true,rate:.2,quantity:1},RAID:{enabled:true,rate:1,quantity:1},RIFT:{enabled:true,rate:.5,quantity:1},PVP:{enabled:true,rate:.2,quantity:1},CAPTAIN:{enabled:true,rate:.3,quantity:1}}};
let foundationPromise=null,supplySettingsCache=null,supplySettingsCacheAt=0,equipmentPromotionCache=null,equipmentPromotionCacheAt=0;

function cleanText(value,max=120){return String(value??'').trim().slice(0,max)}
function cleanInt(value,min=0,max=100000000){const n=Math.floor(Number(value)||0);return Math.max(min,Math.min(max,n))}
function cleanRate(value){const n=Number(value);return Math.max(0,Math.min(100,Number.isFinite(n)?n:0))}
function cleanBool(value,defaultValue=true){if(value===undefined||value===null)return defaultValue;return value===true||value===1||String(value)==='1'}
function cleanWeight(value,defaultValue=1){const n=Number(value);return Math.max(0,Math.min(1000000,Number.isFinite(n)?n:defaultValue))}
function cleanSupplyPoolWeight(value){const n=Number(value);if(!Number.isFinite(n))return 0;return Math.max(0,Math.min(100,Math.round(n*SUPPLY_POOL_SCALE)/SUPPLY_POOL_SCALE))}
function supplyPoolUnits(value){return Math.round(cleanSupplyPoolWeight(value)*SUPPLY_POOL_SCALE)}
function cleanSupplyBoxSettings(value){
  const raw=value&&typeof value==='object'?value:{};
  const rewardRates={equipment:cleanRate(raw.rewardRates?.equipment??DEFAULT_SUPPLY_BOX_SETTINGS.rewardRates.equipment),shards:cleanRate(raw.rewardRates?.shards??DEFAULT_SUPPLY_BOX_SETTINGS.rewardRates.shards),coins:cleanRate(raw.rewardRates?.coins??DEFAULT_SUPPLY_BOX_SETTINGS.rewardRates.coins)};
  const total=rewardRates.equipment+rewardRates.shards+rewardRates.coins;
  if(Math.abs(total-100)>.0001)throw new Error('보급상자 보상 확률 합계는 100%여야 합니다.');
  const range=(input,defaults)=>{const min=cleanInt(input?.min??defaults.min,0,100000000),max=cleanInt(input?.max??defaults.max,min,100000000);return {min,max:Math.max(min,max)}};
  const sources={};for(const type of SOURCE_TYPES){const current=raw.sources?.[type]||DEFAULT_SUPPLY_BOX_SETTINGS.sources[type]||{enabled:false,rate:0,quantity:1};sources[type]={enabled:cleanBool(current.enabled,false),rate:cleanRate(current.rate),quantity:cleanInt(current.quantity??1,1,100)}}
  return {enabled:cleanBool(raw.enabled,true),shopEnabled:cleanBool(raw.shopEnabled,true),shopPrice:cleanInt(raw.shopPrice??DEFAULT_SUPPLY_BOX_SETTINGS.shopPrice,1,100000000),rewardRates,shards:range(raw.shards,DEFAULT_SUPPLY_BOX_SETTINGS.shards),coins:range(raw.coins,DEFAULT_SUPPLY_BOX_SETTINGS.coins),sources};
}
function deterministicUnit(text){let hash=2166136261;for(const ch of String(text||'')){hash^=ch.charCodeAt(0);hash=Math.imul(hash,16777619)>>>0}return hash/4294967296}
function deterministicInt(text,min,max){const a=Math.max(0,Math.floor(Number(min)||0)),b=Math.max(a,Math.floor(Number(max)||a));return a+Math.floor(deterministicUnit(text)*(b-a+1))}
function normalizeSlot(value){const x=String(value||'').trim().toUpperCase();return EQUIPMENT_SLOTS.includes(x)?x:''}
function normalizeSubtype(value){const x=String(value||'').trim().toUpperCase();return EQUIPMENT_SUBTYPES.includes(x)?x:''}
function normalizeSource(value){const x=String(value||'').trim().toUpperCase();return SOURCE_TYPES.includes(x)?x:''}
function normalizeEquipmentRarity(value){const x=String(value||'').trim().toUpperCase();const normalized=EQUIPMENT_RARITY_ALIASES[x]||x;return EQUIPMENT_RARITIES.includes(normalized)?normalized:'NORMAL'}
function normalizeGarageRarity(value){const x=String(value||'').trim().toUpperCase();const normalized=EQUIPMENT_RARITY_ALIASES[x]||x;return GARAGE_RARITIES.includes(normalized)?normalized:'NORMAL'}
function normalizeTitleStylePreset(value){const x=String(value||'').trim().toUpperCase();return TITLE_STYLE_PRESETS.includes(x)?x:'DEFAULT'}
function normalizeTitleFontPreset(value){const x=String(value||'').trim().toUpperCase();return TITLE_FONT_PRESETS.includes(x)?x:'DEFAULT'}
function parseJson(value,fallback={}){try{const x=typeof value==='string'?JSON.parse(value):value;return x&&typeof x==='object'?x:fallback}catch{return fallback}}
function itemPower(total){const safe=cleanInt(total,0,100000000),pve=Math.floor(safe*.9);return {total:safe,pve,pvp:safe-pve}}
function equipmentPowerForSlot(slot,input={}){
  if(slot===BATTLE_SUIT_SLOT){const pve=cleanInt(input.pvePower??input.totalPower,0,100000000);return {total:pve,pve,pvp:0}}
  return itemPower(input.totalPower);
}
function isAdmin(user){return Boolean(user&&String(user.role||'').toUpperCase()==='OWNER')}
function cleanPromotionDiscount(value){const n=Number(value);return Math.max(0,Math.min(90,Number.isFinite(n)?n:0))}
async function equipmentPromotionState(env,{fresh=false}={}){
  const now=Date.now();
  if(!fresh&&equipmentPromotionCache&&now-equipmentPromotionCacheAt<5000){
    if(equipmentPromotionCache.mode==='NONE'||burningEventIsLive({enabled:true,endsAt:equipmentPromotionCache.endsAt},now))return equipmentPromotionCache;
    equipmentPromotionCache={mode:'NONE',discount:0,endsAt:null};equipmentPromotionCacheAt=now;return equipmentPromotionCache;
  }
  try{
    const [normalResult,hyperResult]=await env.DB.batch([
      env.DB.prepare("SELECT value FROM app_meta WHERE key='burning_event_settings_v1'"),
      env.DB.prepare("SELECT value FROM app_meta WHERE key='hyper_burning_event_settings_v1310'")
    ]);
    const parse=row=>{try{return JSON.parse(row?.results?.[0]?.value||'{}')}catch{return {}}},normal=parse(normalResult),hyper=parse(hyperResult);
    const active=burningEventIsLive(hyper,now)?{mode:'HYPER',discount:0,endsAt:hyper.endsAt}:burningEventIsLive(normal,now)?{mode:'BURNING',discount:0,endsAt:normal.endsAt}:{mode:'NONE',discount:0,endsAt:null};
    equipmentPromotionCache=active;equipmentPromotionCacheAt=now;return active;
  }catch(error){
    if(equipmentPromotionCache){
      if(equipmentPromotionCache.mode==='NONE'||burningEventIsLive({enabled:true,endsAt:equipmentPromotionCache.endsAt},now))return equipmentPromotionCache;
      equipmentPromotionCache={mode:'NONE',discount:0,endsAt:null};equipmentPromotionCacheAt=now;return equipmentPromotionCache;
    }
    throw error;
  }
}
export function invalidateEquipmentPromotionCache(){equipmentPromotionCache=null;equipmentPromotionCacheAt=0}
function supplyShopPricing(settings,promotion){const original=Math.max(0,cleanInt(settings.shopPrice,1,100000000)),discount=cleanPromotionDiscount(promotion?.discount||0),price=Math.max(0,Math.floor(original*(100-discount)/100));return {originalShopPrice:original,shopPrice:price,promotionDiscountPercent:discount,promotionMode:promotion?.mode||'NONE'}}

export async function ensureEquipmentFoundation(env){
  if(foundationPromise)return foundationPromise;
  foundationPromise=(async()=>{
    const markerV1231=await env.DB.prepare("SELECT value FROM app_meta WHERE key='safe_runtime_upgrade_v1231_character_equipment_titles'").first();
    if(markerV1231?.value!=='1'){
      await env.DB.batch([
        env.DB.prepare(`CREATE TABLE IF NOT EXISTS character_equipment_items (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          code TEXT NOT NULL UNIQUE,
          name TEXT NOT NULL,
          slot TEXT NOT NULL,
          subtype TEXT NOT NULL DEFAULT '',
          rarity TEXT NOT NULL DEFAULT 'NORMAL',
          image_url TEXT NOT NULL DEFAULT '',
          description TEXT NOT NULL DEFAULT '',
          total_power INTEGER NOT NULL DEFAULT 0,
          pve_power INTEGER NOT NULL DEFAULT 0,
          pvp_power INTEGER NOT NULL DEFAULT 0,
          is_active INTEGER NOT NULL DEFAULT 1,
          is_public INTEGER NOT NULL DEFAULT 1,
          sort_order INTEGER NOT NULL DEFAULT 0,
          created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
          updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
        )`),
        env.DB.prepare(`CREATE TABLE IF NOT EXISTS user_equipment_instances (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          user_id INTEGER NOT NULL,
          equipment_id INTEGER NOT NULL,
          source_type TEXT NOT NULL DEFAULT 'ADMIN',
          source_id TEXT NOT NULL DEFAULT '',
          request_id TEXT,
          acquired_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
        )`),
        env.DB.prepare(`CREATE TABLE IF NOT EXISTS user_equipment_loadout (
          user_id INTEGER NOT NULL,
          slot TEXT NOT NULL,
          instance_id INTEGER NOT NULL UNIQUE,
          updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
          PRIMARY KEY(user_id,slot)
        )`),
        env.DB.prepare(`CREATE TABLE IF NOT EXISTS character_titles (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          code TEXT NOT NULL UNIQUE,
          name TEXT NOT NULL,
          description TEXT NOT NULL DEFAULT '',
          badge_text TEXT NOT NULL DEFAULT '',
          image_url TEXT NOT NULL DEFAULT '',
          pve_power INTEGER NOT NULL DEFAULT 0,
          unlock_type TEXT NOT NULL DEFAULT 'MANUAL',
          unlock_config_json TEXT NOT NULL DEFAULT '{}',
          is_active INTEGER NOT NULL DEFAULT 1,
          is_public INTEGER NOT NULL DEFAULT 1,
          sort_order INTEGER NOT NULL DEFAULT 0,
          created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
          updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
        )`),
        env.DB.prepare(`CREATE TABLE IF NOT EXISTS user_character_titles (
          user_id INTEGER NOT NULL,
          title_id INTEGER NOT NULL,
          source_type TEXT NOT NULL DEFAULT 'SYSTEM',
          source_id TEXT NOT NULL DEFAULT '',
          unlocked_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
          PRIMARY KEY(user_id,title_id)
        )`),
        env.DB.prepare(`CREATE TABLE IF NOT EXISTS user_title_loadout (
          user_id INTEGER PRIMARY KEY,
          title_id INTEGER NOT NULL,
          updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
        )`),
        env.DB.prepare(`CREATE TABLE IF NOT EXISTS user_title_progress_events (
          user_id INTEGER NOT NULL,
          event_type TEXT NOT NULL,
          event_key TEXT NOT NULL,
          first_cleared_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
          clear_count INTEGER NOT NULL DEFAULT 1,
          updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
          PRIMARY KEY(user_id,event_type,event_key)
        )`),
        env.DB.prepare(`CREATE TABLE IF NOT EXISTS equipment_drop_profiles (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          name TEXT NOT NULL,
          source_type TEXT NOT NULL,
          source_key TEXT NOT NULL DEFAULT '*',
          enabled INTEGER NOT NULL DEFAULT 1,
          drop_rate REAL NOT NULL DEFAULT 0,
          max_drops INTEGER NOT NULL DEFAULT 1,
          created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
          updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
          UNIQUE(source_type,source_key)
        )`),
        env.DB.prepare(`CREATE TABLE IF NOT EXISTS equipment_drop_entries (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          profile_id INTEGER NOT NULL,
          equipment_id INTEGER NOT NULL,
          weight REAL NOT NULL DEFAULT 1,
          is_active INTEGER NOT NULL DEFAULT 1,
          created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
          updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
          UNIQUE(profile_id,equipment_id)
        )`),
        env.DB.prepare(`CREATE TABLE IF NOT EXISTS equipment_drop_receipts (
          request_id TEXT NOT NULL,
          user_id INTEGER NOT NULL,
          source_type TEXT NOT NULL,
          source_key TEXT NOT NULL DEFAULT '',
          profile_id INTEGER,
          result TEXT NOT NULL DEFAULT 'PENDING',
          equipment_instance_id INTEGER,
          response_json TEXT,
          created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
          updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
          PRIMARY KEY(request_id,user_id,source_type,source_key)
        )`),
        env.DB.prepare('CREATE INDEX IF NOT EXISTS idx_user_equipment_instances_user ON user_equipment_instances(user_id,acquired_at DESC,id DESC)'),
        env.DB.prepare('CREATE INDEX IF NOT EXISTS idx_user_equipment_instances_item ON user_equipment_instances(equipment_id,user_id)'),
        env.DB.prepare('CREATE INDEX IF NOT EXISTS idx_user_equipment_loadout_user ON user_equipment_loadout(user_id,slot)'),
        env.DB.prepare('CREATE INDEX IF NOT EXISTS idx_user_titles_user ON user_character_titles(user_id,unlocked_at DESC)'),
        env.DB.prepare('CREATE INDEX IF NOT EXISTS idx_equipment_drop_profiles_source ON equipment_drop_profiles(source_type,source_key,enabled)'),
        env.DB.prepare('CREATE INDEX IF NOT EXISTS idx_equipment_drop_entries_profile ON equipment_drop_entries(profile_id,is_active,weight)'),
        env.DB.prepare("INSERT OR REPLACE INTO app_meta(key,value,updated_at) VALUES('safe_runtime_upgrade_v1231_character_equipment_titles','1',CURRENT_TIMESTAMP)")
      ]);
    }
    const markerV1232=await env.DB.prepare("SELECT value FROM app_meta WHERE key='safe_runtime_upgrade_v1232_character_title_styles'").first();
    if(markerV1232?.value!=='1'){
      const titleTableInfo=await env.DB.prepare('PRAGMA table_info(character_titles)').all();
      const titleColumns=new Set((titleTableInfo.results||[]).map(col=>String(col.name||'').toLowerCase()));
      const statements=[];
      if(!titleColumns.has('style_preset'))statements.push(env.DB.prepare("ALTER TABLE character_titles ADD COLUMN style_preset TEXT NOT NULL DEFAULT 'DEFAULT'"));
      statements.push(env.DB.prepare("UPDATE character_titles SET style_preset='DEFAULT' WHERE style_preset IS NULL OR TRIM(style_preset)=''"));
      statements.push(env.DB.prepare("INSERT OR REPLACE INTO app_meta(key,value,updated_at) VALUES('safe_runtime_upgrade_v1232_character_title_styles','1',CURRENT_TIMESTAMP)"));
      await env.DB.batch(statements);
    }
    const titleOwnershipInfo=await env.DB.prepare('PRAGMA table_info(user_character_titles)').all();
    if(!(titleOwnershipInfo.results||[]).some(column=>String(column.name||'').toLowerCase()==='expires_at')){
      try{await env.DB.prepare('ALTER TABLE user_character_titles ADD COLUMN expires_at TEXT').run()}
      catch(error){if(!String(error?.message||error).toLowerCase().includes('duplicate column'))throw error}
    }
    const markerV1247=await env.DB.prepare("SELECT value FROM app_meta WHERE key='safe_runtime_upgrade_v1247_equipment_supply_box'").first();
    if(markerV1247?.value!=='1'){
      const itemTableInfo=await env.DB.prepare('PRAGMA table_info(character_equipment_items)').all();
      const itemColumns=new Set((itemTableInfo.results||[]).map(col=>String(col.name||'').toLowerCase()));
      const statements=[
        env.DB.prepare(`CREATE TABLE IF NOT EXISTS inventory_items (code TEXT PRIMARY KEY,name TEXT NOT NULL,subtitle TEXT NOT NULL DEFAULT '',description TEXT NOT NULL DEFAULT '',category TEXT NOT NULL DEFAULT 'PACK',rarity TEXT NOT NULL DEFAULT 'SPECIAL',image_url TEXT NOT NULL DEFAULT '',sort_order INTEGER NOT NULL DEFAULT 0,is_active INTEGER NOT NULL DEFAULT 1,created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP)`),
        env.DB.prepare(`CREATE TABLE IF NOT EXISTS cnine_user_inventory (user_id INTEGER NOT NULL,item_code TEXT NOT NULL,quantity INTEGER NOT NULL DEFAULT 0,unseen_quantity INTEGER NOT NULL DEFAULT 0,created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,PRIMARY KEY(user_id,item_code))`),
        env.DB.prepare(`CREATE TABLE IF NOT EXISTS inventory_logs (id INTEGER PRIMARY KEY AUTOINCREMENT,user_id INTEGER NOT NULL,item_code TEXT NOT NULL,change_amount INTEGER NOT NULL,balance_after INTEGER NOT NULL,reason TEXT NOT NULL DEFAULT '',reference_type TEXT,reference_id TEXT,admin_id INTEGER,created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP)`),
        env.DB.prepare(`CREATE TABLE IF NOT EXISTS inventory_use_receipts (request_id TEXT PRIMARY KEY,user_id INTEGER NOT NULL,item_code TEXT NOT NULL,status TEXT NOT NULL DEFAULT 'PENDING',response_json TEXT,error_message TEXT,created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP)`)
      ];
      if(!itemColumns.has('supply_enabled'))statements.push(env.DB.prepare("ALTER TABLE character_equipment_items ADD COLUMN supply_enabled INTEGER NOT NULL DEFAULT 0"));
      if(!itemColumns.has('supply_weight'))statements.push(env.DB.prepare("ALTER TABLE character_equipment_items ADD COLUMN supply_weight REAL NOT NULL DEFAULT 0"));
      statements.push(env.DB.prepare(`CREATE TABLE IF NOT EXISTS equipment_supply_drop_grants (
        user_id INTEGER NOT NULL,
        source_type TEXT NOT NULL,
        reference_id TEXT NOT NULL,
        status TEXT NOT NULL DEFAULT 'PENDING',
        quantity INTEGER NOT NULL DEFAULT 1,
        created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
        PRIMARY KEY(user_id,source_type,reference_id)
      )`));
      statements.push(env.DB.prepare("CREATE INDEX IF NOT EXISTS idx_equipment_supply_drop_grants_created ON equipment_supply_drop_grants(created_at)"));
      statements.push(env.DB.prepare("INSERT OR IGNORE INTO inventory_items(code,name,subtitle,description,category,rarity,image_url,sort_order,is_active) VALUES(?,?,?,?,?,?,?,?,1)").bind(SUPPLY_BOX_CODE,'장비 보급상자','EQUIPMENT SUPPLY BOX','장비·카드 조각·코인 중 하나를 획득합니다. 한 번에 최대 10개까지 개방할 수 있습니다.','SUPPLY_BOX','HIGH',SUPPLY_BOX_IMAGE,35));
      statements.push(env.DB.prepare("UPDATE inventory_items SET name='장비 보급상자',subtitle='EQUIPMENT SUPPLY BOX',description='장비·카드 조각·코인 중 하나를 획득합니다. 한 번에 최대 10개까지 개방할 수 있습니다.',category='SUPPLY_BOX',rarity='HIGH',image_url=?,sort_order=35,is_active=1,updated_at=CURRENT_TIMESTAMP WHERE code=?").bind(SUPPLY_BOX_IMAGE,SUPPLY_BOX_CODE));
      statements.push(env.DB.prepare("INSERT OR IGNORE INTO app_meta(key,value,updated_at) VALUES('equipment_supply_box_settings_v1247',?,CURRENT_TIMESTAMP)").bind(JSON.stringify(DEFAULT_SUPPLY_BOX_SETTINGS)));
      statements.push(env.DB.prepare("UPDATE equipment_drop_profiles SET enabled=0,updated_at=CURRENT_TIMESTAMP WHERE enabled<>0"));
      statements.push(env.DB.prepare("INSERT OR REPLACE INTO app_meta(key,value,updated_at) VALUES('safe_runtime_upgrade_v1247_equipment_supply_box','1',CURRENT_TIMESTAMP)"));
      await env.DB.batch(statements);
    }
    const markerV1274=await env.DB.prepare("SELECT value FROM app_meta WHERE key='safe_runtime_upgrade_v1274_supply_drop_quantity'").first();
    if(markerV1274?.value!=='1'){
      const grantTableInfo=await env.DB.prepare('PRAGMA table_info(equipment_supply_drop_grants)').all();
      const grantColumns=new Set((grantTableInfo.results||[]).map(col=>String(col.name||'').toLowerCase()));
      if(!grantColumns.has('quantity')){
        try{await env.DB.prepare('ALTER TABLE equipment_supply_drop_grants ADD COLUMN quantity INTEGER NOT NULL DEFAULT 1').run()}
        catch(error){if(!String(error?.message||error).toLowerCase().includes('duplicate column'))throw error}
      }
      await env.DB.batch([
        env.DB.prepare('UPDATE equipment_supply_drop_grants SET quantity=1 WHERE quantity IS NULL OR quantity<1'),
        env.DB.prepare("INSERT OR REPLACE INTO app_meta(key,value,updated_at) VALUES('safe_runtime_upgrade_v1274_supply_drop_quantity','1',CURRENT_TIMESTAMP)")
      ]);
    }

    const mythicUniqueMarker=await env.DB.prepare("SELECT value FROM app_meta WHERE key='safe_runtime_upgrade_v1473_mythic_equipment_unique'").first();
    if(mythicUniqueMarker?.value!=='1'){
      // 신화 장비도 여러 인스턴스를 보유할 수 있다. 과거의 중복 차단 트리거는 다시 만들지 않는다.
      await env.DB.prepare("INSERT OR REPLACE INTO app_meta(key,value,updated_at) VALUES('safe_runtime_upgrade_v1473_mythic_equipment_unique','1',CURRENT_TIMESTAMP)").run();
    }

    const mythicDuplicateMarker=await env.DB.prepare("SELECT value FROM app_meta WHERE key='safe_runtime_upgrade_v1676_mythic_equipment_duplicates'").first();
    if(mythicDuplicateMarker?.value!=='1'){
      await env.DB.batch([
        env.DB.prepare('DROP TRIGGER IF EXISTS trg_user_equipment_mythic_unique'),
        env.DB.prepare("INSERT OR REPLACE INTO app_meta(key,value,updated_at) VALUES('safe_runtime_upgrade_v1676_mythic_equipment_duplicates','1',CURRENT_TIMESTAMP)")
      ]);
    }

    const primeRecallMarker=await env.DB.prepare("SELECT value FROM app_meta WHERE key='safe_runtime_upgrade_v1488_prime_equipment_recall'").first();
    if(primeRecallMarker?.value!=='1'){
      await env.DB.batch([
        env.DB.prepare(`CREATE TABLE IF NOT EXISTS prime_equipment_recall_audit_v1488(
          instance_id INTEGER PRIMARY KEY,
          user_id INTEGER NOT NULL,
          equipment_id INTEGER NOT NULL,
          equipment_code TEXT NOT NULL DEFAULT '',
          equipment_name TEXT NOT NULL DEFAULT '',
          source_type TEXT NOT NULL DEFAULT '',
          source_id TEXT NOT NULL DEFAULT '',
          request_id TEXT,
          was_equipped INTEGER NOT NULL DEFAULT 0,
          acquired_at TEXT,
          recalled_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
        )`),
        // 삭제 전에 대상과 획득 경로를 남겨 운영 확인 및 필요 시 복구가 가능하게 한다.
        env.DB.prepare(`INSERT OR IGNORE INTO prime_equipment_recall_audit_v1488(
            instance_id,user_id,equipment_id,equipment_code,equipment_name,source_type,source_id,request_id,was_equipped,acquired_at
          )
          SELECT x.id,x.user_id,x.equipment_id,i.code,i.name,x.source_type,x.source_id,x.request_id,
            CASE WHEN l.instance_id IS NULL THEN 0 ELSE 1 END,x.acquired_at
          FROM user_equipment_instances x
          JOIN character_equipment_items i ON i.id=x.equipment_id
          JOIN users u ON u.id=x.user_id
          LEFT JOIN user_equipment_loadout l ON l.instance_id=x.id
          WHERE UPPER(COALESCE(u.role,'USER'))<>'OWNER'
            AND (UPPER(COALESCE(i.code,'')) LIKE 'PRIME%' OR REPLACE(COALESCE(i.name,''),' ','') LIKE '프라임%')`),
        // 신규 프라임 장비는 보급상자 확률표가 확정되기 전까지 드랍 풀에서 제외한다.
        env.DB.prepare(`UPDATE character_equipment_items
          SET supply_enabled=0,supply_weight=0,updated_at=CURRENT_TIMESTAMP
          WHERE UPPER(COALESCE(code,'')) LIKE 'PRIME%'
             OR REPLACE(COALESCE(name,''),' ','') LIKE '프라임%'`),
        // OWNER 외 계정이 장착 중인 프라임 장비부터 안전하게 해제한다.
        env.DB.prepare(`DELETE FROM user_equipment_loadout
          WHERE instance_id IN (
            SELECT x.id FROM user_equipment_instances x
            JOIN character_equipment_items i ON i.id=x.equipment_id
            JOIN users u ON u.id=x.user_id
            WHERE UPPER(COALESCE(u.role,'USER'))<>'OWNER'
              AND (UPPER(COALESCE(i.code,'')) LIKE 'PRIME%' OR REPLACE(COALESCE(i.name,''),' ','') LIKE '프라임%')
          )`),
        // OWNER 보유분은 유지하고 그 외 모든 프라임 장비 인스턴스를 회수한다.
        env.DB.prepare(`DELETE FROM user_equipment_instances
          WHERE id IN (
            SELECT x.id FROM user_equipment_instances x
            JOIN character_equipment_items i ON i.id=x.equipment_id
            JOIN users u ON u.id=x.user_id
            WHERE UPPER(COALESCE(u.role,'USER'))<>'OWNER'
              AND (UPPER(COALESCE(i.code,'')) LIKE 'PRIME%' OR REPLACE(COALESCE(i.name,''),' ','') LIKE '프라임%')
          )`),
        env.DB.prepare("INSERT OR REPLACE INTO app_meta(key,value,updated_at) VALUES('safe_runtime_upgrade_v1488_prime_equipment_recall','1',CURRENT_TIMESTAMP)")
      ]);
    }

    const infinityRecallMarker=await env.DB.prepare("SELECT value FROM app_meta WHERE key='safe_runtime_upgrade_v1489_infinity_weapon_recall'").first();
    if(infinityRecallMarker?.value!=='1'){
      await env.DB.batch([
        env.DB.prepare(`CREATE TABLE IF NOT EXISTS infinity_weapon_recall_audit_v1489(
          instance_id INTEGER PRIMARY KEY,
          user_id INTEGER NOT NULL,
          equipment_id INTEGER NOT NULL,
          equipment_code TEXT NOT NULL DEFAULT '',
          equipment_name TEXT NOT NULL DEFAULT '',
          source_type TEXT NOT NULL DEFAULT '',
          source_id TEXT NOT NULL DEFAULT '',
          request_id TEXT,
          was_equipped INTEGER NOT NULL DEFAULT 0,
          acquired_at TEXT,
          recalled_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
        )`),
        env.DB.prepare(`INSERT OR IGNORE INTO infinity_weapon_recall_audit_v1489(
            instance_id,user_id,equipment_id,equipment_code,equipment_name,source_type,source_id,request_id,was_equipped,acquired_at
          )
          SELECT x.id,x.user_id,x.equipment_id,i.code,i.name,x.source_type,x.source_id,x.request_id,
            CASE WHEN l.instance_id IS NULL THEN 0 ELSE 1 END,x.acquired_at
          FROM user_equipment_instances x
          JOIN character_equipment_items i ON i.id=x.equipment_id
          JOIN users u ON u.id=x.user_id
          LEFT JOIN user_equipment_loadout l ON l.instance_id=x.id
          WHERE UPPER(COALESCE(u.role,'USER'))<>'OWNER'
            AND (
              UPPER(REPLACE(COALESCE(i.code,''),' ','')) LIKE 'INFINITY%'
              OR UPPER(REPLACE(COALESCE(i.name,''),' ','')) IN ('인피니티AK','인피니티M200','INFINITYAK','INFINITYM200')
            )`),
        env.DB.prepare(`UPDATE character_equipment_items
          SET supply_enabled=0,supply_weight=0,updated_at=CURRENT_TIMESTAMP
          WHERE UPPER(REPLACE(COALESCE(code,''),' ','')) LIKE 'INFINITY%'
             OR UPPER(REPLACE(COALESCE(name,''),' ','')) IN ('인피니티AK','인피니티M200','INFINITYAK','INFINITYM200')`),
        env.DB.prepare(`DELETE FROM user_equipment_loadout
          WHERE instance_id IN (
            SELECT x.id FROM user_equipment_instances x
            JOIN character_equipment_items i ON i.id=x.equipment_id
            JOIN users u ON u.id=x.user_id
            WHERE UPPER(COALESCE(u.role,'USER'))<>'OWNER'
              AND (
                UPPER(REPLACE(COALESCE(i.code,''),' ','')) LIKE 'INFINITY%'
                OR UPPER(REPLACE(COALESCE(i.name,''),' ','')) IN ('인피니티AK','인피니티M200','INFINITYAK','INFINITYM200')
              )
          )`),
        env.DB.prepare(`DELETE FROM user_equipment_instances
          WHERE id IN (
            SELECT x.id FROM user_equipment_instances x
            JOIN character_equipment_items i ON i.id=x.equipment_id
            JOIN users u ON u.id=x.user_id
            WHERE UPPER(COALESCE(u.role,'USER'))<>'OWNER'
              AND (
                UPPER(REPLACE(COALESCE(i.code,''),' ','')) LIKE 'INFINITY%'
                OR UPPER(REPLACE(COALESCE(i.name,''),' ','')) IN ('인피니티AK','인피니티M200','INFINITYAK','INFINITYM200')
              )
          )`),
        env.DB.prepare("INSERT OR REPLACE INTO app_meta(key,value,updated_at) VALUES('safe_runtime_upgrade_v1489_infinity_weapon_recall','1',CURRENT_TIMESTAMP)")
      ]);
    }

    const newEquipmentQuarantineMarker=await env.DB.prepare("SELECT value FROM app_meta WHERE key='safe_runtime_upgrade_v1490_new_equipment_drop_quarantine'").first();
    if(newEquipmentQuarantineMarker?.value!=='1'){
      await env.DB.batch([
        // CMS·스크립트·직접 INSERT 등 등록 경로와 무관하게 신규 장비는 드랍 풀에서 시작하지 않는다.
        // 실제 포함은 보급상자 설정 저장 API의 UPDATE를 통해서만 가능하다.
        env.DB.prepare(`CREATE TRIGGER IF NOT EXISTS trg_new_equipment_drop_quarantine_v1490
          AFTER INSERT ON character_equipment_items
          FOR EACH ROW
          BEGIN
            UPDATE character_equipment_items
            SET supply_enabled=0,supply_weight=0,updated_at=CURRENT_TIMESTAMP
            WHERE id=NEW.id;
          END`),
        env.DB.prepare("INSERT OR REPLACE INTO app_meta(key,value,updated_at) VALUES('safe_runtime_upgrade_v1490_new_equipment_drop_quarantine','1',CURRENT_TIMESTAMP)")
      ]);
    }

    const markerV1338=await env.DB.prepare("SELECT value FROM app_meta WHERE key='safe_runtime_upgrade_v1338_garage_system'").first();
    if(markerV1338?.value!=='1'){
      await env.DB.batch([
        env.DB.prepare(`CREATE TABLE IF NOT EXISTS character_garage_items (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          code TEXT NOT NULL UNIQUE,
          name TEXT NOT NULL,
          rarity TEXT NOT NULL DEFAULT 'NORMAL',
          image_url TEXT NOT NULL DEFAULT '',
          description TEXT NOT NULL DEFAULT '',
          total_power INTEGER NOT NULL DEFAULT 0,
          pve_power INTEGER NOT NULL DEFAULT 0,
          pvp_power INTEGER NOT NULL DEFAULT 0,
          is_active INTEGER NOT NULL DEFAULT 1,
          is_public INTEGER NOT NULL DEFAULT 1,
          sort_order INTEGER NOT NULL DEFAULT 0,
          created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
          updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
        )`),
        env.DB.prepare(`CREATE TABLE IF NOT EXISTS user_garage_vehicles (
          user_id INTEGER NOT NULL,
          garage_id INTEGER NOT NULL,
          source_type TEXT NOT NULL DEFAULT 'ADMIN',
          source_id TEXT NOT NULL DEFAULT '',
          acquired_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
          PRIMARY KEY(user_id,garage_id)
        )`),
        env.DB.prepare(`CREATE TABLE IF NOT EXISTS user_garage_loadout (
          user_id INTEGER PRIMARY KEY,
          garage_id INTEGER NOT NULL,
          updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
        )`),
        env.DB.prepare('CREATE INDEX IF NOT EXISTS idx_garage_items_public ON character_garage_items(is_active,is_public,sort_order,id)'),
        env.DB.prepare('CREATE INDEX IF NOT EXISTS idx_user_garage_user ON user_garage_vehicles(user_id,acquired_at DESC,garage_id)'),
        env.DB.prepare("INSERT OR REPLACE INTO app_meta(key,value,updated_at) VALUES('safe_runtime_upgrade_v1338_garage_system','1',CURRENT_TIMESTAMP)")
      ]);
    }
    const markerV1533=await env.DB.prepare("SELECT value FROM app_meta WHERE key='safe_runtime_upgrade_v1533_territory_commander_title'").first();
    if(markerV1533?.value!=='1'){
      await env.DB.batch([
        env.DB.prepare(`INSERT INTO character_titles(code,name,description,badge_text,image_url,pve_power,unlock_type,unlock_config_json,style_preset,is_active,is_public,sort_order)
          VALUES('TITLE_TERRITORY_COMMANDER','공대장','영토전의 영웅','공대장','',0,'MANUAL','{}','CRIMSON',1,1,70)
          ON CONFLICT(code) DO UPDATE SET name='공대장',description='영토전의 영웅',badge_text='공대장',unlock_type='MANUAL',unlock_config_json='{}',style_preset='CRIMSON',is_active=1,is_public=1,sort_order=70,updated_at=CURRENT_TIMESTAMP`),
        env.DB.prepare("INSERT OR REPLACE INTO app_meta(key,value,updated_at) VALUES('safe_runtime_upgrade_v1533_territory_commander_title','1',CURRENT_TIMESTAMP)")
      ]);
    }
    const battleSuitMarker=await env.DB.prepare("SELECT value FROM app_meta WHERE key='safe_runtime_upgrade_v1953_project_v_battle_suits'").first();
    if(battleSuitMarker?.value!=='1'){
      const statements=BATTLE_SUIT_CATALOG.map(item=>env.DB.prepare(`INSERT INTO character_equipment_items(
          code,name,slot,subtype,rarity,image_url,description,total_power,pve_power,pvp_power,is_active,is_public,sort_order,supply_enabled,supply_weight
        ) VALUES(?,?,?,?,'NORMAL',?,?,0,0,0,1,1,?,0,0)
        ON CONFLICT(code) DO UPDATE SET
          name=excluded.name,slot=excluded.slot,subtype=excluded.subtype,image_url=excluded.image_url,description=excluded.description,
          pvp_power=0,supply_enabled=0,supply_weight=0,sort_order=excluded.sort_order,updated_at=CURRENT_TIMESTAMP`)
        .bind(item.code,item.name,BATTLE_SUIT_SLOT,BATTLE_SUIT_SLOT,item.image,item.description,item.sortOrder));
      statements.push(env.DB.prepare(`UPDATE character_equipment_items
        SET pvp_power=0,supply_enabled=0,supply_weight=0,updated_at=CURRENT_TIMESTAMP
        WHERE code IN ('BATTLE_SUIT_01','BATTLE_SUIT_02','BATTLE_SUIT_03')`));
      statements.push(env.DB.prepare("INSERT INTO app_meta(key,value,updated_at) VALUES('safe_runtime_upgrade_v1953_project_v_battle_suits','1',CURRENT_TIMESTAMP) ON CONFLICT(key) DO UPDATE SET value=excluded.value,updated_at=CURRENT_TIMESTAMP"));
      await env.DB.batch(statements);
    }
    const battleSuitFemaleRefreshMarker=await env.DB.prepare("SELECT value FROM app_meta WHERE key='safe_runtime_upgrade_v1959_battle_suit_01_female'").first();
    if(battleSuitFemaleRefreshMarker?.value!=='1'){
      const refreshed=BATTLE_SUIT_CATALOG.find(item=>item.code==='BATTLE_SUIT_01');
      await env.DB.batch([
        env.DB.prepare(`UPDATE character_equipment_items
          SET image_url=?,description=?,updated_at=CURRENT_TIMESTAMP
          WHERE code='BATTLE_SUIT_01'`).bind(refreshed.image,refreshed.description),
        env.DB.prepare("INSERT INTO app_meta(key,value,updated_at) VALUES('safe_runtime_upgrade_v1959_battle_suit_01_female','1',CURRENT_TIMESTAMP) ON CONFLICT(key) DO UPDATE SET value=excluded.value,updated_at=CURRENT_TIMESTAMP")
      ]);
    }
    const battleSuitPowerMarker=await env.DB.prepare("SELECT value FROM app_meta WHERE key='safe_runtime_upgrade_v1969_battle_suit_power_tiers'").first();
    if(battleSuitPowerMarker?.value!=='1'){
      const statements=BATTLE_SUIT_CATALOG.map(item=>env.DB.prepare(`UPDATE character_equipment_items
        SET total_power=?,pve_power=?,pvp_power=0,supply_enabled=0,supply_weight=0,updated_at=CURRENT_TIMESTAMP
        WHERE code=? AND slot='BATTLE_SUIT'`).bind(item.pvePower,item.pvePower,item.code));
      statements.push(env.DB.prepare("INSERT INTO app_meta(key,value,updated_at) VALUES('safe_runtime_upgrade_v1969_battle_suit_power_tiers','1',CURRENT_TIMESTAMP) ON CONFLICT(key) DO UPDATE SET value=excluded.value,updated_at=CURRENT_TIMESTAMP"));
      await env.DB.batch(statements);
    }
    return true;
  })().catch(error=>{foundationPromise=null;throw error});
  return foundationPromise;
}

export async function supplyBoxSettings(env,{fresh=false}={}){
  await ensureEquipmentFoundation(env);
  const now=Date.now();if(!fresh&&supplySettingsCache&&now-supplySettingsCacheAt<30000)return supplySettingsCache;
  const row=await env.DB.prepare("SELECT value FROM app_meta WHERE key='equipment_supply_box_settings_v1247'").first();
  try{supplySettingsCache=cleanSupplyBoxSettings(parseJson(row?.value,DEFAULT_SUPPLY_BOX_SETTINGS))}catch{supplySettingsCache=cleanSupplyBoxSettings(DEFAULT_SUPPLY_BOX_SETTINGS)}
  supplySettingsCacheAt=now;return supplySettingsCache;
}
function publicSupplyBoxConfig(settings,promotion={mode:'NONE',discount:0}){return {enabled:settings.enabled,shopEnabled:LEGACY_SUPPLY_BOX_SHOP_ENABLED,...supplyShopPricing(settings,promotion),maxOpen:SUPPLY_BOX_MAX_OPEN,itemCode:SUPPLY_BOX_CODE,name:'장비 보급상자',image:SUPPLY_BOX_IMAGE,rewardRates:settings.rewardRates}}
function publicItem(row){const pveOnly=row.slot===BATTLE_SUIT_SLOT,pvePower=Number(row.pve_power||0);return {id:Number(row.id),code:row.code,name:row.name,slot:row.slot,slotLabel:EQUIPMENT_SLOT_LABELS[row.slot]||row.slot,subtype:row.subtype,rarity:normalizeEquipmentRarity(row.rarity),image:row.image_url||'',description:row.description||'',totalPower:pveOnly?pvePower:Number(row.total_power||0),pvePower,pvpPower:pveOnly?0:Number(row.pvp_power||0),isActive:row.is_active!==0,isPublic:row.is_public!==0,sortOrder:Number(row.sort_order||0),supplyEnabled:row.supply_enabled!==0,supplyWeight:Number(row.supply_weight??1)}}
function publicEquippedItem(row,prefix,{pveOnly=false}={}){
  const id=Number(row?.[`${prefix}_id`]||0);if(!id)return null;
  const image=row?.[`${prefix}_image`]||'',name=row?.[`${prefix}_name`]||'',pvePower=Number(row?.[`${prefix}_pve`]||0),pvpPower=pveOnly?0:Number(row?.[`${prefix}_pvp`]||0);
  return {instanceId:Number(row?.[`${prefix}_instance_id`]||0)||null,id,code:row?.[`${prefix}_code`]||'',name,displayName:name,slot:row?.[`${prefix}_slot`]||'',subtype:row?.[`${prefix}_subtype`]||'',rarity:normalizeEquipmentRarity(row?.[`${prefix}_rarity`]),image,imageUrl:image,battleSprite:pveOnly?image:'',totalPower:pveOnly?pvePower:Number(row?.[`${prefix}_total`]||0),pvePower,pvpPower,scaleMultiplier:1};
}
function publicGarageItem(row,owned=false,equipped=false){return {id:Number(row.id),code:row.code,name:row.name,rarity:normalizeGarageRarity(row.rarity),image:row.image_url||'',description:row.description||'',totalPower:Number(row.total_power||0),pvePower:Number(row.pve_power||0),pvpPower:Number(row.pvp_power||0),isActive:row.is_active!==0,isPublic:row.is_public!==0,sortOrder:Number(row.sort_order||0),owned:Boolean(owned),equipped:Boolean(equipped),acquiredAt:row.acquired_at||null}}
function publicTitle(row,owned=false,equipped=false){const unlockConfig=parseJson(row.unlock_config_json,{});return {id:Number(row.id),code:row.code,name:row.name,description:row.description||'',badgeText:row.badge_text||row.name,image:row.image_url||'',pvePower:Number(row.pve_power||0),unlockType:row.unlock_type,unlockConfig,stylePreset:normalizeTitleStylePreset(row.style_preset),fontPreset:normalizeTitleFontPreset(unlockConfig.fontPreset),isActive:row.is_active!==0,isPublic:row.is_public!==0,sortOrder:Number(row.sort_order||0),owned:Boolean(owned),equipped:Boolean(equipped),unlockedAt:row.unlocked_at||null,expiresAt:row.expires_at||null}}

export async function publicEquippedTitleMap(env,userIds=[]){
  await ensureEquipmentFoundation(env);
  const ids=[...new Set((Array.isArray(userIds)?userIds:[userIds]).map(value=>cleanInt(value,0,2147483647)).filter(Boolean))];
  if(!ids.length)return {};
  const marks=ids.map(()=>'?').join(',');
  const rows=await env.DB.prepare(`SELECT l.user_id AS user_id,t.id,t.code,t.name,t.badge_text,t.style_preset,t.image_url,t.unlock_config_json
    FROM user_title_loadout l
    JOIN user_character_titles u ON u.user_id=l.user_id AND u.title_id=l.title_id AND (u.expires_at IS NULL OR u.expires_at>CURRENT_TIMESTAMP)
    JOIN character_titles t ON t.id=l.title_id AND t.is_active=1 AND t.is_public=1
    WHERE l.user_id IN (${marks})`).bind(...ids).all();
  return Object.fromEntries((rows.results||[]).map(row=>{const config=parseJson(row.unlock_config_json,{});return [String(row.user_id),{id:Number(row.id),code:row.code,name:row.name,badgeText:row.badge_text||row.name,stylePreset:normalizeTitleStylePreset(row.style_preset),fontPreset:normalizeTitleFontPreset(config.fontPreset),image:row.image_url||''}]}));
}

async function grantTitle(env,userId,titleId,sourceType='SYSTEM',sourceId=''){
  const result=await env.DB.prepare(`INSERT OR IGNORE INTO user_character_titles(user_id,title_id,source_type,source_id) VALUES(?,?,?,?)`).bind(userId,titleId,cleanText(sourceType,40),cleanText(sourceId,120)).run();
  return Number(result?.meta?.changes||0)>0;
}

async function userCollectionState(env,userId){
  const [owned,allCards]=await Promise.all([
    env.DB.prepare(`SELECT c.id,c.rarity,c.member_id FROM user_cards uc JOIN cards_effective_v1210 c ON c.id=uc.card_id WHERE uc.user_id=? AND COALESCE(uc.quantity,0)>0 AND COALESCE(c.card_status,'PUBLIC') NOT IN ('RETIRE_PENDING','RETIRED')`).bind(userId).all(),
    env.DB.prepare(`SELECT id,rarity,member_id FROM cards_effective_v1210 WHERE is_active=1 AND COALESCE(card_status,'PUBLIC')='PUBLIC'`).all()
  ]);
  const ownedIds=new Set(owned.results.map(row=>String(row.id))),gradeCounts={},memberOwned={};
  for(const row of owned.results){const grade=String(row.rarity||'').toUpperCase();gradeCounts[grade]=(gradeCounts[grade]||0)+1;const member=String(row.member_id);memberOwned[member]=(memberOwned[member]||0)+1}
  const memberTotals={};for(const row of allCards.results){const member=String(row.member_id);memberTotals[member]=(memberTotals[member]||0)+1}
  return {ownedIds,totalOwned:ownedIds.size,gradeCounts,memberOwned,memberTotals};
}

function collectionConditionMet(title,state){
  const type=String(title.unlock_type||'').toUpperCase(),cfg=parseJson(title.unlock_config_json,{});
  if(type==='COLLECTION_COUNT')return state.totalOwned>=cleanInt(cfg.count,1,100000);
  if(type==='GRADE_COUNT'){const grade=String(cfg.grade||'').toUpperCase();return Number(state.gradeCounts[grade]||0)>=cleanInt(cfg.count,1,100000)}
  if(type==='MEMBER_COMPLETE'){const member=String(cfg.memberId??cfg.member_id??'');return member&&Number(state.memberTotals[member]||0)>0&&Number(state.memberOwned[member]||0)>=Number(state.memberTotals[member]||0)}
  if(type==='CARD_SET'){const ids=Array.isArray(cfg.cardIds)?cfg.cardIds.map(String):[];return ids.length>0&&ids.every(id=>state.ownedIds.has(id))}
  return false;
}

export async function syncCollectionTitles(env,userId){
  await ensureEquipmentFoundation(env);
  const rows=await env.DB.prepare(`SELECT id,unlock_type,unlock_config_json FROM character_titles WHERE is_active=1 AND unlock_type IN ('COLLECTION_COUNT','GRADE_COUNT','MEMBER_COMPLETE','CARD_SET')`).all();
  if(!rows.results.length)return [];
  const state=await userCollectionState(env,userId);
  const matched=rows.results.filter(title=>collectionConditionMet(title,state));
  if(!matched.length)return [];
  const results=await env.DB.batch(matched.map(title=>env.DB.prepare(`INSERT OR IGNORE INTO user_character_titles(user_id,title_id,source_type,source_id) VALUES(?,?,?,?)`).bind(userId,title.id,'COLLECTION',title.unlock_type)));
  return matched.filter((title,index)=>Number(results[index]?.meta?.changes||0)>0).map(title=>Number(title.id));
}

export async function recordCharacterProgress(env,userId,eventType,eventKey){
  await ensureEquipmentFoundation(env);
  const type=normalizeSource(eventType)||cleanText(eventType,40).toUpperCase(),key=cleanText(eventKey||'*',120)||'*';
  if(!type||!key)return [];
  const progressStatements=[env.DB.prepare(`INSERT INTO user_title_progress_events(user_id,event_type,event_key,clear_count) VALUES(?,?,?,1)
    ON CONFLICT(user_id,event_type,event_key) DO UPDATE SET clear_count=clear_count+1,updated_at=CURRENT_TIMESTAMP`).bind(userId,type,key)];
  if(key!=='*')progressStatements.push(env.DB.prepare(`INSERT INTO user_title_progress_events(user_id,event_type,event_key,clear_count) VALUES(?,?,?,1)
    ON CONFLICT(user_id,event_type,event_key) DO UPDATE SET clear_count=clear_count+1,updated_at=CURRENT_TIMESTAMP`).bind(userId,type,'*'));
  await env.DB.batch(progressStatements);
  const titles=await env.DB.prepare("SELECT * FROM character_titles WHERE is_active=1 AND unlock_type='CONTENT_CLEAR'").all(),granted=[];
  for(const title of titles.results){const cfg=parseJson(title.unlock_config_json,{}),sourceType=String(cfg.sourceType||cfg.source_type||'').toUpperCase(),sourceKey=String(cfg.sourceKey??cfg.source_id??cfg.sourceId??'*');if(sourceType&&sourceType!==type)continue;if(sourceKey!=='*'&&sourceKey!==key)continue;const required=Math.max(1,cleanInt(cfg.count,1,100000)),progressKey=sourceKey==='*'?'*':sourceKey,progress=await env.DB.prepare('SELECT clear_count FROM user_title_progress_events WHERE user_id=? AND event_type=? AND event_key=?').bind(userId,type,progressKey).first();if(Number(progress?.clear_count||0)>=required&&await grantTitle(env,userId,title.id,type,progressKey))granted.push(Number(title.id))}
  return granted;
}

export async function userEquipmentBonuses(env,userId){
  await ensureEquipmentFoundation(env);
  const row=await env.DB.prepare(`WITH equipment AS (
      SELECT COALESCE(SUM(i.pve_power),0) AS equipment_pve,COALESCE(SUM(i.pvp_power),0) AS equipment_pvp
      FROM user_equipment_loadout l
      JOIN user_equipment_instances x ON x.id=l.instance_id AND x.user_id=l.user_id
      JOIN character_equipment_items i ON i.id=x.equipment_id AND i.is_active=1
      WHERE l.user_id=? AND i.slot<>'BATTLE_SUIT'
    ),battle_suit AS (
      SELECT x.id AS battle_suit_instance_id,i.id AS battle_suit_id,i.code AS battle_suit_code,i.name AS battle_suit_name,
        i.slot AS battle_suit_slot,i.subtype AS battle_suit_subtype,i.rarity AS battle_suit_rarity,i.image_url AS battle_suit_image,
        COALESCE(i.total_power,0) AS battle_suit_total,COALESCE(i.pve_power,0) AS battle_suit_pve
      FROM user_equipment_loadout l
      JOIN user_equipment_instances x ON x.id=l.instance_id AND x.user_id=l.user_id
      JOIN character_equipment_items i ON i.id=x.equipment_id AND i.is_active=1
      WHERE l.user_id=? AND l.slot='BATTLE_SUIT' AND i.slot='BATTLE_SUIT' LIMIT 1
    ),equipped_weapon AS (
      SELECT x.id AS weapon_instance_id,i.id AS weapon_id,i.code AS weapon_code,i.name AS weapon_name,
        i.slot AS weapon_slot,i.subtype AS weapon_subtype,i.rarity AS weapon_rarity,i.image_url AS weapon_image,
        COALESCE(i.total_power,0) AS weapon_total,COALESCE(i.pve_power,0) AS weapon_pve,COALESCE(i.pvp_power,0) AS weapon_pvp
      FROM user_equipment_loadout l
      JOIN user_equipment_instances x ON x.id=l.instance_id AND x.user_id=l.user_id
      JOIN character_equipment_items i ON i.id=x.equipment_id AND i.is_active=1
      WHERE l.user_id=? AND l.slot='WEAPON' AND i.slot='WEAPON' LIMIT 1
    ),garage AS (
      SELECT COALESCE(g.pve_power,0) AS garage_pve,COALESCE(g.pvp_power,0) AS garage_pvp,g.id AS garage_id,g.name AS garage_name,g.rarity AS garage_rarity,g.image_url AS garage_image
      FROM user_garage_loadout l
      JOIN user_garage_vehicles u ON u.user_id=l.user_id AND u.garage_id=l.garage_id
      JOIN character_garage_items g ON g.id=l.garage_id AND g.is_active=1
      WHERE l.user_id=? LIMIT 1
    ),equipped_title AS (
      SELECT COALESCE(t.pve_power,0) AS title_pve,t.id AS title_id,t.name AS title_name,t.style_preset AS title_style_preset,t.unlock_config_json AS title_unlock_config_json
      FROM user_title_loadout l
      JOIN user_character_titles u ON u.user_id=l.user_id AND u.title_id=l.title_id AND (u.expires_at IS NULL OR u.expires_at>CURRENT_TIMESTAMP)
      JOIN character_titles t ON t.id=l.title_id AND t.is_active=1
      WHERE l.user_id=? LIMIT 1
    )
    SELECT equipment.equipment_pve,equipment.equipment_pvp,
      COALESCE(battle_suit.battle_suit_pve,0) AS battle_suit_pve,battle_suit.battle_suit_instance_id,battle_suit.battle_suit_id,battle_suit.battle_suit_code,battle_suit.battle_suit_name,battle_suit.battle_suit_slot,battle_suit.battle_suit_subtype,battle_suit.battle_suit_rarity,battle_suit.battle_suit_image,battle_suit.battle_suit_total,
      equipped_weapon.weapon_instance_id,equipped_weapon.weapon_id,equipped_weapon.weapon_code,equipped_weapon.weapon_name,equipped_weapon.weapon_slot,equipped_weapon.weapon_subtype,equipped_weapon.weapon_rarity,equipped_weapon.weapon_image,equipped_weapon.weapon_total,equipped_weapon.weapon_pve,equipped_weapon.weapon_pvp,
      COALESCE(garage.garage_pve,0) AS garage_pve,COALESCE(garage.garage_pvp,0) AS garage_pvp,garage.garage_id,garage.garage_name,garage.garage_rarity,garage.garage_image,
      COALESCE(equipped_title.title_pve,0) AS title_pve,equipped_title.title_id,equipped_title.title_name,equipped_title.title_style_preset,equipped_title.title_unlock_config_json
    FROM equipment
    LEFT JOIN battle_suit ON 1=1
    LEFT JOIN equipped_weapon ON 1=1
    LEFT JOIN garage ON 1=1
    LEFT JOIN equipped_title ON 1=1`).bind(userId,userId,userId,userId,userId).first();
  const equipmentPve=Number(row?.equipment_pve||0),equipmentPvp=Number(row?.equipment_pvp||0),battleSuitPve=Number(row?.battle_suit_pve||0),garagePve=Number(row?.garage_pve||0),garagePvp=Number(row?.garage_pvp||0),titlePve=Number(row?.title_pve||0),titlePvp=titlePve;
  const titleConfig=parseJson(row?.title_unlock_config_json,{});
  const equippedBattleSuit=publicEquippedItem(row,'battle_suit',{pveOnly:true}),equippedWeapon=publicEquippedItem(row,'weapon');
  return {equipmentPve,equipmentPvp,battleSuitPve,battleSuitPvp:0,garagePve,garagePvp,titlePve,titlePvp,pve:equipmentPve+battleSuitPve+garagePve+titlePve,pvp:equipmentPvp+garagePvp+titlePvp,battleSuit:equippedBattleSuit,equippedBattleSuit,equippedWeapon,title:row?.title_id?{id:Number(row.title_id),name:row.title_name,pvePower:titlePve,pvpPower:titlePvp,allBattlePower:titlePve,stylePreset:normalizeTitleStylePreset(row.title_style_preset),fontPreset:normalizeTitleFontPreset(titleConfig.fontPreset)}:null,garage:row?.garage_id?{id:Number(row.garage_id),name:row.garage_name,rarity:normalizeGarageRarity(row.garage_rarity),image:row.garage_image||'',pvePower:garagePve,pvpPower:garagePvp}:null};
}

function weightedPick(rows){const total=rows.reduce((sum,row)=>sum+Math.max(0,Number(row.weight||0)),0);if(total<=0)return null;let roll=Math.random()*total;for(const row of rows){roll-=Math.max(0,Number(row.weight||0));if(roll<0)return row}return rows[rows.length-1]||null}

export async function grantEquipmentDrop(env,{userId,sourceType,sourceId='*',requestId=''}){
  await ensureEquipmentFoundation(env);
  const type=normalizeSource(sourceType);if(!type||!userId)return null;
  const key=cleanText(sourceId||'*',120)||'*',rid=cleanText(requestId||`${Date.now()}-${Math.random().toString(36).slice(2)}`,160);
  try{await recordCharacterProgress(env,userId,type,key)}catch(error){console.error('character progress record failed',error)}
  const settings=await supplyBoxSettings(env),source=settings.sources[type];
  if(!settings.enabled||!source?.enabled||source.rate<=0)return null;
  const configuredQuantity=cleanInt(source.quantity??1,1,100);
  const rollKey=`SUPPLY_DROP:${userId}:${type}:${key}:${rid}`;
  if(deterministicUnit(rollKey)*100>=source.rate)return null;
  const prior=await env.DB.prepare('SELECT status,quantity FROM equipment_supply_drop_grants WHERE user_id=? AND source_type=? AND reference_id=?').bind(userId,type,rid).first();
  if(prior?.status==='GRANTED'){
    const balance=await env.DB.prepare('SELECT quantity FROM cnine_user_inventory WHERE user_id=? AND item_code=?').bind(userId,SUPPLY_BOX_CODE).first();
    return {kind:'SUPPLY_BOX',itemCode:SUPPLY_BOX_CODE,name:'장비 보급상자',image:SUPPLY_BOX_IMAGE,quantity:cleanInt(prior.quantity??1,1,100),balance:Number(balance?.quantity||0),sourceType:type,sourceId:key,reused:true};
  }
  await env.DB.batch([
    env.DB.prepare("INSERT OR IGNORE INTO equipment_supply_drop_grants(user_id,source_type,reference_id,status,quantity) VALUES(?,?,?,'PENDING',?)").bind(userId,type,rid,configuredQuantity),
    env.DB.prepare(`INSERT INTO cnine_user_inventory(user_id,item_code,quantity,unseen_quantity,created_at,updated_at)
      SELECT ?,?,g.quantity,g.quantity,CURRENT_TIMESTAMP,CURRENT_TIMESTAMP
      FROM equipment_supply_drop_grants g
      WHERE g.user_id=? AND g.source_type=? AND g.reference_id=? AND g.status='PENDING'
      ON CONFLICT(user_id,item_code) DO UPDATE SET quantity=cnine_user_inventory.quantity+excluded.quantity,unseen_quantity=cnine_user_inventory.unseen_quantity+excluded.unseen_quantity,updated_at=CURRENT_TIMESTAMP`).bind(userId,SUPPLY_BOX_CODE,userId,type,rid),
    env.DB.prepare("UPDATE equipment_supply_drop_grants SET status='GRANTED',updated_at=CURRENT_TIMESTAMP WHERE user_id=? AND source_type=? AND reference_id=? AND status='PENDING'").bind(userId,type,rid)
  ]);
  const granted=await env.DB.prepare("SELECT status,quantity FROM equipment_supply_drop_grants WHERE user_id=? AND source_type=? AND reference_id=?").bind(userId,type,rid).first();
  if(granted?.status!=='GRANTED')return null;
  const balance=await env.DB.prepare('SELECT quantity FROM cnine_user_inventory WHERE user_id=? AND item_code=?').bind(userId,SUPPLY_BOX_CODE).first();
  return {kind:'SUPPLY_BOX',itemCode:SUPPLY_BOX_CODE,name:'장비 보급상자',image:SUPPLY_BOX_IMAGE,quantity:cleanInt(granted.quantity??configuredQuantity,1,100),balance:Number(balance?.quantity||0),sourceType:type,sourceId:key};
}

async function characterPayload(env,userId,{admin=false,syncTitles=false,role='USER'}={}){
  // Opening the equipment screen must stay fast. Collection-title synchronization
  // scans card ownership and is intentionally not run on every loadout request.
  if(syncTitles)await syncCollectionTitles(env,userId);
  const [instances,loadoutRows,titleRows,titleLoadout,garageRows,garageLoadout,bonuses,avatarFeature,equippedAvatar]=await Promise.all([
    // V1992: 프라임 일괄 개봉으로 동일 장비 인스턴스가 수천 개까지 쌓여도
    // 장비창에는 장비 종류당 한 행만 보낸다. 실제 인스턴스는 삭제/병합하지 않으며,
    // 장착 중인 인스턴스가 있으면 그것을 대표 ID로 유지해 기존 장착 API 계약도 보존한다.
    env.DB.prepare(`WITH equipment_groups AS (
      SELECT equipment_id,COUNT(*) AS quantity,MAX(id) AS latest_instance_id,MAX(acquired_at) AS acquired_at
      FROM user_equipment_instances
      WHERE user_id=?
      GROUP BY equipment_id
    ),equipped_groups AS (
      SELECT x.equipment_id,l.instance_id
      FROM user_equipment_loadout l
      JOIN user_equipment_instances x ON x.id=l.instance_id AND x.user_id=l.user_id
      WHERE l.user_id=?
    )
    SELECT representative.id AS instance_id,representative.source_type,representative.source_id,
      stacked.acquired_at,stacked.quantity,i.*
    FROM equipment_groups stacked
    JOIN character_equipment_items i ON i.id=stacked.equipment_id
    LEFT JOIN equipped_groups equipped ON equipped.equipment_id=stacked.equipment_id
    JOIN user_equipment_instances representative ON representative.id=COALESCE(equipped.instance_id,stacked.latest_instance_id)
    WHERE 1=1 ${admin?'':"AND i.is_active=1 AND i.is_public=1"}
    ORDER BY i.slot,i.sort_order,stacked.acquired_at DESC,representative.id DESC`).bind(userId,userId).all(),
    env.DB.prepare('SELECT slot,instance_id FROM user_equipment_loadout WHERE user_id=?').bind(userId).all(),
    env.DB.prepare(`SELECT t.*,u.unlocked_at,u.expires_at,CASE WHEN u.title_id IS NULL THEN 0 ELSE 1 END AS owned FROM character_titles t LEFT JOIN user_character_titles u ON u.title_id=t.id AND u.user_id=? AND (u.expires_at IS NULL OR u.expires_at>CURRENT_TIMESTAMP) WHERE ${admin?'1=1':'t.is_active=1 AND t.is_public=1'} ORDER BY t.sort_order,t.id`).bind(userId).all(),
    env.DB.prepare('SELECT l.title_id FROM user_title_loadout l JOIN user_character_titles u ON u.user_id=l.user_id AND u.title_id=l.title_id AND (u.expires_at IS NULL OR u.expires_at>CURRENT_TIMESTAMP) WHERE l.user_id=?').bind(userId).first(),
    env.DB.prepare(`SELECT g.*,u.acquired_at,CASE WHEN u.garage_id IS NULL THEN 0 ELSE 1 END AS owned FROM character_garage_items g LEFT JOIN user_garage_vehicles u ON u.garage_id=g.id AND u.user_id=? WHERE ${admin?'1=1':'g.is_active=1 AND g.is_public=1'} ORDER BY g.sort_order,g.id`).bind(userId).all(),
    env.DB.prepare('SELECT garage_id FROM user_garage_loadout WHERE user_id=?').bind(userId).first(),
    userEquipmentBonuses(env,userId),
    avatarFeatureAccess(env,{id:userId,role}),
    equippedAvatarEffect(env,userId)
  ]);
  const loadout=Object.fromEntries(loadoutRows.results.map(row=>[row.slot,Number(row.instance_id)])),equippedTitleId=Number(titleLoadout?.title_id||0),equippedVehicleId=Number(garageLoadout?.garage_id||0);
  const equipmentStacks=instances.results.map(row=>({instanceId:Number(row.instance_id),quantity:Math.max(1,Number(row.quantity||1)),item:publicItem(row),sourceType:row.source_type,sourceId:row.source_id,acquiredAt:row.acquired_at,equipped:loadout[row.slot]===Number(row.instance_id)}));
  const equipmentTotalQuantity=equipmentStacks.reduce((sum,row)=>sum+row.quantity,0);
  return {slots:EQUIPMENT_SLOTS.map(slot=>({id:slot,label:EQUIPMENT_SLOT_LABELS[slot]})),instances:equipmentStacks,equipmentTypeCount:equipmentStacks.length,equipmentTotalQuantity,loadout,equippedBattleSuitInstanceId:bonuses.equippedBattleSuit?.instanceId||null,equippedBattleSuit:bonuses.equippedBattleSuit,equippedWeaponInstanceId:bonuses.equippedWeapon?.instanceId||null,equippedWeapon:bonuses.equippedWeapon,titles:titleRows.results.map(row=>publicTitle(row,Boolean(row.owned),equippedTitleId===Number(row.id))),equippedTitleId:equippedTitleId||null,vehicles:garageRows.results.map(row=>publicGarageItem(row,Boolean(row.owned),equippedVehicleId===Number(row.id))),equippedVehicleId:equippedVehicleId||null,bonuses,avatarFeature,equippedAvatar};
}

async function adminSystemPayload(env){
  const [items,titles,settings]=await Promise.all([
    env.DB.prepare('SELECT * FROM character_equipment_items ORDER BY slot,sort_order,id').all(),
    env.DB.prepare('SELECT * FROM character_titles ORDER BY sort_order,id').all(),
    supplyBoxSettings(env)
  ]);
  const garageItems=await env.DB.prepare('SELECT * FROM character_garage_items ORDER BY sort_order,id').all();
  return {slots:EQUIPMENT_SLOTS.map(id=>({id,label:EQUIPMENT_SLOT_LABELS[id]})),subtypes:EQUIPMENT_SUBTYPES,equipmentRarities:EQUIPMENT_RARITIES,garageRarities:GARAGE_RARITIES,sourceTypes:SOURCE_TYPES,titleUnlockTypes:TITLE_UNLOCK_TYPES,titleStylePresets:TITLE_STYLE_PRESETS,titleFontPresets:TITLE_FONT_PRESETS,items:items.results.map(publicItem),garageItems:garageItems.results.map(row=>publicGarageItem(row)),titles:titles.results.map(row=>publicTitle(row)),profiles:[],supplyBox:publicSupplyBoxConfig(settings),supplyBoxSettings:settings};
}

export const __equipmentTest=Object.freeze({BATTLE_SUIT_SLOT,BATTLE_SUIT_CATALOG,equipmentPowerForSlot});

export async function handleEquipment({path,request,env,deps}){
  if(!(path==='character/loadout'||path.startsWith('character/')||path.startsWith('equipment/supply-box')||path.startsWith('admin/equipment')||path.startsWith('admin/title')||path.startsWith('admin/garage')))return null;
  await ensureEquipmentFoundation(env);
  const {authenticate,readBody,json,writeAdminLog}=deps;
  if(path==='character/loadout'&&request.method==='GET'){
    const user=await authenticate(request,env);if(!user)return json({error:'로그인이 필요합니다.'},401);return json(await characterPayload(env,user.id,{role:user.role}));
  }
  if(path==='character/title/sync'&&request.method==='POST'){
    const user=await authenticate(request,env);if(!user)return json({error:'로그인이 필요합니다.'},401);
    const granted=await syncCollectionTitles(env,user.id);
    return json({ok:true,granted});
  }
  if(path==='character/equipment/equip'&&request.method==='POST'){
    const user=await authenticate(request,env);if(!user)return json({error:'로그인이 필요합니다.'},401);
    const body=await readBody(request),instanceId=cleanInt(body.instanceId,1,2147483647);
    const owned=await env.DB.prepare(`SELECT x.id,i.slot FROM user_equipment_instances x JOIN character_equipment_items i ON i.id=x.equipment_id WHERE x.id=? AND x.user_id=? AND i.is_active=1`).bind(instanceId,user.id).first();
    if(!owned)return json({error:'장착할 장비를 찾을 수 없습니다.'},404);
    await env.DB.prepare(`INSERT INTO user_equipment_loadout(user_id,slot,instance_id,updated_at) VALUES(?,?,?,CURRENT_TIMESTAMP) ON CONFLICT(user_id,slot) DO UPDATE SET instance_id=excluded.instance_id,updated_at=CURRENT_TIMESTAMP`).bind(user.id,owned.slot,instanceId).run();
    return json({ok:true,slot:owned.slot,instanceId,bonuses:await userEquipmentBonuses(env,user.id)});
  }
  if(path==='character/equipment/unequip'&&request.method==='POST'){
    const user=await authenticate(request,env);if(!user)return json({error:'로그인이 필요합니다.'},401);
    const body=await readBody(request),slot=normalizeSlot(body.slot);if(!slot)return json({error:'올바른 장비 슬롯이 아닙니다.'},400);
    await env.DB.prepare('DELETE FROM user_equipment_loadout WHERE user_id=? AND slot=?').bind(user.id,slot).run();
    return json({ok:true,slot,instanceId:null,bonuses:await userEquipmentBonuses(env,user.id)});
  }
  if(path==='character/title/equip'&&request.method==='POST'){
    const user=await authenticate(request,env);if(!user)return json({error:'로그인이 필요합니다.'},401);
    const body=await readBody(request),titleId=cleanInt(body.titleId,1,2147483647);
    const owned=await env.DB.prepare(`SELECT t.id FROM user_character_titles u JOIN character_titles t ON t.id=u.title_id WHERE u.user_id=? AND t.id=? AND t.is_active=1 AND (u.expires_at IS NULL OR u.expires_at>CURRENT_TIMESTAMP)`).bind(user.id,titleId).first();
    if(!owned)return json({error:'보유하지 않은 칭호입니다.'},404);
    await env.DB.prepare(`INSERT INTO user_title_loadout(user_id,title_id,updated_at) VALUES(?,?,CURRENT_TIMESTAMP) ON CONFLICT(user_id) DO UPDATE SET title_id=excluded.title_id,updated_at=CURRENT_TIMESTAMP`).bind(user.id,titleId).run();
    return json({ok:true,equippedTitleId:titleId,bonuses:await userEquipmentBonuses(env,user.id)});
  }
  if(path==='character/title/unequip'&&request.method==='POST'){
    const user=await authenticate(request,env);if(!user)return json({error:'로그인이 필요합니다.'},401);
    await env.DB.prepare('DELETE FROM user_title_loadout WHERE user_id=?').bind(user.id).run();
    return json({ok:true,equippedTitleId:null,title:null,bonuses:await userEquipmentBonuses(env,user.id)});
  }
  if(path==='character/garage/equip'&&request.method==='POST'){
    const user=await authenticate(request,env);if(!user)return json({error:'로그인이 필요합니다.'},401);
    const body=await readBody(request),vehicleId=cleanInt(body.vehicleId,1,2147483647);
    const owned=await env.DB.prepare(`SELECT g.id FROM user_garage_vehicles u JOIN character_garage_items g ON g.id=u.garage_id WHERE u.user_id=? AND g.id=? AND g.is_active=1`).bind(user.id,vehicleId).first();
    if(!owned)return json({error:'보유하지 않은 이동수단입니다.'},404);
    await env.DB.prepare(`INSERT INTO user_garage_loadout(user_id,garage_id,updated_at) VALUES(?,?,CURRENT_TIMESTAMP) ON CONFLICT(user_id) DO UPDATE SET garage_id=excluded.garage_id,updated_at=CURRENT_TIMESTAMP`).bind(user.id,vehicleId).run();
    return json({ok:true,equippedVehicleId:vehicleId,bonuses:await userEquipmentBonuses(env,user.id)});
  }
  if(path==='character/garage/unequip'&&request.method==='POST'){
    const user=await authenticate(request,env);if(!user)return json({error:'로그인이 필요합니다.'},401);
    await env.DB.prepare('DELETE FROM user_garage_loadout WHERE user_id=?').bind(user.id).run();
    return json({ok:true,equippedVehicleId:null,bonuses:await userEquipmentBonuses(env,user.id)});
  }

  if(path==='equipment/supply-box/config'&&request.method==='GET'){
    const user=await authenticate(request,env);if(!user)return json({error:'로그인이 필요합니다.'},401);
    const fresh=new URL(request.url).searchParams.get('fresh')==='1';
    const [settings,balance,promotion]=await Promise.all([supplyBoxSettings(env),env.DB.prepare('SELECT quantity FROM cnine_user_inventory WHERE user_id=? AND item_code=?').bind(user.id,SUPPLY_BOX_CODE).first(),equipmentPromotionState(env,{fresh})]);
    return json({...publicSupplyBoxConfig(settings,promotion),balance:Number(balance?.quantity||0),coin:Number(user.coin||0)});
  }
  if(path==='equipment/supply-box/purchase'&&request.method==='POST'){
    const user=await authenticate(request,env);if(!user)return json({error:'로그인이 필요합니다.'},401);
    if(!LEGACY_SUPPLY_BOX_SHOP_ENABLED)return json({error:'기존 장비 보급상자는 판매가 종료되었습니다. 보유 중인 상자는 인벤토리에서 계속 개봉할 수 있습니다.'},403);
    const body=await readBody(request),rawCount=Number(body.count),count=cleanInt(rawCount,1,SUPPLY_BOX_MAX_OPEN),requestId=cleanText(body.requestId||crypto.randomUUID(),100);
    if(!Number.isInteger(rawCount)||rawCount<1||rawCount>SUPPLY_BOX_MAX_OPEN)return json({error:`구매 수량은 1개 이상 ${SUPPLY_BOX_MAX_OPEN}개 이하여야 합니다.`},400);
    const prior=await env.DB.prepare('SELECT status,response_json FROM inventory_use_receipts WHERE request_id=? AND user_id=?').bind(requestId,user.id).first();
    if(prior?.status==='COMPLETED'&&prior.response_json){try{return json(JSON.parse(prior.response_json))}catch{}}
    if(prior)return json({error:'이전 구매 요청의 서버 반영 여부를 복구 확인해야 합니다.',code:'PENDING_RECOVERY_REQUIRED',requestId},409);
    const [settings,promotion]=await Promise.all([supplyBoxSettings(env,{fresh:true}),equipmentPromotionState(env,{fresh:true})]);
    if(!settings.enabled||!settings.shopEnabled)return json({error:'현재 장비 보급상자 판매가 중지되어 있습니다.'},403);
    const pricing=supplyShopPricing(settings,promotion),totalCost=pricing.shopPrice*count;
    const quotedRaw=body.expectedUnitPrice,expectedUnitPrice=quotedRaw===undefined||quotedRaw===null?pricing.shopPrice:Number(quotedRaw);
    if(!Number.isInteger(expectedUnitPrice)||expectedUnitPrice<0)return json({error:'구매 예상 단가가 올바르지 않습니다.',code:'INVALID_PRICE_QUOTE'},400);
    if(expectedUnitPrice!==pricing.shopPrice)return json({error:'장비 보급상자 가격이 변경되었습니다. 새 가격을 확인한 뒤 다시 주문해 주세요.',code:'PRICE_CHANGED',expectedUnitPrice,currentUnitPrice:pricing.shopPrice},409);
    try{
      await env.DB.batch([
        env.DB.prepare(`INSERT OR IGNORE INTO inventory_use_receipts(request_id,user_id,item_code,status)
          SELECT ?,?,?,'PENDING'
          WHERE EXISTS(SELECT 1 FROM users WHERE id=? AND coin>=?)
            AND COALESCE((SELECT CASE WHEN json_valid(value) THEN CAST(json_extract(value,'$.shopPrice') AS INTEGER) END FROM app_meta WHERE key='equipment_supply_box_settings_v1247'),?)=?`).bind(requestId,user.id,`${SUPPLY_BOX_CODE}_PURCHASE`,user.id,totalCost,DEFAULT_SUPPLY_BOX_SETTINGS.shopPrice,pricing.originalShopPrice),
        env.DB.prepare(`UPDATE users SET coin=coin-? WHERE id=? AND coin>=?
          AND EXISTS(SELECT 1 FROM inventory_use_receipts WHERE request_id=? AND user_id=? AND status='PENDING')`).bind(totalCost,user.id,totalCost,requestId,user.id),
        env.DB.prepare(`INSERT INTO cnine_user_inventory(user_id,item_code,quantity,unseen_quantity,created_at,updated_at)
          SELECT ?,?,?,?,CURRENT_TIMESTAMP,CURRENT_TIMESTAMP
          WHERE EXISTS(SELECT 1 FROM inventory_use_receipts WHERE request_id=? AND user_id=? AND status='PENDING')
          ON CONFLICT(user_id,item_code) DO UPDATE SET quantity=cnine_user_inventory.quantity+excluded.quantity,unseen_quantity=cnine_user_inventory.unseen_quantity+excluded.unseen_quantity,updated_at=CURRENT_TIMESTAMP`).bind(user.id,SUPPLY_BOX_CODE,count,count,requestId,user.id),
        env.DB.prepare(`INSERT INTO inventory_logs(user_id,item_code,change_amount,balance_after,reason,reference_type,reference_id)
          SELECT ?,?,?,quantity,?,'SUPPLY_SHOP',? FROM cnine_user_inventory
          WHERE user_id=? AND item_code=? AND EXISTS(SELECT 1 FROM inventory_use_receipts WHERE request_id=? AND user_id=? AND status='PENDING')`).bind(user.id,SUPPLY_BOX_CODE,count,'장비 보급상자 구매',requestId,user.id,SUPPLY_BOX_CODE,requestId,user.id),
        env.DB.prepare(env.DB?.dialect==='postgres'?`UPDATE inventory_use_receipts SET status='COMPLETED',response_json=(jsonb_build_object(
          'ok',true,'itemCode',?,'count',?,'balance',COALESCE((SELECT quantity FROM cnine_user_inventory WHERE user_id=? AND item_code=?),0),
          'spent',?,'coin',COALESCE((SELECT coin FROM users WHERE id=?),0),'requestId',?,'shopPrice',?,'originalShopPrice',?,
          'promotionDiscountPercent',?,'promotionMode',?))::text,updated_at=CURRENT_TIMESTAMP
          WHERE request_id=? AND user_id=? AND status='PENDING'`:`UPDATE inventory_use_receipts SET status='COMPLETED',response_json=json_object(
          'ok',json('true'),'itemCode',?,'count',?,'balance',COALESCE((SELECT quantity FROM cnine_user_inventory WHERE user_id=? AND item_code=?),0),
          'spent',?,'coin',COALESCE((SELECT coin FROM users WHERE id=?),0),'requestId',?,'shopPrice',?,'originalShopPrice',?,
          'promotionDiscountPercent',?,'promotionMode',?),updated_at=CURRENT_TIMESTAMP
          WHERE request_id=? AND user_id=? AND status='PENDING'`).bind(SUPPLY_BOX_CODE,count,user.id,SUPPLY_BOX_CODE,totalCost,user.id,requestId,pricing.shopPrice,pricing.originalShopPrice,pricing.promotionDiscountPercent,pricing.promotionMode,requestId,user.id)
      ]);
      const receipt=await env.DB.prepare('SELECT status,response_json FROM inventory_use_receipts WHERE request_id=? AND user_id=?').bind(requestId,user.id).first();
      if(receipt?.status==='COMPLETED'&&receipt.response_json)return json(JSON.parse(receipt.response_json));
      const [latestSettings,latestPromotion]=await Promise.all([supplyBoxSettings(env,{fresh:true}),equipmentPromotionState(env,{fresh:true})]),latestPricing=supplyShopPricing(latestSettings,latestPromotion);
      if(latestPricing.shopPrice!==expectedUnitPrice)return json({error:'장비 보급상자 가격이 변경되었습니다. 새 가격을 확인한 뒤 다시 주문해 주세요.',code:'PRICE_CHANGED',expectedUnitPrice,currentUnitPrice:latestPricing.shopPrice},409);
      return json({error:'코인이 부족합니다.'},400);
    }catch(error){
      return json({error:error.message||'보급상자 구매에 실패했습니다.'},500);
    }
  }
  if(path==='equipment/supply-box/open'&&request.method==='POST'){
    const user=await authenticate(request,env);if(!user)return json({error:'로그인이 필요합니다.'},401);
    const body=await readBody(request),rawCount=Number(body.count),count=cleanInt(rawCount,1,SUPPLY_BOX_MAX_OPEN),requestId=cleanText(body.requestId||crypto.randomUUID(),100),settings=await supplyBoxSettings(env);
    if(!Number.isInteger(rawCount)||rawCount<1||rawCount>SUPPLY_BOX_MAX_OPEN)return json({error:`장비 보급상자는 1개 이상 ${SUPPLY_BOX_MAX_OPEN}개 이하로 개방할 수 있습니다.`},400);
    if(!settings.enabled)return json({error:'현재 장비 보급상자를 개방할 수 없습니다.'},403);
    const prior=await env.DB.prepare('SELECT status,response_json FROM inventory_use_receipts WHERE request_id=? AND user_id=?').bind(requestId,user.id).first();
    if(prior?.status==='COMPLETED'&&prior.response_json){try{return json(JSON.parse(prior.response_json))}catch{}}
    if(prior)return json({error:'이전 개방 요청의 서버 반영 여부를 복구 확인해야 합니다.',code:'PENDING_RECOVERY_REQUIRED',requestId},409);
    try{
      const [pool,stockRow,ownedRows]=await Promise.all([
        env.DB.prepare('SELECT * FROM character_equipment_items WHERE is_active=1 AND is_public=1 AND supply_enabled=1 AND supply_weight>0 ORDER BY sort_order,id').all(),
        env.DB.prepare('SELECT quantity FROM cnine_user_inventory WHERE user_id=? AND item_code=?').bind(user.id,SUPPLY_BOX_CODE).first(),
        env.DB.prepare('SELECT DISTINCT equipment_id FROM user_equipment_instances WHERE user_id=?').bind(user.id).all()
      ]);
      if(Number(stockRow?.quantity||0)<count)return json({error:`보급상자가 ${count}개 이상 필요합니다.`},400);
      const ownedEquipmentIds=new Set((ownedRows.results||[]).map(row=>Number(row.equipment_id)));
      const availableEquipment=[...(pool.results||[])];
      const results=[],equipmentRewards=[];let coinGained=0,shardGained=0;
      for(let index=0;index<count;index++){
        const roll=Math.random()*100,eqLimit=settings.rewardRates.equipment,shardLimit=eqLimit+settings.rewardRates.shards;
        if(roll<eqLimit&&availableEquipment.length){
          const picked=weightedPick(availableEquipment.map(row=>({...row,weight:row.supply_weight}))),item=publicItem(picked);
          const alreadyOwned=ownedEquipmentIds.has(Number(item.id));
          if(alreadyOwned&&normalizeEquipmentRarity(item.rarity)!=='MYTHIC'){
            const amount=deterministicInt(`${requestId}:DUPLICATE_SHARD:${index}`,settings.shards.min,settings.shards.max);
            shardGained+=amount;
            results.push({type:'DUPLICATE_SHARDS',amount,duplicateItem:{id:item.id,name:item.name,image:item.image,rarity:item.rarity}});
          }else{
            ownedEquipmentIds.add(Number(item.id));
            equipmentRewards.push({index,item});
            results.push({type:alreadyOwned?'EQUIPMENT_DUPLICATE':'EQUIPMENT',item,isDuplicate:alreadyOwned});
          }
        }else if(roll<shardLimit){const amount=deterministicInt(`${requestId}:SHARD:${index}`,settings.shards.min,settings.shards.max);shardGained+=amount;results.push({type:'SHARDS',amount});}
        else{const amount=deterministicInt(`${requestId}:COIN:${index}`,settings.coins.min,settings.coins.max);coinGained+=amount;results.push({type:'COINS',amount});}
      }
      const response={ok:true,itemCode:SUPPLY_BOX_CODE,count,remaining:0,results,coinGained,shardGained,coin:0,cardShards:0,requestId};
      const statements=[
        env.DB.prepare(`INSERT OR IGNORE INTO inventory_use_receipts(request_id,user_id,item_code,status)
          SELECT ?,?,?,'PENDING' WHERE EXISTS(SELECT 1 FROM cnine_user_inventory WHERE user_id=? AND item_code=? AND quantity>=?)`).bind(requestId,user.id,SUPPLY_BOX_CODE,user.id,SUPPLY_BOX_CODE,count),
        env.DB.prepare(`UPDATE cnine_user_inventory SET quantity=quantity-?,unseen_quantity=MIN(unseen_quantity,quantity-?),updated_at=CURRENT_TIMESTAMP
          WHERE user_id=? AND item_code=? AND quantity>=?
            AND EXISTS(SELECT 1 FROM inventory_use_receipts WHERE request_id=? AND user_id=? AND status='PENDING')`).bind(count,count,user.id,SUPPLY_BOX_CODE,count,requestId,user.id),
        env.DB.prepare(`UPDATE users SET coin=coin+?,card_shards=card_shards+? WHERE id=?
          AND EXISTS(SELECT 1 FROM inventory_use_receipts WHERE request_id=? AND user_id=? AND status='PENDING')`).bind(coinGained,shardGained,user.id,requestId,user.id)
      ];
      if(equipmentRewards.length){
        const rewardRows=JSON.stringify(equipmentRewards.map(reward=>[Number(reward.item.id),Number(reward.index)]));
        statements.push(env.DB.prepare(`WITH receipt_guard AS (
          SELECT 1 FROM inventory_use_receipts WHERE request_id=? AND user_id=? AND status='PENDING'
        ),reward_rows AS (
          SELECT CAST(json_extract(value,'$[0]') AS INTEGER) equipment_id,
                 CAST(json_extract(value,'$[1]') AS INTEGER) reward_index
          FROM json_each(?)
        ) INSERT INTO user_equipment_instances(user_id,equipment_id,source_type,source_id,request_id)
          SELECT ?,reward_rows.equipment_id,'SUPPLY_BOX',?,?||reward_rows.reward_index
          FROM reward_rows CROSS JOIN receipt_guard`).bind(requestId,user.id,rewardRows,user.id,requestId,`SUPPLY:${requestId}:`));
      }
      statements.push(
        env.DB.prepare(`INSERT INTO inventory_logs(user_id,item_code,change_amount,balance_after,reason,reference_type,reference_id)
          SELECT ?,?,-?,quantity,?,'SUPPLY_OPEN',? FROM cnine_user_inventory
          WHERE user_id=? AND item_code=? AND EXISTS(SELECT 1 FROM inventory_use_receipts WHERE request_id=? AND user_id=? AND status='PENDING')`).bind(user.id,SUPPLY_BOX_CODE,count,'장비 보급상자 개방',requestId,user.id,SUPPLY_BOX_CODE,requestId,user.id),
        env.DB.prepare(env.DB?.dialect==='postgres'?`UPDATE inventory_use_receipts SET status='COMPLETED',response_json=(
          jsonb_set(jsonb_set(jsonb_set(?::jsonb,'{remaining}',to_jsonb(COALESCE((SELECT quantity FROM cnine_user_inventory WHERE user_id=? AND item_code=?),0)),true),
          '{coin}',to_jsonb(COALESCE((SELECT coin FROM users WHERE id=?),0)),true),
          '{cardShards}',to_jsonb(COALESCE((SELECT card_shards FROM users WHERE id=?),0)),true))::text,updated_at=CURRENT_TIMESTAMP
          WHERE request_id=? AND user_id=? AND status='PENDING'`:`UPDATE inventory_use_receipts SET status='COMPLETED',response_json=json_set(?,
          '$.remaining',COALESCE((SELECT quantity FROM cnine_user_inventory WHERE user_id=? AND item_code=?),0),
          '$.coin',COALESCE((SELECT coin FROM users WHERE id=?),0),
          '$.cardShards',COALESCE((SELECT card_shards FROM users WHERE id=?),0)),updated_at=CURRENT_TIMESTAMP
          WHERE request_id=? AND user_id=? AND status='PENDING'`).bind(JSON.stringify(response),user.id,SUPPLY_BOX_CODE,user.id,user.id,requestId,user.id)
      );
      await env.DB.batch(statements);
      const receipt=await env.DB.prepare('SELECT status,response_json FROM inventory_use_receipts WHERE request_id=? AND user_id=?').bind(requestId,user.id).first();
      if(receipt?.status==='COMPLETED'&&receipt.response_json)return json(JSON.parse(receipt.response_json));
      return json({error:`보급상자가 ${count}개 이상 필요합니다.`},400);
    }catch(error){
      return json({error:error.message||'보급상자 개방에 실패했습니다.'},500);
    }
  }

  if(path==='admin/equipment-user-search'&&request.method==='GET'){
    const admin=await authenticate(request,env);if(!isAdmin(admin))return json({error:'관리자 권한이 필요합니다.'},403);
    const query=cleanText(new URL(request.url).searchParams.get('q')||'',40);
    if(query.length<1)return json({users:[]});
    const like=`%${query}%`;
    const rows=await env.DB.prepare(`SELECT id,nickname,role,status FROM users WHERE nickname LIKE ? ORDER BY CASE WHEN nickname=? THEN 0 WHEN nickname LIKE ? THEN 1 ELSE 2 END,nickname LIMIT 20`).bind(like,query,`${query}%`).all();
    return json({users:(rows.results||[]).map(row=>({id:Number(row.id),nickname:row.nickname,role:row.role||'USER',status:row.status||'ACTIVE'}))});
  }
  if(path==='admin/equipment-system'&&request.method==='GET'){
    const admin=await authenticate(request,env);if(!isAdmin(admin))return json({error:'관리자 권한이 필요합니다.'},403);return json(await adminSystemPayload(env));
  }
  if(path==='admin/equipment-item'&&['POST','PATCH'].includes(request.method)){
    const admin=await authenticate(request,env);
    if(!isAdmin(admin))return json({error:'관리자 권한이 필요합니다.'},403);

    const b=await readBody(request),id=cleanInt(b.id,0,2147483647),slot=normalizeSlot(b.slot),subtype=normalizeSubtype(b.subtype);
    if(!slot||!subtype)return json({error:'장비 부위와 종류를 확인하세요.'},400);

    const allowedSubtypes={WEAPON:['MODERN_SWORD','AXE','PISTOL','RIFLE'],TOP:['TOP'],BOTTOM:['BOTTOM'],SHOES:['SHOES'],ACCESSORY:['DUAL_DISK'],[BATTLE_SUIT_SLOT]:[BATTLE_SUIT_SLOT]};
    if(!allowedSubtypes[slot]?.includes(subtype))return json({error:'장비 부위와 세부 종류가 맞지 않습니다.'},400);

    const name=cleanText(b.name,80),code=cleanText(b.code||`EQ_${Date.now()}`,60).toUpperCase().replace(/[^A-Z0-9_]/g,'_');
    if(!name)return json({error:'장비명을 입력하세요.'},400);

    const duplicateCode=await env.DB.prepare('SELECT id FROM character_equipment_items WHERE code=? AND id<>?').bind(code,id||0).first();
    if(duplicateCode)return json({error:'이미 사용 중인 장비 코드입니다.'},409);

    let current=null;
    if(id){
      current=await env.DB.prepare('SELECT slot,subtype,supply_enabled,supply_weight FROM character_equipment_items WHERE id=?').bind(id).first();
      if(!current)return json({error:'수정할 장비를 찾을 수 없습니다.'},404);
    }

    const slotChanged=Boolean(current&&current.slot!==slot);
    let autoUnequipped=0;
    if(slotChanged){
      const row=await env.DB.prepare(`SELECT COUNT(*) count FROM user_equipment_loadout
        WHERE instance_id IN (SELECT id FROM user_equipment_instances WHERE equipment_id=?)`).bind(id).first();
      autoUnequipped=Number(row?.count||0);
    }

    // 장비 등록/수정 화면에서는 보급상자 풀을 변경하지 않는다.
    // 신규 장비는 반드시 별도 "보급상자 설정"에서 확률을 지정해야만 포함된다.
    const supplyEnabled=current?current.supply_enabled!==0:false;
    const supplyWeight=current?cleanWeight(current.supply_weight,0):0;
    // 배틀슈트 전투력은 PVE 전용이다. CMS 입력과 무관하게 PVP 값은 항상 0으로 저장한다.
    const power=equipmentPowerForSlot(slot,b),isActive=cleanBool(b.isActive),isPublic=cleanBool(b.isPublic);
    const args=[code,name,slot,subtype,normalizeEquipmentRarity(b.rarity),cleanText(b.image,500),cleanText(b.description,500),power.total,power.pve,power.pvp,isActive?1:0,isPublic?1:0,cleanInt(b.sortOrder,0,100000),supplyEnabled?1:0,supplyWeight];

    if(id){
      const statements=[env.DB.prepare(`UPDATE character_equipment_items SET code=?,name=?,slot=?,subtype=?,rarity=?,image_url=?,description=?,total_power=?,pve_power=?,pvp_power=?,is_active=?,is_public=?,sort_order=?,supply_enabled=?,supply_weight=?,updated_at=CURRENT_TIMESTAMP WHERE id=?`).bind(...args,id)];

      // 부위가 바뀐 장비는 보유권을 유지하되 기존 장착만 안전하게 해제한다.
      // 새 부위에 이미 장착된 다른 장비를 덮어쓰지 않기 위한 처리다.
      if(slotChanged||!isActive){
        statements.push(env.DB.prepare('DELETE FROM user_equipment_loadout WHERE instance_id IN (SELECT id FROM user_equipment_instances WHERE equipment_id=?)').bind(id));
      }
      if(!isActive){
        statements.push(env.DB.prepare('UPDATE equipment_drop_entries SET is_active=0,updated_at=CURRENT_TIMESTAMP WHERE equipment_id=?').bind(id));
      }
      await env.DB.batch(statements);
    }else{
      await env.DB.prepare(`INSERT INTO character_equipment_items(code,name,slot,subtype,rarity,image_url,description,total_power,pve_power,pvp_power,is_active,is_public,sort_order,supply_enabled,supply_weight) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`).bind(...args).run();
    }

    if(writeAdminLog)await writeAdminLog(env,admin,id?'EQUIPMENT_UPDATE':'EQUIPMENT_CREATE','EQUIPMENT',String(id||code),null,{name,previousSlot:current?.slot||null,slot,previousSubtype:current?.subtype||null,subtype,totalPower:power.total,slotChanged,autoUnequipped});
    return json({ok:true,slotChanged,previousSlot:current?.slot||null,slot,autoUnequipped,...await adminSystemPayload(env)});
  }
  if(path==='admin/equipment-item'&&request.method==='DELETE'){
    const admin=await authenticate(request,env);if(!isAdmin(admin))return json({error:'관리자 권한이 필요합니다.'},403);const b=await readBody(request),id=cleanInt(b.id,1,2147483647),used=await env.DB.prepare('SELECT COUNT(*) count FROM user_equipment_instances WHERE equipment_id=?').bind(id).first();if(Number(used?.count||0)>0){await env.DB.batch([env.DB.prepare('UPDATE character_equipment_items SET is_active=0,is_public=0,updated_at=CURRENT_TIMESTAMP WHERE id=?').bind(id),env.DB.prepare('DELETE FROM user_equipment_loadout WHERE instance_id IN (SELECT id FROM user_equipment_instances WHERE equipment_id=?)').bind(id),env.DB.prepare('UPDATE equipment_drop_entries SET is_active=0,updated_at=CURRENT_TIMESTAMP WHERE equipment_id=?').bind(id)]);return json({ok:true,disabled:true,...await adminSystemPayload(env)})}await env.DB.batch([env.DB.prepare('DELETE FROM equipment_drop_entries WHERE equipment_id=?').bind(id),env.DB.prepare('DELETE FROM character_equipment_items WHERE id=?').bind(id)]);return json({ok:true,deleted:true,...await adminSystemPayload(env)});
  }
  if(path==='admin/title-item'&&['POST','PATCH'].includes(request.method)){
    const admin=await authenticate(request,env);if(!isAdmin(admin))return json({error:'관리자 권한이 필요합니다.'},403);const b=await readBody(request),id=cleanInt(b.id,0,2147483647),unlockType=String(b.unlockType||'MANUAL').toUpperCase();if(!TITLE_UNLOCK_TYPES.includes(unlockType))return json({error:'올바른 칭호 획득 조건이 아닙니다.'},400);const name=cleanText(b.name,80),code=cleanText(b.code||`TITLE_${Date.now()}`,60).toUpperCase().replace(/[^A-Z0-9_]/g,'_');if(!name)return json({error:'칭호명을 입력하세요.'},400);const duplicateCode=await env.DB.prepare('SELECT id FROM character_titles WHERE code=? AND id<>?').bind(code,id||0).first();if(duplicateCode)return json({error:'이미 사용 중인 칭호 코드입니다.'},409);const rawConfig=typeof b.unlockConfig==='string'?parseJson(b.unlockConfig,{}):(b.unlockConfig||{}),fontPreset=normalizeTitleFontPreset(b.fontPreset??rawConfig.fontPreset),config={...rawConfig,fontPreset},stylePreset=normalizeTitleStylePreset(b.stylePreset),args=[code,name,cleanText(b.description,500),cleanText(b.badgeText||name,40),cleanText(b.image,500),cleanInt(b.pvePower,0,100000000),unlockType,JSON.stringify(config),stylePreset,cleanBool(b.isActive)?1:0,cleanBool(b.isPublic)?1:0,cleanInt(b.sortOrder,0,100000)];if(id)await env.DB.prepare(`UPDATE character_titles SET code=?,name=?,description=?,badge_text=?,image_url=?,pve_power=?,unlock_type=?,unlock_config_json=?,style_preset=?,is_active=?,is_public=?,sort_order=?,updated_at=CURRENT_TIMESTAMP WHERE id=?`).bind(...args,id).run();else await env.DB.prepare(`INSERT INTO character_titles(code,name,description,badge_text,image_url,pve_power,unlock_type,unlock_config_json,style_preset,is_active,is_public,sort_order) VALUES(?,?,?,?,?,?,?,?,?,?,?,?)`).bind(...args).run();if(id&&!cleanBool(b.isActive))await env.DB.prepare('DELETE FROM user_title_loadout WHERE title_id=?').bind(id).run();return json({ok:true,...await adminSystemPayload(env)});
  }
  if(path==='admin/title-item'&&request.method==='DELETE'){
    const admin=await authenticate(request,env);if(!isAdmin(admin))return json({error:'관리자 권한이 필요합니다.'},403);const b=await readBody(request),id=cleanInt(b.id,1,2147483647),used=await env.DB.prepare('SELECT COUNT(*) count FROM user_character_titles WHERE title_id=?').bind(id).first();if(Number(used?.count||0)>0){await env.DB.batch([env.DB.prepare('UPDATE character_titles SET is_active=0,is_public=0,updated_at=CURRENT_TIMESTAMP WHERE id=?').bind(id),env.DB.prepare('DELETE FROM user_title_loadout WHERE title_id=?').bind(id)]);return json({ok:true,disabled:true,...await adminSystemPayload(env)})}await env.DB.prepare('DELETE FROM character_titles WHERE id=?').bind(id).run();return json({ok:true,deleted:true,...await adminSystemPayload(env)});
  }
  if(path==='admin/equipment-supply-settings'&&request.method==='POST'){
    const admin=await authenticate(request,env);if(!isAdmin(admin))return json({error:'관리자 권한이 필요합니다.'},403);
    const body=await readBody(request),settings=cleanSupplyBoxSettings(body.settings||{}),sourceEntries=Array.isArray(body.entries)?body.entries:[];
    const byId=new Map();
    for(const entry of sourceEntries){const equipmentId=cleanInt(entry?.equipmentId,1,2147483647),weight=cleanSupplyPoolWeight(entry?.weight);if(equipmentId)byId.set(equipmentId,weight)}
    const entries=[...byId.entries()].map(([equipmentId,weight])=>({equipmentId,weight})),poolTotalUnits=entries.reduce((sum,entry)=>sum+supplyPoolUnits(entry.weight),0),poolTotal=poolTotalUnits/SUPPLY_POOL_SCALE;
    if(settings.rewardRates.equipment>0&&!entries.some(entry=>entry.weight>0))return json({error:'장비 확률이 0%보다 크면 장비 풀을 하나 이상 선택해야 합니다.'},400);
    if(entries.length&&poolTotalUnits!==SUPPLY_POOL_TOTAL_UNITS)return json({error:`장비 풀 확률 합계를 정확히 100.000%로 맞추세요. 현재 ${poolTotal.toFixed(3)}%입니다.`},400);
    if(entries.length){
      const marks=entries.map(()=>'?').join(','),active=await env.DB.prepare(`SELECT id FROM character_equipment_items WHERE id IN (${marks}) AND is_active=1 AND is_public=1`).bind(...entries.map(entry=>entry.equipmentId)).all(),activeIds=new Set((active.results||[]).map(row=>Number(row.id)));
      if(activeIds.size!==entries.length)return json({error:'장비 풀에는 활성·공개 상태인 장비만 포함할 수 있습니다.'},400);
    }
    const statements=[
      env.DB.prepare("INSERT INTO app_meta(key,value,updated_at) VALUES('equipment_supply_box_settings_v1247',?,CURRENT_TIMESTAMP) ON CONFLICT(key) DO UPDATE SET value=excluded.value,updated_at=CURRENT_TIMESTAMP").bind(JSON.stringify(settings)),
      env.DB.prepare('UPDATE character_equipment_items SET supply_enabled=0,updated_at=CURRENT_TIMESTAMP'),
      env.DB.prepare('UPDATE equipment_drop_profiles SET enabled=0,updated_at=CURRENT_TIMESTAMP WHERE enabled<>0')
    ];
    for(const entry of entries)statements.push(env.DB.prepare('UPDATE character_equipment_items SET supply_enabled=1,supply_weight=?,updated_at=CURRENT_TIMESTAMP WHERE id=? AND is_active=1 AND is_public=1').bind(entry.weight,entry.equipmentId));
    await env.DB.batch(statements);supplySettingsCache=settings;supplySettingsCacheAt=Date.now();
    if(writeAdminLog)await writeAdminLog(env,admin,'EQUIPMENT_SUPPLY_SETTINGS_UPDATE','SETTINGS','equipment_supply_box_settings_v1247',null,{settings,poolCount:entries.length,poolTotal});
    return json({ok:true,...await adminSystemPayload(env)});
  }
  if(path==='admin/equipment-drop-profile'&&['POST','PATCH','DELETE'].includes(request.method)){
    const admin=await authenticate(request,env);if(!isAdmin(admin))return json({error:'관리자 권한이 필요합니다.'},403);
    return json({error:'개별 장비 드랍 설정은 종료되었습니다. 보급상자 설정에서 통합 관리하세요.',code:'LEGACY_EQUIPMENT_DROP_DISABLED'},410);
  }
  if(path==='admin/equipment-grant'&&request.method==='POST'){
    const admin=await authenticate(request,env);if(!isAdmin(admin))return json({error:'관리자 권한이 필요합니다.'},403);const b=await readBody(request),userId=cleanInt(b.userId,1,2147483647),equipmentId=cleanInt(b.equipmentId,1,2147483647),quantity=cleanInt(b.quantity||1,1,100),[targetUser,targetItem]=await Promise.all([env.DB.prepare('SELECT id FROM users WHERE id=?').bind(userId).first(),env.DB.prepare('SELECT id,rarity FROM character_equipment_items WHERE id=? AND is_active=1').bind(equipmentId).first()]);if(!targetUser)return json({error:'지급 대상 유저를 찾을 수 없습니다.'},404);if(!targetItem)return json({error:'지급할 활성 장비를 찾을 수 없습니다.'},404);const statements=[];for(let i=0;i<quantity;i++)statements.push(env.DB.prepare(`INSERT INTO user_equipment_instances(user_id,equipment_id,source_type,source_id,request_id) SELECT ?,id,'ADMIN',?,? FROM character_equipment_items WHERE id=?`).bind(userId,String(admin.id),`ADMIN-${admin.id}-${Date.now()}-${i}`,equipmentId));await env.DB.batch(statements);return json({ok:true,quantity});
  }

  if(path==='admin/garage-item'&&['POST','PATCH'].includes(request.method)){
    const admin=await authenticate(request,env);if(!isAdmin(admin))return json({error:'관리자 권한이 필요합니다.'},403);
    const b=await readBody(request),id=cleanInt(b.id,0,2147483647),name=cleanText(b.name,80),code=cleanText(b.code||`GARAGE_${Date.now()}`,60).toUpperCase().replace(/[^A-Z0-9_]/g,'_');
    if(!name)return json({error:'이동수단명을 입력하세요.'},400);
    const duplicateCode=await env.DB.prepare('SELECT id FROM character_garage_items WHERE code=? AND id<>?').bind(code,id||0).first();if(duplicateCode)return json({error:'이미 사용 중인 이동수단 코드입니다.'},409);
    const power=itemPower(b.totalPower||0),args=[code,name,normalizeGarageRarity(b.rarity),cleanText(b.image,500),cleanText(b.description,500),power.total,power.pve,power.pvp,cleanBool(b.isActive)?1:0,cleanBool(b.isPublic)?1:0,cleanInt(b.sortOrder,0,100000)];
    if(id)await env.DB.prepare(`UPDATE character_garage_items SET code=?,name=?,rarity=?,image_url=?,description=?,total_power=?,pve_power=?,pvp_power=?,is_active=?,is_public=?,sort_order=?,updated_at=CURRENT_TIMESTAMP WHERE id=?`).bind(...args,id).run();
    else await env.DB.prepare(`INSERT INTO character_garage_items(code,name,rarity,image_url,description,total_power,pve_power,pvp_power,is_active,is_public,sort_order) VALUES(?,?,?,?,?,?,?,?,?,?,?)`).bind(...args).run();
    if(id&&!cleanBool(b.isActive))await env.DB.prepare('DELETE FROM user_garage_loadout WHERE garage_id=?').bind(id).run();
    return json({ok:true,...await adminSystemPayload(env)});
  }
  if(path==='admin/garage-item'&&request.method==='DELETE'){
    const admin=await authenticate(request,env);if(!isAdmin(admin))return json({error:'관리자 권한이 필요합니다.'},403);
    const b=await readBody(request),id=cleanInt(b.id,1,2147483647),used=await env.DB.prepare('SELECT COUNT(*) count FROM user_garage_vehicles WHERE garage_id=?').bind(id).first();
    if(Number(used?.count||0)>0){await env.DB.batch([env.DB.prepare('UPDATE character_garage_items SET is_active=0,is_public=0,updated_at=CURRENT_TIMESTAMP WHERE id=?').bind(id),env.DB.prepare('DELETE FROM user_garage_loadout WHERE garage_id=?').bind(id)]);return json({ok:true,disabled:true,...await adminSystemPayload(env)})}
    await env.DB.prepare('DELETE FROM character_garage_items WHERE id=?').bind(id).run();
    return json({ok:true,deleted:true,...await adminSystemPayload(env)});
  }
  if(path==='admin/garage-grant'&&request.method==='POST'){
    const admin=await authenticate(request,env);if(!isAdmin(admin))return json({error:'관리자 권한이 필요합니다.'},403);
    const b=await readBody(request),userId=cleanInt(b.userId,1,2147483647),garageId=cleanInt(b.garageId,1,2147483647),action=String(b.action||'GRANT').toUpperCase(),[targetUser,targetItem]=await Promise.all([env.DB.prepare('SELECT id FROM users WHERE id=?').bind(userId).first(),env.DB.prepare('SELECT id FROM character_garage_items WHERE id=?').bind(garageId).first()]);
    if(!targetUser)return json({error:'지급 대상 유저를 찾을 수 없습니다.'},404);if(!targetItem)return json({error:'이동수단을 찾을 수 없습니다.'},404);
    if(action==='REVOKE')await env.DB.batch([env.DB.prepare('DELETE FROM user_garage_loadout WHERE user_id=? AND garage_id=?').bind(userId,garageId),env.DB.prepare('DELETE FROM user_garage_vehicles WHERE user_id=? AND garage_id=?').bind(userId,garageId)]);
    else await env.DB.prepare(`INSERT OR IGNORE INTO user_garage_vehicles(user_id,garage_id,source_type,source_id) VALUES(?,?,?,?)`).bind(userId,garageId,'ADMIN',String(admin.id)).run();
    return json({ok:true});
  }

  if(path==='admin/title-grant'&&request.method==='POST'){
    const admin=await authenticate(request,env);if(!isAdmin(admin))return json({error:'관리자 권한이 필요합니다.'},403);const b=await readBody(request),userId=cleanInt(b.userId,1,2147483647),titleId=cleanInt(b.titleId,1,2147483647),action=String(b.action||'GRANT').toUpperCase(),[targetUser,targetTitle]=await Promise.all([env.DB.prepare('SELECT id FROM users WHERE id=?').bind(userId).first(),env.DB.prepare('SELECT id FROM character_titles WHERE id=?').bind(titleId).first()]);if(!targetUser)return json({error:'지급 대상 유저를 찾을 수 없습니다.'},404);if(!targetTitle)return json({error:'칭호를 찾을 수 없습니다.'},404);if(action==='REVOKE'){await env.DB.batch([env.DB.prepare('DELETE FROM user_title_loadout WHERE user_id=? AND title_id=?').bind(userId,titleId),env.DB.prepare('DELETE FROM user_character_titles WHERE user_id=? AND title_id=?').bind(userId,titleId)])}else await grantTitle(env,userId,titleId,'ADMIN',String(admin.id));return json({ok:true});
  }
  return null;
}
