import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {DatabaseSync} from 'node:sqlite';
import test from 'node:test';
import {PGlite} from '@electric-sql/pglite';

import {__postgresCompatTest} from '../functions/_postgres_d1_compat.js';
import {
  TARGETED_SKILL_CHIP_GRANT_V2055_ITEMS,
  TARGETED_SKILL_CHIP_GRANT_V2055_MARKER_KEY,
  TARGETED_SKILL_CHIP_GRANT_V2055_NICKNAMES,
  ensureTargetedSkillChipGrantV2055
} from '../functions/_targeted_skill_chip_grant_v2055.js';

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

const USER_IDS=Object.freeze({진짜디임:5501,핑크빛유두:5502});

function fixture({inactiveNickname=null,duplicateNickname=null,inactiveItemCode=null,holdings=[]}={}){
  const DB=new SqliteD1();
  DB.db.exec(`
    CREATE TABLE app_meta(key TEXT PRIMARY KEY,value TEXT NOT NULL,updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP);
    CREATE TABLE users(id INTEGER PRIMARY KEY,nickname TEXT NOT NULL,role TEXT NOT NULL,status TEXT NOT NULL);
    CREATE TABLE inventory_items(code TEXT PRIMARY KEY,name TEXT NOT NULL,category TEXT,rarity TEXT,is_active INTEGER NOT NULL DEFAULT 1);
    CREATE TABLE cnine_user_inventory(user_id INTEGER NOT NULL,item_code TEXT NOT NULL,quantity INTEGER NOT NULL DEFAULT 0,unseen_quantity INTEGER NOT NULL DEFAULT 0,created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,PRIMARY KEY(user_id,item_code));
    CREATE TABLE inventory_logs(id INTEGER PRIMARY KEY AUTOINCREMENT,user_id INTEGER NOT NULL,item_code TEXT NOT NULL,change_amount INTEGER NOT NULL,balance_after INTEGER NOT NULL,reason TEXT,reference_type TEXT,reference_id TEXT,admin_id INTEGER,created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP);
    CREATE TABLE admin_logs(id INTEGER PRIMARY KEY AUTOINCREMENT,admin_id INTEGER NOT NULL,action_type TEXT NOT NULL,target_type TEXT NOT NULL,target_id TEXT,before_data TEXT,after_data TEXT,created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP);
    INSERT INTO users(id,nickname,role,status) VALUES(1,'운영자','OWNER','ACTIVE');
  `);
  TARGETED_SKILL_CHIP_GRANT_V2055_NICKNAMES.forEach(nickname=>{
    DB.db.prepare('INSERT INTO users(id,nickname,role,status) VALUES(?,?,?,?)').run(USER_IDS[nickname],nickname,'USER',inactiveNickname===nickname?'BANNED':'ACTIVE');
  });
  if(duplicateNickname)DB.db.prepare('INSERT INTO users(id,nickname,role,status) VALUES(?,?,?,?)').run(5599,duplicateNickname,'USER','ACTIVE');
  TARGETED_SKILL_CHIP_GRANT_V2055_ITEMS.forEach(item=>{
    DB.db.prepare('INSERT INTO inventory_items(code,name,category,rarity,is_active) VALUES(?,?,?,?,?)').run(item.code,item.name,'SKILL_CHIP','SPECIAL',inactiveItemCode===item.code?0:1);
  });
  holdings.forEach(({nickname,itemCode,quantity,unseen=0})=>{
    DB.db.prepare('INSERT INTO cnine_user_inventory(user_id,item_code,quantity,unseen_quantity) VALUES(?,?,?,?)').run(USER_IDS[nickname],itemCode,quantity,unseen);
  });
  return DB;
}

function holding(DB,nickname,itemCode){
  return DB.db.prepare('SELECT quantity,unseen_quantity FROM cnine_user_inventory WHERE user_id=? AND item_code=?').get(USER_IDS[nickname],itemCode);
}

