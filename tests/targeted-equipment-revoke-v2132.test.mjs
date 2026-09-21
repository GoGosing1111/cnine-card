import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {DatabaseSync} from 'node:sqlite';
import test from 'node:test';
import {PGlite} from '@electric-sql/pglite';

import {__postgresCompatTest} from '../functions/_postgres_d1_compat.js';
import {
  TARGETED_EQUIPMENT_REVOKE_V2132_EQUIPMENT_CODE,
  TARGETED_EQUIPMENT_REVOKE_V2132_MARKER_KEY,
  ensureTargetedEquipmentRevokeV2132
} from '../functions/_targeted_equipment_revoke_v2132.js';

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
  constructor(){this.db=new DatabaseSync(':memory:');this.dialect='d1';this.beforeMutationBatch=null}
  prepare(sql){return new SqliteD1Statement(this,sql)}
  async batch(statements){
    if(this.beforeMutationBatch&&statements.some(statement=>statement.sql.includes(TARGETED_EQUIPMENT_REVOKE_V2132_MARKER_KEY))){
      const hook=this.beforeMutationBatch;this.beforeMutationBatch=null;hook(this.db);
    }
    this.db.exec('BEGIN');
    try{const results=statements.map(statement=>statement.batch());this.db.exec('COMMIT');return results}
    catch(error){this.db.exec('ROLLBACK');throw error}
  }
}

const USER_ID=4773,Z_ID=300,H_ID=301;

function createSchema(exec){
  exec(`
    CREATE TABLE app_meta(key TEXT PRIMARY KEY,value TEXT NOT NULL,updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP);
    CREATE TABLE users(id INTEGER PRIMARY KEY,nickname TEXT NOT NULL,role TEXT NOT NULL,status TEXT NOT NULL);
    CREATE TABLE character_equipment_items(id INTEGER PRIMARY KEY,code TEXT NOT NULL UNIQUE,name TEXT NOT NULL,slot TEXT NOT NULL,is_active INTEGER NOT NULL DEFAULT 1);
    CREATE TABLE user_equipment_instances(id INTEGER PRIMARY KEY AUTOINCREMENT,user_id INTEGER NOT NULL,equipment_id INTEGER NOT NULL,source_type TEXT NOT NULL DEFAULT 'ADMIN',source_id TEXT NOT NULL DEFAULT '',request_id TEXT,acquired_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP);
    CREATE TABLE user_equipment_loadout(user_id INTEGER NOT NULL,slot TEXT NOT NULL,instance_id INTEGER NOT NULL UNIQUE,updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,PRIMARY KEY(user_id,slot));
    CREATE TABLE equipment_forge_states_v1(instance_id INTEGER PRIMARY KEY,user_id INTEGER NOT NULL,level INTEGER NOT NULL,revision INTEGER NOT NULL);
    CREATE TABLE admin_logs(id INTEGER PRIMARY KEY AUTOINCREMENT,admin_id INTEGER NOT NULL,action_type TEXT NOT NULL,target_type TEXT NOT NULL,target_id TEXT,before_data TEXT,after_data TEXT,created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP);
  `);
}

function fixture({duplicate=false,inactive=false,withInstances=true}={}){
  const DB=new SqliteD1();createSchema(sql=>DB.db.exec(sql));
  DB.db.exec(`
    INSERT INTO users VALUES(1,'운영자','OWNER','ACTIVE'),(${USER_ID},'진짜디임','USER','${inactive?'BANNED':'ACTIVE'}'),(9000,'다른유저','USER','ACTIVE');
    INSERT INTO character_equipment_items VALUES(${Z_ID},'${TARGETED_EQUIPMENT_REVOKE_V2132_EQUIPMENT_CODE}','Z-BODY','BATTLE_SUIT',1),(${H_ID},'BATTLE_SUIT_H_BODY','H-BODY','BATTLE_SUIT',1);
  `);
  if(duplicate)DB.db.prepare("INSERT INTO users VALUES(4774,'진짜디임','USER','ACTIVE')").run();
  if(withInstances){
    DB.db.exec(`
      INSERT INTO user_equipment_instances(id,user_id,equipment_id,source_type,source_id,request_id) VALUES
        (1001,${USER_ID},${Z_ID},'ADMIN','1','z-one'),(1002,${USER_ID},${Z_ID},'DRAW','pack','z-two'),
        (1003,${USER_ID},${H_ID},'ADMIN','1','h-one'),(1004,9000,${Z_ID},'ADMIN','1','other-z');
      INSERT INTO user_equipment_loadout VALUES(${USER_ID},'BATTLE_SUIT',1001,CURRENT_TIMESTAMP),(9000,'BATTLE_SUIT',1004,CURRENT_TIMESTAMP);
      INSERT INTO equipment_forge_states_v1 VALUES(1002,${USER_ID},4,7),(1003,${USER_ID},2,3),(1004,9000,1,1);
    `);
  }
  return DB;
}

