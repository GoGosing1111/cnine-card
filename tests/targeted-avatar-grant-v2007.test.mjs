import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { DatabaseSync } from 'node:sqlite';
import test from 'node:test';

import {
  TARGETED_AVATAR_GRANT_CODE,
  TARGETED_AVATAR_GRANT_MARKER_KEY,
  TARGETED_AVATAR_GRANT_NICKNAME,
  ensureTargetedAvatarGrantV2007
} from '../functions/_targeted_avatar_grant_v2007.js';

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
  constructor(){this.db=new DatabaseSync(':memory:');this.dialect='d1'}
  prepare(sql){return new SqliteD1Statement(this,sql)}
  async batch(statements){
    this.db.exec('BEGIN');
    try{const results=statements.map(statement=>statement.batch());this.db.exec('COMMIT');return results}
    catch(error){this.db.exec('ROLLBACK');throw error}
  }
}

function fixture({role='OWNER',status='ACTIVE'}={}){
  const DB=new SqliteD1();
  DB.db.exec(`
    CREATE TABLE app_meta(key TEXT PRIMARY KEY,value TEXT NOT NULL,updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP);
    CREATE TABLE users(id INTEGER PRIMARY KEY,nickname TEXT NOT NULL UNIQUE,role TEXT NOT NULL,status TEXT NOT NULL);
    CREATE TABLE avatar_catalog_v1(code TEXT PRIMARY KEY,name TEXT NOT NULL,acquisition_type TEXT NOT NULL DEFAULT 'UNSET',source_label TEXT NOT NULL DEFAULT '',source_detail TEXT NOT NULL DEFAULT '',is_active INTEGER NOT NULL DEFAULT 0,is_public INTEGER NOT NULL DEFAULT 0,sale_enabled INTEGER NOT NULL DEFAULT 0,updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP);
    CREATE TABLE avatar_user_ownership_v1(user_id INTEGER NOT NULL,avatar_code TEXT NOT NULL,source_type TEXT NOT NULL DEFAULT 'ADMIN',source_ref TEXT NOT NULL DEFAULT '',acquired_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,expires_at TEXT,PRIMARY KEY(user_id,avatar_code));
    CREATE TABLE admin_logs(id INTEGER PRIMARY KEY AUTOINCREMENT,admin_id INTEGER NOT NULL,action_type TEXT NOT NULL,target_type TEXT NOT NULL,target_id TEXT,before_data TEXT,after_data TEXT,created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP);
    INSERT INTO users(id,nickname,role,status) VALUES(77,'${TARGETED_AVATAR_GRANT_NICKNAME}','${role}','${status}');
    INSERT INTO avatar_catalog_v1(code,name) VALUES('${TARGETED_AVATAR_GRANT_CODE}','테란여제 조은');
  `);
  return DB;
}

test('핑크빛유두 활성 OWNER에게 테란여제 조은을 영구 지급하고 재실행하지 않는다',async()=>{
  const DB=fixture();
  const first=await ensureTargetedAvatarGrantV2007({DB});
  assert.equal(first.status,'COMPLETED');
  assert.equal(first.replayed,false);
  assert.equal(first.permanent,true);
  assert.equal(first.alreadyOwned,false);

  assert.deepEqual({...DB.db.prepare('SELECT acquisition_type,is_active,is_public,sale_enabled FROM avatar_catalog_v1 WHERE code=?').get(TARGETED_AVATAR_GRANT_CODE)},
    {acquisition_type:'EVENT',is_active:1,is_public:1,sale_enabled:0});
  assert.deepEqual({...DB.db.prepare('SELECT source_type,source_ref,expires_at FROM avatar_user_ownership_v1 WHERE user_id=77 AND avatar_code=?').get(TARGETED_AVATAR_GRANT_CODE)},
    {source_type:'ADMIN_GRANT',source_ref:TARGETED_AVATAR_GRANT_MARKER_KEY,expires_at:null});
  assert.equal(DB.db.prepare("SELECT COUNT(*) count FROM admin_logs WHERE action_type='USER_AVATAR_GRANT_V2007'").get().count,1);
  assert.equal(JSON.parse(DB.db.prepare('SELECT value FROM app_meta WHERE key=?').get(TARGETED_AVATAR_GRANT_MARKER_KEY).value).status,'COMPLETED');

  const replay=await ensureTargetedAvatarGrantV2007({DB});
  assert.equal(replay.replayed,true);
  assert.equal(DB.db.prepare("SELECT COUNT(*) count FROM admin_logs WHERE action_type='USER_AVATAR_GRANT_V2007'").get().count,1);
});

test('동일 닉네임이더라도 활성 OWNER가 아니면 지급을 중단한다',async()=>{
  const DB=fixture({role:'USER'});
  await assert.rejects(()=>ensureTargetedAvatarGrantV2007({DB}),/활성 OWNER/);
  assert.equal(DB.db.prepare('SELECT COUNT(*) count FROM avatar_user_ownership_v1').get().count,0);
  assert.equal(DB.db.prepare('SELECT COUNT(*) count FROM app_meta').get().count,0);
});

test('라이브 health는 지급을 실행하고 계정 식별자는 응답에서 제외한다',()=>{
  const api=readFileSync(new URL('../functions/api/[[path]].js',import.meta.url),'utf8');
  assert.match(api,/await ensureAvatarFoundation\(env\);[\s\S]{0,120}ensureTargetedAvatarGrantV2007\(env\)/);
  assert.match(api,/avatarCode:avatarGrant\.avatarCode\|\|null,permanent:Boolean\(avatarGrant\.permanent\)/);
  assert.doesNotMatch(api,/targetedAvatarGrant=avatarGrant;/);
});
