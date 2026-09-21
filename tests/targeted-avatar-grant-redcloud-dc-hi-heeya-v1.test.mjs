import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import test from 'node:test';
import {PGlite} from '@electric-sql/pglite';
import {__postgresCompatTest} from '../functions/_postgres_d1_compat.js';
import {
  TARGETED_AVATAR_GRANT_CODE,
  TARGETED_AVATAR_GRANT_MARKER_KEY,
  TARGETED_AVATAR_GRANT_NICKNAME,
  ensureTargetedAvatarGrantRedcloudDcHiHeeyaV1
} from '../functions/_targeted_avatar_grant_redcloud_dc_hi_heeya_v1.js';

const FUTURE='2099-09-30 12:34:56';
async function fixture({duplicate=false,status='ACTIVE',phase='ACTIVE',endsAt=FUTURE,ownership=undefined}={}){
  const pg=new PGlite();
  await pg.exec(`
    CREATE FUNCTION sqlite_now() RETURNS text LANGUAGE SQL STABLE AS $$SELECT to_char(timezone('UTC',CURRENT_TIMESTAMP),'YYYY-MM-DD HH24:MI:SS')$$;
    CREATE TABLE app_meta(key TEXT PRIMARY KEY,value TEXT NOT NULL,updated_at TEXT DEFAULT sqlite_now());
    CREATE TABLE users(id BIGINT PRIMARY KEY,nickname TEXT NOT NULL,role TEXT NOT NULL,status TEXT NOT NULL,coin BIGINT NOT NULL DEFAULT 0);
    CREATE TABLE avatar_catalog_v1(code TEXT PRIMARY KEY,name TEXT NOT NULL,acquisition_type TEXT DEFAULT 'EVENT',is_active INTEGER DEFAULT 1,is_public INTEGER DEFAULT 1,sale_enabled INTEGER DEFAULT 0);
    CREATE TABLE avatar_user_ownership_v1(user_id BIGINT NOT NULL,avatar_code TEXT NOT NULL,source_type TEXT,source_ref TEXT,acquired_at TEXT DEFAULT sqlite_now(),expires_at TEXT,PRIMARY KEY(user_id,avatar_code));
    CREATE TABLE avatar_user_loadout_v1(user_id BIGINT PRIMARY KEY,avatar_code TEXT);
    CREATE TABLE admin_logs(id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,admin_id BIGINT,action_type TEXT,target_type TEXT,target_id TEXT,before_data TEXT,after_data TEXT,created_at TEXT DEFAULT sqlite_now());
    CREATE TABLE clan_seasons(id BIGINT PRIMARY KEY,season_no BIGINT NOT NULL,phase TEXT NOT NULL,ends_at TEXT NOT NULL);
    INSERT INTO users VALUES(1,'운영자','OWNER','ACTIVE',777),(88,'${TARGETED_AVATAR_GRANT_NICKNAME}','USER','${status}',888);
    INSERT INTO avatar_catalog_v1(code,name) VALUES('${TARGETED_AVATAR_GRANT_CODE}','DC 하이희야');
    INSERT INTO clan_seasons VALUES(4,4,'COMPLETE','2026-09-01 00:00:00'),(5,5,'${phase}','${endsAt}');
  `);
  if(duplicate)await pg.exec(`INSERT INTO users VALUES(89,'${TARGETED_AVATAR_GRANT_NICKNAME}','USER','ACTIVE',999)`);
  if(ownership!==undefined)await pg.query(`INSERT INTO avatar_user_ownership_v1(user_id,avatar_code,source_type,source_ref,expires_at) VALUES(88,$1,'EVENT','existing',$2)`,[TARGETED_AVATAR_GRANT_CODE,ownership]);
  const client={async query(input){const sql=typeof input==='string'?input:input.text,values=typeof input==='string'?[]:input.values||[];const result=await pg.query(sql,values);return {...result,rowCount:result.affectedRows??result.rows.length}}};
  const DB=new __postgresCompatTest.PostgresD1Database(client);
  const q=async(sql,values=[])=>(await pg.query(sql,values)).rows;
  return{pg,DB,q};
}

