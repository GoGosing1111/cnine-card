import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { DatabaseSync } from 'node:sqlite';
import test from 'node:test';

import {
  __equipmentTest,
  ensureEquipmentFoundation,
  handleEquipment,
  userEquipmentBonuses,
} from '../functions/_equipment.js';
import {battleSuitLiveRuntime,createPveBattleV2} from '../functions/_battle_v2_preview.js';

const migrationUrl=new URL('../database/migrations/0087_v1953_project_v_battle_suits.sql',import.meta.url);
const femaleRefreshMigrationUrl=new URL('../database/migrations/0088_v1959_battle_suit_01_female.sql',import.meta.url);
const powerTierMigrationUrl=new URL('../database/migrations/0089_v1969_battle_suit_power_tiers.sql',import.meta.url);
const assetManifestUrl=new URL('../assets/ui/project-v/account-battle-suits/manifest-v1.json',import.meta.url);
const siegeUrl=new URL('../functions/_siege.js',import.meta.url);
const apiUrl=new URL('../functions/api/[[path]].js',import.meta.url);

class SqliteD1Statement{
  constructor(owner,sql,values=[]){this.owner=owner;this.sql=String(sql);this.values=values}
  bind(...values){return new SqliteD1Statement(this.owner,this.sql,values)}
  async first(column){const row=this.owner.db.prepare(this.sql).get(...this.values)||null;return column&&row?row[column]:row}
  async all(){return {results:this.owner.db.prepare(this.sql).all(...this.values),meta:{changes:0}}}
  async run(){return this.execute()}
  execute(){
    if(/^\s*(?:SELECT|PRAGMA|WITH)\b/i.test(this.sql))return {results:this.owner.db.prepare(this.sql).all(...this.values),meta:{changes:0}};
    const result=this.owner.db.prepare(this.sql).run(...this.values);
    return {results:[],meta:{changes:Number(result.changes||0),last_row_id:Number(result.lastInsertRowid||0)}};
  }
}

class SqliteD1{
  constructor(){this.db=new DatabaseSync(':memory:');this.dialect='d1'}
  prepare(sql){return new SqliteD1Statement(this,sql)}
  async batch(statements){
    this.db.exec('BEGIN');
    try{const results=statements.map(statement=>statement.execute());this.db.exec('COMMIT');return results}
    catch(error){this.db.exec('ROLLBACK');throw error}
  }
}

function createEquipmentSchema(db){
  db.exec(`
    CREATE TABLE app_meta(key TEXT PRIMARY KEY,value TEXT NOT NULL DEFAULT '',updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP);
    CREATE TABLE character_equipment_items(
      id INTEGER PRIMARY KEY AUTOINCREMENT,code TEXT NOT NULL UNIQUE,name TEXT NOT NULL,slot TEXT NOT NULL,subtype TEXT NOT NULL DEFAULT '',rarity TEXT NOT NULL DEFAULT 'NORMAL',
      image_url TEXT NOT NULL DEFAULT '',description TEXT NOT NULL DEFAULT '',total_power INTEGER NOT NULL DEFAULT 0,pve_power INTEGER NOT NULL DEFAULT 0,pvp_power INTEGER NOT NULL DEFAULT 0,
      is_active INTEGER NOT NULL DEFAULT 1,is_public INTEGER NOT NULL DEFAULT 1,sort_order INTEGER NOT NULL DEFAULT 0,supply_enabled INTEGER NOT NULL DEFAULT 0,supply_weight REAL NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    );
  `);
}

