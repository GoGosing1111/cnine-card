import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {DatabaseSync} from 'node:sqlite';
import test from 'node:test';

import {
  TARGETED_INVENTORY_GRANT_V2026_ITEM_CODE,
  TARGETED_INVENTORY_GRANT_V2026_MARKER_KEY,
  TARGETED_INVENTORY_GRANT_V2026_NICKNAME,
  TARGETED_INVENTORY_GRANT_V2026_QUANTITY,
  ensureTargetedInventoryGrantV2026
} from '../functions/_targeted_inventory_grant_v2026.js';

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

function fixture({status='ACTIVE',quantity=null,unseen=0,duplicate=false,itemActive=1,nickname=TARGETED_INVENTORY_GRANT_V2026_NICKNAME}={}){
  const DB=new SqliteD1();
  DB.db.exec(`
    CREATE TABLE app_meta(key TEXT PRIMARY KEY,value TEXT NOT NULL,updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP);
    CREATE TABLE users(id INTEGER PRIMARY KEY,nickname TEXT NOT NULL,role TEXT NOT NULL,status TEXT NOT NULL);
    CREATE TABLE inventory_items(code TEXT PRIMARY KEY,name TEXT NOT NULL,category TEXT,rarity TEXT,is_active INTEGER NOT NULL DEFAULT 1);
    CREATE TABLE cnine_user_inventory(user_id INTEGER NOT NULL,item_code TEXT NOT NULL,quantity INTEGER NOT NULL DEFAULT 0,unseen_quantity INTEGER NOT NULL DEFAULT 0,created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,PRIMARY KEY(user_id,item_code));
    CREATE TABLE inventory_logs(id INTEGER PRIMARY KEY AUTOINCREMENT,user_id INTEGER NOT NULL,item_code TEXT NOT NULL,change_amount INTEGER NOT NULL,balance_after INTEGER NOT NULL,reason TEXT,reference_type TEXT,reference_id TEXT,admin_id INTEGER,created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP);
    CREATE TABLE admin_logs(id INTEGER PRIMARY KEY AUTOINCREMENT,admin_id INTEGER NOT NULL,action_type TEXT NOT NULL,target_type TEXT NOT NULL,target_id TEXT,before_data TEXT,after_data TEXT,created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP);
    INSERT INTO users(id,nickname,role,status) VALUES(1,'운영자','OWNER','ACTIVE'),(5206,'${nickname}','USER','${status}');
    INSERT INTO inventory_items(code,name,category,rarity,is_active) VALUES('${TARGETED_INVENTORY_GRANT_V2026_ITEM_CODE}','고등급 재뽑기권','REROLL','SPECIAL',${itemActive});
  `);
  if(duplicate)DB.db.prepare('INSERT INTO users(id,nickname,role,status) VALUES(?,?,?,?)').run(5207,TARGETED_INVENTORY_GRANT_V2026_NICKNAME,'USER','ACTIVE');
  if(quantity!==null)DB.db.prepare('INSERT INTO cnine_user_inventory(user_id,item_code,quantity,unseen_quantity) VALUES(?,?,?,?)').run(5206,TARGETED_INVENTORY_GRANT_V2026_ITEM_CODE,quantity,unseen);
  return DB;
}

test('X수댕 계정에 고등급 재뽑기권 1개를 한 번만 지급한다',async()=>{
  const DB=fixture();
  const first=await ensureTargetedInventoryGrantV2026({DB});
  assert.equal(first.status,'COMPLETED');
  assert.equal(first.replayed,false);
  assert.equal(first.quantityGranted,TARGETED_INVENTORY_GRANT_V2026_QUANTITY);
  assert.equal(first.quantityBefore,0);
  assert.equal(first.quantityAfter,1);
  assert.equal(first.unseenAfter,1);
  assert.equal(Object.hasOwn(first,'nickname'),false);
  assert.equal(Object.hasOwn(first,'userId'),false);
  assert.deepEqual({...DB.db.prepare('SELECT quantity,unseen_quantity FROM cnine_user_inventory WHERE user_id=5206 AND item_code=?').get(TARGETED_INVENTORY_GRANT_V2026_ITEM_CODE)},{quantity:1,unseen_quantity:1});
  assert.equal(DB.db.prepare("SELECT COUNT(*) count FROM inventory_logs WHERE reference_type='SYSTEM_GRANT'").get().count,1);
  assert.equal(DB.db.prepare("SELECT COUNT(*) count FROM admin_logs WHERE action_type='SYSTEM_INVENTORY_GRANT_V2026'").get().count,1);

  const replay=await ensureTargetedInventoryGrantV2026({DB});
  assert.equal(replay.replayed,true);
  assert.deepEqual({...DB.db.prepare('SELECT quantity,unseen_quantity FROM cnine_user_inventory WHERE user_id=5206 AND item_code=?').get(TARGETED_INVENTORY_GRANT_V2026_ITEM_CODE)},{quantity:1,unseen_quantity:1});
  assert.equal(JSON.parse(DB.db.prepare('SELECT value FROM app_meta WHERE key=?').get(TARGETED_INVENTORY_GRANT_V2026_MARKER_KEY).value).status,'COMPLETED');
});

