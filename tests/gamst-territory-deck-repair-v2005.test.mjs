import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { DatabaseSync } from 'node:sqlite';
import test from 'node:test';

import { GAMST_RETIREMENT_MARKER_KEY } from '../functions/_gamst_card_retirement.js';
import {
  GAMST_DECK_REPAIR_MARKER_KEY,
  GAMST_TERRITORY_FORMATION_MARKER_KEY,
  GAMST_TERRITORY_FORMATION_PENDING_TAG,
  buildGamstDeckRepair,
  ensureGamstDeckRepairV2005
} from '../functions/_gamst_deck_repair_v2005.js';

const RETIRED_ATTACK='CN-011CAD85BBB2470F';

class SqliteD1Statement{
  constructor(owner,sql,values=[]){this.owner=owner;this.sql=String(sql);this.values=values}
  bind(...values){return new SqliteD1Statement(this.owner,this.sql,values)}
  async first(){return this.owner.db.prepare(this.sql).get(...this.values)||null}
  async all(){return{results:this.owner.db.prepare(this.sql).all(...this.values),meta:{changes:0}}}
  async run(){const result=this.owner.db.prepare(this.sql).run(...this.values);return{results:[],meta:{changes:Number(result.changes||0),last_row_id:Number(result.lastInsertRowid||0)}}}
  batch(){if(/^\s*(?:SELECT|PRAGMA)\b/i.test(this.sql))return{results:this.owner.db.prepare(this.sql).all(...this.values),meta:{changes:0}};const result=this.owner.db.prepare(this.sql).run(...this.values);return{results:[],meta:{changes:Number(result.changes||0),last_row_id:Number(result.lastInsertRowid||0)}}}
}
class SqliteD1{
  constructor(){this.db=new DatabaseSync(':memory:');this.dialect='d1'}
  prepare(sql){return new SqliteD1Statement(this,sql)}
  async batch(statements){this.db.exec('BEGIN');try{const results=statements.map(statement=>statement.batch());this.db.exec('COMMIT');return results}catch(error){this.db.exec('ROLLBACK');throw error}}
}

function owned(id,grade,level,extra={}){return{id,rarity:grade,breakthroughLevel:level,basePower:extra.basePower||100,...extra}}

test('감스트 빈 슬롯은 정산 대상 카드, 동일 FUR +13, 보유 최상 카드 순으로 채운다',()=>{
  const plan=[{sourceCardId:RETIRED_ATTACK,targetCardId:'FUR-SETTLED',dominantType:'ATTACK',sourceLevel:13,compensationType:'TRANSFER'}];
  const direct=buildGamstDeckRepair({
    cardIds:['SAFE-1',RETIRED_ATTACK,'SAFE-2','SAFE-3','SAFE-4'],planRows:plan,
    ownedCards:[owned('SAFE-1','LIMITED',10),owned('SAFE-2','MA',10),owned('SAFE-3','SSR',10),owned('SAFE-4','UR',10),owned('FUR-SETTLED','FUR',13,{attackPercent:40})]
  });
  assert.equal(direct.complete,true);
  assert.deepEqual(direct.after,['SAFE-1','FUR-SETTLED','SAFE-2','SAFE-3','SAFE-4']);
  assert.equal(direct.additions[0].reason,'SETTLEMENT_TARGET');

  const duplicateTarget=buildGamstDeckRepair({
    cardIds:['FUR-SETTLED',RETIRED_ATTACK,'SAFE-2','SAFE-3','SAFE-4'],planRows:plan,
    ownedCards:[owned('FUR-SETTLED','FUR',13,{attackPercent:40}),owned('FUR-ALT','FUR',13,{attackPercent:35}),owned('SAFE-2','MA',10),owned('SAFE-3','SSR',10),owned('SAFE-4','UR',10)]
  });
  assert.deepEqual(duplicateTarget.after,['FUR-SETTLED','FUR-ALT','SAFE-2','SAFE-3','SAFE-4']);
  assert.equal(duplicateTarget.additions[0].reason,'SAME_GRADE_13');

  const gradeLimit=buildGamstDeckRepair({
    cardIds:['FUR-ONE','FUR-TWO',RETIRED_ATTACK,'SAFE-3','SAFE-4'],planRows:plan,
    ownedCards:[owned('FUR-ONE','FUR',13),owned('FUR-TWO','FUR',13),owned('FUR-SETTLED','FUR',13),owned('ZENITH-ALT','ZENITH',13,{basePower:300}),owned('SAFE-3','SSR',10),owned('SAFE-4','UR',10)]
  });
  assert.equal(gradeLimit.after[2],'ZENITH-ALT','FUR 2장 제한을 넘기지 않아야 한다');
});

