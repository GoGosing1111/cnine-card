/* SOOPKETMON AVATAR CATALOG V1
 *
 * The live catalog is deployed dark. Operators explicitly configure prices,
 * acquisition sources and visibility in CMS before moving OFF -> TEST -> ON.
 * Browsing does not create logs; only catalog/config mutations and purchases
 * create durable audit records.
 */
const FOUNDATION_KEY='safe_runtime_upgrade_v1863_avatar_catalog_v1';
const EFFECT_OPTIONS_KEY='safe_runtime_upgrade_v1864_avatar_effect_options_v1';
const EQUIPMENT_ALPHA_V2_KEY='safe_runtime_upgrade_v1867_avatar_equipment_alpha_v2';
const EQUIPMENT_ALPHA_V3_KEY='safe_runtime_upgrade_v1870_avatar_equipment_alpha_v3';
const OWNERSHIP_EXPIRY_KEY='safe_runtime_upgrade_v1917_avatar_ownership_expiry_v1';
const DIMWOOS_AVATAR_KEY='safe_runtime_upgrade_v1985_dimwoos_avatar_v1';
const TERRAN_EMPRESS_JOEUN_AVATAR_KEY='safe_runtime_upgrade_v2006_terran_empress_joeun_avatar_v1';
const SETTINGS_KEY='avatar_settings_v1';
const SETTINGS_DEFAULT=Object.freeze({mode:'OFF',shopEnabled:false,version:1});
const MODES=Object.freeze(['OFF','TEST','ON']);
const ACQUISITION_TYPES=Object.freeze(['UNSET','COIN','DROP','EVENT']);
const EFFECT_TYPES=Object.freeze(['BATTLE_POWER_PERCENT','SCRAPYARD_FREE_ENTRY','RAID_EXTRA_ENTRY','COIN_GAIN_PERCENT']);
const MAX_SAFE_COIN=Number.MAX_SAFE_INTEGER;
const AVATAR_EQUIP_COOLDOWN_MS=24*60*60*1000;
let foundationPromise=null;
let ownershipExpiryPromise=null;
let settingsCache=null;
let settingsCacheAt=0;

const SEEDS=Object.freeze([
  {serial:'A-01',code:'AZURE_FROST_STRATEGIST',name:'서리의 전략관',callSign:'AZURE FROST',roleLabel:'빙결 전술 지휘관',file:'avatar-f01-azure-frost-strategist-lobby-v1',accent:'#8bc9ff',effectType:'COIN_GAIN_PERCENT',effectValue:1,sortOrder:10},
  {serial:'A-02',code:'CRIMSON_SIEGE_MARSHAL',name:'진홍 공성 지휘관',callSign:'CRIMSON SIEGE',roleLabel:'공성 화력 통제관',file:'avatar-f02-crimson-siege-marshal-lobby-v1',accent:'#ff6d64',effectType:'BATTLE_POWER_PERCENT',effectValue:8,sortOrder:20},
  {serial:'A-03',code:'VERDANT_BIO_MEDIC',name:'에메랄드 전장의무관',callSign:'VERDANT MEDIC',roleLabel:'전장 생체 의무관',file:'avatar-f03-verdant-bio-medic-lobby-v1',accent:'#6ee3bd',effectType:'RAID_EXTRA_ENTRY',effectValue:1,sortOrder:30},
  {serial:'A-04',code:'SOLAR_VANGUARD',name:'태양의 선봉대장',callSign:'SOLAR VANGUARD',roleLabel:'황금 성채 선봉장',file:'avatar-f04-solar-vanguard-lobby-v1',accent:'#ffd178',effectType:'BATTLE_POWER_PERCENT',effectValue:4,sortOrder:40},
  {serial:'A-05',code:'CYAN_NIGHT_COURIER',name:'청류 야간 전령',callSign:'NIGHT COURIER',roleLabel:'도심 침투 전령',file:'avatar-f05-cyan-night-courier-lobby-v1',accent:'#61d9ec',effectType:'COIN_GAIN_PERCENT',effectValue:6,sortOrder:50},
  {serial:'A-06',code:'AMBER_DUNE_CAPTAIN',name:'황야 포격대장',callSign:'DUNE CAPTAIN',roleLabel:'사막 포격 전술관',file:'avatar-f06-amber-dune-captain-lobby-v1',accent:'#e6ae5e',effectType:'SCRAPYARD_FREE_ENTRY',effectValue:1,sortOrder:60},
  {serial:'A-07',code:'ROSE_TEMPEST_DUELIST',name:'장미 폭풍 결투가',callSign:'ROSE TEMPEST',roleLabel:'폭풍 궁정 결투가',file:'avatar-f07-rose-tempest-duelist-lobby-v1',accent:'#ff7da6',effectType:'COIN_GAIN_PERCENT',effectValue:20,sortOrder:70},
  {serial:'A-08',code:'IRON_BASTION_WARDEN',name:'철벽 수호관',callSign:'IRON BASTION',roleLabel:'중장갑 방벽 지휘관',file:'avatar-m01-iron-bastion-warden-lobby-v1',accent:'#a9b6c3',effectType:'SCRAPYARD_FREE_ENTRY',effectValue:1,sortOrder:80},
  {serial:'A-09',code:'JADE_WIND_RANGER',name:'비취 바람 추적자',callSign:'JADE RANGER',roleLabel:'수림 정찰대장',file:'avatar-m02-jade-wind-ranger-lobby-v1',accent:'#78d39d',effectType:'BATTLE_POWER_PERCENT',effectValue:10,sortOrder:90},
  {serial:'A-10',code:'IVORY_ARCANE_ENGINEER',name:'상아빛 아케인 기술관',callSign:'ARCANE ENGINEER',roleLabel:'정밀 병기 기술관',file:'avatar-m03-ivory-arcane-engineer-lobby-v1',accent:'#d6c49d',effectType:'RAID_EXTRA_ENTRY',effectValue:1,sortOrder:100}
]);
const DIMWOOS_SEED=Object.freeze({serial:'A-11',code:'DIMWOOS_ESPORTS_ACE',name:'딤우스',callSign:'DIMWOOS',roleLabel:'e스포츠 에이스',file:'avatar-f08-ember-esports-ace-lobby-v1',accent:'#ff7a1a',effectType:'COIN_GAIN_PERCENT',effectValue:1,sortOrder:110});
const TERRAN_EMPRESS_JOEUN_SEED=Object.freeze({serial:'A-12',code:'TERRAN_EMPRESS_JOEUN',name:'테란여제 조은',callSign:'TERRAN EMPRESS',roleLabel:'테란 전장 여제',file:'avatar-f09-terran-empress-joeun-lobby-v1',accent:'#d6aa45',effectType:'COIN_GAIN_PERCENT',effectValue:1,sortOrder:120});

