import assert from 'node:assert/strict';
import test from 'node:test';
import {PGlite} from '@electric-sql/pglite';
import {OPERATION_KEY,SETTINGS_KEY,TARGET,freezeExistingPools,repairBlackMiracleAndLeggings,verifyBlackMiracleRepair} from '../scripts/ops/black-miracle-manual-pool-20260909.mjs';

const settings=()=>({enabled:true,sources:{PVE:{rate:0.0001}},rewards:{COIN:{rate:35,min:50000000,max:100000000}},powerRewards:{enabled:true,maxTotalRatePercent:5,equipment:{enabled:true,mode:'AUTO',minRatePercent:0.01,maxRatePercent:0.1,overrides:{32:{enabled:true,rate:0.01},44:{enabled:false}}},vehicle:{enabled:true,mode:'AUTO',minRatePercent:0.01,maxRatePercent:0.1,overrides:{}}}});

async function fixture(){
  const pg=new PGlite();
  await pg.exec(`
    CREATE FUNCTION sqlite_now() RETURNS text LANGUAGE SQL STABLE AS $$SELECT to_char(timezone('UTC',CURRENT_TIMESTAMP),'YYYY-MM-DD HH24:MI:SS')$$;
    CREATE TABLE users(id BIGINT PRIMARY KEY,nickname TEXT,status TEXT,role TEXT);
    CREATE TABLE app_meta(key TEXT PRIMARY KEY,value TEXT,updated_at TEXT DEFAULT sqlite_now());
    CREATE TABLE character_equipment_items(id BIGINT PRIMARY KEY,code TEXT UNIQUE,name TEXT,slot TEXT,subtype TEXT,rarity TEXT,is_active INTEGER,is_public INTEGER,total_power BIGINT);
    CREATE TABLE character_garage_items(id BIGINT PRIMARY KEY,code TEXT,rarity TEXT,is_active INTEGER,is_public INTEGER,total_power BIGINT);
    CREATE TABLE user_equipment_instances(id BIGINT PRIMARY KEY,user_id BIGINT,equipment_id BIGINT REFERENCES character_equipment_items(id),source_type TEXT,source_id TEXT,request_id TEXT,acquired_at TEXT);
    CREATE TABLE user_equipment_loadout(user_id BIGINT,slot TEXT,instance_id BIGINT UNIQUE REFERENCES user_equipment_instances(id),updated_at TEXT DEFAULT sqlite_now(),PRIMARY KEY(user_id,slot));
    CREATE TABLE admin_logs(id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,admin_id BIGINT,action_type TEXT,target_type TEXT,target_id TEXT,before_data TEXT,after_data TEXT);
    INSERT INTO users VALUES(1,'운영자','ACTIVE','OWNER'),(359,'갓삼족삼','ACTIVE','USER');
    INSERT INTO character_equipment_items VALUES(32,'EQ_1787156640727','미스틱 레깅스','BOTTOM','BOTTOM','MYTHIC',1,1,50000),(44,'EMPEROR_BOTTOM','엠퍼러 레깅스','BOTTOM','BOTTOM','MYTHIC',1,1,100000);
    INSERT INTO character_garage_items VALUES(1,'CAR_1','MYTHIC',1,1,1000);
    INSERT INTO user_equipment_instances VALUES(78379196,359,44,'BLACK_MIRACLE','d8054bae-c673-4c7f-8ada-3c976ec8873e','d8054bae-c673-4c7f-8ada-3c976ec8873e','2026-09-09 12:10:53'),(3,888,44,'EVENT','unrelated','untouched','2026-01-01');
    INSERT INTO user_equipment_loadout(user_id,slot,instance_id) VALUES(359,'BOTTOM',78379196);
  `);
  await pg.query('INSERT INTO app_meta(key,value) VALUES($1,$2)',[SETTINGS_KEY,JSON.stringify(settings())]);
  return pg;
}