test('battle-suit CMS power is PVE-only and the catalog points at the three approved runtime assets',()=>{
  assert.deepEqual(
    __equipmentTest.equipmentPowerForSlot('BATTLE_SUIT',{totalPower:900,pvePower:345,pvpPower:555}),
    {total:345,pve:345,pvp:0},
  );
  assert.deepEqual(__equipmentTest.equipmentPowerForSlot('BATTLE_SUIT',{totalPower:900}),{total:900,pve:900,pvp:0});
  assert.deepEqual(__equipmentTest.equipmentPowerForSlot('WEAPON',{totalPower:100}),{total:100,pve:90,pvp:10});
  assert.deepEqual(__equipmentTest.BATTLE_SUIT_CATALOG.map(item=>item.code),['BATTLE_SUIT_01','BATTLE_SUIT_02','BATTLE_SUIT_03']);
  assert.deepEqual(__equipmentTest.BATTLE_SUIT_CATALOG.map(item=>item.pvePower),[100000,200000,300000]);
  assert.ok(__equipmentTest.BATTLE_SUIT_CATALOG.every(item=>item.image.startsWith('/assets/ui/project-v/account-battle-suits/suits/')));
  assert.match(__equipmentTest.BATTLE_SUIT_CATALOG[0].image,/white-gold-female-v2\.png$/);
});

test('Battle Suit 01 female refresh replaces only the appearance metadata',async()=>{
  const sqlite=new DatabaseSync(':memory:');
  createEquipmentSchema(sqlite);
  sqlite.exec(await readFile(migrationUrl,'utf8'));
  sqlite.prepare("UPDATE character_equipment_items SET total_power=777,pve_power=777,pvp_power=0 WHERE code='BATTLE_SUIT_01'").run();
  const refresh=await readFile(femaleRefreshMigrationUrl,'utf8');
  sqlite.exec(refresh);
  sqlite.exec(refresh);
  const row=sqlite.prepare("SELECT image_url,description,total_power,pve_power,pvp_power FROM character_equipment_items WHERE code='BATTLE_SUIT_01'").get();
  assert.match(row.image_url,/battle-suit-appearance-01-white-gold-female-v2\.png$/);
  assert.match(row.description,/여성형/);
  assert.equal(row.total_power,777);
  assert.equal(row.pve_power,777);
  assert.equal(row.pvp_power,0);
});

test('competitive and siege server paths hard-exclude Battle Suit power',async()=>{
  const [siegeSource,apiSource]=await Promise.all([
    readFile(siegeUrl,'utf8'),
    readFile(apiUrl,'utf8'),
  ]);
  assert.match(
    siegeSource,
    /Number\(characterBonus\?\.pve \|\| 0\) -\s*Number\(characterBonus\?\.battleSuitPve \|\| 0\)/,
  );
  assert.match(siegeSource,/characterBonus: siegePveBonus/);
  assert.match(apiSource,/AND i\.slot<>'BATTLE_SUIT' GROUP BY l\.user_id/);
});

test('battle-suit migration is idempotent, starts at zero power and never opts into supply',async()=>{
  const sqlite=new DatabaseSync(':memory:');
  createEquipmentSchema(sqlite);
  const migration=await readFile(migrationUrl,'utf8');
  sqlite.exec(migration);

  const initial=sqlite.prepare("SELECT code,total_power,pve_power,pvp_power,supply_enabled,supply_weight FROM character_equipment_items WHERE slot='BATTLE_SUIT' ORDER BY code").all();
  assert.equal(initial.length,3);
  assert.ok(initial.every(row=>row.total_power===0&&row.pve_power===0&&row.pvp_power===0));
  assert.ok(initial.every(row=>row.supply_enabled===0&&row.supply_weight===0));

  sqlite.prepare("UPDATE character_equipment_items SET total_power=777,pve_power=777,pvp_power=222,supply_enabled=1,supply_weight=50 WHERE code='BATTLE_SUIT_02'").run();
  sqlite.exec(migration);
  const rerun=sqlite.prepare("SELECT COUNT(*) count,MAX(total_power) total_power,MAX(pve_power) pve_power,MAX(pvp_power) pvp_power,MAX(supply_enabled) supply_enabled,MAX(supply_weight) supply_weight FROM character_equipment_items WHERE code='BATTLE_SUIT_02'").get();
  assert.equal(rerun.count,1);
  assert.equal(rerun.total_power,777,'idempotent seeding must preserve CMS PVE balance');
  assert.equal(rerun.pve_power,777,'idempotent seeding must preserve CMS PVE balance');
  assert.equal(rerun.pvp_power,0);
  assert.equal(rerun.supply_enabled,0);
  assert.equal(rerun.supply_weight,0);
});

