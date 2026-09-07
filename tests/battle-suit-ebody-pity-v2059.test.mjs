import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import test from 'node:test';
import {PGlite} from '@electric-sql/pglite';

import {__postgresCompatTest} from '../functions/_postgres_d1_compat.js';
import {
  BATTLE_SUIT_EBODY_PITY_V2059_FAILURE_THRESHOLD,BATTLE_SUIT_EBODY_PITY_V2059_MARKER_KEY,
  __battleSuitEbodyPityV2059Test,ensureBattleSuitEbodyPityV2059
} from '../functions/_battle_suit_ebody_pity_v2059.js';

async function fixture({ambiguous=false,missing=false}={}){
  const pg=new PGlite();
  await pg.exec(`
    CREATE TABLE app_meta(key text PRIMARY KEY,value text NOT NULL,updated_at timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP);
    CREATE TABLE users(id bigint PRIMARY KEY,nickname text NOT NULL,role text NOT NULL DEFAULT 'USER',status text NOT NULL DEFAULT 'ACTIVE');
    CREATE TABLE character_equipment_items(id bigserial PRIMARY KEY,code text NOT NULL UNIQUE,name text NOT NULL,slot text NOT NULL,subtype text NOT NULL DEFAULT '',
      description text NOT NULL DEFAULT '',is_active integer NOT NULL DEFAULT 1,is_public integer NOT NULL DEFAULT 1);
    CREATE TABLE user_equipment_instances(id bigserial PRIMARY KEY,user_id bigint NOT NULL,equipment_id bigint NOT NULL,source_type text NOT NULL DEFAULT 'ADMIN',
      source_id text NOT NULL DEFAULT '',request_id text,acquired_at timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP);
    CREATE TABLE workshop_recipes_v1668(id bigserial PRIMARY KEY,code text NOT NULL UNIQUE,category text NOT NULL,name text NOT NULL,description text NOT NULL DEFAULT '',
      output_type text NOT NULL,output_ref text NOT NULL,is_active integer NOT NULL DEFAULT 1,is_public integer NOT NULL DEFAULT 1);
    CREATE TABLE workshop_craft_logs_v1668(id bigserial PRIMARY KEY,request_id text NOT NULL,user_id bigint NOT NULL,recipe_id bigint NOT NULL,recipe_name text NOT NULL,
      category text NOT NULL,output_type text NOT NULL,output_ref text NOT NULL,success integer NOT NULL,created_at timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,
      UNIQUE(request_id,user_id));
    CREATE TABLE admin_logs(id bigserial PRIMARY KEY,admin_id bigint NOT NULL,action_type text NOT NULL,target_type text NOT NULL,target_id text,before_data text,after_data text,
      created_at timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP);
    INSERT INTO users(id,nickname,role,status) VALUES(1,'운영자','OWNER','ACTIVE'),(2,'실패11','USER','ACTIVE'),(3,'실패10','USER','ACTIVE'),(4,'실패15보유','USER','BANNED'),(5,'다른슈트20','USER','ACTIVE');
  `);
  if(!missing){
    await pg.query("INSERT INTO character_equipment_items(id,code,name,slot,subtype,description) VALUES(501,'BATTLE_SUIT_E_BODY','E 바디','BATTLE_SUIT','E-BODY','배틀슈트 E바디')");
    await pg.query("INSERT INTO workshop_recipes_v1668(id,code,category,name,description,output_type,output_ref) VALUES(601,'WORKSHOP_E_BODY','BATTLE_SUIT_CRAFT','E바디 제작','E-body 제작','EQUIPMENT','501')");
  }
  await pg.query("INSERT INTO character_equipment_items(id,code,name,slot) VALUES(502,'BATTLE_SUIT_01','배틀슈트 01','BATTLE_SUIT')");
  await pg.query("INSERT INTO workshop_recipes_v1668(id,code,category,name,output_type,output_ref) VALUES(602,'WORKSHOP_BATTLE_SUIT_01','BATTLE_SUIT_CRAFT','배틀슈트 01 제작','EQUIPMENT','502')");
  if(ambiguous){
    await pg.query("INSERT INTO character_equipment_items(id,code,name,slot) VALUES(503,'EBODY_ALT','E바디 대체품','BATTLE_SUIT')");
    await pg.query("INSERT INTO workshop_recipes_v1668(id,code,category,name,output_type,output_ref) VALUES(603,'WORKSHOP_EBODY_ALT','BATTLE_SUIT_CRAFT','E바디 대체 제작','EQUIPMENT','503')");
  }
  const addFailures=async(userId,recipeId,outputRef,count,{success=0,prefix='f'}={})=>{
    for(let index=1;index<=count;index++)await pg.query(`INSERT INTO workshop_craft_logs_v1668(request_id,user_id,recipe_id,recipe_name,category,output_type,output_ref,success)
      VALUES($1,$2,$3,'제작','BATTLE_SUIT_CRAFT','EQUIPMENT',$4,$5)`,[`${prefix}-${userId}-${index}`,userId,recipeId,String(outputRef),success]);
  };
  if(!missing){await addFailures(2,601,501,11);await addFailures(3,601,501,10);await addFailures(4,601,501,15);await addFailures(2,601,501,3,{success:1,prefix:'s'});}
  await addFailures(5,602,502,20,{prefix:'other'});
  if(!missing)await pg.query("INSERT INTO user_equipment_instances(user_id,equipment_id,source_type,source_id,request_id) VALUES(4,501,'WORKSHOP','old','old-owned')");
  const client={async query(input){const text=typeof input==='string'?input:input.text,values=typeof input==='string'?[]:input.values||[];const result=await pg.query(text,values);return{...result,rowCount:result.affectedRows??result.rows.length}}};
  return{pg,env:{DB:new __postgresCompatTest.PostgresD1Database(client)},close:()=>pg.close()};
}

