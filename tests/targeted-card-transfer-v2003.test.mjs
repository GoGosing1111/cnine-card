import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { DatabaseSync } from 'node:sqlite';
import test from 'node:test';

import {
  TARGETED_CARD_TRANSFER_MARKER_KEY,
  TARGETED_CARD_TRANSFER_NICKNAME,
  TARGETED_CARD_TRANSFER_SOURCE_CARD_ID,
  TARGETED_CARD_TRANSFER_TARGET_CARD_ID,
  ensureTargetedCardTransferV2003,
  rewriteTransferredCardIds
} from '../functions/_targeted_card_transfer_v2003.js';

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

function fixture(){
  const DB=new SqliteD1();
  DB.db.exec(`
    CREATE TABLE app_meta(key TEXT PRIMARY KEY,value TEXT NOT NULL,updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP);
    CREATE TABLE users(id INTEGER PRIMARY KEY,nickname TEXT NOT NULL UNIQUE,role TEXT NOT NULL DEFAULT 'USER');
    CREATE TABLE members(id INTEGER PRIMARY KEY,name TEXT NOT NULL,is_active INTEGER NOT NULL DEFAULT 1);
    CREATE TABLE cards_effective_v1210(id TEXT PRIMARY KEY,member_id INTEGER NOT NULL,title TEXT NOT NULL,rarity TEXT NOT NULL,is_active INTEGER NOT NULL DEFAULT 1,card_status TEXT NOT NULL DEFAULT 'PUBLIC');
    CREATE TABLE card_unique_effects(card_id TEXT PRIMARY KEY,attack_percent REAL NOT NULL DEFAULT 0,defense_percent REAL NOT NULL DEFAULT 0,speed_percent REAL NOT NULL DEFAULT 0,hp_percent REAL NOT NULL DEFAULT 0,is_active INTEGER NOT NULL DEFAULT 1);
    CREATE TABLE user_cards(user_id INTEGER NOT NULL,card_id TEXT NOT NULL,quantity INTEGER NOT NULL DEFAULT 1,breakthrough_level INTEGER NOT NULL DEFAULT 0,breakthrough_fail_count INTEGER NOT NULL DEFAULT 0,first_obtained_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,last_obtained_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,PRIMARY KEY(user_id,card_id));
    CREATE TABLE card_unique_advancements_v1937(user_id INTEGER NOT NULL,card_id TEXT NOT NULL,class_code TEXT NOT NULL,dominant_type TEXT NOT NULL,config_version INTEGER NOT NULL DEFAULT 1,cost_master_stars INTEGER NOT NULL DEFAULT 3000,modifiers_json TEXT NOT NULL DEFAULT '{}',request_id TEXT NOT NULL,activated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,PRIMARY KEY(user_id,card_id),UNIQUE(user_id,request_id));
    CREATE TABLE pve_decks(user_id INTEGER PRIMARY KEY,card_ids TEXT NOT NULL,updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP);
    CREATE TABLE pvp_decks(user_id INTEGER PRIMARY KEY,card_ids TEXT NOT NULL,updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP);
    CREATE TABLE pvp_deck_presets(user_id INTEGER NOT NULL,preset_no INTEGER NOT NULL,card_ids TEXT NOT NULL,updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,PRIMARY KEY(user_id,preset_no));
    CREATE TABLE admin_logs(id INTEGER PRIMARY KEY AUTOINCREMENT,admin_id INTEGER NOT NULL,action_type TEXT NOT NULL,target_type TEXT NOT NULL,target_id TEXT,before_data TEXT,after_data TEXT,created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP);

    INSERT INTO app_meta(key,value) VALUES('safe_runtime_upgrade_v1937_card_unique_advancement_tx_guard','1');
    INSERT INTO users(id,nickname,role) VALUES(1,'운영자','OWNER'),(52,'${TARGETED_CARD_TRANSFER_NICKNAME}','USER');
    INSERT INTO members(id,name,is_active) VALUES(10,'킴성태',1),(11,'남순',1);
    INSERT INTO cards_effective_v1210(id,member_id,title,rarity,is_active,card_status) VALUES
      ('${TARGETED_CARD_TRANSFER_SOURCE_CARD_ID}',10,'프로필 킴성태','FUR',1,'PUBLIC'),
      ('${TARGETED_CARD_TRANSFER_TARGET_CARD_ID}',11,'와룡킹남순','FUR',1,'PUBLIC');
    INSERT INTO card_unique_effects(card_id,attack_percent,defense_percent,speed_percent,hp_percent,is_active) VALUES
      ('${TARGETED_CARD_TRANSFER_SOURCE_CARD_ID}',14,7,0,9,1),
      ('${TARGETED_CARD_TRANSFER_TARGET_CARD_ID}',14,7,0,9,1);
    INSERT INTO user_cards(user_id,card_id,quantity,breakthrough_level,breakthrough_fail_count) VALUES
      (52,'${TARGETED_CARD_TRANSFER_SOURCE_CARD_ID}',2,13,4),
      (52,'${TARGETED_CARD_TRANSFER_TARGET_CARD_ID}',3,10,2);
    INSERT INTO card_unique_advancements_v1937(user_id,card_id,class_code,dominant_type,config_version,cost_master_stars,modifiers_json,request_id)
      VALUES(52,'${TARGETED_CARD_TRANSFER_SOURCE_CARD_ID}','SHATTER','ATTACK',4,3000,'{}','advancement:source:request-0001');
    INSERT INTO pve_decks(user_id,card_ids) VALUES(52,'["SAFE-1","${TARGETED_CARD_TRANSFER_SOURCE_CARD_ID}","SAFE-2"]');
    INSERT INTO pvp_decks(user_id,card_ids) VALUES(52,'["${TARGETED_CARD_TRANSFER_SOURCE_CARD_ID}","${TARGETED_CARD_TRANSFER_TARGET_CARD_ID}","SAFE-3"]');
    INSERT INTO pvp_deck_presets(user_id,preset_no,card_ids) VALUES(52,1,'["SAFE-4","${TARGETED_CARD_TRANSFER_SOURCE_CARD_ID}"]');
  `);
  return DB;
}