test('V1969 migration applies the exact 100k/200k/300k PVE tiers and keeps PVP disabled',async()=>{
  const sqlite=new DatabaseSync(':memory:');
  createEquipmentSchema(sqlite);
  sqlite.exec(await readFile(migrationUrl,'utf8'));
  sqlite.exec(await readFile(powerTierMigrationUrl,'utf8'));

  const rows=sqlite.prepare("SELECT code,total_power,pve_power,pvp_power,supply_enabled,supply_weight FROM character_equipment_items WHERE slot='BATTLE_SUIT' ORDER BY code").all();
  assert.deepEqual(rows.map(row=>({
    code:row.code,
    totalPower:row.total_power,
    pvePower:row.pve_power,
    pvpPower:row.pvp_power,
    supplyEnabled:row.supply_enabled,
    supplyWeight:row.supply_weight,
  })),[
    {code:'BATTLE_SUIT_01',totalPower:100000,pvePower:100000,pvpPower:0,supplyEnabled:0,supplyWeight:0},
    {code:'BATTLE_SUIT_02',totalPower:200000,pvePower:200000,pvpPower:0,supplyEnabled:0,supplyWeight:0},
    {code:'BATTLE_SUIT_03',totalPower:300000,pvePower:300000,pvpPower:0,supplyEnabled:0,supplyWeight:0},
  ]);
  assert.equal(sqlite.prepare("SELECT value FROM app_meta WHERE key='safe_runtime_upgrade_v1969_battle_suit_power_tiers'").get().value,'1');
});