async function postgresFixture(t){
  const pg=new PGlite();
  await pg.exec(`
    CREATE FUNCTION sqlite_now() RETURNS text LANGUAGE SQL STABLE AS $$SELECT to_char(timezone('UTC',CURRENT_TIMESTAMP),'YYYY-MM-DD HH24:MI:SS')$$;
    CREATE TABLE app_meta(key TEXT PRIMARY KEY,value TEXT NOT NULL,updated_at TEXT NOT NULL DEFAULT sqlite_now());
    CREATE TABLE users(id BIGINT PRIMARY KEY,nickname TEXT NOT NULL,role TEXT NOT NULL,status TEXT NOT NULL);
    CREATE TABLE inventory_items(code TEXT PRIMARY KEY,name TEXT NOT NULL,category TEXT,rarity TEXT,is_active INTEGER NOT NULL DEFAULT 1);
    CREATE TABLE cnine_user_inventory(user_id BIGINT NOT NULL,item_code TEXT NOT NULL,quantity INTEGER NOT NULL DEFAULT 0,unseen_quantity INTEGER NOT NULL DEFAULT 0,created_at TEXT NOT NULL DEFAULT sqlite_now(),updated_at TEXT NOT NULL DEFAULT sqlite_now(),PRIMARY KEY(user_id,item_code));
    CREATE TABLE inventory_logs(id BIGSERIAL PRIMARY KEY,user_id BIGINT NOT NULL,item_code TEXT NOT NULL,change_amount INTEGER NOT NULL,balance_after INTEGER NOT NULL,reason TEXT,reference_type TEXT,reference_id TEXT,admin_id BIGINT,created_at TEXT NOT NULL DEFAULT sqlite_now());
    CREATE TABLE admin_logs(id BIGSERIAL PRIMARY KEY,admin_id BIGINT NOT NULL,action_type TEXT NOT NULL,target_type TEXT NOT NULL,target_id TEXT,before_data TEXT,after_data TEXT,created_at TEXT NOT NULL DEFAULT sqlite_now());
    INSERT INTO users(id,nickname,role,status) VALUES(1,'운영자','OWNER','ACTIVE'),(5501,'진짜디임','USER','ACTIVE'),(5502,'핑크빛유두','USER','ACTIVE');
    INSERT INTO inventory_items(code,name,category,rarity,is_active) VALUES
      ('SKILL_CHIP_ROCKET_LAUNCHER','로켓런처 스킬칩','SKILL_CHIP','SPECIAL',1),
      ('SKILL_CHIP_HELICOPTER_AIRSTRIKE','헬기폭격 스킬칩','SKILL_CHIP','SPECIAL',1);
  `);
  const client={
    async query(input){
      const sql=typeof input==='string'?input:input.text,values=typeof input==='string'?[]:input.values||[];
      const result=await pg.query(sql,values);
      return{...result,rowCount:result.affectedRows??result.rows.length};
    },
    async end(){await pg.close()}
  };
  const DB=new __postgresCompatTest.PostgresD1Database(client);
  t.after(()=>DB.close());
  return{DB,pg};
}

test('진짜디임과 핑크빛유두에게 로켓런처·헬기폭격 스킬칩을 각각 한 번만 영구 지급한다',async()=>{
  const DB=fixture();
  const first=await ensureTargetedSkillChipGrantV2055({DB});
  assert.equal(first.status,'COMPLETED');
  assert.equal(first.replayed,false);
  assert.equal(first.permanent,true);
  assert.equal(first.accountCount,2);
  assert.equal(first.itemCount,2);
  assert.equal(first.verifiedPairs,4);
  assert.equal(first.quantityGranted,4);
  assert.equal(first.alreadyOwned,0);
  assert.doesNotMatch(JSON.stringify(first),/진짜디임|핑크빛유두|userId|nickname/);
  for(const nickname of TARGETED_SKILL_CHIP_GRANT_V2055_NICKNAMES){
    for(const item of TARGETED_SKILL_CHIP_GRANT_V2055_ITEMS){
      assert.deepEqual({...holding(DB,nickname,item.code)},{quantity:1,unseen_quantity:1});
    }
  }
  assert.equal(DB.db.prepare("SELECT COUNT(*) count FROM inventory_logs WHERE reference_type='SYSTEM_GRANT'").get().count,4);
  assert.equal(DB.db.prepare("SELECT COUNT(*) count FROM admin_logs WHERE action_type='SYSTEM_SKILL_CHIP_GRANT_V2055'").get().count,4);

  const replay=await ensureTargetedSkillChipGrantV2055({DB});
  assert.equal(replay.replayed,true);
  assert.equal(replay.quantityGranted,4);
  assert.equal(DB.db.prepare('SELECT SUM(quantity) total FROM cnine_user_inventory').get().total,4);
  assert.equal(DB.db.prepare('SELECT COUNT(*) count FROM inventory_logs').get().count,4);
  assert.equal(JSON.parse(DB.db.prepare('SELECT value FROM app_meta WHERE key=?').get(TARGETED_SKILL_CHIP_GRANT_V2055_MARKER_KEY).value).status,'COMPLETED');
});