test('E바디 실패가 10회를 넘은 모든 계정에 보유 여부와 무관하게 정확히 1개를 지급한다',async()=>{
  const f=await fixture();
  try{
    const result=await ensureBattleSuitEbodyPityV2059(f.env);
    assert.equal(result.status,'COMPLETED');assert.equal(result.replayed,false);assert.equal(result.oneTime,true);
    assert.equal(result.failureThresholdExclusive,10);assert.equal(result.minimumFailures,11);
    assert.deepEqual(result.equipment,{id:501,code:'BATTLE_SUIT_E_BODY',name:'E 바디'});
    assert.equal(result.eligibleAccounts,2);assert.equal(result.grantedQuantity,2);assert.equal(result.alreadyOwnedAccounts,1);assert.equal(result.failureCountTotal,26);
    const grants=(await f.pg.query("SELECT user_id,equipment_id,source_type,source_id,request_id FROM user_equipment_instances WHERE source_type='BATTLE_SUIT_PITY' ORDER BY user_id")).rows;
    assert.deepEqual(grants.map(row=>Number(row.user_id)),[2,4]);
    assert(grants.every(row=>Number(row.equipment_id)===501&&row.source_id===BATTLE_SUIT_EBODY_PITY_V2059_MARKER_KEY));
    assert.equal(Number((await f.pg.query('SELECT COUNT(*) n FROM user_equipment_instances WHERE user_id=4 AND equipment_id=501')).rows[0].n),2);
    assert.equal(Number((await f.pg.query(`SELECT COUNT(*) n FROM ${__battleSuitEbodyPityV2059Test.SNAPSHOT_TABLE}`)).rows[0].n),2);
    assert.equal(Number((await f.pg.query("SELECT COUNT(*) n FROM admin_logs WHERE action_type='BATTLE_SUIT_EBODY_PITY_V2059'")).rows[0].n),1);
    assert.doesNotMatch(JSON.stringify(result),/실패11|실패15보유|userId|nickname/);

    const replay=await ensureBattleSuitEbodyPityV2059(f.env);
    assert.equal(replay.replayed,true);assert.equal(replay.grantedQuantity,2);
    assert.equal(Number((await f.pg.query("SELECT COUNT(*) n FROM user_equipment_instances WHERE source_type='BATTLE_SUIT_PITY'")).rows[0].n),2);
    assert.equal(Number((await f.pg.query("SELECT COUNT(*) n FROM admin_logs WHERE action_type='BATTLE_SUIT_EBODY_PITY_V2059'")).rows[0].n),1);
  }finally{await f.close()}
});

test('E바디 후보가 없거나 둘 이상이면 지급·스냅샷·완료 마커를 모두 남기지 않는다',async()=>{
  for(const options of [{missing:true},{ambiguous:true}]){
    const f=await fixture(options);
    try{
      await assert.rejects(()=>ensureBattleSuitEbodyPityV2059(f.env),/정확히 한 개/);
      assert.equal(Number((await f.pg.query("SELECT COUNT(*) n FROM user_equipment_instances WHERE source_type='BATTLE_SUIT_PITY'")).rows[0].n),0);
      assert.equal(Number((await f.pg.query(`SELECT COUNT(*) n FROM ${__battleSuitEbodyPityV2059Test.SNAPSHOT_TABLE}`)).rows[0].n),0);
      assert.equal((await f.pg.query('SELECT value FROM app_meta WHERE key=$1',[BATTLE_SUIT_EBODY_PITY_V2059_MARKER_KEY])).rows.length,0);
    }finally{await f.close()}
  }
});

test('감사 로그 기록이 실패하면 대상 스냅샷과 장비 지급도 함께 롤백한다',async()=>{
  const f=await fixture();
  try{
    await f.pg.exec("ALTER TABLE admin_logs ADD CONSTRAINT reject_ebody_pity CHECK(action_type<>'BATTLE_SUIT_EBODY_PITY_V2059')");
    await assert.rejects(()=>ensureBattleSuitEbodyPityV2059(f.env));
    assert.equal(Number((await f.pg.query("SELECT COUNT(*) n FROM user_equipment_instances WHERE source_type='BATTLE_SUIT_PITY'")).rows[0].n),0);
    assert.equal(Number((await f.pg.query(`SELECT COUNT(*) n FROM ${__battleSuitEbodyPityV2059Test.SNAPSHOT_TABLE}`)).rows[0].n),0);
    assert.equal((await f.pg.query('SELECT value FROM app_meta WHERE key=$1',[BATTLE_SUIT_EBODY_PITY_V2059_MARKER_KEY])).rows.length,0);
  }finally{await f.close()}
});

test('라이브 health는 제작소 기반을 먼저 보장하고 식별자 없는 천장 결과만 반환한다',()=>{
  assert.equal(BATTLE_SUIT_EBODY_PITY_V2059_FAILURE_THRESHOLD,10);
  const api=readFileSync(new URL('../functions/api/[[path]].js',import.meta.url),'utf8');
  assert.match(api,/await ensureWorkshopFoundation\(env\);\s*const ebodyPity=await ensureBattleSuitEbodyPityV2059\(env\)/);
  assert.match(api,/battleSuitEbodyPityV2059=ebodyPity\?\{/);
  assert.match(api,/eligibleAccounts:Number\(ebodyPity\.eligibleAccounts\|\|0\)/);
  assert.match(api,/targetedSkillChipGrantV2055,battleSuitEbodyPityV2059,iyejunFurRerollRecovery/);
  assert.doesNotMatch(api,/battleSuitEbodyPityV2059=ebodyPity;/);
});
