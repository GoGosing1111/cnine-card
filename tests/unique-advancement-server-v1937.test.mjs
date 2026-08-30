import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { DatabaseSync } from 'node:sqlite';
import test from 'node:test';

import {
  UNIQUE_ADVANCEMENT_ALLOWED_GRADES,
  UNIQUE_ADVANCEMENT_CLASS_DEFINITIONS,
  UNIQUE_ADVANCEMENT_COST,
  UNIQUE_ADVANCEMENT_MIN_BREAKTHROUGH,
  UNIQUE_ADVANCEMENT_SUCCESS_CHANCE_PERCENT,
  __uniqueAdvancementTest,
  evaluateUniqueAdvancementEligibility,
  handleUniqueAdvancement,
  normalizeUniqueAdvancementSettings,
  rollUniqueAdvancement,
  resolveDominantUniqueStat,
  uniqueAdvancementDefinitions
} from '../functions/_unique_advancement.js';

const root=new URL('../',import.meta.url);
const [serverSource,apiSource,magicSource]=await Promise.all([
  readFile(new URL('functions/_unique_advancement.js',root),'utf8'),
  readFile(new URL('functions/api/[[path]].js',root),'utf8'),
  readFile(new URL('functions/_magic.js',root),'utf8')
]);

test('server contract fixes eligibility at FUR/ZENITH +13 and 1,000 MASTER_STAR',()=>{
  assert.equal(UNIQUE_ADVANCEMENT_COST,1000);
  assert.equal(UNIQUE_ADVANCEMENT_MIN_BREAKTHROUGH,13);
  assert.deepEqual([...UNIQUE_ADVANCEMENT_ALLOWED_GRADES],['FUR','ZENITH']);
  assert.deepEqual(normalizeUniqueAdvancementSettings({mode:'ON',costMasterStars:1,minimumBreakthrough:1}),{
    mode:'ON',version:1,costMasterStars:1000,successChancePercent:10,minimumBreakthrough:13,allowedGrades:['FUR','ZENITH']
  });
  assert.equal(normalizeUniqueAdvancementSettings().mode,'ON');
  assert.equal(UNIQUE_ADVANCEMENT_SUCCESS_CHANCE_PERCENT,10);
  assert.equal(rollUniqueAdvancement(0).success,true);
  assert.equal(rollUniqueAdvancement(Math.floor(0x100000000*0.1)-1).success,true);
  assert.equal(rollUniqueAdvancement(Math.ceil(0x100000000*0.1)).success,false);
});

test('highest unique stat selects one server class with ATTACK > DEFENSE > SPEED > HP tie order',()=>{
  assert.deepEqual(resolveDominantUniqueStat({attack_percent:50,defense_percent:50,speed_percent:50,hp_percent:50}),{
    dominantType:'ATTACK',highest:50,stats:{ATTACK:50,DEFENSE:50,SPEED:50,HP:50},classCode:'SHATTER'
  });
  assert.equal(resolveDominantUniqueStat({attackPercent:1,defensePercent:9,speedPercent:9,hpPercent:9}).classCode,'RIPOSTE');
  assert.equal(resolveDominantUniqueStat({attackPercent:1,defensePercent:2,speedPercent:9,hpPercent:9}).classCode,'AFTERIMAGE');
  assert.equal(resolveDominantUniqueStat({attackPercent:1,defensePercent:2,speedPercent:3,hpPercent:9}).classCode,'IMMORTAL');
});