test('operator snapshot freezes the existing approved items and their exact rates',()=>{
  const raw=settings();
  const rows=[{id:31,code:'OLD',total_power:100,rarity:'MYTHIC',is_active:1,is_public:1},{id:32,code:'MYSTIC',total_power:50000,rarity:'MYTHIC',is_active:1,is_public:1},{id:44,code:'EMPEROR_BOTTOM',total_power:100000,rarity:'MYTHIC',is_active:1,is_public:1}];
  const frozen=freezeExistingPools(raw,{equipment:rows,vehicle:[]});
  assert.deepEqual(frozen.snapshot.equipment.map(row=>row.id),['32','31']);
  assert.equal(frozen.settings.powerRewards.equipment.mode,'MANUAL');
  assert.equal(frozen.settings.powerRewards.equipment.overrides[32].rate,0.01);
  assert.equal(frozen.settings.powerRewards.equipment.overrides[31].rate,0.1);
  assert.equal(frozen.settings.powerRewards.equipment.overrides[44].enabled,false);
  assert.deepEqual(frozen.settings.sources,raw.sources);assert.deepEqual(frozen.settings.rewards,raw.rewards);
  assert.equal(raw.powerRewards.equipment.mode,'AUTO');
});

test('PostgreSQL exchanges exactly one leggings instance, preserves loadout and audit, and never repeats',async()=>{
  const pg=await fixture();
  try{
    const unrelated=(await pg.query('SELECT * FROM user_equipment_instances WHERE id=3')).rows;
    const loadout=(await pg.query('SELECT * FROM user_equipment_loadout')).rows;
    const first=await repairBlackMiracleAndLeggings(pg);
    assert.equal(first.replayed,false);assert.equal(first.ownershipVerified,true);assert.equal(first.poolVerified,true);
    assert.equal(first.instance.code,TARGET.toCode);assert.equal(Number(first.instance.id),TARGET.instanceId);
    assert.equal(first.instance.acquired_at,'2026-09-09 12:10:53');
    assert.deepEqual(first.counts.map(row=>[row.code,Number(row.quantity)]),[[TARGET.toCode,1]]);
    assert.deepEqual((await pg.query('SELECT * FROM user_equipment_loadout')).rows,loadout);
    assert.deepEqual((await pg.query('SELECT * FROM user_equipment_instances WHERE id=3')).rows,unrelated);
    assert.equal((await pg.query('SELECT * FROM admin_logs')).rows.length,2);
    assert.equal((await repairBlackMiracleAndLeggings(pg)).replayed,true);
    assert.equal((await pg.query('SELECT * FROM admin_logs')).rows.length,2);
    assert.equal((await verifyBlackMiracleRepair(pg)).ownershipVerified,true);
  }finally{await pg.close()}
});

test('zero-row equipment update rolls back the settings, equipment and receipt together',async()=>{
  const pg=await fixture();
  try{
    await pg.exec('CREATE FUNCTION suppress_exchange() RETURNS trigger LANGUAGE plpgsql AS $$BEGIN RETURN NULL; END;$$; CREATE TRIGGER suppress_exchange BEFORE UPDATE ON user_equipment_instances FOR EACH ROW EXECUTE FUNCTION suppress_exchange();');
    await assert.rejects(()=>repairBlackMiracleAndLeggings(pg),/exactly one/);
    assert.equal(Number((await pg.query('SELECT equipment_id FROM user_equipment_instances WHERE id=$1',[TARGET.instanceId])).rows[0].equipment_id),44);
    assert.deepEqual(JSON.parse((await pg.query('SELECT value FROM app_meta WHERE key=$1',[SETTINGS_KEY])).rows[0].value),settings());
    assert.equal((await pg.query('SELECT * FROM app_meta WHERE key=$1',[OPERATION_KEY])).rows.length,0);
    assert.equal((await pg.query('SELECT * FROM admin_logs')).rows.length,0);
  }finally{await pg.close()}
});

test('changed target identity blocks the entire operation',async()=>{
  const pg=await fixture();
  try{
    await pg.query('UPDATE users SET nickname=$1 WHERE id=$2',['다른계정',TARGET.userId]);
    await assert.rejects(()=>repairBlackMiracleAndLeggings(pg),/Exact active target/);
    assert.equal((await pg.query('SELECT * FROM admin_logs')).rows.length,0);
    assert.equal(Number((await pg.query('SELECT equipment_id FROM user_equipment_instances WHERE id=$1',[TARGET.instanceId])).rows[0].equipment_id),44);
  }finally{await pg.close()}
});