test('카드 ID 치환은 기존 순서를 유지하고 목표 카드 중복을 제거한다',()=>{
  assert.deepEqual(
    rewriteTransferredCardIds(['A',TARGETED_CARD_TRANSFER_SOURCE_CARD_ID,'B',TARGETED_CARD_TRANSFER_TARGET_CARD_ID]),
    ['A',TARGETED_CARD_TRANSFER_TARGET_CARD_ID,'B']
  );
});

test('폭군#의 킴성태 공격 +13 전직 한 장을 남순 공격 +13 전직으로 원자 이전하고 재실행하지 않는다',async()=>{
  const DB=fixture();
  const first=await ensureTargetedCardTransferV2003({DB});
  assert.equal(first.status,'COMPLETED');
  assert.equal(first.replayed,false);
  assert.deepEqual(first.rewrittenDecks,{pve:1,pvp:1,presets:1});

  assert.deepEqual({...DB.db.prepare('SELECT quantity,breakthrough_level,breakthrough_fail_count FROM user_cards WHERE user_id=52 AND card_id=?').get(TARGETED_CARD_TRANSFER_SOURCE_CARD_ID)},{quantity:1,breakthrough_level:0,breakthrough_fail_count:0});
  assert.deepEqual({...DB.db.prepare('SELECT quantity,breakthrough_level,breakthrough_fail_count FROM user_cards WHERE user_id=52 AND card_id=?').get(TARGETED_CARD_TRANSFER_TARGET_CARD_ID)},{quantity:4,breakthrough_level:13,breakthrough_fail_count:0});
  assert.equal(DB.db.prepare('SELECT COUNT(*) count FROM card_unique_advancements_v1937 WHERE user_id=52 AND card_id=?').get(TARGETED_CARD_TRANSFER_SOURCE_CARD_ID).count,0);
  assert.deepEqual({...DB.db.prepare('SELECT class_code,dominant_type,request_id FROM card_unique_advancements_v1937 WHERE user_id=52 AND card_id=?').get(TARGETED_CARD_TRANSFER_TARGET_CARD_ID)},{class_code:'SHATTER',dominant_type:'ATTACK',request_id:'advancement:source:request-0001'});
  assert.deepEqual(JSON.parse(DB.db.prepare('SELECT card_ids FROM pve_decks WHERE user_id=52').get().card_ids),['SAFE-1',TARGETED_CARD_TRANSFER_TARGET_CARD_ID,'SAFE-2']);
  assert.deepEqual(JSON.parse(DB.db.prepare('SELECT card_ids FROM pvp_decks WHERE user_id=52').get().card_ids),[TARGETED_CARD_TRANSFER_TARGET_CARD_ID,'SAFE-3']);
  assert.equal(DB.db.prepare("SELECT COUNT(*) count FROM admin_logs WHERE action_type='USER_CARD_TRANSFER_V2003'").get().count,1);
  assert.equal(JSON.parse(DB.db.prepare('SELECT value FROM app_meta WHERE key=?').get(TARGETED_CARD_TRANSFER_MARKER_KEY).value).status,'COMPLETED');

  const replay=await ensureTargetedCardTransferV2003({DB});
  assert.equal(replay.replayed,true);
  assert.equal(DB.db.prepare('SELECT quantity FROM user_cards WHERE user_id=52 AND card_id=?').get(TARGETED_CARD_TRANSFER_TARGET_CARD_ID).quantity,4);
  assert.equal(DB.db.prepare("SELECT COUNT(*) count FROM admin_logs WHERE action_type='USER_CARD_TRANSFER_V2003'").get().count,1);
});

test('라이브 health 경로에 일회성 이전과 비식별 검증 상태가 연결된다',()=>{
  const api=readFileSync(new URL('../functions/api/[[path]].js',import.meta.url),'utf8');
  assert.match(api,/ensureTargetedCardTransferV2003\(env\)/);
  assert.match(api,/sourceCardId:transfer\.source\?\.cardId\|\|null,targetCardId:transfer\.target\?\.cardId\|\|null/);
  assert.doesNotMatch(api,/targetedCardTransfer=transfer;/);
});