test('all four definitions expose the exact combat-engine modifier contract',()=>{
  const expectedKeys=[
    'criticalChancePoints','penetrationPoints','dodgeChancePoints','dodgeCapPoints',
    'counterChancePoints','counterMultiplierPoints','unshieldedCounterChancePoints','maxHpPercent','damageCapPoints',
    'damageDealtPercent','lastStandHealPoolPercent','healPoolBonusPercent'
  ].sort();
  assert.deepEqual(Object.keys(UNIQUE_ADVANCEMENT_CLASS_DEFINITIONS).sort(),['AFTERIMAGE','IMMORTAL','RIPOSTE','SHATTER']);
  for(const definition of uniqueAdvancementDefinitions()){
    assert.deepEqual(Object.keys(definition.modifiers).sort(),expectedKeys);
    assert.ok(['ATTACK','DEFENSE','SPEED','HP'].includes(definition.dominantType));
  }
  const restored=__uniqueAdvancementTest.advancementFromRow({
    class_code:'SHATTER',dominant_type:'ATTACK',config_version:3,
    modifiers_json:JSON.stringify({criticalChancePoints:7}),activated_at:'2026-08-30T00:00:00.000Z'
  });
  assert.deepEqual(restored,{
    active:true,classCode:'SHATTER',dominantType:'ATTACK',configVersion:3,
    modifiers:{criticalChancePoints:7,penetrationPoints:0,dodgeChancePoints:0,dodgeCapPoints:0,counterChancePoints:0,counterMultiplierPoints:0,unshieldedCounterChancePoints:0,maxHpPercent:0,damageCapPoints:0,damageDealtPercent:0,lastStandHealPoolPercent:0,healPoolBonusPercent:0},
    activatedAt:'2026-08-30T00:00:00.000Z'
  });
  assert.deepEqual(UNIQUE_ADVANCEMENT_CLASS_DEFINITIONS.SHATTER.modifiers,{...__uniqueAdvancementTest.ZERO_MODIFIERS,criticalChancePoints:6,penetrationPoints:20,damageCapPoints:12});
  assert.deepEqual(UNIQUE_ADVANCEMENT_CLASS_DEFINITIONS.RIPOSTE.modifiers,{...__uniqueAdvancementTest.ZERO_MODIFIERS,counterChancePoints:3,counterMultiplierPoints:3,unshieldedCounterChancePoints:1,damageDealtPercent:-20});
  assert.deepEqual(UNIQUE_ADVANCEMENT_CLASS_DEFINITIONS.AFTERIMAGE.modifiers,{...__uniqueAdvancementTest.ZERO_MODIFIERS,penetrationPoints:8,dodgeChancePoints:6,dodgeCapPoints:6,maxHpPercent:-7});
  assert.deepEqual(UNIQUE_ADVANCEMENT_CLASS_DEFINITIONS.IMMORTAL.modifiers,{...__uniqueAdvancementTest.ZERO_MODIFIERS,maxHpPercent:12,lastStandHealPoolPercent:25,healPoolBonusPercent:15});
});

test('eligibility rejects client-inventable shortcuts and reports the automatic class',()=>{
  const base={quantity:1,rarity:'ZENITH',breakthrough_level:13,unique_card_id:'z-1',unique_is_active:1,attack_percent:10,defense_percent:22,speed_percent:11,hp_percent:3};
  const eligible=evaluateUniqueAdvancementEligibility({card:base,masterStars:1000,featureEnabled:true});
  assert.equal(eligible.eligible,true);
  assert.equal(eligible.recommendedClass.classCode,'RIPOSTE');
  assert.equal(evaluateUniqueAdvancementEligibility({card:{...base,rarity:'LIMITED'},masterStars:1000,featureEnabled:true}).code,'GRADE_NOT_ELIGIBLE');
  assert.equal(evaluateUniqueAdvancementEligibility({card:{...base,breakthrough_level:12},masterStars:1000,featureEnabled:true}).code,'BREAKTHROUGH_REQUIRED');
  assert.equal(evaluateUniqueAdvancementEligibility({card:base,masterStars:999,featureEnabled:true}).code,'MASTER_STAR_SHORTAGE');
  assert.equal(evaluateUniqueAdvancementEligibility({card:base,masterStars:1000,featureEnabled:false}).code,'FEATURE_DISABLED');
  assert.equal(evaluateUniqueAdvancementEligibility({card:base,masterStars:1000,featureEnabled:true,existing:{active:true}}).code,'ALREADY_ADVANCED');
});

