import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { DatabaseSync } from 'node:sqlite';
import test from 'node:test';

import {
  TARGETED_CARD_GRANT_V2016_CARD_ID,
  TARGETED_CARD_GRANT_V2016_LEVEL,
  TARGETED_CARD_GRANT_V2016_MARKER_KEY,
  TARGETED_CARD_GRANT_V2016_NICKNAME,
  ensureTargetedCardGrantV2016
} from '../functions/_targeted_card_grant_v2016.js';

class SqliteD1Statement{
  constructor(owner,sql,values=[]){this.owner=owner;this.sql=String(sql);this.values=values}
  bind(...values){return new SqliteD1Statement(this.owner,this.sql,values)}
  async first(){return this.owner.db.prepare(this.sql).get(...this.values)||null}
  async all(){return{results:this.owner.db.prepare(this.sql).all(...this.values),meta:{changes:0}}}
  batch(){
    if(/^\s*(?:SELECT|PRAGMA)\b/i.test(this.sql))return{results:this.owner.db.prepare(this.sql).all(...this.values),meta:{changes:0}};
    const result=this.owner.db.prepare(this.sql).run(...this.values);
    return{results:[],meta:{changes:Number(result.changes||0),last_row_id:Number(result.lastInsertRowid||0)}};
  }
}

class SqliteD1{
  constructor(){this.db=new DatabaseSync(':memory:');this.dialect='d1';this.beforeMainBatch=null}
  prepare(sql){return new SqliteD1Statement(this,sql)}
  async batch(statements){
    if(statements.length>1&&this.beforeMainBatch){const hook=this.beforeMainBatch;this.beforeMainBatch=null;hook(this.db)}
    this.db.exec('BEGIN');
    try{const results=statements.map(statement=>statement.batch());this.db.exec('COMMIT');return results}
    catch(error){this.db.exec('ROLLBACK');throw error}
  }
}

function fixture({status='ACTIVE',quantity=null,level=0,failCount=0}={}){
  const DB=new SqliteD1();
  DB.db.exec(`
    CREATE TABLE app_meta(key TEXT PRIMARY KEY,value TEXT NOT NULL,updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP);
    CREATE TABLE users(id INTEGER PRIMARY KEY,nickname TEXT NOT NULL,role TEXT NOT NULL,status TEXT NOT NULL);
    CREATE TABLE members(id INTEGER PRIMARY KEY,name TEXT NOT NULL,is_active INTEGER NOT NULL DEFAULT 1);
    CREATE TABLE cards_effective_v1210(id TEXT PRIMARY KEY,member_id INTEGER NOT NULL,title TEXT NOT NULL,rarity TEXT NOT NULL,is_active INTEGER NOT NULL DEFAULT 1,card_status TEXT NOT NULL DEFAULT 'PUBLIC');
    CREATE TABLE user_cards(user_id INTEGER NOT NULL,card_id TEXT NOT NULL,quantity INTEGER NOT NULL DEFAULT 1,breakthrough_level INTEGER NOT NULL DEFAULT 0,breakthrough_fail_count INTEGER NOT NULL DEFAULT 0,first_obtained_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,last_obtained_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,PRIMARY KEY(user_id,card_id));
    CREATE TABLE admin_logs(id INTEGER PRIMARY KEY AUTOINCREMENT,admin_id INTEGER NOT NULL,action_type TEXT NOT NULL,target_type TEXT NOT NULL,target_id TEXT,before_data TEXT,after_data TEXT,created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP);
    INSERT INTO users(id,nickname,role,status) VALUES(1,'운영자','OWNER','ACTIVE'),(99,'${TARGETED_CARD_GRANT_V2016_NICKNAME}','USER','${status}');
    INSERT INTO members(id,name,is_active) VALUES(21,'킴성태',1);
    INSERT INTO cards_effective_v1210(id,member_id,title,rarity,is_active,card_status) VALUES('${TARGETED_CARD_GRANT_V2016_CARD_ID}',21,'철와대 킴성태','FUR',1,'PUBLIC');
  `);
  if(quantity!==null)DB.db.prepare('INSERT INTO user_cards(user_id,card_id,quantity,breakthrough_level,breakthrough_fail_count) VALUES(?,?,?,?,?)').run(99,TARGETED_CARD_GRANT_V2016_CARD_ID,quantity,level,failCount);
  return DB;
}

