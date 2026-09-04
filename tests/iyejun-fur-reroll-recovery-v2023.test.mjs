import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {DatabaseSync} from 'node:sqlite';
import test from 'node:test';

import {
  IYEJUN_FUR_MEMBER_NAME,
  IYEJUN_FUR_REROLL_RECOVERY_MARKER_KEY,
  ensureIyejunFurRerollRecoveryV2023
} from '../functions/_iyejun_fur_reroll_recovery_v2023.js';

class SqliteD1Statement{
  constructor(owner,sql,values=[]){this.owner=owner;this.sql=String(sql);this.values=values}
  bind(...values){return new SqliteD1Statement(this.owner,this.sql,values)}
  async first(){return this.owner.db.prepare(this.sql).get(...this.values)||null}
  async all(){return{results:this.owner.db.prepare(this.sql).all(...this.values),meta:{changes:0}}}
  async run(){return this.batch()}
  batch(){
    if(/^\s*(?:SELECT|PRAGMA)\b/i.test(this.sql))return{results:this.owner.db.prepare(this.sql).all(...this.values),meta:{changes:0}};
    const result=this.owner.db.prepare(this.sql).run(...this.values);
    return{results:[],meta:{changes:Number(result.changes||0),last_row_id:Number(result.lastInsertRowid||0)}};
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

function fixture({withTarget=true}={}){
  const DB=new SqliteD1();
  DB.db.exec(`
    CREATE TABLE app_meta(key TEXT PRIMARY KEY,value TEXT NOT NULL,updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP);
    CREATE TABLE users(id INTEGER PRIMARY KEY,nickname TEXT NOT NULL,card_shards INTEGER NOT NULL DEFAULT 0);
    CREATE TABLE members(id INTEGER PRIMARY KEY,name TEXT NOT NULL);
    CREATE TABLE cards(id TEXT PRIMARY KEY,member_id INTEGER NOT NULL,title TEXT NOT NULL,rarity TEXT NOT NULL,rarity_override TEXT,reroll_result_enabled INTEGER NOT NULL DEFAULT 1,updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP);
    CREATE TABLE user_cards(user_id INTEGER NOT NULL,card_id TEXT NOT NULL,quantity INTEGER NOT NULL DEFAULT 1,breakthrough_level INTEGER NOT NULL DEFAULT 0,breakthrough_fail_count INTEGER NOT NULL DEFAULT 0,first_obtained_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,last_obtained_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,PRIMARY KEY(user_id,card_id));
    CREATE TABLE cnine_user_inventory(user_id INTEGER NOT NULL,item_code TEXT NOT NULL,quantity INTEGER NOT NULL DEFAULT 0,unseen_quantity INTEGER NOT NULL DEFAULT 0,created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,PRIMARY KEY(user_id,item_code));
    CREATE TABLE inventory_logs(id INTEGER PRIMARY KEY AUTOINCREMENT,user_id INTEGER NOT NULL,item_code TEXT NOT NULL,change_amount INTEGER NOT NULL,balance_after INTEGER NOT NULL,reason TEXT NOT NULL,reference_type TEXT,reference_id TEXT,created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP);
    CREATE TABLE shard_logs(id INTEGER PRIMARY KEY AUTOINCREMENT,user_id INTEGER NOT NULL,change_amount INTEGER NOT NULL,balance_after INTEGER NOT NULL,reason TEXT NOT NULL,card_id TEXT,created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP);
    CREATE TABLE high_grade_reroll_ticket_receipts(request_id TEXT PRIMARY KEY,user_id INTEGER NOT NULL,grade TEXT NOT NULL,source_card_id TEXT NOT NULL,result_card_id TEXT NOT NULL,response_json TEXT NOT NULL,used_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP);
    CREATE TABLE inventory_use_receipts(request_id TEXT PRIMARY KEY,user_id INTEGER NOT NULL,item_code TEXT NOT NULL,status TEXT NOT NULL,response_json TEXT,error_message TEXT,created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP);
    INSERT INTO users(id,nickname,card_shards) VALUES(1,'고등급유저',0),(2,'FUR유저',100);
    INSERT INTO members(id,name) VALUES(1,'${IYEJUN_FUR_MEMBER_NAME}'),(2,'원본멤버');
    INSERT INTO cards(id,member_id,title,rarity,rarity_override) VALUES('fur-source',2,'원본 FUR','FUR',NULL);
  `);
  if(withTarget){
    DB.db.exec(`
      INSERT INTO cards(id,member_id,title,rarity,rarity_override,reroll_result_enabled) VALUES('fur-iyejun',1,'신규 공격','FUR',NULL,1);
      INSERT INTO user_cards(user_id,card_id,quantity,breakthrough_level,breakthrough_fail_count) VALUES(1,'fur-iyejun',1,13,0),(2,'fur-iyejun',1,0,0);
      INSERT INTO high_grade_reroll_ticket_receipts(request_id,user_id,grade,source_card_id,result_card_id,response_json)
        VALUES('hg-1',1,'FUR','fur-source','fur-iyejun','{"ok":true,"sourceCardId":"fur-source","resultCardId":"fur-iyejun","breakthroughLevel":13,"remaining":0,"card":{"id":"fur-iyejun"}}');
      INSERT INTO inventory_use_receipts(request_id,user_id,item_code,status,response_json)
        VALUES('fur-1',2,'FUR_REROLL_TICKET','COMPLETED','{"ok":true,"itemCode":"FUR_REROLL_TICKET","remaining":0,"card":{"id":"fur-iyejun"},"duplicate":true,"shardGained":250}');
    `);
  }
  return DB;
}

test('이예준 FUR 재뽑기 결과를 회수하고 각 사용 전 상태로 원복한다',async()=>{
  const DB=fixture();
  const first=await ensureIyejunFurRerollRecoveryV2023({DB});
  assert.equal(first.status,'COMPLETED');
  assert.equal(first.replayed,false);
  assert.equal(first.rerollBlocked,true);
  assert.equal(first.cardsRecovered,2);
  assert.equal(first.sourceCardsRestored,1);
  assert.equal(first.highGradeTicketsRefunded,1);
  assert.equal(first.furTicketsRefunded,1);
  assert.equal(first.shardsReversed,250);

  assert.equal(DB.db.prepare("SELECT reroll_result_enabled FROM cards WHERE id='fur-iyejun'").get().reroll_result_enabled,0);
  assert.equal(DB.db.prepare("SELECT COUNT(*) count FROM user_cards WHERE card_id='fur-iyejun'").get().count,0);
  assert.deepEqual({...DB.db.prepare("SELECT quantity,breakthrough_level,breakthrough_fail_count FROM user_cards WHERE user_id=1 AND card_id='fur-source'").get()},
    {quantity:1,breakthrough_level:13,breakthrough_fail_count:0});
  assert.equal(DB.db.prepare("SELECT quantity FROM cnine_user_inventory WHERE user_id=1 AND item_code='HIGH_GRADE_REROLL_TICKET'").get().quantity,1);
  assert.equal(DB.db.prepare("SELECT quantity FROM cnine_user_inventory WHERE user_id=2 AND item_code='FUR_REROLL_TICKET'").get().quantity,1);
  assert.equal(DB.db.prepare('SELECT card_shards FROM users WHERE id=2').get().card_shards,-150);
  assert.equal(JSON.parse(DB.db.prepare("SELECT response_json FROM high_grade_reroll_ticket_receipts WHERE request_id='hg-1'").get().response_json).reverted,true);
  assert.equal(DB.db.prepare("SELECT status FROM inventory_use_receipts WHERE request_id='fur-1'").get().status,'REVERTED');
  assert.equal(DB.db.prepare("SELECT COUNT(*) count FROM iyejun_fur_reroll_recovery_v2023 WHERE status='COMPLETED'").get().count,2);

  const replay=await ensureIyejunFurRerollRecoveryV2023({DB});
  assert.equal(replay.replayed,true);
  assert.equal(replay.cardsRecovered,2);
  assert.equal(DB.db.prepare("SELECT quantity FROM cnine_user_inventory WHERE user_id=1 AND item_code='HIGH_GRADE_REROLL_TICKET'").get().quantity,1);
  assert.equal(DB.db.prepare("SELECT quantity FROM cnine_user_inventory WHERE user_id=2 AND item_code='FUR_REROLL_TICKET'").get().quantity,1);
  assert.equal(DB.db.prepare('SELECT COUNT(*) count FROM inventory_logs').get().count,2);
});

test('대상 FUR 카드가 아직 DB에 없으면 완료 마커 없이 대기한다',async()=>{
  const DB=fixture({withTarget:false});
  const result=await ensureIyejunFurRerollRecoveryV2023({DB});
  assert.equal(result.status,'WAITING_CARD');
  assert.equal(DB.db.prepare('SELECT COUNT(*) count FROM app_meta WHERE key=?').get(IYEJUN_FUR_REROLL_RECOVERY_MARKER_KEY).count,0);
});

test('두 재뽑기 경로 모두 이예준 FUR와 CMS 결과 제외 플래그를 강제 차단한다',()=>{
  const highGrade=readFileSync(new URL('../functions/_high_grade_reroll.js',import.meta.url),'utf8');
  const recovery=readFileSync(new URL('../functions/_iyejun_fur_reroll_recovery_v2023.js',import.meta.url),'utf8');
  const api=readFileSync(new URL('../functions/api/[[path]].js',import.meta.url),'utf8');
  assert.match(highGrade,/reroll_result_enabled,1\)=1[\s\S]{0,240}m\.name[\s\S]{0,80}이예준/);
  assert.match(api,/if\(isReroll\)await ensureHighGradeRerollFoundation\(env\)/);
  assert.match(api,/const rerollResultEligibility=isReroll\?[\s\S]{0,320}reroll_result_enabled[\s\S]{0,320}이예준/);
  assert.match(api,/ensureIyejunFurRerollRecoveryV2023\(env\)/);
  assert.match(api,/iyejunFurRerollRecovery=rerollRecovery\?\{/);
  assert.doesNotMatch(api,/iyejunFurRerollRecovery=rerollRecovery;/);
  assert.match(recovery,/env\.DB\?\.dialect==='postgres'[\s\S]{0,120}env\.DB\.execSchema/);
  assert.match(recovery,/recoveryTimestampSql\(env\)[\s\S]*CAST\(CURRENT_TIMESTAMP AS TIMESTAMPTZ\)/);
  assert.match(recovery,/updated_at=\$\{recoveryTimestamp\}/);
  const postgresFoundation=recovery.match(/if\(env\.DB\?\.dialect==='postgres'[\s\S]*?\}\s*else\s*\{/i)?.[0]||'';
  assert.doesNotMatch(postgresFoundation,/ALTER TABLE cards ADD COLUMN/);
});