function cleanText(value,max=200){return String(value??'').replace(/[<>`]/g,'').trim().slice(0,max)}
function cleanBool(value,fallback=false){if(value===undefined||value===null)return fallback;return value===true||value===1||String(value)==='1'||String(value).toLowerCase()==='true'}
function cleanMode(value){const mode=String(value||'').trim().toUpperCase();return MODES.includes(mode)?mode:'OFF'}
function cleanAcquisition(value){const type=String(value||'').trim().toUpperCase();return ACQUISITION_TYPES.includes(type)?type:'UNSET'}
function cleanEffect(value){const type=String(value||'').trim().toUpperCase();return EFFECT_TYPES.includes(type)?type:''}
function cleanEffectValue(type,value){const n=Math.floor(Number(value)||0),max=type==='COIN_GAIN_PERCENT'?50:type==='BATTLE_POWER_PERCENT'?100:type==='RAID_EXTRA_ENTRY'?20:1;return Math.max(1,Math.min(max,n))}
function cleanPrice(value){if(value===null||value===undefined||String(value).trim()==='')return null;const n=Number(value);return Number.isSafeInteger(n)&&n>=0&&n<=MAX_SAFE_COIN?n:NaN}
function safeJson(value,fallback={}){try{const parsed=typeof value==='string'?JSON.parse(value):value;return parsed&&typeof parsed==='object'?parsed:fallback}catch{return fallback}}
function normalizeSettings(raw){const value=raw&&typeof raw==='object'?raw:{};return{mode:cleanMode(value.mode),shopEnabled:cleanBool(value.shopEnabled,false),version:Math.max(1,Math.floor(Number(value.version)||1))}}
function isOwner(user){return String(user?.role||'').trim().toUpperCase()==='OWNER'}
function rows(result){return result?.results||[]}
function descriptionFor(seed){return `${seed.name}의 외형과 전용 로비 일러스트를 적용하고 고유 아바타 효과를 활성화합니다.`}
function equipmentFileFor(seed){return `${seed.file.replace('-lobby-v1','-equipment-v1')}-640.webp`}

async function batchChunks(env,statements,size=25){for(let i=0;i<statements.length;i+=size)await env.DB.batch(statements.slice(i,i+size))}

function avatarSchemaStatements(env){
  const postgres=env.DB?.dialect==='postgres';
  const userIdType=postgres?'BIGINT':'INTEGER';
  const nowDefault=postgres?"to_char(timezone('UTC',CURRENT_TIMESTAMP),'YYYY-MM-DD HH24:MI:SS')":'CURRENT_TIMESTAMP';
  return[
    `CREATE TABLE IF NOT EXISTS avatar_catalog_v1(
      code TEXT PRIMARY KEY,serial TEXT NOT NULL UNIQUE,name TEXT NOT NULL,call_sign TEXT NOT NULL DEFAULT '',role_label TEXT NOT NULL DEFAULT '',description TEXT NOT NULL DEFAULT '',
      lobby_image TEXT NOT NULL DEFAULT '',lobby_mobile_image TEXT NOT NULL DEFAULT '',equipment_image TEXT NOT NULL DEFAULT '',accent TEXT NOT NULL DEFAULT '#82c7d7',
      acquisition_type TEXT NOT NULL DEFAULT 'UNSET',coin_price BIGINT,source_label TEXT NOT NULL DEFAULT '',source_detail TEXT NOT NULL DEFAULT '',
      effect_type TEXT NOT NULL,effect_value INTEGER NOT NULL DEFAULT 0,is_active INTEGER NOT NULL DEFAULT 0,is_public INTEGER NOT NULL DEFAULT 0,sale_enabled INTEGER NOT NULL DEFAULT 0,
      sort_order INTEGER NOT NULL DEFAULT 0,version INTEGER NOT NULL DEFAULT 1,created_at TEXT NOT NULL DEFAULT ${nowDefault},updated_at TEXT NOT NULL DEFAULT ${nowDefault})`,
    `CREATE TABLE IF NOT EXISTS avatar_user_ownership_v1(
      user_id ${userIdType} NOT NULL,avatar_code TEXT NOT NULL,source_type TEXT NOT NULL DEFAULT 'ADMIN',source_ref TEXT NOT NULL DEFAULT '',acquired_at TEXT NOT NULL DEFAULT ${nowDefault},expires_at TEXT,
      PRIMARY KEY(user_id,avatar_code))`,
    `CREATE TABLE IF NOT EXISTS avatar_user_loadout_v1(
      user_id ${userIdType} PRIMARY KEY,avatar_code TEXT NOT NULL,updated_at TEXT NOT NULL DEFAULT ${nowDefault})`,
    `CREATE TABLE IF NOT EXISTS avatar_purchase_receipts_v1(
      request_id TEXT NOT NULL,user_id ${userIdType} NOT NULL,avatar_code TEXT NOT NULL,coin_spent BIGINT NOT NULL DEFAULT 0,status TEXT NOT NULL DEFAULT 'PENDING',response_json TEXT,error_message TEXT,
      created_at TEXT NOT NULL DEFAULT ${nowDefault},updated_at TEXT NOT NULL DEFAULT ${nowDefault},PRIMARY KEY(request_id,user_id))`,
    'CREATE INDEX IF NOT EXISTS idx_avatar_ownership_user ON avatar_user_ownership_v1(user_id,acquired_at,avatar_code)',
    'CREATE INDEX IF NOT EXISTS idx_avatar_receipts_cleanup ON avatar_purchase_receipts_v1(status,updated_at,request_id)',
    'CREATE INDEX IF NOT EXISTS idx_avatar_catalog_public ON avatar_catalog_v1(is_active,is_public,sort_order,code)'
  ];
}

async function ensureAvatarOwnershipExpiry(env){
  if(ownershipExpiryPromise)return ownershipExpiryPromise;
  ownershipExpiryPromise=(async()=>{
    const marker=await env.DB.prepare('SELECT value FROM app_meta WHERE key=?').bind(OWNERSHIP_EXPIRY_KEY).first();
    if(marker?.value==='1')return;
    if(env.DB?.dialect==='postgres'&&typeof env.DB.execSchema==='function'){
      await env.DB.execSchema(['ALTER TABLE avatar_user_ownership_v1 ADD COLUMN IF NOT EXISTS expires_at TEXT']);
    }else{
      const info=await env.DB.prepare('PRAGMA table_info(avatar_user_ownership_v1)').all();
      if(!rows(info).some(column=>String(column.name||'').toLowerCase()==='expires_at'))await env.DB.prepare('ALTER TABLE avatar_user_ownership_v1 ADD COLUMN expires_at TEXT').run();
    }
    await env.DB.prepare('INSERT INTO app_meta(key,value,updated_at) VALUES(?,?,CURRENT_TIMESTAMP) ON CONFLICT(key) DO UPDATE SET value=excluded.value,updated_at=CURRENT_TIMESTAMP').bind(OWNERSHIP_EXPIRY_KEY,'1').run();
  })().catch(error=>{ownershipExpiryPromise=null;throw error});
  return ownershipExpiryPromise;
}

function avatarEffectSchemaStatements(env){
  const nowDefault=env.DB?.dialect==='postgres'?"to_char(timezone('UTC',CURRENT_TIMESTAMP),'YYYY-MM-DD HH24:MI:SS')":'CURRENT_TIMESTAMP';
  return[
    `CREATE TABLE IF NOT EXISTS avatar_effect_options_v1(
      avatar_code TEXT NOT NULL,option_order INTEGER NOT NULL,effect_type TEXT NOT NULL,effect_value INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL DEFAULT ${nowDefault},updated_at TEXT NOT NULL DEFAULT ${nowDefault},PRIMARY KEY(avatar_code,option_order))`,
    'CREATE INDEX IF NOT EXISTS idx_avatar_effect_options_code ON avatar_effect_options_v1(avatar_code,option_order)'
  ];
}

async function ensureAvatarEffectOptions(env){
  const marker=await env.DB.prepare('SELECT value FROM app_meta WHERE key=?').bind(EFFECT_OPTIONS_KEY).first();
  if(marker?.value==='1')return;
  // The v1863 marker may exist from a deployment where PostgreSQL skipped DDL.
  // Replaying idempotent base DDL once with this independent marker repairs
  // that state before the option migration touches the catalog.
  const schema=[...avatarSchemaStatements(env),...avatarEffectSchemaStatements(env)];
  if(env.DB?.dialect==='postgres'&&typeof env.DB.execSchema==='function')await env.DB.execSchema(schema);
  else await batchChunks(env,schema.map(sql=>env.DB.prepare(sql)));
  const equipmentBase='assets/ui/avatars-v1/equipment-v1/';
  await batchChunks(env,[
    ...SEEDS.map(seed=>env.DB.prepare("UPDATE avatar_catalog_v1 SET equipment_image=? WHERE code=? AND (equipment_image IS NULL OR equipment_image='')").bind(`${equipmentBase}${equipmentFileFor(seed)}`,seed.code)),
    env.DB.prepare(`INSERT INTO avatar_effect_options_v1(avatar_code,option_order,effect_type,effect_value)
      SELECT code,0,effect_type,effect_value FROM avatar_catalog_v1
      WHERE effect_type IS NOT NULL AND effect_type<>'' ON CONFLICT(avatar_code,option_order) DO NOTHING`),
    env.DB.prepare('INSERT INTO app_meta(key,value,updated_at) VALUES(?,?,CURRENT_TIMESTAMP) ON CONFLICT(key) DO UPDATE SET value=excluded.value,updated_at=CURRENT_TIMESTAMP').bind(EFFECT_OPTIONS_KEY,'1')
  ]);
}

async function ensureAvatarEquipmentAlphaV2(env){
  const marker=await env.DB.prepare('SELECT value FROM app_meta WHERE key=?').bind(EQUIPMENT_ALPHA_V2_KEY).first();
  if(marker?.value==='1')return;
  const equipmentBase='assets/ui/avatars-v1/equipment-v2/';
  await batchChunks(env,[
    ...SEEDS.map(seed=>env.DB.prepare('UPDATE avatar_catalog_v1 SET equipment_image=?,updated_at=CURRENT_TIMESTAMP WHERE code=?').bind(`${equipmentBase}${equipmentFileFor(seed)}`,seed.code)),
    env.DB.prepare('INSERT INTO app_meta(key,value,updated_at) VALUES(?,?,CURRENT_TIMESTAMP) ON CONFLICT(key) DO UPDATE SET value=excluded.value,updated_at=CURRENT_TIMESTAMP').bind(EQUIPMENT_ALPHA_V2_KEY,'1')
  ]);
}

async function ensureAvatarEquipmentAlphaV3(env){
  const marker=await env.DB.prepare('SELECT value FROM app_meta WHERE key=?').bind(EQUIPMENT_ALPHA_V3_KEY).first();
  if(marker?.value==='1')return;
  const equipmentBase='assets/ui/avatars-v1/equipment-v3/';
  await batchChunks(env,[
    ...SEEDS.map(seed=>env.DB.prepare('UPDATE avatar_catalog_v1 SET equipment_image=?,updated_at=CURRENT_TIMESTAMP WHERE code=?').bind(`${equipmentBase}${equipmentFileFor(seed)}`,seed.code)),
    env.DB.prepare('INSERT INTO app_meta(key,value,updated_at) VALUES(?,?,CURRENT_TIMESTAMP) ON CONFLICT(key) DO UPDATE SET value=excluded.value,updated_at=CURRENT_TIMESTAMP').bind(EQUIPMENT_ALPHA_V3_KEY,'1')
  ]);
}

async function ensureDimwoosAvatar(env){
  const marker=await env.DB.prepare('SELECT value FROM app_meta WHERE key=?').bind(DIMWOOS_AVATAR_KEY).first();
  if(marker?.value==='1')return;
  const seed=DIMWOOS_SEED,lobbyBase='assets/ui/avatars-v1/lobby-v1/',equipmentBase='assets/ui/avatars-v1/equipment-v3/';
  await env.DB.batch([
    env.DB.prepare(`INSERT INTO avatar_catalog_v1(
      code,serial,name,call_sign,role_label,description,lobby_image,lobby_mobile_image,equipment_image,accent,acquisition_type,coin_price,source_label,source_detail,effect_type,effect_value,is_active,is_public,sale_enabled,sort_order
    ) VALUES(?,?,?,?,?,?,?,?,?,?,'UNSET',NULL,?,?,?,?,0,0,0,?)
    ON CONFLICT(code) DO UPDATE SET serial=excluded.serial,name=excluded.name,call_sign=excluded.call_sign,role_label=excluded.role_label,
      description=excluded.description,lobby_image=excluded.lobby_image,lobby_mobile_image=excluded.lobby_mobile_image,
      equipment_image=excluded.equipment_image,accent=excluded.accent,updated_at=CURRENT_TIMESTAMP`).bind(
      seed.code,seed.serial,seed.name,seed.callSign,seed.roleLabel,descriptionFor(seed),`${lobbyBase}${seed.file}-1024.webp`,`${lobbyBase}${seed.file}-640.webp`,
      `${equipmentBase}${equipmentFileFor(seed)}`,seed.accent,'딤우스','딤우스 카드 원화 기반 아바타',seed.effectType,seed.effectValue,seed.sortOrder
    ),
    env.DB.prepare(`INSERT INTO avatar_effect_options_v1(avatar_code,option_order,effect_type,effect_value)
      VALUES(?,0,?,?) ON CONFLICT(avatar_code,option_order) DO NOTHING`).bind(seed.code,seed.effectType,seed.effectValue),
    env.DB.prepare('INSERT INTO app_meta(key,value,updated_at) VALUES(?,?,CURRENT_TIMESTAMP) ON CONFLICT(key) DO UPDATE SET value=excluded.value,updated_at=CURRENT_TIMESTAMP').bind(DIMWOOS_AVATAR_KEY,'1')
  ]);
}

async function ensureTerranEmpressJoeunAvatar(env){
  const marker=await env.DB.prepare('SELECT value FROM app_meta WHERE key=?').bind(TERRAN_EMPRESS_JOEUN_AVATAR_KEY).first();
  if(marker?.value==='1')return;
  const seed=TERRAN_EMPRESS_JOEUN_SEED,lobbyBase='assets/ui/avatars-v1/lobby-v1/',equipmentBase='assets/ui/avatars-v1/equipment-v3/';
  await env.DB.batch([
    env.DB.prepare(`INSERT INTO avatar_catalog_v1(
      code,serial,name,call_sign,role_label,description,lobby_image,lobby_mobile_image,equipment_image,accent,acquisition_type,coin_price,source_label,source_detail,effect_type,effect_value,is_active,is_public,sale_enabled,sort_order
    ) VALUES(?,?,?,?,?,?,?,?,?,?,'UNSET',NULL,?,?,?,?,0,0,0,?)
    ON CONFLICT(code) DO UPDATE SET serial=excluded.serial,name=excluded.name,call_sign=excluded.call_sign,role_label=excluded.role_label,
      description=excluded.description,lobby_image=excluded.lobby_image,lobby_mobile_image=excluded.lobby_mobile_image,
      equipment_image=excluded.equipment_image,accent=excluded.accent,updated_at=CURRENT_TIMESTAMP`).bind(
      seed.code,seed.serial,seed.name,seed.callSign,seed.roleLabel,descriptionFor(seed),`${lobbyBase}${seed.file}-1024.webp`,`${lobbyBase}${seed.file}-640.webp`,
      `${equipmentBase}${equipmentFileFor(seed)}`,seed.accent,'조은','사용자 확정 로비 일러스트 기반 신규 아바타',seed.effectType,seed.effectValue,seed.sortOrder
    ),
    env.DB.prepare(`INSERT INTO avatar_effect_options_v1(avatar_code,option_order,effect_type,effect_value)
      VALUES(?,0,?,?) ON CONFLICT(avatar_code,option_order) DO NOTHING`).bind(seed.code,seed.effectType,seed.effectValue),
    env.DB.prepare('INSERT INTO app_meta(key,value,updated_at) VALUES(?,?,CURRENT_TIMESTAMP) ON CONFLICT(key) DO UPDATE SET value=excluded.value,updated_at=CURRENT_TIMESTAMP').bind(TERRAN_EMPRESS_JOEUN_AVATAR_KEY,'1')
  ]);
}

export async function ensureAvatarFoundation(env){
  if(foundationPromise)return foundationPromise;
  foundationPromise=(async()=>{
    const marker=await env.DB.prepare('SELECT value FROM app_meta WHERE key=?').bind(FOUNDATION_KEY).first();
    if(marker?.value!=='1'){
      const schema=avatarSchemaStatements(env);
      // PostgreSQL 호환 계층은 일반 prepare()/batch()에서 DDL을 의도적으로
      // 건너뛴다. 고정 문자열만 허용하는 execSchema() 경로로 실제 relation을 만든다.
      if(env.DB?.dialect==='postgres'&&typeof env.DB.execSchema==='function')await env.DB.execSchema(schema);
      else await batchChunks(env,schema.map(sql=>env.DB.prepare(sql)));
      const base='assets/ui/avatars-v1/lobby-v1/';
      await batchChunks(env,SEEDS.map(seed=>env.DB.prepare(`INSERT INTO avatar_catalog_v1(
        code,serial,name,call_sign,role_label,description,lobby_image,lobby_mobile_image,equipment_image,accent,acquisition_type,coin_price,source_label,source_detail,effect_type,effect_value,is_active,is_public,sale_enabled,sort_order
      ) VALUES(?,?,?,?,?,?,?,?,?,?,'UNSET',NULL,'','',?,?,0,0,0,?) ON CONFLICT(code) DO NOTHING`).bind(
        seed.code,seed.serial,seed.name,seed.callSign,seed.roleLabel,descriptionFor(seed),`${base}${seed.file}-1024.webp`,`${base}${seed.file}-640.webp`,'',seed.accent,seed.effectType,seed.effectValue,seed.sortOrder
      )));
      await env.DB.batch([
        env.DB.prepare('INSERT INTO app_meta(key,value,updated_at) VALUES(?,?,CURRENT_TIMESTAMP) ON CONFLICT(key) DO NOTHING').bind(SETTINGS_KEY,JSON.stringify(SETTINGS_DEFAULT)),
        env.DB.prepare('INSERT INTO app_meta(key,value,updated_at) VALUES(?,?,CURRENT_TIMESTAMP) ON CONFLICT(key) DO UPDATE SET value=excluded.value,updated_at=CURRENT_TIMESTAMP').bind(FOUNDATION_KEY,'1')
      ]);
    }
    await ensureAvatarEffectOptions(env);
    await ensureAvatarEquipmentAlphaV2(env);
    await ensureAvatarEquipmentAlphaV3(env);
    await ensureDimwoosAvatar(env);
    await ensureTerranEmpressJoeunAvatar(env);
    await ensureAvatarOwnershipExpiry(env);
  })().catch(error=>{foundationPromise=null;throw error});
  return foundationPromise;
}

export async function avatarSettings(env,{fresh=false}={}){
  await ensureAvatarFoundation(env);
  const now=Date.now();
  if(!fresh&&settingsCache&&now-settingsCacheAt<30000)return settingsCache;
  const row=await env.DB.prepare('SELECT value FROM app_meta WHERE key=?').bind(SETTINGS_KEY).first();
  settingsCache=normalizeSettings(safeJson(row?.value,SETTINGS_DEFAULT));settingsCacheAt=now;
  return settingsCache;
}

export async function avatarFeatureAccess(env,user,{fresh=false}={}){
  const settings=await avatarSettings(env,{fresh}),owner=isOwner(user);
  const visible=settings.mode==='ON'||(settings.mode==='TEST'&&owner);
  return{mode:settings.mode,visible,ownerTest:settings.mode==='TEST'&&owner,shopEnabled:visible&&settings.shopEnabled,version:settings.version};
}

function normalizedEffects(row,effects){
  const raw=Array.isArray(effects)&&effects.length?effects:[{type:row?.effect_type,value:row?.effect_value}];
  const seen=new Set();
  return raw.map(option=>({type:cleanEffect(option?.type),value:cleanEffectValue(cleanEffect(option?.type),option?.value)}))
    .filter(option=>option.type&&!seen.has(option.type)&&seen.add(option.type)).slice(0,EFFECT_TYPES.length);
}

function publicAvatar(row,effects){
  const acquisitionType=cleanAcquisition(row.acquisition_type),coinPrice=cleanPrice(row.coin_price);
  const effectOptions=normalizedEffects(row,effects),effect=effectOptions[0]||{type:'',value:0};
  return{
    serial:String(row.serial||''),code:String(row.code||''),name:String(row.name||''),callSign:String(row.call_sign||''),role:String(row.role_label||''),description:String(row.description||''),
    lobbyImage:String(row.lobby_image||''),lobbyMobileImage:String(row.lobby_mobile_image||''),equipmentImage:String(row.equipment_image||''),accent:String(row.accent||'#82c7d7'),
    acquisitionType,coinPrice:Number.isFinite(coinPrice)?coinPrice:null,sourceLabel:String(row.source_label||''),sourceDetail:String(row.source_detail||''),
    effect,effects:effectOptions,owned:Boolean(Number(row.owned||0)),equipped:Boolean(Number(row.equipped||0)),expiresAt:row.expires_at||null,
    active:Boolean(Number(row.is_active||0)),public:Boolean(Number(row.is_public||0)),saleEnabled:Boolean(Number(row.sale_enabled||0)),sortOrder:Number(row.sort_order||0),version:Number(row.version||1)
  };
}

function publicAvatarsFromRows(input){
  const groups=new Map();
  for(const row of rows(input)){
    const code=String(row.code||'');if(!code)continue;
    if(!groups.has(code))groups.set(code,{row,effects:[]});
    const type=cleanEffect(row.option_effect_type);
    if(type)groups.get(code).effects.push({type,value:row.option_effect_value});
  }
  return[...groups.values()].map(group=>publicAvatar(group.row,group.effects));
}

function utcTimestampMs(value){
  let text=String(value||'').trim();if(!text)return 0;
  if(/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}(?:\.\d+)?$/.test(text))text=`${text.replace(' ','T')}Z`;
  const parsed=Date.parse(text);return Number.isFinite(parsed)?parsed:0;
}

function equipCooldown(updatedAt,now=Date.now()){
  const equippedAtMs=utcTimestampMs(updatedAt),nextMs=equippedAtMs?equippedAtMs+AVATAR_EQUIP_COOLDOWN_MS:0;
  const remainingMs=Math.max(0,nextMs-now);
  return{durationMs:AVATAR_EQUIP_COOLDOWN_MS,locked:remainingMs>0,remainingMs,nextEquipAt:nextMs?new Date(nextMs).toISOString():null};
}

async function catalogForUser(env,user){
  const result=await env.DB.prepare(`SELECT a.*,o.expires_at,CASE WHEN o.avatar_code IS NULL THEN 0 ELSE 1 END owned,CASE WHEN l.avatar_code=a.code AND o.avatar_code IS NOT NULL THEN 1 ELSE 0 END equipped,
    l.avatar_code equipped_code,l.updated_at loadout_updated_at,e.option_order,e.effect_type option_effect_type,e.effect_value option_effect_value
    FROM avatar_catalog_v1 a
    LEFT JOIN avatar_user_ownership_v1 o ON o.avatar_code=a.code AND o.user_id=? AND (o.expires_at IS NULL OR o.expires_at>CURRENT_TIMESTAMP)
    LEFT JOIN avatar_user_loadout_v1 l ON l.user_id=?
    LEFT JOIN avatar_effect_options_v1 e ON e.avatar_code=a.code
    WHERE a.is_active=1 AND a.is_public=1 ORDER BY a.sort_order,a.code`).bind(user.id,user.id).all();
  const first=rows(result)[0];
  return{avatars:publicAvatarsFromRows(result),equipCooldown:equipCooldown(first?.loadout_updated_at)};
}

function validRequestId(value){const text=String(value||'').trim();return text.length>=8&&text.length<=120&&/^[A-Za-z0-9:_-]+$/.test(text)?text:''}

async function purchaseAvatar(env,user,body){
  const access=await avatarFeatureAccess(env,user);if(!access.visible)return{error:'아바타 시스템은 현재 비공개 상태입니다.',code:'AVATAR_FEATURE_OFF',status:403};
  if(!access.shopEnabled)return{error:'아바타 상점은 현재 운영 준비 중입니다.',code:'AVATAR_SHOP_OFF',status:403};
  const avatarCode=cleanText(body.avatarCode,80).toUpperCase(),requestId=validRequestId(body.requestId);
  if(!requestId)return{error:'구매 요청 식별자가 올바르지 않습니다.',status:400};
  const prior=await env.DB.prepare('SELECT status,response_json,avatar_code,coin_spent FROM avatar_purchase_receipts_v1 WHERE request_id=? AND user_id=?').bind(requestId,user.id).first();
  if(prior?.status==='COMPLETED'){
    const saved=safeJson(prior.response_json,null);if(saved)return{data:saved};
    const balance=await env.DB.prepare('SELECT coin FROM users WHERE id=?').bind(user.id).first();
    return{data:{ok:true,avatarCode:String(prior.avatar_code),coinSpent:Number(prior.coin_spent||0),coin:Number(balance?.coin||0),recovered:true}};
  }
  if(prior)return{error:'같은 구매 요청이 아직 정리 중입니다. 잠시 후 다시 확인해 주세요.',code:'AVATAR_PURCHASE_PENDING',status:409};
  const item=await env.DB.prepare(`SELECT code,name,coin_price FROM avatar_catalog_v1 WHERE code=? AND is_active=1 AND is_public=1 AND sale_enabled=1 AND acquisition_type='COIN'`).bind(avatarCode).first();
  const price=cleanPrice(item?.coin_price);if(!item||!Number.isSafeInteger(price)||price<=0)return{error:'현재 코인으로 판매 중인 아바타가 아닙니다.',status:404};
  const batch=await env.DB.batch([
    env.DB.prepare(`INSERT INTO avatar_purchase_receipts_v1(request_id,user_id,avatar_code,coin_spent,status)
      SELECT ?,?,?,?,'PENDING' WHERE EXISTS(SELECT 1 FROM users WHERE id=? AND coin>=?)
      AND NOT EXISTS(SELECT 1 FROM avatar_user_ownership_v1 WHERE user_id=? AND avatar_code=? AND (expires_at IS NULL OR expires_at>CURRENT_TIMESTAMP))
      ON CONFLICT(request_id,user_id) DO NOTHING`).bind(requestId,user.id,avatarCode,price,user.id,price,user.id,avatarCode),
    env.DB.prepare(`UPDATE users SET coin=coin-? WHERE id=? AND coin>=? AND EXISTS(
      SELECT 1 FROM avatar_purchase_receipts_v1 WHERE request_id=? AND user_id=? AND status='PENDING')`).bind(price,user.id,price,requestId,user.id),
    env.DB.prepare(`INSERT INTO avatar_user_ownership_v1(user_id,avatar_code,source_type,source_ref,expires_at)
      SELECT ?,?,'COIN_SHOP',?,NULL WHERE EXISTS(SELECT 1 FROM avatar_purchase_receipts_v1 WHERE request_id=? AND user_id=? AND status='PENDING')
      ON CONFLICT(user_id,avatar_code) DO UPDATE SET source_type=excluded.source_type,source_ref=excluded.source_ref,acquired_at=CURRENT_TIMESTAMP,expires_at=NULL
      WHERE avatar_user_ownership_v1.expires_at IS NOT NULL AND avatar_user_ownership_v1.expires_at<=CURRENT_TIMESTAMP`).bind(user.id,avatarCode,requestId,requestId,user.id),
    env.DB.prepare(`UPDATE avatar_purchase_receipts_v1 SET status='COMPLETED',updated_at=CURRENT_TIMESTAMP WHERE request_id=? AND user_id=? AND status='PENDING'
      AND EXISTS(SELECT 1 FROM avatar_user_ownership_v1 WHERE user_id=? AND avatar_code=? AND (expires_at IS NULL OR expires_at>CURRENT_TIMESTAMP))`).bind(requestId,user.id,user.id,avatarCode),
    env.DB.prepare(`SELECT r.status,r.avatar_code,r.coin_spent,u.coin FROM avatar_purchase_receipts_v1 r JOIN users u ON u.id=r.user_id WHERE r.request_id=? AND r.user_id=?`).bind(requestId,user.id)
  ]);
  const result=batch.at(-1)?.results?.[0];
  if(result?.status!=='COMPLETED'){
    const owned=await env.DB.prepare('SELECT 1 owned FROM avatar_user_ownership_v1 WHERE user_id=? AND avatar_code=? AND (expires_at IS NULL OR expires_at>CURRENT_TIMESTAMP)').bind(user.id,avatarCode).first();
    return owned?{data:{ok:true,avatarCode,alreadyOwned:true,coin:Number(user.coin||0)}}:{error:'코인이 부족하거나 구매 조건이 변경되었습니다.',code:'AVATAR_PURCHASE_REJECTED',status:409};
  }
  const response={ok:true,avatarCode:String(result.avatar_code),coinSpent:Number(result.coin_spent||0),coin:Number(result.coin||0)};
  await env.DB.prepare('UPDATE avatar_purchase_receipts_v1 SET response_json=?,updated_at=CURRENT_TIMESTAMP WHERE request_id=? AND user_id=?').bind(JSON.stringify(response),requestId,user.id).run();
  return{data:response};
}

async function equipAvatar(env,user,body){
  const access=await avatarFeatureAccess(env,user);if(!access.visible)return{error:'아바타 시스템은 현재 비공개 상태입니다.',code:'AVATAR_FEATURE_OFF',status:403};
  const code=cleanText(body.avatarCode,80).toUpperCase();
  const owned=await env.DB.prepare(`SELECT a.code FROM avatar_user_ownership_v1 o JOIN avatar_catalog_v1 a ON a.code=o.avatar_code
    WHERE o.user_id=? AND a.code=? AND (o.expires_at IS NULL OR o.expires_at>CURRENT_TIMESTAMP) AND a.is_active=1 AND a.is_public=1`).bind(user.id,code).first();
  if(!owned)return{error:'보유 중인 공개 아바타를 찾을 수 없습니다.',status:404};
  const current=await env.DB.prepare('SELECT avatar_code,updated_at FROM avatar_user_loadout_v1 WHERE user_id=?').bind(user.id).first();
  if(String(current?.avatar_code||'')===code)return{data:{ok:true,equippedAvatarCode:code,unchanged:true,equipCooldown:equipCooldown(current.updated_at)}};
  const cooldown=equipCooldown(current?.updated_at);
  if(current&&cooldown.locked)return{error:'아바타는 교체 후 24시간 동안 다시 변경할 수 없습니다.',code:'AVATAR_EQUIP_COOLDOWN',status:409,...cooldown};
  let changed=0;
  if(current){
    const updated=await env.DB.prepare(`UPDATE avatar_user_loadout_v1 SET avatar_code=?,updated_at=CURRENT_TIMESTAMP
      WHERE user_id=? AND avatar_code=? AND updated_at=?`).bind(code,user.id,String(current.avatar_code),String(current.updated_at)).run();
    changed=Number(updated?.meta?.changes||0);
  }else{
    const inserted=await env.DB.prepare(`INSERT INTO avatar_user_loadout_v1(user_id,avatar_code,updated_at) VALUES(?,?,CURRENT_TIMESTAMP)
      ON CONFLICT(user_id) DO NOTHING`).bind(user.id,code).run();
    changed=Number(inserted?.meta?.changes||0);
  }
  const latest=await env.DB.prepare('SELECT avatar_code,updated_at FROM avatar_user_loadout_v1 WHERE user_id=?').bind(user.id).first();
  if(changed!==1&&String(latest?.avatar_code||'')!==code){
    const racedCooldown=equipCooldown(latest?.updated_at);
    return{error:'다른 아바타 교체 요청이 먼저 처리되었습니다. 24시간 후 다시 시도해 주세요.',code:'AVATAR_EQUIP_COOLDOWN',status:409,...racedCooldown};
  }
  return{data:{ok:true,equippedAvatarCode:code,equipCooldown:equipCooldown(latest?.updated_at)}};
}

export async function equippedAvatarEffect(env,userId){
  await ensureAvatarFoundation(env);
  const result=await env.DB.prepare(`SELECT a.code,a.name,a.call_sign,a.role_label,a.effect_type,a.effect_value,a.lobby_image,a.lobby_mobile_image,a.equipment_image,
    e.option_order,e.effect_type option_effect_type,e.effect_value option_effect_value
    FROM avatar_user_loadout_v1 l JOIN avatar_user_ownership_v1 o ON o.user_id=l.user_id AND o.avatar_code=l.avatar_code AND (o.expires_at IS NULL OR o.expires_at>CURRENT_TIMESTAMP)
    JOIN avatar_catalog_v1 a ON a.code=l.avatar_code LEFT JOIN avatar_effect_options_v1 e ON e.avatar_code=a.code
    WHERE l.user_id=? AND a.is_active=1 AND a.is_public=1 ORDER BY e.option_order`).bind(userId).all();
  const found=rows(result);if(!found.length)return null;
  const row=found[0],effects=normalizedEffects(row,found.map(option=>({type:option.option_effect_type,value:option.option_effect_value})));
  const first=effects[0]||{type:'',value:0};
  return{code:String(row.code),name:String(row.name||''),callSign:String(row.call_sign||''),role:String(row.role_label||''),type:first.type,value:first.value,effects,lobbyImage:String(row.lobby_image||''),lobbyMobileImage:String(row.lobby_mobile_image||''),equipmentImage:String(row.equipment_image||'')};
}

export function applyAvatarCoinGain(amount,equippedAvatar){
  const base=Math.max(0,Math.min(MAX_SAFE_COIN,Math.floor(Number(amount)||0)));
  const effects=Array.isArray(equippedAvatar?.effects)?equippedAvatar.effects:equippedAvatar?[{type:equippedAvatar.type,value:equippedAvatar.value}]:[];
  const coinEffect=effects.find(effect=>String(effect?.type||'').toUpperCase()==='COIN_GAIN_PERCENT');
  const percent=coinEffect?Math.max(0,Math.min(50,Math.floor(Number(coinEffect.value)||0))):0;
  const bonus=Math.min(MAX_SAFE_COIN-base,Math.floor(base*(percent/100)));
  return{base,percent,bonus,total:base+bonus};
}

export function applyAvatarRaidEntryBonus(limit,equippedAvatar){
  const base=Math.max(1,Math.min(99,Math.floor(Number(limit)||1)));
  const effects=Array.isArray(equippedAvatar?.effects)?equippedAvatar.effects:equippedAvatar?[{type:equippedAvatar.type,value:equippedAvatar.value}]:[];
  const raidEffect=effects.find(effect=>String(effect?.type||'').toUpperCase()==='RAID_EXTRA_ENTRY');
  const bonus=raidEffect?Math.max(0,Math.min(20,Math.floor(Number(raidEffect.value)||0))):0;
  return{base,bonus,limit:base+bonus};
}

export async function grantAvatarOwnership(env,{userId,avatarCode,sourceType='DROP',sourceRef='',expiresAt=null}){
  await ensureAvatarFoundation(env);const code=cleanText(avatarCode,80).toUpperCase();
  const expiresMs=expiresAt==null?NaN:Date.parse(String(expiresAt));
  const expiry=Number.isFinite(expiresMs)?new Date(expiresMs).toISOString().replace('T',' ').slice(0,19):null;
  const result=await env.DB.prepare(`INSERT INTO avatar_user_ownership_v1(user_id,avatar_code,source_type,source_ref,expires_at)
    SELECT ?,?,?,?,? WHERE EXISTS(SELECT 1 FROM avatar_catalog_v1 WHERE code=? AND is_active=1)
    ON CONFLICT(user_id,avatar_code) DO UPDATE SET source_type=excluded.source_type,source_ref=excluded.source_ref,acquired_at=CURRENT_TIMESTAMP,
      expires_at=CASE WHEN avatar_user_ownership_v1.expires_at IS NULL OR excluded.expires_at IS NULL THEN NULL
        WHEN avatar_user_ownership_v1.expires_at>excluded.expires_at THEN avatar_user_ownership_v1.expires_at ELSE excluded.expires_at END
    WHERE avatar_user_ownership_v1.expires_at IS NOT NULL`).bind(Number(userId),code,cleanText(sourceType,40).toUpperCase(),cleanText(sourceRef,160),expiry,code).run();
  return{granted:Number(result?.meta?.changes||0)>0,avatarCode:code,expiresAt:expiry};
}

async function adminPayload(env){
  const [settings,result]=await Promise.all([avatarSettings(env,{fresh:true}),env.DB.prepare(`SELECT a.*,e.option_order,e.effect_type option_effect_type,e.effect_value option_effect_value
    FROM avatar_catalog_v1 a LEFT JOIN avatar_effect_options_v1 e ON e.avatar_code=a.code ORDER BY a.sort_order,a.code,e.option_order`).all()]);
  return{settings,avatars:publicAvatarsFromRows(result),modes:MODES,acquisitionTypes:ACQUISITION_TYPES,effectTypes:EFFECT_TYPES};
}

async function adminAvatarByCode(env,code){
  const result=await env.DB.prepare(`SELECT a.*,e.option_order,e.effect_type option_effect_type,e.effect_value option_effect_value
    FROM avatar_catalog_v1 a LEFT JOIN avatar_effect_options_v1 e ON e.avatar_code=a.code WHERE a.code=? ORDER BY e.option_order`).bind(code).all();
  return publicAvatarsFromRows(result)[0]||null;
}

function cleanAdminEffects(body){
  const source=Array.isArray(body.effects)?body.effects:[{type:body.effectType,value:body.effectValue}];
  if(!source.length||source.length>EFFECT_TYPES.length)return{error:'아바타 효과는 1개 이상 4개 이하로 설정해 주세요.'};
  const seen=new Set(),effects=[];
  for(const option of source){
    const type=cleanEffect(option?.type);if(!type)return{error:'아바타 효과 유형이 올바르지 않습니다.'};
    if(seen.has(type))return{error:'같은 아바타 효과를 중복으로 등록할 수 없습니다.'};
    seen.add(type);effects.push({type,value:cleanEffectValue(type,option?.value)});
  }
  return{effects};
}

async function saveAdminConfig(env,admin,body,writeAdminLog){
  const before=await avatarSettings(env,{fresh:true}),mode=cleanMode(body.mode),shopEnabled=cleanBool(body.shopEnabled,false),next={mode,shopEnabled,version:before.version+1};
  if(shopEnabled&&mode!=='OFF'){
    const invalid=await env.DB.prepare(`SELECT COUNT(*) count FROM avatar_catalog_v1 WHERE is_active=1 AND is_public=1 AND sale_enabled=1
      AND (acquisition_type<>'COIN' OR coin_price IS NULL OR coin_price<=0)`).first();
    if(Number(invalid?.count||0)>0)return{error:'공개 판매 항목 중 가격 또는 획득 방식이 올바르지 않은 아바타가 있습니다.',status:409};
  }
  await env.DB.prepare('INSERT INTO app_meta(key,value,updated_at) VALUES(?,?,CURRENT_TIMESTAMP) ON CONFLICT(key) DO UPDATE SET value=excluded.value,updated_at=CURRENT_TIMESTAMP').bind(SETTINGS_KEY,JSON.stringify(next)).run();
  settingsCache=next;settingsCacheAt=Date.now();
  await writeAdminLog(env,admin,'AVATAR_CONFIG_SAVE','AVATAR_SYSTEM',SETTINGS_KEY,before,next);
  return{data:{ok:true,settings:next}};
}

async function saveAdminAvatar(env,admin,body,writeAdminLog){
  const code=cleanText(body.code,80).toUpperCase(),before=await adminAvatarByCode(env,code);if(!before)return{error:'아바타 데이터를 찾을 수 없습니다.',status:404};
  const expectedVersion=Math.max(1,Math.floor(Number(body.version)||0));if(expectedVersion!==Number(before.version||1))return{error:'다른 관리자가 먼저 수정했습니다. 새로고침 후 다시 저장해 주세요.',code:'AVATAR_VERSION_CONFLICT',status:409};
  const acquisitionType=cleanAcquisition(body.acquisitionType),coinPrice=cleanPrice(body.coinPrice),sourceLabel=cleanText(body.sourceLabel,80),sourceDetail=cleanText(body.sourceDetail,500),effectResult=cleanAdminEffects(body),isActive=cleanBool(body.active,false),isPublic=cleanBool(body.public,false),saleEnabled=cleanBool(body.saleEnabled,false),sortOrder=Math.max(0,Math.min(9999,Math.floor(Number(body.sortOrder)||0)));
  if(effectResult.error)return{error:effectResult.error,status:400};
  const effects=effectResult.effects,[firstEffect]=effects;
  if(Number.isNaN(coinPrice))return{error:'코인 가격은 0 이상 안전한 정수로 입력해 주세요.',status:400};
  if(saleEnabled&&(acquisitionType!=='COIN'||!Number.isSafeInteger(coinPrice)||coinPrice<=0))return{error:'판매 ON은 코인 획득 방식과 1코인 이상의 가격이 필요합니다.',status:400};
  if(isPublic&&!isActive)return{error:'공개하려면 먼저 아바타 사용 상태를 ON으로 설정해 주세요.',status:400};
  const updateToken=`${new Date().toISOString()}#${crypto.randomUUID()}`,nextVersion=expectedVersion+1;
  const batch=await env.DB.batch([
    env.DB.prepare(`UPDATE avatar_catalog_v1 SET acquisition_type=?,coin_price=?,source_label=?,source_detail=?,effect_type=?,effect_value=?,is_active=?,is_public=?,sale_enabled=?,sort_order=?,version=version+1,updated_at=? WHERE code=? AND version=?`).bind(acquisitionType,coinPrice,sourceLabel,sourceDetail,firstEffect.type,firstEffect.value,isActive?1:0,isPublic?1:0,saleEnabled?1:0,sortOrder,updateToken,code,expectedVersion),
    env.DB.prepare(`DELETE FROM avatar_effect_options_v1 WHERE avatar_code=? AND EXISTS(
      SELECT 1 FROM avatar_catalog_v1 WHERE code=? AND version=? AND updated_at=?)`).bind(code,code,nextVersion,updateToken),
    ...effects.map((effect,index)=>env.DB.prepare(`INSERT INTO avatar_effect_options_v1(avatar_code,option_order,effect_type,effect_value,updated_at)
      SELECT ?,?,?,?,? WHERE EXISTS(SELECT 1 FROM avatar_catalog_v1 WHERE code=? AND version=? AND updated_at=?)
      ON CONFLICT(avatar_code,option_order) DO UPDATE SET effect_type=excluded.effect_type,effect_value=excluded.effect_value,updated_at=excluded.updated_at`).bind(code,index,effect.type,effect.value,updateToken,code,nextVersion,updateToken))
  ]);
  if(Number(batch[0]?.meta?.changes||0)!==1)return{error:'아바타 설정이 동시에 변경되었습니다. 새로고침 후 다시 저장해 주세요.',code:'AVATAR_VERSION_CONFLICT',status:409};
  const after=await adminAvatarByCode(env,code);await writeAdminLog(env,admin,'AVATAR_CATALOG_SAVE','AVATAR',code,before,after);
  return{data:{ok:true,avatar:after}};
}

export async function handleAvatar({path,request,env,deps}){
  if(!path.startsWith('avatar/')&&!path.startsWith('admin/avatars'))return null;
  await ensureAvatarFoundation(env);
  const {authenticate,readBody,json,requirePermission,writeAdminLog}=deps;
  if(path==='admin/avatars'){
    const admin=await requirePermission(request,env,'SETTINGS');if(!admin)return json({error:'운영 설정 권한이 필요합니다.'},403);
    if(request.method==='GET')return json(await adminPayload(env));
    if(request.method==='POST'){
      const body=await readBody(request),action=String(body.action||'').trim().toUpperCase();
      const result=action==='SAVE_CONFIG'?await saveAdminConfig(env,admin,body,writeAdminLog):action==='SAVE_AVATAR'?await saveAdminAvatar(env,admin,body,writeAdminLog):{error:'지원하지 않는 아바타 관리 작업입니다.',status:400};
      return result.data?json(result.data):json({error:result.error,code:result.code},result.status||400);
    }
    return json({error:'지원하지 않는 요청 방식입니다.'},405);
  }
  const user=await authenticate(request,env);if(!user)return json({error:'로그인이 필요합니다.'},401);
  if(path==='avatar/catalog'&&request.method==='GET'){
    const access=await avatarFeatureAccess(env,user);if(!access.visible)return json({error:'아바타 시스템은 현재 비공개 상태입니다.',code:'AVATAR_FEATURE_OFF'},403);
    const catalog=await catalogForUser(env,user);
    return json({profile:{id:Number(user.id),nickname:String(user.nickname||''),role:String(user.role||'USER')},coin:Number(user.coin||0),access,avatars:catalog.avatars,equipCooldown:catalog.equipCooldown});
  }
  if(path==='avatar/purchase'&&request.method==='POST'){
    const result=await purchaseAvatar(env,user,await readBody(request));return result.data?json(result.data):json({error:result.error,code:result.code},result.status||400);
  }
  if(path==='avatar/equip'&&request.method==='POST'){
    const result=await equipAvatar(env,user,await readBody(request));
    return result.data?json(result.data):json({error:result.error,code:result.code,durationMs:result.durationMs,remainingMs:result.remainingMs,nextEquipAt:result.nextEquipAt},result.status||400);
  }
  return json({error:'지원하지 않는 아바타 요청입니다.'},405);
}