function fixture(){
  const DB=new SqliteD1();
  DB.db.exec(`
    CREATE TABLE app_meta(key TEXT PRIMARY KEY,value TEXT NOT NULL,updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP);
    CREATE TABLE users(id INTEGER PRIMARY KEY,nickname TEXT NOT NULL,role TEXT NOT NULL DEFAULT 'USER');
    CREATE TABLE members(id INTEGER PRIMARY KEY,name TEXT NOT NULL,is_active INTEGER NOT NULL DEFAULT 1);
    CREATE TABLE cards_effective_v1210(id TEXT PRIMARY KEY,member_id INTEGER NOT NULL,title TEXT NOT NULL,rarity TEXT NOT NULL,power_type TEXT,base_power INTEGER NOT NULL DEFAULT 0,is_active INTEGER NOT NULL DEFAULT 1,card_status TEXT NOT NULL DEFAULT 'PUBLIC');
    CREATE TABLE card_unique_effects(card_id TEXT PRIMARY KEY,attack_percent REAL NOT NULL DEFAULT 0,defense_percent REAL NOT NULL DEFAULT 0,speed_percent REAL NOT NULL DEFAULT 0,hp_percent REAL NOT NULL DEFAULT 0,is_active INTEGER NOT NULL DEFAULT 1);
    CREATE TABLE user_cards(user_id INTEGER NOT NULL,card_id TEXT NOT NULL,quantity INTEGER NOT NULL DEFAULT 1,breakthrough_level INTEGER NOT NULL DEFAULT 0,PRIMARY KEY(user_id,card_id));
    CREATE TABLE gamst_card_retirement_v2001_plan(user_id INTEGER NOT NULL,source_card_id TEXT NOT NULL,source_title TEXT NOT NULL DEFAULT '',source_quantity INTEGER NOT NULL,source_level INTEGER NOT NULL,dominant_type TEXT NOT NULL,compensation_type TEXT NOT NULL,target_card_id TEXT,target_title TEXT,refund_shards INTEGER NOT NULL DEFAULT 0,transferred_advancement INTEGER NOT NULL DEFAULT 0,PRIMARY KEY(user_id,source_card_id));
    CREATE TABLE pve_decks(user_id INTEGER PRIMARY KEY,card_ids TEXT NOT NULL,updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP);
    CREATE TABLE pvp_decks(user_id INTEGER PRIMARY KEY,card_ids TEXT NOT NULL,updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP);
    CREATE TABLE pvp_deck_presets(user_id INTEGER NOT NULL,preset_no INTEGER NOT NULL,card_ids TEXT NOT NULL,updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,PRIMARY KEY(user_id,preset_no));
    CREATE TABLE territory_war_v3_rounds(id INTEGER PRIMARY KEY,status TEXT NOT NULL,version INTEGER NOT NULL DEFAULT 1,updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP);
    CREATE TABLE territory_war_v3_users(round_id INTEGER NOT NULL,user_id INTEGER NOT NULL,deck_snapshot TEXT NOT NULL,formation_breakdown_json TEXT NOT NULL DEFAULT '{}',loadout_refreshed_at TEXT,updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,PRIMARY KEY(round_id,user_id));
    CREATE TABLE admin_logs(id INTEGER PRIMARY KEY AUTOINCREMENT,admin_id INTEGER NOT NULL,action_type TEXT NOT NULL,target_type TEXT NOT NULL,target_id TEXT,before_data TEXT,after_data TEXT,created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP);

    INSERT INTO app_meta(key,value) VALUES('${GAMST_RETIREMENT_MARKER_KEY}','{"status":"COMPLETED","version":2001}');
    INSERT INTO users(id,nickname,role) VALUES(1,'운영자','OWNER'),(7,'감스트정산유저','USER');
    INSERT INTO members(id,name,is_active) VALUES(1,'안전멤버',1);
    INSERT INTO cards_effective_v1210(id,member_id,title,rarity,power_type,base_power) VALUES
      ('SAFE-1',1,'안전1','LIMITED','ATTACK',100),('SAFE-2',1,'안전2','MA','DEFENSE',90),('SAFE-3',1,'안전3','SSR','HP',80),('SAFE-4',1,'안전4','UR','SPEED',70),
      ('FUR-SETTLED',1,'정산 공격 카드','FUR','ATTACK',500),('FUR-ALT',1,'대체 공격 카드','FUR','ATTACK',450);
    INSERT INTO card_unique_effects(card_id,attack_percent,is_active) VALUES('FUR-SETTLED',40,1),('FUR-ALT',35,1);
    INSERT INTO user_cards(user_id,card_id,quantity,breakthrough_level) VALUES
      (7,'SAFE-1',1,10),(7,'SAFE-2',1,10),(7,'SAFE-3',1,10),(7,'SAFE-4',1,10),(7,'FUR-SETTLED',1,13),(7,'FUR-ALT',1,13);
    INSERT INTO gamst_card_retirement_v2001_plan(user_id,source_card_id,source_quantity,source_level,dominant_type,compensation_type,target_card_id) VALUES(7,'${RETIRED_ATTACK}',1,13,'ATTACK','TRANSFER','FUR-SETTLED');
    INSERT INTO pve_decks(user_id,card_ids) VALUES(7,'["SAFE-1","SAFE-2","SAFE-3","SAFE-4"]');
    INSERT INTO pvp_decks(user_id,card_ids) VALUES(7,'["SAFE-1","SAFE-2","SAFE-3","SAFE-4"]');
    INSERT INTO pvp_deck_presets(user_id,preset_no,card_ids) VALUES(7,1,'["FUR-SETTLED","${RETIRED_ATTACK}","SAFE-2","SAFE-3","SAFE-4"]');
    INSERT INTO territory_war_v3_rounds(id,status,version) VALUES(9,'ACTIVE',3);
    INSERT INTO territory_war_v3_users(round_id,user_id,deck_snapshot,formation_breakdown_json,loadout_refreshed_at) VALUES(9,7,'["SAFE-1","${RETIRED_ATTACK}","SAFE-2","SAFE-3","SAFE-4"]','{"version":2,"deckComplete":true}',CURRENT_TIMESTAMP);
  `);
  return DB;
}