test('심심이 계정에 철와대 킴성태 한 장을 +12로 지급하고 재실행하지 않는다',async()=>{
  const DB=fixture();
  const first=await ensureTargetedCardGrantV2016({DB});
  assert.equal(first.status,'COMPLETED');
  assert.equal(first.replayed,false);
  assert.equal(first.quantityGranted,1);
  assert.equal(first.quantityBefore,0);
  assert.equal(first.quantityAfter,1);
  assert.equal(first.levelRequested,TARGETED_CARD_GRANT_V2016_LEVEL);
  assert.equal(first.breakthroughLevel,12);
  assert.equal(Object.hasOwn(first,'nickname'),false);
  assert.equal(Object.hasOwn(first,'userId'),false);
  assert.deepEqual({...DB.db.prepare('SELECT quantity,breakthrough_level,breakthrough_fail_count FROM user_cards WHERE user_id=99 AND card_id=?').get(TARGETED_CARD_GRANT_V2016_CARD_ID)},
    {quantity:1,breakthrough_level:12,breakthrough_fail_count:0});
  assert.equal(DB.db.prepare("SELECT COUNT(*) count FROM admin_logs WHERE action_type='SYSTEM_CARD_GRANT_V2016'").get().count,1);

  const replay=await ensureTargetedCardGrantV2016({DB});
  assert.equal(replay.replayed,true);
  assert.equal(DB.db.prepare('SELECT quantity FROM user_cards WHERE user_id=99 AND card_id=?').get(TARGETED_CARD_GRANT_V2016_CARD_ID).quantity,1);
  assert.equal(DB.db.prepare("SELECT COUNT(*) count FROM admin_logs WHERE action_type='SYSTEM_CARD_GRANT_V2016'").get().count,1);
  assert.equal(JSON.parse(DB.db.prepare('SELECT value FROM app_meta WHERE key=?').get(TARGETED_CARD_GRANT_V2016_MARKER_KEY).value).status,'COMPLETED');
});

test('기존 카드가 +12 미만이면 한 장을 더하고 정확히 +12로 올린다',async()=>{
  const DB=fixture({quantity:2,level:7,failCount:3});
  const result=await ensureTargetedCardGrantV2016({DB});
  assert.equal(result.quantityBefore,2);
  assert.equal(result.quantityAfter,3);
  assert.equal(result.breakthroughLevel,12);
  assert.deepEqual({...DB.db.prepare('SELECT quantity,breakthrough_level,breakthrough_fail_count FROM user_cards WHERE user_id=99 AND card_id=?').get(TARGETED_CARD_GRANT_V2016_CARD_ID)},
    {quantity:3,breakthrough_level:12,breakthrough_fail_count:0});
});

test('기존 카드가 +12보다 높으면 강화도를 낮추지 않고 한 장만 더한다',async()=>{
  const DB=fixture({quantity:1,level:13,failCount:2});
  const result=await ensureTargetedCardGrantV2016({DB});
  assert.equal(result.quantityAfter,2);
  assert.equal(result.breakthroughLevel,13);
  assert.deepEqual({...DB.db.prepare('SELECT quantity,breakthrough_level,breakthrough_fail_count FROM user_cards WHERE user_id=99 AND card_id=?').get(TARGETED_CARD_GRANT_V2016_CARD_ID)},
    {quantity:2,breakthrough_level:13,breakthrough_fail_count:2});
});

test('사전 조회 후 보유 상태가 바뀌면 지급·로그·RUNNING 마커를 모두 롤백한다',async()=>{
  const DB=fixture({quantity:1,level:4,failCount:1});
  DB.beforeMainBatch=db=>db.prepare('UPDATE user_cards SET breakthrough_level=5 WHERE user_id=? AND card_id=?').run(99,TARGETED_CARD_GRANT_V2016_CARD_ID);
  await assert.rejects(()=>ensureTargetedCardGrantV2016({DB}));
  assert.deepEqual({...DB.db.prepare('SELECT quantity,breakthrough_level FROM user_cards WHERE user_id=99 AND card_id=?').get(TARGETED_CARD_GRANT_V2016_CARD_ID)},
    {quantity:1,breakthrough_level:5});
  assert.equal(DB.db.prepare('SELECT COUNT(*) count FROM admin_logs').get().count,0);
  assert.equal(DB.db.prepare('SELECT COUNT(*) count FROM app_meta WHERE key=?').get(TARGETED_CARD_GRANT_V2016_MARKER_KEY).count,0);
});

test('라이브 health는 +12 지급을 실행하고 계정 식별자는 응답에서 제외한다',()=>{
  const api=readFileSync(new URL('../functions/api/[[path]].js',import.meta.url),'utf8');
  assert.match(api,/ensureTargetedCardGrantV2016\(env\)/);
  assert.match(api,/levelRequested:Number\(simsimiKimseongtaeGrant\.levelRequested\|\|0\)/);
  assert.doesNotMatch(api,/targetedCardGrantV2016=simsimiKimseongtaeGrant;/);
});
