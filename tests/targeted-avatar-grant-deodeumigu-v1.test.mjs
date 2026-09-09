import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { DatabaseSync } from 'node:sqlite';
import test from 'node:test';
import {PGlite} from '@electric-sql/pglite';
import {__postgresCompatTest} from '../functions/_postgres_d1_compat.js';

import {
  TARGETED_AVATAR_GRANT_CODE,
  TARGETED_AVATAR_GRANT_MARKER_KEY,
  TARGETED_AVATAR_GRANT_NICKNAME,
  ensureTargetedAvatarGrantDeodeumiguV1
} from '../functions/_targeted_avatar_grant_deodeumigu_v1.js';

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

function fixture({status='ACTIVE',duplicate=false,ownership='NONE'}={}){
  const DB=new SqliteD1();
  DB.db.exec(`
    CREATE TABLE app_meta(key TEXT PRIMARY KEY,value TEXT NOT NULL,updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP);
    CREATE TABLE users(id INTEGER PRIMARY KEY,nickname TEXT NOT NULL,role TEXT NOT NULL,status TEXT NOT NULL);
    CREATE TABLE avatar_catalog_v1(code TEXT PRIMARY KEY,name TEXT NOT NULL,acquisition_type TEXT NOT NULL DEFAULT 'EVENT',is_active INTEGER NOT NULL DEFAULT 1,is_public INTEGER NOT NULL DEFAULT 1,sale_enabled INTEGER NOT NULL DEFAULT 0);
    CREATE TABLE avatar_user_ownership_v1(user_id INTEGER NOT NULL,avatar_code TEXT NOT NULL,source_type TEXT NOT NULL DEFAULT 'ADMIN',source_ref TEXT NOT NULL DEFAULT '',acquired_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,expires_at TEXT,PRIMARY KEY(user_id,avatar_code));
    CREATE TABLE admin_logs(id INTEGER PRIMARY KEY AUTOINCREMENT,admin_id INTEGER NOT NULL,action_type TEXT NOT NULL,target_type TEXT NOT NULL,target_id TEXT,before_data TEXT,after_data TEXT,created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP);
    INSERT INTO users(id,nickname,role,status) VALUES(1,'운영자','OWNER','ACTIVE'),(88,'${TARGETED_AVATAR_GRANT_NICKNAME}','USER','${status}');
    INSERT INTO avatar_catalog_v1(code,name) VALUES('${TARGETED_AVATAR_GRANT_CODE}','테란여제 조은');
  `);
  if(duplicate)DB.db.prepare('INSERT INTO users(id,nickname,role,status) VALUES(?,?,?,?)').run(89,TARGETED_AVATAR_GRANT_NICKNAME,'USER','ACTIVE');
  if(ownership!=='NONE')DB.db.prepare('INSERT INTO avatar_user_ownership_v1(user_id,avatar_code,source_type,source_ref,expires_at) VALUES(?,?,?,?,?)').run(88,TARGETED_AVATAR_GRANT_CODE,'EVENT',ownership==='PERMANENT'?'existing':'temporary',ownership==='PERMANENT'?null:'2099-01-01 00:00:00');
  return DB;
}

test('활성 더듬이구 계정에 테란여제 조은을 영구 지급하고 재실행하지 않는다',async()=>{
  const DB=fixture();
  const catalogBefore=DB.db.prepare('SELECT * FROM avatar_catalog_v1 WHERE code=?').get(TARGETED_AVATAR_GRANT_CODE);
  const first=await ensureTargetedAvatarGrantDeodeumiguV1({DB});
  assert.equal(first.status,'COMPLETED');
  assert.equal(first.replayed,false);
  assert.equal(first.permanent,true);
  assert.equal(first.alreadyOwned,false);
  assert.equal(Object.hasOwn(first,'nickname'),false);
  assert.equal(Object.hasOwn(first,'userId'),false);

  assert.deepEqual({...DB.db.prepare('SELECT source_type,source_ref,expires_at FROM avatar_user_ownership_v1 WHERE user_id=88 AND avatar_code=?').get(TARGETED_AVATAR_GRANT_CODE)},
    {source_type:'ADMIN_GRANT',source_ref:TARGETED_AVATAR_GRANT_MARKER_KEY,expires_at:null});
  const audit=DB.db.prepare("SELECT admin_id,target_id FROM admin_logs WHERE action_type='SYSTEM_AVATAR_GRANT_DEODEUMIGU_V1'").get();
  assert.equal(audit.admin_id,1);
  assert.equal(Number(audit.target_id),88);
  assert.deepEqual({...DB.db.prepare('SELECT * FROM avatar_catalog_v1 WHERE code=?').get(TARGETED_AVATAR_GRANT_CODE)},{...catalogBefore});
  assert.equal(JSON.parse(DB.db.prepare('SELECT value FROM app_meta WHERE key=?').get(TARGETED_AVATAR_GRANT_MARKER_KEY).value).status,'COMPLETED');

  const replay=await ensureTargetedAvatarGrantDeodeumiguV1({DB});
  assert.equal(replay.replayed,true);
  assert.equal(DB.db.prepare("SELECT COUNT(*) count FROM admin_logs WHERE action_type='SYSTEM_AVATAR_GRANT_DEODEUMIGU_V1'").get().count,1);
});

