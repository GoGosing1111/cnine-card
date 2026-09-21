import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import test from 'node:test';
import {PGlite} from '@electric-sql/pglite';
import {__postgresCompatTest} from '../functions/_postgres_d1_compat.js';
import {MERCENARY_CMS_SEED} from '../functions/_mercenary_cms_seed.js';
import {
  TARGETED_REWARD_GRANT_20260921_COIN,
  TARGETED_REWARD_GRANT_20260921_EQUIPMENT_CODE,
  TARGETED_REWARD_GRANT_20260921_MARKER_KEY,
  TARGETED_REWARD_GRANT_20260921_TARGETS,
  ensureTargetedRewardGrant20260921V1
} from '../functions/_targeted_reward_grant_20260921_v1.js';

async function fixture({duplicateTarget=false,ownedMercenary=0,hBodyQuantity=0}={}){
  const pg=new PGlite();
  const document=structuredClone(MERCENARY_CMS_SEED.document);
  for(const mercenary of document.mercenaries)if(mercenary.code==='V-001'||mercenary.code==='V-002'){
    mercenary.rank='S';
  }
  await pg.exec(`
    CREATE FUNCTION sqlite_now() RETURNS text LANGUAGE SQL STABLE AS $$SELECT to_char(timezone('UTC',CURRENT_TIMESTAMP),'YYYY-MM-DD HH24:MI:SS')$$;
    CREATE TABLE app_meta(key TEXT PRIMARY KEY,value TEXT NOT NULL,updated_at TEXT DEFAULT sqlite_now());
    CREATE TABLE users(id BIGINT PRIMARY KEY,nickname TEXT NOT NULL,role TEXT NOT NULL,status TEXT NOT NULL,coin BIGINT NOT NULL DEFAULT 0);
    CREATE TABLE admin_logs(id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,admin_id BIGINT,action_type TEXT,target_type TEXT,target_id TEXT,before_data TEXT,after_data TEXT,created_at TEXT DEFAULT sqlite_now());
    CREATE TABLE coin_logs(id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,user_id BIGINT,change_amount BIGINT,balance_after BIGINT,reason TEXT,admin_id BIGINT,created_at TEXT DEFAULT sqlite_now());
    CREATE TABLE mercenary_cms_documents_v1(doc_key TEXT PRIMARY KEY,payload_json TEXT NOT NULL,revision INTEGER NOT NULL,last_request_id TEXT NOT NULL,updated_by BIGINT NOT NULL,created_at TEXT NOT NULL,updated_at TEXT NOT NULL);
    CREATE TABLE user_mercenary_cards_v1(user_id BIGINT NOT NULL,mercenary_code TEXT NOT NULL,total_copies INTEGER NOT NULL,duplicate_count INTEGER NOT NULL,first_obtained_at TEXT NOT NULL,last_obtained_at TEXT NOT NULL,PRIMARY KEY(user_id,mercenary_code));
    CREATE TABLE mercenary_card_acquisitions_v1(acquisition_id TEXT PRIMARY KEY,user_id BIGINT NOT NULL,mercenary_code TEXT NOT NULL,is_duplicate INTEGER NOT NULL,total_copies_after INTEGER NOT NULL,duplicate_count_after INTEGER NOT NULL,created_at TEXT NOT NULL);
    CREATE TABLE character_equipment_items(id BIGINT PRIMARY KEY,code TEXT UNIQUE,name TEXT,slot TEXT,is_active INTEGER,is_public INTEGER);
    CREATE TABLE user_equipment_instances(id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,user_id BIGINT,equipment_id BIGINT,source_type TEXT,source_id TEXT,request_id TEXT,acquired_at TEXT DEFAULT sqlite_now());
    INSERT INTO users VALUES
      (1,'운영자','OWNER','ACTIVE',777),
      (101,'${TARGETED_REWARD_GRANT_20260921_TARGETS.mercenary}','USER','ACTIVE',100),
      (102,'${TARGETED_REWARD_GRANT_20260921_TARGETS.coin}','USER','ACTIVE',123),
      (103,'${TARGETED_REWARD_GRANT_20260921_TARGETS.hBody}','USER','ACTIVE',456);
    INSERT INTO character_equipment_items VALUES(9001,'${TARGETED_REWARD_GRANT_20260921_EQUIPMENT_CODE}','H-BODY','BATTLE_SUIT',1,1);
  `);
  await pg.query(`INSERT INTO mercenary_cms_documents_v1 VALUES('config',$1,7,'fixture',1,$2,$2)`,[JSON.stringify(document),new Date().toISOString()]);
  if(duplicateTarget)await pg.exec(`INSERT INTO users VALUES(104,'${TARGETED_REWARD_GRANT_20260921_TARGETS.mercenary}','USER','ACTIVE',999)`);
  if(ownedMercenary>0)await pg.query(`INSERT INTO user_mercenary_cards_v1 VALUES(101,'V-001',$1,$2,$3,$3)`,[ownedMercenary,ownedMercenary-1,new Date().toISOString()]);
  for(let index=0;index<hBodyQuantity;index++)await pg.query(`INSERT INTO user_equipment_instances(user_id,equipment_id,source_type,source_id,request_id) VALUES(103,9001,'OLD','old',$1)`,[`old-${index}`]);
  const client={async query(input){const sql=typeof input==='string'?input:input.text,values=typeof input==='string'?[]:input.values||[];const result=await pg.query(sql,values);return {...result,rowCount:result.affectedRows??result.rows.length}}};
  const DB=new __postgresCompatTest.PostgresD1Database(client);
  const q=async(sql,values=[])=>(await pg.query(sql,values)).rows;
  return{pg,DB,q};
}

