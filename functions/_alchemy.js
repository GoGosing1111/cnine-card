import { ensureEquipmentFoundation } from './_equipment.js';

/* SOOPKETMON ALCHEMY V2
 *
 * Inputs are deliberately limited to unequipped equipment and duplicate
 * LIMITED/PRESTIGE/FUR/ZENITH cards. Reward quality is selected from the real
 * equipment/card value of the consumed materials. Rewards may be cards,
 * equipment, inventory items or one-time garage vehicles. One receipt stores
 * the whole operation; individual material logs are not generated.
 */
const FOUNDATION_KEY='safe_runtime_upgrade_v1973_alchemy_v1';
const QUALITY_UPGRADE_KEY='safe_runtime_upgrade_v1976_alchemy_quality_curve';
const SETTINGS_KEY='alchemy_settings_v1';
const TABLES=Object.freeze({
  runs:'alchemy_runs_v1',state:'alchemy_user_state_v1',pool:'alchemy_reward_pool_v1',
  inputs:'alchemy_input_items_v1',locks:'alchemy_asset_locks_v1',guards:'alchemy_guards_v1'
});
const MODES=new Set(['OFF','OWNER_TEST','PUBLIC']);
const ALCHEMY_MODES=new Set(['CHAOS','PRECISION']);
const INPUT_ASSET_TYPES=new Set(['CARD','EQUIPMENT']);
const REWARD_ASSET_TYPES=new Set(['CARD','EQUIPMENT','ITEM','VEHICLE']);
const ALCHEMY_CARD_INPUT_GRADES=new Set(['LIMITED','PRESTIGE','FUR','ZENITH']);
const HIGH_GRADE_CONFIRM=ALCHEMY_CARD_INPUT_GRADES;
const SAFE_CARD_REWARD_RARITIES=new Set(['C','U','R','SR','HR','UR','SSR','MA','LIMITED','PRESTIGE','FUR','ZENITH']);
const CARD_INPUT_BONUS=Object.freeze({LIMITED:120,PRESTIGE:180,FUR:240,ZENITH:320});
const EQUIPMENT_SCORE_RANGE=Object.freeze({min:25,max:250});
const PROTECTED_ITEM_PATTERN=/(?:TICKET|COIN|CURRENCY|EVENT|COUPON|REROLL|VEHICLE|GARAGE|BLACK_MIRACLE)/i;
const RARITY=Object.freeze({
  C:{rank:0,value:18,color:'#73827f'},NORMAL:{rank:0,value:18,color:'#73827f'},
  U:{rank:1,value:28,color:'#5edb90'},MAGIC:{rank:1,value:28,color:'#5edb90'},HIGH:{rank:1,value:28,color:'#5edb90'},
  R:{rank:2,value:42,color:'#54c9ff'},RARE:{rank:2,value:42,color:'#54c9ff'},
  SR:{rank:3,value:60,color:'#b37aff'},EPIC:{rank:3,value:60,color:'#b37aff'},SPECIAL:{rank:3,value:64,color:'#b37aff'},
  HR:{rank:4,value:82,color:'#f2c96d'},LEGENDARY:{rank:4,value:82,color:'#f2c96d'},PREMIUM:{rank:4,value:72,color:'#f2c96d'},
  UR:{rank:5,value:110,color:'#ff6e8f'},MYTHIC:{rank:5,value:110,color:'#ff6e8f'},
  SSR:{rank:6,value:145,color:'#80f2ff'},MA:{rank:7,value:185,color:'#8ee7ff'},LIMITED:{rank:8,value:230,color:'#ffd36f'},
  PRESTIGE:{rank:9,value:300,color:'#f2c56e'},FUR:{rank:9,value:300,color:'#ff707c'},ZENITH:{rank:10,value:390,color:'#6fe9dc'},
  SUPERSTAR:{rank:11,value:520,color:'#ffe16f'}
});
const DEFAULT_SETTINGS=Object.freeze({
  mode:'OWNER_TEST',version:2,
  requirements:{minSlots:3,maxSlots:5,minRare:0},
  stabilityMax:10,
  tiers:[
    {code:'DORMANT',name:'휴면',minValue:0,color:'#5d7672'},
    {code:'AWAKENED',name:'각성',minValue:260,color:'#62ded1'},
    {code:'OVERDRIVE',name:'과부하',minValue:520,color:'#dfb55d'},
    {code:'FORBIDDEN',name:'금단',minValue:820,color:'#f06e76'}
  ]
});
const DEFAULT_ITEM_REWARDS=Object.freeze([
  ['DORMANT_SUPPLY','DORMANT','EQUIPMENT_SUPPLY_BOX',1,50],
  ['DORMANT_MAGIC','DORMANT','MAGIC_CARD_PACK',1,35],
  ['DORMANT_CUBE','DORMANT','PREMIUM_CUBE',1,15],
  ['AWAKENED_MAGIC','AWAKENED','MAGIC_CARD_PACK',1,30],
  ['AWAKENED_CUBE','AWAKENED','PREMIUM_CUBE',1,50],
  ['AWAKENED_CORE','AWAKENED','STARLIGHT_ARMOR_CORE',1,20],
  ['OVERDRIVE_CUBE','OVERDRIVE','PREMIUM_CUBE',2,45],
  ['OVERDRIVE_CORE','OVERDRIVE','STARLIGHT_ARMOR_CORE',1,55],
  ['FORBIDDEN_CUBE','FORBIDDEN','PREMIUM_CUBE',3,35],
  ['FORBIDDEN_CORE','FORBIDDEN','STARLIGHT_ARMOR_CORE',2,65]
]);
let foundationPromise=null,settingsCache=null,settingsCacheAt=0;