test('진짜디임의 Z-BODY 전량만 장착·강화 상태와 함께 원자 회수하고 감사 스냅샷을 보존한다',async()=>{
  const DB=fixture();
  const first=await ensureTargetedEquipmentRevokeV2132({DB});
  assert.equal(first.status,'COMPLETED');
  assert.equal(first.replayed,false);
  assert.equal(first.removedQuantity,2);
  assert.equal(first.unequippedQuantity,1);
  assert.equal(first.forgedQuantity,1);
  assert.equal(first.alreadyAbsent,false);
  assert.equal(first.ownershipVerified,true);
  assert.doesNotMatch(JSON.stringify(first),/진짜디임|userId|nickname|1001|1002/);
  assert.equal(DB.db.prepare('SELECT COUNT(*) n FROM user_equipment_instances WHERE user_id=? AND equipment_id=?').get(USER_ID,Z_ID).n,0);
  assert.equal(DB.db.prepare('SELECT COUNT(*) n FROM user_equipment_loadout WHERE user_id=?').get(USER_ID).n,0);
  assert.equal(DB.db.prepare('SELECT COUNT(*) n FROM equipment_forge_states_v1 WHERE user_id=? AND instance_id IN(1001,1002)').get(USER_ID).n,0);
  assert.equal(DB.db.prepare('SELECT COUNT(*) n FROM user_equipment_instances WHERE id IN(1003,1004)').get().n,2);
  assert.equal(DB.db.prepare('SELECT COUNT(*) n FROM equipment_forge_states_v1 WHERE instance_id IN(1003,1004)').get().n,2);
  assert.equal(DB.db.prepare('SELECT COUNT(*) n FROM targeted_equipment_revoke_v2132_audit').get().n,2);
  assert.equal(DB.db.prepare("SELECT COUNT(*) n FROM admin_logs WHERE action_type='SYSTEM_EQUIPMENT_REVOKE_V2132'").get().n,1);

  const replay=await ensureTargetedEquipmentRevokeV2132({DB});
  assert.equal(replay.replayed,true);
  assert.equal(replay.ownershipVerified,true);
  assert.equal(DB.db.prepare('SELECT COUNT(*) n FROM targeted_equipment_revoke_v2132_audit').get().n,2);
  assert.equal(DB.db.prepare('SELECT COUNT(*) n FROM admin_logs').get().n,1);
});

test('이미 Z-BODY가 없으면 다른 장비를 건드리지 않고 부재 검증 영수증을 남긴다',async()=>{
  const DB=fixture({withInstances:false});
  DB.db.prepare("INSERT INTO user_equipment_instances(id,user_id,equipment_id,request_id) VALUES(1003,?,?, 'h-only')").run(USER_ID,H_ID);
  const result=await ensureTargetedEquipmentRevokeV2132({DB});
  assert.equal(result.removedQuantity,0);
  assert.equal(result.alreadyAbsent,true);
  assert.equal(result.ownershipVerified,true);
  assert.equal(DB.db.prepare('SELECT COUNT(*) n FROM user_equipment_instances').get().n,1);
  assert.equal(DB.db.prepare('SELECT COUNT(*) n FROM targeted_equipment_revoke_v2132_audit').get().n,0);
  assert.equal(DB.db.prepare('SELECT COUNT(*) n FROM admin_logs').get().n,1);
});

test('계정 식별이 중복되거나 비활성이면 어떤 장비도 회수하지 않는다',async()=>{
  for(const DB of [fixture({duplicate:true}),fixture({inactive:true})]){
    await assert.rejects(()=>ensureTargetedEquipmentRevokeV2132({DB}));
    assert.equal(DB.db.prepare('SELECT COUNT(*) n FROM user_equipment_instances').get().n,4);
    assert.equal(DB.db.prepare('SELECT COUNT(*) n FROM admin_logs').get().n,0);
    assert.equal(DB.db.prepare('SELECT COUNT(*) n FROM app_meta').get().n,0);
  }
});

test('사전 조회 뒤 Z-BODY 보유 수가 바뀌면 회수·감사·완료 마커를 모두 롤백한다',async()=>{
  const DB=fixture();
  DB.beforeMutationBatch=db=>db.prepare("INSERT INTO user_equipment_instances(user_id,equipment_id,request_id) VALUES(?,?, 'late-z')").run(USER_ID,Z_ID);
  await assert.rejects(()=>ensureTargetedEquipmentRevokeV2132({DB}));
  assert.equal(DB.db.prepare('SELECT COUNT(*) n FROM user_equipment_instances WHERE user_id=? AND equipment_id=?').get(USER_ID,Z_ID).n,3);
  assert.equal(DB.db.prepare('SELECT COUNT(*) n FROM admin_logs').get().n,0);
  assert.equal(DB.db.prepare('SELECT COUNT(*) n FROM app_meta').get().n,0);
  assert.equal(DB.db.prepare('SELECT COUNT(*) n FROM targeted_equipment_revoke_v2132_audit').get().n,0);
});