test('레드클라우드에게 DC 하이희야를 활성 클랜 시즌 종료 시각까지 한 번만 지급한다',async()=>{
  const f=await fixture();
  try{
    const usersBefore=await f.q('SELECT * FROM users ORDER BY id'),loadoutBefore=await f.q('SELECT * FROM avatar_user_loadout_v1');
    const first=await ensureTargetedAvatarGrantRedcloudDcHiHeeyaV1({DB:f.DB});
    assert.equal(first.status,'COMPLETED');assert.equal(first.replayed,false);assert.equal(first.avatarCode,TARGETED_AVATAR_GRANT_CODE);
    assert.equal(first.seasonId,5);assert.equal(first.seasonNo,5);assert.equal(first.expiresAt,FUTURE);assert.equal(first.permanent,false);
    assert.ok(first.remainingSeconds>0);assert.equal(first.ownershipVerified,true);
    assert.deepEqual(await f.q('SELECT * FROM users ORDER BY id'),usersBefore);assert.deepEqual(await f.q('SELECT * FROM avatar_user_loadout_v1'),loadoutBefore);
    assert.deepEqual(await f.q('SELECT source_type,source_ref,expires_at FROM avatar_user_ownership_v1'),[{source_type:'EVENT',source_ref:TARGETED_AVATAR_GRANT_MARKER_KEY,expires_at:FUTURE}]);
    assert.equal(Number((await f.q("SELECT COUNT(*) count FROM admin_logs WHERE action_type='SYSTEM_AVATAR_GRANT_REDCLOUD_DC_HI_HEEYA_V1'"))[0].count),1);
    const replay=await ensureTargetedAvatarGrantRedcloudDcHiHeeyaV1({DB:f.DB});
    assert.equal(replay.replayed,true);assert.equal(replay.ownershipVerified,true);
    assert.equal(Number((await f.q('SELECT COUNT(*) count FROM avatar_user_ownership_v1'))[0].count),1);
    assert.equal(Number((await f.q('SELECT COUNT(*) count FROM admin_logs'))[0].count),1);
  }finally{await f.pg.close()}
});

test('기존 영구 보유권은 기간제로 낮추지 않고, 짧은 기간제만 시즌 종료까지 연장한다',async()=>{
  const permanent=await fixture({ownership:null});
  try{
    const result=await ensureTargetedAvatarGrantRedcloudDcHiHeeyaV1({DB:permanent.DB});
    const kept=(await permanent.q('SELECT source_ref,expires_at FROM avatar_user_ownership_v1'))[0];
    assert.equal(result.permanent,true);assert.equal(kept.source_ref,'existing');assert.equal(kept.expires_at,null);
  }finally{await permanent.pg.close()}
  const temporary=await fixture({ownership:'2026-09-22 00:00:00'});
  try{
    await ensureTargetedAvatarGrantRedcloudDcHiHeeyaV1({DB:temporary.DB});
    assert.equal((await temporary.q('SELECT expires_at FROM avatar_user_ownership_v1'))[0].expires_at,FUTURE);
  }finally{await temporary.pg.close()}
});

test('중복·비활성 계정 또는 종료된 클랜 시즌이면 어떤 지급도 남기지 않는다',async()=>{
  for(const options of [{duplicate:true},{status:'BANNED'},{phase:'COMPLETE'},{endsAt:'2020-01-01 00:00:00'}]){
    const f=await fixture(options);
    try{
      await assert.rejects(()=>ensureTargetedAvatarGrantRedcloudDcHiHeeyaV1({DB:f.DB}));
      assert.deepEqual(await f.q('SELECT * FROM avatar_user_ownership_v1'),[]);
      assert.deepEqual(await f.q('SELECT * FROM admin_logs'),[]);
      assert.deepEqual(await f.q('SELECT * FROM app_meta WHERE key=$1',[TARGETED_AVATAR_GRANT_MARKER_KEY]),[]);
    }finally{await f.pg.close()}
  }
});

test('완료 후 소유권이 회수되면 재지급하지 않고 검증 상태만 false로 보고한다',async()=>{
  const f=await fixture();
  try{
    await ensureTargetedAvatarGrantRedcloudDcHiHeeyaV1({DB:f.DB});
    await f.q('DELETE FROM avatar_user_ownership_v1');
    const replay=await ensureTargetedAvatarGrantRedcloudDcHiHeeyaV1({DB:f.DB});
    assert.equal(replay.replayed,true);assert.equal(replay.ownershipVerified,false);
    assert.deepEqual(await f.q('SELECT * FROM avatar_user_ownership_v1'),[]);
  }finally{await f.pg.close()}
});

test('라이브 health가 시즌 기간제 지급을 실행하되 계정 식별자는 응답에서 제외한다',()=>{
  const api=readFileSync(new URL('../functions/api/[[path]].js',import.meta.url),'utf8');
  assert.match(api,/ensureTargetedAvatarGrantRedcloudDcHiHeeyaV1\(env\)/);
  assert.match(api,/expiresAt:redcloudAvatarGrant\.expiresAt\|\|null,remainingSeconds:Number\(redcloudAvatarGrant\.remainingSeconds\|\|0\)/);
  assert.doesNotMatch(api,/targetedAvatarGrantRedcloudDcHiHeeyaV1=redcloudAvatarGrant;/);
});