test('기존 보유량과 미확인 수량에 정확히 1개만 더한다',async()=>{
  const DB=fixture({quantity:4,unseen:2});
  const result=await ensureTargetedInventoryGrantV2026({DB});
  assert.equal(result.quantityBefore,4);
  assert.equal(result.quantityAfter,5);
  assert.equal(result.unseenBefore,2);
  assert.equal(result.unseenAfter,3);
  assert.deepEqual({...DB.db.prepare('SELECT quantity,unseen_quantity FROM cnine_user_inventory WHERE user_id=5206 AND item_code=?').get(TARGETED_INVENTORY_GRANT_V2026_ITEM_CODE)},{quantity:5,unseen_quantity:3});
  assert.deepEqual({...DB.db.prepare('SELECT change_amount,balance_after FROM inventory_logs').get()},{change_amount:1,balance_after:5});
});

test('영문 X의 대소문자와 바깥 공백 차이는 유일 계정일 때만 보정한다',async()=>{
  const DB=fixture({nickname:' x수댕 '});
  const result=await ensureTargetedInventoryGrantV2026({DB});
  assert.equal(result.status,'COMPLETED');
  assert.equal(result.quantityAfter,1);
  assert.deepEqual({...DB.db.prepare('SELECT quantity,unseen_quantity FROM cnine_user_inventory WHERE user_id=5206 AND item_code=?').get(TARGETED_INVENTORY_GRANT_V2026_ITEM_CODE)},{quantity:1,unseen_quantity:1});
});

test('대상 계정 또는 아이템이 유일한 활성 상태가 아니면 지급하지 않는다',async()=>{
  for(const DB of [fixture({status:'BANNED'}),fixture({duplicate:true}),fixture({itemActive:0})]){
    await assert.rejects(()=>ensureTargetedInventoryGrantV2026({DB}));
    assert.equal(DB.db.prepare('SELECT COUNT(*) count FROM cnine_user_inventory').get().count,0);
    assert.equal(DB.db.prepare('SELECT COUNT(*) count FROM app_meta').get().count,0);
  }
});

test('사전 조회 후 보유량이 바뀌면 지급·로그·마커를 모두 롤백한다',async()=>{
  const DB=fixture({quantity:2,unseen:1});
  DB.beforeMainBatch=db=>db.prepare('UPDATE cnine_user_inventory SET quantity=quantity+1 WHERE user_id=? AND item_code=?').run(5206,TARGETED_INVENTORY_GRANT_V2026_ITEM_CODE);
  await assert.rejects(()=>ensureTargetedInventoryGrantV2026({DB}));
  assert.deepEqual({...DB.db.prepare('SELECT quantity,unseen_quantity FROM cnine_user_inventory WHERE user_id=5206 AND item_code=?').get(TARGETED_INVENTORY_GRANT_V2026_ITEM_CODE)},{quantity:3,unseen_quantity:1});
  assert.equal(DB.db.prepare('SELECT COUNT(*) count FROM inventory_logs').get().count,0);
  assert.equal(DB.db.prepare('SELECT COUNT(*) count FROM admin_logs').get().count,0);
  assert.equal(DB.db.prepare('SELECT COUNT(*) count FROM app_meta').get().count,0);
});

test('라이브 health는 카탈로그 보장 뒤 지급을 실행하고 계정 식별자는 응답에서 제외한다',()=>{
  const api=readFileSync(new URL('../functions/api/[[path]].js',import.meta.url),'utf8');
  assert.match(api,/ensureHighGradeRerollFoundation\(env\);\s*const xsudaengHighGradeRerollGrant=await ensureTargetedInventoryGrantV2026\(env\)/);
  assert.match(api,/quantityGranted:Number\(xsudaengHighGradeRerollGrant\.quantityGranted\|\|0\)/);
  assert.match(api,/targetedInventoryGrantV2026/);
  assert.doesNotMatch(api,/targetedInventoryGrantV2026=xsudaengHighGradeRerollGrant;/);
});