test('운영 PostgreSQL 호환 계층에서도 장착 Z-BODY를 한 번만 회수한다',async t=>{
  const pg=new PGlite();
  await pg.exec(`
    CREATE FUNCTION sqlite_now() RETURNS TEXT LANGUAGE SQL STABLE AS $$SELECT to_char(timezone('UTC',CURRENT_TIMESTAMP),'YYYY-MM-DD HH24:MI:SS')$$;
    CREATE TABLE app_meta(key TEXT PRIMARY KEY,value TEXT NOT NULL,updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP::text);
    CREATE TABLE users(id BIGINT PRIMARY KEY,nickname TEXT NOT NULL,role TEXT NOT NULL,status TEXT NOT NULL);
    CREATE TABLE character_equipment_items(id BIGINT PRIMARY KEY,code TEXT NOT NULL UNIQUE,name TEXT NOT NULL,slot TEXT NOT NULL,is_active INTEGER NOT NULL DEFAULT 1);
    CREATE TABLE user_equipment_instances(id BIGINT GENERATED BY DEFAULT AS IDENTITY PRIMARY KEY,user_id BIGINT NOT NULL,equipment_id BIGINT NOT NULL,source_type TEXT NOT NULL DEFAULT 'ADMIN',source_id TEXT NOT NULL DEFAULT '',request_id TEXT,acquired_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP::text);
    CREATE TABLE user_equipment_loadout(user_id BIGINT NOT NULL,slot TEXT NOT NULL,instance_id BIGINT NOT NULL UNIQUE,updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP::text,PRIMARY KEY(user_id,slot));
    CREATE TABLE equipment_forge_states_v1(instance_id BIGINT PRIMARY KEY,user_id BIGINT NOT NULL,level INTEGER NOT NULL,revision INTEGER NOT NULL);
    CREATE TABLE admin_logs(id BIGINT GENERATED BY DEFAULT AS IDENTITY PRIMARY KEY,admin_id BIGINT NOT NULL,action_type TEXT NOT NULL,target_type TEXT NOT NULL,target_id TEXT,before_data TEXT,after_data TEXT,created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP::text);
    INSERT INTO users VALUES(1,'운영자','OWNER','ACTIVE'),(${USER_ID},'진짜디임','USER','ACTIVE');
    INSERT INTO character_equipment_items VALUES(${Z_ID},'${TARGETED_EQUIPMENT_REVOKE_V2132_EQUIPMENT_CODE}','Z-BODY','BATTLE_SUIT',1);
    INSERT INTO user_equipment_instances(id,user_id,equipment_id,source_type,request_id) VALUES(1001,${USER_ID},${Z_ID},'ADMIN','pg-z');
    INSERT INTO user_equipment_loadout VALUES(${USER_ID},'BATTLE_SUIT',1001,CURRENT_TIMESTAMP::text);
  `);
  const client={async query(input){const sql=typeof input==='string'?input:input.text,values=typeof input==='string'?[]:input.values||[];const result=await pg.query(sql,values);return{...result,rowCount:result.affectedRows??result.rows.length}},async end(){await pg.close()}};
  const DB=new __postgresCompatTest.PostgresD1Database(client);t.after(async()=>{await DB.close()});
  const first=await ensureTargetedEquipmentRevokeV2132({DB});
  assert.equal(first.removedQuantity,1);
  assert.equal(first.unequippedQuantity,1);
  assert.equal(Number((await pg.query('SELECT COUNT(*) n FROM user_equipment_instances')).rows[0].n),0);
  assert.equal(Number((await pg.query('SELECT COUNT(*) n FROM user_equipment_loadout')).rows[0].n),0);
  assert.equal(Number((await pg.query('SELECT COUNT(*) n FROM targeted_equipment_revoke_v2132_audit')).rows[0].n),1);
  assert.equal((await ensureTargetedEquipmentRevokeV2132({DB})).replayed,true);
});

test('라이브 health가 회수 결과를 비식별 요약으로만 노출한다',()=>{
  const api=readFileSync(new URL('../functions/api/[[path]].js',import.meta.url),'utf8');
  assert.match(api,/await ensureEquipmentFoundation\(env\);\s*await ensureForgeTransactionSchema\(env\);\s*const equipmentRevoke=await ensureTargetedEquipmentRevokeV2132\(env\)/);
  assert.match(api,/targetedEquipmentRevokeV2132=equipmentRevoke\?\{/);
  assert.match(api,/ownershipVerified:Boolean\(equipmentRevoke\.ownershipVerified\)/);
  assert.match(api,/targetedSkillChipGrantV2055,targetedEquipmentRevokeV2132,battleSuitEbodyPityV2059/);
  assert.doesNotMatch(api,/targetedEquipmentRevokeV2132=equipmentRevoke;/);
});