test('runtime Battle Suit and weapon cutout manifest matches the committed assets',async()=>{
  const manifest=JSON.parse(await readFile(assetManifestUrl,'utf8'));
  assert.equal(manifest.scope,'PVE_ONLY');
  assert.equal(manifest.powerContract.pvpTotalIncludesBattleSuit,false);
  assert.deepEqual(manifest.powerContract.tiersBySuitCode,{BATTLE_SUIT_01:100000,BATTLE_SUIT_02:200000,BATTLE_SUIT_03:300000});
  assert.equal(manifest.renderContract.canonicalAllyCardCount,5);
  assert.equal(manifest.renderContract.addsIndependentDamage,true);
  assert.equal(manifest.renderContract.damageAuthority,'BATTLE_ENGINE_V2');
  assert.equal(manifest.renderContract.occupiesCardSlot,false);
  assert.equal(manifest.renderContract.targetable,false);
  assert.deepEqual(manifest.suits.map(item=>item.code),['BATTLE_SUIT_01','BATTLE_SUIT_02','BATTLE_SUIT_03']);
  assert.deepEqual(manifest.weapons.map(item=>item.equipmentCode),['EQ_1785427638137','EQ_1785961232958','EQ_1785961300455','EQ_1786966923833']);
  for(const item of [...manifest.suits,...manifest.weapons]){
    const relative=String(item.image||item.battleSprite||'').replace(/^\//,'');
    const bytes=await readFile(new URL(`../${relative}`,import.meta.url));
    assert.equal(createHash('sha256').update(bytes).digest('hex').toUpperCase(),item.sha256,relative);
  }
});

test('Battle Suit is a sixth PVE support actor with authoritative independent damage, not a displayed aggregate',()=>{
  const cards=Array.from({length:5},(_,index)=>({
    id:String(index+1),title:`CARD ${index+1}`,name:`CARD ${index+1}`,rarity:'FUR',power_type:'ATTACK',power:50000,
  }));
  const battle=createPveBattleV2({
    cards,
    characterBonus:25000,
    battleSuit:{code:'BATTLE_SUIT_02',name:'배틀슈트 02',pvePower:200000,weapon:{code:'EQ_1785427638137'}},
    monster:{id:7,name:'검증 보스',battle_power:900000,is_boss:1},
    bossUltimatePercent:20,
    seed:17,
  });
  assert.equal(battle.teams.A.cards.length,5,'canonical deck must remain exactly five cards');
  assert.equal(battle.teams.A.supports.length,1,'Battle Suit must use its separate support slot');
  assert.equal(battle.teams.A.summary.equipmentBonus,25000,'Battle Suit power must not be distributed back into cards');
  assert.equal(battle.teams.A.supports[0].power,200000);
  assert.equal(battle.teams.A.supports[0].authoritative,true);
  assert.equal(battle.teams.A.supports[0].damageAuthority,'SERVER_TIMELINE');
  assert.equal(battle.teams.A.supports[0].untargetable,true);
  assert.equal(battle.teams.A.supports[0].usesSpeedGauge,false);
  assert.equal(battle.teams.A.supports[0].consumesBattleAction,false);
  assert.equal(battle.teams.A.supports[0].actionClock,'INDEPENDENT_TIME_CADENCE');
  assert.equal(battle.result.final.A.length,5,'support actor must not corrupt five-card survivor results');
  const actorId=battle.teams.A.supports[0].id;
  const hits=battle.result.timeline.filter(event=>event.type==='TURN'&&event.actorId===actorId);
  assert.ok(hits.length>0,'Battle Suit must receive its own wall-clock cadence shots');
  assert.ok(hits.some(event=>Number(event.damage||0)+Number(event.absorbed||0)>0),'Battle Suit must apply real monster HP damage');
  assert.ok(hits.every(event=>event.actionClock==='INDEPENDENT_TIME_CADENCE'),'Battle Suit shots must not be emitted by the canonical speed gauge');
  assert.equal(battle.rules.battleSuitActionClock,'INDEPENDENT_TIME_CADENCE');
  assert.equal(battle.rules.battleSuitConsumesAction,false);
  assert.equal(battle.rules.battleSuitUsesSpeedGauge,false);
  if(hits.length>1){
    const interval=battle.teams.A.supports[0].independentFireIntervalSeconds;
    assert.ok(hits.slice(1).every((event,index)=>Math.abs((event.at-hits[index].at)-interval)<.002),'server shots must keep the weapon wall-clock cadence');
  }
  const applied=hits.reduce((sum,event)=>sum+Number(event.damage||0)+Number(event.absorbed||0),0);
  assert.equal(battle.result.damageBreakdown.battleSuit,applied,'contribution must equal authoritative applied timeline damage');
  assert.equal(battle.result.damageBreakdown.authority,'SERVER_TIMELINE');
  assert.ok(battle.result.damageBreakdown.battleSuit>0);
  assert.ok(hits.every(event=>event.actorKind==='BATTLE_SUIT'&&event.damageSource==='BATTLE_SUIT_INDEPENDENT'));
  assert.ok(!battle.result.timeline.some(event=>event.targetId===actorId),'Battle Suit support must not become a sixth HP target');
  const bossUltimate=battle.result.timeline.find(event=>event.type==='BOSS_ULTIMATE');
  assert.ok(bossUltimate?.hits?.every(hit=>hit.targetId!==actorId),'boss area damage must retain the canonical five-card target set');
  assert.equal(battle.rules.battleSuitDamageAuthority,'SERVER_TIMELINE');
  assert.equal(battle.rules.battleSuitOccupiesCardSlot,false);

  const lowPowerCards=Array.from({length:5},(_,index)=>({
    id:`LOW-${index+1}`,title:`LOW ${index+1}`,power_type:'ATTACK',power:10000,
  }));
  const hardMonster={id:8,name:'결과 반전 검증 보스',battle_power:300000,is_boss:1,pve_hp_percent:300,pve_attack_percent:200,pve_defense_percent:200,pve_speed_percent:100};
  const withoutSuit=createPveBattleV2({cards:lowPowerCards,monster:hardMonster,seed:17});
  const withSuit=createPveBattleV2({cards:lowPowerCards,battleSuit:{code:'BATTLE_SUIT_02',pvePower:200000,weapon:{code:'EQ_1785427638137'}},monster:hardMonster,seed:17});
  assert.equal(withoutSuit.result.winner,'B','the fixture must lose when the Battle Suit is absent');
  assert.equal(withSuit.result.winner,'A','independent Battle Suit attacks must be able to change the authoritative server result');
  assert.ok(withSuit.result.damageBreakdown.battleSuit>0);
});

test('live activation is scoped to an equipped positive-power PVE Battle Suit',()=>{
  const disabled=battleSuitLiveRuntime({battleSuitPve:300000});
  assert.equal(disabled.enabled,false,'power without an equipped suit must not activate the live renderer');
  assert.equal(disabled.damageAuthority,'NONE');

  const enabled=battleSuitLiveRuntime({
    battleSuitPve:200000,
    equippedBattleSuit:{code:'BATTLE_SUIT_02'},
    equippedWeapon:{code:'EQ_1785427638137'}
  });
  assert.deepEqual(enabled,{
    enabled:true,
    scope:'PVE_ONLY',
    activation:'EQUIPPED_BATTLE_SUIT',
    renderer:'PROJECT_V_V3',
    engineRequired:true,
    damageAuthority:'SERVER_TIMELINE',
    pvePower:200000,
    suitCode:'BATTLE_SUIT_02',
    weaponCode:'EQ_1785427638137',
    targetable:false,
    occupiesCardSlot:false
  });
});

test('loadout reports render-ready suit/weapon metadata and isolates suit power from PVP',async()=>{
  const DB=new SqliteD1();
  createEquipmentSchema(DB.db);
  DB.db.exec(`
    CREATE TABLE user_equipment_instances(id INTEGER PRIMARY KEY AUTOINCREMENT,user_id INTEGER NOT NULL,equipment_id INTEGER NOT NULL,source_type TEXT NOT NULL DEFAULT 'ADMIN',source_id TEXT NOT NULL DEFAULT '',request_id TEXT,acquired_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP);
    CREATE TABLE user_equipment_loadout(user_id INTEGER NOT NULL,slot TEXT NOT NULL,instance_id INTEGER NOT NULL UNIQUE,updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,PRIMARY KEY(user_id,slot));
    CREATE TABLE character_garage_items(id INTEGER PRIMARY KEY AUTOINCREMENT,code TEXT UNIQUE,name TEXT,rarity TEXT,image_url TEXT,pve_power INTEGER,pvp_power INTEGER,is_active INTEGER,is_public INTEGER,sort_order INTEGER,total_power INTEGER,description TEXT);
    CREATE TABLE user_garage_vehicles(user_id INTEGER,garage_id INTEGER,source_type TEXT DEFAULT 'ADMIN',source_id TEXT DEFAULT '',acquired_at TEXT DEFAULT CURRENT_TIMESTAMP,PRIMARY KEY(user_id,garage_id));
    CREATE TABLE user_garage_loadout(user_id INTEGER PRIMARY KEY,garage_id INTEGER,updated_at TEXT DEFAULT CURRENT_TIMESTAMP);
    CREATE TABLE character_titles(id INTEGER PRIMARY KEY AUTOINCREMENT,code TEXT UNIQUE,name TEXT,description TEXT,badge_text TEXT,image_url TEXT,pve_power INTEGER,unlock_type TEXT,unlock_config_json TEXT,style_preset TEXT,is_active INTEGER,is_public INTEGER,sort_order INTEGER);
    CREATE TABLE user_character_titles(user_id INTEGER,title_id INTEGER,source_type TEXT DEFAULT 'SYSTEM',source_id TEXT DEFAULT '',unlocked_at TEXT DEFAULT CURRENT_TIMESTAMP,expires_at TEXT,PRIMARY KEY(user_id,title_id));
    CREATE TABLE user_title_loadout(user_id INTEGER PRIMARY KEY,title_id INTEGER,updated_at TEXT DEFAULT CURRENT_TIMESTAMP);
    CREATE TABLE avatar_catalog_v1(code TEXT PRIMARY KEY,name TEXT,call_sign TEXT,role_label TEXT,effect_type TEXT,effect_value INTEGER,lobby_image TEXT,lobby_mobile_image TEXT,equipment_image TEXT,is_active INTEGER,is_public INTEGER);
    CREATE TABLE avatar_effect_options_v1(avatar_code TEXT,option_order INTEGER,effect_type TEXT,effect_value INTEGER,PRIMARY KEY(avatar_code,option_order));
    CREATE TABLE avatar_user_ownership_v1(user_id INTEGER,avatar_code TEXT,expires_at TEXT,PRIMARY KEY(user_id,avatar_code));
    CREATE TABLE avatar_user_loadout_v1(user_id INTEGER PRIMARY KEY,avatar_code TEXT);
  `);
  const completedMarkers=[
    'safe_runtime_upgrade_v1231_character_equipment_titles','safe_runtime_upgrade_v1232_character_title_styles','safe_runtime_upgrade_v1247_equipment_supply_box',
    'safe_runtime_upgrade_v1274_supply_drop_quantity','safe_runtime_upgrade_v1473_mythic_equipment_unique','safe_runtime_upgrade_v1676_mythic_equipment_duplicates',
    'safe_runtime_upgrade_v1488_prime_equipment_recall','safe_runtime_upgrade_v1489_infinity_weapon_recall','safe_runtime_upgrade_v1490_new_equipment_drop_quarantine',
    'safe_runtime_upgrade_v1338_garage_system','safe_runtime_upgrade_v1533_territory_commander_title','safe_runtime_upgrade_v1863_avatar_catalog_v1',
    'safe_runtime_upgrade_v1864_avatar_effect_options_v1','safe_runtime_upgrade_v1867_avatar_equipment_alpha_v2','safe_runtime_upgrade_v1870_avatar_equipment_alpha_v3',
    'safe_runtime_upgrade_v1917_avatar_ownership_expiry_v1','safe_runtime_upgrade_v1985_dimwoos_avatar_v1',
  ];
  const markerInsert=DB.db.prepare('INSERT INTO app_meta(key,value) VALUES(?,?)');
  for(const key of completedMarkers)markerInsert.run(key,'1');
  markerInsert.run('avatar_settings_v1',JSON.stringify({mode:'OFF',shopEnabled:false,version:1}));

  await ensureEquipmentFoundation({DB});
  const suits=DB.db.prepare("SELECT * FROM character_equipment_items WHERE slot='BATTLE_SUIT' ORDER BY code").all();
  assert.equal(suits.length,3);
  assert.deepEqual(suits.map(row=>row.pve_power),[100000,200000,300000]);
  assert.ok(suits.every(row=>row.pvp_power===0&&row.supply_enabled===0));

  DB.db.prepare("UPDATE character_equipment_items SET total_power=250,pve_power=250,pvp_power=999 WHERE code='BATTLE_SUIT_01'").run();
  DB.db.prepare("INSERT INTO character_equipment_items(code,name,slot,subtype,rarity,image_url,total_power,pve_power,pvp_power,is_active,is_public,sort_order,supply_enabled,supply_weight) VALUES('WEAPON_TEST','V3 테스트 무기','WEAPON','RIFLE','RARE','assets/test-weapon.png',130,100,30,1,1,1,0,0)").run();
  const suitId=DB.db.prepare("SELECT id FROM character_equipment_items WHERE code='BATTLE_SUIT_01'").get().id;
  const weaponId=DB.db.prepare("SELECT id FROM character_equipment_items WHERE code='WEAPON_TEST'").get().id;
  const suitInstance=Number(DB.db.prepare("INSERT INTO user_equipment_instances(user_id,equipment_id) VALUES(7,?)").run(suitId).lastInsertRowid);
  const weaponInstance=Number(DB.db.prepare("INSERT INTO user_equipment_instances(user_id,equipment_id) VALUES(7,?)").run(weaponId).lastInsertRowid);
  DB.db.prepare("INSERT INTO user_equipment_loadout(user_id,slot,instance_id) VALUES(7,'BATTLE_SUIT',?),(7,'WEAPON',?)").run(suitInstance,weaponInstance);
  DB.db.prepare("INSERT INTO character_garage_items(id,code,name,rarity,image_url,total_power,pve_power,pvp_power,is_active,is_public,sort_order,description) VALUES(1,'GARAGE_TEST','테스트 차량','NORMAL','',60,40,20,1,1,1,'')").run();
  DB.db.prepare("INSERT INTO user_garage_vehicles(user_id,garage_id) VALUES(7,1)").run();
  DB.db.prepare("INSERT INTO user_garage_loadout(user_id,garage_id) VALUES(7,1)").run();
  DB.db.prepare("INSERT INTO character_titles(id,code,name,description,badge_text,image_url,pve_power,unlock_type,unlock_config_json,style_preset,is_active,is_public,sort_order) VALUES(1,'TITLE_TEST','테스트 칭호','','','',10,'MANUAL','{}','DEFAULT',1,1,1)").run();
  DB.db.prepare("INSERT INTO user_character_titles(user_id,title_id) VALUES(7,1)").run();
  DB.db.prepare("INSERT INTO user_title_loadout(user_id,title_id) VALUES(7,1)").run();

  const bonuses=await userEquipmentBonuses({DB},7);
  assert.equal(bonuses.equipmentPve,100);
  assert.equal(bonuses.equipmentPvp,30);
  assert.equal(bonuses.battleSuitPve,250);
  assert.equal(bonuses.battleSuitPvp,0);
  assert.equal(bonuses.pve,400);
  assert.equal(bonuses.pvp,60,'the corrupted suit PVP column must never affect aggregate PVP');
  assert.equal(bonuses.equippedBattleSuit.id,suitId);
  assert.equal(bonuses.equippedBattleSuit.instanceId,suitInstance);
  assert.equal(bonuses.equippedBattleSuit.subtype,'BATTLE_SUIT');
  assert.equal(bonuses.equippedBattleSuit.pvpPower,0);
  assert.equal(bonuses.equippedBattleSuit.battleSprite,suits[0].image_url);
  assert.equal(bonuses.equippedWeapon.id,weaponId);
  assert.equal(bonuses.equippedWeapon.subtype,'RIFLE');
  assert.equal(bonuses.equippedWeapon.image,'assets/test-weapon.png');
  assert.equal(bonuses.equippedWeapon.battleSprite,'','generic square equipment art must not masquerade as a transparent battle cutout');

  const response=await handleEquipment({
    path:'character/loadout',request:new Request('https://example.test/api/character/loadout'),env:{DB},deps:{
      authenticate:async()=>({id:7,role:'USER'}),
      readBody:async request=>request.json(),
      json:(payload,status=200)=>({payload,status}),
    },
  });
  assert.equal(response.status,200);
  assert.ok(response.payload.slots.some(slot=>slot.id==='BATTLE_SUIT'&&slot.label==='배틀슈트'));
  assert.equal(response.payload.loadout.BATTLE_SUIT,suitInstance);
  assert.deepEqual(response.payload.equippedBattleSuit,bonuses.equippedBattleSuit);
  assert.deepEqual(response.payload.equippedWeapon,bonuses.equippedWeapon);
  const publicSuit=response.payload.instances.find(instance=>instance.instanceId===suitInstance);
  assert.equal(publicSuit.item.pvpPower,0);
  assert.equal(publicSuit.item.totalPower,250);
});