test('foundation schema is D1/PostgreSQL compatible and enforces one advancement per card',()=>{
  const d1=__uniqueAdvancementTest.schemaStatements({DB:{dialect:'d1'}}).join('\n');
  const postgres=__uniqueAdvancementTest.schemaStatements({DB:{dialect:'postgres'}}).join('\n');
  for(const source of [d1,postgres]){
    assert.match(source,/PRIMARY KEY\(user_id,card_id\)/);
    assert.match(source,/PRIMARY KEY\(request_id,user_id\)/);
    assert.match(source,/UNIQUE\(user_id,request_id\)/);
    assert.match(source,/modifiers_json TEXT NOT NULL/);
    assert.doesNotMatch(source,/AUTOINCREMENT|RETURNING|::/);
  }
  assert.match(d1,/user_id INTEGER NOT NULL/);
  assert.match(postgres,/user_id BIGINT NOT NULL/);
  assert.match(postgres,/to_char\(timezone\('UTC',CURRENT_TIMESTAMP\)/);
});

test('POST is receipt-idempotent, DB-authoritative and guarded by the strict user mutation lock',()=>{
  assert.match(apiSource,/import \{ handleUniqueAdvancement \} from '\.\.\/_unique_advancement\.js'/);
  assert.match(apiSource,/handleUniqueAdvancement\(\{path,request,env,deps:\{authenticate,readBody,json\}\}\)/);
  assert.match(apiSource,/STRICT_MUTATION_LOCK_ACTIONS=new Set\(\[[^\]]*'card\/unique-advancement'/);
  assert.match(serverSource,/INSERT INTO \$\{RECEIPT_TABLE\}[^;]*ON CONFLICT\(request_id,user_id\) DO NOTHING/s);
  assert.match(serverSource,/REQUEST_ID_CARD_MISMATCH/);
  assert.match(serverSource,/receipt\.status==='COMPLETED'&&receipt\.response_json/);
  assert.match(serverSource,/FROM user_cards uc[\s\S]*JOIN cards_effective_v1210[\s\S]*JOIN card_unique_effects cue/);
  assert.match(serverSource,/COALESCE\(uc\.breakthrough_level,0\)>=\?/);
  assert.match(serverSource,/UPPER\(COALESCE\(c\.rarity,''\)\)=\?/);
  assert.match(serverSource,/item_code='MASTER_STAR' AND quantity=\?/);
  assert.match(serverSource,/NOT EXISTS\(SELECT 1 FROM \$\{ADVANCEMENT_TABLE\} WHERE user_id=\? AND card_id=\?\)/);
  assert.match(serverSource,/UPDATE \$\{RECEIPT_TABLE\} SET status='COMPLETED'/);
  assert.doesNotMatch(serverSource,/payload\.(?:classCode|dominantType|modifiers|cost)/);
  assert.match(serverSource,/\(path==='card\/unique-advancement\/status'\|\|path==='card\/unique-advancement'\)&&request\.method==='GET'/);
});

test('battle preparation discards client advancement data and injects only DB-owned state',()=>{
  assert.match(magicSource,/import \{loadUniqueAdvancementsForCards,uniqueAdvancementSettings\} from '\.\/_unique_advancement\.js'/);
  assert.match(magicSource,/uniqueAbility:null,uniqueAdvancement:null/);
  assert.match(magicSource,/const uniqueAdvancement=advancementMap\.get\(String\(card\.id\)\)\|\|null/);
  assert.match(magicSource,/return \{\.\.\.card,power:attack,maxHp:hp,uniqueAbility:effect,uniqueAdvancement,/);
  assert.match(magicSource,/const advancementSettings=await uniqueAdvancementSettings\(env,\{ensure:false\}\)/);
  assert.match(serverSource,/if\(ensure\)await ensureUniqueAdvancementFoundation\(env\)/);
  assert.match(magicSource,/mode==='ON'\|\|\(mode==='TEST'&&isOwner\(entry\.user\)\)/);
  assert.match(magicSource,/if\(!enabled\|\|!entry\.user\?\.id\)return new Map\(\)/);
  assert.match(magicSource,/loadUniqueAdvancementsForCards\(env,entry\.user\?\.id,cardIds\)/);
});

test('economy audit is committed in one guarded transaction without compensating markers',()=>{
  assert.match(serverSource,/const starBefore=state\.masterStars,starAfter=starBefore-UNIQUE_ADVANCEMENT_COST/);
  assert.match(serverSource,/CHECK\(ok=1\)/);
  assert.match(serverSource,/INSERT INTO \$\{GUARD_TABLE\}\(guard_id,ok\)/);
  assert.match(serverSource,/env\.DB\?\.dialect==='postgres'[\s\S]*SELECT quantity FROM cnine_user_inventory[\s\S]*FOR UPDATE/);
  assert.match(serverSource,/INSERT INTO inventory_logs[\s\S]*WHERE EXISTS\(SELECT 1 FROM \$\{RECEIPT_TABLE\}/);
  assert.doesNotMatch(serverSource,/balanceMarker|reconcileStuckMasterStarMarker|const rollback=/);
});

test('safe preparation mode allows only OWNER testing and rejects weak request ids',()=>{
  assert.deepEqual(__uniqueAdvancementTest.featureAccess('OFF',{role:'OWNER'}),{enabled:false,testAccess:false});
  assert.deepEqual(__uniqueAdvancementTest.featureAccess('TEST',{role:'OWNER'}),{enabled:true,testAccess:true});
  assert.deepEqual(__uniqueAdvancementTest.featureAccess('TEST',{role:'USER'}),{enabled:false,testAccess:false});
  assert.deepEqual(__uniqueAdvancementTest.featureAccess('ON',{role:'USER'}),{enabled:true,testAccess:false});
  assert.equal(__uniqueAdvancementTest.validRequestId('short'),false);
  assert.equal(__uniqueAdvancementTest.validRequestId('advancement:card-0001:retry-01'),true);
});

class SqliteD1Statement{
  constructor(owner,sql,values=[]){this.owner=owner;this.sql=String(sql);this.values=values}
  bind(...values){return new SqliteD1Statement(this.owner,this.sql,values)}
  async first(){return this.owner.db.prepare(this.sql).get(...this.values)||null}
  async all(){return {results:this.owner.db.prepare(this.sql).all(...this.values),meta:{changes:0}}}
  async run(){const result=this.owner.db.prepare(this.sql).run(...this.values);return {results:[],meta:{changes:Number(result.changes||0),last_row_id:Number(result.lastInsertRowid||0)}}}
  batch(){
    if(/^\s*(?:SELECT|PRAGMA)\b/i.test(this.sql))return {results:this.owner.db.prepare(this.sql).all(...this.values),meta:{changes:0}};
    const result=this.owner.db.prepare(this.sql).run(...this.values);
    return {results:[],meta:{changes:Number(result.changes||0),last_row_id:Number(result.lastInsertRowid||0)}};
  }
}

class SqliteD1{
  constructor(){this.db=new DatabaseSync(':memory:');this.dialect='d1'}
  prepare(sql){return new SqliteD1Statement(this,sql)}
  async batch(statements){
    this.db.exec('BEGIN');
    try{const results=statements.map(statement=>statement.batch());this.db.exec('COMMIT');return results}
    catch(error){this.db.exec('ROLLBACK');throw error}
  }
}

test('a failed guard rolls the entire MASTER_STAR transaction back',async()=>{
  const DB=new SqliteD1();
  DB.db.exec(`
    CREATE TABLE cnine_user_inventory(user_id INTEGER NOT NULL,item_code TEXT NOT NULL,quantity INTEGER NOT NULL DEFAULT 0,unseen_quantity INTEGER NOT NULL DEFAULT 0,updated_at TEXT DEFAULT CURRENT_TIMESTAMP,PRIMARY KEY(user_id,item_code));
    ${__uniqueAdvancementTest.schemaStatements({DB:{dialect:'d1'}}).join(';')};
    INSERT INTO cnine_user_inventory(user_id,item_code,quantity,unseen_quantity) VALUES(9,'MASTER_STAR',1500,0);
  `);
  await assert.rejects(DB.batch([
    DB.prepare('INSERT INTO card_unique_advancement_tx_guards_v1937(guard_id,ok) VALUES(?,1)').bind('atomic:pre'),
    DB.prepare("UPDATE cnine_user_inventory SET quantity=500 WHERE user_id=9 AND item_code='MASTER_STAR' AND quantity=1500"),
    DB.prepare('INSERT INTO card_unique_advancement_tx_guards_v1937(guard_id,ok) VALUES(?,0)').bind('atomic:reject')
  ]),/CHECK constraint failed/);
  assert.equal(DB.db.prepare("SELECT quantity FROM cnine_user_inventory WHERE user_id=9 AND item_code='MASTER_STAR'").get().quantity,1500);
  assert.equal(DB.db.prepare('SELECT COUNT(*) count FROM card_unique_advancement_tx_guards_v1937').get().count,0);
});

test('real SQLite execution charges once, persists one class and replays the completed request',async()=>{
  const DB=new SqliteD1();
  DB.db.exec(`
    CREATE TABLE app_meta(key TEXT PRIMARY KEY,value TEXT,updated_at TEXT DEFAULT CURRENT_TIMESTAMP);
    CREATE TABLE user_cards(user_id INTEGER NOT NULL,card_id TEXT NOT NULL,quantity INTEGER NOT NULL DEFAULT 1,breakthrough_level INTEGER NOT NULL DEFAULT 0,PRIMARY KEY(user_id,card_id));
    CREATE TABLE cards(id TEXT PRIMARY KEY,title TEXT NOT NULL,rarity TEXT NOT NULL);
    CREATE VIEW cards_effective_v1210 AS SELECT * FROM cards;
    CREATE TABLE card_unique_effects(card_id TEXT PRIMARY KEY,attack_percent REAL NOT NULL DEFAULT 0,defense_percent REAL NOT NULL DEFAULT 0,hp_percent REAL NOT NULL DEFAULT 0,speed_percent REAL NOT NULL DEFAULT 0,is_active INTEGER NOT NULL DEFAULT 0);
    CREATE TABLE cnine_user_inventory(user_id INTEGER NOT NULL,item_code TEXT NOT NULL,quantity INTEGER NOT NULL DEFAULT 0,unseen_quantity INTEGER NOT NULL DEFAULT 0,updated_at TEXT DEFAULT CURRENT_TIMESTAMP,PRIMARY KEY(user_id,item_code));
    CREATE TABLE inventory_logs(id INTEGER PRIMARY KEY AUTOINCREMENT,user_id INTEGER,item_code TEXT,change_amount INTEGER,balance_after INTEGER,reason TEXT,reference_type TEXT,reference_id TEXT);
    INSERT INTO cards(id,title,rarity) VALUES('zenith-01','전직 테스트 카드','ZENITH');
    INSERT INTO user_cards(user_id,card_id,quantity,breakthrough_level) VALUES(7,'zenith-01',1,13);
    INSERT INTO card_unique_effects(card_id,attack_percent,defense_percent,hp_percent,speed_percent,is_active) VALUES('zenith-01',12,40,8,20,1);
    INSERT INTO cnine_user_inventory(user_id,item_code,quantity,unseen_quantity) VALUES(7,'MASTER_STAR',1500,0);
  `);
  const env={DB,UNIQUE_ADVANCEMENT_MODE:'ON'};
  const deps={
    authenticate:async()=>({id:7,role:'USER'}),
    readBody:async request=>request.json(),
    json:(payload,status=200)=>({payload,status}),
    uniqueAdvancementRandomUint32:0
  };
  const requestId='advancement:zenith-01:retry-0001';
  const makeRequest=()=>new Request('https://example.test/api/card/unique-advancement',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({cardId:'zenith-01',requestId})});

  const first=await handleUniqueAdvancement({path:'card/unique-advancement',request:makeRequest(),env,deps});
  assert.equal(first.status,200);
  assert.equal(first.payload.success,true);
  assert.equal(first.payload.outcome,'ADVANCED');
  assert.equal(first.payload.uniqueAdvancement.classCode,'RIPOSTE');
  assert.equal(first.payload.material.balanceAfter,500);
  assert.equal(DB.db.prepare("SELECT quantity FROM cnine_user_inventory WHERE user_id=7 AND item_code='MASTER_STAR'").get().quantity,500);
  assert.equal(DB.db.prepare('SELECT COUNT(*) count FROM card_unique_advancements_v1937 WHERE user_id=7').get().count,1);

  const replay=await handleUniqueAdvancement({path:'card/unique-advancement',request:makeRequest(),env,deps});
  assert.equal(replay.status,200);
  assert.equal(replay.payload.replayed,true);
  assert.equal(DB.db.prepare("SELECT quantity FROM cnine_user_inventory WHERE user_id=7 AND item_code='MASTER_STAR'").get().quantity,500);
  assert.equal(DB.db.prepare("SELECT COUNT(*) count FROM inventory_logs WHERE reference_type='UNIQUE_ADVANCEMENT'").get().count,1);

  const other=await handleUniqueAdvancement({
    path:'card/unique-advancement',
    request:new Request('https://example.test/api/card/unique-advancement',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({cardId:'zenith-01',requestId:'advancement:zenith-01:other-0002'})}),
    env,deps
  });
  assert.equal(other.status,409);
  assert.equal(other.payload.code,'ALREADY_ADVANCED');
  assert.equal(DB.db.prepare("SELECT quantity FROM cnine_user_inventory WHERE user_id=7 AND item_code='MASTER_STAR'").get().quantity,500);

  const feature=await handleUniqueAdvancement({path:'card/unique-advancement/feature',request:new Request('https://example.test/api/card/unique-advancement/feature'),env,deps});
  assert.equal(feature.status,200);
  assert.deepEqual(feature.payload.feature,{mode:'ON',enabledForUser:true,testAccess:false,ready:true});
  assert.equal(feature.payload.config.successChancePercent,10);

  DB.db.exec(`
    INSERT INTO cards(id,title,rarity) VALUES('fur-fail-01','전직 실패 테스트 카드','FUR');
    INSERT INTO user_cards(user_id,card_id,quantity,breakthrough_level) VALUES(8,'fur-fail-01',1,13);
    INSERT INTO card_unique_effects(card_id,attack_percent,defense_percent,hp_percent,speed_percent,is_active) VALUES('fur-fail-01',40,10,8,20,1);
    INSERT INTO cnine_user_inventory(user_id,item_code,quantity,unseen_quantity) VALUES(8,'MASTER_STAR',1500,0);
  `);
  const failedDeps={...deps,authenticate:async()=>({id:8,role:'USER'}),uniqueAdvancementRandomUint32:0xffffffff};
  const failedRequestId='advancement:fur-fail-01:retry-0001';
  const failedRequest=()=>new Request('https://example.test/api/card/unique-advancement',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({cardId:'fur-fail-01',requestId:failedRequestId})});
  const failed=await handleUniqueAdvancement({path:'card/unique-advancement',request:failedRequest(),env,deps:failedDeps});
  assert.equal(failed.status,200);
  assert.equal(failed.payload.success,false);
  assert.equal(failed.payload.outcome,'FAILED');
  assert.equal(failed.payload.uniqueAdvancement,null);
  assert.equal(failed.payload.material.balanceAfter,500);
  assert.equal(DB.db.prepare("SELECT quantity FROM cnine_user_inventory WHERE user_id=8 AND item_code='MASTER_STAR'").get().quantity,500);
  assert.equal(DB.db.prepare('SELECT COUNT(*) count FROM card_unique_advancements_v1937 WHERE user_id=8').get().count,0);
  const failedReplay=await handleUniqueAdvancement({path:'card/unique-advancement',request:failedRequest(),env,deps:failedDeps});
  assert.equal(failedReplay.payload.replayed,true);
  assert.equal(failedReplay.payload.success,false);
  assert.equal(DB.db.prepare("SELECT quantity FROM cnine_user_inventory WHERE user_id=8 AND item_code='MASTER_STAR'").get().quantity,500);
  assert.equal(DB.db.prepare("SELECT COUNT(*) count FROM inventory_logs WHERE user_id=8 AND reference_type='UNIQUE_ADVANCEMENT'").get().count,1);
});