test('이미 지급된 카드만 사용해 일반 덱과 진행 중 영토전 스냅샷을 일회 복구한다',async()=>{
  const DB=fixture(),beforeOwnership=DB.db.prepare('SELECT COUNT(*) count FROM user_cards WHERE user_id=7').get().count;
  const result=await ensureGamstDeckRepairV2005({DB});
  assert.equal(result.status,'COMPLETED');
  assert.equal(result.replayed,false);
  assert.equal(result.grantedCards,0);
  assert.equal(result.usedExistingOwnershipOnly,true);
  assert.deepEqual(result.rewrittenDecks,{pve:1,pvp:1,presets:1,territory:1});
  assert.equal(result.replacementReasons.SETTLEMENT_TARGET,3);
  assert.equal(result.replacementReasons.SAME_GRADE_13,1);
  assert.deepEqual(JSON.parse(DB.db.prepare('SELECT card_ids FROM pvp_decks WHERE user_id=7').get().card_ids),['SAFE-1','SAFE-2','SAFE-3','SAFE-4','FUR-SETTLED']);
  assert.deepEqual(JSON.parse(DB.db.prepare('SELECT card_ids FROM pvp_deck_presets WHERE user_id=7 AND preset_no=1').get().card_ids),['FUR-SETTLED','FUR-ALT','SAFE-2','SAFE-3','SAFE-4']);
  assert.deepEqual(JSON.parse(DB.db.prepare('SELECT deck_snapshot FROM territory_war_v3_users WHERE round_id=9 AND user_id=7').get().deck_snapshot),['SAFE-1','FUR-SETTLED','SAFE-2','SAFE-3','SAFE-4']);
  assert.match(DB.db.prepare('SELECT formation_breakdown_json FROM territory_war_v3_users WHERE round_id=9 AND user_id=7').get().formation_breakdown_json,new RegExp(GAMST_TERRITORY_FORMATION_PENDING_TAG));
  assert.equal(DB.db.prepare('SELECT value FROM app_meta WHERE key=?').get(GAMST_TERRITORY_FORMATION_MARKER_KEY).value,'PENDING');
  assert.equal(DB.db.prepare('SELECT COUNT(*) count FROM user_cards WHERE user_id=7').get().count,beforeOwnership,'복구가 카드를 새로 지급하면 안 된다');
  assert.equal(DB.db.prepare("SELECT COUNT(*) count FROM admin_logs WHERE action_type='GAMST_DECK_AUTO_REPAIR_V2005'").get().count,1);

  const replay=await ensureGamstDeckRepairV2005({DB});
  assert.equal(replay.replayed,true);
  assert.equal(DB.db.prepare("SELECT COUNT(*) count FROM admin_logs WHERE action_type='GAMST_DECK_AUTO_REPAIR_V2005'").get().count,1);
  assert.equal(JSON.parse(DB.db.prepare('SELECT value FROM app_meta WHERE key=?').get(GAMST_DECK_REPAIR_MARKER_KEY).value).status,'COMPLETED');
});

test('health가 일회 복구를 실행하고 영토전 진입 전에 전투력 스냅샷을 다시 계산한다',()=>{
  const api=readFileSync(new URL('../functions/api/[[path]].js',import.meta.url),'utf8');
  const territory=readFileSync(new URL('../functions/_territory_war.js',import.meta.url),'utf8');
  assert.match(api,/gamstDeckRepair=await ensureGamstDeckRepairV2005\(env\)/);
  assert.match(api,/gamstCardRetirement,gamstDeckRepair,targetedCardTransfer/);
  assert.match(territory,/ensureGamstDeckRepairV2005\(env\)/);
  assert.match(territory,/refreshGamstRepairedTerritoryFormations\(env,deps\)/);
  assert.match(territory,/formation_breakdown_json LIKE \?/);
  assert.match(territory,/json_array_length\(CASE WHEN json_valid\(w\.deck_snapshot\)/);
  assert.match(territory,/COUNT\(DISTINCT uc\.card_id\)[\s\S]*COALESCE\(uc\.quantity,0\)>0\)=5/);
});