test('이미 보유한 스킬칩은 중복 적립하지 않고 미보유 조합만 지급한다',async()=>{
  const rocket=TARGETED_SKILL_CHIP_GRANT_V2055_ITEMS[0].code;
  const airstrike=TARGETED_SKILL_CHIP_GRANT_V2055_ITEMS[1].code;
  const DB=fixture({holdings:[
    {nickname:'진짜디임',itemCode:rocket,quantity:5,unseen:2},
    {nickname:'핑크빛유두',itemCode:airstrike,quantity:2,unseen:0}
  ]});
  const result=await ensureTargetedSkillChipGrantV2055({DB});
  assert.equal(result.quantityGranted,2);
  assert.equal(result.alreadyOwned,2);
  assert.deepEqual({...holding(DB,'진짜디임',rocket)},{quantity:5,unseen_quantity:2});
  assert.deepEqual({...holding(DB,'핑크빛유두',airstrike)},{quantity:2,unseen_quantity:0});
  assert.deepEqual({...holding(DB,'진짜디임',airstrike)},{quantity:1,unseen_quantity:1});
  assert.deepEqual({...holding(DB,'핑크빛유두',rocket)},{quantity:1,unseen_quantity:1});
  assert.equal(DB.db.prepare('SELECT COUNT(*) count FROM inventory_logs').get().count,2);
  assert.equal(DB.db.prepare('SELECT COUNT(*) count FROM admin_logs').get().count,2);
});

test('운영 PostgreSQL 호환 계층에서도 네 조합을 원자적으로 지급하고 재실행하지 않는다',async t=>{
  const {DB,pg}=await postgresFixture(t);
  const first=await ensureTargetedSkillChipGrantV2055({DB});
  assert.equal(first.status,'COMPLETED');
  assert.equal(first.quantityGranted,4);
  const holdings=(await pg.query('SELECT user_id,item_code,quantity,unseen_quantity FROM cnine_user_inventory ORDER BY user_id,item_code')).rows;
  assert.equal(holdings.length,4);
  assert.ok(holdings.every(row=>Number(row.quantity)===1&&Number(row.unseen_quantity)===1));
  assert.equal(Number((await pg.query('SELECT COUNT(*) count FROM inventory_logs')).rows[0].count),4);
  assert.equal(Number((await pg.query('SELECT COUNT(*) count FROM admin_logs')).rows[0].count),4);
  const replay=await ensureTargetedSkillChipGrantV2055({DB});
  assert.equal(replay.replayed,true);
  assert.equal(Number((await pg.query('SELECT SUM(quantity) total FROM cnine_user_inventory')).rows[0].total),4);
});

test('두 대상 계정과 두 스킬칩이 모두 유일한 활성 상태일 때만 지급한다',async()=>{
  const invalidFixtures=[
    fixture({inactiveNickname:'진짜디임'}),
    fixture({duplicateNickname:'핑크빛유두'}),
    fixture({inactiveItemCode:TARGETED_SKILL_CHIP_GRANT_V2055_ITEMS[0].code})
  ];
  for(const DB of invalidFixtures){
    await assert.rejects(()=>ensureTargetedSkillChipGrantV2055({DB}));
    assert.equal(DB.db.prepare('SELECT COUNT(*) count FROM cnine_user_inventory').get().count,0);
    assert.equal(DB.db.prepare('SELECT COUNT(*) count FROM inventory_logs').get().count,0);
    assert.equal(DB.db.prepare('SELECT COUNT(*) count FROM app_meta').get().count,0);
  }
});

test('사전 조회 뒤 보유 상태가 바뀌면 네 조합의 지급·로그·마커를 전부 롤백한다',async()=>{
  const rocket=TARGETED_SKILL_CHIP_GRANT_V2055_ITEMS[0].code;
  const DB=fixture({holdings:[{nickname:'진짜디임',itemCode:rocket,quantity:0,unseen:0}]});
  DB.beforeMainBatch=db=>db.prepare('UPDATE cnine_user_inventory SET quantity=1 WHERE user_id=? AND item_code=?').run(USER_IDS.진짜디임,rocket);
  await assert.rejects(()=>ensureTargetedSkillChipGrantV2055({DB}));
  assert.deepEqual({...holding(DB,'진짜디임',rocket)},{quantity:1,unseen_quantity:0});
  assert.equal(DB.db.prepare('SELECT COUNT(*) count FROM cnine_user_inventory').get().count,1);
  assert.equal(DB.db.prepare('SELECT COUNT(*) count FROM inventory_logs').get().count,0);
  assert.equal(DB.db.prepare('SELECT COUNT(*) count FROM admin_logs').get().count,0);
  assert.equal(DB.db.prepare('SELECT COUNT(*) count FROM app_meta').get().count,0);
});

test('라이브 health는 카탈로그 보장 뒤 일회 지급을 실행하고 계정 식별자를 응답에서 제외한다',()=>{
  const api=readFileSync(new URL('../functions/api/[[path]].js',import.meta.url),'utf8');
  assert.match(api,/await ensureSkillChipFoundation\(env\);\s*const skillChipGrant=await ensureTargetedSkillChipGrantV2055\(env\)/);
  assert.match(api,/targetedSkillChipGrantV2055=skillChipGrant\?\{/);
  assert.match(api,/quantityGranted:Number\(skillChipGrant\.quantityGranted\|\|0\)/);
  assert.match(api,/targetedSkillChipGrantV2055,iyejunFurRerollRecovery/);
  assert.doesNotMatch(api,/targetedSkillChipGrantV2055=skillChipGrant;/);
});