test('세 지정 계정에 S급 랜덤 용병·3천억·H-BODY를 원자적으로 한 번 지급한다',async()=>{
  const f=await fixture();
  try{
    const result=await ensureTargetedRewardGrant20260921V1({DB:f.DB},{randomInt:()=>0});
    assert.equal(result.status,'COMPLETED');assert.equal(result.replayed,false);
    assert.equal(result.mercenary.code,'V-001');assert.equal(result.mercenary.rank,'S');assert.equal(result.mercenary.duplicate,false);
    assert.equal(result.coin.amount,TARGETED_REWARD_GRANT_20260921_COIN);assert.equal(result.coin.balanceAfter,'300000000123');
    assert.equal(result.hBody.equipmentCode,TARGETED_REWARD_GRANT_20260921_EQUIPMENT_CODE);assert.equal(result.verification.all,true);
    assert.deepEqual(await f.q('SELECT mercenary_code,total_copies,duplicate_count FROM user_mercenary_cards_v1'),[{mercenary_code:'V-001',total_copies:1,duplicate_count:0}]);
    assert.equal((await f.q('SELECT coin FROM users WHERE id=102'))[0].coin,300000000123);
    assert.equal(Number((await f.q('SELECT COUNT(*) count FROM user_equipment_instances WHERE user_id=103'))[0].count),1);
    assert.equal(Number((await f.q('SELECT COUNT(*) count FROM admin_logs'))[0].count),3);
    const replay=await ensureTargetedRewardGrant20260921V1({DB:f.DB},{randomInt:()=>1});
    assert.equal(replay.replayed,true);assert.equal(replay.mercenary.code,'V-001');assert.equal(replay.verification.all,true);
    assert.equal((await f.q('SELECT coin FROM users WHERE id=102'))[0].coin,300000000123);
    assert.equal(Number((await f.q('SELECT COUNT(*) count FROM user_equipment_instances WHERE user_id=103'))[0].count),1);
  }finally{await f.pg.close()}
});

test('기존 S급 중복과 기존 H-BODY가 있어도 각각 정확히 한 장·한 개만 추가한다',async()=>{
  const f=await fixture({ownedMercenary:2,hBodyQuantity:1});
  try{
    const result=await ensureTargetedRewardGrant20260921V1({DB:f.DB},{randomInt:()=>0});
    assert.equal(result.mercenary.duplicate,true);assert.equal(result.mercenary.totalCopiesAfter,3);assert.equal(result.hBody.quantityAfter,2);
    assert.deepEqual(await f.q("SELECT total_copies,duplicate_count FROM user_mercenary_cards_v1 WHERE mercenary_code='V-001'"),[{total_copies:3,duplicate_count:2}]);
    assert.equal(Number((await f.q('SELECT COUNT(*) count FROM user_equipment_instances WHERE user_id=103'))[0].count),2);
  }finally{await f.pg.close()}
});

test('대상 계정이 중복되면 세 지급과 완료 마커를 모두 남기지 않는다',async()=>{
  const f=await fixture({duplicateTarget:true});
  try{
    await assert.rejects(()=>ensureTargetedRewardGrant20260921V1({DB:f.DB},{randomInt:()=>0}),/정확히 한 개/);
    assert.deepEqual(await f.q('SELECT * FROM user_mercenary_cards_v1'),[]);
    assert.equal((await f.q('SELECT coin FROM users WHERE id=102'))[0].coin,123);
    assert.deepEqual(await f.q('SELECT * FROM user_equipment_instances'),[]);
    assert.deepEqual(await f.q('SELECT * FROM app_meta WHERE key=$1',[TARGETED_REWARD_GRANT_20260921_MARKER_KEY]),[]);
  }finally{await f.pg.close()}
});

test('라이브 health는 지급 결과만 공개하고 계정 식별자를 응답에 넣지 않는다',()=>{
  const api=readFileSync(new URL('../functions/api/[[path]].js',import.meta.url),'utf8');
  assert.match(api,/ensureTargetedRewardGrant20260921V1\(env\)/);
  assert.match(api,/mercenary:multiRewardGrant\.mercenary\|\|null,coin:multiRewardGrant\.coin\|\|null,hBody:multiRewardGrant\.hBody\|\|null/);
  assert.doesNotMatch(api,/targetedRewardGrant20260921V1=multiRewardGrant;/);
});