const clean=(value,max=160)=>String(value??'').replace(/[<>`]/g,'').trim().slice(0,max);
const code=(value,max=100)=>clean(value,max).toUpperCase().replace(/[^A-Z0-9_:-]/g,'_').replace(/_+/g,'_');
const int=(value,min,max,fallback=min)=>{const n=Math.floor(Number(value));return Number.isFinite(n)?Math.max(min,Math.min(max,n)):fallback};
const number=(value,min,max,fallback=min)=>{const n=Number(value);return Number.isFinite(n)?Math.max(min,Math.min(max,n)):fallback};
const bool=value=>value===true||value===1||String(value).toLowerCase()==='true'||String(value)==='1';
const parse=(value,fallback={})=>{try{const result=typeof value==='string'?JSON.parse(value):value;return result&&typeof result==='object'?result:fallback}catch{return fallback}};
const list=result=>result?.results||[];
const isOwner=user=>String(user?.role||'').toUpperCase()==='OWNER';
const rarityMeta=value=>RARITY[code(value,30)]||RARITY.NORMAL;
const publicPath=value=>String(value||'').replace(/\\/g,'/');
const assetKey=(type,id)=>`${type}:${id}`;
const safeRequestId=value=>clean(value,120).replace(/[^A-Za-z0-9_:.\-]/g,'');
const CARD_STRENGTH_SQL=`COALESCE(c.base_power,0)+100*(COALESCE(cue.attack_percent,0)+COALESCE(cue.defense_percent,0)+COALESCE(cue.hp_percent,0)+COALESCE(cue.speed_percent,0)+ABS(COALESCE(cue.effect_value,0))*(COALESCE(cue.trigger_chance,100)/100.0)*(CASE WHEN COALESCE(cue.max_activations,1)>5 THEN 5 WHEN COALESCE(cue.max_activations,1)<1 THEN 1 ELSE COALESCE(cue.max_activations,1) END))`;

function normalizeSettings(raw){
  const value=raw&&typeof raw==='object'?raw:{},requirements=value.requirements||{};
  const minSlots=int(requirements.minSlots,3,5,3),maxSlots=int(requirements.maxSlots,minSlots,5,5);
  const tiers=(Array.isArray(value.tiers)?value.tiers:DEFAULT_SETTINGS.tiers).slice(0,8).map((tier,index)=>({
    code:code(tier.code,30)||`TIER_${index+1}`,name:clean(tier.name,30)||`단계 ${index+1}`,
    minValue:int(tier.minValue,0,1000000,index?100*index:0),color:/^#[0-9a-f]{6}$/i.test(String(tier.color||''))?String(tier.color):'#62ded1'
  })).sort((a,b)=>a.minValue-b.minValue);
  if(!tiers.length||tiers[0].minValue!==0)tiers.unshift({...DEFAULT_SETTINGS.tiers[0]});
  return{mode:MODES.has(code(value.mode,30))?code(value.mode,30):DEFAULT_SETTINGS.mode,version:int(value.version,1,1000000,1),requirements:{minSlots,maxSlots,minRare:0},stabilityMax:int(value.stabilityMax,1,100,10),tiers};
}

const clamp01=value=>Math.max(0,Math.min(1,Number(value)||0));
function normalizedPower(value,bounds={}){
  const power=Math.max(0,Number(value)||0),minimum=Math.max(0,Number(bounds.min)||0),maximum=Math.max(minimum,Number(bounds.max)||minimum);
  if(maximum<=minimum)return power>0?1:0;
  const low=Math.log1p(minimum),high=Math.log1p(maximum);
  return clamp01((Math.log1p(Math.max(minimum,power))-low)/Math.max(.000001,high-low));
}
export function materialScore(asset,bounds={}){
  const type=code(asset?.type,30);
  if(type==='CARD')return Number(CARD_INPUT_BONUS[code(asset?.rarity,30)]||0);
  if(type!=='EQUIPMENT')return 0;
  const ratio=normalizedPower(asset?.totalPower??asset?.total_power,bounds);
  return Math.round(EQUIPMENT_SCORE_RANGE.min+(EQUIPMENT_SCORE_RANGE.max-EQUIPMENT_SCORE_RANGE.min)*ratio);
}
export function cardEffectScore(asset={}){
  const stats=['attackPercent','defensePercent','hpPercent','speedPercent'].reduce((sum,key)=>sum+Math.max(0,Number(asset[key]??asset[key.replace(/[A-Z]/g,letter=>`_${letter.toLowerCase()}`)])||0),0);
  const effect=Math.abs(Number(asset.effectValue??asset.effect_value)||0),chance=clamp01(Number(asset.triggerChance??asset.trigger_chance??100)/100),activations=Math.max(1,Math.min(5,Number(asset.maxActivations??asset.max_activations)||1));
  return Math.round((stats+effect*chance*activations)*100)/100;
}
export function rewardAutoFactor(strengthPercent){
  const curve=Math.pow(clamp01(Number(strengthPercent)/100),1.35);
  return Math.round((1-.9*curve)*10000)/10000;
}
function strengthPercent(value,bounds={}){return Math.round(normalizedPower(value,bounds)*10000)/100}

function schemaStatements(env){
  const postgres=env.DB?.dialect==='postgres',userType=postgres?'BIGINT':'INTEGER',now=postgres?"to_char(timezone('UTC',CURRENT_TIMESTAMP),'YYYY-MM-DD HH24:MI:SS')":'CURRENT_TIMESTAMP';
  return[
    `CREATE TABLE IF NOT EXISTS ${TABLES.runs}(request_id TEXT NOT NULL,user_id ${userType} NOT NULL,alchemy_mode TEXT NOT NULL,total_value INTEGER NOT NULL DEFAULT 0,tier_code TEXT NOT NULL DEFAULT '',reward_id TEXT,status TEXT NOT NULL DEFAULT 'PENDING',input_json TEXT NOT NULL DEFAULT '[]',result_json TEXT,error_message TEXT,created_at TEXT NOT NULL DEFAULT ${now},updated_at TEXT NOT NULL DEFAULT ${now},PRIMARY KEY(request_id,user_id))`,
    `CREATE TABLE IF NOT EXISTS ${TABLES.state}(user_id ${userType} PRIMARY KEY,total_runs INTEGER NOT NULL DEFAULT 0,stability INTEGER NOT NULL DEFAULT 0,updated_at TEXT NOT NULL DEFAULT ${now})`,
    `CREATE TABLE IF NOT EXISTS ${TABLES.pool}(reward_id TEXT PRIMARY KEY,alchemy_mode TEXT NOT NULL DEFAULT 'ANY',tier_code TEXT NOT NULL,reward_type TEXT NOT NULL,reward_ref TEXT NOT NULL,quantity INTEGER NOT NULL DEFAULT 1,weight REAL NOT NULL DEFAULT 1,is_active INTEGER NOT NULL DEFAULT 1,sort_order INTEGER NOT NULL DEFAULT 0,created_at TEXT NOT NULL DEFAULT ${now},updated_at TEXT NOT NULL DEFAULT ${now})`,
    `CREATE TABLE IF NOT EXISTS ${TABLES.inputs}(item_code TEXT PRIMARY KEY,alchemy_value INTEGER NOT NULL DEFAULT 1,rarity_rank INTEGER NOT NULL DEFAULT 0,is_enabled INTEGER NOT NULL DEFAULT 0,updated_at TEXT NOT NULL DEFAULT ${now})`,
    `CREATE TABLE IF NOT EXISTS ${TABLES.locks}(user_id ${userType} NOT NULL,asset_type TEXT NOT NULL,asset_ref TEXT NOT NULL,created_at TEXT NOT NULL DEFAULT ${now},PRIMARY KEY(user_id,asset_type,asset_ref))`,
    `CREATE TABLE IF NOT EXISTS ${TABLES.guards}(guard_id TEXT PRIMARY KEY,user_id ${userType} NOT NULL,verified INTEGER NOT NULL DEFAULT 0,created_at TEXT NOT NULL DEFAULT ${now})`,
    `CREATE INDEX IF NOT EXISTS idx_alchemy_runs_user_v1973 ON ${TABLES.runs}(user_id,created_at DESC)`,
    `CREATE INDEX IF NOT EXISTS idx_alchemy_runs_cleanup_v1973 ON ${TABLES.runs}(status,updated_at,request_id)`,
    `CREATE INDEX IF NOT EXISTS idx_alchemy_pool_active_v1973 ON ${TABLES.pool}(is_active,tier_code,alchemy_mode,sort_order,reward_id)`,
    `CREATE INDEX IF NOT EXISTS idx_alchemy_guards_cleanup_v1973 ON ${TABLES.guards}(created_at)`
  ];
}

async function seedCatalogRewards(env){
  const [card,equipment,vehicles]=await Promise.all([
    env.DB.prepare(`SELECT id FROM cards_effective_v1210 WHERE is_active=1 AND UPPER(rarity) IN ('R','SR','HR','UR','SSR','MA') AND COALESCE(card_status,'PUBLIC') NOT IN ('RETIRE_PENDING','RETIRED') ORDER BY CASE UPPER(rarity) WHEN 'MA' THEN 1 WHEN 'SSR' THEN 2 WHEN 'UR' THEN 3 ELSE 4 END,updated_at DESC LIMIT 1`).first().catch(()=>null),
    env.DB.prepare(`SELECT id FROM character_equipment_items WHERE is_active=1 AND is_public=1 AND UPPER(slot)<>'BATTLE_SUIT' AND UPPER(rarity) IN ('RARE','EPIC','LEGENDARY','MYTHIC') ORDER BY CASE UPPER(rarity) WHEN 'MYTHIC' THEN 1 WHEN 'LEGENDARY' THEN 2 ELSE 3 END,sort_order,id LIMIT 1`).first().catch(()=>null),
    env.DB.prepare(`SELECT id,total_power FROM character_garage_items WHERE is_active=1 AND is_public=1 ORDER BY total_power,id`).all().catch(()=>({results:[]}))
  ]);
  const statements=[];
  if(card?.id)for(const [tier,weight] of [['AWAKENED',18],['OVERDRIVE',22],['FORBIDDEN',25]])statements.push(env.DB.prepare(`INSERT INTO ${TABLES.pool}(reward_id,alchemy_mode,tier_code,reward_type,reward_ref,quantity,weight,is_active,sort_order) VALUES(?, 'ANY',?,'CARD',?,1,?,1,70) ON CONFLICT(reward_id) DO NOTHING`).bind(`DEFAULT_CARD_${tier}`,tier,String(card.id),weight));
  if(equipment?.id)for(const [tier,weight] of [['DORMANT',15],['AWAKENED',20],['OVERDRIVE',24],['FORBIDDEN',28]])statements.push(env.DB.prepare(`INSERT INTO ${TABLES.pool}(reward_id,alchemy_mode,tier_code,reward_type,reward_ref,quantity,weight,is_active,sort_order) VALUES(?, 'ANY',?,'EQUIPMENT',?,1,?,1,80) ON CONFLICT(reward_id) DO NOTHING`).bind(`DEFAULT_EQUIPMENT_${tier}`,tier,String(equipment.id),weight));
  const garage=list(vehicles);
  if(garage.length){
    const picks=[
      ['AWAKENED',garage[Math.floor((garage.length-1)*.2)],2.4,86],
      ['OVERDRIVE',garage[Math.floor((garage.length-1)*.55)],1.25,87],
      ['FORBIDDEN',garage[garage.length-1],.55,88]
    ];
    for(const [tier,vehicle,weight,sortOrder] of picks){
      if(!vehicle?.id)continue;
      statements.push(env.DB.prepare(`INSERT INTO ${TABLES.pool}(reward_id,alchemy_mode,tier_code,reward_type,reward_ref,quantity,weight,is_active,sort_order) VALUES(?, 'ANY',?,'VEHICLE',?,1,?,1,?) ON CONFLICT(reward_id) DO NOTHING`).bind(`DEFAULT_VEHICLE_${tier}`,tier,String(vehicle.id),weight,sortOrder));
    }
  }
  if(statements.length)await env.DB.batch(statements);
}

export async function ensureAlchemyFoundation(env){
  if(foundationPromise)return foundationPromise;
  foundationPromise=(async()=>{
    await ensureEquipmentFoundation(env);
    const marker=await env.DB.prepare('SELECT value FROM app_meta WHERE key=?').bind(FOUNDATION_KEY).first();
    if(marker?.value!=='1'){
      const schema=schemaStatements(env);
      if(env.DB?.dialect==='postgres'&&typeof env.DB.execSchema==='function')await env.DB.execSchema(schema);else await env.DB.batch(schema.map(sql=>env.DB.prepare(sql)));
      const statements=[
        env.DB.prepare('INSERT INTO app_meta(key,value,updated_at) VALUES(?,?,CURRENT_TIMESTAMP) ON CONFLICT(key) DO NOTHING').bind(SETTINGS_KEY,JSON.stringify(DEFAULT_SETTINGS)),
        ...DEFAULT_ITEM_REWARDS.map(([id,tier,ref,quantity,weight],index)=>env.DB.prepare(`INSERT INTO ${TABLES.pool}(reward_id,alchemy_mode,tier_code,reward_type,reward_ref,quantity,weight,is_active,sort_order) VALUES(?,'ANY',?,'ITEM',?,?,?,1,?) ON CONFLICT(reward_id) DO NOTHING`).bind(id,tier,ref,quantity,weight,index*10)),
        env.DB.prepare('INSERT INTO app_meta(key,value,updated_at) VALUES(?,?,CURRENT_TIMESTAMP) ON CONFLICT(key) DO UPDATE SET value=excluded.value,updated_at=CURRENT_TIMESTAMP').bind(FOUNDATION_KEY,'1')
      ];
      await env.DB.batch(statements);
      await seedCatalogRewards(env);
    }
    const qualityMarker=await env.DB.prepare('SELECT value FROM app_meta WHERE key=?').bind(QUALITY_UPGRADE_KEY).first();
    if(qualityMarker?.value!=='1'){
      const current=await env.DB.prepare('SELECT value FROM app_meta WHERE key=?').bind(SETTINGS_KEY).first(),previous=parse(current?.value,DEFAULT_SETTINGS),migrated=normalizeSettings({...previous,version:Math.max(2,Number(previous?.version||1)+1),requirements:{...(previous?.requirements||{}),minRare:0},tiers:DEFAULT_SETTINGS.tiers});
      await env.DB.batch([
        env.DB.prepare(`UPDATE ${TABLES.inputs} SET is_enabled=0,updated_at=CURRENT_TIMESTAMP WHERE is_enabled<>0`),
        env.DB.prepare('INSERT INTO app_meta(key,value,updated_at) VALUES(?,?,CURRENT_TIMESTAMP) ON CONFLICT(key) DO UPDATE SET value=excluded.value,updated_at=CURRENT_TIMESTAMP').bind(SETTINGS_KEY,JSON.stringify(migrated))
      ]);
      settingsCache=migrated;settingsCacheAt=Date.now();
      await seedCatalogRewards(env);
      await env.DB.prepare('INSERT INTO app_meta(key,value,updated_at) VALUES(?,?,CURRENT_TIMESTAMP) ON CONFLICT(key) DO UPDATE SET value=excluded.value,updated_at=CURRENT_TIMESTAMP').bind(QUALITY_UPGRADE_KEY,'1').run();
    }
    await env.DB.batch([
      env.DB.prepare(`DELETE FROM ${TABLES.guards} WHERE created_at<datetime('now','-1 day')`),
      env.DB.prepare(`DELETE FROM ${TABLES.runs} WHERE status IN ('COMPLETED','FAILED') AND updated_at<datetime('now','-30 days')`)
    ]).catch(()=>null);
    return true;
  })().catch(error=>{foundationPromise=null;throw error});
  return foundationPromise;
}

export async function alchemySettings(env,{fresh=false}={}){
  await ensureAlchemyFoundation(env);const now=Date.now();
  if(!fresh&&settingsCache&&now-settingsCacheAt<30000)return settingsCache;
  const row=await env.DB.prepare('SELECT value FROM app_meta WHERE key=?').bind(SETTINGS_KEY).first();
  settingsCache=normalizeSettings(parse(row?.value,DEFAULT_SETTINGS));settingsCacheAt=now;return settingsCache;
}

export async function alchemyFeatureAccess(env,user,{fresh=false}={}){
  const settings=await alchemySettings(env,{fresh}),owner=isOwner(user),visible=settings.mode==='PUBLIC'||(settings.mode==='OWNER_TEST'&&owner);
  return{mode:settings.mode,visible,ownerTest:settings.mode==='OWNER_TEST'&&owner,version:settings.version};
}

function cardAsset(row){const rarity=code(row.rarity,30),meta=rarityMeta(rarity),value=materialScore({type:'CARD',rarity});return{type:'CARD',id:String(row.id),name:String(row.name||'카드'),member:String(row.member||''),rarity,rank:meta.rank,value,gradeBonus:value,available:Number(row.available||0),image:publicPath(row.image),color:meta.color,confirmRequired:true}}
function equipmentAsset(row,bounds){const rarity=code(row.rarity,30),meta=rarityMeta(rarity),totalPower=Math.max(0,Number(row.total_power||0)),value=materialScore({type:'EQUIPMENT',totalPower},bounds);return{type:'EQUIPMENT',id:String(row.id),name:String(row.name||'장비'),rarity,rank:meta.rank,value,totalPower,powerPercent:strengthPercent(totalPower,bounds),available:Number(row.available||0),enhancement:0,image:publicPath(row.image),color:meta.color}}

async function catalogStrengthBounds(env){
  const [equipment,vehicle,card]=await Promise.all([
    env.DB.prepare(`SELECT COALESCE(MIN(total_power),0) min,COALESCE(MAX(total_power),0) max FROM character_equipment_items WHERE is_active=1 AND is_public=1 AND UPPER(slot)<>'BATTLE_SUIT'`).first(),
    env.DB.prepare(`SELECT COALESCE(MIN(total_power),0) min,COALESCE(MAX(total_power),0) max FROM character_garage_items WHERE is_active=1 AND is_public=1`).first(),
    env.DB.prepare(`SELECT COALESCE(MIN(score),0) min,COALESCE(MAX(score),0) max FROM (SELECT ${CARD_STRENGTH_SQL} score FROM cards_effective_v1210 c LEFT JOIN card_unique_effects cue ON cue.card_id=c.id AND cue.is_active=1 WHERE c.is_active=1 AND UPPER(c.rarity)<>'SUPERSTAR' AND COALESCE(c.card_status,'PUBLIC') NOT IN ('RETIRE_PENDING','RETIRED')) q`).first()
  ]);
  return{EQUIPMENT:{min:Number(equipment?.min||0),max:Number(equipment?.max||0)},VEHICLE:{min:Number(vehicle?.min||0),max:Number(vehicle?.max||0)},CARD:{min:Number(card?.min||0),max:Number(card?.max||0)},ITEM:{min:0,max:RARITY.SUPERSTAR.value}};
}

async function rewardPool(env,{admin=false}={}){
  const [result,bounds]=await Promise.all([env.DB.prepare(`SELECT p.*,c.title card_name,c.rarity card_rarity,c.image_url card_image,c.base_power card_base_power,m.name card_member,
      COALESCE(cue.attack_percent,0) attack_percent,COALESCE(cue.defense_percent,0) defense_percent,COALESCE(cue.hp_percent,0) hp_percent,COALESCE(cue.speed_percent,0) speed_percent,COALESCE(cue.effect_value,0) effect_value,COALESCE(cue.trigger_chance,100) trigger_chance,COALESCE(cue.max_activations,1) max_activations,
      e.name equipment_name,e.rarity equipment_rarity,e.image_url equipment_image,e.slot equipment_slot,e.total_power equipment_total_power,
      i.name item_name,i.rarity item_rarity,i.image_url item_image,i.category item_category,
      v.name vehicle_name,v.rarity vehicle_rarity,v.image_url vehicle_image,v.total_power vehicle_total_power
    FROM ${TABLES.pool} p
    LEFT JOIN cards_effective_v1210 c ON p.reward_type='CARD' AND c.id=p.reward_ref AND c.is_active=1 AND COALESCE(c.card_status,'PUBLIC') NOT IN ('RETIRE_PENDING','RETIRED')
    LEFT JOIN members m ON m.id=c.member_id
    LEFT JOIN card_unique_effects cue ON cue.card_id=c.id AND cue.is_active=1
    LEFT JOIN character_equipment_items e ON p.reward_type='EQUIPMENT' AND CAST(e.id AS TEXT)=p.reward_ref AND e.is_active=1 AND e.is_public=1 AND UPPER(e.slot)<>'BATTLE_SUIT'
    LEFT JOIN inventory_items i ON p.reward_type='ITEM' AND i.code=p.reward_ref AND i.is_active=1
    LEFT JOIN character_garage_items v ON p.reward_type='VEHICLE' AND CAST(v.id AS TEXT)=p.reward_ref AND v.is_active=1 AND v.is_public=1
    WHERE ${admin?'1=1':'p.is_active=1'} ORDER BY p.sort_order,p.reward_id`).all(),catalogStrengthBounds(env)]);
  return list(result).map(row=>{
    const type=code(row.reward_type,30),valid=type==='CARD'?Boolean(row.card_name)&&SAFE_CARD_REWARD_RARITIES.has(code(row.card_rarity,30)):type==='EQUIPMENT'?Boolean(row.equipment_name):type==='ITEM'?Boolean(row.item_name)&&!PROTECTED_ITEM_PATTERN.test(String(row.reward_ref)):type==='VEHICLE'?Boolean(row.vehicle_name):false;
    const base=type==='CARD'?{name:row.card_name,rarity:row.card_rarity,image:row.card_image,member:row.card_member}:type==='EQUIPMENT'?{name:row.equipment_name,rarity:row.equipment_rarity,image:row.equipment_image}:type==='VEHICLE'?{name:row.vehicle_name,rarity:row.vehicle_rarity,image:row.vehicle_image}:{name:row.item_name,rarity:row.item_rarity,image:row.item_image};
    const meta=rarityMeta(base.rarity),uniqueEffectScore=type==='CARD'?cardEffectScore(row):0,totalPower=type==='EQUIPMENT'?Number(row.equipment_total_power||0):type==='VEHICLE'?Number(row.vehicle_total_power||0):0,basePower=type==='CARD'?Number(row.card_base_power||0):0;
    const strength=type==='CARD'?basePower+uniqueEffectScore*100:type==='ITEM'?meta.value:totalPower,percent=strengthPercent(strength,bounds[type]||{}),autoFactor=rewardAutoFactor(percent),manualWeight=Number(row.weight||0),effectiveWeight=Math.round(manualWeight*autoFactor*1000000)/1000000;
    return{rewardId:String(row.reward_id),mode:code(row.alchemy_mode,30),tierCode:code(row.tier_code,30),type,id:String(row.reward_ref),name:String(base.name||row.reward_ref),member:String(base.member||''),rarity:code(base.rarity,30),rank:meta.rank,image:publicPath(base.image),quantity:Number(row.quantity||1),weight:manualWeight,manualWeight,effectiveWeight,autoFactor,strengthPercent:percent,strengthScore:Math.round(strength*100)/100,totalPower,basePower,uniqueEffectScore,active:Boolean(Number(row.is_active||0)),sortOrder:Number(row.sort_order||0),valid,color:meta.color};
  }).filter(row=>admin||row.valid);
}

async function userState(env,user,settings){
  const [cards,equipment,current,pool,bounds,ownedVehicles]=await Promise.all([
    env.DB.prepare(`SELECT c.id,c.title name,m.name member,c.rarity,c.image_url image,COALESCE(uc.quantity,0)-1 available FROM user_cards uc JOIN cards_effective_v1210 c ON c.id=uc.card_id LEFT JOIN members m ON m.id=c.member_id LEFT JOIN ${TABLES.locks} l ON l.user_id=uc.user_id AND l.asset_type='CARD' AND l.asset_ref=uc.card_id WHERE uc.user_id=? AND COALESCE(uc.quantity,0)>1 AND c.is_active=1 AND UPPER(c.rarity) IN ('LIMITED','PRESTIGE','FUR','ZENITH') AND COALESCE(c.card_status,'PUBLIC') NOT IN ('RETIRE_PENDING','RETIRED') AND l.asset_ref IS NULL ORDER BY CASE UPPER(c.rarity) WHEN 'ZENITH' THEN 4 WHEN 'FUR' THEN 3 WHEN 'PRESTIGE' THEN 2 ELSE 1 END DESC,uc.quantity DESC,c.updated_at DESC`).bind(user.id).all(),
    env.DB.prepare(`SELECT CAST(e.id AS TEXT) id,e.name,e.rarity,e.image_url image,e.total_power,COUNT(x.id) available FROM user_equipment_instances x JOIN character_equipment_items e ON e.id=x.equipment_id LEFT JOIN user_equipment_loadout lo ON lo.instance_id=x.id LEFT JOIN ${TABLES.locks} l ON l.user_id=x.user_id AND l.asset_type='EQUIPMENT' AND l.asset_ref=CAST(e.id AS TEXT) WHERE x.user_id=? AND lo.instance_id IS NULL AND l.asset_ref IS NULL AND e.is_active=1 AND e.is_public=1 AND UPPER(e.slot)<>'BATTLE_SUIT' GROUP BY e.id,e.name,e.rarity,e.image_url,e.total_power HAVING COUNT(x.id)>0 ORDER BY e.total_power DESC,COUNT(x.id) DESC,e.sort_order,e.id`).bind(user.id).all(),
    env.DB.prepare(`SELECT total_runs,stability FROM ${TABLES.state} WHERE user_id=?`).bind(user.id).first(),
    rewardPool(env),
    catalogStrengthBounds(env),
    env.DB.prepare(`SELECT garage_id FROM user_garage_vehicles WHERE user_id=?`).bind(user.id).all()
  ]);
  return{profile:{id:Number(user.id),nickname:String(user.nickname||''),role:String(user.role||'USER')},totalRuns:Number(current?.total_runs||0),stability:Number(current?.stability||0),stabilityMax:settings.stabilityMax,requirements:settings.requirements,tiers:settings.tiers,scoring:{equipmentPowerBounds:bounds.EQUIPMENT,equipmentScoreRange:EQUIPMENT_SCORE_RANGE,cardGradeBonus:CARD_INPUT_BONUS,rewardCurve:{name:'BLACK_MIRACLE_INVERSE',minFactor:.1,maxFactor:1,exponent:1.35}},assets:[...list(cards).map(cardAsset),...list(equipment).map(row=>equipmentAsset(row,bounds.EQUIPMENT))],rewardPool:pool,ownedVehicleIds:list(ownedVehicles).map(row=>String(row.garage_id)),serverNow:new Date().toISOString()};
}

function tierForValue(settings,value){return [...settings.tiers].filter(tier=>Number(value)>=Number(tier.minValue)).pop()||settings.tiers[0]}
const rewardWeight=entry=>Number(entry?.effectiveWeight??entry?.weight)||0;
export function normalizedOdds(entries){const active=(entries||[]).filter(entry=>entry&&rewardWeight(entry)>0),total=active.reduce((sum,entry)=>sum+rewardWeight(entry),0);return total>0?active.map(entry=>({...entry,probability:rewardWeight(entry)/total*100})):[]}
export function weightedPick(entries,unit){const odds=normalizedOdds(entries);if(!odds.length)return null;let cursor=Math.max(0,Math.min(.9999999999999999,Number(unit)||0))*100;for(const entry of odds){cursor-=entry.probability;if(cursor<0)return entry}return odds.at(-1)}
function secureUnit(){const values=new Uint32Array(1);crypto.getRandomValues(values);return values[0]/4294967296}

function normalizeRequestedInputs(raw){
  if(!Array.isArray(raw))return[];
  return raw.slice(0,6).map(entry=>({type:code(entry?.type,30),id:clean(entry?.id,120)})).filter(entry=>INPUT_ASSET_TYPES.has(entry.type)&&entry.id);
}
function aggregateInputs(inputs){const map=new Map();for(const entry of inputs){const key=assetKey(entry.type,entry.id),current=map.get(key)||{...entry,quantity:0};current.quantity+=1;map.set(key,current)}return[...map.values()]}

async function selectedEquipmentInstances(env,userId,aggregates){
  const map=new Map();
  for(const entry of aggregates.filter(row=>row.type==='EQUIPMENT')){
    const id=int(entry.id,1,2147483647,0);if(!id)continue;
    const result=await env.DB.prepare(`SELECT x.id FROM user_equipment_instances x LEFT JOIN user_equipment_loadout lo ON lo.instance_id=x.id LEFT JOIN ${TABLES.locks} l ON l.user_id=x.user_id AND l.asset_type='EQUIPMENT' AND l.asset_ref=CAST(x.equipment_id AS TEXT) WHERE x.user_id=? AND x.equipment_id=? AND lo.instance_id IS NULL AND l.asset_ref IS NULL ORDER BY x.id LIMIT ?`).bind(userId,id,entry.quantity).all();
    map.set(entry.id,list(result).map(row=>Number(row.id)));
  }
  return map;
}

function candidateRewards(state,tier,mode,inputs){
  const keys=new Set(inputs.map(entry=>assetKey(entry.type,entry.id))),ownedVehicles=new Set((state.ownedVehicleIds||[]).map(String)),base=(state.rewardPool||[]).filter(row=>row.valid!==false&&row.active!==false&&row.tierCode===tier.code&&(row.mode==='ANY'||row.mode===mode)&&!keys.has(assetKey(row.type,row.id))&&!(row.type==='VEHICLE'&&ownedVehicles.has(String(row.id)))&&rewardWeight(row)>0);
  if(mode!=='PRECISION')return base;
  const type=inputs[0]?.type,matched=base.filter(row=>row.type===type||(type==='EQUIPMENT'&&row.type==='VEHICLE'));return matched.length?matched:base;
}

async function transmute(env,user,body){
  const settings=await alchemySettings(env),access=await alchemyFeatureAccess(env,user);if(!access.visible)throw Object.assign(new Error('연금술은 현재 비공개 상태입니다.'),{status:403,code:'ALCHEMY_FEATURE_OFF'});
  const requestId=safeRequestId(body.requestId);if(!requestId)throw Object.assign(new Error('연금술 요청번호가 없습니다.'),{status:400});
  const prior=await env.DB.prepare(`SELECT status,result_json,error_message FROM ${TABLES.runs} WHERE request_id=? AND user_id=?`).bind(requestId,user.id).first();
  if(prior?.status==='COMPLETED'){const result=parse(prior.result_json,{});return{...result,replayed:true,state:await userState(env,user,settings)}}
  if(prior?.status==='PENDING')throw Object.assign(new Error('같은 연금술 요청을 처리 중입니다. 잠시 후 같은 요청으로 다시 확인하세요.'),{status:409,code:'ALCHEMY_PENDING'});
  if(prior?.status==='FAILED')throw Object.assign(new Error(prior.error_message||'이전 연금술 요청이 취소되었습니다.'),{status:409,code:'ALCHEMY_FAILED'});
  const mode=ALCHEMY_MODES.has(code(body.mode,30))?code(body.mode,30):'CHAOS',inputs=normalizeRequestedInputs(body.inputs),rules=settings.requirements;
  if(inputs.length<rules.minSlots||inputs.length>rules.maxSlots)throw Object.assign(new Error(`연금 재료는 ${rules.minSlots}개 이상 ${rules.maxSlots}개 이하로 선택하세요.`),{status:400});
  if(mode==='PRECISION'&&new Set(inputs.map(entry=>entry.type)).size!==1)throw Object.assign(new Error('정밀 연성은 같은 종류의 재료만 사용할 수 있습니다.'),{status:400});
  const snapshot=await userState(env,user,settings),aggregates=aggregateInputs(inputs),selected=[];
  for(const entry of inputs){const row=snapshot.assets.find(asset=>asset.type===entry.type&&String(asset.id)===String(entry.id));if(!row)throw Object.assign(new Error('사용할 수 없거나 보호된 재료가 포함되어 있습니다.'),{status:409});selected.push(row)}
  for(const entry of aggregates){const row=snapshot.assets.find(asset=>asset.type===entry.type&&String(asset.id)===String(entry.id));if(Number(row?.available||0)<entry.quantity)throw Object.assign(new Error(`${row?.name||entry.id}의 사용 가능 수량이 변경되었습니다.`),{status:409})}
  const highGrade=selected.filter(row=>row.type==='CARD'&&HIGH_GRADE_CONFIRM.has(code(row.rarity,30)));if(highGrade.length&&!bool(body.confirmedHighGrade))throw Object.assign(new Error('고등급 중복 카드 소모 재확인이 필요합니다.'),{status:400,code:'ALCHEMY_HIGH_GRADE_CONFIRM_REQUIRED'});
  const totalValue=selected.reduce((sum,row)=>sum+Number(row.value||0),0),guaranteed=Number(snapshot.stability||0)+1>=settings.stabilityMax,tier=guaranteed?settings.tiers.at(-1):tierForValue(settings,totalValue),candidates=candidateRewards(snapshot,tier,mode,inputs),reward=weightedPick(candidates,secureUnit());
  if(!reward)throw Object.assign(new Error('현재 조합에 지급 가능한 CMS 보상 풀이 없습니다.'),{status:409,code:'ALCHEMY_REWARD_POOL_EMPTY'});
  const inserted=await env.DB.prepare(`INSERT INTO ${TABLES.runs}(request_id,user_id,alchemy_mode,total_value,tier_code,reward_id,status,input_json) VALUES(?,?,?,?,?,?,'PENDING',?) ON CONFLICT(request_id,user_id) DO NOTHING`).bind(requestId,user.id,mode,totalValue,tier.code,reward.rewardId,JSON.stringify(inputs)).run();
  if(Number(inserted?.meta?.changes||0)!==1)throw Object.assign(new Error('같은 연금술 요청을 처리 중입니다.'),{status:409,code:'ALCHEMY_PENDING'});
  const equipmentIds=await selectedEquipmentInstances(env,user.id,aggregates),conditions=[],conditionBinds=[];
  for(const entry of aggregates){
    if(entry.type==='CARD'){conditions.push(`EXISTS(SELECT 1 FROM user_cards uc JOIN cards_effective_v1210 c ON c.id=uc.card_id LEFT JOIN ${TABLES.locks} l ON l.user_id=uc.user_id AND l.asset_type='CARD' AND l.asset_ref=uc.card_id WHERE uc.user_id=? AND uc.card_id=? AND uc.quantity>=? AND c.is_active=1 AND UPPER(c.rarity) IN ('LIMITED','PRESTIGE','FUR','ZENITH') AND COALESCE(c.card_status,'PUBLIC') NOT IN ('RETIRE_PENDING','RETIRED') AND l.asset_ref IS NULL)`);conditionBinds.push(user.id,entry.id,entry.quantity+1)}
    else{
      const ids=equipmentIds.get(entry.id)||[];if(ids.length!==entry.quantity)conditions.push('1=0');else{conditions.push(`(SELECT COUNT(*) FROM user_equipment_instances x LEFT JOIN user_equipment_loadout lo ON lo.instance_id=x.id LEFT JOIN ${TABLES.locks} l ON l.user_id=x.user_id AND l.asset_type='EQUIPMENT' AND l.asset_ref=CAST(x.equipment_id AS TEXT) WHERE x.user_id=? AND x.equipment_id=? AND x.id IN (${ids.map(()=>'?').join(',')}) AND lo.instance_id IS NULL AND l.asset_ref IS NULL)=?`);conditionBinds.push(user.id,int(entry.id,1,2147483647,0),...ids,entry.quantity)}
    }
  }
  conditions.push(`COALESCE((SELECT total_runs FROM ${TABLES.state} WHERE user_id=?),0)=?`,`COALESCE((SELECT stability FROM ${TABLES.state} WHERE user_id=?),0)=?`,`EXISTS(SELECT 1 FROM ${TABLES.pool} WHERE reward_id=? AND is_active=1 AND weight>0)`);conditionBinds.push(user.id,snapshot.totalRuns,user.id,snapshot.stability,reward.rewardId);
  if(reward.type==='VEHICLE'){conditions.push(`NOT EXISTS(SELECT 1 FROM user_garage_vehicles WHERE user_id=? AND garage_id=CAST(? AS INTEGER))`);conditionBinds.push(user.id,reward.id)}
  const guardId=`ALCHEMY:${user.id}:${requestId}`,nextStability=guaranteed?0:Math.min(settings.stabilityMax,Number(snapshot.stability||0)+1),result={ok:true,requestId,mode,totalValue,tier,guaranteed,reward:{type:reward.type,id:reward.id,name:reward.name,member:reward.member,rarity:reward.rarity,image:reward.image,quantity:reward.quantity},stability:nextStability};
  const verified=`EXISTS(SELECT 1 FROM ${TABLES.guards} WHERE guard_id=? AND verified=1)`,statements=[env.DB.prepare(`INSERT INTO ${TABLES.guards}(guard_id,user_id,verified) SELECT ?,?,CASE WHEN ${conditions.join(' AND ')} THEN 1 ELSE 0 END`).bind(guardId,user.id,...conditionBinds)];
  for(const entry of aggregates){
    if(entry.type==='CARD')statements.push(env.DB.prepare(`UPDATE user_cards SET quantity=quantity-?,last_obtained_at=CURRENT_TIMESTAMP WHERE user_id=? AND card_id=? AND quantity>=? AND ${verified}`).bind(entry.quantity,user.id,entry.id,entry.quantity+1,guardId));
    else{const ids=equipmentIds.get(entry.id)||[];statements.push(env.DB.prepare(`DELETE FROM user_equipment_instances WHERE user_id=? AND id IN (${ids.map(()=>'?').join(',')}) AND ${verified}`).bind(user.id,...ids,guardId))}
  }
  if(reward.type==='CARD')statements.push(env.DB.prepare(`INSERT INTO user_cards(user_id,card_id,quantity,breakthrough_level) SELECT ?,?,?,0 WHERE ${verified} ON CONFLICT(user_id,card_id) DO UPDATE SET quantity=user_cards.quantity+excluded.quantity,last_obtained_at=CURRENT_TIMESTAMP`).bind(user.id,reward.id,reward.quantity,guardId));
  else if(reward.type==='ITEM')statements.push(env.DB.prepare(`INSERT INTO cnine_user_inventory(user_id,item_code,quantity,unseen_quantity,created_at,updated_at) SELECT ?,?,?,?,CURRENT_TIMESTAMP,CURRENT_TIMESTAMP WHERE ${verified} ON CONFLICT(user_id,item_code) DO UPDATE SET quantity=cnine_user_inventory.quantity+excluded.quantity,unseen_quantity=cnine_user_inventory.unseen_quantity+excluded.unseen_quantity,updated_at=CURRENT_TIMESTAMP`).bind(user.id,reward.id,reward.quantity,reward.quantity,guardId));
  else if(reward.type==='VEHICLE')statements.push(env.DB.prepare(`INSERT INTO user_garage_vehicles(user_id,garage_id,source_type,source_id) SELECT ?,CAST(? AS INTEGER),'ALCHEMY',? WHERE ${verified} ON CONFLICT(user_id,garage_id) DO NOTHING`).bind(user.id,reward.id,requestId,guardId));
  else for(let index=0;index<reward.quantity;index+=1)statements.push(env.DB.prepare(`INSERT INTO user_equipment_instances(user_id,equipment_id,source_type,source_id,request_id) SELECT ?,CAST(? AS INTEGER),'ALCHEMY',?,? WHERE ${verified}`).bind(user.id,reward.id,requestId,`${requestId}:${index+1}`,guardId));
  statements.push(
    env.DB.prepare(`INSERT INTO ${TABLES.state}(user_id,total_runs,stability,updated_at) SELECT ?,1,?,CURRENT_TIMESTAMP WHERE ${verified} ON CONFLICT(user_id) DO UPDATE SET total_runs=${TABLES.state}.total_runs+1,stability=excluded.stability,updated_at=CURRENT_TIMESTAMP`).bind(user.id,nextStability,guardId),
    env.DB.prepare(`UPDATE ${TABLES.runs} SET status='COMPLETED',result_json=?,updated_at=CURRENT_TIMESTAMP WHERE request_id=? AND user_id=? AND ${verified}`).bind(JSON.stringify(result),requestId,user.id,guardId)
  );
  try{
    await env.DB.batch(statements);const guard=await env.DB.prepare(`SELECT verified FROM ${TABLES.guards} WHERE guard_id=?`).bind(guardId).first();await env.DB.prepare(`DELETE FROM ${TABLES.guards} WHERE guard_id=?`).bind(guardId).run();
    if(Number(guard?.verified)!==1)throw new Error('보유 자산이 변경되어 연금술이 취소되었습니다. 재료를 다시 확인하세요.');
    return{...result,state:await userState(env,user,settings)};
  }catch(error){
    await env.DB.prepare(`UPDATE ${TABLES.runs} SET status='FAILED',error_message=?,updated_at=CURRENT_TIMESTAMP WHERE request_id=? AND user_id=? AND status='PENDING'`).bind(clean(error?.message||'연금술 트랜잭션 실패',300),requestId,user.id).run().catch(()=>null);
    await env.DB.prepare(`DELETE FROM ${TABLES.guards} WHERE guard_id=?`).bind(guardId).run().catch(()=>null);throw error;
  }
}

async function adminSnapshot(env){
  const settings=await alchemySettings(env,{fresh:true});
  const [pool,cards,equipment,items,vehicles,runs,bounds]=await Promise.all([
    rewardPool(env,{admin:true}),
    env.DB.prepare(`SELECT c.id,c.title name,c.rarity,c.image_url image,c.base_power,m.name member,COALESCE(cue.attack_percent,0) attack_percent,COALESCE(cue.defense_percent,0) defense_percent,COALESCE(cue.hp_percent,0) hp_percent,COALESCE(cue.speed_percent,0) speed_percent,COALESCE(cue.effect_value,0) effect_value,COALESCE(cue.trigger_chance,100) trigger_chance,COALESCE(cue.max_activations,1) max_activations FROM cards_effective_v1210 c LEFT JOIN members m ON m.id=c.member_id LEFT JOIN card_unique_effects cue ON cue.card_id=c.id AND cue.is_active=1 WHERE c.is_active=1 AND UPPER(c.rarity)<>'SUPERSTAR' AND COALESCE(c.card_status,'PUBLIC') NOT IN ('RETIRE_PENDING','RETIRED') ORDER BY c.base_power DESC,c.rarity,c.title LIMIT 600`).all(),
    env.DB.prepare(`SELECT CAST(id AS TEXT) id,name,rarity,image_url image,total_power,pve_power,pvp_power FROM character_equipment_items WHERE is_active=1 AND is_public=1 AND UPPER(slot)<>'BATTLE_SUIT' ORDER BY total_power DESC,name LIMIT 600`).all(),
    env.DB.prepare(`SELECT code id,name,rarity,category,image_url image FROM inventory_items WHERE is_active=1 AND UPPER(category) NOT LIKE '%VEHICLE%' AND UPPER(code) NOT LIKE 'VEHICLE_%' AND UPPER(code) NOT LIKE '%BLACK_MIRACLE%' ORDER BY category,name LIMIT 300`).all(),
    env.DB.prepare(`SELECT CAST(id AS TEXT) id,name,rarity,image_url image,total_power,pve_power,pvp_power FROM character_garage_items WHERE is_active=1 AND is_public=1 ORDER BY total_power DESC,name LIMIT 600`).all(),
    env.DB.prepare(`SELECT r.request_id,r.user_id,u.nickname,r.alchemy_mode,r.total_value,r.tier_code,r.status,r.error_message,r.created_at,r.updated_at FROM ${TABLES.runs} r LEFT JOIN users u ON u.id=r.user_id ORDER BY r.created_at DESC LIMIT 80`).all(),
    catalogStrengthBounds(env)
  ]);
  const cardCatalog=list(cards).filter(row=>SAFE_CARD_REWARD_RARITIES.has(code(row.rarity,30))).map(row=>{const uniqueEffectScore=cardEffectScore(row),strengthScore=Number(row.base_power||0)+uniqueEffectScore*100;return{...row,basePower:Number(row.base_power||0),uniqueEffectScore,strengthScore:Math.round(strengthScore*100)/100,strengthPercent:strengthPercent(strengthScore,bounds.CARD)}}),equipmentCatalog=list(equipment).map(row=>({...row,totalPower:Number(row.total_power||0),strengthPercent:strengthPercent(row.total_power,bounds.EQUIPMENT)})),vehicleCatalog=list(vehicles).map(row=>({...row,totalPower:Number(row.total_power||0),strengthPercent:strengthPercent(row.total_power,bounds.VEHICLE)}));
  return{settings,rewardPool:pool,inputItems:[],scoring:{equipmentPowerBounds:bounds.EQUIPMENT,equipmentScoreRange:EQUIPMENT_SCORE_RANGE,cardGradeBonus:CARD_INPUT_BONUS,rewardCurve:{name:'BLACK_MIRACLE_INVERSE',minFactor:.1,maxFactor:1,exponent:1.35}},catalog:{CARD:cardCatalog,EQUIPMENT:equipmentCatalog,ITEM:list(items).filter(row=>!PROTECTED_ITEM_PATTERN.test(String(row.id))),VEHICLE:vehicleCatalog},recentRuns:list(runs)};
}

async function saveSettings(env,admin,body,deps){
  const before=await alchemySettings(env,{fresh:true}),next=normalizeSettings({...before,...body.settings,mode:body.settings?.mode??body.mode,version:before.version+1});
  await env.DB.prepare('INSERT INTO app_meta(key,value,updated_at) VALUES(?,?,CURRENT_TIMESTAMP) ON CONFLICT(key) DO UPDATE SET value=excluded.value,updated_at=CURRENT_TIMESTAMP').bind(SETTINGS_KEY,JSON.stringify(next)).run();settingsCache=next;settingsCacheAt=Date.now();
  if(deps.writeAdminLog)await deps.writeAdminLog(env,admin,'ALCHEMY_SETTINGS_SAVE','ALCHEMY',SETTINGS_KEY,before,next);return next;
}

async function saveInputItem(env,admin,body,deps){
  void env;void admin;void body;void deps;
  throw new Error('일반 아이템 재료는 영구 차단되었습니다. 연금 재료는 미장착 장비와 LIMITED·PRESTIGE·FUR·ZENITH 중복 카드만 사용할 수 있습니다.');
}

async function saveReward(env,admin,body,deps){
  const raw=body.reward||body,type=code(raw.type||raw.rewardType,30),ref=type==='EQUIPMENT'||type==='VEHICLE'?String(int(raw.id||raw.ref||raw.rewardRef,1,2147483647,0)):type==='CARD'?clean(raw.id||raw.ref||raw.rewardRef,120):code(raw.id||raw.ref||raw.rewardRef,100),tier=code(raw.tierCode,30),mode=code(raw.mode||'ANY',30),settings=await alchemySettings(env);
  if(!REWARD_ASSET_TYPES.has(type)||!ref||!settings.tiers.some(row=>row.code===tier)||!['ANY','CHAOS','PRECISION'].includes(mode))throw new Error('보상 유형·대상·연성 단계·모드를 확인하세요.');
  if(type==='ITEM'&&PROTECTED_ITEM_PATTERN.test(ref))throw new Error('티켓·통화·이벤트·차량 계열 아이템은 연금 보상으로 등록할 수 없습니다.');
  let catalog=null;if(type==='CARD')catalog=await env.DB.prepare(`SELECT id,rarity FROM cards_effective_v1210 WHERE id=? AND is_active=1 AND COALESCE(card_status,'PUBLIC') NOT IN ('RETIRE_PENDING','RETIRED')`).bind(ref).first();else if(type==='EQUIPMENT')catalog=await env.DB.prepare(`SELECT id,slot FROM character_equipment_items WHERE id=? AND is_active=1 AND is_public=1`).bind(Number(ref)).first();else if(type==='VEHICLE')catalog=await env.DB.prepare(`SELECT id FROM character_garage_items WHERE id=? AND is_active=1 AND is_public=1`).bind(Number(ref)).first();else catalog=await env.DB.prepare(`SELECT code,category FROM inventory_items WHERE code=? AND is_active=1`).bind(ref).first();
  if(!catalog)throw new Error('보상 카탈로그 대상을 찾을 수 없습니다.');if(type==='CARD'&&!SAFE_CARD_REWARD_RARITIES.has(code(catalog.rarity,30)))throw new Error('SUPERSTAR·비공개 카드는 연금술 보상에 포함할 수 없습니다.');if(type==='EQUIPMENT'&&code(catalog.slot,30)==='BATTLE_SUIT')throw new Error('배틀슈트는 연금술 보상에 포함할 수 없습니다.');if(type==='ITEM'&&/VEHICLE/i.test(String(catalog.category||'')))throw new Error('이동수단은 VEHICLE 보상 유형으로 등록하세요.');
  const rewardId=code(raw.rewardId||`ALCH_${type}_${tier}_${ref}`,120),before=await env.DB.prepare(`SELECT * FROM ${TABLES.pool} WHERE reward_id=?`).bind(rewardId).first(),next={rewardId,type,ref,tier,mode,quantity:type==='VEHICLE'?1:int(raw.quantity,1,20,1),weight:number(raw.weight,.001,1000000,1),active:bool(raw.active??true),sortOrder:int(raw.sortOrder,-100000,100000,0)};
  await env.DB.prepare(`INSERT INTO ${TABLES.pool}(reward_id,alchemy_mode,tier_code,reward_type,reward_ref,quantity,weight,is_active,sort_order,updated_at) VALUES(?,?,?,?,?,?,?,?,?,CURRENT_TIMESTAMP) ON CONFLICT(reward_id) DO UPDATE SET alchemy_mode=excluded.alchemy_mode,tier_code=excluded.tier_code,reward_type=excluded.reward_type,reward_ref=excluded.reward_ref,quantity=excluded.quantity,weight=excluded.weight,is_active=excluded.is_active,sort_order=excluded.sort_order,updated_at=CURRENT_TIMESTAMP`).bind(rewardId,mode,tier,type,ref,next.quantity,next.weight,next.active?1:0,next.sortOrder).run();
  if(deps.writeAdminLog)await deps.writeAdminLog(env,admin,'ALCHEMY_REWARD_SAVE','ALCHEMY_REWARD',rewardId,before,next);return next;
}

async function deleteReward(env,admin,body,deps){const rewardId=code(body.rewardId,120),before=await env.DB.prepare(`SELECT * FROM ${TABLES.pool} WHERE reward_id=?`).bind(rewardId).first();if(!before)throw new Error('삭제할 보상을 찾을 수 없습니다.');await env.DB.prepare(`DELETE FROM ${TABLES.pool} WHERE reward_id=?`).bind(rewardId).run();if(deps.writeAdminLog)await deps.writeAdminLog(env,admin,'ALCHEMY_REWARD_DELETE','ALCHEMY_REWARD',rewardId,before,null)}
async function recoverPending(env,admin,deps){const result=await env.DB.prepare(`UPDATE ${TABLES.runs} SET status='FAILED',error_message='운영자 복구: 장시간 미완료 요청',updated_at=CURRENT_TIMESTAMP WHERE status='PENDING' AND updated_at<datetime('now','-10 minutes')`).run();const count=Number(result?.meta?.changes||0);if(deps.writeAdminLog)await deps.writeAdminLog(env,admin,'ALCHEMY_PENDING_RECOVER','ALCHEMY','PENDING',null,{count});return count}

export async function handleAlchemy({path,request,env,deps}){
  if(!path.startsWith('alchemy/')&&path!=='admin/alchemy')return null;
  await ensureAlchemyFoundation(env);const {authenticate,readBody,json,requirePermission}=deps;
  if(path==='admin/alchemy'){
    const admin=await requirePermission(request,env,'SETTINGS');if(!admin)return json({error:'연금술 운영 설정 권한이 필요합니다.'},403);
    if(request.method==='GET')return json(await adminSnapshot(env));
    if(request.method==='POST')try{const body=await readBody(request),action=code(body.action,50);if(action==='SAVE_SETTINGS')await saveSettings(env,admin,body,deps);else if(action==='SAVE_INPUT')await saveInputItem(env,admin,body,deps);else if(action==='SAVE_REWARD')await saveReward(env,admin,body,deps);else if(action==='DELETE_REWARD')await deleteReward(env,admin,body,deps);else if(action==='RECOVER_PENDING')return json({ok:true,recovered:await recoverPending(env,admin,deps),snapshot:await adminSnapshot(env)});else return json({error:'지원하지 않는 연금술 CMS 작업입니다.'},400);return json({ok:true,snapshot:await adminSnapshot(env)})}catch(error){return json({error:error.message||'연금술 CMS 저장에 실패했습니다.'},400)}
    return json({error:'지원하지 않는 요청 방식입니다.'},405);
  }
  const user=await authenticate(request,env);if(!user)return json({error:'로그인이 필요합니다.'},401);const access=await alchemyFeatureAccess(env,user);
  if(!access.visible)return json({error:'연금술은 현재 비공개 상태입니다.',code:'ALCHEMY_FEATURE_OFF'},403);
  if(path==='alchemy/state'&&request.method==='GET')return json({...await userState(env,user,await alchemySettings(env)),access});
  if(path==='alchemy/transmute'&&request.method==='POST')try{return json(await transmute(env,user,await readBody(request)))}catch(error){return json({error:error.message||'연금술 처리에 실패했습니다.',code:error.code},error.status||409)}
  return json({error:'지원하지 않는 연금술 요청입니다.'},405);
}