test('기간제 소유권은 영구로 전환하고 기존 영구 소유권은 덮어쓰지 않는다',async()=>{
  const temporary=fixture({ownership:'TEMPORARY'});
  const upgraded=await ensureTargetedAvatarGrantDeodeumiguV1({DB:temporary});
  assert.equal(upgraded.alreadyOwned,false);
  assert.deepEqual({...temporary.db.prepare('SELECT source_type,source_ref,expires_at FROM avatar_user_ownership_v1 WHERE user_id=88 AND avatar_code=?').get(TARGETED_AVATAR_GRANT_CODE)},
    {source_type:'ADMIN_GRANT',source_ref:TARGETED_AVATAR_GRANT_MARKER_KEY,expires_at:null});

  const permanent=fixture({ownership:'PERMANENT'});
  const preserved=await ensureTargetedAvatarGrantDeodeumiguV1({DB:permanent});
  assert.equal(preserved.alreadyOwned,true);
  assert.deepEqual({...permanent.db.prepare('SELECT source_type,source_ref,expires_at FROM avatar_user_ownership_v1 WHERE user_id=88 AND avatar_code=?').get(TARGETED_AVATAR_GRANT_CODE)},
    {source_type:'EVENT',source_ref:'existing',expires_at:null});
});

test('더듬이구 계정이 비활성이거나 두 개면 지급을 중단한다',async()=>{
  const inactive=fixture({status:'BANNED'});
  await assert.rejects(()=>ensureTargetedAvatarGrantDeodeumiguV1({DB:inactive}),error=>!String(error.message).includes(TARGETED_AVATAR_GRANT_NICKNAME));
  assert.equal(inactive.db.prepare('SELECT COUNT(*) count FROM avatar_user_ownership_v1').get().count,0);

  const duplicate=fixture({duplicate:true});
  await assert.rejects(()=>ensureTargetedAvatarGrantDeodeumiguV1({DB:duplicate}),/정확히 한 개/);
  assert.equal(duplicate.db.prepare('SELECT COUNT(*) count FROM avatar_user_ownership_v1').get().count,0);
});

test('사전 조회 후 계정이 변경되면 소유권·로그·RUNNING 마커를 모두 롤백한다',async()=>{
  const DB=fixture();
  DB.beforeMainBatch=db=>db.prepare('UPDATE users SET nickname=? WHERE id=?').run('변경된계정',88);
  await assert.rejects(()=>ensureTargetedAvatarGrantDeodeumiguV1({DB}));
  assert.equal(DB.db.prepare('SELECT COUNT(*) count FROM avatar_user_ownership_v1').get().count,0);
  assert.equal(DB.db.prepare('SELECT COUNT(*) count FROM admin_logs').get().count,0);
  assert.equal(DB.db.prepare('SELECT COUNT(*) count FROM app_meta WHERE key=?').get(TARGETED_AVATAR_GRANT_MARKER_KEY).count,0);
});

test('라이브 health는 더듬이구 지급을 실행하고 계정 식별자는 응답에서 제외한다',()=>{
  const api=readFileSync(new URL('../functions/api/[[path]].js',import.meta.url),'utf8');
  assert.match(api,/ensureTargetedAvatarGrantDeodeumiguV1\(env\)/);
  assert.match(api,/avatarCode:deodeumiguAvatarGrant\.avatarCode\|\|null,permanent:Boolean\(deodeumiguAvatarGrant\.permanent\)/);
  assert.doesNotMatch(api,/targetedAvatarGrantDeodeumiguV1=deodeumiguAvatarGrant;/);
});

test('완료 마커가 있어도 현재 영구 보유를 재조회하며 회수된 아바타를 재지급하지 않는다',async()=>{
  const DB=fixture();
  const first=await ensureTargetedAvatarGrantDeodeumiguV1({DB});
  assert.equal(first.ownershipVerified,true);
  assert.equal((await ensureTargetedAvatarGrantDeodeumiguV1({DB})).ownershipVerified,true);
  DB.db.prepare('DELETE FROM avatar_user_ownership_v1 WHERE user_id=?').run(88);
  const after=await ensureTargetedAvatarGrantDeodeumiguV1({DB});
  assert.equal(after.ownershipVerified,false);
  assert.equal(DB.db.prepare('SELECT COUNT(*) count FROM avatar_user_ownership_v1').get().count,0);
  assert.equal(DB.db.prepare('SELECT COUNT(*) count FROM admin_logs').get().count,1);
});

test('운영 PostgreSQL 호환 계층에서 원자 지급·재조회·지급 0행 롤백을 검증한다',async()=>{
  const pg=new PGlite();
  try{
    await pg.exec(`
      CREATE FUNCTION sqlite_now() RETURNS text LANGUAGE SQL STABLE AS $$SELECT to_char(timezone('UTC',CURRENT_TIMESTAMP),'YYYY-MM-DD HH24:MI:SS')$$;
      CREATE TABLE app_meta(key TEXT PRIMARY KEY,value TEXT NOT NULL,updated_at TEXT DEFAULT sqlite_now());
      CREATE TABLE users(id BIGINT PRIMARY KEY,nickname TEXT NOT NULL,role TEXT NOT NULL,status TEXT NOT NULL);
      CREATE TABLE avatar_catalog_v1(code TEXT PRIMARY KEY,name TEXT NOT NULL,acquisition_type TEXT DEFAULT 'EVENT',is_active INTEGER DEFAULT 1,is_public INTEGER DEFAULT 1,sale_enabled INTEGER DEFAULT 0);
      CREATE TABLE avatar_user_ownership_v1(user_id BIGINT NOT NULL,avatar_code TEXT NOT NULL,source_type TEXT,source_ref TEXT,acquired_at TEXT DEFAULT sqlite_now(),expires_at TEXT,PRIMARY KEY(user_id,avatar_code));
      CREATE TABLE admin_logs(id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,admin_id BIGINT,action_type TEXT,target_type TEXT,target_id TEXT,before_data TEXT,after_data TEXT,created_at TEXT DEFAULT sqlite_now());
      INSERT INTO users VALUES(1,'운영자','OWNER','ACTIVE'),(88,'더듬이구','USER','ACTIVE');
      INSERT INTO avatar_catalog_v1(code,name) VALUES('TERRAN_EMPRESS_JOEUN','테란여제 조은');
    `);
    const client={async query(input){const sql=typeof input==='string'?input:input.text,values=typeof input==='string'?[]:input.values||[];const r=await pg.query(sql,values);return {...r,rowCount:r.affectedRows??r.rows.length};}};
    const DB=new __postgresCompatTest.PostgresD1Database(client);
    const first=await ensureTargetedAvatarGrantDeodeumiguV1({DB});
    assert.equal(first.status,'COMPLETED');assert.equal(first.ownershipVerified,true);
    assert.equal((await ensureTargetedAvatarGrantDeodeumiguV1({DB})).ownershipVerified,true);
    const grant=(await pg.query('SELECT * FROM avatar_user_ownership_v1')).rows;
    assert.equal(grant.length,1);assert.equal(Number(grant[0].user_id),88);assert.equal(grant[0].expires_at,null);
    assert.equal((await pg.query('SELECT * FROM admin_logs')).rows.length,1);
    await pg.exec(`DELETE FROM avatar_user_ownership_v1; DELETE FROM admin_logs; DELETE FROM app_meta; DELETE FROM targeted_avatar_grant_deodeumigu_v1_verifications;
      CREATE FUNCTION suppress_avatar_grant() RETURNS trigger LANGUAGE plpgsql AS $$BEGIN RETURN NULL; END;$$;
      CREATE TRIGGER suppress_avatar_grant BEFORE INSERT ON avatar_user_ownership_v1 FOR EACH ROW EXECUTE FUNCTION suppress_avatar_grant();`);
    await assert.rejects(()=>ensureTargetedAvatarGrantDeodeumiguV1({DB}));
    for(const table of ['avatar_user_ownership_v1','admin_logs','app_meta','targeted_avatar_grant_deodeumigu_v1_verifications'])
      assert.equal((await pg.query('SELECT * FROM '+table)).rows.length,0,table+' must roll back');
  }finally{await pg.close();}
});
